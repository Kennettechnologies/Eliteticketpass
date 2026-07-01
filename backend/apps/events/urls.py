from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EventViewSet, TicketTierViewSet

router = DefaultRouter()
router.register(r"", EventViewSet, basename="events")

tier_router = DefaultRouter()
tier_router.register(r"tiers", TicketTierViewSet, basename="tiers")

urlpatterns = [
    path("", include(router.urls)),
    path("<slug:event_slug>/", include(tier_router.urls)),
]
