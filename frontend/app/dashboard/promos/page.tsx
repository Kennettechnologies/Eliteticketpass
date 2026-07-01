"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Tag, Copy, Trash2, X, Save, BarChart2,
  Link2, Percent, DollarSign, Users, Clock, RefreshCw,
  CheckCircle2, AlertCircle, Download, Search,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatDate, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type DiscountType = "PERCENT" | "FIXED";
type CodeType     = "PROMO" | "REFERRAL" | "BULK";

interface PromoCode {
  id: string;
  code: string;
  code_type: CodeType;
  discount_type: DiscountType;
  discount_value: string;
  usage_limit: number | null;
  used_count: number;
  is_single_use: boolean;
  expires_at: string | null;
  applicable_tiers: string[];
  applicable_tier_names: string[];
  event_ids: string[];
  event_titles: string[];
  is_active: boolean;
  referral_owner: string | null;
  referral_earnings: string;
  created_at: string;
}

interface Event {
  id: string;
  title: string;
  tiers: { id: string; name: string }[];
}

const BLANK: Omit<PromoCode, "id" | "used_count" | "referral_earnings" | "applicable_tier_names" | "event_titles" | "created_at"> = {
  code: "", code_type: "PROMO", discount_type: "PERCENT", discount_value: "10",
  usage_limit: null, is_single_use: false, expires_at: null,
  applicable_tiers: [], event_ids: [], is_active: true,
  referral_owner: null,
};

const INPUT  = "w-full bg-surface border border-border rounded-sm px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted";
const LABEL  = "block text-xs font-medium mb-1 text-muted";

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomCode(len = 8) {
  return Array.from({ length: len }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
}

function StatusBadge({ code }: { code: PromoCode }) {
  const expired = code.expires_at && new Date(code.expires_at) < new Date();
  const exhausted = code.usage_limit !== null && code.used_count >= code.usage_limit;
  if (!code.is_active || expired || exhausted)
    return <span className="text-xs px-2 py-0.5 rounded-full bg-error/10 text-error font-medium">Inactive</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-medium">Active</span>;
}

// ── Promo Form Modal ──────────────────────────────────────────────────────────

function PromoFormModal({
  initial, events, onSave, onClose,
}: {
  initial: Partial<PromoCode> | null;
  events: Event[];
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ ...BLANK, ...initial });
  const [saving, setSaving] = useState(false);
  const patch = (p: Partial<typeof form>) => setForm(f => ({ ...f, ...p }));

  const selectedEvent = events.find(e => form.event_ids.includes(e.id));

  const handleSave = async () => {
    if (!form.code.trim()) { toast.error("Code is required"); return; }
    if (!form.discount_value || Number(form.discount_value) <= 0) { toast.error("Enter a valid discount"); return; }
    if (form.discount_type === "PERCENT" && Number(form.discount_value) > 100) { toast.error("Percent discount can't exceed 100"); return; }
    setSaving(true);
    await onSave({ ...form, discount_value: String(form.discount_value) });
    setSaving(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4 py-6 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-surface-2 border border-border rounded-xl w-full max-w-lg my-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold">{initial?.id ? "Edit Promo Code" : "Create Promo Code"}</h2>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-foreground rounded-sm transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Code type */}
          <div>
            <label className={LABEL}>Code type</label>
            <div className="grid grid-cols-3 gap-2">
              {([["PROMO", "🏷 Promo"], ["REFERRAL", "🔗 Referral"], ["BULK", "📦 Bulk"]] as const).map(([v, l]) => (
                <label key={v} className="cursor-pointer">
                  <input type="radio" value={v} checked={form.code_type === v} onChange={() => patch({ code_type: v })} className="sr-only" />
                  <div className={cn("p-2.5 rounded-lg border text-center text-xs font-medium transition-all",
                    form.code_type === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/30")}>
                    {l}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Code */}
          <div>
            <label className={LABEL}>Code *</label>
            <div className="flex gap-2">
              <input value={form.code} onChange={e => patch({ code: e.target.value.toUpperCase() })}
                className={cn(INPUT, "flex-1")} placeholder="SUMMER25" />
              <button type="button" onClick={() => patch({ code: randomCode() })}
                className="px-3 h-10 bg-surface border border-border rounded-sm text-xs text-muted hover:text-foreground hover:bg-surface-2 transition-colors">
                Random
              </button>
            </div>
          </div>

          {/* Discount */}
          <div>
            <label className={LABEL}>Discount type</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {([["PERCENT", "% Percentage", Percent], ["FIXED", "KES Fixed", DollarSign]] as const).map(([v, l, Icon]) => (
                <label key={v} className="cursor-pointer">
                  <input type="radio" value={v} checked={form.discount_type === v} onChange={() => patch({ discount_type: v })} className="sr-only" />
                  <div className={cn("p-2.5 rounded-lg border text-center text-xs font-medium transition-all flex items-center justify-center gap-1.5",
                    form.discount_type === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/30")}>
                    <Icon className="w-3.5 h-3.5" />{l}
                  </div>
                </label>
              ))}
            </div>
            <input type="number" value={form.discount_value} onChange={e => patch({ discount_value: e.target.value })}
              className={INPUT} min={0} max={form.discount_type === "PERCENT" ? 100 : undefined}
              placeholder={form.discount_type === "PERCENT" ? "e.g. 20 (= 20% off)" : "e.g. 500 (= KES 500 off)"} />
          </div>

          {/* Single-use toggle */}
          <div className="flex items-center justify-between p-3 bg-surface border border-border rounded-lg">
            <div>
              <p className="text-sm font-medium">Single-use code</p>
              <p className="text-xs text-muted">Each code can only be used once per customer</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={form.is_single_use} onChange={e => patch({ is_single_use: e.target.checked })} className="sr-only peer" />
              <div className="w-9 h-5 bg-surface-2 border border-border rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Usage limit {form.is_single_use ? "(auto: 1)" : ""}</label>
              <input type="number" value={form.usage_limit ?? ""} disabled={form.is_single_use}
                onChange={e => patch({ usage_limit: e.target.value ? Number(e.target.value) : null })}
                className={cn(INPUT, form.is_single_use && "opacity-50")} placeholder="Unlimited" min={1} />
            </div>
            <div>
              <label className={LABEL}>Expires at</label>
              <input type="datetime-local" value={form.expires_at ?? ""} onChange={e => patch({ expires_at: e.target.value || null })}
                className={INPUT} />
            </div>
          </div>

          {/* Event scope */}
          <div>
            <label className={LABEL}>Apply to event (optional — leave blank for all)</label>
            <select className={INPUT}
              value={form.event_ids[0] || ""}
              onChange={e => patch({ event_ids: e.target.value ? [e.target.value] : [], applicable_tiers: [] })}>
              <option value="">All events</option>
              {events.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>

          {/* Tier scope */}
          {selectedEvent && selectedEvent.tiers.length > 0 && (
            <div>
              <label className={LABEL}>Applicable tiers (blank = all tiers)</label>
              <div className="flex flex-wrap gap-2">
                {selectedEvent.tiers.map(t => (
                  <label key={t.id} className="cursor-pointer">
                    <input type="checkbox" checked={form.applicable_tiers.includes(t.id)}
                      onChange={e => patch({ applicable_tiers: e.target.checked ? [...form.applicable_tiers, t.id] : form.applicable_tiers.filter(x => x !== t.id) })}
                      className="sr-only" />
                    <span className={cn("text-xs px-2.5 py-1 rounded-full border font-medium transition-all",
                      form.applicable_tiers.includes(t.id) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/30")}>
                      {t.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Referral owner */}
          {form.code_type === "REFERRAL" && (
            <div>
              <label className={LABEL}>Referral owner (email or name)</label>
              <input value={form.referral_owner ?? ""} onChange={e => patch({ referral_owner: e.target.value })}
                className={INPUT} placeholder="influencer@example.com" />
            </div>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t border-border">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button loading={saving} onClick={handleSave} className="flex-1"><Save className="w-4 h-4" /> Save Code</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Bulk Generate Modal ───────────────────────────────────────────────────────

function BulkModal({ events, onClose }: { events: Event[]; onClose: () => void }) {
  const [count,         setCount]         = useState(10);
  const [prefix,        setPrefix]        = useState("");
  const [discountType,  setDiscountType]  = useState<DiscountType>("PERCENT");
  const [discountValue, setDiscountValue] = useState("15");
  const [usageLimit,    setUsageLimit]    = useState<number | null>(1);
  const [eventId,       setEventId]       = useState("");
  const [expiresAt,     setExpiresAt]     = useState("");
  const [generating,    setGenerating]    = useState(false);
  const [generated,     setGenerated]     = useState<string[]>([]);

  const generate = async () => {
    setGenerating(true);
    const res = await api.post<{ codes: string[] }>("/organizer/promo-codes/bulk-generate/", {
      count, prefix, discount_type: discountType, discount_value: discountValue,
      usage_limit: usageLimit, event_id: eventId || null,
      expires_at: expiresAt || null, code_type: "BULK",
    });
    if (res.success && res.data?.codes) { setGenerated(res.data.codes); toast.success(`${res.data.codes.length} codes generated!`); }
    else toast.error(res.error || "Generation failed");
    setGenerating(false);
  };

  const downloadCSV = () => {
    const csv = "Code\n" + generated.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "promo-codes.csv"; a.click();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-surface-2 border border-border rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold">Bulk Generate Codes</h2>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-foreground rounded-sm transition-colors"><X className="w-4 h-4" /></button>
        </div>

        {generated.length > 0 ? (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-success text-sm font-medium mb-3">
              <CheckCircle2 className="w-4 h-4" /> {generated.length} codes generated
            </div>
            <div className="max-h-48 overflow-y-auto bg-surface border border-border rounded-lg p-3 font-mono text-xs space-y-1">
              {generated.map(c => <div key={c}>{c}</div>)}
            </div>
            <div className="flex gap-2">
              <Button onClick={downloadCSV} variant="outline" className="flex-1"><Download className="w-4 h-4" /> Download CSV</Button>
              <Button onClick={onClose} className="flex-1">Done</Button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Number of codes</label>
                <input type="number" value={count} onChange={e => setCount(Number(e.target.value))} className={INPUT} min={1} max={500} />
              </div>
              <div>
                <label className={LABEL}>Code prefix (optional)</label>
                <input value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase())} className={INPUT} placeholder="INFL" />
              </div>
            </div>

            <div>
              <label className={LABEL}>Discount type</label>
              <div className="grid grid-cols-2 gap-2">
                {([["PERCENT", "% Percent"], ["FIXED", "KES Fixed"]] as const).map(([v, l]) => (
                  <label key={v} className="cursor-pointer">
                    <input type="radio" value={v} checked={discountType === v} onChange={() => setDiscountType(v)} className="sr-only" />
                    <div className={cn("p-2 rounded-lg border text-center text-xs font-medium transition-all",
                      discountType === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/30")}>{l}</div>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Discount value</label>
                <input type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)} className={INPUT} min={1} />
              </div>
              <div>
                <label className={LABEL}>Uses per code</label>
                <input type="number" value={usageLimit ?? ""} onChange={e => setUsageLimit(e.target.value ? Number(e.target.value) : null)} className={INPUT} min={1} placeholder="Unlimited" />
              </div>
            </div>

            <div>
              <label className={LABEL}>Apply to event (optional)</label>
              <select value={eventId} onChange={e => setEventId(e.target.value)} className={INPUT}>
                <option value="">All events</option>
                {events.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </div>

            <div>
              <label className={LABEL}>Expiry date</label>
              <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className={INPUT} />
            </div>

            <Button loading={generating} onClick={generate} className="w-full">
              <RefreshCw className="w-4 h-4" /> Generate {count} Codes
            </Button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PromosPage() {
  const [codes,   setCodes]   = useState<PromoCode[]>([]);
  const [events,  setEvents]  = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [editing, setEditing] = useState<Partial<PromoCode> | null | "new">(null);
  const [showBulk, setShowBulk] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [usageData, setUsageData] = useState<any[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const load = useCallback(async () => {
    const [codesRes, eventsRes] = await Promise.all([
      api.get<{ results: PromoCode[] }>("/organizer/promo-codes/"),
      api.get<{ results: Event[] }>("/organizer/events/?status=PUBLISHED&page_size=100&active=true&not_sold_out=true"),
    ]);
    if (codesRes.success)  setCodes((codesRes.data as any)?.results  ?? codesRes.data  ?? []);
    if (eventsRes.success) setEvents((eventsRes.data as any)?.results ?? eventsRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadUsage = async (codeId: string) => {
    setDetailId(codeId); setLoadingUsage(true);
    const res = await api.get<any[]>(`/organizer/promo-codes/${codeId}/usage/`);
    if (res.success) setUsageData(res.data ?? []);
    setLoadingUsage(false);
  };

  const saveCode = async (data: any) => {
    const isEdit = editing !== "new" && (editing as any)?.id;
    const res = isEdit
      ? await api.patch<PromoCode>(`/organizer/promo-codes/${(editing as any).id}/`, data)
      : await api.post<PromoCode>("/organizer/promo-codes/", data);
    if (res.success) { toast.success(isEdit ? "Code updated!" : "Code created!"); setEditing(null); load(); }
    else toast.error(res.error || "Save failed");
  };

  const deleteCode = async (id: string) => {
    if (!confirm("Delete this promo code?")) return;
    const res = await api.delete(`/organizer/promo-codes/${id}/`);
    if (res.success) { toast.success("Deleted"); load(); }
    else toast.error("Delete failed");
  };

  const copyCode = (code: string) => { navigator.clipboard.writeText(code); toast.success("Copied!"); };

  const toggleActive = async (code: PromoCode) => {
    const res = await api.patch<PromoCode>(`/organizer/promo-codes/${code.id}/`, { is_active: !code.is_active });
    if (res.success) setCodes(cs => cs.map(c => c.id === code.id ? { ...c, is_active: !c.is_active } : c));
  };

  const filtered = codes.filter(c =>
    !search || c.code.toLowerCase().includes(search.toLowerCase()) ||
    c.event_titles?.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold">Promo Codes</h1>
          <p className="text-muted text-sm mt-1">{codes.length} code{codes.length !== 1 ? "s" : ""} · {codes.filter(c => c.is_active).length} active</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowBulk(true)}><RefreshCw className="w-4 h-4" /> Bulk Generate</Button>
          <Button onClick={() => setEditing("new")}><Plus className="w-4 h-4" /> New Code</Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search codes…"
          className="w-full bg-surface border border-border rounded-sm pl-9 pr-4 h-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-surface-2 border border-border rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 bg-surface-2 border border-border rounded-xl">
          <Tag className="w-10 h-10 text-muted mx-auto mb-3" />
          <h3 className="font-semibold mb-1">No promo codes yet</h3>
          <p className="text-muted text-sm mb-5">Create codes to offer discounts to your buyers.</p>
          <Button onClick={() => setEditing("new")}><Plus className="w-4 h-4" /> Create Code</Button>
        </div>
      ) : (
        <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted">Code</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted">Discount</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted hidden md:table-cell">Usage</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted hidden lg:table-cell">Expires</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted hidden lg:table-cell">Events</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(code => (
                  <tr key={code.id} className="hover:bg-surface/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-primary">{code.code}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-surface border border-border text-muted capitalize">{code.code_type.toLowerCase()}</span>
                        <button onClick={() => copyCode(code.code)} className="p-1 text-muted hover:text-foreground rounded transition-colors">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {code.referral_owner && <p className="text-xs text-muted mt-0.5 flex items-center gap-1"><Link2 className="w-3 h-3" />{code.referral_owner}</p>}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {code.discount_type === "PERCENT"
                        ? <span className="flex items-center gap-0.5"><Percent className="w-3.5 h-3.5 text-muted" />{code.discount_value}% off</span>
                        : <span>{formatCurrency(code.discount_value)} off</span>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{code.used_count}</span>
                        {code.usage_limit && <><span className="text-muted">/ {code.usage_limit}</span>
                          <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (code.used_count / code.usage_limit) * 100)}%` }} />
                          </div></>}
                        <button onClick={() => loadUsage(code.id)} className="p-1 text-muted hover:text-primary rounded transition-colors" title="View usage">
                          <BarChart2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted hidden lg:table-cell text-xs">
                      {code.expires_at ? formatDate(code.expires_at, "dd MMM yyyy") : "—"}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {code.event_titles?.length
                        ? <span className="text-xs text-muted truncate max-w-[140px] block">{code.event_titles.join(", ")}</span>
                        : <span className="text-xs text-muted">All events</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActive(code)} className="flex items-center">
                        <StatusBadge code={code} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditing(code)}
                          className="p-1.5 text-muted hover:text-primary hover:bg-primary/5 rounded-sm transition-colors">
                          <Tag className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteCode(code.id)}
                          className="p-1.5 text-muted hover:text-error hover:bg-error/5 rounded-sm transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Usage detail drawer */}
      <AnimatePresence>
        {detailId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex justify-end"
            onClick={e => e.target === e.currentTarget && setDetailId(null)}>
            <motion.div initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }} transition={{ type: "spring", damping: 30 }}
              className="w-full max-w-md bg-surface-2 border-l border-border h-full overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-border">
                <h2 className="font-semibold">Code Usage</h2>
                <button onClick={() => setDetailId(null)} className="p-1.5 text-muted hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
              {loadingUsage ? (
                <div className="p-5 space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-surface border border-border rounded-lg animate-pulse" />)}</div>
              ) : usageData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted">
                  <Users className="w-8 h-8 mb-2" />
                  <p className="text-sm">No usages yet</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {usageData.map((u: any, i) => (
                    <div key={i} className="p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{u.buyer_name || u.buyer_email}</p>
                        <p className="text-xs text-muted mt-0.5">{u.event_title}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-medium text-success">-{u.discount_type === "PERCENT" ? `${u.discount_value}%` : formatCurrency(u.discount_value)}</p>
                        <p className="text-xs text-muted">{formatDate(u.used_at, "dd MMM · HH:mm")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editing !== null && (
          <PromoFormModal
            initial={editing === "new" ? null : editing}
            events={events}
            onSave={saveCode}
            onClose={() => setEditing(null)}
          />
        )}
        {showBulk && <BulkModal events={events} onClose={() => { setShowBulk(false); load(); }} />}
      </AnimatePresence>
    </div>
  );
}
