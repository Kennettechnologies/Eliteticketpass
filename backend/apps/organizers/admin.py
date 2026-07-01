from django.contrib import admin
from .models import Organizer, KycDocument

class KycDocumentInline(admin.TabularInline):
    model = KycDocument
    extra = 0
    readonly_fields = ("doc_type", "file_name", "file_url", "uploaded_at")

@admin.register(Organizer)
class OrganizerAdmin(admin.ModelAdmin):
    list_display = ("display_name", "user", "kyc_status", "tier", "is_verified", "created_at")
    list_filter = ("kyc_status", "tier", "is_verified", "business_type", "status")
    search_fields = ("name", "display_name", "slug", "user__email")
    inlines = [KycDocumentInline]
    
    actions = ['approve_kyc', 'reject_kyc']

    def approve_kyc(self, request, queryset):
        queryset.update(kyc_status="APPROVED", is_verified=True)
    approve_kyc.short_description = "Approve KYC and Verify Organizer(s)"

    def reject_kyc(self, request, queryset):
        queryset.update(kyc_status="REJECTED", is_verified=False)
    reject_kyc.short_description = "Reject KYC Document(s)"

@admin.register(KycDocument)
class KycDocumentAdmin(admin.ModelAdmin):
    list_display = ("organizer", "doc_type", "status", "uploaded_at")
    list_filter = ("status", "doc_type")
    search_fields = ("organizer__name", "organizer__display_name")
