from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r"api/v1/ws/checkin/(?P<access_code>[A-Za-z0-9_-]+)/$", consumers.CheckInConsumer.as_asgi()),
]
