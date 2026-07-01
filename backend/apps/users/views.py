import secrets
import random
import string
from datetime import timedelta
from django.utils import timezone
from django.contrib.auth import authenticate
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from django.conf import settings

from core.exceptions import api_response
from .models import User, OtpCode, PasswordResetToken, UserSession, OAuthAccount
from .serializers import (
    RegisterSerializer, LoginSerializer, UserProfileSerializer,
    UpdateProfileSerializer, ChangePasswordSerializer,
    OtpVerifySerializer, ForgotPasswordSerializer, ResetPasswordSerializer,
)


def _issue_tokens(user, request=None):
    refresh = RefreshToken.for_user(user)
    if request:
        UserSession.objects.create(
            user=user,
            refresh_token_jti=str(refresh["jti"]),
            ip_address=_get_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:512],
            expires_at=timezone.now() + timedelta(days=30),
        )
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def _get_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    return xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR", "")


def _send_otp(user, otp_type: str):
    OtpCode.objects.filter(user=user, otp_type=otp_type, used_at__isnull=True).update(
        used_at=timezone.now()
    )
    code = "".join(random.choices(string.digits, k=6))
    OtpCode.objects.create(
        user=user,
        otp_type=otp_type,
        code=code,
        expires_at=timezone.now() + timedelta(minutes=10),
    )
    # In production: send via Resend (email) or AT (SMS)
    # For now log to console
    import logging
    logging.getLogger(__name__).info(f"OTP for {user} [{otp_type}]: {code}")
    
    if otp_type == "email_verify" and user.email:
        from django.core.mail import send_mail
        send_mail(
            subject="Verify your EliteTicketPass Account",
            message=f"Your verification code is: {code}\nThis code will expire in 10 minutes.",
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@eliteticketpass.com"),
            recipient_list=[user.email],
            fail_silently=True,
        )
        
    return code


@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    ser = RegisterSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    user = ser.create(ser.validated_data)
    otp_type = "email_verify" if user.email else "phone_verify"
    _send_otp(user, otp_type)
    tokens = _issue_tokens(user, request)
    return Response(api_response(data={**tokens, "user": UserProfileSerializer(user).data}).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    ser = LoginSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    data = ser.validated_data

    user = None
    if data.get("email"):
        try:
            user = User.objects.get(email=data["email"])
        except User.DoesNotExist:
            pass
    elif data.get("phone"):
        try:
            user = User.objects.get(phone=data["phone"])
        except User.DoesNotExist:
            pass

    if user is None or not user.check_password(data["password"]):
        if user:
            user.increment_failed_login()
        return Response(
            {"success": False, "data": None, "error": "Invalid credentials.", "meta": None},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if user.is_locked():
        return Response(
            {"success": False, "data": None, "error": "Account locked. Try again in 15 minutes.", "meta": None},
            status=status.HTTP_423_LOCKED,
        )

    if user.status == "SUSPENDED":
        return Response(
            {"success": False, "data": None, "error": "Account suspended.", "meta": None},
            status=status.HTTP_403_FORBIDDEN,
        )

    if user.status == "BANNED":
        return Response(
            {"success": False, "data": None, "error": "Account permanently banned.", "meta": None},
            status=status.HTTP_403_FORBIDDEN,
        )

    user.reset_failed_login()
    user.last_login_at = timezone.now()
    user.last_login_ip = _get_ip(request)
    user.save(update_fields=["last_login_at", "last_login_ip"])

    tokens = _issue_tokens(user, request)
    response = Response(api_response(data={"access": tokens["access"], "user": UserProfileSerializer(user).data}).data)
    response.set_cookie(
        "refresh_token", tokens["refresh"],
        httponly=True, samesite="None", secure=not settings.DEBUG,
        max_age=60 * 60 * 24 * 30, path="/",
    )
    # Dev-only: set a readable refresh cookie so the frontend can POST it when running over HTTP
    if settings.DEBUG:
        response.set_cookie(
            "refresh_token_dev", tokens["refresh"],
            httponly=False, samesite="Lax", secure=False,
            max_age=60 * 60 * 24 * 30, path="/",
        )
    return response


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    try:
        refresh_token = request.COOKIES.get("refresh_token") or request.data.get("refresh")
        if refresh_token:
            token = RefreshToken(refresh_token)
            jti = token["jti"]
            UserSession.objects.filter(user=request.user, refresh_token_jti=jti).delete()
            token.blacklist()
    except TokenError:
        pass
    response = Response(api_response(data={"detail": "Logged out."}).data)
    response.delete_cookie("refresh_token", path="/")
    if settings.DEBUG:
        response.delete_cookie("refresh_token_dev", path="/")
    return response


@api_view(["POST"])
@permission_classes([AllowAny])
def token_refresh(request):
    # Prefer secure httpOnly cookie; in DEBUG allow dev cookie or body param fallback
    refresh_token = (
        request.COOKIES.get("refresh_token")
        or request.COOKIES.get("refresh_token_dev")
        or request.data.get("refresh")
    )
    if not refresh_token:
        return Response(
            {"success": False, "data": None, "error": "No refresh token.", "meta": None},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    try:
        token = RefreshToken(refresh_token)
        user_id = token.payload.get("user_id")
        user = User.objects.get(id=user_id)
        access = str(token.access_token)
        response = Response(api_response(data={"access": access, "user": UserProfileSerializer(user).data}).data)
        new_refresh = RefreshToken.for_user(user)
        response.set_cookie(
            "refresh_token", str(new_refresh),
            httponly=True, samesite="None", secure=not settings.DEBUG,
            max_age=60 * 60 * 24 * 30, path="/",
        )
        return response
    except (TokenError, User.DoesNotExist):
        response = Response(
            {"success": False, "data": None, "error": "Invalid or expired session.", "meta": None},
            status=status.HTTP_401_UNAUTHORIZED,
        )
        response.delete_cookie("refresh_token", path="/")
        return response


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_email(request):
    ser = OtpVerifySerializer(data={**request.data, "otp_type": "email_verify"})
    ser.is_valid(raise_exception=True)
    otp = OtpCode.objects.filter(
        user=request.user, otp_type="email_verify", used_at__isnull=True
    ).order_by("-created_at").first()

    if not otp or not otp.is_valid() or otp.code != ser.validated_data["code"]:
        if otp:
            otp.attempt_count += 1
            otp.save(update_fields=["attempt_count"])
        return Response(
            {"success": False, "data": None, "error": "Invalid or expired OTP.", "meta": None},
            status=status.HTTP_400_BAD_REQUEST,
        )

    otp.used_at = timezone.now()
    otp.save(update_fields=["used_at"])
    request.user.email_verified = True
    request.user.email_verified_at = timezone.now()
    request.user.status = "ACTIVE"
    request.user.save(update_fields=["email_verified", "email_verified_at", "status"])
    return Response(api_response(data={"verified": True}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_phone(request):
    ser = OtpVerifySerializer(data={**request.data, "otp_type": "phone_verify"})
    ser.is_valid(raise_exception=True)
    otp = OtpCode.objects.filter(
        user=request.user, otp_type="phone_verify", used_at__isnull=True
    ).order_by("-created_at").first()

    if not otp or not otp.is_valid() or otp.code != ser.validated_data["code"]:
        if otp:
            otp.attempt_count += 1
            otp.save(update_fields=["attempt_count"])
        return Response(
            {"success": False, "data": None, "error": "Invalid or expired OTP.", "meta": None},
            status=status.HTTP_400_BAD_REQUEST,
        )

    otp.used_at = timezone.now()
    otp.save(update_fields=["used_at"])
    request.user.phone_verified = True
    request.user.phone_verified_at = timezone.now()
    request.user.status = "ACTIVE"
    request.user.save(update_fields=["phone_verified", "phone_verified_at", "status"])
    return Response(api_response(data={"verified": True}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def resend_otp(request):
    otp_type = request.data.get("otp_type", "email_verify")
    _send_otp(request.user, otp_type)
    return Response(api_response(data={"sent": True}).data)


@api_view(["POST"])
@permission_classes([AllowAny])
def forgot_password(request):
    ser = ForgotPasswordSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    email = ser.validated_data["email"]
    try:
        user = User.objects.get(email=email)
        token_str = secrets.token_urlsafe(48)
        PasswordResetToken.objects.create(
            email=email,
            token=token_str,
            expires_at=timezone.now() + timedelta(hours=2),
        )
        # send reset email
        import logging
        logging.getLogger(__name__).info(f"Password reset token for {email}: {token_str}")
        
        from django.core.mail import send_mail
        frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
        reset_link = f"{frontend_url}/auth/reset-password?token={token_str}"
        send_mail(
            subject="Reset your EliteTicketPass Password",
            message=f"Click the link below to reset your password:\n{reset_link}\nIf you did not request this, please ignore this email.",
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@eliteticketpass.com"),
            recipient_list=[email],
            fail_silently=True,
        )
    except User.DoesNotExist:
        pass
    return Response(api_response(data={"sent": True}).data)


@api_view(["POST"])
@permission_classes([AllowAny])
def reset_password(request):
    ser = ResetPasswordSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    reset_token = PasswordResetToken.objects.filter(token=ser.validated_data["token"]).first()
    if not reset_token or not reset_token.is_valid():
        return Response(
            {"success": False, "data": None, "error": "Invalid or expired token.", "meta": None},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.get(email=reset_token.email)
    except User.DoesNotExist:
        return Response(
            {"success": False, "data": None, "error": "User not found.", "meta": None},
            status=status.HTTP_404_NOT_FOUND,
        )

    user.set_password(ser.validated_data["new_password"])
    user.save()
    reset_token.used_at = timezone.now()
    reset_token.save(update_fields=["used_at"])
    UserSession.objects.filter(user=user).delete()
    return Response(api_response(data={"reset": True}).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(api_response(data=UserProfileSerializer(request.user).data).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_me(request):
    ser = UpdateProfileSerializer(request.user, data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    ser.save()
    return Response(api_response(data=UserProfileSerializer(request.user).data).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password(request):
    ser = ChangePasswordSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    if not request.user.check_password(ser.validated_data["current_password"]):
        return Response(
            {"success": False, "data": None, "error": "Current password is incorrect.", "meta": None},
            status=status.HTTP_400_BAD_REQUEST,
        )
    request.user.set_password(ser.validated_data["new_password"])
    request.user.save()
    UserSession.objects.filter(user=request.user).delete()
    return Response(api_response(data={"changed": True}).data)


def _parse_ua(ua: str):
    ua = ua.lower()
    if "mobile" in ua or "android" in ua or "iphone" in ua:
        device_type = "mobile"
    elif "tablet" in ua or "ipad" in ua:
        device_type = "tablet"
    elif ua:
        device_type = "desktop"
    else:
        device_type = "unknown"
    if "firefox" in ua:        browser = "Firefox"
    elif "edg" in ua:          browser = "Edge"
    elif "chrome" in ua:       browser = "Chrome"
    elif "safari" in ua:       browser = "Safari"
    elif "opera" in ua:        browser = "Opera"
    else:                       browser = "Unknown Browser"
    if "windows" in ua:   os_name = "Windows"
    elif "mac" in ua:     os_name = "macOS"
    elif "linux" in ua:   os_name = "Linux"
    elif "android" in ua: os_name = "Android"
    elif "ios" in ua or "iphone" in ua or "ipad" in ua: os_name = "iOS"
    else:                 os_name = "Unknown OS"
    return device_type, browser, os_name


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_sessions(request):
    sessions = UserSession.objects.filter(
        user=request.user, expires_at__gt=timezone.now()
    ).order_by("-created_at")
    current_ua = request.META.get("HTTP_USER_AGENT", "")[:512]
    data = []
    for s in sessions:
        device_type, browser, os_name = _parse_ua(s.user_agent or "")
        data.append({
            "id": str(s.id),
            "device_type": device_type,
            "browser": browser,
            "os": os_name,
            "ip_address": s.ip_address or "",
            "location": None,
            "last_active": s.created_at.isoformat(),
            "created_at": s.created_at.isoformat(),
            "is_current": s.user_agent == current_ua,
        })
    return Response(api_response(data=data).data)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def revoke_session(request, session_id):
    from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
    try:
        session = UserSession.objects.get(id=session_id, user=request.user)
        try:
            token = OutstandingToken.objects.get(jti=session.refresh_token_jti)
            BlacklistedToken.objects.get_or_create(token=token)
        except OutstandingToken.DoesNotExist:
            pass
        session.delete()
    except UserSession.DoesNotExist:
        pass
    return Response(api_response(data={"revoked": True}).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def oauth_providers(request):
    connected = {a.provider: a for a in OAuthAccount.objects.filter(user=request.user)}
    data = []
    for provider in ["google", "facebook", "apple"]:
        if provider in connected:
            data.append({"provider": provider, "connected": True,
                         "connected_at": connected[provider].created_at.isoformat()})
    return Response(api_response(data=data).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def gdpr_export(request):
    import json
    from django.http import HttpResponse
    user = request.user
    payload = {
        "profile": UserProfileSerializer(user).data,
        "sessions": list(UserSession.objects.filter(user=user).values(
            "id", "ip_address", "user_agent", "created_at", "expires_at"
        )),
        "notification_preferences": list(
            user.notif_preferences.values("notif_type", "channel", "enabled")
        ),
        "push_subscriptions": list(
            user.push_subscriptions.values("endpoint", "created_at")
        ),
    }
    response = HttpResponse(
        json.dumps(payload, default=str, indent=2),
        content_type="application/json",
    )
    response["Content-Disposition"] = 'attachment; filename="eliteticketpass-data-export.json"'
    return response


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def delete_account(request):
    request.user.deleted_at = timezone.now()
    request.user.status = "BANNED"
    request.user.is_active = False
    request.user.save(update_fields=["deleted_at", "status", "is_active"])
    return Response(api_response(data={"deleted": True}).data)

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def payout_profile(request):
    from .models import UserPayoutProfile
    from apps.payments.paystack_service import paystack_client
    
    if request.method == "POST":
        bank_code = request.data.get("bank_code", "").strip()
        account_number = request.data.get("account_number", "").strip()
        
        if not bank_code or not account_number:
            return Response({"success": False, "error": "Bank code and account number required."}, status=400)
            
        try:
            name = f"{request.user.first_name} {request.user.last_name}".strip()
            recipient_data = paystack_client.create_transfer_recipient(
                account_name=name,
                account_number=account_number,
                bank_code=bank_code,
                currency="KES"
            )
            
            profile, _ = UserPayoutProfile.objects.update_or_create(
                user=request.user,
                defaults={
                    "paystack_bank_code": bank_code,
                    "paystack_account_number": account_number,
                    "paystack_recipient_code": recipient_data["recipient_code"]
                }
            )
            return Response(api_response(data={
                "bank_code": profile.paystack_bank_code,
                "account_number": profile.paystack_account_number,
            }).data)
        except Exception as e:
            return Response({"success": False, "error": f"Failed to verify bank details: {str(e)}"}, status=400)
        
    try:
        profile = UserPayoutProfile.objects.get(user=request.user)
        return Response(api_response(data={
            "bank_code": profile.paystack_bank_code,
            "account_number": profile.paystack_account_number
        }).data)
    except UserPayoutProfile.DoesNotExist:
        return Response(api_response(data={
            "bank_code": "",
            "account_number": ""
        }).data)

# --- NEW AUTH ENDPOINTS ---

@api_view(["POST"])
@permission_classes([AllowAny])
def auth_google(request):
    import requests
    token = request.data.get("credential")
    if not token:
        return Response({"success": False, "error": "Missing credential."}, status=400)

    try:
        # Fetch user info using access_token
        res = requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {token}"}
        )
        if not res.ok:
            return Response({"success": False, "error": "Failed to fetch user info from Google."}, status=400)
            
        idinfo = res.json()
        email = idinfo.get("email")
        if not email:
            return Response({"success": False, "error": "Email not provided by Google."}, status=400)
        
        provider_user_id = idinfo.get("sub")
        first_name = idinfo.get("given_name", "")
        last_name = idinfo.get("family_name", "")
        
        user = User.objects.filter(email=email).first()
        if not user:
            user = User.objects.create_user(
                email=email,
                first_name=first_name,
                last_name=last_name,
                password=User.objects.make_random_password(),
                status="ACTIVE",
                email_verified=True,
                email_verified_at=timezone.now()
            )
        else:
            update_fields = []
            if not user.first_name and first_name:
                user.first_name = first_name
                update_fields.append("first_name")
            if not user.last_name and last_name:
                user.last_name = last_name
                update_fields.append("last_name")
            if not user.email_verified:
                user.email_verified = True
                user.email_verified_at = timezone.now()
                update_fields.extend(["email_verified", "email_verified_at"])
                if user.status == "PENDING_VERIFICATION":
                    user.status = "ACTIVE"
                    update_fields.append("status")
            if update_fields:
                user.save(update_fields=update_fields)
            
        OAuthAccount.objects.get_or_create(
            user=user, provider="google", provider_user_id=provider_user_id
        )
        
        user.last_login_at = timezone.now()
        user.last_login_ip = _get_ip(request)
        user.save(update_fields=["last_login_at", "last_login_ip"])
        
        tokens = _issue_tokens(user, request)
        response = Response(api_response(data={"access": tokens["access"], "user": UserProfileSerializer(user).data}).data)
        response.set_cookie(
            "refresh_token", tokens["refresh"],
            httponly=True, samesite="None", secure=not settings.DEBUG,
            max_age=60 * 60 * 24 * 30, path="/",
        )
        if settings.DEBUG:
            response.set_cookie("refresh_token_dev", tokens["refresh"], httponly=False, samesite="Lax", secure=False, max_age=60 * 60 * 24 * 30, path="/")
        return response
    except ValueError:
        return Response({"success": False, "error": "Invalid Google token."}, status=401)


@api_view(["POST"])
@permission_classes([AllowAny])
def otp_send(request):
    phone = request.data.get("phone")
    if not phone:
        return Response({"success": False, "error": "Phone number required."}, status=400)
        
    user = User.objects.filter(phone=phone).first()
    if not user:
        user = User.objects.create_user(
            phone=phone,
            password=User.objects.make_random_password(),
            status="PENDING_VERIFICATION"
        )
    _send_otp(user, "login")
    return Response(api_response(data={"sent": True}).data)


@api_view(["POST"])
@permission_classes([AllowAny])
def otp_verify(request):
    phone = request.data.get("phone")
    code = request.data.get("otp")
    if not phone or not code:
        return Response({"success": False, "error": "Phone and OTP required."}, status=400)
        
    user = User.objects.filter(phone=phone).first()
    if not user:
        return Response({"success": False, "error": "User not found."}, status=404)
        
    otp = OtpCode.objects.filter(user=user, otp_type="login", used_at__isnull=True).order_by("-created_at").first()
    if not otp or not otp.is_valid() or otp.code != code:
        if otp:
            otp.attempt_count += 1
            otp.save(update_fields=["attempt_count"])
        return Response({"success": False, "error": "Invalid or expired OTP."}, status=400)
        
    otp.used_at = timezone.now()
    otp.save(update_fields=["used_at"])
    
    user.phone_verified = True
    user.phone_verified_at = timezone.now()
    if user.status == "PENDING_VERIFICATION":
        user.status = "ACTIVE"
    user.last_login_at = timezone.now()
    user.last_login_ip = _get_ip(request)
    user.save(update_fields=["phone_verified", "phone_verified_at", "status", "last_login_at", "last_login_ip"])
    
    tokens = _issue_tokens(user, request)
    response = Response(api_response(data={"access": tokens["access"], "user": UserProfileSerializer(user).data}).data)
    response.set_cookie(
        "refresh_token", tokens["refresh"],
        httponly=True, samesite="None", secure=not settings.DEBUG,
        max_age=60 * 60 * 24 * 30, path="/",
    )
    if settings.DEBUG:
        response.set_cookie("refresh_token_dev", tokens["refresh"], httponly=False, samesite="Lax", secure=False, max_age=60 * 60 * 24 * 30, path="/")
    return response


@api_view(["POST"])
@permission_classes([AllowAny])
def magic_link_send(request):
    email = request.data.get("email")
    if not email:
        return Response({"success": False, "error": "Email required."}, status=400)
        
    user = User.objects.filter(email=email).first()
    if not user:
        user = User.objects.create_user(
            email=email,
            password=User.objects.make_random_password(),
            status="PENDING_VERIFICATION"
        )
        
    token_str = secrets.token_urlsafe(48)
    PasswordResetToken.objects.create(
        email=email,
        token=token_str,
        expires_at=timezone.now() + timedelta(hours=2),
    )
    
    import logging
    logging.getLogger(__name__).info(f"Magic link token for {email}: {token_str}")
    
    from django.core.mail import send_mail
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    magic_link = f"{frontend_url}/auth/magic-link?token={token_str}"
    send_mail(
        subject="Sign in to EliteTicketPass",
        message=f"Click the link below to sign in:\n{magic_link}\nIf you did not request this, please ignore this email.",
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@eliteticketpass.com"),
        recipient_list=[email],
        fail_silently=True,
    )
    return Response(api_response(data={"sent": True}).data)


@api_view(["POST"])
@permission_classes([AllowAny])
def magic_link_verify(request):
    token_str = request.data.get("token")
    if not token_str:
        return Response({"success": False, "error": "Token required."}, status=400)
        
    token_obj = PasswordResetToken.objects.filter(token=token_str).first()
    if not token_obj or not token_obj.is_valid():
        return Response({"success": False, "error": "Invalid or expired token."}, status=400)
        
    user = User.objects.filter(email=token_obj.email).first()
    if not user:
        return Response({"success": False, "error": "User not found."}, status=404)
        
    token_obj.used_at = timezone.now()
    token_obj.save(update_fields=["used_at"])
    
    user.email_verified = True
    user.email_verified_at = timezone.now()
    if user.status == "PENDING_VERIFICATION":
        user.status = "ACTIVE"
    user.last_login_at = timezone.now()
    user.last_login_ip = _get_ip(request)
    user.save(update_fields=["email_verified", "email_verified_at", "status", "last_login_at", "last_login_ip"])
    
    tokens = _issue_tokens(user, request)
    response = Response(api_response(data={"access": tokens["access"], "user": UserProfileSerializer(user).data}).data)
    response.set_cookie(
        "refresh_token", tokens["refresh"],
        httponly=True, samesite="None", secure=not settings.DEBUG,
        max_age=60 * 60 * 24 * 30, path="/",
    )
    if settings.DEBUG:
        response.set_cookie("refresh_token_dev", tokens["refresh"], httponly=False, samesite="Lax", secure=False, max_age=60 * 60 * 24 * 30, path="/")
    return response
