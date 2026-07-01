from decimal import Decimal
from datetime import timedelta
from django.core.cache import caches
from django.db import connection
from django.db.models import Sum, Count
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from core.exceptions import api_response
from core.permissions import IsAdminOrSuperAdmin
from core.pagination import StandardPagination
from .models import PlatformConfig, AuditLog


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def admin_dashboard(request):
    from apps.users.models import User
    from apps.organizers.models import Organizer
    from apps.events.models import Event
    from apps.orders.models import Order
    from apps.payouts.models import Payout
    from apps.refunds.models import Refund

    total_users = User.objects.count()
    total_organizers = Organizer.objects.count()
    total_events = Event.objects.count()
    today = timezone.now().date()
    week_start = today - timedelta(days=6)
    month_start = today - timedelta(days=29)

    gmv = Order.objects.filter(status="CONFIRMED").aggregate(s=Sum("total"))["s"] or Decimal("0")
    platform_fees = Order.objects.filter(status="CONFIRMED").aggregate(s=Sum("platform_fee"))["s"] or Decimal("0")

    def totals_for_range(start_date, end_date):
        values = Order.objects.filter(status="CONFIRMED", confirmed_at__date__range=(start_date, end_date)).aggregate(
            revenue=Sum("total"), fees=Sum("platform_fee"),
        )
        return {
            "revenue": str(values["revenue"] or Decimal("0")),
            "fees": str(values["fees"] or Decimal("0")),
        }

    revenue = {
        "today": totals_for_range(today, today)["revenue"],
        "week": totals_for_range(week_start, today)["revenue"],
        "month": totals_for_range(month_start, today)["revenue"],
        "all_time": str(gmv),
    }
    fees = {
        "today": totals_for_range(today, today)["fees"],
        "week": totals_for_range(week_start, today)["fees"],
        "month": totals_for_range(month_start, today)["fees"],
        "all_time": str(platform_fees),
    }

    active_today = Event.objects.filter(status="PUBLISHED", starts_at__date=today).count()
    pending_payouts = Payout.objects.filter(status="PENDING").count()
    pending_kyc = Organizer.objects.filter(kyc_status="PENDING_REVIEW").count()

    return Response(api_response(data={
        "total_users": total_users,
        "total_organizers": total_organizers,
        "total_events": total_events,
        "gmv": str(gmv),
        "platform_fees": str(platform_fees),
        "revenue": revenue,
        "fees": fees,
        "active_events_today": active_today,
        "pending_payouts": pending_payouts,
        "pending_kyc": pending_kyc,
    }).data)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def admin_revenue_chart(request):
    from apps.orders.models import Order

    range_opt = request.query_params.get("range", "week")
    today = timezone.now().date()
    if range_opt == "today":
        start = today
    elif range_opt == "week":
        start = today - timedelta(days=6)
    elif range_opt == "month":
        start = today - timedelta(days=29)
    else:
        start = today - timedelta(days=89)

    series = (
        Order.objects
        .filter(status="CONFIRMED", confirmed_at__date__range=(start, today))
        .annotate(day=TruncDate("confirmed_at"))
        .values("day")
        .annotate(
            gmv=Coalesce(Sum("total"), Decimal("0")),
            fees=Coalesce(Sum("platform_fee"), Decimal("0")),
        )
        .order_by("day")
    )

    data = {str(row["day"]): row for row in series}
    current = start
    results = []
    while current <= today:
        row = data.get(str(current))
        results.append({
            "date": str(current),
            "gmv": float(row["gmv"]) if row else 0,
            "fees": float(row["fees"]) if row else 0,
        })
        current += timedelta(days=1)

    return Response(api_response(data=results).data)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def admin_active_events(request):
    from apps.events.models import Event
    from apps.tickets.models import Ticket

    now = timezone.now()
    events = Event.objects.filter(
        status="PUBLISHED",
        starts_at__lte=now,
        ends_at__gte=now,
    ).order_by("starts_at")[:12]

    data = []
    for ev in events:
        checked_in = Ticket.objects.filter(order__event=ev, checked_in_at__isnull=False).count()
        data.append({
            "id": str(ev.id),
            "title": ev.title,
            "organizer": ev.organizer.display_name or ev.organizer.name,
            "venue_city": ev.venue_city or "",
            "starts_at": ev.starts_at.isoformat(),
            "checked_in": checked_in,
            "capacity": ev.venue_capacity or 0,
        })

    return Response(api_response(data={"results": data}).data)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def admin_health(request):
    services = []
    # Database health
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        services.append({"name": "Database", "status": "ok", "latency_ms": 0})
    except Exception:
        services.append({"name": "Database", "status": "down"})

    # Cache / Redis health
    try:
        cache = caches["default"]
        cache.set("health_check", "ok", 5)
        if cache.get("health_check") == "ok":
            services.append({"name": "Cache", "status": "ok", "latency_ms": 0})
        else:
            services.append({"name": "Cache", "status": "degraded"})
    except Exception:
        services.append({"name": "Cache", "status": "down"})

    # Basic app status
    services.append({"name": "API", "status": "ok"})

    return Response(api_response(data=services).data)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def list_users(request):
    from apps.users.models import User
    from .serializers import AdminUserListSerializer
    from django.db.models import Sum, Count, Q
    from django.db.models.functions import Coalesce
    from decimal import Decimal

    qs = User.objects.annotate(
        total_spent=Coalesce(Sum("orders__total", filter=Q(orders__status="CONFIRMED")), Decimal("0")),
        total_events=Count("organizer_profile__events", distinct=True),
        total_orders=Count("orders", filter=Q(orders__status="CONFIRMED"), distinct=True)
    ).order_by("-created_at")

    role = request.query_params.get("role")
    if role: qs = qs.filter(role=role)
    search = request.query_params.get("search")
    if search:
        qs = qs.filter(Q(email__icontains=search) | Q(first_name__icontains=search) | Q(phone__icontains=search))
        
    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    return paginator.get_paginated_response(AdminUserListSerializer(page, many=True).data)


@api_view(["POST"])
@permission_classes([IsAdminOrSuperAdmin])
def create_user(request):
    from apps.users.serializers import RegisterSerializer
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        return Response(api_response(data={"id": str(user.id)}).data)
    return Response({"success": False, "error": str(serializer.errors), "data": None, "meta": None}, status=400)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAdminOrSuperAdmin])
def admin_user_detail_crud(request, user_id):
    from apps.users.models import User
    from .serializers import AdminUserDetailSerializer
    from django.db.models import Sum, Count, Q
    from django.db.models.functions import Coalesce
    from decimal import Decimal
    
    try:
        user = User.objects.annotate(
            total_spent=Coalesce(Sum("orders__total", filter=Q(orders__status="CONFIRMED")), Decimal("0")),
            total_events=Count("organizer_profile__events", distinct=True),
            total_orders=Count("orders", filter=Q(orders__status="CONFIRMED"), distinct=True)
        ).get(id=user_id)
    except User.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)

    if request.method == "GET":
        return Response(api_response(data=AdminUserDetailSerializer(user).data).data)
    elif request.method == "PATCH":
        from .serializers import AdminUserListSerializer
        for key, value in request.data.items():
            if hasattr(user, key):
                setattr(user, key, value)
        user.save()
        return Response(api_response(data=AdminUserListSerializer(user).data).data)
    elif request.method == "DELETE":
        user.delete()
        return Response(api_response(data={"deleted": True}).data)


@api_view(["POST"])
@permission_classes([IsAdminOrSuperAdmin])
def admin_user_action(request, user_id, action):
    from apps.users.models import User
    from rest_framework_simplejwt.tokens import RefreshToken
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)

    if action == "suspend":
        user.status = "SUSPENDED"
        user.save(update_fields=["status"])
        return Response(api_response(data={"status": "SUSPENDED"}).data)
    elif action == "ban":
        user.status = "BANNED"
        user.save(update_fields=["status"])
        return Response(api_response(data={"status": "BANNED"}).data)
    elif action == "reinstate":
        user.status = "ACTIVE"
        user.save(update_fields=["status"])
        return Response(api_response(data={"status": "ACTIVE"}).data)
    elif action == "verify-email":
        user.email_verified = True
        user.save(update_fields=["email_verified"])
        return Response(api_response(data={"is_email_verified": True}).data)
    elif action == "change-role":
        new_role = request.data.get("role")
        if new_role not in [c[0] for c in User.Role.choices]:
            return Response({"success": False, "data": None, "error": "Invalid role.", "meta": None}, status=400)
        
        user.role = new_role
        user.save(update_fields=["role"])

        if new_role == "ORGANIZER" and not hasattr(user, "organizer_profile"):
            from apps.organizers.models import Organizer
            import uuid
            Organizer.objects.create(
                user=user,
                name=f"{user.first_name} Events" if user.first_name else f"Organizer {str(user.id)[:8]}",
                slug=str(uuid.uuid4())[:8],
                status="APPROVED"
            )

        return Response(api_response(data={"role": new_role}).data)
    elif action == "impersonate":
        refresh = RefreshToken.for_user(user)
        return Response(api_response(data={"token": str(refresh.access_token)}).data)

    return Response({"success": False, "data": None, "error": "Invalid action", "meta": None}, status=400)


@api_view(["PATCH"])
@permission_classes([IsAdminOrSuperAdmin])
def update_user_status(request, user_id):
    from apps.users.models import User
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)
    new_status = request.data.get("status")
    user.status = new_status
    user.save(update_fields=["status"])
    AuditLog.objects.create(user=request.user, action=new_status.upper(), entity="User", entity_id=str(user_id), ip_address=request.META.get("REMOTE_ADDR", ""))
    return Response(api_response(data={"status": new_status}).data)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def list_organizers(request):
    from apps.organizers.models import Organizer
    from apps.admin_panel.serializers import AdminOrganizerListSerializer
    from django.db.models import Count, Sum, Q
    from django.db.models.functions import Coalesce
    from decimal import Decimal
    
    qs = Organizer.objects.annotate(
        total_events=Count("events", distinct=True),
        total_gross=Coalesce(Sum("events__orders__total", filter=Q(events__orders__status="CONFIRMED")), Decimal("0")),
        total_payouts=Coalesce(Sum("payouts__amount", filter=Q(payouts__status="PAID")), Decimal("0"))
    ).order_by("-created_at")
    
    s = request.query_params.get("status")
    if s: qs = qs.filter(status=s)
    kyc = request.query_params.get("kyc_status")
    if kyc: qs = qs.filter(kyc_status=kyc)
    
    search = request.query_params.get("search")
    if search:
        qs = qs.filter(Q(name__icontains=search) | Q(display_name__icontains=search) | Q(contact_email__icontains=search) | Q(user__email__icontains=search))
    
    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    return paginator.get_paginated_response(AdminOrganizerListSerializer(page, many=True).data)

@api_view(["GET", "DELETE"])
@permission_classes([IsAdminOrSuperAdmin])
def admin_organizer_detail_crud(request, org_id):
    from apps.organizers.models import Organizer
    from apps.admin_panel.serializers import AdminOrganizerDetailSerializer
    from django.db.models import Count, Sum, Q
    from django.db.models.functions import Coalesce
    from decimal import Decimal
    
    try:
        org = Organizer.objects.annotate(
            total_events=Count("events", distinct=True),
            total_gross=Coalesce(Sum("events__orders__total", filter=Q(events__orders__status="CONFIRMED")), Decimal("0")),
            total_payouts=Coalesce(Sum("payouts__amount", filter=Q(payouts__status="PAID")), Decimal("0"))
        ).get(id=org_id)
    except Organizer.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)
        
    if request.method == "GET":
        return Response(api_response(data=AdminOrganizerDetailSerializer(org).data).data)
    elif request.method == "DELETE":
        org.delete()
        return Response(api_response(data={"deleted": True}).data)

@api_view(["POST", "DELETE"])
@permission_classes([IsAdminOrSuperAdmin])
def admin_organizer_action(request, org_id, action):
    from apps.organizers.models import Organizer
    try:
        org = Organizer.objects.get(id=org_id)
    except Organizer.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)
        
    if action == "approve":
        org.status = "APPROVED"
        org.save(update_fields=["status"])
        AuditLog.objects.create(user=request.user, action="APPROVE", entity="Organizer", entity_id=str(org_id), ip_address=request.META.get("REMOTE_ADDR", ""))
        return Response(api_response(data={"status": "APPROVED"}).data)
    elif action == "reject":
        org.status = "REJECTED"
        org.save(update_fields=["status"])
        if "reason" in request.data:
            org.kyc_rejection_note = request.data["reason"]
            org.save(update_fields=["kyc_rejection_note"])
        AuditLog.objects.create(user=request.user, action="REJECT", entity="Organizer", entity_id=str(org_id), ip_address=request.META.get("REMOTE_ADDR", ""))
        return Response(api_response(data={"status": "REJECTED"}).data)
    elif action == "suspend":
        org.status = "SUSPENDED"
        org.save(update_fields=["status"])
        AuditLog.objects.create(user=request.user, action="SUSPEND", entity="Organizer", entity_id=str(org_id), ip_address=request.META.get("REMOTE_ADDR", ""))
        return Response(api_response(data={"status": "SUSPENDED"}).data)
    elif action == "approve-kyc":
        org.kyc_status = "APPROVED"
        org.is_verified = True
        org.save(update_fields=["kyc_status", "is_verified"])
        return Response(api_response(data={"kyc_status": "APPROVED"}).data)
    elif action == "reject-kyc":
        org.kyc_status = "REJECTED"
        org.is_verified = False
        org.save(update_fields=["kyc_status", "is_verified"])
        return Response(api_response(data={"kyc_status": "REJECTED"}).data)
    elif action == "set-tier":
        tier = request.data.get("tier")
        if tier in ["BASIC", "VERIFIED", "PREMIUM"]:
            org.tier = tier
            org.save(update_fields=["tier"])
            return Response(api_response(data={"tier": tier}).data)
        return Response({"success": False, "data": None, "error": "Invalid tier", "meta": None}, status=400)
    elif action == "fee-override":
        if request.method == "DELETE":
            org.custom_fee_percent = None
            org.custom_fee_flat = None
            org.save(update_fields=["custom_fee_percent", "custom_fee_flat"])
            return Response(api_response(data={"cleared": True}).data)
        
        flat = request.data.get("flat")
        pct = request.data.get("pct")
        if flat is not None: org.custom_fee_flat = flat
        if pct is not None: org.custom_fee_percent = pct
        org.save(update_fields=["custom_fee_flat", "custom_fee_percent"])
        return Response(api_response(data={"updated": True}).data)

    return Response({"success": False, "data": None, "error": "Invalid action", "meta": None}, status=400)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def list_banner_slots(request):
    from apps.admin_panel.models import HomepageSlot
    
    slots = []
    for i in range(1, 6):
        slot = HomepageSlot.objects.filter(slot_type="banner", position=i, is_active=True).first()
        slots.append({
            "slot": i,
            "event_id": str(slot.event.id) if slot and slot.event else None,
            "event_title": slot.event.title if slot and slot.event else None
        })
    return Response(api_response(data=slots).data)

@api_view(["POST"])
@permission_classes([IsAdminOrSuperAdmin])
def update_banner_slot(request, slot_id):
    from apps.admin_panel.models import HomepageSlot
    from apps.events.models import Event
    
    event_id = request.data.get("event_id")
    HomepageSlot.objects.filter(slot_type="banner", position=slot_id).delete()
    
    if event_id:
        try:
            event = Event.objects.get(id=event_id)
            HomepageSlot.objects.create(
                slot_type="banner", 
                position=slot_id, 
                event=event, 
                is_active=True,
                created_by=request.user
            )
        except Event.DoesNotExist:
            return Response({"success": False, "data": None, "error": "Event not found", "meta": None}, status=404)
            
    return Response(api_response(data={"updated": True}).data)

@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def list_all_events(request):
    from apps.events.models import Event
    from apps.admin_panel.serializers import AdminEventSerializer
    from django.db.models import Count, Sum, Q, Exists, OuterRef
    from django.db.models.functions import Coalesce
    from apps.admin_panel.models import HomepageSlot
    from decimal import Decimal
    
    qs = Event.objects.annotate(
        tickets_sold=Count("ticket_tiers__sold"), # Alternatively use orders
        gross=Coalesce(Sum("orders__total", filter=Q(orders__status="CONFIRMED")), Decimal("0")),
        is_homepage_banner=Exists(HomepageSlot.objects.filter(event=OuterRef("pk"), slot_type="banner", is_active=True))
    ).order_by("-created_at")
    
    s = request.query_params.get("status")
    if s: qs = qs.filter(status=s)
    
    search = request.query_params.get("search")
    if search:
        qs = qs.filter(Q(title__icontains=search) | Q(organizer__name__icontains=search) | Q(venue_city__icontains=search))
        
    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    return paginator.get_paginated_response(AdminEventSerializer(page, many=True).data)

@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def admin_event_detail(request, event_id):
    from apps.events.models import Event
    from apps.admin_panel.serializers import AdminEventSerializer
    from django.db.models import Count, Sum, Q, Exists, OuterRef
    from django.db.models.functions import Coalesce
    from apps.admin_panel.models import HomepageSlot
    from decimal import Decimal
    
    try:
        ev = Event.objects.annotate(
            tickets_sold=Count("ticket_tiers__sold"),
            gross=Coalesce(Sum("orders__total", filter=Q(orders__status="CONFIRMED")), Decimal("0")),
            is_homepage_banner=Exists(HomepageSlot.objects.filter(event=OuterRef("pk"), slot_type="banner", is_active=True))
        ).get(id=event_id)
    except Event.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)
        
    return Response(api_response(data=AdminEventSerializer(ev).data).data)

@api_view(["POST"])
@permission_classes([IsAdminOrSuperAdmin])
def admin_event_action(request, event_id, action):
    from apps.events.models import Event
    from apps.admin_panel.models import HomepageSlot
    try:
        ev = Event.objects.get(id=event_id)
    except Event.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)
        
    if action == "approve":
        ev.status = "PUBLISHED"
        ev.save(update_fields=["status"])
        AuditLog.objects.create(user=request.user, action="APPROVE", entity="Event", entity_id=str(event_id), ip_address=request.META.get("REMOTE_ADDR", ""))
        return Response(api_response(data={"status": "PUBLISHED"}).data)
    elif action == "reject":
        ev.status = "REJECTED"
        ev.save(update_fields=["status"])
        AuditLog.objects.create(user=request.user, action="REJECT", entity="Event", entity_id=str(event_id), ip_address=request.META.get("REMOTE_ADDR", ""))
        return Response(api_response(data={"status": "REJECTED"}).data)
    elif action == "unpublish":
        ev.status = "DRAFT"
        ev.save(update_fields=["status"])
        AuditLog.objects.create(user=request.user, action="UPDATE", entity="Event", entity_id=str(event_id), ip_address=request.META.get("REMOTE_ADDR", ""))
        return Response(api_response(data={"status": "DRAFT"}).data)
    elif action == "feature":
        ev.is_featured = True
        ev.save(update_fields=["is_featured"])
        return Response(api_response(data={"is_featured": True}).data)
    elif action == "unfeature":
        ev.is_featured = False
        ev.save(update_fields=["is_featured"])
        return Response(api_response(data={"is_featured": False}).data)
    elif action == "set-banner":
        # Create a homepage slot if it doesn't exist, or just clear and recreate it (there's a banner slot manager but we'll add one here)
        slot, _ = HomepageSlot.objects.get_or_create(slot_type="banner", event=ev, defaults={"position": 1, "created_by": request.user})
        slot.is_active = True
        slot.save()
        return Response(api_response(data={"is_homepage_banner": True}).data)
    elif action == "remove-banner":
        HomepageSlot.objects.filter(slot_type="banner", event=ev).delete()
        return Response(api_response(data={"is_homepage_banner": False}).data)

    return Response({"success": False, "data": None, "error": "Invalid action", "meta": None}, status=400)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def list_payouts(request):
    from apps.payouts.models import Payout
    qs = Payout.objects.select_related("organizer").prefetch_related("events").order_by("-created_at")
    s = request.query_params.get("status")
    if s: qs = qs.filter(status=s)
    
    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    data = []
    for p in page:
        events = [e.title for e in p.events.all()]
        data.append({
            "id": str(p.id),
            "organizer_name": p.organizer.name,
            "organizer_id": str(p.organizer.id),
            "amount": str(p.amount),
            "net_amount": str(p.net_amount),
            "deduction_amount": str(p.deduction_amount),
            "deduction_reason": p.deduction_reason,
            "method": p.method,
            "status": p.status,
            "created_at": p.created_at,
            "event_titles": events,
            "mpesa_phone": p.organizer.mpesa_phone if p.method == "MPESA" else p.mpesa_phone,
            "bank_name": p.organizer.bank_name if p.method == "BANK_TRANSFER" else p.bank_name,
            "bank_account_name": p.organizer.bank_account_name,
            "bank_account_number": p.organizer.bank_account_number if p.method == "BANK_TRANSFER" else p.bank_account_number,
            "bank_branch": p.organizer.bank_branch if p.method == "BANK_TRANSFER" else p.bank_branch,
        })
    return paginator.get_paginated_response(data)

@api_view(["POST"])
@permission_classes([IsAdminOrSuperAdmin])
def bulk_payout_action(request, action):
    from apps.payouts.models import Payout
    from apps.payouts.tasks import process_payout
    from decimal import Decimal
    
    ids = request.data.get("ids", [])
    note = request.data.get("note", "")
    deduction_amount = Decimal(request.data.get("deduction_amount", "0") or "0")
    deduction_reason = request.data.get("deduction_reason", "")
    qs = Payout.objects.filter(id__in=ids)
    
    if action == "bulk-approve":
        for p in qs.filter(status="PENDING"):
            p.status = "PROCESSING"
            p.approved_by = request.user
            p.approved_at = timezone.now()
            if deduction_amount > 0 and len(ids) == 1:
                p.deduction_amount = deduction_amount
                p.deduction_reason = deduction_reason
                p.net_amount = p.net_amount - deduction_amount
            p.save()
            process_payout.delay(str(p.id))
    elif action == "bulk-reject":
        qs.filter(status="PENDING").update(status="REJECTED", failure_reason=note)
    elif action == "bulk-retry":
        qs.filter(status="FAILED").update(status="PENDING")
    elif action == "bulk-hold":
        qs.filter(status="PENDING").update(status="ON_HOLD", notes=note)
    elif action == "bulk-unhold":
        qs.filter(status="ON_HOLD").update(status="PENDING")
        
    return Response(api_response(data={"updated": len(ids)}).data)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def list_disputes(request):
    from apps.refunds.models import Dispute
    qs = Dispute.objects.select_related("order__event__organizer", "raised_by").order_by("-created_at")
    s = request.query_params.get("status")
    if s: qs = qs.filter(status=s)
    
    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    data = []
    for d in page:
        data.append({
            "id": str(d.id),
            "order_number": d.order.order_number,
            "buyer_name": f"{d.raised_by.first_name} {d.raised_by.last_name}".strip() or d.raised_by.email,
            "organizer_name": d.order.event.organizer.name,
            "amount": str(d.order.total),
            "reason": d.subject,
            "status": d.status,
            "created_at": d.created_at
        })
    return paginator.get_paginated_response(data)

@api_view(["POST"])
@permission_classes([IsAdminOrSuperAdmin])
def dispute_action(request, dispute_id, action):
    from apps.refunds.models import Dispute
    try:
        d = Dispute.objects.get(id=dispute_id)
    except Dispute.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)
        
    if action == "resolve":
        d.status = "RESOLVED"
    elif action == "escalate":
        d.status = "CLOSED" 
    elif action == "refund":
        d.status = "RESOLVED"
        d.resolution = "Resolved & Refunded"
        order = d.order
        if order.status == "CONFIRMED":
            order.status = "REFUNDED"
            order.save(update_fields=["status"])
            # In a real app we'd trigger the gateway refund API and deduct from payout here
    
    d.resolution = request.data.get("note", d.resolution)
    d.resolved_by = request.user
    d.resolved_at = timezone.now()
    d.save()
    return Response(api_response(data={"status": d.status}).data)

@api_view(["GET", "POST"])
@permission_classes([IsAdminOrSuperAdmin])
def dispute_messages(request, dispute_id):
    from apps.refunds.models import Dispute, DisputeMessage
    try:
        d = Dispute.objects.get(id=dispute_id)
    except Dispute.DoesNotExist:
        return Response({"success": False, "error": "Not found"}, status=404)
        
    if request.method == "GET":
        msgs = d.messages.select_related("sender").all()
        data = []
        for m in msgs:
            data.append({
                "id": str(m.id),
                "sender": f"{m.sender.first_name} {m.sender.last_name}".strip() or m.sender.email,
                "is_admin": m.sender.role in ["ADMIN", "SUPER_ADMIN"],
                "message": m.message,
                "attachment_url": m.attachment_url,
                "created_at": m.created_at
            })
        return Response(api_response(data=data).data)
        
    # POST
    msg = request.data.get("message", "")
    attachment = request.data.get("attachment_url", "")
    m = DisputeMessage.objects.create(dispute=d, sender=request.user, message=msg, attachment_url=attachment)
    
    # If the dispute is new/open, moving it to UNDER_REVIEW automatically
    if d.status == "OPEN":
        d.status = "UNDER_REVIEW"
        d.save(update_fields=["status"])
        
    return Response(api_response(data={
        "id": str(m.id),
        "sender": f"{m.sender.first_name} {m.sender.last_name}".strip() or m.sender.email,
        "is_admin": True,
        "message": m.message,
        "attachment_url": m.attachment_url,
        "created_at": m.created_at
    }).data)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def vat_report(request):
    from apps.orders.models import Order
    from django.db.models import Sum
    from decimal import Decimal
    import datetime
    
    year_str = request.query_params.get("year", str(timezone.now().year))
    try: year = int(year_str)
    except: year = timezone.now().year
    
    qs = Order.objects.filter(status="CONFIRMED", confirmed_at__year=year)
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    results = []
    
    for month in range(1, 13):
        monthly_qs = qs.filter(confirmed_at__month=month)
        gross = monthly_qs.aggregate(s=Sum("total"))["s"] or Decimal("0")
        vat = gross * Decimal("0.16")
        net = gross - vat
        results.append({
            "period": f"{months[month-1]} {year}",
            "gross": str(gross),
            "vat_amount": str(vat),
            "net": str(net)
        })
        
    return Response(api_response(data=results).data)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def financial_kpis(request):
    from apps.orders.models import Order
    from apps.payouts.models import Payout
    from apps.refunds.models import Dispute
    from django.db.models import Sum
    from django.utils.dateparse import parse_date
    from decimal import Decimal
    import datetime
    
    from_date_str = request.query_params.get("from")
    to_date_str = request.query_params.get("to")
    now = timezone.now()
    first_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    from_date = parse_date(from_date_str) if from_date_str else first_of_month.date()
    to_date = parse_date(to_date_str) if to_date_str else now.date()
    
    # Platform earnings
    orders_filtered = Order.objects.filter(status="CONFIRMED", confirmed_at__date__gte=from_date, confirmed_at__date__lte=to_date)
    earnings_filtered = orders_filtered.aggregate(s=Sum("platform_fee"))["s"] or Decimal("0")
    
    # Total earnings overall
    total_earnings = Order.objects.filter(status="CONFIRMED").aggregate(s=Sum("platform_fee"))["s"] or Decimal("0")
    
    # Payouts
    pending_payouts = Payout.objects.filter(status="PENDING")
    pending_amount = pending_payouts.aggregate(s=Sum("amount"))["s"] or Decimal("0")
    pending_count = pending_payouts.count()
    
    failed_count = Payout.objects.filter(status__in=["FAILED", "CANCELLED", "REJECTED"]).count()
    
    disbursed_filtered = Payout.objects.filter(
        status="PAID", 
        processed_at__date__gte=from_date,
        processed_at__date__lte=to_date
    ).aggregate(s=Sum("amount"))["s"] or Decimal("0")
    
    # Disputes
    open_disputes = Dispute.objects.filter(status="OPEN").count()
    
    return Response(api_response(data={
        "platform_earnings": str(total_earnings),
        "platform_earnings_mtd": str(earnings_filtered),
        "pending_payout_amount": str(pending_amount),
        "pending_payout_count": pending_count,
        "failed_payout_count": failed_count,
        "open_disputes": open_disputes,
        "disbursed_mtd": str(disbursed_filtered)
    }).data)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def reconciliation_report(request):
    from apps.payments.models import Payment
    from django.utils.dateparse import parse_date
    import datetime
    
    from_date_str = request.query_params.get("from")
    to_date_str = request.query_params.get("to")
    
    from_date = parse_date(from_date_str) if from_date_str else (timezone.now() - datetime.timedelta(days=7)).date()
    to_date = parse_date(to_date_str) if to_date_str else timezone.now().date()
    
    qs = Payment.objects.filter(
        method__in=["MPESA_STK", "MPESA_PAYBILL"],
        created_at__date__gte=from_date,
        created_at__date__lte=to_date
    ).select_related("order").order_by("-created_at")
    
    data = []
    for p in qs:
        if p.status == "COMPLETED" and p.mpesa_receipt_number:
            status = "MATCHED"
        elif p.status in ("FAILED", "CANCELLED") or not p.mpesa_receipt_number:
            status = "MISSING"
        else:
            status = "MISMATCH"
            
        data.append({
            "date": p.created_at.strftime("%Y-%m-%d %H:%M"),
            "mpesa_ref": p.mpesa_receipt_number or f"REQ-{str(p.id)[:8].upper()}",
            "amount": str(p.amount),
            "db_status": status,
            "db_order": p.order.order_number if p.order else None
        })
        
    return Response(api_response(data=data).data)

@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def list_refunds(request):
    from apps.refunds.models import Refund
    qs = Refund.objects.select_related("order").prefetch_related("order__payments").order_by("-created_at")
    
    s = request.query_params.get("status")
    if s and s != "ALL": qs = qs.filter(status=s)
    
    start_date = request.query_params.get("from")
    end_date = request.query_params.get("to")
    if start_date:
        qs = qs.filter(created_at__gte=f"{start_date} 00:00:00")
    if end_date:
        qs = qs.filter(created_at__lte=f"{end_date} 23:59:59")
    
    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    data = []
    for r in page:
        payment = r.order.payments.filter(status="COMPLETED").first()
        data.append({
            "id": str(r.id),
            "order_number": r.order.order_number,
            "amount": str(r.amount),
            "reason": r.reason,
            "status": r.status,
            "created_at": r.created_at,
            "buyer_name": f"{r.order.buyer_first_name} {r.order.buyer_last_name}".strip(),
            "buyer_email": r.order.buyer_email,
            "buyer_phone": r.order.buyer_phone,
            "subtotal": str(r.order.subtotal),
            "platform_fee": str(r.order.platform_fee),
            "total_paid": str(r.order.total),
            "mpesa_phone": payment.mpesa_phone if payment else None,
            "mpesa_receipt": payment.mpesa_receipt_number if payment else None,
            "gateway_refund_id": r.gateway_refund_id,
        })
    return paginator.get_paginated_response(data)

@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def refunds_kpis(request):
    from apps.refunds.models import Refund
    from django.db.models import Sum
    
    qs = Refund.objects.all()
    start_date = request.query_params.get("from")
    end_date = request.query_params.get("to")
    if start_date:
        qs = qs.filter(created_at__gte=f"{start_date} 00:00:00")
    if end_date:
        qs = qs.filter(created_at__lte=f"{end_date} 23:59:59")
        
    pending = qs.filter(status="PENDING")
    approved = qs.filter(status="APPROVED")
    processed = qs.filter(status="PROCESSED")
    failed = qs.filter(status="FAILED")
    
    return Response(api_response(data={
        "pending_count": pending.count(),
        "pending_amount": str(pending.aggregate(Sum("amount"))["amount__sum"] or 0),
        "approved_count": approved.count(),
        "processed_amount": str(processed.aggregate(Sum("amount"))["amount__sum"] or 0),
        "failed_count": failed.count(),
    }).data)

@api_view(["POST"])
@permission_classes([IsAdminOrSuperAdmin])
def refund_action(request, refund_id, action):
    from apps.refunds.models import Refund
    import uuid
    try:
        r = Refund.objects.select_related("order").get(id=refund_id)
    except Refund.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)
        
    if action == "approve":
        amt = request.data.get("amount")
        if amt: r.amount = amt
        r.status = "APPROVED"
        r.approved_by = request.user
        r.approved_at = timezone.now()
    elif action == "reject":
        r.status = "REJECTED"
        r.rejection_reason = request.data.get("note", "")
        r.rejected_by = request.user
        r.rejected_at = timezone.now()
    elif action == "process":
        if r.status != "APPROVED":
            return Response({"success": False, "data": None, "error": "Refund must be APPROVED first.", "meta": None}, status=400)
        # Mock Daraja/Gateway Reversal
        r.status = "PROCESSED"
        r.processed_at = timezone.now()
        r.gateway_refund_id = f"REF-{str(uuid.uuid4())[:8].upper()}"
        r.gateway_response = {"success": True, "mock": "Daraja Reversal Sent"}
        
        # Update order
        if r.amount >= r.order.total:
            r.order.status = "REFUNDED"
        else:
            r.order.status = "PARTIALLY_REFUNDED"
        r.order.save()
        
    r.save()
    return Response(api_response(data={"status": r.status}).data)

@api_view(["POST"])
@permission_classes([IsAdminOrSuperAdmin])
def reconciliation_sync(request):
    from apps.payments.models import Payment
    from django.utils.dateparse import parse_date
    import datetime
    
    # Simulate pinging Daraja API to check missing transactions
    from_date_str = request.data.get("from")
    to_date_str = request.data.get("to")
    
    from_date = parse_date(from_date_str) if from_date_str else (timezone.now() - datetime.timedelta(days=7)).date()
    to_date = parse_date(to_date_str) if to_date_str else timezone.now().date()
    
    missing_qs = Payment.objects.filter(
        method__in=["MPESA_STK", "MPESA_PAYBILL"],
        created_at__date__gte=from_date,
        created_at__date__lte=to_date,
        mpesa_receipt_number=""
    )
    
    synced = 0
    for p in missing_qs:
        # Simulate that 30% of missing actually succeeded in Mpesa
        if str(p.id)[0] in "01234":
            p.status = "COMPLETED"
            p.mpesa_receipt_number = f"SYNC{str(p.id)[:8].upper()}"
            p.save(update_fields=["status", "mpesa_receipt_number"])
            synced += 1
            
    return Response(api_response(data={"synced_count": synced}).data)


@api_view(["GET", "PUT", "PATCH"])
@permission_classes([IsAdminOrSuperAdmin])
def platform_config(request):
    if request.method == "GET":
        configs = PlatformConfig.objects.all()
        return Response(api_response(data={c.key: c.value for c in configs}).data)
    for key, value in request.data.items():
        PlatformConfig.objects.update_or_create(key=key, defaults={"value": str(value), "updated_by": request.user})
    return Response(api_response(data={"updated": True}).data)

@api_view(["GET"])
@permission_classes([]) # Public
def public_config(request):
    from rest_framework.permissions import AllowAny
    # Just fetch privacy and terms or any public config
    configs = PlatformConfig.objects.filter(key__in=["privacy", "terms", "terms_of_service", "privacy_policy"])
    return Response(api_response(data={c.key: c.value for c in configs}).data)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def audit_logs(request):
    from django.db.models import Q
    qs = AuditLog.objects.select_related("user").order_by("-created_at")
    
    action_filter = request.query_params.get("action")
    if action_filter: 
        qs = qs.filter(action=action_filter)
        
    entity_filter = request.query_params.get("entity")
    if entity_filter:
        qs = qs.filter(entity__icontains=entity_filter)
        
    search = request.query_params.get("search")
    if search:
        qs = qs.filter(
            Q(user__email__icontains=search) | 
            Q(user__first_name__icontains=search) | 
            Q(user__last_name__icontains=search) |
            Q(entity_id__icontains=search)
        )
        
    date_from = request.query_params.get("from")
    if date_from:
        qs = qs.filter(created_at__gte=date_from)
        
    date_to = request.query_params.get("to")
    if date_to:
        qs = qs.filter(created_at__lte=f"{date_to}T23:59:59Z")

    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    data = [{
        "id": str(l.id), 
        "user_email": l.user.email if l.user else None,
        "user_id": str(l.user.id) if l.user else None,
        "action": l.action, 
        "entity": l.entity, 
        "entity_id": l.entity_id, 
        "old_value": l.old_value,
        "new_value": l.new_value,
        "metadata": l.metadata,
        "ip_address": l.ip_address,
        "user_agent": l.user_agent,
        "created_at": l.created_at
    } for l in page]
    return paginator.get_paginated_response(data)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def report_revenue(request):
    from apps.analytics.models import PlatformAnalyticsDaily
    from django.db.models.functions import TruncDate, TruncWeek, TruncMonth
    from django.db.models import Sum
    from django.db.models.functions import Coalesce
    from decimal import Decimal
    
    start_date = request.query_params.get("from")
    end_date = request.query_params.get("to")
    group = request.query_params.get("group", "day")
    
    trunc_fn = TruncDate
    if group == "week": trunc_fn = TruncWeek
    elif group == "month": trunc_fn = TruncMonth
    
    qs = PlatformAnalyticsDaily.objects.filter(date__gte=start_date, date__lte=end_date)
    
    grouped = (
        qs.values(period=trunc_fn("date"))
        .annotate(
            gross=Coalesce(Sum("total_revenue"), Decimal("0")),
            fees=Coalesce(Sum("platform_fees"), Decimal("0")),
            refunds=Coalesce(Sum("total_refunds"), Decimal("0")),
            orders=Coalesce(Sum("confirmed_orders"), 0),
        )
        .order_by("period")
    )
    
    data = []
    for r in grouped:
        gross = float(r["gross"])
        fees = float(r["fees"])
        data.append({
            "period": str(r["period"])[:10] if group != "month" else str(r["period"])[:7],
            "gross": gross,
            "fees": fees,
            "net": gross - fees,
            "refunds": float(r["refunds"]),
            "orders": r["orders"]
        })
    return Response(api_response(data=data).data)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def report_user_growth(request):
    from apps.analytics.models import PlatformAnalyticsDaily
    from django.db.models.functions import TruncMonth
    from django.db.models import Sum
    
    start_date = request.query_params.get("from")
    end_date = request.query_params.get("to")
    
    qs = PlatformAnalyticsDaily.objects.filter(date__gte=start_date, date__lte=end_date)
    grouped = qs.values(period=TruncMonth("date")).annotate(
        buyers=Sum("new_users"),
        organizers=Sum("new_organizers")
    ).order_by("period")
    
    data = []
    for r in grouped:
        buyers = r["buyers"] or 0
        organizers = r["organizers"] or 0
        data.append({
            "period": str(r["period"])[:7],
            "buyers": buyers,
            "organizers": organizers,
            "total": buyers + organizers
        })
    return Response(api_response(data=data).data)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def report_events_performance(request):
    from apps.events.models import Event
    from apps.orders.models import Order
    from apps.tickets.models import Ticket
    from django.db.models import Sum, Count
    
    start_date = request.query_params.get("from")
    end_date = request.query_params.get("to")
    org_search = request.query_params.get("organizer")
    
    qs = Event.objects.filter(starts_at__date__gte=start_date, starts_at__date__lte=end_date).select_related("organizer").prefetch_related("ticket_tiers")
    if org_search:
        qs = qs.filter(organizer__name__icontains=org_search)
        
    events = list(qs)
    event_ids = [e.id for e in events]
    
    order_stats = Order.objects.filter(event_id__in=event_ids, status="CONFIRMED").values("event_id").annotate(gross=Sum("total"))
    gross_map = {str(o["event_id"]): float(o["gross"] or 0) for o in order_stats}
    
    ticket_stats = Ticket.objects.filter(order__event_id__in=event_ids, order__status="CONFIRMED").values("order__event_id").annotate(sold=Count("id"))
    sold_map = {str(t["order__event_id"]): t["sold"] for t in ticket_stats}
    
    data = []
    for ev in events:
        eid = str(ev.id)
        gross = gross_map.get(eid, 0.0)
        tickets_sold = sold_map.get(eid, 0)
        total_cap = sum([t.capacity for t in ev.ticket_tiers.all()])
        fill_rate = round(tickets_sold / total_cap * 100, 1) if total_cap else 0.0
        
        data.append({
            "event_id": eid,
            "title": ev.title,
            "organizer": ev.organizer.name,
            "tickets_sold": tickets_sold,
            "capacity": total_cap,
            "gross": gross,
            "fill_rate": fill_rate,
            "starts_at": str(ev.starts_at)
        })
    return Response(api_response(data=data).data)


@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsAdminOrSuperAdmin])
def report_subscriptions(request):
    from apps.admin_panel.models import ReportSubscription
    
    if request.method == "GET":
        subs = ReportSubscription.objects.filter(is_active=True).values("id", "email", "report_type", "frequency", "created_at")
        return Response(api_response(data=list(subs)).data)
        
    elif request.method == "POST":
        email = request.data.get("email")
        report_type = request.data.get("report_type")
        freq = request.data.get("frequency")
        sub, created = ReportSubscription.objects.get_or_create(
            email=email, report_type=report_type, frequency=freq,
            defaults={"is_active": True}
        )
        return Response(api_response(data={"id": sub.id, "email": email, "created": created}).data)
        
    elif request.method == "DELETE":
        sub_id = request.query_params.get("id")
        if sub_id:
            ReportSubscription.objects.filter(id=sub_id).delete()
        return Response(api_response(message="Subscription removed").data)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def report_liabilities(request):
    from apps.payouts.models import Payout
    from django.db.models import Sum
    from django.db.models.functions import TruncMonth, TruncWeek, TruncDate
    
    start_date = request.query_params.get("from")
    end_date = request.query_params.get("to")
    group_by = request.query_params.get("group", "day")
    
    pending = Payout.objects.filter(status__in=["PENDING", "ON_HOLD", "PROCESSING"]).aggregate(s=Sum("net_amount"))["s"] or 0
    disbursed = Payout.objects.filter(status="COMPLETED").aggregate(s=Sum("net_amount"))["s"] or 0
    
    qs = Payout.objects.filter(status="COMPLETED")
    if start_date:
        qs = qs.filter(processed_at__date__gte=start_date)
    if end_date:
        qs = qs.filter(processed_at__date__lte=end_date)
    
    trunc_func = TruncDate
    if group_by == "week": trunc_func = TruncWeek
    elif group_by == "month": trunc_func = TruncMonth
        
    series = qs.annotate(period=trunc_func('processed_at')).values('period').annotate(amount=Sum('net_amount')).order_by('period')
    
    series_data = []
    for s in series:
        if s["period"]:
            p_str = str(s["period"])[:10] if group_by != "month" else str(s["period"])[:7]
            series_data.append({"period": p_str, "amount": float(s["amount"])})
            
    return Response(api_response(data={
        "totals": {
            "pending": float(pending),
            "disbursed": float(disbursed)
        },
        "series": series_data
    }).data)

@api_view(["GET", "POST"])
@permission_classes([IsAdminOrSuperAdmin])
def admin_categories(request):
    from apps.events.models import EventCategory
    from apps.events.serializers import EventCategorySerializer
    from django.utils.text import slugify
    if request.method == "GET":
        cats = EventCategory.objects.all().order_by("sort_order", "name")
        return Response(api_response(data=EventCategorySerializer(cats, many=True).data).data)
    
    # POST
    name = request.data.get("name")
    color = request.data.get("color") or "#f59e0b"
    if not name:
        return Response(api_response(error="Name is required", success=False).data, status=400)
    slug = slugify(name)
    # Ensure unique slug
    base_slug = slug
    counter = 1
    while EventCategory.objects.filter(slug=slug).exists():
        slug = f"{base_slug}-{counter}"
        counter += 1
    
    cat = EventCategory.objects.create(name=name, slug=slug, color_hex=color)
    return Response(api_response(data=EventCategorySerializer(cat).data).data)

@api_view(["DELETE"])
@permission_classes([IsAdminOrSuperAdmin])
def admin_category_detail(request, cat_id):
    from apps.events.models import EventCategory
    try:
        cat = EventCategory.objects.get(id=cat_id)
        cat.delete()
        return Response(api_response(data={"deleted": True}).data)
    except EventCategory.DoesNotExist:
        return Response(api_response(error="Category not found", success=False).data, status=404)


@api_view(["GET", "PATCH"])
@permission_classes([IsAdminOrSuperAdmin])
def platform_fee_settings(request):
    from apps.admin_panel.models import PlatformFeeSetting
    fee_settings, _ = PlatformFeeSetting.objects.get_or_create(pk=1)
    
    if request.method == "GET":
        return Response(api_response(data={
            "platform_fee": fee_settings.platform_fee,
            "payment_processing_mpesa": fee_settings.payment_processing_mpesa,
            "payment_processing_card": fee_settings.payment_processing_card,
            "bank_transfer_fee": fee_settings.bank_transfer_fee,
            "free_events_fee": fee_settings.free_events_fee,
            "payout_schedule": fee_settings.payout_schedule,
        }).data)
        
    # PATCH
    for key, value in request.data.items():
        if hasattr(fee_settings, key):
            setattr(fee_settings, key, value)
    fee_settings.save()
    return Response(api_response(data={"updated": True}).data)
