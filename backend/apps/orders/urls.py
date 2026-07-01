from django.urls import path
from . import views

urlpatterns = [
    path("init/", views.checkout_init),
    path("confirm/", views.checkout_confirm),
    path("status/", views.checkout_status),
    path("apply-promo/", views.validate_promo),
    path("my/", views.my_orders),
    path("<uuid:order_id>/", views.order_detail),
]
