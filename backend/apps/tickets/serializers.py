from rest_framework import serializers
from .models import Ticket


class TicketSerializer(serializers.ModelSerializer):
    tier_name = serializers.CharField(source="tier.name", read_only=True, allow_null=True)
    event_title = serializers.CharField(source="order.event.title", read_only=True)
    event_starts_at = serializers.DateTimeField(source="order.event.starts_at", read_only=True)
    event_venue = serializers.CharField(source="order.event.venue_name", read_only=True)
    event_city = serializers.CharField(source="order.event.venue_city", read_only=True)

    class Meta:
        model = Ticket
        fields = [
            "id", "ticket_number", "order_id", "tier_name",
            "event_title", "event_starts_at", "event_venue", "event_city",
            "status", "qr_token", "qr_code_url",
            "holder_name", "holder_email", "holder_phone",
            "checked_in_at", "created_at", "resale_price",
        ]


class AttendeeSerializer(serializers.ModelSerializer):
    tier_name = serializers.CharField(source="tier.name", read_only=True, allow_null=True)
    tier_id = serializers.CharField(source="tier.id", read_only=True, allow_null=True)
    order_date = serializers.DateTimeField(source="order.created_at", read_only=True)
    first_name = serializers.SerializerMethodField()
    last_name = serializers.SerializerMethodField()
    email = serializers.CharField(source="holder_email")
    phone = serializers.CharField(source="holder_phone")
    checked_in = serializers.SerializerMethodField()
    is_complimentary = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            "id", "ticket_number", "first_name", "last_name", "email", "phone",
            "tier_name", "tier_id", "order_date", "status", "checked_in", "checked_in_at",
            "is_complimentary", "notes"
        ]

    def get_first_name(self, obj):
        name = obj.holder_name.strip()
        if not name: return ""
        return name.split(" ")[0]
        
    def get_last_name(self, obj):
        name = obj.holder_name.strip()
        if not name or " " not in name: return ""
        return " ".join(name.split(" ")[1:])
        
    def get_checked_in(self, obj):
        return obj.checked_in_at is not None
        
    def get_is_complimentary(self, obj):
        if not obj.order: return False
        notes = obj.order.notes or ""
        return "[COMPLIMENTARY]" in notes or "[IMPORTED CSV]" in notes
