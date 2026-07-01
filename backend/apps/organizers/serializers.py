from rest_framework import serializers
from .models import Organizer, KycDocument


class OrganizerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organizer
        fields = [
            "id", "slug", "name", "display_name", "logo_url", "banner_url", "bio",
            "website_url", "facebook_url", "twitter_url", "instagram_url", "youtube_url",
            "business_type", "contact_email", "contact_phone", "contact_address", "status", "tier",
            "is_verified", "is_featured", "payout_method", "mpesa_phone",
            "bank_name", "bank_account_name", "bank_account_number", "bank_branch",
            "kyc_status", "kyc_submitted_at", "fee_agreement_accepted", "fee_agreement_accepted_at", "created_at",
        ]
        read_only_fields = ["id", "status", "tier", "is_verified", "kyc_status", "kyc_submitted_at", "fee_agreement_accepted_at", "created_at"]


class OrganizerUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organizer
        fields = [
            "name", "display_name", "logo_url", "banner_url", "bio",
            "website_url", "facebook_url", "twitter_url", "instagram_url", "youtube_url",
            "contact_email", "contact_phone", "contact_address", "payout_method", "mpesa_phone",
            "bank_name", "bank_account_name", "bank_account_number", "bank_branch",
            "business_type",
        ]
