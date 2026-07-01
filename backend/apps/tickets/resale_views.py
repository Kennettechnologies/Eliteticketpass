from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.db import transaction
import uuid

from core.exceptions import api_response
from apps.tickets.models import Ticket
from apps.payments.models import ResaleTransaction
from apps.payments.split_service import get_platform_fees
from core.mpesa import daraja

@api_view(["GET"])
@permission_classes([AllowAny])
def marketplace_list(request):
    qs = Ticket.objects.filter(status=Ticket.Status.FOR_RESALE).select_related("order__event", "tier").order_by("-updated_at")
    
    event_id = request.query_params.get("event_id")
    if event_id:
        qs = qs.filter(order__event_id=event_id)
        
    data = []
    for t in qs:
        event = t.order.event
        data.append({
            "id": str(t.id),
            "event_title": event.title,
            "event_starts_at": event.starts_at.isoformat(),
            "event_venue": event.venue_name,
            "event_city": event.venue_city,
            "tier_name": t.tier.name if t.tier else "General",
            "resale_price": str(t.resale_price),
            "ticket_number": t.ticket_number
        })
        
    return Response(api_response(data=data).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def marketplace_checkout(request):
    ticket_id = request.data.get("ticket_id")
    phone = request.data.get("phone")
    
    if not ticket_id or not phone:
        return Response({"success": False, "error": "Ticket ID and phone required."}, status=400)
        
    try:
        ticket = Ticket.objects.get(id=ticket_id, status=Ticket.Status.FOR_RESALE)
    except Ticket.DoesNotExist:
        return Response({"success": False, "error": "Ticket not available for resale."}, status=404)
        
    # Calculate fee
    rate, flat = get_platform_fees()
    amount = ticket.resale_price
    platform_fee = (amount * rate + flat)
    if platform_fee > amount:
        platform_fee = amount
    seller_payout = amount - platform_fee
    
    # Create transaction
    with transaction.atomic():
        rt = ResaleTransaction.objects.create(
            ticket=ticket,
            buyer=request.user,
            seller=ticket.user,
            amount=amount,
            platform_fee=platform_fee,
            seller_payout=seller_payout,
            status=ResaleTransaction.Status.PENDING
        )
        
    # Initiate Paystack Transaction
    from apps.payments.paystack_service import paystack_client
    
    reference = f"resale_{rt.id}_{uuid.uuid4().hex[:8]}"
    amount_kobo = int(amount * 100)
    
    try:
        res = paystack_client.initialize_transaction(
            email=request.user.email,
            amount_kobo=amount_kobo,
            reference=reference,
            metadata={"resale_transaction_id": str(rt.id)}
        )
        rt.payment_reference = reference
        rt.save(update_fields=["payment_reference"])
        
        return Response(api_response(data={
            "transaction_id": str(rt.id),
            "authorization_url": res["authorization_url"],
            "reference": reference
        }).data)
    except Exception as e:
        rt.status = ResaleTransaction.Status.FAILED
        rt.save(update_fields=["status"])
        return Response({"success": False, "error": str(e)}, status=400)


@api_view(["POST"])
@permission_classes([AllowAny])
def marketplace_confirm(request):
    stk_callback = request.data.get("Body", {}).get("stkCallback", {})
    checkout_request_id = stk_callback.get("CheckoutRequestID")
    result_code = stk_callback.get("ResultCode")
    
    if not checkout_request_id:
        return Response("Missing CheckoutRequestID")
        
    try:
        rt = ResaleTransaction.objects.select_for_update().get(payment_reference=checkout_request_id)
    except ResaleTransaction.DoesNotExist:
        return Response("Not found")
        
    if rt.status != ResaleTransaction.Status.PENDING:
        return Response("Already processed")
        
    if result_code == 0:
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
        
    return Response({"ResultCode": 0, "ResultDesc": "Accepted"})
