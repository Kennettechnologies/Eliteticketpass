"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, RefreshCw, UserPlus, Trash2, Copy, Search,
  Wifi, WifiOff, CheckCircle2, XCircle, Clock, Shield,
  QrCode, Users, BarChart2, Upload, X, Eye, EyeOff,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "sonner";

const WS_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000")
  .replace(/^http/, "ws");

// ── Types ─────────────────────────────────────────────────────────────────────

interface StaffMember {
  id: string;
  name: string;
  email: string;
  access_code: string;
  last_active: string | null;
}

interface ScanRecord {
  id: string;
  ticket_number: string;
  attendee_name: string;
  tier_name: string;
  scanned_at: string;
  status: "SUCCESS" | "ALREADY_USED" | "INVALID";
  scanned_by: string;
}

interface Stats {
  total: number;
  checked_in: number;
  remaining: number;
  fill_pct: number;
  by_tier: { name: string; total: number; checked_in: number }[];
}

const OFFLINE_KEY = (id: string) => `checkin_queue_${id}`;

// ── helpers ───────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-surface-2 border border-border rounded-xl p-4 text-center">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={cn("text-2xl font-bold font-display", color)}>{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function ScanBadge({ status }: { status: ScanRecord["status"] }) {
  const cfg = {
    SUCCESS:     { cls: "bg-success/10 text-success",  label: "✓ Valid" },
    ALREADY_USED:{ cls: "bg-warning/10 text-warning",  label: "⚠ Used" },
    INVALID:     { cls: "bg-error/10 text-error",      label: "✕ Invalid" },
  }[status];
  return <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", cfg.cls)}>{cfg.label}</span>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CheckInPage() {
  const { id } = useParams<{ id: string }>();
  const [eventTitle, setEventTitle] = useState("");
  const [accessCode, setAccessCode] = useState<string>("");
  const [showCode,   setShowCode]   = useState(false);
  const [staff,      setStaff]      = useState<StaffMember[]>([]);
  const [scans,      setScans]      = useState<ScanRecord[]>([]);
  const [stats,      setStats]      = useState<Stats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [online,     setOnline]     = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [search,     setSearch]     = useState("");
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searching,  setSearching]  = useState(false);
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [addingStaff, setAddingStaff]  = useState(false);
  const wsRef  = useRef<WebSocket | null>(null);
  const syncing = useRef(false);

  // ── Offline queue helpers ──────────────────────────────────────────────────

  const getQueue = (): string[] => {
    try { return JSON.parse(localStorage.getItem(OFFLINE_KEY(id)) || "[]"); } catch { return []; }
  };
  const pushQueue = (ticketId: string) => {
    const q = getQueue(); q.push(ticketId);
    localStorage.setItem(OFFLINE_KEY(id), JSON.stringify(q));
    setQueueCount(q.length);
  };
  const clearQueue = () => {
    localStorage.removeItem(OFFLINE_KEY(id)); setQueueCount(0);
  };

  const syncQueue = useCallback(async () => {
    if (syncing.current) return;
    const q = getQueue(); if (q.length === 0) return;
    syncing.current = true;
    const res = await api.post(`/checkin/${accessCode}/sync/`, { ticket_ids: q });
    if (res.success) { clearQueue(); toast.success(`Synced ${q.length} offline scans`); load(); }
    else toast.error("Sync failed — check connection");
    syncing.current = false;
  }, [accessCode]);

  // ── Online/offline listeners ───────────────────────────────────────────────

  useEffect(() => {
    const on  = () => { setOnline(true);  syncQueue(); };
    const off = () => setOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    setOnline(navigator.onLine);
    setQueueCount(getQueue().length);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [syncQueue]);

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    const [evRes, staffRes, scansRes, statsRes] = await Promise.all([
      api.get<any>(`/organizer/events/${id}/`),
      api.get<{ results: StaffMember[] }>(`/organizer/events/${id}/checkin-staff/`),
      api.get<{ results: ScanRecord[] }>(`/organizer/events/${id}/scans/?page_size=50`),
      api.get<Stats>(`/organizer/events/${id}/checkin-stats/`),
    ]);
    if (evRes.success)   { setEventTitle(evRes.data?.title || ""); setAccessCode(evRes.data?.checkin_access_code || ""); }
    if (staffRes.success) setStaff((staffRes.data as any)?.results ?? staffRes.data ?? []);
    if (scansRes.success) setScans((scansRes.data as any)?.results ?? scansRes.data ?? []);
    if (statsRes.success && statsRes.data) setStats(statsRes.data);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── WebSocket (real-time stats) ─────────────────────────────────────────────

  useEffect(() => {
    if (!accessCode) return;
    const ws = new WebSocket(`${WS_BASE}/ws/checkin/${accessCode}/`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "stats_update" && msg.stats) setStats(msg.stats);
        if (msg.type === "scan") setScans(prev => [msg.scan, ...prev].slice(0, 100));
      } catch {}
    };
    ws.onerror = () => {};
    wsRef.current = ws;
    return () => ws.close();
  }, [accessCode]);

  // ── Generate / regenerate access code ────────────────────────────────────

  const regenerateCode = async () => {
    if (!confirm("Regenerate code? Existing gate staff links will break.")) return;
    const res = await api.post<{ checkin_access_code: string }>(`/organizer/events/${id}/regenerate-access-code/`, {});
    if (res.success && res.data?.checkin_access_code) {
      setAccessCode(res.data.checkin_access_code);
      toast.success("New access code generated");
    }
  };

  // ── Staff management ───────────────────────────────────────────────────────

  const addStaff = async () => {
    if (!newStaffEmail.trim()) { toast.error("Enter email"); return; }
    setAddingStaff(true);
    const res = await api.post(`/organizer/events/${id}/checkin-staff/`, { email: newStaffEmail });
    if (res.success) { toast.success("Staff added"); setNewStaffEmail(""); setAddStaffOpen(false); load(); }
    else toast.error(res.error || "Failed to add staff");
    setAddingStaff(false);
  };

  const removeStaff = async (staffId: string) => {
    if (!confirm("Remove this check-in staff?")) return;
    const res = await api.delete(`/organizer/events/${id}/checkin-staff/${staffId}/`);
    if (res.success) { toast.success("Removed"); setStaff(s => s.filter(m => m.id !== staffId)); }
  };

  // ── Manual search ──────────────────────────────────────────────────────────

  const manualSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    const res = await api.get<any>(`/organizer/events/${id}/attendees/?search=${encodeURIComponent(search)}&page_size=5`);
    const results = (res.data as any)?.results ?? res.data ?? [];
    setSearchResult(results);
    setSearching(false);
  };

  const manualCheckIn = async (attendeeId: string) => {
    if (!online) { pushQueue(attendeeId); toast.success("Queued for offline sync"); return; }
    const res = await api.post(`/organizer/events/${id}/attendees/${attendeeId}/manual-checkin/`, {});
    if (res.success) { toast.success("Checked in!"); setSearchResult(null); setSearch(""); load(); }
    else toast.error(res.error || "Check-in failed");
  };

  const copyGateLink = () => {
    const url = `${window.location.origin}/checkin/${accessCode}`;
    navigator.clipboard.writeText(url);
    toast.success("Gate link copied!");
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/events" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ChevronLeft className="w-4 h-4" /> Events
        </Link>
        <span className="text-muted">/</span>
        <span className="text-sm text-muted truncate max-w-[160px]">{eventTitle}</span>
        <span className="text-muted">/</span>
        <span className="text-sm font-medium">Check-In</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold">Check-In Management</h1>
          <div className="flex items-center gap-2 mt-1">
            {online
              ? <span className="flex items-center gap-1.5 text-xs text-success"><Wifi className="w-3.5 h-3.5" /> Live</span>
              : <span className="flex items-center gap-1.5 text-xs text-warning"><WifiOff className="w-3.5 h-3.5" /> Offline</span>}
            {queueCount > 0 && (
              <button onClick={syncQueue} className="flex items-center gap-1.5 text-xs text-warning hover:text-warning/80 transition-colors">
                <Upload className="w-3.5 h-3.5" /> {queueCount} queued — tap to sync
              </button>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Checked In"  value={stats.checked_in}  color="text-success" />
          <StatCard label="Remaining"   value={stats.remaining}   color="text-warning" />
          <StatCard label="Total"       value={stats.total} />
          <StatCard label="Fill Rate"   value={`${stats.fill_pct}%`} color="text-primary" />
        </div>
      )}

      {/* Fill bar */}
      {stats && (
        <div className="mb-6">
          <div className="h-3 bg-surface border border-border rounded-full overflow-hidden">
            <motion.div className="h-full bg-success rounded-full"
              initial={{ width: 0 }} animate={{ width: `${stats.fill_pct}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
          </div>
          {stats.by_tier.length > 0 && (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
              {stats.by_tier.map(t => (
                <div key={t.name} className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs">
                  <p className="font-medium truncate">{t.name}</p>
                  <p className="text-muted mt-0.5">{t.checked_in} / {t.total} ({t.total > 0 ? Math.round(t.checked_in / t.total * 100) : 0}%)</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Access Code */}
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <QrCode className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">Gate Access</h3>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 bg-surface border border-border rounded-sm px-3 h-10 flex items-center font-mono text-sm">
              {!accessCode ? <span className="text-muted">No code generated</span> : (showCode ? accessCode : "•".repeat(accessCode.length || 10))}
            </div>
            <button disabled={!accessCode} onClick={() => setShowCode(s => !s)} className={cn("p-2.5 bg-surface border border-border rounded-sm transition-colors", accessCode ? "text-muted hover:text-foreground" : "text-muted/50 cursor-not-allowed")}>
              {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyGateLink} className="flex-1">
              <Copy className="w-3.5 h-3.5" /> Copy Gate Link
            </Button>
            <Button variant="outline" size="sm" onClick={regenerateCode}>
              <RefreshCw className="w-3.5 h-3.5" /> Regenerate
            </Button>
          </div>
          <p className="text-xs text-muted mt-2">Share the gate link with scan staff. They don't need a EliteTicketPass account.</p>
        </div>

        {/* Manual search / override */}
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">Manual Override</h3>
          </div>
          <div className="flex gap-2 mb-3">
            <input value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && manualSearch()}
              placeholder="Name, email, or ticket #"
              className="flex-1 bg-surface border border-border rounded-sm px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted" />
            <Button size="sm" loading={searching} onClick={manualSearch}>Search</Button>
          </div>
          {searchResult !== null && (
            searchResult.length === 0 ? (
              <p className="text-xs text-muted py-3 text-center">No attendees found</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {searchResult.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 p-2.5 bg-surface border border-border rounded-lg">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.first_name} {a.last_name}</p>
                      <p className="text-xs text-muted">{a.tier_name} · #{a.ticket_number}</p>
                    </div>
                    {a.checked_in
                      ? <span className="text-xs text-success shrink-0 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> In</span>
                      : <Button size="sm" onClick={() => manualCheckIn(a.id)} className="shrink-0">Check In</Button>}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Check-In Staff */}
      <div className="bg-surface-2 border border-border rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">Gate Staff</h3>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAddStaffOpen(o => !o)}>
            <UserPlus className="w-3.5 h-3.5" /> Add Staff
          </Button>
        </div>

        <AnimatePresence>
          {addStaffOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-4">
              <div className="flex gap-2 pb-1">
                <input value={newStaffEmail} onChange={e => setNewStaffEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addStaff()}
                  placeholder="staff@example.com"
                  className="flex-1 bg-surface border border-border rounded-sm px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted" />
                <Button size="sm" loading={addingStaff} onClick={addStaff}>Invite</Button>
                <Button size="sm" variant="outline" onClick={() => setAddStaffOpen(false)}><X className="w-4 h-4" /></Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {staff.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">No check-in staff added yet.</p>
        ) : (
          <div className="space-y-2">
            {staff.map(m => (
              <div key={m.id} className="flex items-center justify-between gap-3 p-3 bg-surface border border-border rounded-lg">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted">{m.email} {m.last_active && `· last active ${formatDate(m.last_active, "dd MMM HH:mm")}`}</p>
                </div>
                <button onClick={() => removeStaff(m.id)} className="p-1.5 text-muted hover:text-error hover:bg-error/10 rounded-sm transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent scans */}
      <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Clock className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">Recent Scans</h3>
          <span className="ml-auto text-xs text-muted">Live · last 50</span>
        </div>
        {scans.length === 0 ? (
          <p className="text-sm text-muted py-8 text-center">No scans yet</p>
        ) : (
          <div className="divide-y divide-border">
            <AnimatePresence initial={false}>
              {scans.map(s => (
                <motion.div key={s.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{s.attendee_name}</p>
                      <ScanBadge status={s.status} />
                    </div>
                    <p className="text-xs text-muted mt-0.5">{s.tier_name} · #{s.ticket_number} · by {s.scanned_by}</p>
                  </div>
                  <p className="text-xs text-muted shrink-0">{formatDate(s.scanned_at, "HH:mm:ss")}</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
