from django.urls import path
from . import views

urlpatterns = [
    # 8.1 / 8.2 — Organizer-facing
    path("organizer/overview/",     views.organizer_overview),
    path("organizer/demographics/", views.buyer_demographics),
    path("organizer/traffic/",      views.traffic_sources),
    path("organizer/performance/",  views.event_performance),

    # 8.3 — Platform-wide (admin only)
    path("admin/gmv/",         views.platform_gmv),
    path("admin/organizers/",  views.top_organizers),
    path("admin/categories/",  views.category_breakdown),
    path("admin/geo/",         views.geo_heatmap),
    path("admin/user-growth/", views.platform_user_growth),
    path("admin/funnel/",      views.platform_funnel),
    path("admin/live/",        views.platform_live_metrics),
    path("admin/tiers/",       views.platform_ticket_tiers),
]
