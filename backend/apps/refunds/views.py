from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from core.exceptions import api_response
from core.permissions import IsAdminOrSuperAdmin
from core.pagination import StandardPagination
from .models import Refund


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def request_refund(request):
    from apps.orders.models import Order
    order_id = request.data.get("order_id")
    reason = request.data.get("reason", "")

    try:
        order = Order.objects.get(id=order_id, user=request.user, status="CONFIRMED")
    except Order.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Order not found.", "meta": None}, status=404)

    # Check refund policy
    event = order.event
    policy = event.refund_policies.order_by("-days_before_event").first()
    if not policy:
        return Response({"success": False, "data": None, "error": "No refund policy for this event.", "meta": None}, status=400)

    days_until = (event.starts_at - timezone.now()).days
    if days_until < policy.days_before_event:
        return Response({"success": False, "data": None, "error": f"Refunds must be requested at least {policy.days_before_event} days before the event.", "meta": None}, status=400)

    refund_amount = (order.total * policy.refund_percent / 100).quantize(__import__("decimal").Decimal("0.01"))
    refund = Refund.objects.create(
        order=order,
        requested_by=request.user,
        reason=reason,
        amount=refund_amount,
    )
    return Response(api_response(data={"refund_id": str(refund.id), "amount": str(refund_amount), "status": refund.status}).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def list_refunds(request):
    qs = Refund.objects.select_related("order__event", "requested_by").order_by("-created_at")
    status_filter = request.query_params.get("status")
    if status_filter:
        qs = qs.filter(status=status_filter)
    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    data = [{"id": str(r.id), "order_number": r.order.order_number, "amount": str(r.amount), "status": r.status, "created_at": r.created_at} for r in page]
    return paginator.get_paginated_response(data)


@api_view(["POST"])
@permission_classes([IsAdminOrSuperAdmin])
def approve_refund(request, refund_id):
    try:
        refund = Refund.objects.get(id=refund_id, status="PENDING")
    except Refund.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)

    refund.status = "APPROVED"
    refund.approved_by = request.user
    refund.approved_at = timezone.now()
    refund.save()

    from apps.payouts.tasks import process_refund
    process_refund.delay(str(refund.id))
    return Response(api_response(data={"status": "APPROVED"}).data)


@api_view(["POST"])
@permission_classes([IsAdminOrSuperAdmin])
def reject_refund(request, refund_id):
    try:
        refund = Refund.objects.get(id=refund_id, status="PENDING")
    except Refund.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Not found.", "meta": None}, status=404)

    refund.status = "REJECTED"
    refund.rejected_by = request.user
    refund.rejected_at = timezone.now()
    refund.rejection_reason = request.data.get("reason", "")
    refund.save()
    return Response(api_response(data={"status": "REJECTED"}).data)
