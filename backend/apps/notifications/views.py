from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from core.exceptions import api_response
from core.pagination import StandardPagination
from .models import Notification, NotificationPreference, PushSubscription


_TYPE_MAP = {
    "ORDER_CONFIRMED": "ORDER", "NEW_ORDER": "ORDER", "REFUND_PROCESSED": "ORDER",
    "EVENT_REMINDER": "REMINDER",
    "EVENT_CANCELLED": "EVENT_UPDATE", "EVENT_POSTPONED": "EVENT_UPDATE", "EVENT_UPDATED": "EVENT_UPDATE",
    "PAYOUT_PROCESSED": "PAYOUT", "PAYOUT_FAILED": "PAYOUT",
    "PROMO_CODE": "PROMO",
    "CHECKIN_SUMMARY": "CHECKIN", "TICKET_TRANSFERRED": "CHECKIN",
    "SYSTEM_ALERT": "SYSTEM", "DAILY_SUMMARY": "SYSTEM",
}


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_notifications(request):
    qs = Notification.objects.filter(user=request.user, channel="IN_APP").order_by("-created_at")
    if request.query_params.get("unread") == "true":
        qs = qs.filter(read_at__isnull=True)
    if request.query_params.get("type"):
        qs = qs.filter(notif_type=request.query_params["type"])
    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    data = [{
        "id": str(n.id),
        "type": _TYPE_MAP.get(n.notif_type, "SYSTEM"),
        "title": n.subject or n.notif_type.replace("_", " ").title(),
        "body": n.body,
        "is_read": n.read_at is not None,
        "url": n.metadata.get("url") if n.metadata else None,
        "created_at": n.created_at.isoformat(),
    } for n in page]
    return paginator.get_paginated_response(data)


@api_view(["POST", "PATCH"])
@permission_classes([IsAuthenticated])
def mark_read(request, notif_id):
    Notification.objects.filter(id=notif_id, user=request.user).update(read_at=timezone.now(), status="READ")
    return Response(api_response(data={"read": True}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_all_read(request):
    Notification.objects.filter(user=request.user, read_at__isnull=True).update(read_at=timezone.now(), status="READ")
    return Response(api_response(data={"read": True}).data)


_PREF_KEYS = [
    "email_order_confirmation", "email_ticket_reminder", "email_event_updates",
    "email_promotions", "email_weekly_digest",
    "sms_order_confirmation", "sms_ticket_reminder", "sms_event_updates",
    "whatsapp_order_confirmation", "whatsapp_ticket_reminder",
    "whatsapp_event_updates", "whatsapp_broadcast",
    "push_order_confirmation", "push_event_updates", "push_flash_sale",
]

_DEFAULT_PREFS = {
    "email_order_confirmation": True, "email_ticket_reminder": True, "email_event_updates": True,
    "email_promotions": False, "email_weekly_digest": True,
    "sms_order_confirmation": True, "sms_ticket_reminder": False, "sms_event_updates": False,
    "whatsapp_order_confirmation": False, "whatsapp_ticket_reminder": False,
    "whatsapp_event_updates": False, "whatsapp_broadcast": False,
    "push_order_confirmation": True, "push_event_updates": False, "push_flash_sale": False,
}


@api_view(["GET", "PATCH", "PUT"])
@permission_classes([IsAuthenticated])
def preferences(request):
    if request.method == "GET":
        stored = {r.notif_type: r.enabled for r in NotificationPreference.objects.filter(user=request.user)}
        flat = {k: stored.get(k, _DEFAULT_PREFS.get(k, True)) for k in _PREF_KEYS}
        return Response(api_response(data=flat).data)
    # PATCH / PUT — accept flat dict
    for key in _PREF_KEYS:
        if key in request.data:
            channel, _, notif_type = key.partition("_")
            NotificationPreference.objects.update_or_create(
                user=request.user, notif_type=key,
                defaults={"channel": channel.upper(), "enabled": bool(request.data[key])},
            )
    return Response(api_response(data={"updated": True}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def push_subscribe(request):
    sub = request.data.get("subscription") or request.data
    endpoint = sub.get("endpoint", "")
    keys = sub.get("keys", {})
    p256dh = keys.get("p256dh") or sub.get("p256dh", "")
    auth   = keys.get("auth")   or sub.get("auth", "")
    if not endpoint:
        return Response({"success": False, "data": None, "error": "endpoint required.", "meta": None}, status=400)
    PushSubscription.objects.update_or_create(
        user=request.user, endpoint=endpoint,
        defaults={"p256dh": p256dh, "auth_key": auth, "user_agent": request.META.get("HTTP_USER_AGENT", "")[:512]},
    )
    return Response(api_response(data={"subscribed": True}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def push_unsubscribe(request):
    endpoint = request.data.get("endpoint", "")
    PushSubscription.objects.filter(user=request.user, endpoint=endpoint).delete()
    return Response(api_response(data={"unsubscribed": True}).data)
