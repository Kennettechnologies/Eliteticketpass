from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "SUPER_ADMIN")


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "ADMIN")


class IsAdminOrSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and request.user.role in ("ADMIN", "SUPER_ADMIN")
        )


class IsOrganizer(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "ORGANIZER")


class IsApprovedOrganizer(BasePermission):
    message = "Your organizer account must be approved to perform this action."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated and request.user.role == "ORGANIZER"):
            return False
        try:
            return request.user.organizer_profile.status == "APPROVED"
        except Exception:
            return False


class IsGateStaff(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and request.user.role in ("GATE_STAFF", "ORGANIZER", "ADMIN", "SUPER_ADMIN")
        )


class IsOwnerOrAdmin(BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.user.role in ("ADMIN", "SUPER_ADMIN"):
            return True
        owner = getattr(obj, "user", None) or getattr(obj, "buyer", None)
        return owner == request.user


class IsOrganizersEvent(BasePermission):
    message = "You do not own this event."

    def has_object_permission(self, request, view, obj):
        if request.user.role in ("ADMIN", "SUPER_ADMIN"):
            return True
        try:
            return obj.organizer.user == request.user
        except Exception:
            return False


class IsReadOnly(BasePermission):
    def has_permission(self, request, view):
        return request.method in SAFE_METHODS


class IsCronAuthorized(BasePermission):
    def has_permission(self, request, view):
        from django.conf import settings
        secret = request.headers.get("X-Cron-Secret", "")
        return secret == settings.CRON_SECRET
