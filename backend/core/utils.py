import base64
import re
import threading
from collections import namedtuple
from datetime import datetime, timezone as dt_timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from zoneinfo import ZoneInfo

EAT = ZoneInfo("Africa/Nairobi")

FeeBreakdown = namedtuple(
    "FeeBreakdown",
    [
        "subtotal",
        "discount_amount",
        "after_discount",
        "platform_fee_percent",
        "platform_fee_flat",
        "platform_fee_total",
        "total",
        "fee_absorbed_by",
    ],
)

_counter_lock = threading.Lock()


def get_daraja_timestamp() -> str:
    """Return current East Africa Time formatted as YYYYMMDDHHmmss."""
    now_eat = datetime.now(EAT)
    return now_eat.strftime("%Y%m%d%H%M%S")


def get_daraja_password(shortcode: str, passkey: str, timestamp: str) -> str:
    """Base64(ShortCode + Passkey + Timestamp)."""
    raw = f"{shortcode}{passkey}{timestamp}"
    return base64.b64encode(raw.encode()).decode()


def normalise_mpesa_phone(phone: str) -> str:
    """Accepts 07XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX → returns 2547XXXXXXXX."""
    phone = re.sub(r"[\s\-\(\)]", "", str(phone))
    if phone.startswith("+254"):
        phone = phone[1:]
    elif phone.startswith("07") or phone.startswith("01"):
        phone = "254" + phone[1:]
    if not re.match(r"^2547\d{8}$|^2541\d{8}$", phone):
        raise ValueError(f"Invalid Kenyan phone number: {phone}")
    return phone


def parse_daraja_date(raw: str) -> datetime:
    """Parse Daraja timestamp (YYYYMMDDHHmmss, EAT) → UTC-aware datetime."""
    naive = datetime.strptime(str(raw), "%Y%m%d%H%M%S")
    eat_aware = naive.replace(tzinfo=EAT)
    return eat_aware.astimezone(dt_timezone.utc)


def generate_order_number() -> str:
    """Generate ORD-YYYY-NNNNN using DB counter (call inside atomic block)."""
    from django.db import connection
    year = datetime.now(EAT).year
    with connection.cursor() as cur:
        cur.execute(
            """
            INSERT INTO sequence_counter (name, value)
            VALUES (%s, 1)
            ON CONFLICT (name) DO UPDATE SET value = sequence_counter.value + 1
            RETURNING value
            """,
            [f"order_{year}"],
        )
        seq = cur.fetchone()[0]
    return f"ORD-{year}-{seq:05d}"


def generate_ticket_number() -> str:
    """Generate TKT-YYYY-NNNNN using DB counter."""
    from django.db import connection
    year = datetime.now(EAT).year
    with connection.cursor() as cur:
        cur.execute(
            """
            INSERT INTO sequence_counter (name, value)
            VALUES (%s, 1)
            ON CONFLICT (name) DO UPDATE SET value = sequence_counter.value + 1
            RETURNING value
            """,
            [f"ticket_{year}"],
        )
        seq = cur.fetchone()[0]
    return f"TKT-{year}-{seq:05d}"


def calculate_fees(
    subtotal: Decimal,
    discount_amount: Decimal,
    organizer=None,
) -> FeeBreakdown:
    """Return a FeeBreakdown namedtuple with all fee components."""
    from django.conf import settings
    from apps.admin_panel.models import PlatformConfig

    after_discount = max(Decimal("0"), subtotal - discount_amount)

    if organizer and organizer.custom_fee_percent is not None:
        fee_percent = organizer.custom_fee_percent
        fee_flat = organizer.custom_fee_flat or Decimal("0")
        fee_absorbed_by = organizer.fee_absorbed_by
    else:
        cfg_pct = PlatformConfig.objects.filter(key="default_pct_fee").first()
        fee_percent = Decimal(cfg_pct.value) if cfg_pct else Decimal(str(getattr(settings, "PLATFORM_FEE_PERCENT", 5.0)))

        cfg_flat = PlatformConfig.objects.filter(key="default_flat_fee").first()
        fee_flat = Decimal(cfg_flat.value) if cfg_flat else Decimal(str(getattr(settings, "PLATFORM_FEE_FLAT", 0.0)))

        cfg_abs = PlatformConfig.objects.filter(key="fee_absorbed_by").first()
        fee_absorbed_by = cfg_abs.value.lower() if cfg_abs else getattr(settings, "PLATFORM_FEE_ABSORBED_BY", "organizer").lower()

    platform_fee_total = (after_discount * fee_percent / 100 + fee_flat).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    if fee_absorbed_by == "buyer":
        total = after_discount + platform_fee_total
    else:
        total = after_discount

    return FeeBreakdown(
        subtotal=subtotal,
        discount_amount=discount_amount,
        after_discount=after_discount,
        platform_fee_percent=fee_percent,
        platform_fee_flat=fee_flat,
        platform_fee_total=platform_fee_total,
        total=total,
        fee_absorbed_by=fee_absorbed_by.upper(),
    )


def make_slug_unique(model_class, base_slug: str, instance=None) -> str:
    """Ensure a slug is unique within the given model."""
    from django.utils.text import slugify
    slug = slugify(base_slug)
    qs = model_class.objects.filter(slug__startswith=slug)
    if instance and instance.pk:
        qs = qs.exclude(pk=instance.pk)
    if not qs.exists():
        return slug
    counter = 1
    while qs.filter(slug=f"{slug}-{counter}").exists():
        counter += 1
    return f"{slug}-{counter}"
