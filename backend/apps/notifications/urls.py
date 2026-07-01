from django.urls import path
from . import views

urlpatterns = [
    path("", views.list_notifications),
    path("<uuid:notif_id>/read/", views.mark_read),
    path("read-all/", views.mark_all_read),
    path("preferences/", views.preferences),
    path("push-subscribe/", views.push_subscribe),
    path("push-unsubscribe/", views.push_unsubscribe),
]
