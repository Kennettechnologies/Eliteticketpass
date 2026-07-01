from django.http import JsonResponse
from apps.admin_panel.models import PlatformConfig

class MaintenanceMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path_info
        
        # Bypass maintenance mode for admin and auth routes so we don't lock ourselves out
        if path.startswith("/api/v1/admin/") or path.startswith("/api/v1/auth/") or path.startswith("/admin/"):
            return self.get_response(request)

        # We only care about blocking API routes during maintenance
        if path.startswith("/api/"):
            try:
                enabled_conf = PlatformConfig.objects.filter(key="enabled").first()
                if enabled_conf and str(enabled_conf.value).lower() == "true":
                    msg_conf = PlatformConfig.objects.filter(key="message").first()
                    message = msg_conf.value if msg_conf else "Platform is currently undergoing scheduled maintenance."
                    return JsonResponse({
                        "success": False,
                        "error": message,
                        "data": None,
                        "meta": {"maintenance": True}
                    }, status=503)
            except Exception:
                pass # If DB fails, let it pass or crash normally

        return self.get_response(request)
