from .base import *

DEBUG = False

INSTALLED_APPS += ["debug_toolbar"] if False else []


CORS_ALLOW_ALL_ORIGINS = True

# ── Dev cache: no Redis required ────────────────────────────
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "eliteticketpass-dev",
    }
}

# ── Celery: run tasks synchronously in dev (no Redis required) ─
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# ── Disable global throttling in dev (Redis not required) ───
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_CLASSES": [],
    "DEFAULT_THROTTLE_RATES": {},
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "DEBUG"},
    "loggers": {
        "django.db.backends": {"handlers": ["console"], "level": "DEBUG", "propagate": False},
    },
}
