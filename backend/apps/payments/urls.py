from django.urls import path
from . import views

urlpatterns = [
    # Daraja webhooks (redirected from mpesa_urls in future or kept separate)
    # path('daraja/callback/', views.mpesa_callback, name='daraja-callback'),
    # path('daraja/b2c/result/', views.mpesa_b2c_result, name='daraja-b2c-result'),
    # path('daraja/b2c/timeout/', views.mpesa_b2c_timeout, name='daraja-b2c-timeout'),

    # Paystack webhook
    path('paystack/webhook/', views.paystack_webhook, name='paystack-webhook'),

    # Organizer API
    path('organizer/payout-profile/', views.OrganizerPayoutProfileView.as_view(),
         name='payout-profile'),
    path('organizer/payout-profile/banks/', views.BankListView.as_view(),
         name='bank-list'),
    path('organizer/payouts/', views.OrganizerPayoutListView.as_view(),
         name='organizer-payouts'),

    # Admin API (staff only)
    path('admin/payouts/', views.AdminPayoutListView.as_view(), name='admin-payouts'),
    path('admin/payouts/<uuid:pk>/retry/', views.AdminRetryPayoutView.as_view(),
         name='admin-retry-payout'),
    path('admin/revenue/', views.PlatformRevenueView.as_view(), name='platform-revenue'),
]
