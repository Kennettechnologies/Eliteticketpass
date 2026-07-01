import json
from django.utils import timezone
from rest_framework.response import Response
from rest_framework import status


class AuditLogMixin:
    """Auto-creates AuditLog on create/update/destroy."""

    audit_action_map = {
        "create": "CREATE",
        "update": "UPDATE",
        "partial_update": "UPDATE",
        "destroy": "DELETE",
    }

    def _write_audit(self, request, action: str, instance=None, old_value=None, new_value=None):
        try:
            from apps.admin_panel.models import AuditLog
            entity_id = str(instance.pk) if instance else None
            entity = type(instance).__name__ if instance else ""
            AuditLog.objects.create(
                user=request.user if request.user.is_authenticated else None,
                action=action,
                entity=entity,
                entity_id=entity_id,
                old_value=old_value,
                new_value=new_value,
                ip_address=self._get_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", "")[:512],
            )
        except Exception:
            pass

    @staticmethod
    def _get_ip(request) -> str:
        x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if x_forwarded_for:
            return x_forwarded_for.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "")

    def perform_create(self, serializer):
        instance = serializer.save()
        self._write_audit(self.request, "CREATE", instance, new_value=serializer.data)
        return instance

    def perform_update(self, serializer):
        old = dict(serializer.data) if serializer.instance else None
        instance = serializer.save()
        self._write_audit(self.request, "UPDATE", instance, old_value=old, new_value=serializer.data)
        return instance

    def perform_destroy(self, instance):
        old = {"id": str(instance.pk)}
        self._write_audit(self.request, "DELETE", instance, old_value=old)
        instance.delete()


class SoftDeleteMixin:
    """Override destroy to set deleted_at and filter queryset."""

    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)

    def perform_destroy(self, instance):
        instance.deleted_at = timezone.now()
        instance.save(update_fields=["deleted_at"])


class EnvelopeResponseMixin:
    """Wraps response data in { success, data, error, meta } envelope."""

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        if (
            isinstance(response.data, dict)
            and "success" not in response.data
            and response.status_code < 400
        ):
            response.data = {
                "success": True,
                "data": response.data,
                "error": None,
                "meta": None,
            }
        return response
