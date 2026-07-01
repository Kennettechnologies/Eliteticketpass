from .base import *
from datetime import timedelta

DEBUG = False

# ── HTTPS ───────────────────────────────────────────────────
SECURE_SSL_REDIRECT            = True
SECURE_PROXY_SSL_HEADER        = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS            = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD            = True

# ── Cookies (Strict over HTTPS only) ───────────────────────
SESSION_COOKIE_SECURE  = True
SESSION_COOKIE_SAMESITE = "Strict"
CSRF_COOKIE_SECURE     = True
CSRF_COOKIE_SAMESITE   = "Strict"

# ── JWT: tighter in production ──────────────────────────────
SIMPLE_JWT = {
    **SIMPLE_JWT,
    "ACCESS_TOKEN_LIFETIME":  timedelta(minutes=10),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}

USE_S3 = True

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"verbose": {"format": "[{levelname}] {asctime} {module}: {message}", "style": "{"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "verbose"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
