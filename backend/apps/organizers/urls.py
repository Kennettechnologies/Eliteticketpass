from django.urls import path
from . import views
from apps.promos import views as promo_views

public_urlpatterns = [
    path("following/",             views.my_following),
    path("<str:organizer_id>/follow/", views.toggle_follow),
    path("<slug:organizer_slug>/", views.public_organizer_profile),
]

urlpatterns = [
    path("dashboard/",                                   views.dashboard),
    path("profile/",                                     views.profile),
    path("profile/logo/",                                views.profile_logo),
    path("kyc/",                                         views.kyc),
    path("payout-account/",                              views.payout_account),
    path("payout-settings/",                             views.payout_settings),
    path("payouts/",                                     views.payout_list),
    path("payouts/summary/",                             views.payout_summary),
    path("payouts/request/",                             views.payout_request),
    path("fee-agreement/",                               views.fee_agreement),
    path("fee-agreement/accept/",                        views.fee_agreement_accept),
    path("revenue/",                                     views.revenue_summary),
    path("fee-config/",                                  views.fee_config_update),
    
    # Promos
    path("promo-codes/",                                 promo_views.promo_codes),
    path("promo-codes/bulk-generate/",                   promo_views.bulk_generate),
    path("promo-codes/<uuid:promo_id>/",                 promo_views.promo_detail),
    path("promo-codes/<uuid:promo_id>/usage/",           promo_views.promo_usage),

    # Communications
    path("announcements/",                               views.announcements_list),
    path("automations/",                                 views.automations_list),
    path("automations/<uuid:pk>/",                       views.automations_detail),
    path("templates/",                                   views.templates_list),
    path("templates/<uuid:pk>/",                         views.templates_detail),

    path("events/",                                      views.organizer_events),
    path("events/create/",                               views.organizer_event_create),
    path("events/<uuid:event_id>/",                      views.organizer_event_crud),
    path("events/<uuid:event_id>/cover/",                views.organizer_event_cover),
    path("events/<uuid:event_id>/attendees/",            views.event_attendees),
    path("events/<uuid:event_id>/attendees/<uuid:attendee_id>/", views.event_attendee_update),
    path("events/<uuid:event_id>/attendees/<uuid:attendee_id>/manual-checkin/", views.event_attendees_manual_checkin),
    path("events/<uuid:event_id>/attendees/message/",    views.event_attendees_message),
    path("events/<uuid:event_id>/attendees/comp/",       views.event_attendees_comp),
    path("events/<uuid:event_id>/attendees/import/",     views.event_attendees_import),
    path("events/<uuid:event_id>/checkin-staff/",        views.organizer_event_checkin_staff),
    path("events/<uuid:event_id>/checkin-staff/<uuid:staff_id>/", views.organizer_event_checkin_staff_delete),
    path("events/<uuid:event_id>/regenerate-access-code/", views.organizer_event_regenerate_access_code),
    path("events/<uuid:event_id>/checkin-stats/",        views.organizer_event_checkin_stats),
    path("events/<uuid:event_id>/scans/",                views.organizer_event_checkin_scans),
    path("events/<uuid:event_id>/cancel/",               views.organizer_event_cancel),
    path("events/<uuid:event_id>/postpone/",             views.organizer_event_postpone),
    path("events/<uuid:event_id>/duplicate/",            views.organizer_event_duplicate),
    path("events/<uuid:event_id>/publish/",              views.organizer_event_publish),
    path("events/<uuid:event_id>/schedule-publish/",     views.organizer_event_schedule_publish),
]
