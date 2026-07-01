import logging
from celery import shared_task
from django.db.models import Sum, Count

logger = logging.getLogger(__name__)


@shared_task(name="analytics.aggregate_daily_analytics", queue="analytics")
def aggregate_daily_analytics(date_str: str):
    from datetime import datetime, date
    from django.utils import timezone
    from apps.orders.models import Order
    from apps.tickets.models import Ticket
    from apps.events.models import Event
    from apps.users.models import User
    from apps.organizers.models import Organizer
    from apps.payouts.models import Payout
    from apps.refunds.models import Refund
    from .models import EventAnalyticsDaily, PlatformAnalyticsDaily

    target_date = datetime.strptime(date_str, "%Y-%m-%d").date()

    # Event-level analytics
    events = Event.objects.filter(orders__confirmed_at__date=target_date).distinct()
    for event in events:
        orders = Order.objects.filter(event=event, status="CONFIRMED", confirmed_at__date=target_date)
        revenue = orders.aggregate(s=Sum("total"))["s"] or 0
        tickets_sold = Ticket.objects.filter(order__event=event, created_at__date=target_date).count()
        check_ins = Ticket.objects.filter(order__event=event, checked_in_at__date=target_date).count()

        EventAnalyticsDaily.objects.update_or_create(
            event=event, date=target_date,
            defaults={
                "orders_confirmed": orders.count(),
                "tickets_sold": tickets_sold,
                "revenue": revenue,
                "check_ins": check_ins,
            }
        )

    # Platform-level analytics
    confirmed_orders = Order.objects.filter(status="CONFIRMED", confirmed_at__date=target_date)
    total_revenue = confirmed_orders.aggregate(s=Sum("total"))["s"] or 0
    platform_fees = confirmed_orders.aggregate(s=Sum("platform_fee"))["s"] or 0
    total_refunds = Refund.objects.filter(status="PROCESSED", processed_at__date=target_date).aggregate(s=Sum("amount"))["s"] or 0
    total_payouts = Payout.objects.filter(status="COMPLETED", processed_at__date=target_date).aggregate(s=Sum("net_amount"))["s"] or 0
    new_users = User.objects.filter(created_at__date=target_date).count()
    new_organizers = Organizer.objects.filter(created_at__date=target_date).count()
    events_published = Event.objects.filter(published_at__date=target_date).count()

    PlatformAnalyticsDaily.objects.update_or_create(
        date=target_date,
        defaults={
            "new_users": new_users,
            "new_organizers": new_organizers,
            "events_published": events_published,
            "total_orders": Order.objects.filter(created_at__date=target_date).count(),
            "confirmed_orders": confirmed_orders.count(),
            "total_revenue": total_revenue,
            "platform_fees": platform_fees,
            "total_refunds": total_refunds,
            "total_payouts": total_payouts,
        }
    )
    logger.info(f"Analytics aggregated for {target_date}")


@shared_task(name="analytics.run_daily_analytics_cron", queue="analytics")
def run_daily_analytics_cron():
    from datetime import timedelta
    from django.utils import timezone
    target_date = (timezone.now() - timedelta(days=1)).date()
    aggregate_daily_analytics(target_date.strftime("%Y-%m-%d"))


@shared_task(name="analytics.increment_event_view", queue="analytics")
def increment_event_view(event_id: str):
    from apps.events.models import Event
    from django.db.models import F
    Event.objects.filter(id=event_id).update(view_count=F("view_count") + 1)
