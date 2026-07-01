from decimal import Decimal
from django.db.models import Sum
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from core.exceptions import api_response
from core.permissions import IsApprovedOrganizer
from core.pagination import StandardPagination
from .models import Payout


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsApprovedOrganizer])
def list_payouts(request):
    org = request.user.organizer_profile
    qs = Payout.objects.filter(organizer=org).order_by("-created_at")
    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    data = [{"id": str(p.id), "amount": str(p.amount), "net_amount": str(p.net_amount), "method": p.method, "status": p.status, "created_at": p.created_at} for p in page]
    return paginator.get_paginated_response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsApprovedOrganizer])
def request_payout(request):
    org = request.user.organizer_profile

    if org.kyc_status != "APPROVED":
        return Response({"success": False, "data": None, "error": "KYC must be approved to request payouts.", "meta": None}, status=400)

    from apps.orders.models import Order
    total_confirmed = Order.objects.filter(event__organizer=org, status="CONFIRMED").aggregate(s=Sum("total"))["s"] or Decimal("0")
    platform_fees = Order.objects.filter(event__organizer=org, status="CONFIRMED").aggregate(s=Sum("platform_fee"))["s"] or Decimal("0")
    total_payouts = Payout.objects.filter(organizer=org, status="COMPLETED").aggregate(s=Sum("net_amount"))["s"] or Decimal("0")

    available_balance = total_confirmed - platform_fees - total_payouts
    requested_amount = Decimal(str(request.data.get("amount", "0")))

    if requested_amount <= 0:
        return Response({"success": False, "data": None, "error": "Invalid amount.", "meta": None}, status=400)

    if requested_amount > available_balance:
        return Response({"success": False, "data": None, "error": f"Insufficient balance. Available: KES {available_balance}.", "meta": None}, status=400)

    method = request.data.get("method", org.payout_method)
    payout = Payout.objects.create(
        organizer=org,
        amount=requested_amount,
        net_amount=requested_amount,
        method=method,
        mpesa_phone=org.mpesa_phone,
        bank_name=org.bank_name,
        bank_account_number=org.bank_account_number,
        bank_branch=org.bank_branch,
        requested_by=request.user,
    )
    return Response(api_response(data={"payout_id": str(payout.id), "status": payout.status, "amount": str(payout.amount)}).data, status=status.HTTP_201_CREATED)
