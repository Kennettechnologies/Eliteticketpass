from django.db import models


class EventAnalyticsDaily(models.Model):
    event = models.ForeignKey("events.Event", on_delete=models.CASCADE, related_name="analytics_daily")
    date = models.DateField()
    views = models.PositiveIntegerField(default=0)
    checkout_starts = models.PositiveIntegerField(default=0)
    orders_created = models.PositiveIntegerField(default=0)
    orders_confirmed = models.PositiveIntegerField(default=0)
    tickets_sold = models.PositiveIntegerField(default=0)
    revenue = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    refunds_count = models.PositiveIntegerField(default=0)
    refund_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    check_ins = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "event_analytics_daily"
        unique_together = ("event", "date")
        indexes = [models.Index(fields=["event"])]


class PlatformAnalyticsDaily(models.Model):
    date = models.DateField(unique=True)
    new_users = models.PositiveIntegerField(default=0)
    new_organizers = models.PositiveIntegerField(default=0)
    events_published = models.PositiveIntegerField(default=0)
    total_orders = models.PositiveIntegerField(default=0)
    confirmed_orders = models.PositiveIntegerField(default=0)
    total_revenue = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    platform_fees = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_refunds = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_payouts = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        db_table = "platform_analytics_daily"


class TrafficSource(models.Model):
    event = models.ForeignKey("events.Event", on_delete=models.CASCADE, related_name="traffic_sources")
    source = models.CharField(max_length=100)
    medium = models.CharField(max_length=100, blank=True, null=True)
    campaign = models.CharField(max_length=100, blank=True, null=True)
    visits = models.PositiveIntegerField(default=0)
    date = models.DateField()

    class Meta:
        db_table = "traffic_sources"
        unique_together = ("event", "source", "date")
