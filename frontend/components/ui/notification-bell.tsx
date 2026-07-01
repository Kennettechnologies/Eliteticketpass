"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, ShoppingBag, Clock, Calendar, Wallet,
  Tag, Info, CheckCircle2, X, ArrowRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotifType =
  | "ORDER" | "REMINDER" | "EVENT_UPDATE"
  | "PAYOUT" | "PROMO" | "CHECKIN" | "SYSTEM";

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  is_read: boolean;
  url?: string;
  created_at: string;
}

const TYPE_CONFIG: Record<NotifType, { icon: React.ElementType; color: string; bg: string }> = {
  ORDER:        { icon: ShoppingBag,  color: "text-green-400",  bg: "bg-green-400/10"  },
  REMINDER:     { icon: Clock,        color: "text-blue-400",   bg: "bg-blue-400/10"   },
  EVENT_UPDATE: { icon: Calendar,     color: "text-yellow-400", bg: "bg-yellow-400/10" },
  PAYOUT:       { icon: Wallet,       color: "text-purple-400", bg: "bg-purple-400/10" },
  PROMO:        { icon: Tag,          color: "text-orange-400", bg: "bg-orange-400/10" },
  CHECKIN:      { icon: CheckCircle2, color: "text-green-400",  bg: "bg-green-400/10"  },
  SYSTEM:       { icon: Info,         color: "text-muted",      bg: "bg-surface"       },
};

function getApiBase() {
  return (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api").replace(/\/$/, "");
}
function getWsBase() {
  return getApiBase().replace(/^http/, "ws").replace("/api", "");
}

// ── NotificationBell component ────────────────────────────────────────────────

export function NotificationBell() {
  const [open,      setOpen]     = useState(false);
  const [notifs,    setNotifs]   = useState<AppNotification[]>([]);
  const [unread,    setUnread]   = useState(0);
  const [loading,   setLoading]  = useState(false);
  const dropRef   = useRef<HTMLDivElement>(null);
  const wsRef     = useRef<WebSocket | null>(null);
  const pollRef   = useRef<ReturnType<typeof setInterval>>();

  // ── Fetch notifications ──────────────────────────────────────────────────

  const fetchNotifs = useCallback(async () => {
    const res = await api.get<{ results: AppNotification[]; unread_count: number }>(
      "/notifications/?limit=20"
    );
    if (res.success && res.data) {
      setNotifs(res.data.results);
      setUnread(res.data.unread_count);
    }
  }, []);

  // ── WebSocket ────────────────────────────────────────────────────────────

  const connectWs = useCallback(() => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!token) return;
      const ws = new WebSocket(`${getWsBase()}/ws/notifications/?token=${token}`);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "notification.new") {
            setNotifs(prev => [data.notification, ...prev.slice(0, 19)]);
            setUnread(c => c + 1);
          } else if (data.type === "notification.read_all") {
            setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnread(0);
          }
        } catch {}
      };
      ws.onerror  = () => {};
      ws.onclose  = () => {
        wsRef.current = null;
        pollRef.current = setInterval(fetchNotifs, 30_000);
      };
    } catch {}
  }, [fetchNotifs]);

  useEffect(() => {
    fetchNotifs();
    connectWs();
    return () => {
      wsRef.current?.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchNotifs, connectWs]);

  // ── Outside-click close ──────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const markRead = async (id: string) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnread(c => Math.max(0, c - 1));
    await api.post(`/notifications/${id}/read/`, {});
  };

  const markAllRead = async () => {
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnread(0);
    await api.post("/notifications/read-all/", {});
  };

  const handleNotifClick = (n: AppNotification) => {
    if (!n.is_read) markRead(n.id);
    setOpen(false);
  };

  return (
    <div ref={dropRef} className="relative">
      {/* Bell button */}
      <button onClick={() => { setOpen(o => !o); if (!open) fetchNotifs(); }}
        className="relative p-2 text-muted hover:text-foreground transition-colors rounded-sm hover:bg-surface-2">
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
            className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 bg-primary text-background text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 99 ? "99+" : unread}
          </motion.span>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }} transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 glass rounded-xl border border-border shadow-2xl overflow-hidden z-50">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-semibold text-sm">Notifications</span>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button onClick={markAllRead}
                    className="text-xs text-primary hover:underline">Mark all read</button>
                )}
                <button onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-[420px] overflow-y-auto divide-y divide-border/50">
              {notifs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <Bell className="w-8 h-8 text-muted mb-3 opacity-40" />
                  <p className="text-sm text-muted">All caught up!</p>
                </div>
              ) : notifs.map(n => {
                const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.SYSTEM;
                const Icon = cfg.icon;
                const content = (
                  <div onClick={() => handleNotifClick(n)}
                    className={cn("flex gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-surface-2/50",
                      !n.is_read && "bg-primary/5")}>
                    <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5", cfg.bg)}>
                      <Icon className={cn("w-4 h-4", cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm leading-snug", !n.is_read && "font-semibold")}>{n.title}</p>
                      <p className="text-xs text-muted mt-0.5 line-clamp-2">{n.body}</p>
                      <p className="text-xs text-muted/60 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.is_read && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />}
                  </div>
                );
                return n.url ? (
                  <Link key={n.id} href={n.url}>{content}</Link>
                ) : (
                  <div key={n.id}>{content}</div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="border-t border-border">
              <Link href="/profile/notifications" onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1.5 py-3 text-xs text-primary hover:bg-surface-2/50 transition-colors font-medium">
                View all notifications <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
