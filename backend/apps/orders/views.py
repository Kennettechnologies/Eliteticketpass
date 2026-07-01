import uuid
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone
from django.db import transaction
from django.db.models import F
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from core.exceptions import api_response, InsufficientStockError, CheckoutSessionExpiredError
from core.utils import generate_order_number, calculate_fees
from apps.events.models import Event, TicketTier
from apps.promos.models import PromoCode, PromoCodeUsage
from .models import Order, OrderItem


def _get_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    return xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR", "")


@api_view(["POST"])
@permission_classes([AllowAny])
def checkout_init(request):
    """
    Create a held order. Returns session_id, fee breakdown, expires_at.
    Body: { event_id, items: [{tier_id, quantity}], promo_code? }
    """
    event_id = request.data.get("event_id")
    items_data = request.data.get("items", [])
    promo_code_str = request.data.get("promo_code", "").strip().upper()

    # Validate event
    try:
        event = Event.objects.get(id=event_id, status="PUBLISHED")
    except Event.DoesNotExist:
        return Response(
            {"success": False, "data": None, "error": "Event not found or not available.", "meta": None},
            status=status.HTTP_404_NOT_FOUND,
        )

    if event.ends_at < timezone.now():
        return Response(
            {"success": False, "data": None, "error": "This event has ended.", "meta": None},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not items_data:
        return Response(
            {"success": False, "data": None, "error": "No items provided.", "meta": None},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # All tier validation, promo checks, and order creation run inside one
    # atomic block so that select_for_update() is always within a transaction.
    validated_items = []
    subtotal = Decimal("0")
    promo = None
    discount_amount = Decimal("0")
    fees = None
    hold_token = None
    order = None

    with transaction.atomic():
        for item in items_data:
            try:
                tier = TicketTier.objects.select_for_update().get(
                    id=item["tier_id"], event=event, is_active=True
                )
            except TicketTier.DoesNotExist:
                return Response(
                    {"success": False, "data": None, "error": f"Tier '{item.get('tier_id')}' not found.", "meta": None},
                    status=status.HTTP_404_NOT_FOUND,
                )

            qty = int(item.get("quantity", 1))
            now = timezone.now()

            if tier.sale_starts_at and tier.sale_starts_at > now:
                return Response(
                    {"success": False, "data": None, "error": f"Sales for '{tier.name}' have not started yet.", "meta": None},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if tier.sale_ends_at and tier.sale_ends_at < now:
                return Response(
                    {"success": False, "data": None, "error": f"Sales for '{tier.name}' have ended.", "meta": None},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if qty < tier.min_per_order:
                return Response(
                    {"success": False, "data": None, "error": f"Minimum {tier.min_per_order} tickets required for '{tier.name}'.", "meta": None},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if qty > tier.max_per_order:
                return Response(
                    {"success": False, "data": None, "error": f"Maximum {tier.max_per_order} tickets per order for '{tier.name}'.", "meta": None},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            available = tier.available
            if available < qty:
                raise InsufficientStockError(tier.name, available, qty)

            validated_items.append({"tier": tier, "quantity": qty, "unit_price": tier.price})
            subtotal += tier.price * qty

        # Validate promo code
        if promo_code_str:
            try:
                promo = PromoCode.objects.prefetch_related('events', 'applicable_tiers').get(
                    code=promo_code_str,
                    organizer=event.organizer,
                    is_active=True,
                )
                now = timezone.now()
                if promo.valid_from and promo.valid_from > now:
                    return Response({"success": False, "data": None, "error": "Promo code not yet valid.", "meta": None}, status=400)
                if promo.valid_until and promo.valid_until < now:
                    return Response({"success": False, "data": None, "error": "Promo code has expired.", "meta": None}, status=400)
                if promo.usage_limit and promo.usage_count >= promo.usage_limit:
                    return Response({"success": False, "data": None, "error": "Promo code usage limit reached.", "meta": None}, status=400)
                if promo.min_order_amount and subtotal < promo.min_order_amount:
                    return Response({"success": False, "data": None, "error": f"Minimum order KES {promo.min_order_amount} required.", "meta": None}, status=400)
                
                promo_events = promo.events.all()
                if promo_events.exists() and event not in promo_events:
                    return Response({"success": False, "data": None, "error": "Promo code is not applicable to this event.", "meta": None}, status=400)

                promo_tiers = promo.applicable_tiers.all()
                applicable_subtotal = Decimal("0")
                if promo_tiers.exists():
                    tier_ids = {t.id for t in promo_tiers}
                    for item in validated_items:
                        if item["tier"].id in tier_ids:
                            applicable_subtotal += item["unit_price"] * item["quantity"]
                    if applicable_subtotal == Decimal("0"):
                        return Response({"success": False, "data": None, "error": "Promo code is not applicable to selected tickets.", "meta": None}, status=400)
                else:
                    applicable_subtotal = subtotal

                if promo.promo_type == "PERCENTAGE":
                    discount_amount = (applicable_subtotal * promo.value / 100).quantize(Decimal("0.01"))
                else:
                    discount_amount = min(promo.value, applicable_subtotal)

                if promo.max_discount:
                    discount_amount = min(discount_amount, promo.max_discount)

            except PromoCode.DoesNotExist:
                return Response({"success": False, "data": None, "error": "Invalid promo code.", "meta": None}, status=400)

        organizer = event.organizer
        fees = calculate_fees(subtotal, discount_amount, organizer)

        order_number = generate_order_number()
        hold_token = uuid.uuid4()
        order = Order.objects.create(
            order_number=order_number,
            event=event,
            user=request.user if request.user.is_authenticated else None,
            status=Order.Status.PENDING,
            subtotal=fees.subtotal,
            discount_amount=fees.discount_amount,
            platform_fee=fees.platform_fee_total,
            total=fees.total,
            hold_token=hold_token,
            hold_expires_at=timezone.now() + timedelta(minutes=10),
            promo_code=promo,
            ip_address=_get_ip(request),
            user_agent=request.data.get("user_agent", request.META.get("HTTP_USER_AGENT", ""))[:512],
        )

        for item in validated_items:
            OrderItem.objects.create(
                order=order,
                tier=item["tier"],
                quantity=item["quantity"],
                unit_price=item["unit_price"],
                subtotal=item["unit_price"] * item["quantity"],
            )
            TicketTier.objects.filter(id=item["tier"].id).update(reserved=F("reserved") + item["quantity"])

    return Response(api_response(data={
        "session_id": str(hold_token),
        "order_id": str(order.id),
        "order_number": order.order_number,
        "items": [
            {
                "tier_id": str(i["tier"].id),
                "tier_name": i["tier"].name,
                "quantity": i["quantity"],
                "unit_price": str(i["unit_price"]),
                "subtotal": str(i["unit_price"] * i["quantity"]),
            }
            for i in validated_items
        ],
        "fee_breakdown": {
            "subtotal": str(fees.subtotal),
            "discount": str(fees.discount_amount),
            "platform_fee": str(fees.platform_fee_total),
            "total": str(fees.total),
            "fee_absorbed_by": fees.fee_absorbed_by,
        },
        "expires_at": order.hold_expires_at.isoformat(),
    }).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
def checkout_confirm(request):
    """
    Confirm the order with buyer details and initiate payment.
    Body: { session_id, buyer: {first_name, last_name, email, phone}, payment_method, mpesa_phone? }
    """
    session_id = request.data.get("session_id")
    buyer = request.data.get("buyer", {})
    payment_method = request.data.get("payment_method", "MPESA_STK")

    try:
        order = Order.objects.get(hold_token=session_id, status=Order.Status.PENDING)
    except Order.DoesNotExist:
        return Response(
            {"success": False, "data": None, "error": "Checkout session not found.", "meta": None},
            status=status.HTTP_404_NOT_FOUND,
        )

    if not order.verify_integrity():
        return Response(
            {"success": False, "data": None, "error": "Security Error: Order data integrity check failed. The checkout session has been frozen.", "meta": None},
            status=status.HTTP_403_FORBIDDEN,
        )

    if order.hold_expires_at < timezone.now():
        from apps.tickets.tasks import release_held_quantity
        release_held_quantity.delay(str(order.id))
        raise CheckoutSessionExpiredError()

    order.buyer_first_name = buyer.get("first_name", "")
    order.buyer_last_name = buyer.get("last_name", "")
    order.buyer_email = buyer.get("email", "")
    order.buyer_phone = buyer.get("phone", "")
    order.buyer_city = buyer.get("city", "")
    
    # Ensure user is linked even if checkout_init was called unauthenticated
    if order.user is None and request.user.is_authenticated:
        order.user = request.user
        
    if order.user and order.buyer_city and not order.user.city:
        order.user.city = order.buyer_city
        order.user.save(update_fields=["city"])
        
    # Enforce per_user_limit before finalizing
    if order.promo_code:
        promo = order.promo_code
        if promo.per_user_limit > 0:
            from apps.promos.models import PromoCodeUsage
            from django.db.models import Q
            usage_query = Q(user=order.user) if order.user else Q(order__buyer_email=order.buyer_email)
            usage_count_for_user = PromoCodeUsage.objects.filter(promo_code=promo).filter(usage_query).count()
            
            if usage_count_for_user >= promo.per_user_limit:
                # Remove promo from order and return error
                order.promo_code = None
                order.discount_amount = Decimal("0")
                from core.utils import calculate_fees
                fees = calculate_fees(order.subtotal, Decimal("0"), order.event.organizer)
                order.platform_fee = fees.platform_fee_total
                order.total = fees.total
                order.save()
                return Response(
                    {"success": False, "data": None, "error": f"You have reached the maximum usage limit ({promo.per_user_limit}) for this promo code.", "meta": None},
                    status=status.HTTP_400_BAD_REQUEST,
                )

    order.status = Order.Status.AWAITING_PAYMENT
    order.save()

    if payment_method == "FREE" or order.total == 0:
        from apps.payments.models import Payment
        from apps.tickets.tasks import issue_tickets_for_order
        from apps.notifications.tasks import send_ticket_confirmation_email
        Payment.objects.create(
            order=order,
            method=Payment.Method.FREE,
            status=Payment.Status.COMPLETED,
            amount=Decimal("0"),
            processed_at=timezone.now(),
        )
        issue_tickets_for_order.apply(args=[str(order.id)])
        # Send confirmation email synchronously (no Celery needed)
        send_ticket_confirmation_email.apply(args=[str(order.id)])
        order.refresh_from_db()
        tickets = [
            {
                "id": str(t.id),
                "ticket_number": t.ticket_number,
                "holder_name": t.holder_name,
                "tier_name": t.tier.name if t.tier else "",
                "qr_code_url": t.qr_code_url,
                "qr_token": str(t.qr_token),
                "status": t.status,
            }
            for t in order.tickets.select_related("tier").all()
        ]
        return Response(api_response(data={
            "order_id": str(order.id),
            "order_number": order.order_number,
            "order_status": "CONFIRMED",
            "status": "CONFIRMED",
            "paid": True,
            "tickets": tickets,
        }).data)

#     if payment_method == "MPESA_STK":
#         from apps.payments.models import Payment
#         from apps.payments.tasks import initiate_mpesa_stk
#         phone = request.data.get("mpesa_phone") or order.buyer_phone
#         payment = Payment.objects.create(
#             order=order,
#             method=Payment.Method.MPESA_STK,
#             status=Payment.Status.PROCESSING,
#             amount=order.total,
#             mpesa_phone=phone,
#         )
#         initiate_mpesa_stk.delay(str(payment.id), phone, float(order.total), order.order_number)
#         return Response(api_response(data={
#             "order_id": str(order.id),
#             "payment_id": str(payment.id),
#             "method": "MPESA_STK",
#             "status": "PROCESSING",
#             "message": "Check your phone for the M-Pesa prompt.",
#         }).data)

#     if payment_method == "CARD_STRIPE":
#         import stripe
#         from django.conf import settings as django_settings
#         stripe.api_key = django_settings.STRIPE_SECRET_KEY
#         from apps.payments.models import Payment
#         intent = stripe.PaymentIntent.create(
#             amount=int(order.total * 100),
#             currency="kes",
#             metadata={"order_id": str(order.id), "order_number": order.order_number},
#         )
#         payment = Payment.objects.create(
#             order=order,
#             method=Payment.Method.CARD_STRIPE,
#             status=Payment.Status.PROCESSING,
#             amount=order.total,
#             stripe_payment_intent_id=intent["id"],
#         )
#         return Response(api_response(data={
#             "order_id": str(order.id),
#             "payment_id": str(payment.id),
#             "client_secret": intent["client_secret"],
#             "method": "CARD_STRIPE",
#         }).data)

    if payment_method == "CARD_PAYSTACK":
        from apps.payments.models import Payment
        from apps.payments.paystack_service import paystack_client
        import uuid
        
        reference = f"chk_{order.order_number}_{uuid.uuid4().hex[:8]}"
        amount_kobo = int(order.total * 100)
        
        try:
            res = paystack_client.initialize_transaction(
                email=order.buyer_email,
                amount_kobo=amount_kobo,
                reference=reference,
                metadata={"order_id": str(order.id), "order_number": order.order_number}
            )
            
            payment = Payment.objects.create(
                order=order,
                method=Payment.Method.CARD_PAYSTACK,
                status=Payment.Status.PROCESSING,
                amount=order.total,
                paystack_reference=reference,
            )
            
            return Response(api_response(data={
                "order_id": str(order.id),
                "payment_id": str(payment.id),
                "authorization_url": res["authorization_url"],
                "access_code": res["access_code"],
                "reference": reference,
                "method": "CARD_PAYSTACK",
            }).data)
        except Exception as e:
            return Response(
                {"success": False, "data": None, "error": f"Paystack initialization failed: {str(e)}", "meta": None},
                status=status.HTTP_400_BAD_REQUEST,
            )

    return Response(
        {"success": False, "data": None, "error": f"Unsupported payment method: {payment_method}", "meta": None},
        status=status.HTTP_400_BAD_REQUEST,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def checkout_status(request):
    """Poll order status. Returns full order data + tickets when confirmed."""
    order_id = request.query_params.get("order_id")
    try:
        order = Order.objects.select_related("event__organizer", "event__category").prefetch_related(
            "items__tier", "tickets__tier", "payments"
        ).get(id=order_id)
    except Order.DoesNotExist:
        return Response(
            {"success": False, "data": None, "error": "Order not found.", "meta": None},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Fallback STK Query if MPESA payment stuck > 30s
    if order.status == Order.Status.AWAITING_PAYMENT:
        payment = order.payments.filter(method="MPESA_STK", status="PROCESSING").first()
        if payment and (timezone.now() - payment.created_at).seconds > 30:
            if payment.mpesa_checkout_request_id:
                from core.mpesa import daraja
                try:
                    result = daraja.query_stk_status(payment.mpesa_checkout_request_id)
                    if result["result_code"] == "0":
                        from apps.tickets.tasks import issue_tickets_for_order
                        payment.status = "COMPLETED"
                        payment.save(update_fields=["status"])
                        issue_tickets_for_order.delay(str(order.id))
                    elif result["result_code"] in ("1032", "1037"):
                        payment.status = "CANCELLED"
                        payment.failure_reason = result["result_desc"]
                        payment.save(update_fields=["status", "failure_reason"])
                        order.status = Order.Status.CANCELLED
                        order.save(update_fields=["status"])
                except Exception:
                    pass

    tickets = []
    if order.status == Order.Status.CONFIRMED:
        tickets = [
            {
                "id": str(t.id),
                "ticket_number": t.ticket_number,
                "holder_name": t.holder_name,
                "tier_name": t.tier.name if t.tier else "",
                "qr_code_url": t.qr_code_url,
                "qr_token": str(t.qr_token),
                "status": t.status,
            }
            for t in order.tickets.all()
        ]

    event = order.event
    items_data = [
        {
            "tier_id": str(item.tier_id),
            "tier_name": item.tier.name if item.tier else "",
            "quantity": item.quantity,
            "unit_price": str(item.unit_price),
            "subtotal": str(item.subtotal),
        }
        for item in order.items.all()
    ]

    return Response(api_response(data={
        # Order identity
        "session_id": str(order.hold_token),
        "order_id": str(order.id),
        "order_number": order.order_number,
        "order_status": order.status,
        "paid": order.status == Order.Status.CONFIRMED,
        # Event info
        "event_title": event.title if event else "",
        "event_slug": event.slug if event else "",
        "event_cover_url": event.cover_image_url if event else "",
        "event_date": event.starts_at.isoformat() if event else "",
        "venue_name": event.venue_name if event else "",
        "venue_city": event.venue_city if event else "",
        # Line items & fees
        "items": items_data,
        "fee_breakdown": {
            "subtotal": str(order.subtotal),
            "discount": str(order.discount_amount),
            "platform_fee": str(order.platform_fee),
            "total": str(order.total),
        },
        "is_free": order.total == 0,
        "expires_at": order.hold_expires_at.isoformat() if order.hold_expires_at else None,
        # Tickets (only when confirmed)
        "tickets": tickets,
        "failure_reason": getattr(order, "cancel_reason", "") or "",
    }).data)


@api_view(["POST"])
@permission_classes([AllowAny])
def validate_promo(request):
    """Validate and apply a promo code to an existing checkout session."""
    session_id = request.data.get("session_id")
    code = request.data.get("promo_code", "").strip().upper()
    
    try:
        order = Order.objects.prefetch_related("items__tier").get(hold_token=session_id, status=Order.Status.PENDING)
    except Order.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Checkout session not found.", "meta": None}, status=404)

    try:
        promo = PromoCode.objects.prefetch_related('events', 'applicable_tiers').get(code=code, organizer=order.event.organizer, is_active=True)
    except PromoCode.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Invalid promo code.", "meta": None}, status=400)

    now = timezone.now()
    if promo.valid_from and promo.valid_from > now:
        return Response({"success": False, "data": None, "error": "Promo code not yet valid.", "meta": None}, status=400)
    if promo.valid_until and promo.valid_until < now:
        return Response({"success": False, "data": None, "error": "Promo code has expired.", "meta": None}, status=400)
    if promo.usage_limit and promo.usage_count >= promo.usage_limit:
        return Response({"success": False, "data": None, "error": "Usage limit reached.", "meta": None}, status=400)

    if promo.per_user_limit > 0 and request.user.is_authenticated:
        from apps.promos.models import PromoCodeUsage
        usage_count_for_user = PromoCodeUsage.objects.filter(promo_code=promo, user=request.user).count()
        if usage_count_for_user >= promo.per_user_limit:
            return Response({"success": False, "data": None, "error": f"You have already used this promo code {promo.per_user_limit} times.", "meta": None}, status=400)

    promo_events = promo.events.all()
    if promo_events.exists() and order.event not in promo_events:
        return Response({"success": False, "data": None, "error": "Promo code is not applicable to this event.", "meta": None}, status=400)

    promo_tiers = promo.applicable_tiers.all()
    applicable_subtotal = Decimal("0")
    if promo_tiers.exists():
        tier_ids = {t.id for t in promo_tiers}
        for item in order.items.all():
            if item.tier_id in tier_ids:
                applicable_subtotal += item.subtotal
        if applicable_subtotal == Decimal("0"):
            return Response({"success": False, "data": None, "error": "Promo code is not applicable to selected tickets.", "meta": None}, status=400)
    else:
        applicable_subtotal = order.subtotal
        
    if promo.min_order_amount and order.subtotal < promo.min_order_amount:
        return Response({"success": False, "data": None, "error": f"Minimum order KES {promo.min_order_amount} required.", "meta": None}, status=400)

    if promo.promo_type == "PERCENTAGE":
        discount = (applicable_subtotal * promo.value / 100).quantize(Decimal("0.01"))
    else:
        discount = min(promo.value, applicable_subtotal)
    if promo.max_discount:
        discount = min(discount, promo.max_discount)
        
    from core.utils import calculate_fees
    fees = calculate_fees(order.subtotal, discount, order.event.organizer)
    
    order.promo_code = promo
    order.discount_amount = fees.discount_amount
    order.platform_fee = fees.platform_fee_total
    order.total = fees.total
    order.save(update_fields=["promo_code", "discount_amount", "platform_fee", "total"])

    return Response(api_response(data={
        "fee_breakdown": {
            "subtotal": str(order.subtotal),
            "discount": str(order.discount_amount),
            "platform_fee": str(order.platform_fee),
            "total": str(order.total),
            "fee_absorbed_by": fees.fee_absorbed_by,
        }
    }).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_orders(request):
    from .serializers import OrderSummarySerializer
    from core.pagination import StandardPagination

    qs = (
        Order.objects.filter(user=request.user)
        .select_related("event")
        .prefetch_related("items__tier", "payments", "refunds")
        .order_by("-created_at")
    )

    status_filter = request.query_params.get("status")
    if status_filter:
        qs = qs.filter(status=status_filter)

    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    return paginator.get_paginated_response(OrderSummarySerializer(page, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def order_detail(request, order_id):
    from .serializers import OrderSummarySerializer
    try:
        order = (
            Order.objects.filter(user=request.user)
            .select_related("event")
            .prefetch_related("items__tier", "payments", "refunds")
            .get(id=order_id)
        )
    except Order.DoesNotExist:
        return Response({"success": False, "data": None, "error": "Order not found.", "meta": None}, status=404)
    return Response(api_response(data=OrderSummarySerializer(order).data).data)
