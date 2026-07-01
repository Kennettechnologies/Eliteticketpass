from django.urls import path
from . import views, resale_views

urlpatterns = [
    path("", views.my_tickets),
    path("transfers/", views.my_transfers),
    path("transfer/info/<uuid:token>/", views.transfer_info),
    path("transfer/accept/<uuid:token>/", views.accept_transfer),
    path("transfer/decline/<uuid:token>/", views.decline_transfer),
    path("transfer/cancel/<uuid:transfer_id>/", views.cancel_transfer),
    path("marketplace/", resale_views.marketplace_list),
    path("marketplace/checkout/", resale_views.marketplace_checkout),
    path("marketplace/confirm/", resale_views.marketplace_confirm),
    path("<uuid:ticket_id>/", views.ticket_detail),
    path("<uuid:ticket_id>/pdf/", views.ticket_pdf),
    path("public/pdf/<uuid:token>/", views.ticket_pdf_public),
    path("<uuid:ticket_id>/calendar/", views.ticket_calendar),
    path("<uuid:ticket_id>/wallet/", views.ticket_wallet),
    path("<uuid:ticket_id>/resale/", views.toggle_resale),
    path("<uuid:ticket_id>/transfer/", views.transfer_ticket),
    path("<uuid:ticket_id>/resend/", views.resend_ticket),
]
