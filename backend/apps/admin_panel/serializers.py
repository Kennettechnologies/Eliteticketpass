from rest_framework import serializers
from apps.users.models import User
from apps.orders.models import Order
from apps.events.models import Event
from apps.payouts.models import Payout


class AdminUserListSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    is_email_verified = serializers.BooleanField(source="email_verified")
    total_spent = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    total_events = serializers.IntegerField(read_only=True)
    total_orders = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "email", "full_name", "phone", "role", "status",
            "is_email_verified", "created_at", "last_login",
            "total_orders", "total_spent", "total_events", "avatar_url"
        ]


class AdminUserOrderSerializer(serializers.ModelSerializer):
    event_title = serializers.CharField(source="event.title", read_only=True)
    
    class Meta:
        model = Order
        fields = ["id", "order_number", "event_title", "total", "status", "created_at"]


class AdminUserEventSerializer(serializers.ModelSerializer):
    tickets_sold = serializers.IntegerField(read_only=True)
    gross = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Event
        fields = ["id", "title", "starts_at", "tickets_sold", "gross"]


class AdminUserPayoutSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payout
        fields = ["id", "amount", "status", "created_at"]


class AdminUserDetailSerializer(AdminUserListSerializer):
    orders = serializers.SerializerMethodField()
    events = serializers.SerializerMethodField()
    payouts = serializers.SerializerMethodField()

    class Meta(AdminUserListSerializer.Meta):
        fields = AdminUserListSerializer.Meta.fields + ["orders", "events", "payouts"]

    def get_orders(self, obj):
        qs = Order.objects.filter(user=obj).select_related("event").order_by("-created_at")[:10]
        return AdminUserOrderSerializer(qs, many=True).data

    def get_events(self, obj):
        from django.db.models import Count, Sum, Q
        from django.db.models.functions import Coalesce
        from decimal import Decimal
        qs = Event.objects.filter(organizer__user=obj).annotate(
            tickets_sold=Count("orders__tickets", filter=Q(orders__status="CONFIRMED")),
            gross=Coalesce(Sum("orders__total", filter=Q(orders__status="CONFIRMED")), Decimal("0"))
        ).order_by("-created_at")[:10]
        return AdminUserEventSerializer(qs, many=True).data

    def get_payouts(self, obj):
        qs = Payout.objects.filter(organizer__user=obj).order_by("-created_at")[:10]
        return AdminUserPayoutSerializer(qs, many=True).data

class AdminOrganizerListSerializer(serializers.ModelSerializer):
    total_events = serializers.IntegerField(read_only=True)
    total_gross = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_payouts = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    email = serializers.CharField(source="contact_email", read_only=True)
    platform_fee_override = serializers.SerializerMethodField()

    class Meta:
        from apps.organizers.models import Organizer
        model = Organizer
        fields = [
            "id", "display_name", "email", "contact_phone", "status", "tier",
            "kyc_status", "created_at", "total_events", "total_gross", "total_payouts",
            "platform_fee_override", "logo_url"
        ]

    def get_platform_fee_override(self, obj):
        if obj.custom_fee_percent is not None or obj.custom_fee_flat is not None:
            return {
                "pct": float(obj.custom_fee_percent) if obj.custom_fee_percent else 0,
                "flat": float(obj.custom_fee_flat) if obj.custom_fee_flat else 0
            }
        return None

class AdminOrganizerDetailSerializer(AdminOrganizerListSerializer):
    kyc_docs = serializers.SerializerMethodField()
    events = serializers.SerializerMethodField()
    payouts = serializers.SerializerMethodField()

    class Meta(AdminOrganizerListSerializer.Meta):
        fields = AdminOrganizerListSerializer.Meta.fields + ["bio", "website_url", "kyc_docs", "events", "payouts"]

    def get_kyc_docs(self, obj):
        from apps.organizers.models import KycDocument
        docs = KycDocument.objects.filter(organizer=obj).order_by("-uploaded_at")
        return [{"id": str(d.id), "type": d.doc_type, "file_url": d.file_url, "uploaded_at": d.uploaded_at} for d in docs]

    def get_events(self, obj):
        from django.db.models import Count, Sum, Q
        from django.db.models.functions import Coalesce
        from decimal import Decimal
        qs = Event.objects.filter(organizer=obj).annotate(
            tickets_sold_count=Count("orders__tickets", filter=Q(orders__status="CONFIRMED")),
            gross_amount=Coalesce(Sum("orders__total", filter=Q(orders__status="CONFIRMED")), Decimal("0"))
        ).order_by("-created_at")[:20]
        return [{"id": str(e.id), "title": e.title, "starts_at": e.starts_at, "status": e.status, "tickets_sold": e.tickets_sold_count, "gross": e.gross_amount} for e in qs]

    def get_payouts(self, obj):
        qs = Payout.objects.filter(organizer=obj).order_by("-created_at")[:20]
        return [{"id": str(p.id), "amount": p.amount, "status": p.status, "created_at": p.created_at} for p in qs]

class AdminEventSerializer(serializers.ModelSerializer):
    tickets_sold = serializers.IntegerField(read_only=True, default=0)
    capacity = serializers.IntegerField(source="venue_capacity", read_only=True)
    gross = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True, default=0)
    organizer_name = serializers.CharField(source="organizer.name", read_only=True)
    organizer_id = serializers.CharField(source="organizer.id", read_only=True)
    is_homepage_banner = serializers.SerializerMethodField()
    flag_reason = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            "id", "title", "slug", "organizer_name", "organizer_id", "status",
            "starts_at", "venue_city", "cover_image_url", "tickets_sold",
            "capacity", "gross", "is_featured", "is_homepage_banner",
            "flag_reason", "created_at"
        ]

    def get_is_homepage_banner(self, obj):
        return getattr(obj, "is_homepage_banner", False)

    def get_flag_reason(self, obj):
        return getattr(obj, "flag_reason", None)
