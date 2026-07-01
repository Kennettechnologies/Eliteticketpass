import re

with open('backend/apps/notifications/tasks.py', 'r') as f:
    content = f.read()

# Replace _send_email
email_replacement = """
def _send_email(to_email: str, subject: str, body: str, html_body: str = ""):
    \"\"\"Send transactional email dynamically.\"\"\"
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
        msg.send(fail_silently=False)
        logger.info(f"Email sent to {to_email}: {subject}")
    except Exception as e:
        logger.warning(f"Email send failed to {to_email}: {e}")
"""
content = re.sub(r'def _send_email\(to_email: str, subject: str, body: str, html_body: str = ""\):.*?(?=\n\n|\Z)', email_replacement.strip('\n'), content, flags=re.DOTALL)

# Replace send_sms
sms_replacement = """
@shared_task(name="notifications.send_sms", queue="notifications")
def send_sms(phone: str, message: str):
    \"\"\"Send SMS via Africa's Talking dynamically.\"\"\"
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
"""
content = re.sub(r'@shared_task\(name="notifications.send_sms".*?def send_sms.*?logger\.exception\(f"Failed to send SMS to \{phone\}"\)', sms_replacement.strip('\n'), content, flags=re.DOTALL)

# Replace send_whatsapp
wa_replacement = """
@shared_task(name="notifications.send_whatsapp", queue="notifications")
def send_whatsapp(phone: str, message: str, media_url: str = ""):
    \"\"\"Send WhatsApp message via Twilio dynamically.\"\"\"
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
"""
content = re.sub(r'@shared_task\(name="notifications.send_whatsapp".*?def send_whatsapp.*?logger\.exception\(f"Failed to send WhatsApp to \{phone\}"\)', wa_replacement.strip('\n'), content, flags=re.DOTALL)

with open('backend/apps/notifications/tasks.py', 'w') as f:
    f.write(content)
print("Updated notifications/tasks.py to use dynamic keys")
