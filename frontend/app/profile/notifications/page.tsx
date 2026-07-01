"use client";

import { useState, useEffect, useCallback, ElementType } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  Bell, Mail, MessageSquare, Smartphone, ShoppingBag, Clock,
  Calendar, Wallet, Tag, Info, CheckCircle2, Trash2, BellOff,
  BellRing, RefreshCw,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { AppNotification, NotifType } from "@/components/ui/notification-bell";

// ── Preference matrix ─────────────────────────────────────────────────────────

interface Prefs {
  email_order_confirmation: boolean; email_ticket_reminder: boolean;
  email_event_updates: boolean;      email_promotions: boolean;
  email_weekly_digest: boolean;
  sms_order_confirmation: boolean;   sms_ticket_reminder: boolean;
  sms_event_updates: boolean;
  whatsapp_order_confirmation: boolean; whatsapp_ticket_reminder: boolean;
  whatsapp_event_updates: boolean;   whatsapp_broadcast: boolean;
  push_order_confirmation: boolean;  push_event_updates: boolean;
  push_flash_sale: boolean;
}

const DEFAULT: Prefs = {
  email_order_confirmation: true,  email_ticket_reminder: true,  email_event_updates: true,
  email_promotions: false,         email_weekly_digest: true,
  sms_order_confirmation: true,    sms_ticket_reminder: false,   sms_event_updates: false,
  whatsapp_order_confirmation: false, whatsapp_ticket_reminder: false,
  whatsapp_event_updates: false,   whatsapp_broadcast: false,
  push_order_confirmation: true,   push_event_updates: false,    push_flash_sale: false,
};

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} className={cn(
      "relative w-11 h-6 rounded-full transition-colors shrink-0",
      on ? "bg-primary" : "bg-surface border border-border"
    )}>
      <span className={cn("absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform",
        on ? "translate-x-6" : "translate-x-1")} />
    </button>
  );
}

const CHANNELS = [
  { key: "email",    label: "Email",    icon: Mail           },
  { key: "sms",      label: "SMS",      icon: Smartphone     },
  { key: "whatsapp", label: "WhatsApp", icon: MessageSquare  },
  { key: "push",     label: "Push",     icon: Bell           },
] as const;

const TYPES = [
  { key: "order_confirmation", label: "Order confirmations" },
  { key: "ticket_reminder",    label: "Event reminders (24h & 2h)" },
  { key: "event_updates",      label: "Event updates & cancellations" },
  { key: "promotions",         label: "Promotions & deals",    channels: ["email"] },
  { key: "weekly_digest",      label: "Weekly event digest",   channels: ["email"] },
  { key: "broadcast",          label: "Organizer broadcasts",  channels: ["whatsapp"] },
  { key: "flash_sale",         label: "Flash sales from followed organizers", channels: ["push"] },
] as const;

// ── Notification history ──────────────────────────────────────────────────────

const NOTIF_TYPE_CONFIG: Record<NotifType, { icon: ElementType; color: string; bg: string; label: string }> = {
  ORDER:        { icon: ShoppingBag,  color: "text-green-400",  bg: "bg-green-400/10",  label: "Order"       },
  REMINDER:     { icon: Clock,        color: "text-blue-400",   bg: "bg-blue-400/10",   label: "Reminder"    },
  EVENT_UPDATE: { icon: Calendar,     color: "text-yellow-400", bg: "bg-yellow-400/10", label: "Event"       },
  PAYOUT:       { icon: Wallet,       color: "text-purple-400", bg: "bg-purple-400/10", label: "Payout"      },
  PROMO:        { icon: Tag,          color: "text-orange-400", bg: "bg-orange-400/10", label: "Promo"       },
  CHECKIN:      { icon: CheckCircle2, color: "text-green-400",  bg: "bg-green-400/10",  label: "Check-in"    },
  SYSTEM:       { icon: Info,         color: "text-muted",      bg: "bg-surface",       label: "System"      },
};

const TYPE_TABS: Array<{ value: NotifType | "ALL"; label: string }> = [
  { value: "ALL",          label: "All"      },
  { value: "ORDER",        label: "Orders"   },
  { value: "REMINDER",     label: "Reminders"},
  { value: "EVENT_UPDATE", label: "Events"   },
  { value: "PAYOUT",       label: "Payouts"  },
  { value: "PROMO",        label: "Promos"   },
];

// ── Push subscription helpers ────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = window.atob(base64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [tab,         setTab]        = useState<"history" | "prefs">("history");
  const [prefs,       setPrefs]      = useState<Prefs>(DEFAULT);
  const [prefsLoading,setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving]  = useState(false);

  const [notifs,      setNotifs]     = useState<AppNotification[]>([]);
  const [nLoading,    setNLoading]   = useState(true);
  const [typeFilter,  setTypeFilter] = useState<NotifType | "ALL">("ALL");
  const [page,        setPage]       = useState(1);
  const [hasMore,     setHasMore]    = useState(false);

  const [pushStatus,  setPushStatus] = useState<"unsupported" | "denied" | "subscribed" | "unsubscribed">("unsubscribed");
  const [pushLoading, setPushLoading]= useState(false);

  // ── Load prefs ──────────────────────────────────────────────────────────

  useEffect(() => {
    api.get<Prefs>("/notifications/preferences/").then(r => {
      if (r.success && r.data) setPrefs(r.data);
      setPrefsLoading(false);
    });
  }, []);

  // ── Load notification history ───────────────────────────────────────────

  const loadNotifs = useCallback(async (p = 1, type = typeFilter) => {
    if (p === 1) setNLoading(true);
    const qs = new URLSearchParams({ page: String(p), limit: "20" });
    if (type !== "ALL") qs.set("type", type);
    const res = await api.get<{ results: AppNotification[]; next: string | null }>(
      `/notifications/?${qs}`
    );
    if (res.success && res.data) {
      setNotifs(p === 1 ? res.data.results : prev => [...prev, ...res.data!.results]);
      setHasMore(!!res.data.next);
    }
    setNLoading(false);
  }, [typeFilter]);

  useEffect(() => { setPage(1); loadNotifs(1, typeFilter); }, [typeFilter, loadNotifs]);

  // ── Push subscription ───────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("unsupported"); return;
    }
    navigator.serviceWorker.register("/sw.js").then(async reg => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) setPushStatus("subscribed");
      else if (Notification.permission === "denied") setPushStatus("denied");
      else setPushStatus("unsubscribed");
    }).catch(() => setPushStatus("unsupported"));
  }, []);

  const subscribePush = async () => {
    if (pushStatus === "unsupported") return;
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) { toast.error("Push not configured"); return; }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const res = await api.post("/notifications/push-subscribe/", { subscription: sub.toJSON() });
      if (res.success) {
        setPushStatus("subscribed");
        setPrefs(p => ({ ...p, push_order_confirmation: true, push_event_updates: true }));
        toast.success("Push notifications enabled!");
      }
    } catch (e: any) {
      if (e?.name === "NotAllowedError") { setPushStatus("denied"); toast.error("Permission denied in browser"); }
      else toast.error("Failed to enable push");
    }
    setPushLoading(false);
  };

  const unsubscribePush = async () => {
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await sub.unsubscribe(); await api.post("/notifications/push-unsubscribe/", { endpoint: sub.endpoint }); }
      setPushStatus("unsubscribed");
      toast.success("Push notifications disabled");
    } catch { toast.error("Failed to unsubscribe"); }
    setPushLoading(false);
  };

  // ── Prefs save ──────────────────────────────────────────────────────────

  const toggle = (key: keyof Prefs) => setPrefs(p => ({ ...p, [key]: !p[key] }));

  const savePrefs = async () => {
    setPrefsSaving(true);
    const res = await api.patch("/notifications/preferences/", prefs);
    if (res.success) toast.success("Preferences saved!");
    else toast.error("Failed to save preferences");
    setPrefsSaving(false);
  };

  // ── Notification actions ────────────────────────────────────────────────

  const markRead = async (id: string) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    await api.post(`/notifications/${id}/read/`, {});
  };

  const markAllRead = async () => {
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    await api.post("/notifications/read-all/", {});
    toast.success("All marked as read");
  };

  const filtered = notifs; // backend already filters by type

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-2xl font-bold">Notifications</h1>
        <div className="flex gap-1 p-1 bg-surface-2 border border-border rounded-lg text-sm">
          {(["history","prefs"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-4 py-1.5 rounded-md font-medium transition-colors",
                tab === t ? "bg-primary text-background" : "text-muted hover:text-foreground")}>
              {t === "history" ? "History" : "Preferences"}
            </button>
          ))}
        </div>
      </div>

      {/* ── History ── */}
      {tab === "history" && (
        <div className="space-y-4">
          {/* Type filter */}
          <div className="flex gap-2 flex-wrap">
            {TYPE_TABS.map(({ value, label }) => (
              <button key={value} onClick={() => setTypeFilter(value)}
                className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  typeFilter === value
                    ? "bg-primary text-background border-primary"
                    : "border-border text-muted hover:text-foreground hover:border-primary/40")}>
                {label}
              </button>
            ))}
            <button onClick={markAllRead} className="ml-auto text-xs text-primary hover:underline">
              Mark all read
            </button>
          </div>

          {nLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-surface-2 border border-border rounded-xl animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <Bell className="w-10 h-10 text-muted mx-auto mb-3 opacity-40" />
              <p className="text-muted text-sm">No notifications yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(n => {
                const cfg = NOTIF_TYPE_CONFIG[n.type] || NOTIF_TYPE_CONFIG.SYSTEM;
                const Icon = cfg.icon;
                const inner = (
                  <div onClick={() => !n.is_read && markRead(n.id)}
                    className={cn("flex gap-3 p-4 rounded-xl border transition-colors cursor-pointer hover:border-primary/30",
                      n.is_read ? "bg-surface-2 border-border" : "bg-primary/5 border-primary/20")}>
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", cfg.bg)}>
                      <Icon className={cn("w-5 h-5", cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("text-sm leading-snug", !n.is_read && "font-semibold")}>{n.title}</p>
                        {!n.is_read && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                      </div>
                      <p className="text-xs text-muted mt-0.5 line-clamp-2">{n.body}</p>
                      <p className="text-xs text-muted/50 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                );
                return n.url ? <Link key={n.id} href={n.url}>{inner}</Link> : <div key={n.id}>{inner}</div>;
              })}

              {hasMore && (
                <button onClick={() => { const next = page + 1; setPage(next); loadNotifs(next); }}
                  className="w-full py-3 text-sm text-primary hover:underline flex items-center justify-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5" /> Load more
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Preferences ── */}
      {tab === "prefs" && (
        <div className="space-y-6">
          {/* Push subscription card */}
          <div className="bg-surface-2 border border-border rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              {pushStatus === "subscribed"
                ? <BellRing className="w-5 h-5 text-success" />
                : <BellOff  className="w-5 h-5 text-muted"   />}
              <div>
                <p className="font-semibold text-sm">Browser Push Notifications</p>
                <p className="text-xs text-muted">
                  {pushStatus === "subscribed"  ? "Active — you'll receive alerts in this browser"
                   : pushStatus === "denied"    ? "Blocked — allow in browser settings to enable"
                   : pushStatus === "unsupported" ? "Not supported in this browser"
                   : "Off — enable to get real-time alerts without opening the app"}
                </p>
              </div>
              <div className="ml-auto">
                {pushStatus === "subscribed" ? (
                  <Button variant="outline" size="sm" loading={pushLoading} onClick={unsubscribePush}>
                    <Trash2 className="w-3.5 h-3.5" /> Disable
                  </Button>
                ) : (
                  <Button size="sm" loading={pushLoading}
                    disabled={pushStatus === "denied" || pushStatus === "unsupported"}
                    onClick={subscribePush}>
                    <Bell className="w-3.5 h-3.5" /> Enable Push
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Channel matrix */}
          {prefsLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-40 bg-surface-2 border border-border rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_repeat(4,_60px)] gap-2 px-5 py-3 border-b border-border">
                <div />
                {CHANNELS.map(({ key, label, icon: Icon }) => (
                  <div key={key} className="flex flex-col items-center gap-1">
                    <Icon className="w-4 h-4 text-muted" />
                    <span className="text-xs text-muted">{label}</span>
                  </div>
                ))}
              </div>
              {TYPES.map(({ key, label, channels: limitTo }: any) => (
                <div key={key} className="grid grid-cols-[1fr_repeat(4,_60px)] gap-2 items-center px-5 py-4 border-b border-border last:border-b-0">
                  <p className="text-sm font-medium">{label}</p>
                  {CHANNELS.map(ch => {
                    const prefKey = `${ch.key}_${key}` as keyof Prefs;
                    const exists  = prefKey in prefs;
                    const allowed = !limitTo || (limitTo as readonly string[]).includes(ch.key);
                    return (
                      <div key={ch.key} className="flex justify-center">
                        {exists && allowed
                          ? <Toggle on={prefs[prefKey]} onChange={() => toggle(prefKey)} />
                          : <span className="text-muted/40 text-xs">—</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          <Button onClick={savePrefs} loading={prefsSaving}>Save Preferences</Button>
        </div>
      )}
    </div>
  );
}
