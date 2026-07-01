from django.urls import path
from . import cron_views

urlpatterns = [
    path("checkout-cleanup/", cron_views.checkout_cleanup),
    path("event-reminders/", cron_views.event_reminders),
    path("complete-events/", cron_views.complete_events),
    path("aggregate-analytics/", cron_views.aggregate_analytics),
]
