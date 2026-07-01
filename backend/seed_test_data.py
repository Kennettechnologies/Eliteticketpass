import os
import django
from decimal import Decimal
from django.utils import timezone
from datetime import timedelta

def seed():
    from apps.users.models import User
    from apps.organizers.models import Organizer
    from apps.events.models import Event, TicketTier
    from apps.events.models import EventCategory
    
    # Create test buyer
    buyer, created = User.objects.get_or_create(email="buyer@example.com", defaults={
        "first_name": "Test",
        "last_name": "Buyer",
        "role": "BUYER",
        "is_active": True,
    })
    if created:
        buyer.set_password("password123")
        buyer.save()
        print("Created test buyer: buyer@example.com / password123")
    else:
        print("Test buyer already exists: buyer@example.com / password123")
        
    # Create test organizer user
    org_user, created = User.objects.get_or_create(email="organizer@example.com", defaults={
        "first_name": "Test",
        "last_name": "Organizer",
        "role": "ORGANIZER",
        "is_active": True,
    })
    if created:
        org_user.set_password("password123")
        org_user.save()
        print("Created test organizer user: organizer@example.com / password123")
        
    # Create organizer profile
    organizer, _ = Organizer.objects.get_or_create(user=org_user, defaults={
        "name": "Paystack Test Organizer",
        "slug": "paystack-test-organizer",
    })
    
    # Ensure category
    cat, _ = EventCategory.objects.get_or_create(name="Tech", defaults={"slug": "tech", "color_hex": "#ff0000"})
    
    # Create event
    event, _ = Event.objects.get_or_create(slug="paystack-test-event", defaults={
        "organizer": organizer,
        "title": "Paystack Integration Test Event",
        "category": cat,
        "description": "This is a test event for testing Paystack checkout.",
        "starts_at": timezone.now() + timedelta(days=7),
        "ends_at": timezone.now() + timedelta(days=7, hours=4),
        "venue_name": "Virtual Event",
        "venue_city": "Nairobi",
        "status": "PUBLISHED",
        "is_free": False,
    })
    
    # Create tier
    tier, _ = TicketTier.objects.get_or_create(event=event, name="Paystack Test Tier", defaults={
        "quantity": 100,
        "price": Decimal("10.00"),
        "sale_starts_at": timezone.now() - timedelta(days=1),
        "sale_ends_at": timezone.now() + timedelta(days=7),
    })
    
    print(f"Test event created: {event.title}")
    print(f"Ticket tier: {tier.name} at KES {tier.price}")

if __name__ == "__main__":
    seed()
