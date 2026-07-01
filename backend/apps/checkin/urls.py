from django.urls import path
from . import views

urlpatterns = [
    path("scan/", views.scan),
    path("session/<str:access_code>/", views.session_detail),
    path("session/<str:access_code>/stats/", views.session_stats),
]
