from django.urls import path
from . import views

urlpatterns = [
    path("",                         views.promo_codes),
    path("bulk-generate/",           views.bulk_generate),
    path("<uuid:promo_id>/",         views.promo_detail),
    path("<uuid:promo_id>/usage/",   views.promo_usage),
]
