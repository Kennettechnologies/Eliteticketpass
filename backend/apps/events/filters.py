import django_filters
from .models import Event


class EventFilter(django_filters.FilterSet):
    category = django_filters.CharFilter(field_name="category__slug")
    city = django_filters.CharFilter(field_name="venue_city", lookup_expr="icontains")
    date_from = django_filters.DateTimeFilter(field_name="starts_at", lookup_expr="gte")
    date_to = django_filters.DateTimeFilter(field_name="starts_at", lookup_expr="lte")
    price_min = django_filters.NumberFilter(method="filter_price_min")
    price_max = django_filters.NumberFilter(method="filter_price_max")
    is_free = django_filters.BooleanFilter(field_name="is_free")
    event_type = django_filters.ChoiceFilter(choices=Event.EventType.choices)

    class Meta:
        model = Event
        fields = ["category", "city", "date_from", "date_to", "is_free", "event_type"]

    def filter_price_min(self, qs, name, value):
        return qs.filter(ticket_tiers__price__gte=value).distinct()

    def filter_price_max(self, qs, name, value):
        return qs.filter(ticket_tiers__price__lte=value).distinct()
