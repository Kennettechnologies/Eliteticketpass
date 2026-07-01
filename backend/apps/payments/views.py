from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
import json
import logging


# @api_view(["POST"])
# @permission_classes([AllowAny])
# def mpesa_callback(request):
#     """Daraja STK Push callback. Respond immediately, process async."""
#     from .tasks import process_mpesa_callback
#     try:
#         process_mpesa_callback.delay(request.data)
#     except Exception:
#         pass
#     return Response({"ResultCode": 0, "ResultDesc": "Accepted"})


# @api_view(["POST"])
# @permission_classes([AllowAny])
# def mpesa_b2c_result(request):
#     """B2C payout result callback."""
#     from .tasks import process_b2c_callback
#     try:
#         process_b2c_callback.delay(request.data)
#     except Exception:
#         pass
#     return Response({"ResultCode": 0, "ResultDesc": "Accepted"})


# @api_view(["POST"])
# @permission_classes([AllowAny])
# def mpesa_b2c_timeout(request):
#     """B2C timeout — mark payout as ON_HOLD for manual reconciliation."""
#     from apps.payouts.models import Payout
#     try:
#         conversation_id = request.data.get("Result", {}).get("ConversationID")
#         if conversation_id:
#             Payout.objects.filter(
#                 gateway_response__conversation_id=conversation_id
#             ).update(status="ON_HOLD")
#     except Exception:
#         pass
#     return Response({"ResultCode": 0, "ResultDesc": "Accepted"})


# @api_view(["POST"])
# @permission_classes([AllowAny])
# def stripe_webhook(request):
#     """Stripe webhook endpoint."""
#     from .tasks import process_stripe_webhook
#     payload = request.body.decode("utf-8")
#     sig_header = request.META.get("HTTP_STRIPE_SIGNATURE", "")
#     try:
#         process_stripe_webhook.delay(payload, sig_header)
#     except Exception:
#         pass
#     return Response({"received": True})

import json
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.http import JsonResponse, HttpResponse
from django.db import transaction as db_transaction
from django.utils import timezone
from .security import require_paystack_signature, get_client_ip
from .idempotency import is_already_processed
from .models import TicketTransaction, WebhookLog, OrganizerPayout, OrganizerPayoutProfile, PlatformRevenue
from .split_service import confirm_and_split
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from .serializers import OrganizerPayoutProfileSerializer

logger = logging.getLogger(__name__)

@csrf_exempt
@require_POST
@require_paystack_signature
def paystack_webhook(request):
    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError:
        return HttpResponse(status=400)

    event = payload.get('event', '')

    if is_already_processed(f"paystack_{payload.get('data', {}).get('id', '')}"):
        return HttpResponse(status=200)

    WebhookLog.objects.create(
        source='paystack', event_type=event,
        raw_payload=payload, headers=dict(request.headers),
        signature_valid=True, ip_address=get_client_ip(request),
    )

    try:
        if event == 'charge.success':
            _handle_paystack_charge_success(payload['data'])
        elif event == 'transfer.success':
            _handle_paystack_transfer_success(payload['data'])
        elif event == 'transfer.failed':
            _handle_paystack_transfer_failed(payload['data'])
        elif event == 'transfer.reversed':
            _handle_paystack_transfer_reversed(payload['data'])
    except Exception as e:
        logger.exception(f"Error processing Paystack webhook {event}: {e}")

    return HttpResponse(status=200)

def _handle_paystack_charge_success(data):
    reference = data.get('reference', '')
    if reference.startswith("resale_"):
        _handle_paystack_resale_success(data, reference)
        return

    with db_transaction.atomic():
        from apps.payments.models import Payment, TicketTransaction
        from apps.tickets.tasks import issue_tickets_for_order
        from .paystack_service import paystack_client
        
        try:
            payment = Payment.objects.select_for_update().get(
                paystack_reference=reference,
                status__in=["PENDING", "PROCESSING"]
            )
        except Payment.DoesNotExist:
            logger.error(f"No pending Payment for Paystack reference: {reference}")
            return

        verified = paystack_client.verify_transaction(reference)

        if verified.get("status") == "success":
            payment.status = "COMPLETED"
            payment.processed_at = timezone.now()
            payment.gateway_response = verified
            payment.save(update_fields=["status", "processed_at", "gateway_response"])
            
            # Issue tickets
            issue_tickets_for_order.delay(str(payment.order_id))
            
            # Create TicketTransaction for split/payout
            txn = TicketTransaction.objects.create(
                order=payment.order,
                gateway='paystack',
                gross_amount=payment.amount,
                platform_fee_rate=0, # will be set in confirm_and_split
                platform_fee_amount=0,
                organizer_amount=0,
                paystack_reference=reference,
                paystack_transaction_id=str(verified.get('id', ''))
            )
            confirm_and_split(txn, verified)
        else:
            payment.status = "FAILED"
            payment.failure_reason = "Paystack verification failed or status not success."
            payment.save(update_fields=["status", "failure_reason"])

def _handle_paystack_resale_success(data, reference):
    from apps.payments.models import ResaleTransaction
    from apps.tickets.models import Ticket
    import uuid
    from .paystack_service import paystack_client
    
    with db_transaction.atomic():
        try:
            rt = ResaleTransaction.objects.select_for_update().get(
                payment_reference=reference,
                status=ResaleTransaction.Status.PENDING
            )
        except ResaleTransaction.DoesNotExist:
            logger.error(f"No pending ResaleTransaction for Paystack reference: {reference}")
            return
            
        verified = paystack_client.verify_transaction(reference)
        if verified.get("status") == "success":
            rt.status = ResaleTransaction.Status.COMPLETED
            rt.save(update_fields=["status"])
            
            # Transfer ownership
            ticket = rt.ticket
            ticket.status = Ticket.Status.ACTIVE
            ticket.resale_price = None
            ticket.user = rt.buyer
            ticket.qr_token = uuid.uuid4()
            ticket.save()
        else:
            rt.status = ResaleTransaction.Status.FAILED
            rt.save(update_fields=["status"])

def _handle_paystack_transfer_success(data):
    transfer_code = data.get('transfer_code', '')
    OrganizerPayout.objects.filter(external_ref=transfer_code).update(
        status='completed',
        disbursed_at=timezone.now(),
        raw_disbursement_response=data,
    )

def _handle_paystack_transfer_failed(data):
    transfer_code = data.get('transfer_code', '')
    try:
        payout = OrganizerPayout.objects.get(external_ref=transfer_code)
        payout.status = 'failed'
        payout.failure_reason = data.get('reason', 'Paystack transfer failed')
        payout.save()
    except OrganizerPayout.DoesNotExist:
        pass

def _handle_paystack_transfer_reversed(data):
    transfer_code = data.get('transfer_code', '')
    OrganizerPayout.objects.filter(external_ref=transfer_code).update(
        status='failed',
        failure_reason='Transfer reversed by Paystack',
    )


class OrganizerPayoutProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not hasattr(request.user, 'organizer'):
            return Response({"error": "Not an organizer"}, status=403)
        profile, _ = OrganizerPayoutProfile.objects.get_or_create(organizer=request.user.organizer)
        serializer = OrganizerPayoutProfileSerializer(profile)
        return Response(serializer.data)

    def put(self, request):
        if not hasattr(request.user, 'organizer'):
            return Response({"error": "Not an organizer"}, status=403)
        profile, _ = OrganizerPayoutProfile.objects.get_or_create(organizer=request.user.organizer)
        serializer = OrganizerPayoutProfileSerializer(profile, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

class BankListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .paystack_service import paystack_client
        try:
            banks = paystack_client.get_banks()
            return Response(banks)
        except Exception as e:
            return Response({"error": str(e)}, status=400)

class OrganizerPayoutListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not hasattr(request.user, 'organizer'):
            return Response({"error": "Not an organizer"}, status=403)
        payouts = OrganizerPayout.objects.filter(organizer=request.user.organizer).order_by('-id')
        data = [{
            "id": p.id,
            "amount": p.amount,
            "method": p.method,
            "status": p.status,
            "disbursed_at": p.disbursed_at,
            "failure_reason": p.failure_reason,
            "event_name": p.transaction.order.event.name if p.transaction else None,
        } for p in payouts]
        return Response(data)

class AdminPayoutListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        payouts = OrganizerPayout.objects.all().order_by('-id')
        data = [{
            "id": p.id,
            "organizer": p.organizer.name,
            "amount": p.amount,
            "method": p.method,
            "status": p.status,
            "retries": p.retry_count,
            "disbursed_at": p.disbursed_at,
            "external_ref": p.external_ref,
        } for p in payouts]
        return Response(data)

class AdminRetryPayoutView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            payout = OrganizerPayout.objects.get(id=pk, status='permanently_failed')
            payout.status = 'queued'
            payout.retry_count = 0
            payout.save()
            from .tasks import disburse_organizer_payout
            disburse_organizer_payout.delay(str(payout.transaction_id))
            return Response({"message": "Retry queued"})
        except OrganizerPayout.DoesNotExist:
            return Response({"error": "Payout not found or not permanently failed"}, status=404)

class PlatformRevenueView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        from django.db.models import Sum
        revenues = PlatformRevenue.objects.aggregate(total=Sum('amount'))
        return Response({"total_revenue": revenues['total'] or 0})
