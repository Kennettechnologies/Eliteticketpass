import base64
from datetime import timedelta
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from core.exceptions import api_response
from .models import Ticket, TicketTransfer
from .serializers import TicketSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_tickets(request):
    from django.db.models import Q
    qs = Ticket.objects.filter(
        Q(user=request.user) | Q(order__user=request.user)
    ).select_related("order__event", "tier").distinct().order_by("-created_at")

    status_filter = request.query_params.get("status")
    if status_filter:
        qs = qs.filter(status=status_filter)

    event_id = request.query_params.get("event_id")
    if event_id:
        qs = qs.filter(order__event_id=event_id)

    from core.pagination import StandardPagination
    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    return paginator.get_paginated_response(TicketSerializer(page, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ticket_detail(request, ticket_id):
    try:
        ticket = Ticket.objects.select_related("order__event", "tier").get(
            id=ticket_id, user=request.user
        )
    except Ticket.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Ticket not found.", "meta": None}, status=404)
    return Response(api_response(data=TicketSerializer(ticket).data).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ticket_pdf(request, ticket_id):
    try:
        ticket = Ticket.objects.get(id=ticket_id, user=request.user)
    except Ticket.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)

    from .tasks import generate_ticket_pdf
    pdf_b64 = generate_ticket_pdf(str(ticket.id))
    return Response(api_response(data={"pdf_base64": pdf_b64, "ticket_number": ticket.ticket_number}).data)


@api_view(["GET"])
@permission_classes([])
def ticket_pdf_public(request, token):
    try:
        ticket = Ticket.objects.get(qr_token=token)
    except Ticket.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)

    from .tasks import generate_ticket_pdf
    pdf_b64 = generate_ticket_pdf(str(ticket.id))
    return Response(api_response(data={"pdf_base64": pdf_b64, "ticket_number": ticket.ticket_number}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def transfer_ticket(request, ticket_id):
    try:
        ticket = Ticket.objects.get(id=ticket_id, user=request.user, status="ACTIVE")
    except Ticket.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Ticket not found or not transferable.", "meta": None}, status=404)

    if ticket.checked_in_at:
        return Response({"success": False, "data": None, "error": "Checked-in tickets cannot be transferred.", "meta": None}, status=400)

    # Frontend sends {name, email, phone}; accept both styles
    to_email = request.data.get("to_email") or request.data.get("email", "")
    to_phone = request.data.get("to_phone") or request.data.get("phone", "")
    to_name  = request.data.get("name", "")

    if not to_email:
        return Response({"success": False, "data": None, "error": "Recipient email is required.", "meta": None}, status=400)

    transfer = TicketTransfer.objects.create(
        ticket=ticket,
        from_user=request.user,
        to_email=to_email,
        to_phone=to_phone,
        expires_at=timezone.now() + timedelta(hours=48),
    )
    ticket.status = Ticket.Status.TRANSFERRED
    ticket.save(update_fields=["status"])

    from apps.notifications.tasks import send_transfer_notification
    send_transfer_notification.apply(args=[str(transfer.id)])

    return Response(api_response(data={
        "transfer_id": str(transfer.id),
        "transfer_token": str(transfer.transfer_token),
        "to_email": to_email,
        "expires_at": transfer.expires_at.isoformat(),
    }).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([])
def accept_transfer(request, token):
    try:
        transfer = TicketTransfer.objects.select_related("ticket", "from_user").get(
            transfer_token=token, status="PENDING"
        )
    except TicketTransfer.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Transfer not found.", "meta": None}, status=404)

    if transfer.expires_at < timezone.now():
        transfer.status = "EXPIRED"
        transfer.save(update_fields=["status"])
        transfer.ticket.status = "ACTIVE"
        transfer.ticket.save(update_fields=["status"])
        return Response({"success": False, "data": None, "error": "Transfer link has expired.", "meta": None}, status=410)

    ticket = transfer.ticket
    ticket.holder_email = transfer.to_email
    ticket.holder_name = transfer.to_email
    ticket.status = Ticket.Status.ACTIVE

    if request.user.is_authenticated:
        ticket.user = request.user
        transfer.to_user = request.user

    ticket.save()
    transfer.status = "ACCEPTED"
    transfer.accepted_at = timezone.now()
    transfer.save()

    return Response(api_response(data={"ticket_id": str(ticket.id), "ticket_number": ticket.ticket_number}).data)


@api_view(["POST"])
@permission_classes([])
def decline_transfer(request, token):
    try:
        transfer = TicketTransfer.objects.select_related("ticket").get(transfer_token=token, status="PENDING")
    except TicketTransfer.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)

    transfer.status = "CANCELLED"
    transfer.decline_reason = request.data.get("reason", "")
    transfer.declined_at = timezone.now()
    transfer.save(update_fields=["status", "decline_reason", "declined_at"])
    transfer.ticket.status = Ticket.Status.ACTIVE
    transfer.ticket.user = transfer.from_user
    transfer.ticket.save(update_fields=["status", "user"])
    return Response(api_response(data={"declined": True}).data)


@api_view(["GET"])
@permission_classes([])
def transfer_info(request, token):
    """Public endpoint: returns enough info for the accept/decline page."""
    try:
        transfer = TicketTransfer.objects.select_related(
            "ticket__order__event", "ticket__tier", "from_user"
        ).get(transfer_token=token)
    except TicketTransfer.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Transfer not found.", "meta": None}, status=404)

    ticket = transfer.ticket
    event = ticket.order.event
    sender = transfer.from_user
    return Response(api_response(data={
        "status": transfer.status,
        "expires_at": transfer.expires_at.isoformat(),
        "event_title": event.title,
        "event_date": event.starts_at.isoformat(),
        "venue_name": event.venue_name,
        "venue_city": event.venue_city,
        "ticket_number": ticket.ticket_number,
        "tier_name": ticket.tier.name if ticket.tier else "General",
        "sender_name": f"{sender.first_name} {sender.last_name}".strip() or sender.email,
        "to_email": transfer.to_email,
        "decline_reason": transfer.decline_reason,
    }).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_transfers(request):
    """Returns transfers sent by or received by the current user."""
    from django.db.models import Q
    transfers = TicketTransfer.objects.filter(
        Q(from_user=request.user) |
        Q(to_user=request.user) |
        Q(to_email=request.user.email)
    ).select_related(
        "ticket__order__event", "ticket__tier", "from_user", "to_user"
    ).order_by("-created_at")

    data = []
    for t in transfers:
        ticket = t.ticket
        event = ticket.order.event if ticket.order else None
        data.append({
            "id": str(t.id),
            "transfer_token": str(t.transfer_token),
            "status": t.status,
            "direction": "sent" if t.from_user_id == request.user.id else "received",
            "ticket_number": ticket.ticket_number,
            "tier_name": ticket.tier.name if ticket.tier else "General",
            "event_title": event.title if event else "",
            "event_slug": event.slug if event else "",
            "event_date": event.starts_at.isoformat() if event else None,
            "to_email": t.to_email,
            "to_name": f"{t.to_user.first_name} {t.to_user.last_name}".strip() if t.to_user else t.to_email,
            "sender_name": f"{t.from_user.first_name} {t.from_user.last_name}".strip() or t.from_user.email,
            "accepted_at": t.accepted_at.isoformat() if t.accepted_at else None,
            "declined_at": t.declined_at.isoformat() if t.declined_at else None,
            "decline_reason": t.decline_reason,
            "expires_at": t.expires_at.isoformat(),
            "created_at": t.created_at.isoformat(),
        })
    return Response(api_response(data=data).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def resend_ticket(request, ticket_id):
    from django.db.models import Q
    try:
        ticket = Ticket.objects.select_related("order__event", "tier").get(
            Q(user=request.user) | Q(order__user=request.user), id=ticket_id
        )
    except Ticket.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)

    channel = request.data.get("channel", "email")

    if channel == "whatsapp":
        from apps.notifications.tasks import send_whatsapp
        phone = ticket.holder_phone or (ticket.order.user.phone if ticket.order.user else "")
        if not phone:
            return Response({"success": False, "data": None, "error": "No phone number on file.", "meta": None}, status=400)
        event = ticket.order.event
        message = (
            f"Your ticket for {event.title}:\n"
            f"Ticket #: {ticket.ticket_number}\n"
            f"Tier: {ticket.tier.name if ticket.tier else 'General'}\n"
            f"Date: {event.starts_at.strftime('%d %b %Y, %I:%M %p')}\n"
            f"Venue: {event.venue_name}, {event.venue_city}"
        )
        send_whatsapp.apply(args=[phone, message])
    else:
        from apps.notifications.tasks import send_ticket_confirmation_email
        send_ticket_confirmation_email.apply(args=[str(ticket.order_id)])

    return Response(api_response(data={"sent": True}).data)

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_transfer(request, transfer_id):
    try:
        transfer = TicketTransfer.objects.get(id=transfer_id, from_user=request.user, status="PENDING")
    except TicketTransfer.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)

    transfer.status = "CANCELLED"
    transfer.save(update_fields=["status"])
    transfer.ticket.status = Ticket.Status.ACTIVE
    transfer.ticket.save(update_fields=["status"])
    return Response(api_response(data={"cancelled": True}).data)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ticket_calendar(request, ticket_id):
    try:
        ticket = Ticket.objects.select_related("order__event").get(id=ticket_id, user=request.user)
    except Ticket.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)

    event = ticket.order.event
    dt_format = "%Y%m%dT%H%M%SZ"
    start_str = event.starts_at.strftime(dt_format)
    end_str = event.ends_at.strftime(dt_format) if hasattr(event, 'ends_at') and event.ends_at else (event.starts_at + timedelta(hours=2)).strftime(dt_format)
    now_str = timezone.now().strftime(dt_format)
    
    ics_content = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//EliteTicketPass//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
DTSTAMP:{now_str}
DTSTART:{start_str}
DTEND:{end_str}
SUMMARY:{event.title}
LOCATION:{event.venue_name}, {event.venue_city}
DESCRIPTION:Ticket {ticket.ticket_number}
UID:{event.id}
END:VEVENT
END:VCALENDAR"""

    return Response(api_response(data={"ics_data": ics_content, "filename": f"{event.slug}.ics"}).data)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ticket_wallet(request, ticket_id):
    try:
        ticket = Ticket.objects.get(id=ticket_id, user=request.user)
    except Ticket.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)
        
    return Response(api_response(data={"pkpass_base64": "MOCK_PKPASS_DATA_REPLACE_WITH_REAL_GENERATOR"}).data)

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def toggle_resale(request, ticket_id):
    try:
        ticket = Ticket.objects.get(id=ticket_id, user=request.user)
    except Ticket.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)
        
    if ticket.status == Ticket.Status.FOR_RESALE:
        ticket.status = Ticket.Status.ACTIVE
        ticket.resale_price = None
        ticket.save(update_fields=["status", "resale_price"])
        return Response(api_response(data={"listed": False, "status": ticket.status}).data)
        
    elif ticket.status == Ticket.Status.ACTIVE:
        price = request.data.get("price")
        if not price:
            return Response({"success": False, "data": None, "error": "Price is required.", "meta": None}, status=400)
            
        ticket.status = Ticket.Status.FOR_RESALE
        ticket.resale_price = price
        ticket.save(update_fields=["status", "resale_price"])
        return Response(api_response(data={"listed": True, "status": ticket.status, "resale_price": ticket.resale_price}).data)
        
    else:
        return Response({"success": False, "data": None, "error": "Ticket cannot be listed for resale.", "meta": None}, status=400)
