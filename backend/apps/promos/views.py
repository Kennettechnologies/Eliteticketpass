import random
import string
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from core.exceptions import api_response
from core.permissions import IsApprovedOrganizer
from core.pagination import StandardPagination
from .models import PromoCode


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsApprovedOrganizer])
def promo_codes(request):
    org = request.user.organizer_profile
    if request.method == "GET":
        qs = PromoCode.objects.filter(organizer=org).prefetch_related('events', 'applicable_tiers').order_by("-created_at")
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        
        data = []
        for p in page:
            events = p.events.all()
            tiers = p.applicable_tiers.all()
            data.append({
                "id": str(p.id),
                "code": p.code,
                "code_type": p.code_type,
                "discount_type": "PERCENT" if p.promo_type == "PERCENTAGE" else "FIXED",
                "discount_value": str(p.value),
                "usage_limit": p.usage_limit,
                "used_count": p.usage_count,
                "is_single_use": p.per_user_limit == 1,
                "expires_at": p.valid_until.isoformat() if p.valid_until else None,
                "applicable_tiers": [str(t.id) for t in tiers],
                "applicable_tier_names": [t.name for t in tiers],
                "event_ids": [str(e.id) for e in events],
                "event_titles": [e.title for e in events],
                "is_active": p.is_active,
                "referral_owner": p.referral_owner,
                "referral_earnings": "0", # Stub for future referral payout logic
                "created_at": p.created_at.isoformat(),
            })
        return paginator.get_paginated_response(data)

    data = request.data
    promo = PromoCode.objects.create(
        organizer=org,
        code=data.get("code", "").upper(),
        code_type=data.get("code_type", "PROMO"),
        promo_type="PERCENTAGE" if data.get("discount_type") == "PERCENT" else "FIXED_AMOUNT",
        value=data.get("discount_value", 0),
        usage_limit=data.get("usage_limit"),
        per_user_limit=1 if data.get("is_single_use") else 0, # 0 means unlimited
        valid_until=data.get("expires_at"),
        is_active=data.get("is_active", True),
        referral_owner=data.get("referral_owner"),
    )
    
    if data.get("event_ids"):
        promo.events.set(data["event_ids"])
    if data.get("applicable_tiers"):
        promo.applicable_tiers.set(data["applicable_tiers"])
        
    return Response(api_response(data={"id": str(promo.id), "code": promo.code}).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsApprovedOrganizer])
def bulk_generate(request):
    org = request.user.organizer_profile
    prefix = request.data.get("prefix", "PROMO").upper()
    count = int(request.data.get("count", 10))
    discount_type = request.data.get("discount_type", "PERCENT")
    promo_type = "PERCENTAGE" if discount_type == "PERCENT" else "FIXED_AMOUNT"
    value = request.data.get("discount_value", 10)
    valid_until = request.data.get("expires_at")
    usage_limit = request.data.get("usage_limit")
    event_id = request.data.get("event_id")
    code_type = request.data.get("code_type", "BULK")

    codes = []
    promos = []
    for _ in range(min(count, 500)):
        suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
        code = f"{prefix}{suffix}"
        while PromoCode.objects.filter(code=code).exists():
            suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
            code = f"{prefix}{suffix}"
            
        p = PromoCode(
            organizer=org, code=code, code_type=code_type,
            promo_type=promo_type, value=value, valid_until=valid_until,
            usage_limit=usage_limit
        )
        promos.append(p)
        codes.append(code)
        
    PromoCode.objects.bulk_create(promos)
    
    if event_id:
        # Since we bulk created, we need to fetch them to set M2M
        created_promos = PromoCode.objects.filter(code__in=codes)
        for p in created_promos:
            p.events.add(event_id)

    return Response(api_response(data={"codes": codes, "count": len(codes)}).data)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsApprovedOrganizer])
def promo_detail(request, promo_id):
    org = request.user.organizer_profile
    try:
        promo = PromoCode.objects.get(id=promo_id, organizer=org)
    except PromoCode.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)

    if request.method == "GET":
        events = promo.events.all()
        tiers = promo.applicable_tiers.all()
        return Response(api_response(data={
            "id": str(promo.id),
            "code": promo.code,
            "code_type": promo.code_type,
            "discount_type": "PERCENT" if promo.promo_type == "PERCENTAGE" else "FIXED",
            "discount_value": str(promo.value),
            "usage_limit": promo.usage_limit,
            "used_count": promo.usage_count,
            "is_single_use": promo.per_user_limit == 1,
            "expires_at": promo.valid_until.isoformat() if promo.valid_until else None,
            "applicable_tiers": [str(t.id) for t in tiers],
            "applicable_tier_names": [t.name for t in tiers],
            "event_ids": [str(e.id) for e in events],
            "event_titles": [e.title for e in events],
            "is_active": promo.is_active,
            "referral_owner": promo.referral_owner,
            "referral_earnings": "0",
            "created_at": promo.created_at.isoformat(),
        }).data)

    if request.method == "PATCH":
        data = request.data
        if "code" in data: promo.code = str(data["code"]).upper()
        if "code_type" in data: promo.code_type = data["code_type"]
        if "discount_type" in data: promo.promo_type = "PERCENTAGE" if data["discount_type"] == "PERCENT" else "FIXED_AMOUNT"
        if "discount_value" in data: promo.value = data["discount_value"]
        if "usage_limit" in data: promo.usage_limit = data["usage_limit"]
        if "is_single_use" in data: promo.per_user_limit = 1 if data["is_single_use"] else 0
        if "expires_at" in data: promo.valid_until = data["expires_at"]
        if "is_active" in data: promo.is_active = data["is_active"]
        if "referral_owner" in data: promo.referral_owner = data["referral_owner"]
        
        promo.save()
        
        if "event_ids" in data:
            promo.events.set(data["event_ids"])
        if "applicable_tiers" in data:
            promo.applicable_tiers.set(data["applicable_tiers"])
            
        return Response(api_response(data={"id": str(promo.id), "code": promo.code}).data)

    promo.delete()
    return Response(api_response(data={"deleted": True}).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsApprovedOrganizer])
def promo_usage(request, promo_id):
    from .models import PromoCodeUsage
    org = request.user.organizer_profile
    try:
        promo = PromoCode.objects.get(id=promo_id, organizer=org)
    except PromoCode.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)
        
    usages = PromoCodeUsage.objects.filter(promo_code=promo).select_related("order", "order__event").order_by("-used_at")
    data = []
    for u in usages:
        buyer_name = f"{u.order.buyer_first_name} {u.order.buyer_last_name}".strip()
        data.append({
            "buyer_name": buyer_name,
            "buyer_email": u.order.buyer_email,
            "event_title": u.order.event.title if u.order.event else "",
            "discount_type": "PERCENT" if promo.promo_type == "PERCENTAGE" else "FIXED",
            "discount_value": str(promo.value),
            "used_at": u.used_at.isoformat(),
        })
    return Response(api_response(data=data).data)
