from django.urls import path
from . import views

urlpatterns = [
    path("list/", views.list_payouts),
    path("request/", views.request_payout),
]
