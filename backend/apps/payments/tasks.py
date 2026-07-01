import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


# @shared_task(name="payments.initiate_mpesa_stk", bind=True, max_retries=2, queue="payments")
# def initiate_mpesa_stk(self, payment_id: str, phone: str, amount: float, order_number: str):
    from .models import Payment
    from core.mpesa import daraja, DarajaError

    try:
        payment = Payment.objects.get(id=payment_id)
        result = daraja.initiate_stk_push(phone, int(amount), order_number, order_number[:13])
        payment.mpesa_checkout_request_id = result["checkout_request_id"]
        payment.mpesa_merchant_request_id = result["merchant_request_id"]
        payment.save(update_fields=["mpesa_checkout_request_id", "mpesa_merchant_request_id"])
        logger.info(f"STK Push initiated for order {order_number}: {result['checkout_request_id']}")
    except DarajaError as e:
        logger.error(f"Daraja error for payment {payment_id}: {e}")
        try:
            payment = Payment.objects.get(id=payment_id)
            payment.status = "FAILED"
            payment.failure_reason = str(e)
            payment.save(update_fields=["status", "failure_reason"])
        except Exception:
            pass
    except Exception as exc:
        logger.exception(f"STK task failed for payment {payment_id}")
        raise self.retry(exc=exc, countdown=10)


# @shared_task(name="payments.process_mpesa_callback", queue="payments")
# def process_mpesa_callback(body_dict: dict):
    """
    Process STK Push callback from Daraja.
    Must handle idempotently — may be called multiple times for same checkout.
    """
    from .models import Payment
    from apps.tickets.tasks import issue_tickets_for_order
    from core.utils import parse_daraja_date

    try:
        stk_callback = body_dict.get("Body", {}).get("stkCallback", {})
        checkout_request_id = stk_callback.get("CheckoutRequestID")
        result_code = stk_callback.get("ResultCode")

        if not checkout_request_id:
            logger.error("M-Pesa callback missing CheckoutRequestID")
            return

        try:
            payment = Payment.objects.select_for_update().get(
                mpesa_checkout_request_id=checkout_request_id
            )
        except Payment.DoesNotExist:
            logger.warning(f"Payment not found for CheckoutRequestID: {checkout_request_id}")
            return

        # Idempotency — skip if already processed
        if payment.status in ("COMPLETED", "FAILED", "CANCELLED"):
            logger.info(f"Payment {payment.id} already processed ({payment.status}), skipping.")
            return

        if result_code == 0:
            # Extract metadata
            metadata_items = (
                stk_callback.get("CallbackMetadata", {}).get("Item", [])
            )
            meta = {item["Name"]: item.get("Value") for item in metadata_items}
            receipt = meta.get("MpesaReceiptNumber", "")
            raw_date = meta.get("TransactionDate")
            utc_date = parse_daraja_date(str(raw_date)) if raw_date else timezone.now()

            payment.status = "COMPLETED"
            payment.mpesa_receipt_number = receipt
            payment.mpesa_transaction_date = utc_date
            payment.gateway_response = stk_callback
            payment.processed_at = timezone.now()
            payment.save()

            issue_tickets_for_order.delay(str(payment.order_id))
            logger.info(f"M-Pesa payment {payment.id} COMPLETED — receipt {receipt}")
        else:
            payment.status = "FAILED"
            payment.failure_reason = stk_callback.get("ResultDesc", f"ResultCode {result_code}")
            payment.gateway_response = stk_callback
            payment.save()
            logger.warning(f"M-Pesa payment {payment.id} FAILED: {payment.failure_reason}")

    except Exception:
        logger.exception("Error processing M-Pesa callback")


# @shared_task(name="payments.process_stripe_webhook", queue="payments")
# def process_stripe_webhook(payload: str, sig_header: str):
    import stripe
    from django.conf import settings
    from .models import Payment
    from apps.tickets.tasks import issue_tickets_for_order

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.error.SignatureVerificationError) as e:
        logger.error(f"Stripe webhook signature error: {e}")
        return

    intent = event.get("data", {}).get("object", {})
    intent_id = intent.get("id")

    if event["type"] == "payment_intent.succeeded":
        try:
            payment = Payment.objects.get(stripe_payment_intent_id=intent_id)
            if payment.status == "COMPLETED":
                return
            payment.status = "COMPLETED"
            payment.stripe_charge_id = intent.get("latest_charge", "")
            payment.processed_at = timezone.now()
            payment.gateway_response = {"event_type": event["type"]}
            payment.save()
            issue_tickets_for_order.delay(str(payment.order_id))
            logger.info(f"Stripe payment {payment.id} succeeded.")
        except Payment.DoesNotExist:
            logger.warning(f"Payment not found for Stripe intent {intent_id}")

    elif event["type"] == "payment_intent.payment_failed":
        try:
            payment = Payment.objects.get(stripe_payment_intent_id=intent_id)
            payment.status = "FAILED"
            payment.failure_reason = intent.get("last_payment_error", {}).get("message", "")
            payment.save()
        except Payment.DoesNotExist:
            pass


# @shared_task(name="payments.process_b2c_callback", queue="payments")
# def process_b2c_callback(result_dict: dict):
#     """Handle B2C payout result callback."""
    from apps.payouts.models import Payout

    result = result_dict.get("Result", {})
    result_code = result.get("ResultCode")
    result_params = {item["Key"]: item.get("Value") for item in result.get("ResultParameters", {}).get("ResultParameter", [])}
    conversation_id = result.get("ConversationID")

    try:
        payout = Payout.objects.filter(
            gateway_response__conversation_id=conversation_id
        ).first()
        if not payout:
            logger.warning(f"Payout not found for ConversationID: {conversation_id}")
            return

        if result_code == 0:
            receipt = result_params.get("TransactionReceipt", "")
            payout.status = "COMPLETED"
            payout.mpesa_receipt = receipt
            payout.processed_at = timezone.now()
            payout.save()
        else:
            payout.status = "FAILED"
            payout.failure_reason = result.get("ResultDesc", f"Code {result_code}")
            payout.save()
    except Exception:
        logger.exception("Error processing B2C callback")


RETRY_DELAYS = [60, 300, 900]

@shared_task(bind=True, max_retries=3)
def disburse_organizer_payout(self, transaction_id: str):
    from .models import OrganizerPayout, TicketTransaction
    from core.mpesa import daraja
    from .paystack_service import paystack_client

    try:
        payout = OrganizerPayout.objects.select_for_update().get(
            transaction_id=transaction_id,
            status__in=['queued', 'failed'],
        )
    except OrganizerPayout.DoesNotExist:
        logger.info(f"Payout for transaction {transaction_id} already completed or not found.")
        return

    payout.status = 'processing'
    payout.save()

    profile = payout.organizer.payout_profile
    amount_kes = int(payout.amount)
    remarks = f"Ticket sales payout - {payout.transaction.order.event.name}"[:100]

    try:
        if payout.method == 'mpesa':
            # result = daraja.initiate_b2c(
            #     phone=profile.mpesa_phone,
            #     amount=amount_kes,
            #     remarks=remarks,
            #     occasion=str(payout.id),
            # )
            # payout.external_ref = result.get('conversation_id', '')
            # payout.raw_disbursement_response = result
            # payout.status = 'processing'
            pass

        elif payout.method == 'bank':
            if not profile.paystack_recipient_code:
                raise ValueError("Paystack recipient code not set. Cannot disburse.")
            result = paystack_client.initiate_transfer(
                recipient_code=profile.paystack_recipient_code,
                amount_kobo=amount_kes * 100,
                reason=remarks,
                reference=f"payout_{payout.id}",
            )
            payout.external_ref = result.get('transfer_code', '')
            payout.raw_disbursement_response = result
            payout.status = 'processing'

        payout.save()

    except Exception as exc:
        retry_num = self.request.retries
        payout.retry_count += 1
        payout.failure_reason = str(exc)

        if retry_num < self.max_retries:
            delay = RETRY_DELAYS[min(retry_num, len(RETRY_DELAYS) - 1)]
            payout.status = 'failed'
            payout.next_retry_at = timezone.now() + timezone.timedelta(seconds=delay)
            payout.save()
            logger.warning(f"Payout {payout.id} failed (attempt {retry_num+1}). Retrying in {delay}s. Error: {exc}")
            raise self.retry(exc=exc, countdown=delay)
        else:
            payout.status = 'permanently_failed'
            payout.save()
            notify_admin_payout_failure.delay(str(payout.id))
            logger.error(f"Payout {payout.id} permanently failed after {retry_num+1} attempts.")

@shared_task
def notify_admin_payout_failure(payout_id: str):
    from .models import OrganizerPayout
    from django.core.mail import send_mail
    from django.conf import settings

    try:
        payout = OrganizerPayout.objects.get(id=payout_id)
        send_mail(
            subject=f"[URGENT] Payout permanently failed — {payout.organizer}",
            message=(
                f"Payout ID: {payout.id}\n"
                f"Organizer: {payout.organizer}\n"
                f"Amount: KES {payout.amount}\n"
                f"Method: {payout.method}\n"
                f"Failure: {payout.failure_reason}\n"
                f"Retries: {payout.retry_count}\n\n"
                f"Manual action required in admin dashboard."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[getattr(settings, "ADMIN_ALERT_EMAIL", settings.DEFAULT_FROM_EMAIL)],
            fail_silently=True,
        )
    except Exception:
        pass

@shared_task
def notify_organizer_incomplete_profile(organizer_id: int):
    pass

@shared_task
def retry_queued_payouts():
    from .models import OrganizerPayout
    from django.db import models
    now = timezone.now()
    due_payouts = OrganizerPayout.objects.filter(
        status='failed',
        next_retry_at__lte=now,
        retry_count__lt=models.F('max_retries'),
    )
    for payout in due_payouts:
        disburse_organizer_payout.delay(str(payout.transaction_id))
