import hmac
import hashlib
from django.conf import settings
from django.http import HttpResponse
from functools import wraps
from .models import WebhookLog


def verify_paystack_signature(request):
    """Verify that webhook came from Paystack using HMAC-SHA512."""
    signature = request.headers.get('X-Paystack-Signature', '')
    secret = settings.PAYSTACK_SECRET_KEY.encode('utf-8')
    expected = hmac.new(secret, request.body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature)


def verify_daraja_ip(request):
    """Daraja uses IP whitelisting, not HMAC. Validate source IP."""
    client_ip = get_client_ip(request)
    allowed = [ip.strip() for ip in getattr(settings, 'WEBHOOK_IP_WHITELIST_DARAJA', '').split(',') if ip.strip()]
    if not allowed:
        return True # If no whitelist defined, allow all (for local dev)
    return client_ip in allowed


def get_client_ip(request):
    x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded:
        return x_forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def require_paystack_signature(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not verify_paystack_signature(request):
            WebhookLog.objects.create(
                source='paystack',
                event_type='unknown',
                raw_payload={},
                headers=dict(request.headers),
                signature_valid=False,
                ip_address=get_client_ip(request),
            )
            return HttpResponse(status=401)
        return view_func(request, *args, **kwargs)
    return wrapper


def require_daraja_ip(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not verify_daraja_ip(request):
            WebhookLog.objects.create(
                source='daraja',
                event_type='callback',
                raw_payload={},
                headers=dict(request.headers),
                signature_valid=False,
                ip_address=get_client_ip(request),
            )
            return HttpResponse(status=403)
        return view_func(request, *args, **kwargs)
    return wrapper
