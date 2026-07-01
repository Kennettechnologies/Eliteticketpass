"""
Custom DRF throttle classes + Redis-backed brute-force lockout.

Throttle rates:
  AuthThrottle     5 requests / minute   (login, OTP, magic-link)
  PaymentThrottle  10 requests / minute  (initiate payment, webhook)
  CheckInThrottle  60 requests / minute  (scanner app)
  BruteForceThrottle  raises 429 after 5 failed attempts; 15-min cooldown
"""

import logging
from django.core.cache import cache
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.exceptions import Throttled

logger = logging.getLogger(__name__)

# ── Generic scoped throttles ──────────────────────────────────────────────────

class AuthThrottle(SimpleRateThrottle):
    """5 auth attempts per minute per IP."""
    scope = "auth"
    rate  = "5/min"

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class PaymentThrottle(SimpleRateThrottle):
    """10 payment initiations per minute per user/IP."""
    scope = "payment"
    rate  = "10/min"

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            ident = str(request.user.pk)
        else:
            ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class CheckInThrottle(SimpleRateThrottle):
    """60 check-in scans per minute per device (identified by user or IP)."""
    scope = "checkin"
    rate  = "60/min"

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            ident = str(request.user.pk)
        else:
            ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


# ── Brute-force lockout ───────────────────────────────────────────────────────

BRUTE_FORCE_MAX_ATTEMPTS = 5
BRUTE_FORCE_WINDOW       = 60 * 15  # 15 minutes in seconds
_ATTEMPT_KEY = "bf_attempts:{identifier}"
_LOCKED_KEY  = "bf_locked:{identifier}"


def _get_identifier(request) -> str:
    """Return IP + optional email for brute-force tracking."""
    ip    = _get_client_ip(request)
    email = ""
    if hasattr(request, "data") and isinstance(request.data, dict):
        email = request.data.get("email", "")
    return f"{ip}:{email}".lower()


def _get_client_ip(request) -> str:
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


def record_failed_login(request) -> None:
    """Increment failed attempt counter; lock after MAX_ATTEMPTS."""
    identifier = _get_identifier(request)
    key        = _ATTEMPT_KEY.format(identifier=identifier)
    attempts   = cache.get(key, 0) + 1
    cache.set(key, attempts, timeout=BRUTE_FORCE_WINDOW)

    if attempts >= BRUTE_FORCE_MAX_ATTEMPTS:
        locked_key = _LOCKED_KEY.format(identifier=identifier)
        cache.set(locked_key, True, timeout=BRUTE_FORCE_WINDOW)
        logger.warning(
            "Brute-force lockout triggered for identifier=%s after %d attempts",
            identifier, attempts,
        )


def record_successful_login(request) -> None:
    """Clear failed attempt counters on successful login."""
    identifier = _get_identifier(request)
    cache.delete(_ATTEMPT_KEY.format(identifier=identifier))
    cache.delete(_LOCKED_KEY.format(identifier=identifier))


def check_brute_force_lockout(request) -> None:
    """Raise Throttled if the identifier is currently locked out."""
    identifier = _get_identifier(request)
    if cache.get(_LOCKED_KEY.format(identifier=identifier)):
        wait = cache.ttl(_LOCKED_KEY.format(identifier=identifier))
        raise Throttled(
            detail={
                "error": (
                    f"Account temporarily locked due to too many failed attempts. "
                    f"Try again in {max(wait, 1)} seconds."
                ),
                "wait": wait,
                "locked": True,
            }
        )


class BruteForceThrottle(SimpleRateThrottle):
    """
    Attach to login/OTP views. Checks lockout before allowing through.
    Falls back to standard rate-limiting for unlocked identifiers.
    """
    scope = "auth"
    rate  = "20/min"  # secondary catch-all after lockout window expires

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": _get_identifier(request),
        }

    def allow_request(self, request, view):
        check_brute_force_lockout(request)
        return super().allow_request(request, view)
