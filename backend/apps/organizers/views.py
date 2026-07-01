import uuid as _uuid
from decimal import Decimal
from django.db.models import Sum, Count, Q
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status

from core.exceptions import api_response
from core.permissions import IsApprovedOrganizer
from core.pagination import StandardPagination
from .models import Organizer, KycDocument, OrganizerFollower
from .serializers import OrganizerSerializer, OrganizerUpdateSerializer
from apps.payments.models import TicketTransaction, OrganizerPayout
from apps.notifications.models import Announcement, Automation, OrganizerTemplate
from django.db.models import Sum
from django.utils import timezone


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard(request):
    try:
        org = request.user.organizer_profile
    except Exception:
        return Response({"success": False, "data": None, "error": "Not an organizer.", "meta": None}, status=403)

    from apps.orders.models import Order
    from apps.events.models import Event
    from apps.analytics.models import EventAnalyticsDaily
    import datetime

    confirmed_orders = Order.objects.filter(event__organizer=org, status="CONFIRMED")
    total_revenue = confirmed_orders.aggregate(s=Sum("total"))["s"] or Decimal("0")
    tickets_sold = confirmed_orders.aggregate(t=Sum("items__quantity"))["t"] or 0

    now = timezone.now()
    upcoming = Event.objects.filter(organizer=org, status="PUBLISHED", starts_at__gte=now).count()
    total_events = Event.objects.filter(organizer=org).count()

    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    revenue_month = confirmed_orders.filter(confirmed_at__gte=month_start).aggregate(s=Sum("total"))["s"] or Decimal("0")

    # Revenue chart last 30 days
    thirty_ago = (now - datetime.timedelta(days=30)).date()
    daily = list(
        EventAnalyticsDaily.objects.filter(event__organizer=org, date__gte=thirty_ago)
        .values("date").annotate(revenue=Sum("revenue"), tickets=Sum("tickets_sold"))
        .order_by("date")
    )
    
    total_views = Event.objects.filter(organizer=org).aggregate(s=Sum("view_count"))["s"] or 0

    # Ticket Tier Breakdown
    from apps.events.models import TicketTier
    tier_sales = list(
        TicketTier.objects.filter(event__organizer=org, event__status="PUBLISHED")
        .values("name")
        .annotate(sold=Sum("sold"))
        .filter(sold__gt=0)
        .order_by("-sold")
    )

    # Top Active Events
    from django.db.models.functions import Coalesce
    active_events = Event.objects.filter(organizer=org, status="PUBLISHED", starts_at__gte=now).annotate(
        tickets_sold_total=Coalesce(Sum('ticket_tiers__sold'), 0),
        capacity_total=Coalesce(Sum('ticket_tiers__quantity'), 0),
    ).order_by("-tickets_sold_total")[:5]
    
    top_events = []
    for e in active_events:
        top_events.append({
            "id": str(e.id),
            "title": e.title,
            "tickets_sold": e.tickets_sold_total,
            "capacity": e.capacity_total,
            "date": e.starts_at.isoformat()
        })

    recent_orders = Order.objects.filter(event__organizer=org, status="CONFIRMED").order_by("-confirmed_at")[:10]
    from apps.orders.serializers import OrderSummarySerializer
    return Response(api_response(data={
        "total_revenue": str(total_revenue),
        "tickets_sold": tickets_sold,
        "upcoming_events": upcoming,
        "total_events": total_events,
        "total_views": total_views,
        "revenue_this_month": str(revenue_month),
        "revenue_chart": list(daily),
        "tier_sales": tier_sales,
        "top_events": top_events,
        "recent_orders": OrderSummarySerializer(recent_orders, many=True).data,
    }).data)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def profile(request):
    try:
        org = request.user.organizer_profile
    except Exception:
        return Response({"success": False, "data": None, "error": "Not an organizer.", "meta": None}, status=403)

    if request.method == "GET":
        return Response(api_response(data=OrganizerSerializer(org).data).data)

    ser = OrganizerUpdateSerializer(org, data=request.data, partial=True)
    if not ser.is_valid():
        print("Validation errors:", ser.errors)
        ser.is_valid(raise_exception=True)
    ser.save()
    return Response(api_response(data=OrganizerSerializer(org).data).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def profile_logo(request):
    try:
        org = request.user.organizer_profile
    except Exception:
        return Response({"success": False, "data": None, "error": "Not an organizer.", "meta": None}, status=403)
        
    logo = request.FILES.get("logo")
    if not logo:
        return Response({"success": False, "error": "No logo provided"}, status=400)
        
    from django.core.files.storage import default_storage
    path = default_storage.save(f"organizers/{org.id}/logo_{logo.name}", logo)
    file_url = request.build_absolute_uri(default_storage.url(path))
    
    org.logo_url = file_url
    org.save(update_fields=["logo_url"])
    
    return Response(api_response(data={"logo_url": file_url}).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def kyc(request):
    try:
        org = request.user.organizer_profile
    except Exception:
        return Response({"success": False, "data": None, "error": "Not an organizer.", "meta": None}, status=403)

    if request.method == "GET":
        return Response(api_response(data={"status": org.kyc_status}).data)

    from django.core.files.storage import default_storage
    for field_name in request.FILES:
        uploaded_file = request.FILES[field_name]
        path = default_storage.save(f"kyc/{org.id}/{field_name}_{uploaded_file.name}", uploaded_file)
        file_url = request.build_absolute_uri(default_storage.url(path))
        KycDocument.objects.create(
            organizer=org,
            doc_type=field_name,
            file_url=file_url,
            file_name=uploaded_file.name,
            status="PENDING_REVIEW"
        )

    if org.kyc_status in ("NOT_SUBMITTED", "REJECTED"):
        org.kyc_status = "PENDING_REVIEW"
        org.kyc_submitted_at = timezone.now()
        org.save(update_fields=["kyc_status", "kyc_submitted_at"])

    return Response(api_response(data={"success": True, "status": org.kyc_status}).data)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def payout_account(request):
    try:
        org = request.user.organizer_profile
    except Exception:
        return Response({"success": False, "data": None, "error": "Not an organizer.", "meta": None}, status=403)

    if request.method == "GET":
        return Response(api_response(data=OrganizerSerializer(org).data).data)

    ser = OrganizerUpdateSerializer(org, data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    ser.save()
    return Response(api_response(data=OrganizerSerializer(org).data).data)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def payout_settings(request):
    try:
        org = request.user.organizer_profile
    except Exception:
        return Response({"success": False, "data": None, "error": "Not an organizer.", "meta": None}, status=403)

    if request.method == "GET":
        data = {
            "schedule": org.payout_schedule,
            "auto_payout_days_after": org.auto_payout_days_after,
            "preferred_method": "BANK" if org.payout_method == "BANK_TRANSFER" else org.payout_method,
        }
        return Response(api_response(data=data).data)

    # PATCH
    data = request.data
    if "schedule" in data:
        org.payout_schedule = data["schedule"]
    if "auto_payout_days_after" in data:
        org.auto_payout_days_after = int(data["auto_payout_days_after"])
    if "preferred_method" in data:
        org.payout_method = "BANK_TRANSFER" if data["preferred_method"] == "BANK" else data["preferred_method"]
    
    org.save(update_fields=["payout_schedule", "auto_payout_days_after", "payout_method"])
    
    res_data = {
        "schedule": org.payout_schedule,
        "auto_payout_days_after": org.auto_payout_days_after,
        "preferred_method": "BANK" if org.payout_method == "BANK_TRANSFER" else org.payout_method,
    }
    return Response(api_response(data=res_data).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def payout_summary(request):
    try:
        org = request.user.organizer_profile
    except Exception:
        return Response({"success": False, "data": None, "error": "Not an organizer."}, status=403)

    total_earned = TicketTransaction.objects.filter(
        order__event__organizer=org,
        payment_status='confirmed'
    ).aggregate(Sum('organizer_amount'))['organizer_amount__sum'] or 0

    platform_fees = TicketTransaction.objects.filter(
        order__event__organizer=org,
        payment_status='confirmed'
    ).aggregate(Sum('platform_fee_amount'))['platform_fee_amount__sum'] or 0

    total_paid_out = OrganizerPayout.objects.filter(
        organizer=org,
        status='completed'
    ).aggregate(Sum('amount'))['amount__sum'] or 0

    pending_payout = OrganizerPayout.objects.filter(
        organizer=org,
        status__in=['queued', 'processing']
    ).aggregate(Sum('amount'))['amount__sum'] or 0

    net_payable = float(total_earned) - float(total_paid_out) - float(pending_payout)
    if net_payable < 0:
        net_payable = 0

    data = {
        "total_earned": str(total_earned),
        "platform_fees": str(platform_fees),
        "total_paid_out": str(total_paid_out),
        "pending_payout": str(pending_payout),
        "net_payable": str(net_payable),
    }
    return Response(api_response(data=data).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def payout_list(request):
    try:
        org = request.user.organizer_profile
    except Exception:
        return Response({"success": False, "data": None, "error": "Not an organizer."}, status=403)

    payouts = OrganizerPayout.objects.filter(organizer=org).order_by('-created_at')
    data = []
    for p in payouts:
        data.append({
            "id": str(p.id),
            "amount": str(p.amount),
            "method": p.method,
            "status": p.status.upper(),
            "reference": p.reference or str(p.id).split('-')[0].upper(),
            "event_title": "Lump Sum (All Events)" if not p.transaction else p.transaction.order.event.name,
            "created_at": p.created_at,
            "completed_at": p.disbursed_at,
            "failure_reason": p.failure_reason,
            "invoice_url": None,
        })
    return Response(api_response(data={"results": data}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def payout_request(request):
    try:
        org = request.user.organizer_profile
    except Exception:
        return Response({"success": False, "data": None, "error": "Not an organizer."}, status=403)

    amount = request.data.get("amount")
    if not amount:
        return Response({"success": False, "error": "Amount is required"}, status=400)

    try:
        amount = float(amount)
    except ValueError:
        return Response({"success": False, "error": "Invalid amount"}, status=400)

    if amount <= 0:
        return Response({"success": False, "error": "Amount must be greater than zero"}, status=400)

    if org.kyc_status != "APPROVED":
        return Response({"success": False, "error": "KYC must be verified before requesting a payout"}, status=400)

    total_earned = TicketTransaction.objects.filter(
        order__event__organizer=org,
        payment_status='confirmed'
    ).aggregate(Sum('organizer_amount'))['organizer_amount__sum'] or 0

    total_paid_out = OrganizerPayout.objects.filter(
        organizer=org,
        status='completed'
    ).aggregate(Sum('amount'))['amount__sum'] or 0

    pending_payout = OrganizerPayout.objects.filter(
        organizer=org,
        status__in=['queued', 'processing']
    ).aggregate(Sum('amount'))['amount__sum'] or 0

    net_payable = float(total_earned) - float(total_paid_out) - float(pending_payout)

    if amount > net_payable:
        return Response({"success": False, "error": f"Requested amount exceeds net payable balance (KES {net_payable})"}, status=400)

    method = request.data.get("method")
    import uuid
    ref = f"PO-{str(uuid.uuid4()).split('-')[0].upper()}"

    p = OrganizerPayout.objects.create(
        organizer=org,
        amount=amount,
        method=method,
        status='completed',
        reference=ref,
        disbursed_at=timezone.now()
    )

    return Response(api_response(data={"success": True}).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def fee_agreement(request):
    try:
        org = request.user.organizer_profile
    except Exception:
        return Response({"success": False, "data": None, "error": "Not an organizer.", "meta": None}, status=403)
        
    from apps.admin_panel.models import PlatformFeeSetting
    fee_settings, _ = PlatformFeeSetting.objects.get_or_create(pk=1)

    return Response(api_response(data={
        "accepted": org.fee_agreement_accepted,
        "accepted_at": org.fee_agreement_accepted_at,
        "fees": {
            "platform_fee": fee_settings.platform_fee,
            "payment_processing_mpesa": fee_settings.payment_processing_mpesa,
            "payment_processing_card": fee_settings.payment_processing_card,
            "bank_transfer_fee": fee_settings.bank_transfer_fee,
            "free_events_fee": fee_settings.free_events_fee,
            "payout_schedule": fee_settings.payout_schedule,
        }
    }).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def fee_agreement_accept(request):
    try:
        org = request.user.organizer_profile
    except Exception:
        return Response({"success": False, "data": None, "error": "Not an organizer.", "meta": None}, status=403)
        
    org.fee_agreement_accepted = True
    org.fee_agreement_accepted_at = timezone.now()
    org.save(update_fields=["fee_agreement_accepted", "fee_agreement_accepted_at"])
    return Response(api_response(data={
        "accepted": True,
        "accepted_at": org.fee_agreement_accepted_at
    }).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsApprovedOrganizer])
def event_attendees(request, event_id):
    from apps.tickets.models import Ticket
    from apps.tickets.serializers import AttendeeSerializer
    qs = Ticket.objects.filter(
        order__event_id=event_id,
        order__event__organizer__user=request.user,
        order__status="CONFIRMED",
    ).select_related("order", "tier")

    status_filter = request.query_params.get("status")
    if status_filter:
        qs = qs.filter(status=status_filter)
    tier_filter = request.query_params.get("tier_id")
    if tier_filter:
        qs = qs.filter(tier_id=tier_filter)
    search = request.query_params.get("search")
    if search:
        qs = qs.filter(Q(holder_name__icontains=search) | Q(holder_email__icontains=search) | Q(ticket_number__icontains=search))

    if request.query_params.get("export") == "csv":
        import csv
        from django.http import HttpResponse
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="attendees.csv"'
        writer = csv.writer(response)
        writer.writerow(["Name", "Email", "Phone", "Tier", "Order Date", "Ticket #", "Checked In"])
        for t in qs:
            writer.writerow([t.holder_name, t.holder_email, t.holder_phone,
                             t.tier.name if t.tier else "", t.order.created_at.date(),
                             t.ticket_number, "Yes" if t.checked_in_at else "No"])
        return response

    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    return paginator.get_paginated_response(AttendeeSerializer(page, many=True).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated, IsApprovedOrganizer])
def event_attendee_update(request, event_id, attendee_id):
    from apps.events.models import Event
    from apps.tickets.models import Ticket
    from django.utils import timezone
    
    user = request.user
    lookup = {} if user.role in ("SUPER_ADMIN", "ADMIN") else {"organizer__user": user}
    try:
        event = Event.objects.get(id=event_id, **lookup)
    except Event.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Event not found.", "meta": None}, status=404)
        
    try:
        ticket = Ticket.objects.get(id=attendee_id, order__event=event)
    except Ticket.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Attendee not found.", "meta": None}, status=404)
        
    data = request.data
    updated = False
    
    if "notes" in data:
        ticket.notes = data["notes"]
        updated = True
        
    if "checked_in" in data:
        if data["checked_in"] and not ticket.checked_in_at:
            ticket.checked_in_at = timezone.now()
            ticket.checked_in_by = request.user
        elif not data["checked_in"] and ticket.checked_in_at:
            ticket.checked_in_at = None
            ticket.checked_in_by = None
        updated = True
        
    if updated:
        ticket.save()
        
    return Response(api_response(data={"success": True}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsApprovedOrganizer])
def event_attendees_manual_checkin(request, event_id, attendee_id):
    from apps.events.models import Event
    from apps.tickets.models import Ticket
    from django.utils import timezone
    
    user = request.user
    lookup = {} if user.role in ("SUPER_ADMIN", "ADMIN") else {"organizer__user": user}
    try:
        event = Event.objects.get(id=event_id, **lookup)
    except Event.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Event not found.", "meta": None}, status=404)
        
    try:
        ticket = Ticket.objects.get(id=attendee_id, order__event=event)
    except Ticket.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Attendee not found.", "meta": None}, status=404)
        
    if ticket.checked_in_at:
        return Response({"success": False, "error": "Ticket already checked in"}, status=400)
        
    if ticket.status == "CANCELLED":
        return Response({"success": False, "error": "Ticket has been cancelled"}, status=400)
        
    ticket.status = "USED"
    ticket.checked_in_at = timezone.now()
    ticket.checked_in_by = request.user
    ticket.check_in_gate = "Manual Dashboard Check-in"
    ticket.save(update_fields=["status", "checked_in_at", "checked_in_by", "check_in_gate"])
    
    return Response(api_response(data={"checked_in": True, "time": ticket.checked_in_at.isoformat()}).data)


# ── Organizer event management ────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def organizer_events(request):
    from apps.events.models import Event
    from apps.events.serializers import EventListSerializer
    from django.db.models import Sum, Value
    from django.db.models.functions import Coalesce
    user = request.user
    base_qs = Event.objects.select_related("organizer", "category").prefetch_related("ticket_tiers")
    if user.role in ("SUPER_ADMIN", "ADMIN"):
        qs = base_qs.all()
    elif user.role == "ORGANIZER":
        try:
            org = user.organizer_profile
        except Exception:
            return Response(api_response(data=[]).data)
        qs = base_qs.filter(organizer=org)
    elif user.role == "GATE_STAFF":
        from apps.events.models import CheckinStaff
        assigned_event_ids = CheckinStaff.objects.filter(email=user.email).values_list("event_id", flat=True)
        qs = base_qs.filter(id__in=assigned_event_ids)
    else:
        return Response(api_response(data=[]).data)
    qs = qs.annotate(
        tickets_sold=Coalesce(Sum("ticket_tiers__sold"), Value(0)),
        capacity=Coalesce(Sum("ticket_tiers__quantity"), Value(0)),
    ).order_by("-created_at")
    status_filter = request.query_params.get("status")
    if status_filter:
        qs = qs.filter(status=status_filter)
    search = request.query_params.get("search")
    if search:
        qs = qs.filter(Q(title__icontains=search) | Q(venue_city__icontains=search))
        
    if request.query_params.get("active") == "true":
        from django.utils import timezone
        qs = qs.filter(ends_at__gte=timezone.now())
        
    if request.query_params.get("not_sold_out") == "true":
        from django.db.models import F
        qs = qs.filter(tickets_sold__lt=F("capacity"))

    def serialize(events):
        base = EventListSerializer(events, many=True).data
        for item, obj in zip(base, events):
            item["tickets_sold"] = obj.tickets_sold
            item["capacity"] = obj.capacity
            item["revenue"] = "0"
            item["checkin_access_code"] = obj.checkin_access_code
            item["tiers"] = [{"id": str(t.id), "name": t.name} for t in obj.ticket_tiers.all()]
        return base

    page_size = request.query_params.get("page_size")
    if page_size == "100":
        return Response(api_response(data=serialize(list(qs[:100]))).data)
    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    return paginator.get_paginated_response(serialize(list(page)))


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def organizer_event_crud(request, event_id):
    from apps.events.models import Event, TicketTier
    from apps.events.serializers import EventDetailSerializer, EventCreateSerializer
    user = request.user
    
    if user.role in ("SUPER_ADMIN", "ADMIN"):
        lookup = {}
    else:
        try:
            org = user.organizer_profile
            lookup = {"organizer": org}
        except Exception:
            return Response({"success": False, "data": None, "error": "Not an organizer.", "meta": None}, status=403)
            
    try:
        event = Event.objects.get(id=event_id, **lookup)
    except Event.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Event not found.", "meta": None}, status=404)
        
    if request.method == "DELETE":
        event.delete()
        return Response(api_response(data={"deleted": True}).data)
        
    if request.method == "GET":
        data = EventDetailSerializer(event).data
        data["tiers"] = data["ticket_tiers"]
        return Response(api_response(data=data).data)
        
    data = request.data.copy()
    tiers_data = None
    if "tiers" in data:
        tiers_data = data.pop("tiers")
        
    ser = EventCreateSerializer(event, data=data, partial=True, context={"request": request})
    ser.is_valid(raise_exception=True)
    ser.save()
    
    if tiers_data is not None:
        existing_tiers = {str(t.id): t for t in event.ticket_tiers.all()}
        incoming_ids = set()
        
        for tier_data in tiers_data:
            tier_id = str(tier_data.get("id", ""))
            
            if tier_id in existing_tiers:
                tier = existing_tiers[tier_id]
                for key, value in tier_data.items():
                    if key not in ("id", "event", "sold", "reserved", "available", "created_at", "updated_at"):
                        setattr(tier, key, value)
                tier.save()
                incoming_ids.add(tier_id)
            else:
                tier_data.pop("id", None)
                TicketTier.objects.create(event=event, **tier_data)
                
        for tier_id, tier in existing_tiers.items():
            if tier_id not in incoming_ids:
                if tier.sold > 0 or getattr(tier, "reserved", 0) > 0:
                    tier.is_active = False
                    tier.save(update_fields=["is_active"])
                else:
                    try:
                        tier.delete()
                    except Exception:
                        tier.is_active = False
                        tier.save(update_fields=["is_active"])
            
    ret = EventDetailSerializer(event).data
    ret["tiers"] = ret["ticket_tiers"]
    return Response(api_response(data=ret).data)

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def organizer_event_create(request):
    from apps.events.models import TicketTier
    from apps.events.serializers import EventCreateSerializer, EventDetailSerializer
    
    try:
        org = request.user.organizer_profile
    except Exception:
        return Response({"success": False, "data": None, "error": "Not an organizer.", "meta": None}, status=403)
        
    data = request.data.copy()
    if "tiers" in data:
        data["ticket_tiers"] = data.pop("tiers")
        
    ser = EventCreateSerializer(data=data, context={"request": request})
    ser.is_valid(raise_exception=True)
    event = ser.save(organizer=org, status="DRAFT")
    
    ret = EventDetailSerializer(event).data
    ret["tiers"] = ret["ticket_tiers"]
    return Response(api_response(data=ret).data, status=status.HTTP_201_CREATED)

@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def organizer_event_cover(request, event_id):
    from apps.events.models import Event
    from django.core.files.storage import default_storage
    user = request.user
    
    if user.role in ("SUPER_ADMIN", "ADMIN"):
        lookup = {}
    else:
        try:
            org = user.organizer_profile
            lookup = {"organizer": org}
        except Exception:
            return Response({"success": False, "data": None, "error": "Not an organizer.", "meta": None}, status=403)
            
    try:
        event = Event.objects.get(id=event_id, **lookup)
    except Event.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Event not found.", "meta": None}, status=404)
        
    cover = request.FILES.get("cover_image")
    if cover:
        file_name = default_storage.save(f"events/covers/{event.id}_{cover.name}", cover)
        file_url = request.build_absolute_uri(default_storage.url(file_name))
        event.cover_image_url = file_url
        event.save(update_fields=["cover_image_url"])
    return Response(api_response(data={"cover_image_url": event.cover_image_url}).data)

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def organizer_event_cancel(request, event_id):
    from apps.events.models import Event
    user = request.user
    lookup = {} if user.role in ("SUPER_ADMIN", "ADMIN") else {"organizer__user": user}
    try:
        event = Event.objects.get(id=event_id, **lookup)
    except Event.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Event not found.", "meta": None}, status=404)
    event.status = "CANCELLED"
    event.cancel_reason = request.data.get("reason", "")
    event.save(update_fields=["status", "cancel_reason"])
    try:
        from apps.notifications.tasks import send_cancellation_notifications
        send_cancellation_notifications.delay(str(event.id))
    except Exception:
        pass
    return Response(api_response(data={"status": "CANCELLED"}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def organizer_event_postpone(request, event_id):
    from apps.events.models import Event
    user = request.user
    lookup = {} if user.role in ("SUPER_ADMIN", "ADMIN") else {"organizer__user": user}
    try:
        event = Event.objects.get(id=event_id, **lookup)
    except Event.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Event not found.", "meta": None}, status=404)
    event.status = "POSTPONED"
    event.postponed_to = request.data.get("postponed_to")
    event.postpone_note = request.data.get("reason", "")
    event.save(update_fields=["status", "postponed_to", "postpone_note"])
    return Response(api_response(data={"status": "POSTPONED"}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def organizer_event_duplicate(request, event_id):
    from apps.events.models import Event
    user = request.user
    lookup = {} if user.role in ("SUPER_ADMIN", "ADMIN") else {"organizer__user": user}
    try:
        original = Event.objects.get(id=event_id, **lookup)
    except Event.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Event not found.", "meta": None}, status=404)
    tiers = list(original.ticket_tiers.all())
    original.pk = None
    original.id = _uuid.uuid4()
    original.slug = f"{original.slug}-copy"
    original.status = "DRAFT"
    original.published_at = None
    original.view_count = 0
    original.share_count = 0
    original.save()
    for tier in tiers:
        tier.pk = None
        tier.id = _uuid.uuid4()
        tier.event = original
        tier.sold = 0
        tier.reserved = 0
        tier.save()
    return Response(api_response(data={"id": str(original.id), "slug": original.slug}).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def organizer_event_publish(request, event_id):
    from apps.events.models import Event
    from django.utils import timezone
    user = request.user
    lookup = {} if user.role in ("SUPER_ADMIN", "ADMIN") else {"organizer__user": user}
    try:
        event = Event.objects.get(id=event_id, **lookup)
    except Event.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Event not found.", "meta": None}, status=404)
    event.status = "PUBLISHED"
    event.published_at = timezone.now()
    event.publish_at = None
    event.save(update_fields=["status", "published_at", "publish_at"])
    return Response(api_response(data={"status": "PUBLISHED"}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def event_attendees_message(request, event_id):
    from apps.events.models import Event
    from apps.tickets.models import Ticket
    from apps.notifications.tasks import _send_email, send_sms
    
    user = request.user
    lookup = {} if user.role in ("SUPER_ADMIN", "ADMIN") else {"organizer__user": user}
    try:
        event = Event.objects.get(id=event_id, **lookup)
    except Event.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Event not found.", "meta": None}, status=404)
        
    channel = request.data.get("channel", "EMAIL")
    subject = request.data.get("subject", "")
    body = request.data.get("body", "")
    send_to_all = request.data.get("send_to_all", True)
    attendee_ids = request.data.get("attendee_ids", [])
    
    if not body:
        return Response({"success": False, "data": None, "error": "Message body is required.", "meta": None}, status=400)
        
    if channel == "EMAIL" and not subject:
        return Response({"success": False, "data": None, "error": "Subject is required for email.", "meta": None}, status=400)
        
    tickets_qs = Ticket.objects.filter(order__event=event)
    
    if not send_to_all and attendee_ids:
        tickets_qs = tickets_qs.filter(id__in=attendee_ids)
        
    count = 0
    for ticket in tickets_qs:
        if channel == "EMAIL":
            email = ticket.holder_email or (ticket.order.buyer_email if ticket.order else None)
            if email:
                _send_email(email, subject, body)
                count += 1
        elif channel == "SMS":
            phone = ticket.holder_phone or (ticket.order.buyer_phone if ticket.order else None)
            if phone:
                send_sms.apply_async(args=[phone, body])
                count += 1
                
    return Response(api_response(data={"sent_count": count}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def event_attendees_comp(request, event_id):
    from apps.events.models import Event, TicketTier
    from apps.orders.models import Order, OrderItem
    from core.utils import generate_order_number
    from apps.tickets.tasks import issue_tickets_for_order
    from django.db import transaction
    
    user = request.user
    lookup = {} if user.role in ("SUPER_ADMIN", "ADMIN") else {"organizer__user": user}
    try:
        event = Event.objects.get(id=event_id, **lookup)
    except Event.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Event not found.", "meta": None}, status=404)
        
    data = request.data
    tier_id = data.get("tier_id")
    if not tier_id:
        return Response({"success": False, "error": "Tier ID is required"}, status=400)
        
    try:
        with transaction.atomic():
            tier = TicketTier.objects.select_for_update().get(id=tier_id, event=event)
            tier.reserved += 1
            tier.save(update_fields=["reserved"])
            
            order = Order.objects.create(
                event=event,
                order_number=generate_order_number(),
                status="CONFIRMED",
                buyer_first_name=data.get("first_name", ""),
                buyer_last_name=data.get("last_name", ""),
                buyer_email=data.get("email", ""),
                buyer_phone=data.get("phone", ""),
                notes=data.get("notes", "") + "\n[COMPLIMENTARY]",
                total=0,
                subtotal=0,
            )
            OrderItem.objects.create(
                order=order,
                tier=tier,
                quantity=1,
                unit_price=0,
                subtotal=0
            )
            
        issue_tickets_for_order.delay(str(order.id))
        return Response(api_response(data={"success": True}).data)
    except Exception as e:
        return Response({"success": False, "error": str(e)}, status=400)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def event_attendees_import(request, event_id):
    from apps.events.models import Event, TicketTier
    from apps.orders.models import Order, OrderItem
    from core.utils import generate_order_number
    from apps.tickets.tasks import issue_tickets_for_order
    from django.db import transaction
    import csv
    import codecs
    import io
    
    user = request.user
    lookup = {} if user.role in ("SUPER_ADMIN", "ADMIN") else {"organizer__user": user}
    try:
        event = Event.objects.get(id=event_id, **lookup)
    except Event.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Event not found.", "meta": None}, status=404)
        
    file = request.FILES.get("file")
    tier_id = request.data.get("tier_id")
    
    if not file or not tier_id:
        return Response({"success": False, "error": "File and tier_id are required"}, status=400)
        
    imported = 0
    errors = []
    
    try:
        content = file.read().decode('utf-8-sig')
        try:
            dialect = csv.Sniffer().sniff(content[:2048], delimiters=";,|\t")
        except Exception:
            dialect = csv.excel
            
        reader = csv.DictReader(io.StringIO(content), dialect=dialect)
        for row in reader:
            try:
                norm_row = {k.strip().lower().replace(' ', '_'): v for k, v in row.items() if k}
                
                fname = norm_row.get("first_name", norm_row.get("firstname", norm_row.get("name", ""))).strip()
                lname = norm_row.get("last_name", norm_row.get("lastname", "")).strip()
                email = norm_row.get("email", norm_row.get("email_address", "")).strip()
                phone = norm_row.get("phone", norm_row.get("phone_number", norm_row.get("contact", ""))).strip()
                
                if not email and not phone:
                    errors.append(f"Row {imported + len(errors) + 1}: Missing email and phone")
                    continue
                    
                with transaction.atomic():
                    tier = TicketTier.objects.select_for_update().get(id=tier_id, event=event)
                    tier.reserved += 1
                    tier.save(update_fields=["reserved"])
                    
                    order = Order.objects.create(
                        event=event,
                        order_number=generate_order_number(),
                        status="CONFIRMED",
                        buyer_first_name=fname,
                        buyer_last_name=lname,
                        buyer_email=email,
                        buyer_phone=phone,
                        notes="[IMPORTED CSV]",
                        total=0,
                        subtotal=0,
                    )
                    OrderItem.objects.create(order=order, tier=tier, quantity=1, unit_price=0, subtotal=0)
                    
                issue_tickets_for_order.delay(str(order.id))
                imported += 1
            except Exception as e:
                errors.append(f"Row {imported + len(errors) + 1}: {str(e)}")
    except Exception as e:
        return Response({"success": False, "error": f"Invalid CSV: {str(e)}"}, status=400)
        
    return Response(api_response(data={"imported": imported, "errors": errors}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsApprovedOrganizer])
def organizer_event_regenerate_access_code(request, event_id):
    from apps.events.models import Event
    import secrets
    import string
    
    user = request.user
    lookup = {} if user.role in ("SUPER_ADMIN", "ADMIN") else {"organizer__user": user}
    try:
        event = Event.objects.get(id=event_id, **lookup)
    except Event.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Event not found.", "meta": None}, status=404)
        
    chars = string.ascii_uppercase + string.digits
    while True:
        code = ''.join(secrets.choice(chars) for _ in range(8))
        if not Event.objects.filter(checkin_access_code=code).exists():
            break
            
    event.checkin_access_code = code
    event.save(update_fields=["checkin_access_code"])
    return Response(api_response(data={"checkin_access_code": code}).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsApprovedOrganizer])
def organizer_event_checkin_staff(request, event_id):
    from apps.events.models import Event, CheckinStaff
    
    user = request.user
    lookup = {} if user.role in ("SUPER_ADMIN", "ADMIN") else {"organizer__user": user}
    try:
        event = Event.objects.get(id=event_id, **lookup)
    except Event.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Event not found.", "meta": None}, status=404)
        
    if request.method == "GET":
        staff = CheckinStaff.objects.filter(event=event).order_by("-created_at")
        data = [{"id": str(s.id), "name": s.name, "email": s.email, "last_active": s.last_active} for s in staff]
        return Response(api_response(data=data).data)
        
    email = request.data.get("email")
    if not email:
        return Response({"success": False, "error": "Email is required"}, status=400)
        
    if CheckinStaff.objects.filter(event=event, email=email).exists():
        return Response({"success": False, "error": "Staff already added"}, status=400)
        
    staff = CheckinStaff.objects.create(event=event, email=email, name=email.split("@")[0])
    
    from apps.users.models import User
    from apps.notifications.tasks import send_gate_staff_invite, send_gate_staff_assignment
    
    try:
        user = User.objects.get(email=email)
        # User exists, just send assignment email
        send_gate_staff_assignment.apply_async(args=[email, event.title])
    except User.DoesNotExist:
        # User does not exist, auto-provision account
        raw_password = User.objects.make_random_password(length=12)
        User.objects.create_user(
            email=email,
            password=raw_password,
            first_name=staff.name,
            role="GATE_STAFF",
            status="ACTIVE",
            email_verified=True,
        )
        send_gate_staff_invite.apply_async(args=[email, event.title, raw_password])
        
    return Response(api_response(data={"id": str(staff.id), "name": staff.name, "email": staff.email}).data)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated, IsApprovedOrganizer])
def organizer_event_checkin_staff_delete(request, event_id, staff_id):
    from apps.events.models import Event, CheckinStaff
    
    user = request.user
    lookup = {} if user.role in ("SUPER_ADMIN", "ADMIN") else {"organizer__user": user}
    try:
        event = Event.objects.get(id=event_id, **lookup)
    except Event.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Event not found.", "meta": None}, status=404)
        
    try:
        staff = CheckinStaff.objects.get(id=staff_id, event=event)
        staff.delete()
        return Response(api_response(data={"deleted": True}).data)
    except CheckinStaff.DoesNotExist:
        return Response({"success": False, "error": "Staff not found"}, status=404)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def organizer_event_checkin_stats(request, event_id):
    from apps.events.models import Event
    from apps.tickets.models import Ticket
    
    user = request.user
    lookup = {} if user.role in ("SUPER_ADMIN", "ADMIN") else {"organizer__user": user}
    try:
        event = Event.objects.get(id=event_id, **lookup)
    except Event.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Event not found.", "meta": None}, status=404)
        
    tickets = Ticket.objects.filter(order__event=event)
    total = tickets.count()
    checked_in = tickets.filter(checked_in_at__isnull=False).count()
    
    tiers_data = []
    for tier in event.ticket_tiers.all():
        t_total = tickets.filter(tier=tier).count()
        t_in = tickets.filter(tier=tier, checked_in_at__isnull=False).count()
        tiers_data.append({"name": tier.name, "total": t_total, "checked_in": t_in})
        
    data = {
        "total": total,
        "checked_in": checked_in,
        "remaining": total - checked_in,
        "fill_pct": round((checked_in / total * 100) if total > 0 else 0, 1),
        "by_tier": tiers_data
    }
    return Response(api_response(data=data).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def organizer_event_checkin_scans(request, event_id):
    from apps.events.models import Event
    from apps.checkin.models import ScanLog, CheckInSession
    
    user = request.user
    lookup = {} if user.role in ("SUPER_ADMIN", "ADMIN") else {"organizer__user": user}
    try:
        event = Event.objects.get(id=event_id, **lookup)
    except Event.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Event not found.", "meta": None}, status=404)
        
    sessions = CheckInSession.objects.filter(event=event)
    scans = ScanLog.objects.filter(session__in=sessions).select_related("ticket", "ticket__tier", "scanned_by").order_by("-scanned_at")[:50]
    
    data = []
    for s in scans:
        status_map = {
            "VALID": "SUCCESS",
            "INVALID": "INVALID",
            "ALREADY_USED": "ALREADY_USED"
        }
        status = status_map.get(s.result, "INVALID")
        
        data.append({
            "id": str(s.id),
            "ticket_number": s.ticket.ticket_number if s.ticket else "Unknown",
            "attendee_name": s.ticket.holder_name if s.ticket else "Unknown",
            "tier_name": s.ticket.tier.name if s.ticket and s.ticket.tier else "",
            "scanned_at": s.scanned_at,
            "status": status,
            "scanned_by": s.scanned_by.get_full_name() if s.scanned_by else "Staff"
        })
        
    return Response(api_response(data=data).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def organizer_event_schedule_publish(request, event_id):
    from apps.events.models import Event
    user = request.user
    lookup = {} if user.role in ("SUPER_ADMIN", "ADMIN") else {"organizer__user": user}
    try:
        event = Event.objects.get(id=event_id, **lookup)
    except Event.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Event not found.", "meta": None}, status=404)
    publish_at = request.data.get("publish_at")
    event.publish_at = publish_at
    event.save(update_fields=["publish_at"])
    return Response(api_response(data={"publish_at": publish_at}).data)


# ── Public organizer endpoints ────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_following(request):
    """List organizers the current user follows."""
    follows = OrganizerFollower.objects.filter(user=request.user).select_related("organizer")
    results = []
    for f in follows:
        org = f.organizer
        results.append({
            "id": str(org.id),
            "name": org.display_name or org.name,
            "slug": org.slug,
            "logo": org.logo_url,
            "tagline": org.bio[:80] if org.bio else "",
            "follower_count": org.followers.count(),
            "event_count": org.events.count(),
            "is_verified": org.is_verified,
        })
    return Response(api_response(data={"results": results, "count": len(results)}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def toggle_follow(request, organizer_id):
    """Toggle follow/unfollow for an organizer (by id or slug)."""
    try:
        try:
            _uuid.UUID(str(organizer_id))
            org = Organizer.objects.get(id=organizer_id)
        except (ValueError, Organizer.DoesNotExist):
            org = Organizer.objects.get(slug=organizer_id)
    except Organizer.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Organizer not found.", "meta": None}, status=404)
    obj, created = OrganizerFollower.objects.get_or_create(organizer=org, user=request.user)
    if not created:
        obj.delete()
        return Response(api_response(data={"following": False}).data)
    return Response(api_response(data={"following": True}).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def public_organizer_profile(request, organizer_slug):
    """Public organizer profile page."""
    try:
        org = Organizer.objects.get(slug=organizer_slug)
    except Organizer.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)
    is_following = False
    if request.user.is_authenticated:
        is_following = OrganizerFollower.objects.filter(organizer=org, user=request.user).exists()
    from apps.events.models import Event
    from apps.events.serializers import EventListSerializer
    events = Event.objects.filter(organizer=org, status="PUBLISHED", is_public=True).select_related(
        "organizer", "category"
    ).prefetch_related("ticket_tiers").order_by("starts_at")
    return Response(api_response(data={
        "id": str(org.id),
        "name": org.display_name or org.name,
        "slug": org.slug,
        "logo": org.logo_url,
        "banner": org.banner_url,
        "bio": org.bio,
        "website": org.website_url,
        "social": {
            "facebook": org.facebook_url, "twitter": org.twitter_url,
            "instagram": org.instagram_url, "youtube": org.youtube_url,
        },
        "is_verified": org.is_verified,
        "follower_count": org.followers.count(),
        "event_count": events.count(),
        "is_following": is_following,
        "events": EventListSerializer(events[:12], many=True).data,
    }).data)


# --- Communications Endpoints ---

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def announcements_list(request):
    try:
        org = request.user.organizer_profile
    except Exception:
        return Response({"success": False, "data": None, "error": "Not an organizer."}, status=403)
        
    if request.method == "GET":
        qs = Announcement.objects.filter(organizer=org).order_by("-sent_at")
        results = []
        for a in qs:
            results.append({
                "id": str(a.id),
                "subject": a.subject,
                "body": a.body,
                "channels": a.channels,
                "event_id": str(a.event_id) if a.event_id else None,
                "event_title": a.event.name if a.event else None,
                "sent_at": a.sent_at,
                "recipient_count": a.recipient_count,
            })
        return Response(api_response(data={"results": results}).data)
        
    # POST
    data = request.data
    subject = data.get("subject", "")
    body = data.get("body", "")
    channels = data.get("channels", ["EMAIL"])
    event_id = data.get("event_id")
    
    event = None
    if event_id:
        from apps.events.models import Event
        try:
            event = Event.objects.get(id=event_id, organizer=org)
        except Event.DoesNotExist:
            return Response({"success": False, "error": "Event not found"}, status=400)
            
    # Calculate recipient count based on tickets
    from apps.tickets.models import Ticket
    if event:
        recipient_count = Ticket.objects.filter(order__event=event, status='ACTIVE').count()
    else:
        recipient_count = Ticket.objects.filter(order__event__organizer=org, status='ACTIVE').count()
        
    a = Announcement.objects.create(
        organizer=org,
        subject=subject,
        body=body,
        channels=channels,
        event=event,
        recipient_count=recipient_count
    )
    
    # Trigger Celery Task
    from apps.notifications.tasks import dispatch_announcement
    dispatch_announcement.delay(str(a.id))
    
    return Response(api_response(data={"success": True}).data)

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def automations_list(request):
    try:
        org = request.user.organizer_profile
    except Exception:
        return Response({"success": False, "data": None, "error": "Not an organizer."}, status=403)
        
    if request.method == "GET":
        qs = Automation.objects.filter(organizer=org).order_by("-created_at")
        results = []
        for a in qs:
            results.append({
                "id": str(a.id),
                "trigger": a.trigger,
                "trigger_label": a.trigger_label,
                "channel": a.channel,
                "subject": a.subject,
                "body": a.body,
                "offset_hours": a.offset_hours,
                "is_active": a.is_active,
            })
        return Response(api_response(data={"results": results}).data)
        
    # POST
    data = request.data
    trigger = data.get("trigger")
    
    TRIGGERS = {
      "PRE_EVENT_24H": "24h before event",
      "PRE_EVENT_48H": "48h before event",
      "PRE_EVENT_1H": "1h before event",
      "POST_EVENT_1H": "1h after event ends",
      "POST_EVENT_24H": "24h after event ends",
      "TICKET_PURCHASE": "After ticket purchase",
      "CHECK_IN": "After check-in",
    }
    trigger_label = TRIGGERS.get(trigger, trigger)
    
    a = Automation.objects.create(
        organizer=org,
        trigger=trigger,
        trigger_label=trigger_label,
        channel=data.get("channel", "EMAIL"),
        subject=data.get("subject", ""),
        body=data.get("body", ""),
        offset_hours=int(data.get("offset_hours", 0)),
        is_active=data.get("is_active", True)
    )
    return Response(api_response(data={"success": True}).data)

@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def automations_detail(request, pk):
    try:
        org = request.user.organizer_profile
        a = Automation.objects.get(id=pk, organizer=org)
    except Exception:
        return Response({"success": False, "error": "Not found"}, status=404)
        
    data = request.data
    if "is_active" in data:
        a.is_active = data["is_active"]
    if "subject" in data:
        a.subject = data["subject"]
    if "body" in data:
        a.body = data["body"]
    if "channel" in data:
        a.channel = data["channel"]
    if "trigger" in data:
        a.trigger = data["trigger"]
    if "offset_hours" in data:
        a.offset_hours = data["offset_hours"]
    a.save()
    return Response(api_response(data={"success": True}).data)

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def templates_list(request):
    try:
        org = request.user.organizer_profile
    except Exception:
        return Response({"success": False, "data": None, "error": "Not an organizer."}, status=403)
        
    if request.method == "GET":
        qs = OrganizerTemplate.objects.filter(organizer=org).order_by("-updated_at")
        results = []
        for t in qs:
            results.append({
                "id": str(t.id),
                "name": t.name,
                "subject": t.subject,
                "body": t.body,
                "channel": t.channel,
                "updated_at": t.updated_at,
            })
        return Response(api_response(data={"results": results}).data)
        
    # POST
    data = request.data
    t = OrganizerTemplate.objects.create(
        organizer=org,
        name=data.get("name"),
        subject=data.get("subject", ""),
        body=data.get("body"),
        channel=data.get("channel", "EMAIL")
    )
    return Response(api_response(data={"success": True}).data)

@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def templates_detail(request, pk):
    try:
        org = request.user.organizer_profile
        t = OrganizerTemplate.objects.get(id=pk, organizer=org)
    except Exception:
        return Response({"success": False, "error": "Not found"}, status=404)
        
    if request.method == "DELETE":
        t.delete()
        return Response(api_response(data={"success": True}).data)
        
    data = request.data
    if "name" in data:
        t.name = data["name"]
    if "subject" in data:
        t.subject = data["subject"]
    if "body" in data:
        t.body = data["body"]
    if "channel" in data:
        t.channel = data["channel"]
    t.save()
    return Response(api_response(data={"success": True}).data)

# --- Revenue Endpoints ---

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def revenue_summary(request):
    try:
        org = request.user.organizer_profile
    except Exception:
        return Response({"success": False, "error": "Not an organizer."}, status=403)
        
    from apps.events.models import Event
    from apps.payments.models import TicketTransaction, OrganizerPayout
    from apps.refunds.models import Refund
    from django.db.models import Sum
    from decimal import Decimal

    events = Event.objects.filter(organizer=org).order_by("-starts_at")
    
    total_gross = Decimal("0.00")
    total_fees = Decimal("0.00")
    total_refunds = Decimal("0.00")
    total_net = Decimal("0.00")
    
    ledger = []
    
    # Calculate global payouts to derive status per event
    paid_payouts = OrganizerPayout.objects.filter(organizer=org, status='completed').aggregate(Sum('amount'))['amount__sum'] or Decimal("0.00")
    pending_payouts = OrganizerPayout.objects.filter(organizer=org, status__in=['pending', 'processing']).aggregate(Sum('amount'))['amount__sum'] or Decimal("0.00")
    
    running_payout_pool = paid_payouts
    
    for event in events:
        txs = TicketTransaction.objects.filter(order__event=event, payment_status__in=['confirmed', 'refunded'])
        
        gross = txs.aggregate(Sum('gross_amount'))['gross_amount__sum'] or Decimal("0.00")
        fees = txs.aggregate(Sum('platform_fee_amount'))['platform_fee_amount__sum'] or Decimal("0.00")
        
        event_refunds = Refund.objects.filter(order__event=event, status='PROCESSED').aggregate(Sum('amount'))['amount__sum'] or Decimal("0.00")
        
        net = gross - fees - event_refunds
        if net < Decimal("0.00"):
            net = Decimal("0.00")
            
        total_gross += gross
        total_fees += fees
        total_refunds += event_refunds
        total_net += net
        
        # Determine status
        status = "PENDING"
        if running_payout_pool >= net and net > 0:
            status = "PAID"
            running_payout_pool -= net
        elif pending_payouts > 0 and net > 0:
            status = "PROCESSING"
            
        if gross > 0 or event_refunds > 0:
            ledger.append({
                "event_id": str(event.id),
                "event_title": event.title,
                "event_date": event.starts_at.isoformat(),
                "gross": str(gross),
                "platform_fee": str(fees),
                "refunds": str(event_refunds),
                "net": str(net),
                "payable": str(net),
                "status": status,
            })
            
    fee_config = {
        "default_flat_fee": float(org.custom_fee_flat or 0),
        "default_pct_fee": float(org.custom_fee_percent or 0),
        "fee_absorbed_by": org.fee_absorbed_by.upper(),
    }
    
    # Check if there are overrides
    fee_overrides = []
    for event in events:
        if event.custom_fee_flat is not None or event.custom_fee_percent is not None:
            fee_overrides.append({
                "event_id": str(event.id),
                "event_title": event.title,
                "flat_fee": float(event.custom_fee_flat or 0),
                "pct_fee": float(event.custom_fee_percent or 0),
                "absorbed_by": event.fee_absorbed_by.upper(),
            })
            
    total_payable = total_net - paid_payouts - pending_payouts
    if total_payable < Decimal("0.00"):
        total_payable = Decimal("0.00")

    return Response(api_response(data={
        "total_gross": str(total_gross),
        "total_fees": str(total_fees),
        "total_refunds": str(total_refunds),
        "total_net": str(total_net),
        "total_payable": str(total_payable),
        "ledger": ledger,
        "fee_config": fee_config,
        "fee_overrides": fee_overrides,
    }).data)

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def fee_config_update(request):
    try:
        org = request.user.organizer_profile
    except Exception:
        return Response({"success": False, "error": "Not an organizer."}, status=403)
        
    data = request.data
    if "default_flat_fee" in data:
        org.custom_fee_flat = data["default_flat_fee"]
    if "default_pct_fee" in data:
        org.custom_fee_percent = data["default_pct_fee"]
    if "fee_absorbed_by" in data:
        org.fee_absorbed_by = data["fee_absorbed_by"].lower()
        
    org.save(update_fields=["custom_fee_flat", "custom_fee_percent", "fee_absorbed_by"])
    
    return Response(api_response(data={"success": True}).data)
