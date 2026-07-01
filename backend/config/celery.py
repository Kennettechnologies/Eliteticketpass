import os
from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

app = Celery("eliteticketpass")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f"Request: {self.request!r}")

from celery.schedules import crontab

app.conf.beat_schedule = {
    "aggregate-daily-analytics": {
        "task": "analytics.run_daily_analytics_cron",
        "schedule": crontab(hour=1, minute=0),
    },
    "checkout-cleanup": {
        "task": "admin_panel.run_checkout_cleanup_cron",
        "schedule": crontab(minute="*/5"),  # every 5 minutes
    },
    "event-reminders": {
        "task": "admin_panel.run_event_reminders_cron",
        "schedule": crontab(hour=8, minute=0),  # every day at 8:00 AM
    },
    "complete-events": {
        "task": "admin_panel.run_complete_events_cron",
        "schedule": crontab(minute=0),  # every hour
    },
    "send-scheduled-reports": {
        "task": "admin_panel.send_scheduled_reports",
        "schedule": crontab(hour=8, minute=0, day_of_week=1),  # every monday at 8am
    },
}
