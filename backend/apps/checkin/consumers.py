import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

logger = logging.getLogger(__name__)


class CheckInConsumer(AsyncWebsocketConsumer):
    """
    Real-time check-in stats for gate staff.
    URL: /ws/checkin/<access_code>/
    Broadcasts scan results to all staff on the same access code group.
    """

    async def connect(self):
        self.access_code = self.scope["url_route"]["kwargs"]["access_code"]
        self.group_name = f"checkin_{self.access_code}"

        # Validate session exists and is active
        session = await self._get_session(self.access_code)
        if not session:
            await self.close(code=4004)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # Send current stats on connect
        stats = await self._get_stats(self.access_code)
        await self.send(text_data=json.dumps({"type": "stats", **stats}))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        pass  # Gate app only receives, doesn't send via WS

    async def scan_result(self, event):
        """Receive scan result from channel layer and forward to WebSocket."""
        await self.send(text_data=json.dumps(event))

    async def stats_update(self, event):
        """Receive stats update from channel layer."""
        await self.send(text_data=json.dumps(event))

    @database_sync_to_async
    def _get_session(self, access_code: str):
        from apps.events.models import Event
        return Event.objects.filter(checkin_access_code=access_code).first()

    @database_sync_to_async
    def _get_stats(self, access_code: str) -> dict:
        from apps.events.models import Event
        from apps.tickets.models import Ticket
        try:
            event = Event.objects.get(checkin_access_code=access_code)
            total_sold = Ticket.objects.filter(order__event=event, status__in=["ACTIVE", "USED"]).count()
            total_checked_in = Ticket.objects.filter(order__event=event, checked_in_at__isnull=False).count()
            return {
                "total_sold": total_sold,
                "total_checked_in": total_checked_in,
                "event_name": event.title,
            }
        except Exception:
            return {"total_sold": 0, "total_checked_in": 0}
