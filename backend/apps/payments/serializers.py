from rest_framework import serializers
from .models import OrganizerPayoutProfile, OrganizerPayout

class OrganizerPayoutProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrganizerPayoutProfile
        fields = [
            'payout_method', 'mpesa_phone',
            'bank_name', 'bank_account_number',
            'bank_account_name', 'bank_branch_code',
            'payout_status', 'verified_at',
        ]
        read_only_fields = ['payout_status', 'verified_at', 'paystack_recipient_code']

    def validate(self, data):
        method = data.get('payout_method', 'mpesa')
        if method == 'mpesa':
            if not data.get('mpesa_phone'):
                raise serializers.ValidationError("M-Pesa phone number is required.")
            phone = data['mpesa_phone'].replace('+', '').replace(' ', '')
            if not phone.startswith('2547') or len(phone) != 12:
                raise serializers.ValidationError(
                    "Phone must be in 2547XXXXXXXX format."
                )
            data['mpesa_phone'] = phone
        elif method == 'bank':
            required = ['bank_name', 'bank_account_number', 'bank_account_name',
                        'bank_branch_code']
            for field in required:
                if not data.get(field):
                    raise serializers.ValidationError(f"{field} is required for bank payout.")
        return data

    def save(self, **kwargs):
        instance = super().save(**kwargs)
        if instance.payout_method == 'bank' and not instance.paystack_recipient_code:
            # When bank details saved, create Paystack Transfer Recipient
            # A real task would go here, omitting for brevity in serializer
            try:
                from .paystack_service import paystack_client
                res = paystack_client.create_transfer_recipient(
                    account_name=instance.bank_account_name,
                    account_number=instance.bank_account_number,
                    bank_code=instance.bank_branch_code,
                )
                instance.paystack_recipient_code = res.get('recipient_code', '')
                instance.save()
            except Exception as e:
                pass
        return instance
