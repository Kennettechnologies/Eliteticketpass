from django.db.models import Avg, Count, Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from core.exceptions import api_response
from core.permissions import IsApprovedOrganizer, IsOrganizersEvent
from .models import Event, EventCategory, TicketTier, SavedEvent, EventReview
from .serializers import EventListSerializer, EventDetailSerializer, TicketTierSerializer, EventCreateSerializer, EventCategorySerializer
from .filters import EventFilter


class EventViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = EventFilter
    search_fields = ["title", "short_description", "venue_city"]
    ordering_fields = ["starts_at", "created_at", "view_count"]
    ordering = ["starts_at"]
    lookup_field = "slug"

    def get_queryset(self):
        is_org = self.request.user.is_authenticated and self.request.user.role == "ORGANIZER"
        
        if is_org:
            if self.request.query_params.get("mine") == "true" or self.action not in ("list", "retrieve", "featured"):
                return Event.objects.filter(organizer__user=self.request.user).select_related("organizer", "category").prefetch_related("ticket_tiers")
            if self.action == "retrieve":
                return Event.objects.filter(
                    Q(status="PUBLISHED", is_public=True) | Q(organizer__user=self.request.user)
                ).select_related("organizer", "category").prefetch_related("ticket_tiers").distinct()

        qs = Event.objects.filter(status="PUBLISHED", is_public=True).select_related(
            "organizer", "category"
        ).prefetch_related("ticket_tiers")

        if self.action in ("list", "featured"):
            qs = qs.filter(ends_at__gte=timezone.now())
            
        return qs

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return EventCreateSerializer
        if self.action in ("list", "featured"):
            return EventListSerializer
        return EventDetailSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "publish", "postpone", "duplicate"):
            return [IsAuthenticated(), IsApprovedOrganizer()]
        return [AllowAny()]

    def perform_create(self, serializer):
        organizer = self.request.user.organizer_profile
        serializer.save(organizer=organizer, status="DRAFT")

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            from apps.analytics.tasks import increment_event_view
            increment_event_view.delay(str(instance.id))
        except Exception:
            pass
        serializer = self.get_serializer(instance)
        return Response(api_response(data=serializer.data).data)

    @action(detail=False, methods=["get"], url_path="featured")
    def featured(self, request):
        from apps.admin_panel.models import HomepageSlot
        slots = HomepageSlot.objects.filter(
            is_active=True, slot_type="featured"
        ).select_related("event__organizer", "event__category").order_by("position")
        events = [s.event for s in slots if s.event and s.event.status == "PUBLISHED"]
        ser = EventListSerializer(events, many=True)
        return Response(api_response(data=ser.data).data)

    @action(detail=False, methods=["get"], url_path="categories")
    def categories(self, request):
        cats = EventCategory.objects.filter(is_active=True).order_by("sort_order")
        ser = EventCategorySerializer(cats, many=True)
        return Response(api_response(data=ser.data).data)

    @action(detail=True, methods=["post"])
    def publish(self, request, slug=None):
        event = self.get_object()
        if not event.ticket_tiers.filter(is_active=True).exists():
            return Response(
                {"success": False, "data": None, "error": "At least one active tier required.", "meta": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not event.cover_image_url:
            return Response(
                {"success": False, "data": None, "error": "Cover image required.", "meta": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if event.starts_at < timezone.now():
            return Response(
                {"success": False, "data": None, "error": "Event start date must be in the future.", "meta": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        event.status = "PUBLISHED"
        event.published_at = timezone.now()
        event.save(update_fields=["status", "published_at"])
        return Response(api_response(data={"status": "PUBLISHED"}).data)

    @action(detail=True, methods=["post"])
    def postpone(self, request, slug=None):
        event = self.get_object()
        postponed_to = request.data.get("postponed_to")
        note = request.data.get("note", "")
        event.status = "POSTPONED"
        event.postponed_to = postponed_to
        event.postpone_note = note
        event.save(update_fields=["status", "postponed_to", "postpone_note"])
        from apps.notifications.tasks import send_cancellation_notifications
        send_cancellation_notifications.delay(str(event.id))
        return Response(api_response(data={"status": "POSTPONED"}).data)

    @action(detail=True, methods=["post"])
    def duplicate(self, request, slug=None):
        event = self.get_object()
        tiers = list(event.ticket_tiers.all())
        event.pk = None
        event.slug = f"{event.slug}-copy"
        event.status = "DRAFT"
        event.published_at = None
        event.save()
        for tier in tiers:
            tier.pk = None
            tier.event = event
            tier.sold = 0
            tier.reserved = 0
            tier.save()
        return Response(api_response(data=EventDetailSerializer(event).data).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def analytics(self, request, slug=None):
        from apps.analytics.models import EventAnalyticsDaily, TrafficSource
        event = self.get_object()
        if not (request.user.is_authenticated and (
            request.user.role in ("ADMIN", "SUPER_ADMIN") or
            (hasattr(request.user, "organizer_profile") and event.organizer.user == request.user)
        )):
            return Response({"success": False, "data": None, "error": "Forbidden.", "meta": None}, status=403)
        rows = EventAnalyticsDaily.objects.filter(event=event).order_by("date")
        sources = TrafficSource.objects.filter(event=event).values("source").annotate(total=Count("visits"))
        return Response(api_response(data={
            "daily": list(rows.values()),
            "traffic_sources": list(sources),
        }).data)

    @action(detail=False, methods=["get"], url_path="saved", permission_classes=[IsAuthenticated])
    def saved_list(self, request):
        from .serializers import EventListSerializer
        saved = SavedEvent.objects.filter(user=request.user).select_related(
            "event__organizer", "event__category"
        ).prefetch_related("event__ticket_tiers").order_by("-created_at")
        data = []
        for s in saved:
            ser = EventListSerializer(s.event, context={"request": request})
            data.append({"id": str(s.id), "event": ser.data, "saved_at": s.created_at.isoformat()})
        return Response(api_response(data={"results": data, "count": len(data)}).data)

    @action(detail=True, methods=["post", "delete"], url_path="save", permission_classes=[IsAuthenticated])
    def save_toggle(self, request, slug=None):
        import uuid as _uuid
        try:
            _uuid.UUID(str(slug))
            event = Event.objects.get(id=slug)
        except (ValueError, AttributeError, Event.DoesNotExist):
            event = self.get_object()
        if request.method == "DELETE":
            SavedEvent.objects.filter(user=request.user, event=event).delete()
            return Response(api_response(data={"saved": False}).data)
        obj, created = SavedEvent.objects.get_or_create(user=request.user, event=event)
        return Response(api_response(data={"saved": True, "created": created}).data)

    def destroy(self, request, *args, **kwargs):
        event = self.get_object()
        event.status = "CANCELLED"
        event.cancel_reason = request.data.get("reason", "")
        event.save(update_fields=["status", "cancel_reason"])
        from apps.notifications.tasks import send_cancellation_notifications
        send_cancellation_notifications.delay(str(event.id))
        return Response(api_response(data={"status": "CANCELLED"}).data)


class TicketTierViewSet(viewsets.ModelViewSet):
    serializer_class = TicketTierSerializer
    permission_classes = [IsAuthenticated, IsApprovedOrganizer]
    lookup_field = "id"

    def get_queryset(self):
        return TicketTier.objects.filter(event__slug=self.kwargs["event_slug"])

    def perform_create(self, serializer):
        event = Event.objects.get(slug=self.kwargs["event_slug"], organizer__user=self.request.user)
        serializer.save(event=event)

    def destroy(self, request, *args, **kwargs):
        tier = self.get_object()
        if tier.sold > 0:
            return Response(
                {"success": False, "data": None, "error": "Cannot delete a tier with tickets sold.", "meta": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        tier.delete()
        return Response(api_response(data={"deleted": True}).data)

    @action(detail=True, methods=["patch"], url_path="toggle")
    def toggle(self, request, **kwargs):
        tier = self.get_object()
        tier.is_active = not tier.is_active
        tier.save(update_fields=["is_active"])
        return Response(api_response(data={"is_active": tier.is_active}).data)
