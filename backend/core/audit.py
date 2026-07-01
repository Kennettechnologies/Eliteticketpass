"""
Audit logging utilities.

Usage in views:
    from core.audit import log_audit, AuditLogMixin

    # Functional:
    log_audit(request, action="UPDATE", entity="Event", entity_id=str(event.pk),
              old_value=old, new_value=new)

    # Mixin on ViewSets — auto-logs create/update/destroy:
    class MyViewSet(AuditLogMixin, ModelViewSet): ...
"""

import logging
from typing import Any

from django.http import HttpRequest

logger = logging.getLogger(__name__)


def _get_ip(request: HttpRequest) -> str:
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def _get_ua(request: HttpRequest) -> str:
    return request.META.get("HTTP_USER_AGENT", "")[:512]


def log_audit(
    request: HttpRequest,
    *,
    action: str,
    entity: str,
    entity_id: str = "",
    old_value: Any = None,
    new_value: Any = None,
    metadata: dict | None = None,
) -> None:
    """
    Persist an AuditLog entry.  Silently swallows errors so a logging
    failure never breaks the main request path.
    """
    try:
        from apps.admin_panel.models import AuditLog

        user = getattr(request, "user", None)
        if user and not user.is_authenticated:
            user = None

        AuditLog.objects.create(
            user=user,
            action=action,
            entity=entity,
            entity_id=str(entity_id) if entity_id else "",
            old_value=old_value,
            new_value=new_value,
            metadata=metadata,
            ip_address=_get_ip(request) or None,
            user_agent=_get_ua(request),
        )
    except Exception as exc:
        logger.error("audit log write failed: %s", exc)


# ── ViewSet mixin ─────────────────────────────────────────────────────────────

class AuditLogMixin:
    """
    Mixin for DRF ModelViewSet / GenericAPIView subclasses.
    Auto-logs CREATE, UPDATE, DELETE actions.

    Override `audit_entity_name` to set the entity label (defaults to
    the model class name).
    """

    audit_entity_name: str | None = None

    def _audit_entity(self) -> str:
        if self.audit_entity_name:
            return self.audit_entity_name
        qs = getattr(self, "queryset", None)
        if qs is not None:
            return qs.model.__name__
        return "Unknown"

    def perform_create(self, serializer):
        instance = serializer.save()
        log_audit(
            self.request,
            action="CREATE",
            entity=self._audit_entity(),
            entity_id=str(instance.pk),
            new_value=serializer.data,
        )
        return instance

    def perform_update(self, serializer):
        old = serializer.instance.__dict__.copy() if serializer.instance else {}
        old.pop("_state", None)
        instance = serializer.save()
        log_audit(
            self.request,
            action="UPDATE",
            entity=self._audit_entity(),
            entity_id=str(instance.pk),
            old_value={k: str(v) for k, v in old.items()},
            new_value=serializer.data,
        )
        return instance

    def perform_destroy(self, instance):
        log_audit(
            self.request,
            action="DELETE",
            entity=self._audit_entity(),
            entity_id=str(instance.pk),
        )
        instance.delete()


# ── Automatic auth-event middleware ───────────────────────────────────────────

class AuditMiddleware:
    """
    Passive middleware that auto-logs LOGIN and LOGOUT events by watching
    for specific URL patterns and response codes.

    Attach in MIDDLEWARE after AuthenticationMiddleware.
    """

    LOGIN_PATHS  = {"/api/v1/auth/login/", "/api/v1/auth/otp/verify/", "/api/v1/auth/magic-link/verify/"}
    LOGOUT_PATHS = {"/api/v1/auth/logout/"}

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest):
        response = self.get_response(request)
        path = request.path

        try:
            if path in self.LOGIN_PATHS and request.method == "POST":
                if response.status_code in (200, 201):
                    log_audit(request, action="LOGIN", entity="User",
                              metadata={"path": path})
                else:
                    log_audit(request, action="LOGIN", entity="User",
                              metadata={"path": path, "failed": True,
                                        "status": response.status_code})

            elif path in self.LOGOUT_PATHS and request.method == "POST":
                log_audit(request, action="LOGOUT", entity="User")
        except Exception as exc:
            logger.debug("AuditMiddleware: %s", exc)

        return response
