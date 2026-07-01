from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView
from apps.organizers.urls import public_urlpatterns as organizer_public_urls

urlpatterns = [
    path("django-admin/", admin.site.urls),

    # API schema
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/schema/swagger/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/schema/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),

    # API v1
    path("api/v1/auth/", include("apps.users.urls")),
    path("api/v1/events/", include("apps.events.urls")),
    path("api/v1/checkout/", include("apps.orders.urls")),
    path("api/v1/orders/", include("apps.orders.urls")),
    path("api/v1/mpesa/", include("apps.payments.mpesa_urls")),
    path("api/v1/stripe/", include("apps.payments.stripe_urls")),
    path("api/v1/tickets/", include("apps.tickets.urls")),
    path("api/v1/checkin/", include("apps.checkin.urls")),
    path("api/v1/organizer/", include("apps.organizers.urls")),
    path("api/v1/organizers/", include(organizer_public_urls)),
    path("api/v1/organizer/promos/",       include("apps.promos.urls")),
    path("api/v1/organizer/promo-codes/",  include("apps.promos.urls")),
    path("api/v1/refunds/", include("apps.refunds.urls")),
    path("api/v1/notifications/", include("apps.notifications.urls")),
    path("api/v1/admin/", include("apps.admin_panel.urls")),
    path("api/v1/config/", __import__("apps.admin_panel.views").admin_panel.views.public_config),
    path("api/v1/cron/", include("apps.admin_panel.cron_urls")),
    path("api/v1/analytics/", include("apps.analytics.urls")),
    path("api/v1/payments/", include("apps.payments.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
