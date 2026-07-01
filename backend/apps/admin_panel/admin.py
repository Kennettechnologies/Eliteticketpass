from django.contrib import admin
from .models import PlatformConfig, PlatformFeeSetting

@admin.register(PlatformConfig)
class PlatformConfigAdmin(admin.ModelAdmin):
    list_display = ('key', 'description', 'is_public', 'updated_at')
    search_fields = ('key', 'description')
    list_filter = ('is_public',)

@admin.register(PlatformFeeSetting)
class PlatformFeeSettingAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return not PlatformFeeSetting.objects.exists()
    
    def has_delete_permission(self, request, obj=None):
        return False
