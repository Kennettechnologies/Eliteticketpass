from decimal import Decimal, ROUND_HALF_UP
from django.conf import settings
from django.utils import timezone
from .models import TicketTransaction, OrganizerPayout, PlatformRevenue
from apps.admin_panel.models import PlatformConfig

def get_platform_fees():
    """Returns (percent_rate, flat_fee)"""
    conf_pct = PlatformConfig.objects.filter(key="default_pct_fee").first()
    rate = Decimal(conf_pct.value) / Decimal('100') if conf_pct else Decimal(str(getattr(settings, "PLATFORM_FEE_PERCENT", "5.0"))) / Decimal('100')
    
    conf_flat = PlatformConfig.objects.filter(key="default_flat_fee").first()
    flat = Decimal(conf_flat.value) if conf_flat else Decimal(str(getattr(settings, "PLATFORM_FEE_FLAT", "0.0")))
    
    return rate, flat

def calculate_split(gross_amount: Decimal):
    """
    Returns (platform_fee, organizer_amount) as Decimals rounded to 2dp.
    Ensures platform_fee + organizer_amount == gross_amount exactly.
    """
    rate, flat = get_platform_fees()
    platform_fee = (gross_amount * rate + flat).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    # Ensure organizer doesn't get negative amount if flat fee > gross amount
    if platform_fee > gross_amount:
        platform_fee = gross_amount
    organizer_amount = gross_amount - platform_fee
    return platform_fee, organizer_amount

def confirm_and_split(transaction: TicketTransaction, gateway_response: dict):
    """
    Called after payment is verified. Updates transaction, creates split records.
    Idempotent — safe to call multiple times on same transaction.
    """
    if transaction.payment_status == 'confirmed':
        return  # already processed — idempotency guard

    platform_fee, organizer_amount = calculate_split(transaction.gross_amount)

    transaction.platform_fee_rate = get_platform_fee_rate()
    transaction.platform_fee_amount = platform_fee
    transaction.organizer_amount = organizer_amount
    transaction.payment_status = 'confirmed'
    transaction.confirmed_at = timezone.now()
    transaction.raw_gateway_response = gateway_response
    transaction.save()

    # Record platform revenue
    PlatformRevenue.objects.get_or_create(
        transaction=transaction,
        defaults={'amount': platform_fee, 'gateway': transaction.gateway}
    )

    # Create organizer payout record
    organizer = transaction.order.event.organizer
    profile = getattr(organizer, 'payout_profile', None)

    if profile and profile.payout_status == 'active':
        OrganizerPayout.objects.get_or_create(
            transaction=transaction,
            defaults={
                'organizer': organizer,
                'amount': organizer_amount,
                'method': profile.payout_method,
                'status': 'queued',
            }
        )
        # Queue disbursement task
        from .tasks import disburse_organizer_payout
        disburse_organizer_payout.delay(str(transaction.id))
    else:
        # Payout profile not set up — hold funds, notify organizer
        OrganizerPayout.objects.get_or_create(
            transaction=transaction,
            defaults={
                'organizer': organizer,
                'amount': organizer_amount,
                'method': 'pending_setup',
                'status': 'queued',
                'failure_reason': 'Organizer payout profile not verified.',
            }
        )
        from .tasks import notify_organizer_incomplete_profile
        try:
            notify_organizer_incomplete_profile.delay(organizer.id)
        except Exception:
            pass # Task might not be fully wired up yet
