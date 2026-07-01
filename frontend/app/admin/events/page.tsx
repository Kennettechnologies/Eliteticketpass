"use client";

import { useState, useEffect, useCallback, useRef, ElementType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, CalendarDays, CheckCircle2, XCircle, Flag, Eye,
  EyeOff, Star, Megaphone, X, AlertTriangle, RefreshCw,
  ExternalLink, ImageIcon, MapPin, Users, Ticket, ChevronDown,
  LayoutGrid, Edit3, ArrowUpDown,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatDate, formatDateTime, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type EventStatus  = "DRAFT" | "PENDING" | "PUBLISHED" | "REJECTED" | "CANCELLED" | "FLAGGED";

interface AdminEvent {
  id: string;
  title: string;
  slug: string;
  organizer_name: string;
  organizer_id: string;
  status: EventStatus;
  starts_at: string;
  venue_city: string;
  cover_image_url?: string;
  tickets_sold: number;
  capacity: number;
  gross: string;
  is_featured: boolean;
  is_homepage_banner: boolean;
  flag_reason?: string;
  created_at: string;
}

interface BannerSlot {
  slot: number;
  event_id: string | null;
  event_title: string | null;
}

const STATUS_CFG: Record<EventStatus, { cls: string; label: string }> = {
  DRAFT:     { cls: "bg-surface text-muted",        label: "Draft"     },
  PENDING:   { cls: "bg-warning/10 text-warning",   label: "Pending"   },
  PUBLISHED: { cls: "bg-success/10 text-success",   label: "Published" },
  REJECTED:  { cls: "bg-error/10 text-error",       label: "Rejected"  },
  CANCELLED: { cls: "bg-error/10 text-error",       label: "Cancelled" },
  FLAGGED:   { cls: "bg-orange-500/10 text-orange-400", label: "Flagged"   },
};

// ── Confirm modal ─────────────────────────────────────────────────────────────

function ConfirmModal({ title, body, variant = "warning", note, setNote, onConfirm, onClose, loading }: {
  title: string; body: string; variant?: "error" | "warning";
  note?: string; setNote?: (v: string) => void;
  onConfirm: () => void; onClose: () => void; loading: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-surface-2 border border-border rounded-xl w-full max-w-sm p-6">
        <div className={cn("w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4",
          variant === "error" ? "bg-error/10" : "bg-warning/10")}>
          <AlertTriangle className={cn("w-6 h-6", variant === "error" ? "text-error" : "text-warning")} />
        </div>
        <h3 className="font-semibold text-center mb-2">{title}</h3>
        <p className="text-sm text-muted text-center mb-4">{body}</p>
        {setNote !== undefined && (
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            placeholder="Reason / note to organizer (optional)"
            className="w-full bg-surface border border-border rounded-sm px-3 py-2 text-sm focus:outline-none mb-4 resize-none" />
        )}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button loading={loading} onClick={onConfirm}
            className={cn("flex-1", variant === "error" ? "bg-error hover:bg-error/90" : "")}>
            Confirm
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Banner slot manager ───────────────────────────────────────────────────────

function BannerManager({ onClose }: { onClose: () => void }) {
  const [slots,   setSlots]   = useState<BannerSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [results, setResults] = useState<{ id: string; title: string }[]>([]);
  const [assigning, setAssigning] = useState<number | null>(null);
  const [activeSearchSlot, setActiveSearchSlot] = useState<number | null>(null);

  useEffect(() => {
    api.get<BannerSlot[]>("/admin/banner-slots/").then(r => {
      if (r.success && r.data) setSlots(r.data);
      setLoading(false);
    });
  }, []);

  const searchEvents = async (q: string, slotIndex: number) => {
    setActiveSearchSlot(slotIndex);
    setSearch(q);
    if (q.length < 2) { setResults([]); return; }
    const res = await api.get<{ results: { id: string; title: string }[] }>(
      `/admin/events/?search=${q}&status=PUBLISHED&limit=8`
    );
    if (res.success && res.data) setResults((res.data as any).results || []);
  };

  const assign = async (slot: number, eventId: string | null, eventTitle: string | null = null) => {
    setAssigning(slot);
    const res = await api.post(`/admin/banner-slots/${slot}/`, { event_id: eventId });
    if (res.success) {
      setSlots(prev => prev.map(s => s.slot === slot
        ? { ...s, event_id: eventId, event_title: eventTitle }
        : s));
      toast.success(eventId ? "Banner slot updated" : "Slot cleared");
      setSearch(""); setResults([]); setActiveSearchSlot(null);
    } else toast.error(res.error || "Failed");
    setAssigning(null);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4 py-8"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-surface-2 border border-border rounded-xl w-full max-w-lg flex flex-col max-h-full">
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <h2 className="font-semibold flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-primary" /> Homepage Banner Slots
          </h2>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-surface rounded-lg animate-pulse" />)
          ) : slots.map(slot => (
            <div key={slot.slot} className="bg-surface border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted">Slot {slot.slot}</p>
                {slot.event_id && (
                  <button onClick={() => assign(slot.slot, null)}
                    className="text-xs text-error hover:underline" disabled={assigning === slot.slot}>
                    Clear
                  </button>
                )}
              </div>
              {slot.event_title
                ? <p className="text-sm font-medium">{slot.event_title}</p>
                : <p className="text-sm text-muted italic">Empty</p>}
              
              {/* Search to assign */}
              <div className="mt-2 relative">
                <input 
                  value={activeSearchSlot === slot.slot ? search : ""} 
                  onChange={e => searchEvents(e.target.value, slot.slot)}
                  placeholder="Search event to assign…"
                  className="w-full bg-surface-2 border border-border rounded-sm px-3 h-8 text-xs focus:outline-none" 
                />
                {activeSearchSlot === slot.slot && results.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-10 bg-surface-2 border border-border rounded-lg mt-1 shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                    {results.map(ev => (
                      <button key={ev.id} onClick={() => assign(slot.slot, ev.id, ev.title)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-surface transition-colors">
                        {ev.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Event detail drawer ───────────────────────────────────────────────────────

function EventDrawer({ eventId, onClose, onUpdated }: {
  eventId: string; onClose: () => void; onUpdated: () => void;
}) {
  const [ev,       setEv]       = useState<AdminEvent | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [confirm,  setConfirm]  = useState<null | { action: string; title: string; body: string; variant: "error" | "warning" }>(null);
  const [note,     setNote]     = useState("");
  const [actLoad,  setActLoad]  = useState(false);

  useEffect(() => {
    api.get<AdminEvent>(`/admin/events/${eventId}/`).then(r => {
      if (r.success && r.data) setEv(r.data);
      setLoading(false);
    });
  }, [eventId]);

  const doAction = async (action: string) => {
    setActLoad(true);
    const body: Record<string, string> = {};
    if (note) body.note = note;
    const res = await api.post(`/admin/events/${eventId}/${action}/`, body);
    if (res.success) {
      toast.success(`Event ${action.replace("-", " ")}`);
      const r2 = await api.get<AdminEvent>(`/admin/events/${eventId}/`);
      if (r2.success && r2.data) setEv(r2.data);
      onUpdated();
    } else toast.error(res.error || "Action failed");
    setActLoad(false); setConfirm(null); setNote("");
  };

  if (loading) return (
    <div className="fixed inset-y-0 right-0 w-full max-w-xl z-50 bg-surface border-l border-border flex items-center justify-center">
      <RefreshCw className="w-6 h-6 text-muted animate-spin" />
    </div>
  );
  if (!ev) return null;

  const sCfg  = STATUS_CFG[ev.status];
  const fillPct = ev.capacity > 0 ? Math.round((ev.tickets_sold / ev.capacity) * 100) : 0;

  return (
    <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="fixed inset-y-0 right-0 w-full max-w-xl z-50 bg-surface border-l border-border flex flex-col overflow-hidden">

      {/* Cover */}
      {ev.cover_image_url
        ? <div className="h-32 shrink-0 relative">
            <img src={ev.cover_image_url} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent" />
            <button onClick={onClose} className="absolute top-3 right-3 p-1.5 bg-black/40 rounded-full text-white hover:bg-black/60">
              <X className="w-4 h-4" />
            </button>
          </div>
        : <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <h2 className="font-semibold text-sm truncate flex-1 mr-4">{ev.title}</h2>
            <button onClick={onClose} className="p-1.5 text-muted hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>}

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-5">
          {/* Title + meta */}
          <div>
            {ev.cover_image_url && <h2 className="font-semibold mb-1">{ev.title}</h2>}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", sCfg.cls)}>{sCfg.label}</span>
              {ev.is_featured && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 font-medium flex items-center gap-1"><Star className="w-3 h-3" />Featured</span>}
              {ev.is_homepage_banner && <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium flex items-center gap-1"><ImageIcon className="w-3 h-3" />Banner</span>}
            </div>
            <p className="text-xs text-muted">{ev.organizer_name} · {ev.venue_city} · {formatDateTime(ev.starts_at)}</p>
          </div>

          {/* Flag reason */}
          {ev.flag_reason && (
            <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20 text-sm">
              <p className="font-medium text-orange-400 flex items-center gap-1.5 mb-1">
                <Flag className="w-3.5 h-3.5" /> Flag reason
              </p>
              <p className="text-muted text-xs">{ev.flag_reason}</p>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            {[
              { label: "Tickets sold",  value: `${ev.tickets_sold} / ${ev.capacity}` },
              { label: "Fill rate",     value: `${fillPct}%` },
              { label: "Gross",         value: formatCurrency(ev.gross) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-surface-2 border border-border rounded-lg p-3">
                <p className="text-xs text-muted mb-0.5">{label}</p>
                <p className="font-bold">{value}</p>
              </div>
            ))}
          </div>
          <div className="h-1.5 bg-surface rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${fillPct}%` }} />
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted uppercase tracking-wide">Moderation Actions</p>
            <div className="flex flex-wrap gap-2">
              {(ev.status === "PENDING" || ev.status === "FLAGGED") && (
                <Button size="sm" onClick={() => setConfirm({ action: "approve", title: "Approve event?",
                  body: "Event will be published and visible to buyers.", variant: "warning" })}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                </Button>
              )}
              {(ev.status === "PENDING" || ev.status === "FLAGGED") && (
                <Button size="sm" variant="outline"
                  onClick={() => setConfirm({ action: "reject", title: "Reject event?",
                    body: "Organizer will be notified with your reason.", variant: "error" })}>
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </Button>
              )}
              {ev.status === "PUBLISHED" && (
                <Button size="sm" variant="outline"
                  onClick={() => setConfirm({ action: "unpublish", title: "Unpublish event?",
                    body: "Event will be hidden from buyers immediately.", variant: "error" })}>
                  <EyeOff className="w-3.5 h-3.5" /> Unpublish
                </Button>
              )}
              <Button size="sm" variant="outline"
                onClick={() => doAction(ev.is_featured ? "unfeature" : "feature")}>
                <Star className="w-3.5 h-3.5" />
                {ev.is_featured ? "Unfeature" : "Feature"}
              </Button>
              <Button size="sm" variant="outline"
                onClick={() => doAction(ev.is_homepage_banner ? "remove-banner" : "set-banner")}>
                <ImageIcon className="w-3.5 h-3.5" />
                {ev.is_homepage_banner ? "Remove banner" : "Set as banner"}
              </Button>
            </div>

            {/* Edit on behalf */}
            <Link href={`/dashboard/events/${ev.id}/edit?admin=1`} target="_blank">
              <Button size="sm" variant="outline" className="w-full">
                <Edit3 className="w-3.5 h-3.5" /> Edit event on behalf of organizer
                <ExternalLink className="w-3 h-3 ml-1 opacity-60" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {confirm && (
          <ConfirmModal title={confirm.title} body={confirm.body} variant={confirm.variant}
            note={note} setNote={setNote}
            loading={actLoad} onConfirm={() => doAction(confirm.action)} onClose={() => setConfirm(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminEventsPage() {
  const [events,       setEvents]       = useState<AdminEvent[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<EventStatus | "ALL">("ALL");
  const [page,         setPage]         = useState(1);
  const [total,        setTotal]        = useState(0);
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [showBanner,   setShowBanner]   = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const PAGE_SIZE = 25;

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE), ordering: "-created_at" });
    if (search.trim())            qs.set("search", search.trim());
    if (statusFilter !== "ALL")   qs.set("status", statusFilter);

    const res = await api.get<{ results: AdminEvent[] }>(`/admin/events/?${qs}`);
    if (res.success && res.data) { 
      setEvents(res.data.results); 
      setTotal(res.meta?.count || 0); 
    }
    setLoading(false);
  }, [search, statusFilter]);

  useEffect(() => { load(1); setPage(1); }, [load]);

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { load(1); setPage(1); }, 400);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const STATUS_TABS: Array<{ value: EventStatus | "ALL"; label: string; dot?: string }> = [
    { value: "ALL",       label: "All"       },
    { value: "PENDING",   label: "Pending",  dot: "bg-warning"        },
    { value: "FLAGGED",   label: "Flagged",  dot: "bg-orange-400"     },
    { value: "PUBLISHED", label: "Published",dot: "bg-success"        },
    { value: "REJECTED",  label: "Rejected", dot: "bg-error"          },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Event Moderation</h1>
          <p className="text-muted text-sm">{total.toLocaleString()} events</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowBanner(true)}>
            <ImageIcon className="w-3.5 h-3.5" /> Manage Banners
          </Button>
          <Button size="sm" variant="outline" onClick={() => load(page)}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map(({ value, label, dot }) => (
          <button key={value} onClick={() => setStatusFilter(value)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              statusFilter === value
                ? "bg-primary text-background border-primary"
                : "border-border text-muted hover:text-foreground hover:border-primary/40")}>
            {dot && <span className={cn("w-2 h-2 rounded-full", dot)} />}{label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input value={search} onChange={e => handleSearch(e.target.value)}
          placeholder="Search title, organizer, city…"
          className="w-full bg-surface-2 border border-border rounded-lg pl-9 pr-4 h-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
      </div>

      {/* Table */}
      <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Event</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Organizer</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Status</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Date</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Fill</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Gross</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Promo</th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}><td colSpan={8} className="px-4 py-3">
                    <div className="h-10 bg-surface rounded-lg animate-pulse" />
                  </td></tr>
                ))
              ) : events.length === 0 ? (
                <tr><td colSpan={8} className="py-14 text-center text-muted text-sm">
                  <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-40" />No events found
                </td></tr>
              ) : events.map(ev => {
                const sCfg   = STATUS_CFG[ev.status];
                const fillPct = ev.capacity > 0 ? Math.round((ev.tickets_sold / ev.capacity) * 100) : 0;
                return (
                  <tr key={ev.id} className="hover:bg-surface/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedId(ev.id)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {ev.cover_image_url
                          ? <img src={ev.cover_image_url} alt="" className="w-10 h-8 object-cover rounded shrink-0" />
                          : <div className="w-10 h-8 bg-surface rounded flex items-center justify-center shrink-0">
                              <CalendarDays className="w-4 h-4 text-muted" />
                            </div>}
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[180px]">{ev.title}</p>
                          <p className="text-xs text-muted">{ev.venue_city}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted truncate max-w-[120px]">{ev.organizer_name}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium w-fit", sCfg.cls)}>{sCfg.label}</span>
                        {ev.flag_reason && <span className="text-xs text-orange-400 flex items-center gap-1"><Flag className="w-3 h-3" />Flagged</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{formatDate(ev.starts_at)}</td>
                    <td className="px-4 py-3">
                      <div className="w-16">
                        <p className="text-xs text-muted mb-1">{fillPct}%</p>
                        <div className="h-1 bg-surface rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${fillPct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-xs">{formatCurrency(ev.gross)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {ev.is_featured && <Star className="w-3.5 h-3.5 text-yellow-400" />}
                        {ev.is_homepage_banner && <ImageIcon className="w-3.5 h-3.5 text-primary" />}
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setSelectedId(ev.id)}
                        className="p-1.5 text-muted hover:text-foreground hover:bg-surface rounded-sm">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted">
              {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,total)} of {total.toLocaleString()}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page===1}
                onClick={() => { const p=page-1; setPage(p); load(p); }}>← Prev</Button>
              <span className="px-3 py-1 text-xs text-muted self-center">{page}/{totalPages}</span>
              <Button variant="outline" size="sm" disabled={page===totalPages}
                onClick={() => { const p=page+1; setPage(p); load(p); }}>Next →</Button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedId && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40" onClick={() => setSelectedId(null)} />
            <EventDrawer eventId={selectedId} onClose={() => setSelectedId(null)} onUpdated={() => load(page)} />
          </>
        )}
        {showBanner && <BannerManager onClose={() => setShowBanner(false)} />}
      </AnimatePresence>
    </div>
  );
}
