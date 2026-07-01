from rest_framework import serializers
from .models import Event, EventCategory, TicketTier, EventGallery, EventReview, RefundPolicy


class EventCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = EventCategory
        fields = ["id", "name", "slug", "icon_url", "color_hex"]


class TicketTierSerializer(serializers.ModelSerializer):
    available = serializers.ReadOnlyField()

    class Meta:
        model = TicketTier
        fields = [
            "id", "name", "description", "price", "quantity", "sold", "reserved",
            "available", "max_per_order", "min_per_order", "visibility",
            "sale_starts_at", "sale_ends_at", "is_active", "is_free",
            "is_group_tier", "group_size", "color", "perks", "sort_order",
        ]
        read_only_fields = ["sold", "reserved"]


class OrganizerCardSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.SerializerMethodField()
    slug = serializers.SlugField()
    logo_url = serializers.URLField()
    is_verified = serializers.BooleanField()
    follower_count = serializers.SerializerMethodField()
    is_following = serializers.SerializerMethodField()

    def get_name(self, obj):
        return obj.display_name or obj.name
        
    def get_follower_count(self, obj):
        if hasattr(obj, 'followers'):
            return obj.followers.count()
        return 0

    def get_is_following(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            return obj.followers.filter(user=request.user).exists()
        return False


class EventListSerializer(serializers.ModelSerializer):
    min_price = serializers.ReadOnlyField()
    max_price = serializers.ReadOnlyField()
    tickets_remaining = serializers.ReadOnlyField()
    organizer_name = serializers.CharField(source="organizer.name", read_only=True)
    organizer_logo = serializers.URLField(source="organizer.logo_url", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True, allow_null=True)
    category_color = serializers.CharField(source="category.color_hex", read_only=True, allow_null=True)

    class Meta:
        model = Event
        fields = [
            "id", "slug", "title", "short_description", "cover_image_url",
            "starts_at", "ends_at", "venue_city", "venue_name",
            "organizer_name", "organizer_logo",
            "min_price", "max_price", "is_free",
            "tickets_remaining", "is_featured",
            "category_name", "category_color", "event_type", "status",
        ]


class EventDetailSerializer(serializers.ModelSerializer):
    ticket_tiers = TicketTierSerializer(many=True, read_only=True)
    gallery = serializers.SerializerMethodField()
    avg_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    min_price = serializers.ReadOnlyField()
    max_price = serializers.ReadOnlyField()
    tickets_remaining = serializers.ReadOnlyField()
    refund_policies = serializers.SerializerMethodField()
    organizer = OrganizerCardSerializer(read_only=True)

    class Meta:
        model = Event
        fields = "__all__"

    def get_gallery(self, obj):
        return list(obj.gallery.values("id", "image_url", "caption", "sort_order"))

    def get_avg_rating(self, obj):
        result = obj.reviews.filter(is_visible=True).aggregate(avg=__import__("django.db.models", fromlist=["Avg"]).Avg("rating"))
        return result["avg"]

    def get_review_count(self, obj):
        return obj.reviews.filter(is_visible=True).count()

    def get_refund_policies(self, obj):
        return list(obj.refund_policies.values("days_before_event", "refund_percent", "description"))


class EventCreateSerializer(serializers.ModelSerializer):
    ticket_tiers = TicketTierSerializer(many=True, required=False, write_only=True)
    slug = serializers.SlugField(required=False)
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=EventCategory.objects.all(), source="category", required=False, allow_null=True
    )
    age_restriction = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = Event
        exclude = ["organizer", "status", "published_at", "completed_at", "view_count", "share_count", "category"]

    def create(self, validated_data):
        from django.utils.text import slugify
        import uuid
        if not validated_data.get("slug"):
            base_slug = slugify(validated_data.get("title", "event"))
            validated_data["slug"] = f"{base_slug}-{str(uuid.uuid4())[:8]}"

        tiers_data = validated_data.pop("ticket_tiers", [])
        event = Event.objects.create(**validated_data)
        for tier_data in tiers_data:
            TicketTier.objects.create(event=event, **tier_data)
        return event

    def update(self, instance, validated_data):
        validated_data.pop("ticket_tiers", None)
        return super().update(instance, validated_data)
