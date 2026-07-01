import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name="payouts.process_payout", queue="payments")
def process_payout(payout_id: str):
    from .models import Payout
    from core.mpesa import daraja, DarajaError

    try:
        payout = Payout.objects.select_related("organizer").get(id=payout_id)
        if payout.method == "MPESA":
            result = daraja.initiate_b2c(
                phone=payout.mpesa_phone or payout.organizer.mpesa_phone,
                amount=int(payout.net_amount),
                remarks=f"Payout {str(payout.id)[:8]}",
            )
            payout.gateway_response = result
            payout.status = "PROCESSING"
            payout.save(update_fields=["gateway_response", "status"])
        elif payout.method == "BANK_TRANSFER":
            payout.status = "PROCESSING"
            payout.notes = "Bank transfer initiated — manual processing required."
            payout.save(update_fields=["status", "notes"])
    except DarajaError as e:
        logger.error(f"B2C initiation failed for payout {payout_id}: {e}")
        payout = Payout.objects.get(id=payout_id)
        payout.status = "FAILED"
        payout.failure_reason = str(e)
        payout.save(update_fields=["status", "failure_reason"])
    except Exception:
        logger.exception(f"process_payout failed for {payout_id}")


@shared_task(name="payouts.process_refund", queue="payments")
def process_refund(refund_id: str):
    from apps.refunds.models import Refund
    from apps.payments.models import Payment
    from core.mpesa import daraja, DarajaError

    try:
        refund = Refund.objects.select_related("order").get(id=refund_id, status="APPROVED")
        order = refund.order

        payment = order.payments.filter(status="COMPLETED").first()
        if not payment:
            refund.status = "FAILED"
            refund.failure_reason = "No completed payment found."
            refund.save()
            return

        if payment.method == "MPESA_STK":
            result = daraja.initiate_b2c(
                phone=order.buyer_phone,
                amount=int(refund.amount),
                remarks=f"Refund {order.order_number}",
            )
            refund.gateway_refund_id = result.get("conversation_id", "")
            refund.gateway_response = result

        elif payment.method == "CARD_STRIPE":
            import stripe
            from django.conf import settings
            stripe.api_key = settings.STRIPE_SECRET_KEY
            stripe_refund = stripe.Refund.create(
                payment_intent=payment.stripe_payment_intent_id,
                amount=int(refund.amount * 100),
            )
            refund.gateway_refund_id = stripe_refund["id"]
            refund.gateway_response = {"stripe_refund_id": stripe_refund["id"]}

        refund.status = "PROCESSED"
        refund.processed_at = timezone.now()
        refund.save()

    except Exception as e:
        logger.exception(f"process_refund failed for {refund_id}")
        try:
            refund = Refund.objects.get(id=refund_id)
            refund.status = "FAILED"
            refund.failure_reason = str(e)
            refund.save(update_fields=["status", "failure_reason"])
        except Exception:
            pass
