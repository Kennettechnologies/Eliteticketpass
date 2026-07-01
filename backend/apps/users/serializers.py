from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.utils import timezone
from .models import User


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_null=True)
    phone = serializers.CharField(required=False, allow_null=True)
    password = serializers.CharField(min_length=8, write_only=True)
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100, required=False, default="")
    role = serializers.ChoiceField(choices=["BUYER", "ORGANIZER"], default="BUYER")

    def validate(self, data):
        if not data.get("email") and not data.get("phone"):
            raise serializers.ValidationError("Email or phone is required.")
        if data.get("email") and User.objects.filter(email=data["email"]).exists():
            raise serializers.ValidationError({"email": "Email already registered."})
        if data.get("phone"):
            from core.utils import normalise_mpesa_phone
            try:
                data["phone"] = normalise_mpesa_phone(data["phone"])
            except ValueError as e:
                raise serializers.ValidationError({"phone": str(e)})
            if User.objects.filter(phone=data["phone"]).exists():
                raise serializers.ValidationError({"phone": "Phone already registered."})
        return data

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_null=True)
    phone = serializers.CharField(required=False, allow_null=True)
    password = serializers.CharField(write_only=True)


class UserProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()

    class Meta:
        model = User
        fields = [
            "id", "email", "phone", "role", "status", "first_name", "last_name",
            "display_name", "full_name", "avatar_url", "bio", "city", "country_code",
            "timezone", "language", "email_verified", "phone_verified",
            "marketing_emails", "sms_notifications", "push_notifications",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "role", "status", "email_verified", "phone_verified", "created_at", "updated_at"]


class UpdateProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "first_name", "last_name", "display_name", "avatar_url", "bio",
            "city", "country_code", "timezone", "language",
            "marketing_emails", "sms_notifications", "push_notifications",
            "phone",
        ]


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(min_length=8, write_only=True)


class TokenPairSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()


class OtpVerifySerializer(serializers.Serializer):
    code = serializers.CharField(max_length=6)
    otp_type = serializers.ChoiceField(choices=["phone_verify", "email_verify", "login", "password_reset"])


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=8)
