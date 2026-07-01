"""
Management command: seed_tech_event

Creates a complete, ready-to-test tech event with:
  - Superadmin account
  - Approved organizer account
  - Gate-staff account
  - Buyer account
  - "Technology" category
  - Published event: "DevFest Nairobi 2026"
  - 4 ticket tiers  (Free Community, Early Bird, Regular, VIP)
  - 3-tier refund policy
  - 2 promo codes
  - Check-in session  (access code printed to stdout)

Usage:
    python manage.py seed_tech_event
    python manage.py seed_tech_event --reset   # drops & re-creates everything
"""

import secrets
import string
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.text import slugify


class Command(BaseCommand):
    help = "Seed a complete tech event for end-to-end testing."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete existing seed data and re-create it.",
        )

    # ── helpers ───────────────────────────────────────────────────────────────

    def _sep(self): self.stdout.write(self.style.WARNING("─" * 60))

    def _ok(self, msg): self.stdout.write(self.style.SUCCESS(f"  ✓ {msg}"))

    def _info(self, label, value):
        self.stdout.write(f"    {self.style.MIGRATE_LABEL(label):<24} {value}")

    # ── command body ──────────────────────────────────────────────────────────

    def handle(self, *args, **options):
        from apps.users.models import User
        from apps.organizers.models import Organizer
        from apps.events.models import (
            Event, EventCategory, TicketTier, RefundPolicy, EventGallery,
        )
        from apps.checkin.models import CheckInSession
        from apps.promos.models import PromoCode
        from apps.admin_panel.models import HomepageSlot

        reset = options["reset"]

        # ── 0. Optional reset ─────────────────────────────────────────────
        if reset:
            self._sep()
            self.stdout.write(self.style.WARNING("Resetting seed data …"))
            Event.objects.filter(slug="devfest-nairobi-2026").delete()
            EventCategory.objects.filter(slug="technology").delete()
            User.objects.filter(email__in=[
                "admin@eliteticketpass.dev",
                "organizer@eliteticketpass.dev",
                "gatestaff@eliteticketpass.dev",
                "buyer@eliteticketpass.dev",
            ]).delete()
            self._ok("Reset complete.")

        now = timezone.now()

        # ── 1. Users ──────────────────────────────────────────────────────
        self._sep()
        self.stdout.write(self.style.MIGRATE_HEADING("1. Creating users"))

        admin, _ = User.objects.get_or_create(
            email="admin@eliteticketpass.dev",
            defaults=dict(
                first_name="Super", last_name="Admin",
                role="ADMIN", is_staff=True, is_superuser=True,
                email_verified=True, city="Nairobi",
            ),
        )
        admin.set_password("Admin1234!")
        admin.save()
        self._ok("Superadmin"); self._info("email", "admin@eliteticketpass.dev"); self._info("password", "Admin1234!")

        org_user, _ = User.objects.get_or_create(
            email="organizer@eliteticketpass.dev",
            defaults=dict(
                first_name="TechHub", last_name="Kenya",
                role="ORGANIZER", email_verified=True, city="Nairobi",
            ),
        )
        org_user.set_password("Organizer1234!")
        org_user.save()
        self._ok("Organizer user"); self._info("email", "organizer@eliteticketpass.dev"); self._info("password", "Organizer1234!")

        gate_user, _ = User.objects.get_or_create(
            email="gatestaff@eliteticketpass.dev",
            defaults=dict(
                first_name="Gate", last_name="Staff",
                role="GATE_STAFF", email_verified=True, city="Nairobi",
            ),
        )
        gate_user.set_password("GateStaff1234!")
        gate_user.save()
        self._ok("Gate staff"); self._info("email", "gatestaff@eliteticketpass.dev"); self._info("password", "GateStaff1234!")

        buyer, _ = User.objects.get_or_create(
            email="buyer@eliteticketpass.dev",
            defaults=dict(
                first_name="Alex", last_name="Buyer",
                role="BUYER", email_verified=True, city="Nairobi",
                phone="+254700000001",
            ),
        )
        buyer.set_password("Buyer1234!")
        buyer.save()
        self._ok("Buyer"); self._info("email", "buyer@eliteticketpass.dev"); self._info("password", "Buyer1234!")

        # ── 2. Organizer profile ──────────────────────────────────────────
        self._sep()
        self.stdout.write(self.style.MIGRATE_HEADING("2. Organizer profile"))

        org, _ = Organizer.objects.get_or_create(
            user=org_user,
            defaults=dict(
                slug="techhub-kenya",
                name="TechHub Kenya",
                display_name="TechHub Kenya",
                bio=(
                    "East Africa's largest developer community. We host DevFests, "
                    "hackathons, and workshops to grow the tech ecosystem."
                ),
                business_type="company",
                contact_email="hello@techub.ke",
                contact_phone="+254700123456",
                website_url="https://techhub.ke",
                twitter_url="https://twitter.com/TechHubKE",
                status="APPROVED",
                kyc_status="APPROVED",
                tier="VERIFIED",
                is_verified=True,
                payout_method="MPESA",
                mpesa_phone="0700123456",
            ),
        )
        if org.status != "APPROVED":
            org.status = "APPROVED"; org.kyc_status = "APPROVED"; org.save()
        self._ok(f"Organizer profile: {org.display_name} (slug: {org.slug})")

        # ── 3. Category ───────────────────────────────────────────────────
        self._sep()
        self.stdout.write(self.style.MIGRATE_HEADING("3. Event category"))

        cat, _ = EventCategory.objects.get_or_create(
            slug="technology",
            defaults=dict(name="Technology", color_hex="#4f8ef7", sort_order=1, is_active=True),
        )
        self._ok(f"Category: {cat.name}")

        # ── 4. Event ──────────────────────────────────────────────────────
        self._sep()
        self.stdout.write(self.style.MIGRATE_HEADING("4. Creating event"))

        event_start = now + timedelta(days=30)
        event_end   = event_start + timedelta(hours=8)
        doors_open  = event_start - timedelta(hours=1)

        event, created = Event.objects.get_or_create(
            slug="devfest-nairobi-2026",
            defaults=dict(
                organizer=org,
                title="DevFest Nairobi 2026",
                description="""<p>DevFest Nairobi is East Africa's biggest annual developer conference, bringing together software engineers, product managers, designers, and tech enthusiasts for a full day of learning, networking, and inspiration.</p>

<h2>What to Expect</h2>
<ul>
  <li><strong>Keynotes</strong> from leading engineers across Africa and beyond</li>
  <li><strong>12 technical sessions</strong> covering AI/ML, Web, Mobile, Cloud, and DevOps</li>
  <li><strong>Hands-on workshops</strong> limited to 30 attendees each</li>
  <li><strong>Startup showcase</strong> — pitch your idea to investors</li>
  <li><strong>Career fair</strong> with top tech companies hiring</li>
  <li><strong>Networking dinner</strong> (VIP tickets only)</li>
</ul>

<h2>Speakers</h2>
<p>Confirmed speakers from Google, Microsoft, Andela, Safaricom PLC, and leading African startups. Full agenda published 2 weeks before the event.</p>

<h2>Venue</h2>
<p>Sarit Expo Centre, Nairobi — one of East Africa's largest convention facilities with dedicated breakout rooms and high-speed WiFi throughout.</p>""",
                short_description=(
                    "East Africa's biggest developer conference — AI, Web, Mobile, Cloud & DevOps. "
                    "12 sessions · workshops · startup showcase · career fair."
                ),
                cover_image_url="https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=80",
                event_type="PHYSICAL",
                status="PUBLISHED",
                category=cat,
                tags=["tech", "developers", "AI", "cloud", "mobile", "networking"],
                starts_at=event_start,
                ends_at=event_end,
                doors_open_at=doors_open,
                timezone="Africa/Nairobi",
                venue_name="Sarit Expo Centre",
                venue_address="Westlands, Sarit Centre",
                venue_city="Nairobi",
                venue_county="Nairobi",
                venue_country="KE",
                venue_capacity=1500,
                venue_latitude=-1.2635,
                venue_longitude=36.8021,
                age_restriction=16,
                dress_code="Smart casual",
                entry_rules="Valid ID required. No outside food or drinks.",
                faq=[
                    {"q": "Is parking available?", "a": "Yes, free parking is available at Sarit Centre."},
                    {"q": "Will sessions be recorded?", "a": "All keynotes and main-stage talks will be streamed live and recorded."},
                    {"q": "Can I get a refund?", "a": "Full refund up to 7 days before the event. 50% refund between 3-7 days. No refund within 3 days."},
                    {"q": "What should I bring?", "a": "Your ticket QR code (digital or printed), valid photo ID, and your laptop for workshops."},
                    {"q": "Is there a code of conduct?", "a": "Yes. All attendees must follow our community code of conduct available on our website."},
                ],
                max_per_order=5,
                is_public=True,
                is_featured=True,
                published_at=now,
            ),
        )

        if not created:
            self._ok("Event already exists — skipping recreation.")
        else:
            self._ok(f"Event: {event.title}")
            self._info("slug", event.slug)
            self._info("starts_at", str(event_start.strftime("%Y-%m-%d %H:%M %Z")))
            self._info("venue", event.venue_name)

        # ── 5. Ticket tiers ───────────────────────────────────────────────
        self._sep()
        self.stdout.write(self.style.MIGRATE_HEADING("5. Ticket tiers"))

        tiers_def = [
            dict(
                name="Community Pass",
                description="Free access to main stage keynotes and the career fair. Registration required.",
                price=0,
                quantity=300,
                is_free=True,
                color="#22c55e",
                perks=["Main stage access", "Career fair", "Lunch"],
                sort_order=0,
            ),
            dict(
                name="Early Bird",
                description="Full conference access at a discounted rate. Limited to first 200 tickets.",
                price=999,
                quantity=200,
                color="#4f8ef7",
                perks=["All sessions", "Workshops (first-come)", "Lunch", "Swag bag", "Conference recordings"],
                sale_ends_at=now + timedelta(days=14),
                sort_order=1,
            ),
            dict(
                name="Regular",
                description="Full access to all sessions, workshops, and the startup showcase.",
                price=1499,
                quantity=700,
                color="#c9a84c",
                perks=["All sessions", "Workshops", "Lunch", "Swag bag", "Conference recordings"],
                sort_order=2,
            ),
            dict(
                name="VIP",
                description="Premium all-inclusive experience with priority seating and exclusive networking dinner.",
                price=3999,
                quantity=50,
                color="#a855f7",
                max_per_order=2,
                perks=[
                    "Front-row seating", "All sessions", "All workshops",
                    "Exclusive networking dinner", "Speaker meet & greet",
                    "Premium swag bag", "1-year DevHub membership",
                ],
                sort_order=3,
            ),
        ]

        created_tiers = []
        for td in tiers_def:
            tier, _ = TicketTier.objects.get_or_create(
                event=event, name=td["name"],
                defaults={
                    "description":   td.get("description", ""),
                    "price":         td["price"],
                    "quantity":      td["quantity"],
                    "is_free":       td.get("is_free", False),
                    "color":         td.get("color", ""),
                    "perks":         td.get("perks", []),
                    "sort_order":    td.get("sort_order", 0),
                    "max_per_order": td.get("max_per_order", 10),
                    "sale_ends_at":  td.get("sale_ends_at"),
                    "is_active":     True,
                },
            )
            created_tiers.append(tier)
            price_str = "FREE" if td["price"] == 0 else f"KES {td['price']:,}"
            self._ok(f"{tier.name:<20} {price_str:<12} {td['quantity']} tickets")

        # ── 6. Refund policies ────────────────────────────────────────────
        self._sep()
        self.stdout.write(self.style.MIGRATE_HEADING("6. Refund policies"))

        policies = [
            (14, 100, "Full refund if cancelled 14+ days before the event."),
            (7,   75, "75% refund if cancelled 7–13 days before the event."),
            (3,   50, "50% refund if cancelled 3–6 days before the event."),
            (0,    0, "No refund within 3 days of the event."),
        ]
        for days, pct, desc in policies:
            RefundPolicy.objects.get_or_create(
                event=event, days_before_event=days,
                defaults=dict(refund_percent=pct, description=desc),
            )
            self._ok(f"{days:>2} days before → {pct}%  |  {desc}")

        # ── 7. Promo codes ────────────────────────────────────────────────
        self._sep()
        self.stdout.write(self.style.MIGRATE_HEADING("7. Promo codes"))

        promos = [
            dict(
                code="DEVFEST30",
                promo_type="PERCENTAGE",
                value=30,
                usage_limit=100,
                min_order_amount=500,
                valid_until=event_start - timedelta(days=7),
                description="30% off for early community members.",
            ),
            dict(
                code="SPEAKER50",
                promo_type="PERCENTAGE",
                value=50,
                usage_limit=20,
                min_order_amount=0,
                valid_until=event_start - timedelta(days=1),
                description="50% off for invited speakers and volunteers.",
            ),
            dict(
                code="FLAT500",
                promo_type="FIXED_AMOUNT",
                value=500,
                usage_limit=50,
                min_order_amount=1000,
                valid_until=event_start,
                description="KES 500 off any order above KES 1,000.",
            ),
        ]

        for pd in promos:
            promo, _ = PromoCode.objects.get_or_create(
                code=pd["code"],
                defaults=dict(
                    organizer=org,
                    promo_type=pd["promo_type"],
                    value=pd["value"],
                    usage_limit=pd["usage_limit"],
                    min_order_amount=pd.get("min_order_amount", 0) or None,
                    valid_until=pd["valid_until"],
                    description=pd.get("description", ""),
                    is_active=True,
                ),
            )
            vtype = f"{int(promo.value)}%" if promo.promo_type == "PERCENTAGE" else f"KES {int(promo.value)}"
            self._ok(f"{promo.code:<14}  {vtype:<8}  limit: {promo.usage_limit}")

        # ── 8. Gallery images ─────────────────────────────────────────────
        self._sep()
        self.stdout.write(self.style.MIGRATE_HEADING("8. Gallery images"))

        gallery_images = [
            ("https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80", "Main stage"),
            ("https://images.unsplash.com/photo-1591115765373-5207764f72e7?w=800&q=80", "Workshops in session"),
            ("https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&q=80", "Networking"),
            ("https://images.unsplash.com/photo-1560439514-4e9645039924?w=800&q=80", "Startup showcase"),
        ]
        for i, (url, caption) in enumerate(gallery_images):
            EventGallery.objects.get_or_create(
                event=event, image_url=url,
                defaults=dict(caption=caption, sort_order=i),
            )
            self._ok(f"{caption}")

        # ── 9. Check-in session ───────────────────────────────────────────
        self._sep()
        self.stdout.write(self.style.MIGRATE_HEADING("9. Check-in session"))

        access_code = "DEVFEST-2026"
        session, _ = CheckInSession.objects.get_or_create(
            access_code=access_code,
            defaults=dict(
                event=event,
                name="Main Gate — DevFest Nairobi 2026",
                is_active=True,
                created_by=org_user,
                expires_at=event_end + timedelta(hours=2),
            ),
        )
        self._ok(f"Session: {session.name}")
        self._info("access_code", session.access_code)

        # ── 10. Homepage featured slot ──────────────────────────────────────
        self._sep()
        self.stdout.write(self.style.MIGRATE_HEADING("10. Homepage featured slot"))
        HomepageSlot.objects.get_or_create(
            event=event, slot_type="featured",
            defaults=dict(position=1, is_active=True, created_by=admin),
        )
        self._ok("DevFest Nairobi 2026 → featured slot (position 1)")

        # ── Summary ───────────────────────────────────────────────────────
        self._sep()
        self.stdout.write(self.style.SUCCESS("\n🎉  SEED COMPLETE — DevFest Nairobi 2026\n"))

        rows = [
            ("Frontend URL",     "http://localhost:3000"),
            ("Event page",       f"http://localhost:3000/events/{event.slug}"),
            ("Admin dashboard",  "http://localhost:3000/admin"),
            ("Org dashboard",    "http://localhost:3000/dashboard"),
            ("Check-in scanner", f"http://localhost:3000/checkin/{session.access_code}"),
            ("─ LOGINS ─",       ""),
            ("Superadmin",       "admin@eliteticketpass.dev  /  Admin1234!"),
            ("Organizer",        "organizer@eliteticketpass.dev  /  Organizer1234!"),
            ("Gate staff",       "gatestaff@eliteticketpass.dev  /  GateStaff1234!"),
            ("Buyer",            "buyer@eliteticketpass.dev  /  Buyer1234!"),
            ("─ PROMO CODES ─",  ""),
            ("30% off",          "DEVFEST30  (max 100 uses)"),
            ("50% off",          "SPEAKER50  (max 20 uses)"),
            ("KES 500 off",      "FLAT500    (min order KES 1000)"),
            ("─ CHECK-IN ─",     ""),
            ("Access code",      session.access_code),
            ("─ TIERS ─",        ""),
            ("Community",        "FREE  · 300 tickets"),
            ("Early Bird",       "KES 999  · 200 tickets"),
            ("Regular",          "KES 1,499  · 700 tickets"),
            ("VIP",              "KES 3,999  · 50 tickets"),
        ]
        for label, value in rows:
            if label.startswith("─"):
                self.stdout.write("")
                self.stdout.write(self.style.WARNING(f"  {label}"))
            else:
                self._info(label + ":", value)

        self.stdout.write("")
