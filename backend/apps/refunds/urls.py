from django.urls import path
from . import views

urlpatterns = [
    path("", views.request_refund, {"methods": ["POST"]}),
    path("list/", views.list_refunds),
    path("<uuid:refund_id>/approve/", views.approve_refund),
    path("<uuid:refund_id>/reject/", views.reject_refund),
]
