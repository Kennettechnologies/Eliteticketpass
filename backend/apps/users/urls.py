from django.urls import path
from . import views

urlpatterns = [
    path("register/", views.register),
    path("login/", views.login),
    path("logout/", views.logout),
    path("token/refresh/", views.token_refresh),
    
    # New Auth Methods
    path("google/", views.auth_google),
    path("otp/send/", views.otp_send),
    path("otp/verify/", views.otp_verify),
    path("magic-link/send/", views.magic_link_send),
    path("magic-link/verify/", views.magic_link_verify),
    
    path("verify-email/", views.verify_email),
    path("verify-phone/", views.verify_phone),
    path("resend-otp/", views.resend_otp),
    path("forgot-password/", views.forgot_password),
    path("reset-password/", views.reset_password),
    path("me/", views.me),
    path("me/update/", views.update_me),
    path("me/change-password/", views.change_password),
    path("change-password/",    views.change_password),
    path("me/delete/",          views.delete_account),
    path("sessions/",                       views.list_sessions),
    path("sessions/<uuid:session_id>/",      views.revoke_session),
    path("oauth-providers/",                views.oauth_providers),
    path("gdpr/export/",                    views.gdpr_export),
    path("payout-profile/",                 views.payout_profile),
]
