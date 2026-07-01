from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from core.exceptions import api_response
from core.permissions import IsCronAuthorized


@api_view(["POST"])
@permission_classes([IsCronAuthorized])
def checkout_cleanup(request):
    """Cancel expired PENDING orders and release reserved quantities."""
    from apps.orders.models import Order
    from apps.tickets.tasks import release_held_quantity

    expired = Order.objects.filter(status="PENDING", hold_expires_at__lt=timezone.now())
    count = expired.count()
    for order in expired:
        release_held_quantity.delay(str(order.id))
    return Response(api_response(data={"processed": count}).data)


@api_view(["POST"])
@permission_classes([IsCronAuthorized])
def event_reminders(request):
    """Send 24-hour reminders for events starting tomorrow."""
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

    return Response(api_response(data={"reminders_queued": count}).data)


@api_view(["POST"])
@permission_classes([IsCronAuthorized])
def complete_events(request):
    """Mark ended events as COMPLETED."""
    from apps.events.models import Event
    events = Event.objects.filter(status="PUBLISHED", ends_at__lt=timezone.now())
    updated = events.update(status="COMPLETED", completed_at=timezone.now())
    return Response(api_response(data={"completed": updated}).data)


@api_view(["POST"])
@permission_classes([IsCronAuthorized])
def aggregate_analytics(request):
    """Aggregate analytics for yesterday."""
    from apps.analytics.tasks import aggregate_daily_analytics
    from datetime import timedelta, date

    target_date = (timezone.now() - timedelta(days=1)).date()
    aggregate_daily_analytics.delay(target_date.isoformat())
    return Response(api_response(data={"date": target_date.isoformat(), "queued": True}).data)
