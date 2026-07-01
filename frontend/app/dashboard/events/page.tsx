"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, Filter, MoreVertical, Edit2, Copy, X,
  Clock, Eye, Send, ChevronDown, CalendarDays, Ticket, Trash2,
  TrendingUp, AlertTriangle, CheckCircle2, BarChart2, Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatDate, formatCurrency, statusColor } from "@/lib/utils";
import { toast } from "sonner";

interface Event {
  id: string;
  slug: string;
  title: string;
  status: string;
  starts_at: string;
  ends_at: string;
  venue_name: string;
  venue_city: string;
  is_online: boolean;
  tickets_sold: number;
  capacity: number;
  revenue: string;
  cover_image_url: string;
  published_at: string | null;
  scheduled_publish_at: string | null;
}

const STATUS_TABS = ["ALL", "DRAFT", "PUBLISHED", "COMPLETED", "CANCELLED", "POSTPONED"] as const;

export default function EventsListPage() {
  const router = useRouter();
  const [events, setEvents]       = useState<Event[]>([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<string>("ALL");
  const [search, setSearch]       = useState("");
  const [menuId, setMenuId]       = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{ type: "cancel" | "postpone" | "publish_schedule" | "delete" | "publish"; event: Event } | null>(null);
  const [actionNote, setActionNote]   = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [actioning, setActioning]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tab !== "ALL") params.set("status", tab);
    if (search)        params.set("search", search);
    const res = await api.get<{ results: Event[] }>(`/organizer/events/?${params}`);
    if (res.success) setEvents((res.data as any)?.results ?? res.data ?? []);
    setLoading(false);
  }, [tab, search]);

  useEffect(() => { load(); }, [load]);

  const duplicate = async (id: string) => {
    const res = await api.post<{ id: string }>(`/organizer/events/${id}/duplicate/`);
    if (res.success && res.data) {
      toast.success("Event duplicated!");
      router.push(`/dashboard/events/${res.data.id}/edit`);
    } else toast.error("Duplicate failed");
    setMenuId(null);
  };

  const doAction = async () => {
    if (!actionModal) return;
    setActioning(true);
    const { type, event } = actionModal;
    let res;
    if (type === "cancel")
      res = await api.post(`/organizer/events/${event.id}/cancel/`, { reason: actionNote });
    else if (type === "postpone")
      res = await api.post(`/organizer/events/${event.id}/postpone/`, { reason: actionNote });
    else if (type === "delete")
      res = await api.delete(`/organizer/events/${event.id}/`);
    else if (type === "publish")
      res = await api.post(`/organizer/events/${event.id}/publish/`);
    else
      res = await api.post(`/organizer/events/${event.id}/schedule-publish/`, { publish_at: scheduleTime });

    if (res?.success) {
      toast.success(type === "cancel" ? "Event cancelled & buyers notified." : type === "postpone" ? "Event postponed & buyers notified." : type === "delete" ? "Event deleted successfully." : type === "publish" ? "Event published successfully!" : "Publish scheduled!");
      setActionModal(null); setActionNote(""); setScheduleTime("");
      load();
    } else toast.error("Action failed. Try again.");
    setActioning(false);
  };

  const filtered = events.filter(e => !search || e.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold">Events</h1>
          <p className="text-muted text-sm mt-1">{events.length} event{events.length !== 1 ? "s" : ""} total</p>
        </div>
        <Link href="/dashboard/events/new">
          <Button><Plus className="w-4 h-4" /> Create Event</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events…"
            className="w-full bg-surface border border-border rounded-sm pl-9 pr-4 h-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUS_TABS.map(s => (
            <button key={s} onClick={() => setTab(s)}
              className={cn("px-3 h-9 rounded-sm text-xs font-medium transition-colors",
                tab === s ? "bg-primary text-background" : "bg-surface border border-border text-muted hover:text-foreground")}>
              {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-surface-2 border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 bg-surface-2 border border-border rounded-xl">
          <CalendarDays className="w-10 h-10 text-muted mx-auto mb-3" />
          <h3 className="font-semibold mb-1">No events found</h3>
          <p className="text-muted text-sm mb-5">{search ? "Try a different search term." : "Create your first event to get started."}</p>
          <Link href="/dashboard/events/new"><Button size="sm"><Plus className="w-4 h-4" /> Create Event</Button></Link>
        </div>
      ) : (
        <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted">Event</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted hidden md:table-cell">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted hidden lg:table-cell">Tickets</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted hidden lg:table-cell">Revenue</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(event => (
                  <tr key={event.id} className="hover:bg-surface/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-surface border border-border overflow-hidden shrink-0">
                          {event.cover_image_url
                            ? <img src={event.cover_image_url} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-lg">🎪</div>}
                        </div>
                        <div>
                          <p className="font-medium line-clamp-1">{event.title}</p>
                          <p className="text-xs text-muted mt-0.5">{event.is_online ? "Online" : `${event.venue_city}`}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-muted hidden md:table-cell whitespace-nowrap">
                      {formatDate(event.starts_at, "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 max-w-[80px] h-1.5 bg-surface rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (event.tickets_sold / (event.capacity || 1)) * 100)}%` }} />
                        </div>
                        <span className="text-xs text-muted">{event.tickets_sold}/{event.capacity || "∞"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-medium hidden lg:table-cell">{formatCurrency(event.revenue || 0)}</td>
                    <td className="px-4 py-4">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusColor(event.status))}>
                        {event.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 relative">
                      <button onClick={() => setMenuId(menuId === event.id ? null : event.id)}
                        className="p-1.5 rounded-sm text-muted hover:text-foreground hover:bg-surface transition-colors">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      <AnimatePresence>
                        {menuId === event.id && (
                          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                            className="absolute right-0 top-full mt-1 w-48 bg-surface border border-border rounded-lg shadow-xl z-20 py-1">
                            <Link href={`/dashboard/events/${event.id}/edit`} onClick={() => setMenuId(null)}
                              className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-2 transition-colors">
                              <Edit2 className="w-3.5 h-3.5 text-muted" /> Edit
                            </Link>
                            <Link href={`/dashboard/events/${event.id}/tiers`} onClick={() => setMenuId(null)}
                              className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-2 transition-colors">
                              <Ticket className="w-3.5 h-3.5 text-muted" /> Manage Tiers
                            </Link>
                            <Link href={`/dashboard/events/${event.id}/attendees`} onClick={() => setMenuId(null)}
                              className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-2 transition-colors">
                              <Users className="w-3.5 h-3.5 text-muted" /> Attendees
                            </Link>
                            <Link href={`/dashboard/events/${event.id}/checkin`} onClick={() => setMenuId(null)}
                              className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-2 transition-colors">
                              <TrendingUp className="w-3.5 h-3.5 text-muted" /> Check-In
                            </Link>
                            <Link href={`/dashboard/events/${event.id}/analytics`} onClick={() => setMenuId(null)}
                              className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-2 transition-colors">
                              <BarChart2 className="w-3.5 h-3.5 text-muted" /> Analytics
                            </Link>
                            <Link href={`/events/${event.slug}`} target="_blank" onClick={() => setMenuId(null)}
                              className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-2 transition-colors">
                              <Eye className="w-3.5 h-3.5 text-muted" /> Preview
                            </Link>
                            <button onClick={() => duplicate(event.id)}
                              className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-2 transition-colors w-full text-left">
                              <Copy className="w-3.5 h-3.5 text-muted" /> Duplicate
                            </button>
                            {event.status === "DRAFT" && (
                              <>
                                <button onClick={() => { setActionModal({ type: "publish", event }); setMenuId(null); }}
                                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-primary hover:bg-primary/5 transition-colors w-full text-left">
                                  <Send className="w-3.5 h-3.5" /> Publish Now
                                </button>
                                <button onClick={() => { setActionModal({ type: "publish_schedule", event }); setMenuId(null); }}
                                  className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-2 transition-colors w-full text-left">
                                  <Clock className="w-3.5 h-3.5 text-muted" /> Schedule Publish
                                </button>
                              </>
                            )}
                            {["DRAFT","PUBLISHED"].includes(event.status) && (
                              <button onClick={() => { setActionModal({ type: "postpone", event }); setMenuId(null); }}
                                className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-2 transition-colors w-full text-left">
                                <AlertTriangle className="w-3.5 h-3.5 text-warning" /> Postpone
                              </button>
                            )}
                            {!["CANCELLED","COMPLETED"].includes(event.status) && (
                              <button onClick={() => { setActionModal({ type: "cancel", event }); setMenuId(null); }}
                                className="flex items-center gap-2.5 px-3 py-2 text-sm text-error hover:bg-error/5 transition-colors w-full text-left">
                                <X className="w-3.5 h-3.5" /> Cancel Event
                              </button>
                            )}
                            <button onClick={() => { setActionModal({ type: "delete", event }); setMenuId(null); }}
                              className="flex items-center gap-2.5 px-3 py-2 text-sm text-error hover:bg-error/5 transition-colors w-full text-left border-t border-border mt-1 pt-2">
                              <Trash2 className="w-3.5 h-3.5" /> Delete Event
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Backdrop for menu */}
      {menuId && <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />}

      {/* Action Modal */}
      <AnimatePresence>
        {actionModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4"
            onClick={e => { if (e.target === e.currentTarget) setActionModal(null); }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface-2 border border-border rounded-xl p-6 w-full max-w-md">
              <h3 className="font-semibold text-lg mb-1">
                {actionModal.type === "cancel" ? "Cancel Event" : actionModal.type === "postpone" ? "Postpone Event" : actionModal.type === "delete" ? "Delete Event" : actionModal.type === "publish" ? "Publish Event" : "Schedule Publish"}
              </h3>
              <p className="text-sm text-muted mb-5">
                {actionModal.type === "cancel"
                  ? `"${actionModal.event.title}" will be cancelled and all buyers will be automatically refunded and notified.`
                  : actionModal.type === "postpone"
                  ? `All ticket buyers for "${actionModal.event.title}" will be notified via email and SMS.`
                  : actionModal.type === "delete"
                  ? `Are you sure you want to permanently delete "${actionModal.event.title}"? This action cannot be undone.`
                  : actionModal.type === "publish"
                  ? `Make "${actionModal.event.title}" live publicly right now?`
                  : `Choose when "${actionModal.event.title}" goes live publicly.`}
              </p>

              {actionModal.type === "publish_schedule" ? (
                <div className="mb-5">
                  <label className="block text-sm font-medium mb-1.5">Publish date & time</label>
                  <input type="datetime-local" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                    className="w-full bg-surface border border-border rounded-sm px-4 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              ) : actionModal.type !== "delete" ? (
                <div className="mb-5">
                  <label className="block text-sm font-medium mb-1.5">Reason (optional — shown to buyers)</label>
                  <textarea value={actionNote} onChange={e => setActionNote(e.target.value)} rows={3}
                    className="w-full bg-surface border border-border rounded-sm px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none placeholder:text-muted"
                    placeholder={actionModal.type === "cancel" ? "e.g. Venue unavailable" : "e.g. New date to be announced"} />
                </div>
              ) : null}

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setActionModal(null)} className="flex-1">Cancel</Button>
                <Button
                  variant={actionModal.type === "cancel" || actionModal.type === "delete" ? "danger" : "primary"}
                  loading={actioning} onClick={doAction} className="flex-1">
                  {actionModal.type === "cancel" ? "Confirm Cancel" : actionModal.type === "postpone" ? "Confirm Postpone" : actionModal.type === "delete" ? "Confirm Delete" : actionModal.type === "publish" ? "Publish Now" : "Schedule"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
