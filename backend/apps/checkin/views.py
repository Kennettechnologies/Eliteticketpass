import logging
from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from core.exceptions import api_response
from core.permissions import IsGateStaff
from .models import CheckInSession, ScanLog

logger = logging.getLogger(__name__)


def _check_event_access(user, event):
    if user.role in ("ADMIN", "SUPER_ADMIN"):
        return True
    if user.role == "ORGANIZER":
        return hasattr(user, "organizer_profile") and event.organizer_id == user.organizer_profile.id
    if user.role == "GATE_STAFF":
        from apps.events.models import CheckinStaff
        return CheckinStaff.objects.filter(event=event, email=user.email).exists()
    return False


@api_view(["POST"])
@permission_classes([IsGateStaff])
def scan(request):
    """
    Scan a QR token. Uses SELECT FOR UPDATE to prevent double-check-in.
    Body: { qr_token, session_access_code, gate? }
    """
    qr_token = request.data.get("qr_token", "").strip()
    access_code = request.data.get("session_access_code", "").strip()
    gate = request.data.get("gate", "")

    # Validate session
    try:
        session = CheckInSession.objects.select_related("event").get(
            access_code=access_code, is_active=True
        )
    except CheckInSession.DoesNotExist:
        return Response(
            {"success": False, "data": None, "error": "Invalid access code.", "meta": None},
            status=status.HTTP_404_NOT_FOUND,
        )

    event = session.event
    
    if not _check_event_access(request.user, event):
        return Response(
            {"success": False, "data": None, "error": "You do not have permission to scan for this event.", "meta": None},
            status=status.HTTP_403_FORBIDDEN,
        )
        
    now = timezone.now()

    if session.expires_at and session.expires_at < now:
        return Response(
            {"success": False, "data": None, "error": "Session has expired.", "meta": None},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from apps.tickets.models import Ticket

    with transaction.atomic():
        try:
            ticket = Ticket.objects.select_for_update().get(qr_token=qr_token)
        except Ticket.DoesNotExist:
            ScanLog.objects.create(
                session=session, qr_token=qr_token, result=ScanLog.Result.INVALID,
                scanned_by=request.user, gate=gate,
                ip_address=request.META.get("REMOTE_ADDR"),
            )
            _broadcast_scan(access_code, {
                "type": "scan_result",
                "result": "INVALID",
                "qr_token": qr_token,
                "scanned_at": now.isoformat(),
            })
            return Response(api_response(data={"result": "INVALID", "message": "Ticket not found."}).data)

        # Verify ticket belongs to this event
        if ticket.order.event_id != event.id:
            ScanLog.objects.create(
                session=session, ticket=ticket, qr_token=qr_token,
                result=ScanLog.Result.INVALID, scanned_by=request.user, gate=gate,
                ip_address=request.META.get("REMOTE_ADDR"),
            )
            return Response(api_response(data={"result": "INVALID", "message": "Ticket is for a different event."}).data)

        if ticket.status == "CANCELLED":
            ScanLog.objects.create(
                session=session, ticket=ticket, qr_token=qr_token,
                result=ScanLog.Result.CANCELLED, scanned_by=request.user, gate=gate,
                ip_address=request.META.get("REMOTE_ADDR"),
            )
            return Response(api_response(data={"result": "CANCELLED", "message": "Ticket has been cancelled."}).data)

        if ticket.checked_in_at is not None:
            ScanLog.objects.create(
                session=session, ticket=ticket, qr_token=qr_token,
                result=ScanLog.Result.ALREADY_USED, scanned_by=request.user, gate=gate,
                ip_address=request.META.get("REMOTE_ADDR"),
            )
            return Response(api_response(data={
                "result": "ALREADY_USED",
                "message": f"Already checked in at {ticket.checked_in_at.strftime('%H:%M, %d %b %Y')}.",
                "checked_in_at": ticket.checked_in_at.isoformat(),
                "holder_name": ticket.holder_name,
                "tier_name": ticket.tier.name if ticket.tier else "",
            }).data)

        # Valid — perform check-in
        ticket.status = Ticket.Status.USED
        ticket.checked_in_at = now
        ticket.checked_in_by = request.user
        ticket.check_in_gate = gate
        ticket.save(update_fields=["status", "checked_in_at", "checked_in_by", "check_in_gate"])

        ScanLog.objects.create(
            session=session, ticket=ticket, qr_token=qr_token,
            result=ScanLog.Result.VALID, scanned_by=request.user, gate=gate,
            ip_address=request.META.get("REMOTE_ADDR"),
        )

    scan_payload = {
        "type": "scan_result",
        "result": "VALID",
        "ticket_number": ticket.ticket_number,
        "holder_name": ticket.holder_name,
        "tier_name": ticket.tier.name if ticket.tier else "",
        "event_name": event.title,
        "scanned_at": now.isoformat(),
    }
    _broadcast_scan(access_code, scan_payload)

    return Response(api_response(data={
        "result": "VALID",
        "message": f"Welcome, {ticket.holder_name}!",
        "ticket_number": ticket.ticket_number,
        "holder_name": ticket.holder_name,
        "holder_email": ticket.holder_email,
        "tier_name": ticket.tier.name if ticket.tier else "",
        "event_name": event.title,
    }).data)


def _broadcast_scan(access_code: str, payload: dict):
    try:
        channel_layer = get_channel_layer()
        group_name = f"checkin_{access_code}"
        async_to_sync(channel_layer.group_send)(group_name, payload)
    except Exception as e:
        logger.warning(f"Failed to broadcast scan: {e}")


@api_view(["GET"])
@permission_classes([IsGateStaff])
def session_detail(request, access_code: str):
    try:
        session = CheckInSession.objects.select_related("event").get(access_code=access_code)
    except CheckInSession.DoesNotExist:
        return Response(
            {"success": False, "data": None, "error": "Session not found.", "meta": None},
            status=status.HTTP_404_NOT_FOUND,
        )
        
    if not _check_event_access(request.user, session.event):
        return Response({"success": False, "data": None, "error": "Access denied.", "meta": None}, status=403)
        
    return Response(api_response(data={
        "id": str(session.id),
        "name": session.name,
        "access_code": session.access_code,
        "is_active": session.is_active,
        "event": {"id": str(session.event.id), "title": session.event.title, "starts_at": session.event.starts_at.isoformat()},
    }).data)


@api_view(["GET"])
@permission_classes([IsGateStaff])
def session_stats(request, access_code: str):
    try:
        session = CheckInSession.objects.select_related("event").get(access_code=access_code)
    except CheckInSession.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)

    event = session.event
    
    if not _check_event_access(request.user, event):
        return Response({"success": False, "data": None, "error": "Access denied.", "meta": None}, status=403)

    from apps.tickets.models import Ticket
    from apps.events.models import TicketTier

    tiers = TicketTier.objects.filter(event=event)
    tier_breakdown = []
    for tier in tiers:
        sold = Ticket.objects.filter(tier=tier, status__in=["ACTIVE", "USED"]).count()
        checked_in = Ticket.objects.filter(tier=tier, checked_in_at__isnull=False).count()
        tier_breakdown.append({"tier_name": tier.name, "sold": sold, "checked_in": checked_in})

    total_sold = sum(t["sold"] for t in tier_breakdown)
    total_checked_in = sum(t["checked_in"] for t in tier_breakdown)

    return Response(api_response(data={
        "total_sold": total_sold,
        "total_checked_in": total_checked_in,
        "tiers": tier_breakdown,
    }).data)
