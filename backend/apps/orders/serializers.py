from rest_framework import serializers
from .models import Order, OrderItem


class OrderItemSerializer(serializers.ModelSerializer):
    tier_name = serializers.CharField(source="tier.name", read_only=True)
    class Meta:
        model = OrderItem
        fields = ["id", "tier_id", "tier_name", "quantity", "unit_price", "subtotal"]


class OrderSummarySerializer(serializers.ModelSerializer):
    event_title = serializers.CharField(source="event.title", read_only=True)
    event_slug  = serializers.CharField(source="event.slug",  read_only=True)
    payment_method = serializers.SerializerMethodField()
    refund_status  = serializers.SerializerMethodField()
    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "order_number", "event_id", "event_title", "event_slug", "status",
            "buyer_first_name", "buyer_last_name", "buyer_email",
            "subtotal", "discount_amount", "platform_fee", "total",
            "payment_method", "refund_status",
            "items", "confirmed_at", "created_at",
        ]

    def get_payment_method(self, obj):
        payment = obj.payments.order_by("-created_at").first()
        return payment.method if payment else "FREE"

    def get_refund_status(self, obj):
        try:
            refund = obj.refunds.order_by("-created_at").first()
            return refund.status if refund else None
        except Exception:
            return None
