"""
Analytics API views.

Organizer-facing  →  /api/v1/analytics/organizer/*
Admin-facing      →  /api/v1/analytics/admin/*
"""

from decimal import Decimal
from datetime import date, timedelta

from django.db.models import (
    Sum, Count, Avg, F, Q, FloatField,
    ExpressionWrapper, DecimalField, Value
)
from django.db.models.functions import TruncDate, TruncWeek, TruncMonth, Coalesce
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from core.exceptions import api_response
from core.permissions import IsAdminOrSuperAdmin, IsApprovedOrganizer

from .models import EventAnalyticsDaily, PlatformAnalyticsDaily, TrafficSource


# ── helpers ───────────────────────────────────────────────────────────────────

def _date_range(request, default_days: int = 30):
    days = int(request.query_params.get("days", default_days))
    end  = date.today()
    start = end - timedelta(days=days - 1)
    return start, end


def _trunc_fn(group_by: str):
    return {"day": TruncDate, "week": TruncWeek, "month": TruncMonth}.get(group_by, TruncDate)


def _fmt(d) -> str:
    return str(d) if d is not None else "0"


# ─────────────────────────────────────────────────────────────────────────────
# 8.1  ORGANIZER ANALYTICS
# ─────────────────────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsApprovedOrganizer])
def organizer_overview(request):
    """
    Summary KPIs for the organizer's events over the selected window.
    """
    from apps.events.models import Event
    from apps.orders.models import Order
    from apps.tickets.models import Ticket

    start, end = _date_range(request)
    org = request.user.organizer_profile
    events = Event.objects.filter(organizer=org)

    event_id = request.query_params.get("event_id")
    if event_id:
        events = events.filter(id=event_id)

    orders = Order.objects.filter(event__in=events, status="CONFIRMED",
                                   confirmed_at__date__range=(start, end))
    totals = orders.aggregate(
        revenue=Coalesce(Sum("total"), Value(Decimal("0"))),
        fees=Coalesce(Sum("platform_fee"), Value(Decimal("0"))),
        order_count=Count("id"),
    )

    tickets_sold = Ticket.objects.filter(order__event__in=events,
                                          created_at__date__range=(start, end)).count()
    checked_in = Ticket.objects.filter(order__event__in=events,
                                        checked_in_at__date__range=(start, end)).count()

    daily = (
        EventAnalyticsDaily.objects
        .filter(event__in=events, date__range=(start, end))
        .values("date")
        .annotate(
            revenue=Coalesce(Sum("revenue"), Value(Decimal("0"))),
            tickets=Sum("tickets_sold"),
            views=Sum("views"),
        )
        .order_by("date")
    )
    
    daily_map = {d["date"]: d for d in daily}
    daily_series = []
    current = start
    while current <= end:
        d = daily_map.get(current, {"revenue": Decimal("0"), "tickets": 0, "views": 0})
        daily_series.append({
            "date": str(current),
            "revenue": _fmt(d["revenue"]),
            "tickets": d.get("tickets") or 0,
            "views": d.get("views") or 0
        })
        current += timedelta(days=1)

    return Response(api_response(data={
        "period": {"start": str(start), "end": str(end)},
        "revenue": _fmt(totals["revenue"]),
        "net_revenue": _fmt(totals["revenue"] - totals["fees"]),
        "orders": totals["order_count"],
        "tickets_sold": tickets_sold,
        "check_in_count": checked_in,
        "check_in_rate": round(checked_in / tickets_sold * 100, 1) if tickets_sold else 0,
        "total_events": events.count(),
        "daily_series": daily_series,
    }).data)


@api_view(["GET"])
@permission_classes([IsApprovedOrganizer])
def buyer_demographics(request):
    """
    Buyer location, repeat-buyer breakdown, and top cities.
    """
    from apps.events.models import Event
    from apps.orders.models import Order

    start, end = _date_range(request)
    org = request.user.organizer_profile
    event_id = request.query_params.get("event_id")
    events = Event.objects.filter(organizer=org)
    if event_id:
        events = events.filter(id=event_id)

    orders = Order.objects.filter(
        event__in=events, status="CONFIRMED",
        confirmed_at__date__range=(start, end)
    ).select_related("user")

    # Location breakdown by city
    by_city = (
        orders.exclude(buyer_city="")
        .exclude(buyer_city__isnull=True)
        .values(city=F("buyer_city"))
        .annotate(count=Count("id"))
        .order_by("-count")[:15]
    )

    # Repeat vs first-time buyers
    buyer_order_counts = (
        orders.values("user_id")
        .annotate(total_orders=Count("id"))
    )
    repeat  = sum(1 for b in buyer_order_counts if b["total_orders"] > 1)
    first   = sum(1 for b in buyer_order_counts if b["total_orders"] == 1)

    # Total unique buyers
    unique_buyers = orders.values("user_id").distinct().count()

    return Response(api_response(data={
        "unique_buyers": unique_buyers,
        "repeat_buyers": repeat,
        "first_time_buyers": first,
        "repeat_rate": round(repeat / unique_buyers * 100, 1) if unique_buyers else 0,
        "by_city": [{"city": c["city"] or "Unknown", "count": c["count"]} for c in by_city],
    }).data)


@api_view(["GET"])
@permission_classes([IsApprovedOrganizer])
def traffic_sources(request):
    """
    Traffic source breakdown per event (UTM source/medium).
    """
    from apps.events.models import Event

    start, end  = _date_range(request)
    org         = request.user.organizer_profile
    event_id    = request.query_params.get("event_id")
    events      = Event.objects.filter(organizer=org)
    if event_id:
        events = events.filter(id=event_id)

    by_source = (
        TrafficSource.objects
        .filter(event__in=events, date__range=(start, end))
        .values("source", "medium")
        .annotate(visits=Sum("visits"))
        .order_by("-visits")[:20]
    )

    daily = (
        TrafficSource.objects
        .filter(event__in=events, date__range=(start, end))
        .values("date", "source")
        .annotate(visits=Sum("visits"))
        .order_by("date")
    )

    return Response(api_response(data={
        "by_source": list(by_source),
        "daily_series": [
            {"date": str(d["date"]), "source": d["source"], "visits": d["visits"]}
            for d in daily
        ],
    }).data)


@api_view(["GET"])
@permission_classes([IsApprovedOrganizer])
def event_performance(request):
    """
    Per-event: revenue vs capacity, refund rate, check-in rate, tier comparison.
    """
    from apps.events.models import Event
    from apps.orders.models import Order
    from apps.tickets.models import Ticket

    org = request.user.organizer_profile
    event_id = request.query_params.get("event_id")

    qs = Event.objects.filter(organizer=org).prefetch_related("ticket_tiers")
    if event_id:
        qs = qs.filter(id=event_id)

    results = []
    for ev in qs[:50]:
        total_cap = ev.ticket_tiers.aggregate(s=Sum("quantity"))["s"] or 0
        sold = Ticket.objects.filter(order__event=ev, order__status="CONFIRMED").count()
        checked = Ticket.objects.filter(order__event=ev, checked_in_at__isnull=False).count()
        revenue = (
            Order.objects.filter(event=ev, status="CONFIRMED")
            .aggregate(s=Coalesce(Sum("total"), Value(Decimal("0"))))["s"]
        )
        refunds = (
            Order.objects.filter(event=ev, status="REFUNDED")
            .aggregate(s=Coalesce(Sum("total"), Value(Decimal("0"))))["s"]
        )
        refund_count = Order.objects.filter(event=ev, status="REFUNDED").count()
        total_orders = Order.objects.filter(event=ev, status__in=["CONFIRMED", "REFUNDED"]).count()

        # Tier breakdown
        tier_data = []
        for tier in ev.ticket_tiers.all():
            tier_sold = Ticket.objects.filter(
                order__event=ev, tier=tier, order__status="CONFIRMED"
            ).count()
            tier_data.append({
                "name":     tier.name,
                "capacity": tier.quantity,
                "sold":     tier_sold,
                "price":    str(tier.price),
                "revenue":  str(Decimal(str(tier.price or 0)) * tier_sold),
                "fill_pct": round(tier_sold / tier.quantity * 100, 1) if tier.quantity else 0,
            })

        results.append({
            "id":            str(ev.id),
            "title":         ev.title,
            "date":          str(ev.starts_at.date()) if ev.starts_at else None,
            "capacity":      total_cap,
            "tickets_sold":  sold,
            "fill_rate":     round(sold / total_cap * 100, 1) if total_cap else 0,
            "check_in_count": checked,
            "check_in_rate": round(checked / sold * 100, 1) if sold else 0,
            "revenue":       str(revenue),
            "refunds":       str(refunds),
            "refund_rate":   round(refund_count / total_orders * 100, 1) if total_orders else 0,
            "tiers":         tier_data,
        })

    return Response(api_response(data=results).data)


# ─────────────────────────────────────────────────────────────────────────────
# 8.3  PLATFORM-WIDE (ADMIN)
# ─────────────────────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def platform_gmv(request):
    """
    GMV, platform fees, refunds over time.
    """
    start, end = _date_range(request, default_days=90)
    group_by   = request.query_params.get("group_by", "day")
    trunc      = _trunc_fn(group_by)
    event_type = request.query_params.get("event_type")
    category   = request.query_params.get("category")
    city       = request.query_params.get("city")

    if event_type or category or city:
        from apps.orders.models import Order
        qs = Order.objects.filter(status="CONFIRMED", confirmed_at__date__range=(start, end))
        if event_type and event_type.lower() != 'all':
            qs = qs.filter(event__event_type=event_type.upper())
        if category and category.lower() != 'all':
            qs = qs.filter(event__category__name__icontains=category)
        if city:
            qs = qs.filter(user__city__icontains=city)

        series = (qs.values(period=trunc("confirmed_at"))
                    .annotate(gmv=Coalesce(Sum("total"), Value(Decimal("0"))),
                              fees=Coalesce(Sum("platform_fee"), Value(Decimal("0"))),
                              orders=Count("id")).order_by("period"))

        qs_ref = Order.objects.filter(status="REFUNDED", confirmed_at__date__range=(start, end))
        if event_type and event_type.lower() != 'all': qs_ref = qs_ref.filter(event__event_type=event_type.upper())
        if category and category.lower() != 'all': qs_ref = qs_ref.filter(event__category__name__icontains=category)
        if city: qs_ref = qs_ref.filter(user__city__icontains=city)

        ref_series = qs_ref.values(period=trunc("confirmed_at")).annotate(refunds=Coalesce(Sum("total"), Value(Decimal("0"))))
        ref_map = {str(r["period"])[:10] if group_by=='day' else str(r["period"]): r["refunds"] for r in ref_series}

        combined_series = []
        for s in series:
            p = str(s["period"])[:10] if group_by=='day' else str(s["period"])
            combined_series.append({
                "period": p,
                "gmv": _fmt(s["gmv"]),
                "fees": _fmt(s["fees"]),
                "refunds": _fmt(ref_map.get(p, Decimal("0"))),
                "orders": s["orders"],
                "new_users": 0
            })

        totals_qs = qs.aggregate(gmv=Coalesce(Sum("total"), Value(Decimal("0"))), fees=Coalesce(Sum("platform_fee"), Value(Decimal("0"))), orders=Count("id"))
        refunds_tot = qs_ref.aggregate(r=Coalesce(Sum("total"), Value(Decimal("0"))))["r"]

        return Response(api_response(data={
            "period": {"start": str(start), "end": str(end), "group_by": group_by},
            "totals": {"gmv": _fmt(totals_qs["gmv"]), "fees": _fmt(totals_qs["fees"]), "refunds": _fmt(refunds_tot), "orders": str(totals_qs["orders"]), "payouts": "0"},
            "series": combined_series
        }).data)

    series = (
        PlatformAnalyticsDaily.objects
        .filter(date__range=(start, end))
        .values(period=trunc("date"))
        .annotate(
            gmv=Coalesce(Sum("total_revenue"), Value(Decimal("0"))),
            fees=Coalesce(Sum("platform_fees"), Value(Decimal("0"))),
            refunds=Coalesce(Sum("total_refunds"), Value(Decimal("0"))),
            orders=Sum("confirmed_orders"),
            new_users=Sum("new_users"),
        )
        .order_by("period")
    )

    totals = PlatformAnalyticsDaily.objects.filter(date__range=(start, end)).aggregate(
        gmv=Coalesce(Sum("total_revenue"), Value(Decimal("0"))),
        fees=Coalesce(Sum("platform_fees"), Value(Decimal("0"))),
        refunds=Coalesce(Sum("total_refunds"), Value(Decimal("0"))),
        orders=Sum("confirmed_orders"),
        payouts=Coalesce(Sum("total_payouts"), Value(Decimal("0"))),
    )

    return Response(api_response(data={
        "period": {"start": str(start), "end": str(end), "group_by": group_by},
        "totals": {k: _fmt(v) for k, v in totals.items()},
        "series": [
            {
                "period":   str(s["period"])[:10] if group_by=='day' else str(s["period"]),
                "gmv":      _fmt(s["gmv"]),
                "fees":     _fmt(s["fees"]),
                "refunds":  _fmt(s["refunds"]),
                "orders":   s["orders"] or 0,
                "new_users": s["new_users"] or 0,
            }
            for s in series
        ],
    }).data)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def top_organizers(request):
    """
    Organizers ranked by GMV, with event count and average refund rate.
    """
    from apps.organizers.models import Organizer
    from apps.orders.models import Order

    start, end = _date_range(request, default_days=90)
    limit      = int(request.query_params.get("limit", 10))
    event_type = request.query_params.get("event_type")
    category   = request.query_params.get("category")
    city       = request.query_params.get("city")

    qs = Order.objects.filter(status="CONFIRMED", confirmed_at__date__range=(start, end))
    if event_type and event_type.lower() != 'all': qs = qs.filter(event__event_type=event_type.upper())
    if category and category.lower() != 'all': qs = qs.filter(event__category__name__icontains=category)
    if city: qs = qs.filter(user__city__icontains=city)

    orgs = (
        qs.values("event__organizer_id", org_name=F("event__organizer__name"))
        .annotate(
            gmv=Coalesce(Sum("total"), Value(Decimal("0"))),
            fees=Coalesce(Sum("platform_fee"), Value(Decimal("0"))),
            orders=Count("id"),
        )
        .order_by("-gmv")[:limit]
    )

    results = []
    for o in orgs:
        org_id   = o["event__organizer_id"]
        refunded = Order.objects.filter(
            event__organizer_id=org_id, status="REFUNDED",
            confirmed_at__date__range=(start, end)
        ).count()
        total = o["orders"] + refunded
        results.append({
            "organizer_id":   org_id,
            "name":           o["org_name"] or "—",
            "gmv":            _fmt(o["gmv"]),
            "platform_fees":  _fmt(o["fees"]),
            "orders":         o["orders"],
            "refund_rate":    round(refunded / total * 100, 1) if total else 0,
        })

    return Response(api_response(data=results).data)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def category_breakdown(request):
    """
    Most popular event categories by ticket sales and revenue.
    """
    from apps.events.models import Event
    from apps.orders.models import Order

    start, end = _date_range(request, default_days=90)
    event_type = request.query_params.get("event_type")
    city       = request.query_params.get("city")

    qs = Order.objects.filter(status="CONFIRMED", confirmed_at__date__range=(start, end))
    if event_type and event_type.lower() != 'all': qs = qs.filter(event__event_type=event_type.upper())
    if city: qs = qs.filter(user__city__icontains=city)

    cats = (
        qs.exclude(event__category__isnull=True)
        .values(category=F("event__category__name"))
        .annotate(
            gmv=Coalesce(Sum("total"), Value(Decimal("0"))),
            orders=Count("id"),
            events=Count("event_id", distinct=True),
        )
        .order_by("-gmv")
    )

    return Response(api_response(data=list(cats)).data)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def geo_heatmap(request):
    """
    Buyer distribution by city and country.
    """
    from apps.users.models import User
    from apps.orders.models import Order

    start, end = _date_range(request, default_days=90)
    event_type = request.query_params.get("event_type")
    category   = request.query_params.get("category")

    qs = Order.objects.filter(status="CONFIRMED", confirmed_at__date__range=(start, end))
    if event_type and event_type.lower() != 'all': qs = qs.filter(event__event_type=event_type.upper())
    if category and category.lower() != 'all': qs = qs.filter(event__category__name__icontains=category)

    by_city = (
        qs.exclude(buyer_city="")
        .exclude(buyer_city__isnull=True)
        .values(city=F("buyer_city"))
        .annotate(buyers=Count("user_id", distinct=True), orders=Count("id"))
        .order_by("-buyers")[:30]
    )

    total_buyers = qs.values("user_id").distinct().count()

    return Response(api_response(data={
        "total_buyers": total_buyers,
        "by_city": [
            {
                "city":    c["city"] or "Unknown",
                "buyers":  c["buyers"],
                "orders":  c["orders"],
                "pct":     round(c["buyers"] / total_buyers * 100, 1) if total_buyers else 0,
            }
            for c in by_city
        ],
    }).data)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def platform_user_growth(request):
    """
    New users and organizers over time.
    """
    start, end = _date_range(request, default_days=90)
    group_by   = request.query_params.get("group_by", "day")
    trunc      = _trunc_fn(group_by)

    series = (
        PlatformAnalyticsDaily.objects
        .filter(date__range=(start, end))
        .values(period=trunc("date"))
        .annotate(users=Sum("new_users"), organizers=Sum("new_organizers"))
        .order_by("period")
    )

    return Response(api_response(data=[
        {"period": str(s["period"])[:10] if group_by=='day' else str(s["period"]), "users": s["users"] or 0, "organizers": s["organizers"] or 0}
        for s in series
    ]).data)

@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def platform_funnel(request):
    from apps.orders.models import Order
    from apps.tickets.models import Ticket
    
    start, end = _date_range(request, default_days=90)
    event_type = request.query_params.get("event_type")
    category   = request.query_params.get("category")
    
    views_qs = EventAnalyticsDaily.objects.filter(date__range=(start, end))
    if event_type and event_type.lower() != 'all': views_qs = views_qs.filter(event__event_type=event_type.upper())
    if category and category.lower() != 'all': views_qs = views_qs.filter(event__category__name__icontains=category)
    total_views = views_qs.aggregate(s=Sum("views"))["s"] or 0

    t_qs = Ticket.objects.filter(created_at__date__range=(start, end))
    if event_type and event_type.lower() != 'all': t_qs = t_qs.filter(order__event__event_type=event_type.upper())
    if category and category.lower() != 'all': t_qs = t_qs.filter(order__event__category__name__icontains=category)
    checkouts_started = t_qs.count() # A ticket represents a checked out item

    o_qs = Order.objects.filter(created_at__date__range=(start, end))
    if event_type and event_type.lower() != 'all': o_qs = o_qs.filter(event__event_type=event_type.upper())
    if category and category.lower() != 'all': o_qs = o_qs.filter(event__category__name__icontains=category)
    
    confirmed = o_qs.filter(status="CONFIRMED").count()
    refunded = o_qs.filter(status="REFUNDED").count()
    
    return Response(api_response(data={
        "views": total_views,
        "checkouts": checkouts_started,
        "confirmed": confirmed,
        "refunded": refunded
    }).data)

@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def platform_live_metrics(request):
    from apps.orders.models import Order
    from apps.admin_panel.models import Dispute
    
    today = timezone.now().date()
    orders = Order.objects.filter(confirmed_at__date=today, status="CONFIRMED")
    totals = orders.aggregate(gmv=Coalesce(Sum("total"), Value(Decimal("0"))), count=Count("id"))
    
    disputes_pending = Dispute.objects.filter(status="OPEN").count()
    disputes_resolved = Dispute.objects.filter(status="RESOLVED").count()
    
    return Response(api_response(data={
        "today_gmv": _fmt(totals["gmv"]),
        "today_orders": totals["count"],
        "disputes_pending": disputes_pending,
        "disputes_resolved": disputes_resolved
    }).data)

@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def platform_ticket_tiers(request):
    from apps.tickets.models import Ticket
    
    start, end = _date_range(request, default_days=90)
    event_type = request.query_params.get("event_type")
    category   = request.query_params.get("category")
    
    qs = Ticket.objects.filter(order__status="CONFIRMED", order__confirmed_at__date__range=(start, end))
    if event_type and event_type.lower() != 'all': qs = qs.filter(order__event__event_type=event_type.upper())
    if category and category.lower() != 'all': qs = qs.filter(order__event__category__name__icontains=category)
    
    tiers = qs.values("tier__name", "tier__price").annotate(sold=Count("id"))
    
    results = {
        "VIP": {"sales": 0, "revenue": Decimal("0")},
        "Early Bird": {"sales": 0, "revenue": Decimal("0")},
        "Regular": {"sales": 0, "revenue": Decimal("0")},
        "Other": {"sales": 0, "revenue": Decimal("0")}
    }
    
    for t in tiers:
        name = (t["tier__name"] or "").lower()
        sold = t["sold"]
        rev = Decimal(str(t["tier__price"] or 0)) * sold
        
        if "vip" in name or "premium" in name:
            key = "VIP"
        elif "early" in name or "bird" in name:
            key = "Early Bird"
        elif "regular" in name or "general" in name or "standard" in name:
            key = "Regular"
        else:
            key = "Other"
            
        results[key]["sales"] += sold
        results[key]["revenue"] += rev
        
    return Response(api_response(data=[
        {"name": k, "sales": v["sales"], "revenue": _fmt(v["revenue"])}
        for k, v in results.items()
    ]).data)
