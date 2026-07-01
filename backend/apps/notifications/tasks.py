import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name="notifications.send_ticket_confirmation_email", queue="notifications")
def send_ticket_confirmation_email(order_id: str):
    from apps.orders.models import Order
    from apps.tickets.models import Ticket
    from .models import Notification

    try:
        order = Order.objects.select_related("event__organizer", "user").prefetch_related("tickets__tier").get(id=order_id)
        tickets = order.tickets.all()
        event = order.event

        # Generate PDF attachments
        from apps.tickets.tasks import _build_pdf
        attachments = []
        for t in tickets:
            try:
                pdf_bytes = _build_pdf(t)
                if pdf_bytes:
                    attachments.append((f"Ticket-{t.ticket_number}.pdf", pdf_bytes, "application/pdf"))
            except Exception as e:
                logger.error(f"Failed to generate PDF for ticket {t.ticket_number}: {e}")

        # Build ticket list for email body
        ticket_lines = "\n".join([
            f"• {t.ticket_number} — {t.tier.name if t.tier else 'General'} ({t.holder_name})"
            for t in tickets
        ])

        subject = f"Your tickets for {event.title} 🎫"
        body = f"""
Hi {order.buyer_first_name or 'there'},

Your booking is confirmed! Here are your tickets:

{ticket_lines}

Event: {event.title}
Date: {event.starts_at.strftime('%A, %d %B %Y at %I:%M %p EAT')}
Venue: {event.venue_name}, {event.venue_city}

Order #: {order.order_number}
Total Paid: KES {order.total}

Your tickets are attached to this email as PDFs. You can download them or show the QR code at the gate. Have a great time!

EliteTicketPass Team
"""
        from .models import NotificationPreference
        
        # Check preferences
        def _is_enabled(user, pref_key, default=True):
            if not user: return default
            pref = NotificationPreference.objects.filter(user=user, notif_type=pref_key).first()
            return pref.enabled if pref else default

        # Send Email
        if _is_enabled(order.user, "email_order_confirmation", True):
            _send_email(order.buyer_email, subject, body, attachments=attachments)

        # Send SMS
        if order.buyer_phone and _is_enabled(order.user, "sms_order_confirmation", True):
            sms_body = f"EliteTicketPass: Your {event.title} booking is confirmed! Order #: {order.order_number}. Show the PDF from your email at the gate."
            send_sms.apply_async(args=[order.buyer_phone, sms_body])

        # Send WhatsApp
        if order.buyer_phone and _is_enabled(order.user, "whatsapp_order_confirmation", False):
            wa_body = f"🎫 *Booking Confirmed!*\n\n{event.title}\nOrder #: {order.order_number}\n\nPlease check your email for the attached PDF tickets."
            send_whatsapp.apply_async(args=[order.buyer_phone, wa_body])

        if order.user:
            Notification.objects.create(
                user=order.user,
                notif_type="ORDER_CONFIRMED",
                channel="IN_APP",
                status="SENT",
                subject=subject,
                body=body,
                metadata={"order_id": order_id},
                sent_at=timezone.now(),
            )

    except Exception:
        logger.exception(f"Failed to send ticket confirmation email for order {order_id}")


@shared_task(name="notifications.send_event_reminder", queue="notifications")
def send_event_reminder(order_id: str):
    from apps.orders.models import Order

    try:
        order = Order.objects.select_related("event").get(id=order_id, status="CONFIRMED")
        event = order.event
        from .models import NotificationPreference
        
        def _is_enabled(user, pref_key, default=True):
            if not user: return default
            pref = NotificationPreference.objects.filter(user=user, notif_type=pref_key).first()
            return pref.enabled if pref else default

        subject = f"Reminder: {event.title} is tomorrow!"
        body = f"Hi {order.buyer_first_name}, don't forget — {event.title} starts tomorrow at {event.starts_at.strftime('%I:%M %p')} at {event.venue_name}."
        
        # Email
        if _is_enabled(order.user, "email_ticket_reminder", True):
            _send_email(order.buyer_email, subject, body)
            
        # SMS
        if order.buyer_phone and _is_enabled(order.user, "sms_ticket_reminder", False):
            sms_body = f"EliteTicketPass Reminder: {event.title} is tomorrow at {event.starts_at.strftime('%I:%M %p')}! See you there."
            send_sms.apply_async(args=[order.buyer_phone, sms_body])
            
        # WhatsApp
        if order.buyer_phone and _is_enabled(order.user, "whatsapp_ticket_reminder", False):
            send_whatsapp.apply_async(args=[order.buyer_phone, f"⏰ *Event Reminder!*\n\nDon't forget, {event.title} is happening tomorrow at {event.starts_at.strftime('%I:%M %p')}. Get ready!"])
    except Exception:
        logger.exception(f"Failed to send reminder for order {order_id}")


@shared_task(name="notifications.dispatch_announcement", queue="notifications")
def dispatch_announcement(announcement_id: str):
    from .models import Announcement
    from apps.orders.models import Order
    from django.utils import timezone

    try:
        announcement = Announcement.objects.select_related("event").get(id=announcement_id)
        from .models import NotificationPreference
        def _is_enabled(user_id, pref_key, default=True):
            if not user_id: return default
            pref = NotificationPreference.objects.filter(user_id=user_id, notif_type=pref_key).first()
            return pref.enabled if pref else default

        if announcement.event:
            orders = Order.objects.filter(
                event=announcement.event,
                status="CONFIRMED",
            ).values("buyer_email", "buyer_first_name", "buyer_phone", "user_id")
        else:
            orders = Order.objects.filter(
                event__organizer=announcement.organizer,
                status="CONFIRMED",
            ).values("buyer_email", "buyer_first_name", "buyer_phone", "user_id").distinct()

        count = 0
        for order in orders:
            sent = False
            first_name = order.get("buyer_first_name") or "there"
            body = announcement.body.replace("{first_name}", first_name)
            if announcement.event:
                body = body.replace("{event_title}", announcement.event.name)
            
            if "EMAIL" in announcement.channels and order["buyer_email"]:
                if _is_enabled(order["user_id"], "email_event_updates", True):
                    _send_email(order["buyer_email"], announcement.subject, body)
                    sent = True
            
            if "SMS" in announcement.channels and order["buyer_phone"]:
                if _is_enabled(order["user_id"], "sms_event_updates", False):
                    send_sms.apply_async(args=[order["buyer_phone"], f"EliteTicketPass: {announcement.subject}\n{body}"])
                    sent = True
                    
            if sent: count += 1

        announcement.sent_at = timezone.now()
        announcement.recipient_count = count
        announcement.save(update_fields=["sent_at", "recipient_count"])
    except Exception:
        logger.exception(f"Failed to dispatch announcement {announcement_id}")

@shared_task(name="notifications.process_event_automations", queue="notifications")
def process_event_automations():
    from .models import Automation
    from apps.events.models import Event
    from apps.orders.models import Order
    from django.utils import timezone
    from datetime import timedelta

    now = timezone.now()
    
    # We will simply fetch active automations and manually see if there's any event matching the trigger
    automations = Automation.objects.filter(is_active=True)
    
    for auto in automations:
        target_time = None
        if auto.trigger == "PRE_EVENT_24H":
            target_time = now + timedelta(hours=24)
        elif auto.trigger == "PRE_EVENT_48H":
            target_time = now + timedelta(hours=48)
        elif auto.trigger == "PRE_EVENT_1H":
            target_time = now + timedelta(hours=1)
        elif auto.trigger == "POST_EVENT_1H":
            target_time = now - timedelta(hours=1)
        elif auto.trigger == "POST_EVENT_24H":
            target_time = now - timedelta(hours=24)
            
        if not target_time:
            continue
            
        # Find events matching this target time within a reasonable delta (e.g. 1 hour window)
        # Note: in a production app, you'd use a better state-tracking mechanism to avoid double sending
        events = Event.objects.filter(
            organizer=auto.organizer, 
            starts_at__gte=target_time - timedelta(minutes=30),
            starts_at__lt=target_time + timedelta(minutes=30)
        )
        
        for event in events:
            # Dispatch to attendees
            orders = Order.objects.filter(event=event, status="CONFIRMED").values("buyer_email", "buyer_first_name")
            for order in orders:
                if auto.channel == "EMAIL" and order["buyer_email"]:
                    first_name = order.get("buyer_first_name") or "there"
                    body = auto.body.replace("{first_name}", first_name).replace("{event_title}", event.name)
                    _send_email(order["buyer_email"], auto.subject, body)


@shared_task(name="notifications.send_cancellation_notifications", queue="notifications")
def send_cancellation_notifications(event_id: str):
    from apps.orders.models import Order
    from apps.events.models import Event

    try:
        event = Event.objects.get(id=event_id)
        from .models import NotificationPreference
        def _is_enabled(user_id, pref_key, default=True):
            if not user_id: return default
            pref = NotificationPreference.objects.filter(user_id=user_id, notif_type=pref_key).first()
            return pref.enabled if pref else default
            
        orders = Order.objects.filter(event=event, status="CONFIRMED").select_related("user")
        for order in orders:
            subject = f"Event Cancelled: {event.title}"
            body = f"Hi {order.buyer_first_name}, unfortunately {event.title} has been cancelled. Full refunds will be processed automatically."
            
            # Email
            if _is_enabled(order.user_id, "email_event_updates", True):
                _send_email(order.buyer_email, subject, body)
                
            # SMS
            if order.buyer_phone and _is_enabled(order.user_id, "sms_event_updates", False):
                send_sms.apply_async(args=[order.buyer_phone, f"EliteTicketPass: {event.title} has been cancelled. Refunds will be processed automatically."])
                
            # WhatsApp
            if order.buyer_phone and _is_enabled(order.user_id, "whatsapp_event_updates", False):
                send_whatsapp.apply_async(args=[order.buyer_phone, f"⚠️ *Event Cancelled*\n\n{event.title} has been cancelled. Full refunds are being processed."])
    except Exception:
        logger.exception(f"Failed to send cancellation notifications for event {event_id}")


@shared_task(name="notifications.send_transfer_notification", queue="notifications")
def send_transfer_notification(transfer_id: str):
    """Email the recipient when a ticket transfer is initiated."""
    from apps.tickets.models import TicketTransfer
    from django.conf import settings

    try:
        transfer = TicketTransfer.objects.select_related(
            "ticket__order__event", "ticket__tier", "from_user"
        ).get(id=transfer_id)

        ticket = transfer.ticket
        event = ticket.order.event
        sender_name = f"{transfer.from_user.first_name} {transfer.from_user.last_name}".strip() or transfer.from_user.email
        accept_url = f"{settings.FRONTEND_URL}/tickets/transfer/{transfer.transfer_token}"

        subject = f"{sender_name} wants to transfer a ticket to you — {event.title}"
        body = f"""
Hi,

{sender_name} has transferred a ticket to you for:

Event: {event.title}
Date:  {event.starts_at.strftime('%A, %d %B %Y at %I:%M %p')}
Venue: {event.venue_name}, {event.venue_city}
Ticket: {ticket.ticket_number} — {ticket.tier.name if ticket.tier else 'General'}

To accept this ticket, click the link below (valid for 48 hours):
{accept_url}

If you don't want this ticket, you can ignore this email and it will expire automatically.

EliteTicketPass Team
"""
        _send_email(transfer.to_email, subject, body)

        if transfer.to_phone:
            send_whatsapp.apply(args=[
                transfer.to_phone,
                f"{sender_name} sent you a ticket for {event.title}. Accept here: {accept_url}",
            ])

    except Exception:
        logger.exception(f"Failed to send transfer notification for transfer {transfer_id}")


@shared_task(name="notifications.send_sms", queue="notifications")
def send_sms(phone: str, message: str):
    """Send SMS via Africa's Talking dynamically."""
    try:
        from django.conf import settings
        from apps.admin_panel.models import PlatformConfig
        import requests
        
        at_user = PlatformConfig.objects.filter(key="africastalking_username").first()
        at_key = PlatformConfig.objects.filter(key="africastalking_api_key").first()
        
        user = at_user.value if (at_user and at_user.value) else getattr(settings, "AT_USERNAME", "")
        key = at_key.value if (at_key and at_key.value) else getattr(settings, "AT_API_KEY", "")
        
        url = "https://api.africastalking.com/version1/messaging"
        headers = {"apiKey": key, "Content-Type": "application/x-www-form-urlencoded"}
        data = {"username": user, "to": phone, "message": message}
        resp = requests.post(url, data=data, headers=headers, timeout=15)
        logger.info(f"SMS sent to {phone}: {resp.status_code}")
    except Exception:
        logger.exception(f"Failed to send SMS to {phone}")


@shared_task(name="notifications.send_whatsapp", queue="notifications")
def send_whatsapp(phone: str, message: str, media_url: str = ""):
    """Send WhatsApp message via Twilio dynamically."""
    try:
        from django.conf import settings
        from apps.admin_panel.models import PlatformConfig
        from twilio.rest import Client
        
        sid_conf = PlatformConfig.objects.filter(key="twilio_account_sid").first()
        auth_conf = PlatformConfig.objects.filter(key="twilio_auth_token").first()
        from_conf = PlatformConfig.objects.filter(key="twilio_whatsapp_from").first()
        
        sid = sid_conf.value if (sid_conf and sid_conf.value) else getattr(settings, "TWILIO_ACCOUNT_SID", "")
        auth = auth_conf.value if (auth_conf and auth_conf.value) else getattr(settings, "TWILIO_AUTH_TOKEN", "")
        wa_from = from_conf.value if (from_conf and from_conf.value) else getattr(settings, "TWILIO_WHATSAPP_FROM", "")
        
        client = Client(sid, auth)
        msg_kwargs = {
            "from_": wa_from,
            "body": message,
            "to": f"whatsapp:{phone}",
        }
        if media_url:
            msg_kwargs["media_url"] = [media_url]
        client.messages.create(**msg_kwargs)
    except Exception:
        logger.exception(f"Failed to send WhatsApp to {phone}")


def _send_email(to_email: str, subject: str, body: str, html_body: str = "", attachments: list = None):
    """Send transactional email dynamically with optional attachments."""
    try:
        from django.conf import settings
        from django.core.mail import EmailMultiAlternatives, get_connection
        from apps.admin_panel.models import PlatformConfig
        
        resend_key = PlatformConfig.objects.filter(key="resend_api_key").first()
        resend_from = PlatformConfig.objects.filter(key="resend_from_email").first()
        
        if resend_key and resend_key.value:
            connection = get_connection(
                host='smtp.resend.com',
                port=587,
                username='resend',
                password=resend_key.value,
                use_tls=True
            )
            from_email = resend_from.value if (resend_from and resend_from.value) else f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM}>"
        else:
            connection = None
            from_email = f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM}>"
            
        msg = EmailMultiAlternatives(subject, body, from_email, [to_email], connection=connection)
        if html_body:
            msg.attach_alternative(html_body, "text/html")
        if attachments:
            for filename, content, mimetype in attachments:
                msg.attach(filename, content, mimetype)
        msg.send(fail_silently=False)
        logger.info(f"Email sent to {to_email}: {subject}")
    except Exception as e:
        logger.warning(f"Email send failed to {to_email}: {e}")


@shared_task(name="notifications.send_gate_staff_invite", queue="notifications")
def send_gate_staff_invite(email: str, event_name: str, raw_password: str):
    try:
        from django.conf import settings
        
        login_url = f"{settings.FRONTEND_URL}/auth/login"
        
        subject = f"You have been invited to scan tickets for {event_name}!"
        body = f"""
Hello,

You have been assigned as Gate Staff for the event: {event_name}.

An account has been automatically created for you.
Here are your login credentials:

Email: {email}
Temporary Password: {raw_password}

You can log in to the Gate Scanner Dashboard here:
{login_url}

We strongly recommend changing your password after logging in.

EliteTicketPass Team
"""
        _send_email(email, subject, body)
    except Exception:
        logger.exception(f"Failed to send gate staff invite to {email}")


@shared_task(name="notifications.send_gate_staff_assignment", queue="notifications")
def send_gate_staff_assignment(email: str, event_name: str):
    try:
        from django.conf import settings
        
        subject = f"New Event Assignment: {event_name}"
        body = f"""
Hello,

You have been assigned as Gate Staff for a new event: {event_name}.

You can log in to your account as usual to access the Gate Scanner Dashboard for this event.

EliteTicketPass Team
"""
        _send_email(email, subject, body)
    except Exception:
        logger.exception(f"Failed to send gate staff assignment to {email}")