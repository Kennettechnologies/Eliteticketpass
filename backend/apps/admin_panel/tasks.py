import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name="admin_panel.run_checkout_cleanup_cron", queue="default")
def run_checkout_cleanup_cron():
    from apps.orders.models import Order
    from apps.tickets.tasks import release_held_quantity

    expired = Order.objects.filter(status="PENDING", hold_expires_at__lt=timezone.now())
    count = expired.count()
    for order in expired:
        release_held_quantity.delay(str(order.id))
    logger.info(f"Checkout cleanup: processed {count} expired orders.")


@shared_task(name="admin_panel.run_event_reminders_cron", queue="notifications")
def run_event_reminders_cron():
    from apps.events.models import Event
    from apps.orders.models import Order
    from apps.notifications.tasks import send_event_reminder
    from datetime import timedelta

    tomorrow_start = timezone.now() + timedelta(hours=23)
    tomorrow_end = timezone.now() + timedelta(hours=25)
    events = Event.objects.filter(
        status="PUBLISHED",
        starts_at__gte=tomorrow_start,
        starts_at__lte=tomorrow_end,
    )

    count = 0
    for event in events:
        orders = Order.objects.filter(event=event, status="CONFIRMED")
        for order in orders:
            send_event_reminder.delay(str(order.id))
            count += 1
    logger.info(f"Event reminders: queued {count} reminders.")


@shared_task(name="admin_panel.run_complete_events_cron", queue="default")
def run_complete_events_cron():
    from apps.events.models import Event
    events = Event.objects.filter(status="PUBLISHED", ends_at__lt=timezone.now())
    updated = events.update(status="COMPLETED", completed_at=timezone.now())
    logger.info(f"Complete events: marked {updated} events as completed.")


@shared_task(name="admin_panel.send_scheduled_reports", queue="default")
def send_scheduled_reports():
    from apps.admin_panel.models import ReportSubscription
    from django.core.mail import EmailMessage
    from django.utils import timezone
    import csv
    from io import StringIO
    
    subs = ReportSubscription.objects.filter(is_active=True)
    count = 0
    for sub in subs:
        f = StringIO()
        writer = csv.writer(f)
        writer.writerow(["Report Type", "Frequency", "Generated At"])
        writer.writerow([sub.report_type, sub.frequency, timezone.now().isoformat()])
        
        email = EmailMessage(
            subject=f"Scheduled Report: {sub.report_type}",
            body="Please find your automated enterprise report attached.\n\nEliteTicketPass Analytics Team",
            from_email="no-reply@eliteticketpass.com",
            to=[sub.email]
        )
        email.attach(f"report_{sub.report_type}.csv", f.getvalue(), "text/csv")
        email.send(fail_silently=True)
        count += 1
        
    logger.info(f"Scheduled reports: dispatched {count} emails.")
