from pathlib import Path
from datetime import timedelta
import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
)
environ.Env.read_env(BASE_DIR.parent / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env("ALLOWED_HOSTS")
if "RENDER_EXTERNAL_HOSTNAME" in env.ENVIRON:
    ALLOWED_HOSTS.append(env("RENDER_EXTERNAL_HOSTNAME"))
# Also allow wildcard render domain as fallback
if ".onrender.com" not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(".onrender.com")

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "channels",
    "django_celery_beat",
    "django_celery_results",
    "storages",
]

LOCAL_APPS = [
    "apps.users",
    "apps.organizers",
    "apps.events",
    "apps.tickets",
    "apps.orders",
    "apps.payments",
    "apps.checkin",
    "apps.notifications",
    "apps.refunds",
    "apps.payouts",
    "apps.promos",
    "apps.admin_panel",
    "apps.analytics",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "core.audit.AuditMiddleware",
    "core.security.SecurityHeadersMiddleware",
    "core.middleware.MaintenanceMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": env.db("DATABASE_URL", default="postgresql://ticketbase:ticketbase_dev@localhost:5432/ticketbase")
}

AUTH_USER_MODEL = "users.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Nairobi"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "static"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── REST Framework ─────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "core.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "core.exceptions.custom_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon":    "100/hour",
        "user":    "1000/hour",
        "auth":    "5/min",
        "payment_initiation": "5/minute",
        "payment": "10/min",
        "checkin": "60/min",
    },
}

# ── JWT ────────────────────────────────────────────────────
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# ── CORS ────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:3000"])
CORS_ALLOW_CREDENTIALS = True

# ── drf-spectacular ────────────────────────────────────────
SPECTACULAR_SETTINGS = {
    "TITLE": "EliteTicketPass API",
    "DESCRIPTION": "Multi-tenant event ticketing platform",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
}

# ── Celery ─────────────────────────────────────────────────
CELERY_BROKER_URL = env("REDIS_URL", default="redis://localhost:6379/0")
CELERY_RESULT_BACKEND = "django-db"
CELERY_CACHE_BACKEND = "django-cache"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "Africa/Nairobi"
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"
CELERY_TASK_ROUTES = {
    "apps.tickets.tasks.*": {"queue": "tickets"},
    "apps.notifications.tasks.*": {"queue": "notifications"},
    "apps.payments.tasks.*": {"queue": "payments"},
    "apps.analytics.tasks.*": {"queue": "analytics"},
}

CELERY_BEAT_SCHEDULE = {
    'retry-queued-payouts': {
        'task': 'payments.retry_queued_payouts',
        'schedule': 300.0,
    },
}

# ── Django Channels ────────────────────────────────────────
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [env("REDIS_URL", default="redis://localhost:6379/0")]},
    }
}

# ── Cache ──────────────────────────────────────────────────
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": env("REDIS_URL", default="redis://localhost:6379/1"),
        "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
    }
}

# ── Storage ────────────────────────────────────────────────
USE_S3 = env.bool("USE_S3", default=False)
if USE_S3:
    AWS_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY")
    AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME")
    AWS_S3_REGION_NAME = env("AWS_S3_REGION_NAME", default="us-east-1")
    AWS_S3_ENDPOINT_URL = env("AWS_S3_ENDPOINT_URL", default=None)
    AWS_S3_CUSTOM_DOMAIN = env("AWS_S3_CUSTOM_DOMAIN", default=None)
    AWS_DEFAULT_ACL = "public-read"
    AWS_S3_OBJECT_PARAMETERS = {"CacheControl": "max-age=86400"}
    DEFAULT_FILE_STORAGE = "storages.backends.s3boto3.S3Boto3Storage"
    MEDIA_URL = f"https://{AWS_STORAGE_BUCKET_NAME}.s3.amazonaws.com/"

# ── M-Pesa ─────────────────────────────────────────────────
MPESA_ENV = env("MPESA_ENV", default="sandbox")
MPESA_CONSUMER_KEY = env("MPESA_CONSUMER_KEY", default="")
MPESA_CONSUMER_SECRET = env("MPESA_CONSUMER_SECRET", default="")
MPESA_SHORTCODE = env("MPESA_SHORTCODE", default="174379")
MPESA_PASSKEY = env("MPESA_PASSKEY", default="")
MPESA_CALLBACK_BASE_URL = env("MPESA_CALLBACK_BASE_URL", default="")
MPESA_B2C_INITIATOR_NAME = env("MPESA_B2C_INITIATOR_NAME", default="")
MPESA_B2C_SECURITY_CREDENTIAL = env("MPESA_B2C_SECURITY_CREDENTIAL", default="")

# ── Stripe ─────────────────────────────────────────────────
STRIPE_SECRET_KEY = env("STRIPE_SECRET_KEY", default="")
STRIPE_WEBHOOK_SECRET = env("STRIPE_WEBHOOK_SECRET", default="")

# ── Email (SMTP) ───────────────────────────────────────────
EMAIL_BACKEND  = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST     = env("EMAIL_HOST",     default="smtp.gmail.com")
EMAIL_PORT     = env.int("EMAIL_PORT", default=587)
EMAIL_USE_TLS  = env.bool("EMAIL_USE_TLS", default=True)
EMAIL_USE_SSL  = env.bool("EMAIL_USE_SSL", default=False)
EMAIL_HOST_USER     = env("EMAIL_HOST_USER",     default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_FROM      = env("EMAIL_FROM",      default=EMAIL_HOST_USER)
EMAIL_FROM_NAME = env("EMAIL_FROM_NAME", default="EliteTicketPass")
DEFAULT_FROM_EMAIL = f"{EMAIL_FROM_NAME} <{EMAIL_FROM}>"
# Legacy Resend key kept for backward compat (unused when SMTP is configured)
RESEND_API_KEY = env("RESEND_API_KEY", default="")

FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:3000")

# ── Africa's Talking ───────────────────────────────────────
AT_API_KEY = env("AT_API_KEY", default="")
AT_USERNAME = env("AT_USERNAME", default="sandbox")

# ── Twilio ─────────────────────────────────────────────────
TWILIO_ACCOUNT_SID = env("TWILIO_ACCOUNT_SID", default="")
TWILIO_AUTH_TOKEN = env("TWILIO_AUTH_TOKEN", default="")
TWILIO_WHATSAPP_FROM = env("TWILIO_WHATSAPP_FROM", default="")

# ── Cron ───────────────────────────────────────────────────
CRON_SECRET = env("CRON_SECRET", default="change-me")

# ── Platform fee defaults ──────────────────────────────────
PLATFORM_FEE_PERCENT = 5.0
PLATFORM_FEE_FLAT = 0.0
PLATFORM_FEE_ABSORBED_BY = "buyer"  # buyer | organizer

# ── Security hardening ─────────────────────────────────────
SECURE_CONTENT_TYPE_NOSNIFF  = True
SECURE_BROWSER_XSS_FILTER    = True
X_FRAME_OPTIONS               = "DENY"
SESSION_COOKIE_HTTPONLY       = True
SESSION_COOKIE_SAMESITE       = "Lax"
CSRF_COOKIE_HTTPONLY          = False   # JS must read it for SPA CSRF
CSRF_COOKIE_SAMESITE          = "Lax"
CSRF_TRUSTED_ORIGINS          = env.list("CSRF_TRUSTED_ORIGINS", default=["http://localhost:3000"])

# ── Daraja callback security ────────────────────────────────
DARAJA_CALLBACK_TOKEN = env("DARAJA_CALLBACK_TOKEN", default="")
DARAJA_ALLOWED_IPS    = env.list("DARAJA_ALLOWED_IPS", default=[])

# ── Web Push (VAPID) ────────────────────────────────────────
VAPID_PRIVATE_KEY      = env("VAPID_PRIVATE_KEY", default="")
VAPID_PUBLIC_KEY       = env("VAPID_PUBLIC_KEY",  default="")
VAPID_CLAIMS_SUBJECT   = env("VAPID_CLAIMS_SUBJECT", default="mailto:admin@eliteticketpass.com")
