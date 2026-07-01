"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, Search, Filter, Download, Upload, Send,
  Plus, X, CheckCircle2, Circle, StickyNote, UserPlus,
  Mail, MessageSquare, MoreHorizontal, ChevronDown,
  FileSpreadsheet, Users, User,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatDate, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Attendee {
  id: string;
  ticket_id: string;
  ticket_number: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  tier_name: string;
  tier_id: string;
  order_date: string;
  checked_in: boolean;
  checked_in_at: string | null;
  is_complimentary: boolean;
  notes: string;
}

interface Tier { id: string; name: string; }

const INPUT    = "w-full bg-surface border border-border rounded-sm px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted";
const LABEL    = "block text-xs font-medium mb-1 text-muted";
const TEXTAREA = "w-full bg-surface border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted resize-none";

// ── CSV / Excel export ────────────────────────────────────────────────────────

function buildCSV(rows: Attendee[]) {
  const header = ["#", "First Name", "Last Name", "Email", "Phone", "Tier", "Order Date", "Checked In", "Checked In At", "Notes"];
  const body   = rows.map((a, i) => [
    i + 1, a.first_name, a.last_name, a.email, a.phone,
    a.tier_name, formatDate(a.order_date), a.checked_in ? "Yes" : "No",
    a.checked_in_at ? formatDate(a.checked_in_at, "dd MMM yyyy HH:mm") : "",
    `"${(a.notes || "").replace(/"/g, '""')}"`,
  ]);
  return [header, ...body].map(r => r.join(",")).join("\n");
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Add Comp Modal ─────────────────────────────────────────────────────────────

function AddCompModal({ eventId, tiers, onDone, onClose }: {
  eventId: string; tiers: Tier[]; onDone: () => void; onClose: () => void;
}) {
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", tier_id: tiers[0]?.id || "", notes: "" });
  const [saving, setSaving] = useState(false);
  const patch = (p: Partial<typeof form>) => setForm(f => ({ ...f, ...p }));

  const submit = async () => {
    if (!form.first_name || !form.email || !form.tier_id) { toast.error("First name, email and tier are required"); return; }
    setSaving(true);
    const res = await api.post(`/organizer/events/${eventId}/attendees/comp/`, form);
    if (res.success) { toast.success("Complimentary ticket issued!"); onDone(); onClose(); }
    else toast.error(res.error || "Failed to issue ticket");
    setSaving(false);
  };

  return (
    <Modal title="Add Complimentary Attendee" onClose={onClose}>
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className={LABEL}>First name *</label><input value={form.first_name} onChange={e => patch({ first_name: e.target.value })} className={INPUT} placeholder="Jane" /></div>
          <div><label className={LABEL}>Last name</label><input value={form.last_name} onChange={e => patch({ last_name: e.target.value })} className={INPUT} placeholder="Doe" /></div>
        </div>
        <div><label className={LABEL}>Email *</label><input type="email" value={form.email} onChange={e => patch({ email: e.target.value })} className={INPUT} placeholder="jane@example.com" /></div>
        <div><label className={LABEL}>Phone</label><input value={form.phone} onChange={e => patch({ phone: e.target.value })} className={INPUT} placeholder="+2547XXXXXXXX" /></div>
        <div>
          <label className={LABEL}>Ticket tier *</label>
          <select value={form.tier_id} onChange={e => patch({ tier_id: e.target.value })} className={INPUT}>
            {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div><label className={LABEL}>Internal notes</label><textarea value={form.notes} onChange={e => patch({ notes: e.target.value })} rows={2} className={TEXTAREA} placeholder="e.g. Guest of organizer" /></div>
      </div>
      <ModalFooter onClose={onClose} onSave={submit} saving={saving} saveLabel="Issue Ticket" />
    </Modal>
  );
}

// ── CSV Import Modal ──────────────────────────────────────────────────────────

function ImportModal({ eventId, tiers, onDone, onClose }: {
  eventId: string; tiers: Tier[]; onDone: () => void; onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file,     setFile]     = useState<File | null>(null);
  const [tierId,   setTierId]   = useState(tiers[0]?.id || "");
  const [uploading, setUploading] = useState(false);
  const [result,   setResult]   = useState<{ imported: number; errors: string[] } | null>(null);

  const upload = async () => {
    if (!file || !tierId) { toast.error("Select a file and tier"); return; }
    const fd = new FormData(); fd.append("file", file); fd.append("tier_id", tierId);
    setUploading(true);
    const res = await api.post<{ imported: number; errors: string[] }>(`/organizer/events/${eventId}/attendees/import/`, fd);
    if (res.success && res.data) { setResult(res.data); onDone(); }
    else toast.error(res.error || "Import failed");
    setUploading(false);
  };

  return (
    <Modal title="Import Attendees via CSV" onClose={onClose}>
      <div className="p-5 space-y-4">
        {result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-success font-medium"><CheckCircle2 className="w-5 h-5" />{result.imported} attendees imported</div>
            {result.errors.length > 0 && (
              <div className="bg-error/5 border border-error/20 rounded-lg p-3 max-h-32 overflow-y-auto">
                <p className="text-xs font-medium text-error mb-2">{result.errors.length} rows skipped:</p>
                {result.errors.map((e, i) => <p key={i} className="text-xs text-error">• {e}</p>)}
              </div>
            )}
            <Button onClick={onClose} className="w-full">Done</Button>
          </div>
        ) : (
          <>
            <div className="text-xs text-muted bg-surface border border-border rounded-lg p-3 space-y-1">
              <p className="font-medium text-foreground mb-1.5">Expected CSV columns:</p>
              <p><span className="font-mono">first_name, last_name, email, phone</span></p>
              <p>First row must be a header row.</p>
            </div>
            <div>
              <label className={LABEL}>Assign to tier *</label>
              <select value={tierId} onChange={e => setTierId(e.target.value)} className={INPUT}>
                {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <label className={cn("flex flex-col items-center justify-center gap-2 h-28 border-2 border-dashed rounded-xl cursor-pointer transition-colors", file ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/30")}>
              <Upload className="w-5 h-5 text-muted" />
              <span className="text-sm text-muted">{file ? file.name : "Click to upload CSV"}</span>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
            </label>
            <ModalFooter onClose={onClose} onSave={upload} saving={uploading} saveLabel="Import" />
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Message Modal ─────────────────────────────────────────────────────────────

function MessageModal({ eventId, selectedIds, total, onClose }: {
  eventId: string; selectedIds: string[]; total: number; onClose: () => void;
}) {
  const [channel,  setChannel]  = useState<"EMAIL" | "SMS">("EMAIL");
  const [subject,  setSubject]  = useState("");
  const [body,     setBody]     = useState("");
  const [scope,    setScope]    = useState<"ALL" | "SELECTED">(selectedIds.length > 0 ? "SELECTED" : "ALL");
  const [sending,  setSending]  = useState(false);

  const send = async () => {
    if (!body.trim()) { toast.error("Message body required"); return; }
    if (channel === "EMAIL" && !subject.trim()) { toast.error("Subject required for email"); return; }
    setSending(true);
    const res = await api.post(`/organizer/events/${eventId}/attendees/message/`, {
      channel, subject, body,
      attendee_ids: scope === "SELECTED" ? selectedIds : [],
      send_to_all:  scope === "ALL",
    });
    if (res.success) { toast.success(`Message sent to ${scope === "ALL" ? "all" : selectedIds.length} attendees!`); onClose(); }
    else toast.error(res.error || "Failed to send");
    setSending(false);
  };

  return (
    <Modal title="Send Message to Attendees" onClose={onClose}>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {([["EMAIL", "📧 Email"], ["SMS", "💬 SMS"]] as const).map(([v, l]) => (
            <label key={v} className="cursor-pointer">
              <input type="radio" value={v} checked={channel === v} onChange={() => setChannel(v)} className="sr-only" />
              <div className={cn("p-2.5 rounded-lg border text-center text-sm font-medium transition-all",
                channel === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/30")}>{l}</div>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2 p-3 bg-surface border border-border rounded-lg text-xs text-muted">
          <Users className="w-4 h-4 shrink-0" />
          {selectedIds.length > 0
            ? <span>Send to: <button onClick={() => setScope("SELECTED")} className={cn("font-medium", scope === "SELECTED" && "text-primary")}>{selectedIds.length} selected</button> · <button onClick={() => setScope("ALL")} className={cn("font-medium", scope === "ALL" && "text-primary")}>all {total}</button></span>
            : <span>Sending to all {total} attendees</span>}
        </div>

        {channel === "EMAIL" && (
          <div><label className={LABEL}>Subject *</label><input value={subject} onChange={e => setSubject(e.target.value)} className={INPUT} placeholder="Important update about your ticket" /></div>
        )}
        <div>
          <label className={LABEL}>Message *</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} className={TEXTAREA}
            placeholder={channel === "EMAIL" ? "Write your message to attendees..." : "Keep it under 160 characters for single SMS"} />
          {channel === "SMS" && <p className={cn("text-xs mt-1", body.length > 160 ? "text-warning" : "text-muted")}>{body.length} / 160</p>}
        </div>
      </div>
      <ModalFooter onClose={onClose} onSave={send} saving={sending} saveLabel="Send Message" />
    </Modal>
  );
}

// ── Notes popover ─────────────────────────────────────────────────────────────

function NotesCell({ attendeeId, eventId, initial }: { attendeeId: string; eventId: string; initial: string }) {
  const [open,  setOpen]  = useState(false);
  const [notes, setNotes] = useState(initial);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await api.patch(`/organizer/events/${eventId}/attendees/${attendeeId}/`, { notes });
    setSaving(false); setOpen(false);
    toast.success("Notes saved");
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={cn("p-1.5 rounded-sm transition-colors", notes ? "text-primary" : "text-muted hover:text-foreground")}>
        <StickyNote className="w-3.5 h-3.5" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="absolute right-0 top-full mt-1 w-56 bg-surface-2 border border-border rounded-lg shadow-xl z-30 p-3">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={cn(TEXTAREA, "mb-2")} placeholder="Add a note…" />
            <div className="flex gap-2">
              <button onClick={() => setOpen(false)} className="flex-1 h-7 text-xs border border-border rounded-sm hover:bg-surface transition-colors">Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 h-7 text-xs bg-primary text-background rounded-sm hover:opacity-90 transition-opacity disabled:opacity-50">
                {saving ? "…" : "Save"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {open && <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />}
    </div>
  );
}

// ── Shared modal shell ────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-surface-2 border border-border rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-foreground rounded-sm transition-colors"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function ModalFooter({ onClose, onSave, saving, saveLabel }: { onClose: () => void; onSave: () => void; saving: boolean; saveLabel: string }) {
  return (
    <div className="flex gap-3 p-5 border-t border-border">
      <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
      <Button loading={saving} onClick={onSave} className="flex-1">{saveLabel}</Button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AttendeesPage() {
  const { id } = useParams<{ id: string }>();
  const [attendees,    setAttendees]    = useState<Attendee[]>([]);
  const [tiers,        setTiers]        = useState<Tier[]>([]);
  const [eventTitle,   setEventTitle]   = useState("");
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [filterTier,   setFilterTier]   = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "checked_in" | "not_checked_in" | "comp">(""); 
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<"comp" | "import" | "message" | null>(null);
  const [page, setPage]   = useState(1);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page_size: "500" });
    if (filterTier)   params.set("tier_id", filterTier);
    if (filterStatus) params.set("status",  filterStatus);
    if (search)       params.set("search",  search);
    const [evRes, attRes] = await Promise.all([
      api.get<any>(`/organizer/events/${id}/`),
      api.get<{ results: Attendee[] }>(`/organizer/events/${id}/attendees/?${params}`),
    ]);
    if (evRes.success) {
      setEventTitle(evRes.data?.title || "");
      setTiers(evRes.data?.tiers || []);
    }
    if (attRes.success)  setAttendees((attRes.data as any)?.results ?? attRes.data ?? []);
    setLoading(false);
  }, [id, search, filterTier, filterStatus]);

  useEffect(() => { load(); }, [load]);

  // ── Check-in toggle ─────────────────────────────────────────────────────────
  const toggleCheckIn = async (attendee: Attendee) => {
    const res = await api.patch(`/organizer/events/${id}/attendees/${attendee.id}/`, {
      checked_in: !attendee.checked_in,
    });
    if (res.success) {
      setAttendees(list => list.map(a => a.id === attendee.id
        ? { ...a, checked_in: !a.checked_in, checked_in_at: !a.checked_in ? new Date().toISOString() : null }
        : a
      ));
    }
  };

  // ── Select helpers ──────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll    = () => setSelected(s => s.size === paged.length ? new Set() : new Set(paged.map(a => a.id)));

  // ── Pagination ──────────────────────────────────────────────────────────────
  const paged  = attendees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages  = Math.ceil(attendees.length / PAGE_SIZE);

  // ── Export ──────────────────────────────────────────────────────────────────
  const exportCSV   = () => downloadFile(buildCSV(attendees), `attendees-${eventTitle.replace(/\s+/g, "-")}.csv`, "text/csv");
  const exportExcel = () => downloadFile(buildCSV(attendees), `attendees-${eventTitle.replace(/\s+/g, "-")}.xls`, "application/vnd.ms-excel");

  const checkedIn    = attendees.filter(a => a.checked_in).length;
  const notCheckedIn = attendees.length - checkedIn;

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
        <span className="text-sm font-medium">Attendees</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Attendees</h1>
          <p className="text-muted text-sm mt-1">{attendees.length} total · {checkedIn} checked in · {notCheckedIn} remaining</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setModal("message")} disabled={attendees.length === 0}>
            <Send className="w-3.5 h-3.5" /> Message
          </Button>
          <Button variant="outline" size="sm" onClick={() => setModal("import")}>
            <Upload className="w-3.5 h-3.5" /> Import
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </Button>
          <Button size="sm" onClick={() => setModal("comp")}>
            <UserPlus className="w-3.5 h-3.5" /> Add Comp
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search name, email, phone…"
            className="w-full bg-surface border border-border rounded-sm pl-9 pr-4 h-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted" />
        </div>
        <select value={filterTier} onChange={e => { setFilterTier(e.target.value); setPage(1); }}
          className="bg-surface border border-border rounded-sm px-3 h-9 text-sm focus:outline-none">
          <option value="">All Tiers</option>
          {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value as any); setPage(1); }}
          className="bg-surface border border-border rounded-sm px-3 h-9 text-sm focus:outline-none">
          <option value="">All Statuses</option>
          <option value="checked_in">Checked In</option>
          <option value="not_checked_in">Not Checked In</option>
          <option value="comp">Complimentary</option>
        </select>
      </div>

      {/* Selected actions bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-primary/10 border border-primary/20 rounded-lg text-sm">
            <span className="font-medium text-primary">{selected.size} selected</span>
            <button onClick={() => setModal("message")} className="flex items-center gap-1.5 text-primary hover:underline">
              <Send className="w-3.5 h-3.5" /> Send message
            </button>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-muted hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 bg-surface-2 border border-border rounded-xl animate-pulse" />)}</div>
      ) : attendees.length === 0 ? (
        <div className="text-center py-24 bg-surface-2 border border-border rounded-xl">
          <Users className="w-10 h-10 text-muted mx-auto mb-3" />
          <h3 className="font-semibold mb-1">No attendees yet</h3>
          <p className="text-muted text-sm mb-5">Attendees appear here once orders are confirmed.</p>
          <Button size="sm" onClick={() => setModal("comp")}><UserPlus className="w-4 h-4" /> Add Comp Ticket</Button>
        </div>
      ) : (
        <>
          <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface">
                    <th className="px-4 py-3 w-8">
                      <input type="checkbox" checked={selected.size === paged.length && paged.length > 0}
                        onChange={toggleAll} className="accent-primary" />
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted">Attendee</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted hidden sm:table-cell">Tier</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted hidden md:table-cell">Order Date</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted">Check-in</th>
                    <th className="px-4 py-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paged.map(att => (
                    <tr key={att.id} className={cn("hover:bg-surface/40 transition-colors", selected.has(att.id) && "bg-primary/5")}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(att.id)} onChange={() => toggleSelect(att.id)} className="accent-primary" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                            {(att.first_name?.[0] || "") + (att.last_name?.[0] || "") 
                              ? ((att.first_name?.[0] || "") + (att.last_name?.[0] || "")).toUpperCase() 
                              : <User className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              {att.first_name} {att.last_name}
                              {att.is_complimentary && <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-secondary/10 text-secondary">Comp</span>}
                            </p>
                            <p className="text-xs text-muted truncate">{att.email}</p>
                            {att.phone && <p className="text-xs text-muted">{att.phone}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-xs px-2 py-1 rounded-full bg-surface border border-border">{att.tier_name}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted hidden md:table-cell whitespace-nowrap">
                        {formatDate(att.order_date, "dd MMM yyyy")}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleCheckIn(att)}
                          className={cn("flex items-center gap-1.5 text-xs font-medium transition-colors",
                            att.checked_in ? "text-success hover:text-success/70" : "text-muted hover:text-foreground")}>
                          {att.checked_in
                            ? <><CheckCircle2 className="w-4 h-4" />In</>
                            : <><Circle className="w-4 h-4" />–</>}
                        </button>
                        {att.checked_in_at && (
                          <p className="text-xs text-muted mt-0.5">{formatDate(att.checked_in_at, "HH:mm")}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <NotesCell attendeeId={att.id} eventId={id} initial={att.notes} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-muted">
              <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, attendees.length)} of {attendees.length}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 h-8 rounded-sm border border-border hover:bg-surface disabled:opacity-50 transition-colors">Prev</button>
                <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                  className="px-3 h-8 rounded-sm border border-border hover:bg-surface disabled:opacity-50 transition-colors">Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <AnimatePresence>
        {modal === "comp"    && <AddCompModal    eventId={id} tiers={tiers} onDone={load} onClose={() => setModal(null)} />}
        {modal === "import"  && <ImportModal     eventId={id} tiers={tiers} onDone={load} onClose={() => setModal(null)} />}
        {modal === "message" && <MessageModal    eventId={id} selectedIds={[...selected]} total={attendees.length} onClose={() => setModal(null)} />}
      </AnimatePresence>
    </div>
  );
}
