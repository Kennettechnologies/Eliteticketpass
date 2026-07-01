"""
Security utilities:
  - Webhook signature verification (Daraja + Stripe)
  - Input sanitization & XSS prevention
  - QR token single-use enforcement
  - Client IP extraction
  - CSRF helpers
"""

import hashlib
import hmac
import html
import logging
import re
import time
import uuid
from functools import wraps

import stripe
from django.conf import settings
from django.core.cache import cache
from django.http import HttpRequest
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework.response import Response

logger = logging.getLogger(__name__)

# ── Client IP ─────────────────────────────────────────────────────────────────

def get_client_ip(request: HttpRequest) -> str:
    """Return the real client IP, honouring X-Forwarded-For in production."""
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


# ── Input sanitization ────────────────────────────────────────────────────────

_SCRIPT_RE = re.compile(
    r"<\s*script.*?>.*?<\s*/\s*script\s*>",
    re.IGNORECASE | re.DOTALL,
)
_TAG_RE = re.compile(r"<[^>]+>", re.IGNORECASE)

# HTML attributes that can carry JS
_DANGEROUS_ATTRS = re.compile(
    r'\s*(on\w+|javascript|vbscript|data)\s*=',
    re.IGNORECASE,
)


def sanitize_html(value: str) -> str:
    """Strip script tags and dangerous attributes; HTML-escape the result."""
    if not isinstance(value, str):
        return value
    value = _SCRIPT_RE.sub("", value)
    value = _DANGEROUS_ATTRS.sub("", value)
    value = _TAG_RE.sub("", value)
    return html.escape(value.strip())


def sanitize_plain(value: str) -> str:
    """Escape HTML special characters for values expected to be plain text."""
    if not isinstance(value, str):
        return value
    return html.escape(value.strip())


def sanitize_dict(data: dict, *, html_fields: set[str] | None = None) -> dict:
    """
    Recursively sanitize a dict of form/API data.
    Fields in `html_fields` get full HTML sanitization; others get plain escape.
    """
    html_fields = html_fields or set()
    result = {}
    for key, value in data.items():
        if isinstance(value, str):
            result[key] = sanitize_html(value) if key in html_fields else sanitize_plain(value)
        elif isinstance(value, dict):
            result[key] = sanitize_dict(value, html_fields=html_fields)
        elif isinstance(value, list):
            result[key] = [
                sanitize_dict(item, html_fields=html_fields) if isinstance(item, dict)
                else (sanitize_html(item) if isinstance(item, str) and key in html_fields
                      else (sanitize_plain(item) if isinstance(item, str) else item))
                for item in value
            ]
        else:
            result[key] = value
    return result


# ── Webhook signature verification ───────────────────────────────────────────

def verify_stripe_webhook(payload: bytes, sig_header: str) -> dict:
    """
    Verify Stripe webhook signature using the STRIPE_WEBHOOK_SECRET setting.
    Returns the parsed event dict.
    Raises PermissionDenied on invalid signature.
    """
    secret = getattr(settings, "STRIPE_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("STRIPE_WEBHOOK_SECRET not configured")
        raise PermissionDenied("Webhook not configured.")
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, secret)
        return event
    except stripe.error.SignatureVerificationError as e:
        logger.warning("Invalid Stripe webhook signature: %s", e)
        raise PermissionDenied("Invalid webhook signature.")
    except Exception as e:
        logger.error("Stripe webhook parse error: %s", e)
        raise PermissionDenied("Malformed webhook payload.")


def verify_daraja_webhook(request: HttpRequest) -> bool:
    """
    M-Pesa Daraja does not send an HMAC signature by default.
    We verify authenticity by:
      1. Checking the request IP is from the Safaricom callback IP range, OR
      2. Verifying a shared DARAJA_CALLBACK_TOKEN header if configured.
    Returns True if valid, raises PermissionDenied if not.
    """
    # Optional shared secret in X-Daraja-Token header
    expected_token = getattr(settings, "DARAJA_CALLBACK_TOKEN", "")
    if expected_token:
        received_token = request.headers.get("X-Daraja-Token", "")
        if not hmac.compare_digest(expected_token, received_token):
            logger.warning(
                "Invalid Daraja callback token from IP=%s", get_client_ip(request)
            )
            raise PermissionDenied("Invalid Daraja callback token.")

    # Safaricom IP allowlist (sandbox + production ranges)
    safaricom_ips = getattr(settings, "DARAJA_ALLOWED_IPS", [
        "196.201.214.200", "196.201.214.206", "196.201.213.114",
        "196.201.214.207", "196.201.214.208", "196.201.213.44",
        "196.201.212.127", "196.201.212.138", "196.201.212.129",
        "196.201.212.136", "196.201.212.74",  "196.201.212.69",
        # sandbox:
        "0.0.0.0", "127.0.0.1",
    ])
    ip = get_client_ip(request)
    if safaricom_ips and ip not in safaricom_ips and not getattr(settings, "DEBUG", False):
        logger.warning("Daraja callback from unexpected IP=%s", ip)
        raise PermissionDenied("Unauthorized callback source.")

    return True


# ── QR token single-use enforcement ──────────────────────────────────────────

_QR_USE_KEY  = "qr_used:{token}"
_QR_LOCK_KEY = "qr_lock:{token}"


def enforce_qr_single_use(token: str, ttl: int = 300) -> None:
    """
    Atomically mark a QR token as used.
    Raises PermissionDenied if the token was already used.

    Uses Redis SETNX (add_if_not_exist) to prevent race conditions at scale.
    `ttl` — how long to remember the used token (default 5 minutes; set higher
             if tokens are long-lived).
    """
    lock_key = _QR_LOCK_KEY.format(token=token)
    used_key = _QR_USE_KEY.format(token=token)

    # Distributed lock: only one process wins
    acquired = cache.add(lock_key, 1, timeout=5)
    if not acquired:
        raise PermissionDenied("QR token is being processed. Please try again.")

    try:
        if cache.get(used_key):
            raise PermissionDenied("This QR code has already been used.")
        cache.set(used_key, int(time.time()), timeout=ttl)
    finally:
        cache.delete(lock_key)


def is_qr_used(token: str) -> bool:
    """Non-raising check: returns True if token was already consumed."""
    return bool(cache.get(_QR_USE_KEY.format(token=token)))


# ── Content-Security-Policy header builder ────────────────────────────────────

CSP_DIRECTIVES = {
    "default-src":  ["'self'"],
    "script-src":   ["'self'", "'unsafe-inline'"],          # tighten if you add nonces
    "style-src":    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src":     ["'self'", "https://fonts.gstatic.com"],
    "img-src":      ["'self'", "data:", "https:", "blob:"],
    "connect-src":  ["'self'", "wss:", "https:"],
    "frame-src":    ["'none'"],
    "object-src":   ["'none'"],
    "base-uri":     ["'self'"],
    "form-action":  ["'self'"],
}


def build_csp_header() -> str:
    return "; ".join(
        f"{key} {' '.join(values)}"
        for key, values in CSP_DIRECTIVES.items()
    )


class SecurityHeadersMiddleware:
    """
    Injects security response headers on every request:
      - Content-Security-Policy
      - X-Content-Type-Options
      - Referrer-Policy
      - Permissions-Policy
    (HSTS is handled by Django's SecurityMiddleware in production.)
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self._csp = build_csp_header()

    def __call__(self, request):
        response = self.get_response(request)
        response["Content-Security-Policy"]  = self._csp
        response["X-Content-Type-Options"]   = "nosniff"
        response["Referrer-Policy"]          = "strict-origin-when-cross-origin"
        response["Permissions-Policy"]       = (
            "camera=(), microphone=(), geolocation=(self), payment=(self)"
        )
        return response
