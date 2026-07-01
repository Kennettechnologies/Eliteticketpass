"use client";

import { useState, useEffect, useCallback, useRef, ElementType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Building2, CheckCircle2, XCircle, Clock, ShieldCheck,
  Star, Crown, Percent, FileText, X, AlertTriangle, RefreshCw,
  ExternalLink, ChevronDown, ChevronUp, Eye, Download, Wallet,
  CalendarDays, TrendingUp, Settings2,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatDate, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type OrgStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
type OrgTier   = "BASIC" | "VERIFIED" | "PREMIUM";

interface Organizer {
  id: string;
  display_name: string;
  email: string;
  phone?: string;
  status: OrgStatus;
  tier: OrgTier;
  kyc_status: "NOT_SUBMITTED" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "EXPIRED";
  created_at: string;
  total_events: number;
  total_gross: string;
  total_payouts: string;
  platform_fee_override?: { flat: number; pct: number } | null;
  logo_url?: string;
}

interface OrgDetail extends Organizer {
  bio?: string;
  website?: string;
  kyc_docs: { id: string; type: string; file_url: string; uploaded_at: string }[];
  events:   { id: string; title: string; starts_at: string; status: string; tickets_sold: number; gross: string }[];
  payouts:  { id: string; amount: string; status: string; created_at: string }[];
}

const STATUS_CFG: Record<OrgStatus, { cls: string; label: string; icon: ElementType }> = {
  PENDING:   { cls: "bg-warning/10 text-warning",   label: "Pending",   icon: Clock         },
  APPROVED:  { cls: "bg-success/10 text-success",   label: "Approved",  icon: CheckCircle2  },
  REJECTED:  { cls: "bg-error/10 text-error",       label: "Rejected",  icon: XCircle       },
  SUSPENDED: { cls: "bg-error/10 text-error",       label: "Suspended", icon: ShieldCheck   },
};

const KYC_CFG: Record<string, { cls: string; label: string }> = {
  NOT_SUBMITTED:  { cls: "text-muted",    label: "Not submitted" },
  PENDING_REVIEW: { cls: "text-warning",  label: "Under review"  },
  APPROVED:       { cls: "text-success",  label: "Verified"      },
  REJECTED:       { cls: "text-error",    label: "Rejected"      },
  EXPIRED:        { cls: "text-warning",  label: "Expired"       },
};

const TIER_CFG: Record<OrgTier, { cls: string; icon: ElementType; label: string }> = {
  BASIC:    { cls: "bg-surface border-border text-muted",       icon: Building2,  label: "Basic"    },
  VERIFIED: { cls: "bg-primary/10 border-primary/20 text-primary", icon: ShieldCheck, label: "Verified" },
  PREMIUM:  { cls: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400", icon: Crown, label: "Premium"  },
};

// ── Confirm modal ─────────────────────────────────────────────────────────────

function ConfirmModal({ title, body, variant = "warning", onConfirm, onClose, loading }: {
  title: string; body: string; variant?: "error" | "warning";
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
        <p className="text-sm text-muted text-center mb-6">{body}</p>
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

// ── Fee override editor ───────────────────────────────────────────────────────

function FeeOverrideRow({ override, onSave }: {
  override: { flat: number; pct: number } | null;
  onSave: (flat: number, pct: number, clear: boolean) => Promise<void>;
}) {
  const [flat, setFlat] = useState(String(override?.flat ?? ""));
  const [pct,  setPct]  = useState(String(override?.pct  ?? ""));
  const [saving, setSaving] = useState(false);

  const save = async (clear = false) => {
    setSaving(true);
    await onSave(Number(flat), Number(pct), clear);
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">Override platform fee for this organizer (leave blank to use default)</p>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs text-muted mb-1">Flat fee (KES)</label>
          <input type="number" value={flat} onChange={e => setFlat(e.target.value)} min={0}
            className="w-full bg-surface border border-border rounded-sm px-3 h-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-muted mb-1">Percentage (%)</label>
          <input type="number" value={pct} onChange={e => setPct(e.target.value)} min={0} max={100}
            className="w-full bg-surface border border-border rounded-sm px-3 h-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <Button size="sm" loading={saving} onClick={() => save(false)}>
          <Settings2 className="w-3.5 h-3.5" /> Save
        </Button>
        {override && (
          <Button size="sm" variant="outline" loading={saving} onClick={() => save(true)}>
            Reset
          </Button>
        )}
      </div>
      {override && (
        <p className="text-xs text-success">
          ✓ Override active: KES {override.flat} + {override.pct}%
        </p>
      )}
    </div>
  );
}

// ── Organizer detail drawer ───────────────────────────────────────────────────

function OrgDrawer({ orgId, onClose, onUpdated }: {
  orgId: string; onClose: () => void; onUpdated: () => void;
}) {
  const [org,       setOrg]      = useState<OrgDetail | null>(null);
  const [loading,   setLoading]  = useState(true);
  const [tab,       setTab]      = useState<"kyc" | "events" | "payouts" | "fee">("kyc");
  const [confirm,   setConfirm]  = useState<null | { action: string; title: string; body: string; variant: "error" | "warning"; notes?: string }>(null);
  const [actLoad,   setActLoad]  = useState(false);
  const [rejectNote,setRejectNote] = useState("");
  const [selectedTier, setSelectedTier] = useState<OrgTier | "">("");

  useEffect(() => {
    api.get<OrgDetail>(`/admin/organizers/${orgId}/`).then(r => {
      if (r.success && r.data) { setOrg(r.data); setSelectedTier(r.data.tier); }
      setLoading(false);
    });
  }, [orgId]);

  const doAction = async (action: string, extra?: Record<string, unknown>) => {
    setActLoad(true);
    const res = await api.post(`/admin/organizers/${orgId}/${action}/`, extra || {});
    if (res.success) {
      toast.success(`Done: ${action}`);
      const r2 = await api.get<OrgDetail>(`/admin/organizers/${orgId}/`);
      if (r2.success && r2.data) { setOrg(r2.data); setSelectedTier(r2.data.tier); }
      onUpdated();
    } else toast.error(res.error || "Action failed");
    setActLoad(false);
    setConfirm(null);
  };

  const saveFeeOverride = async (flat: number, pct: number, clear: boolean) => {
    const res = clear
      ? await api.delete(`/admin/organizers/${orgId}/fee-override/`)
      : await api.post(`/admin/organizers/${orgId}/fee-override/`, { flat, pct });
    if (res.success) {
      toast.success(clear ? "Fee override cleared" : "Fee override saved");
      const r2 = await api.get<OrgDetail>(`/admin/organizers/${orgId}/`);
      if (r2.success && r2.data) setOrg(r2.data);
    } else toast.error(res.error || "Failed");
  };

  if (loading) return (
    <div className="fixed inset-y-0 right-0 w-full max-w-2xl z-50 bg-surface border-l border-border flex items-center justify-center">
      <RefreshCw className="w-6 h-6 text-muted animate-spin" />
    </div>
  );
  if (!org) return null;

  const statusCfg = STATUS_CFG[org.status];
  const tierCfg   = TIER_CFG[org.tier];
  const kycCfg    = KYC_CFG[org.kyc_status] || KYC_CFG.NOT_SUBMITTED;
  const TierIcon  = tierCfg.icon;

  return (
    <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="fixed inset-y-0 right-0 w-full max-w-2xl z-50 bg-surface border-l border-border flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          {org.logo_url
            ? <img src={org.logo_url} alt="" className="w-full h-full rounded-full object-cover" />
            : <Building2 className="w-5 h-5 text-primary" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{org.display_name}</p>
          <p className="text-xs text-muted">{org.email}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium", statusCfg.cls)}>
            <statusCfg.icon className="w-3 h-3" />{statusCfg.label}
          </span>
          <span className={cn("flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium", tierCfg.cls)}>
            <TierIcon className="w-3 h-3" />{tierCfg.label}
          </span>
        </div>
        <button onClick={onClose} className="p-1.5 text-muted hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-px bg-border shrink-0">
        {[
          { label: "Events",       value: org.total_events },
          { label: "Gross Sales",  value: formatCurrency(org.total_gross) },
          { label: "Total Payouts",value: formatCurrency(org.total_payouts) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-surface px-4 py-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="font-bold text-sm mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 px-5 py-3.5 border-b border-border shrink-0">
        {org.status === "PENDING" && (
          <>
            <Button size="sm" onClick={() => setConfirm({ action: "approve", title: "Approve organizer?",
              body: "They will be able to create and publish events.", variant: "warning" })}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
            </Button>
            <Button size="sm" variant="outline"
              onClick={() => setConfirm({ action: "reject", title: "Reject application?",
                body: rejectNote || "This organizer will be notified.", variant: "error", notes: rejectNote })}>
              <XCircle className="w-3.5 h-3.5" /> Reject
            </Button>
          </>
        )}
        {org.status === "APPROVED" && (
          <Button size="sm" variant="outline"
            onClick={() => setConfirm({ action: "suspend", title: "Suspend organizer?",
              body: "All their events will be hidden from public listings.", variant: "error" })}>
            <ShieldCheck className="w-3.5 h-3.5" /> Suspend
          </Button>
        )}
        {(org.status === "REJECTED" || org.status === "SUSPENDED") && (
          <Button size="sm" onClick={() => setConfirm({ action: "approve", title: "Reinstate organizer?",
            body: "Account and events will be restored to active.", variant: "warning" })}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Reinstate
          </Button>
        )}
        {/* Tier picker */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted">Tier:</span>
          <select value={selectedTier} onChange={e => setSelectedTier(e.target.value as OrgTier)}
            className="bg-surface border border-border rounded-sm px-2 h-8 text-xs focus:outline-none">
            <option value="BASIC">Basic</option>
            <option value="VERIFIED">Verified</option>
            <option value="PREMIUM">Premium</option>
          </select>
          <Button size="sm" variant="outline" loading={actLoad}
            disabled={selectedTier === org.tier}
            onClick={() => doAction("set-tier", { tier: selectedTier })}>
            Save
          </Button>
        </div>
      </div>

      {/* Reject reason input (shown when PENDING) */}
      {org.status === "PENDING" && (
        <div className="px-5 py-2 border-b border-border shrink-0">
          <input value={rejectNote} onChange={e => setRejectNote(e.target.value)}
            placeholder="Rejection reason (optional, sent to organizer)"
            className="w-full bg-surface border border-border rounded-sm px-3 h-8 text-xs focus:outline-none" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        {([
          { key: "kyc",     label: "KYC Documents" },
          { key: "events",  label: "Events"        },
          { key: "payouts", label: "Payouts"       },
          { key: "fee",     label: "Fee Override"  },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px",
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === "kyc" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">KYC Status:
                <span className={cn("ml-2", kycCfg.cls)}>{kycCfg.label}</span>
              </p>
              {org.kyc_status === "PENDING_REVIEW" && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setConfirm({ action: "approve-kyc", title: "Approve KYC?",
                    body: "Organizer will be marked as identity-verified.", variant: "warning" })}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve KYC
                  </Button>
                  <Button size="sm" variant="outline"
                    onClick={() => setConfirm({ action: "reject-kyc", title: "Reject KYC?",
                      body: "Organizer will be asked to resubmit documents.", variant: "error" })}>
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </Button>
                </div>
              )}
            </div>
            {org.kyc_docs.length === 0 ? (
              <div className="text-center py-10">
                <FileText className="w-8 h-8 text-muted mx-auto mb-2 opacity-40" />
                <p className="text-muted text-sm">No documents submitted yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {org.kyc_docs.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-surface border border-border rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{doc.type.replace(/_/g, " ")}</p>
                        <p className="text-xs text-muted">Uploaded {formatDate(doc.uploaded_at)}</p>
                      </div>
                    </div>
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline">
                        <Eye className="w-3.5 h-3.5" /> View
                      </Button>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "events" && (
          <div className="space-y-2">
            {org.events.length === 0 ? (
              <p className="text-center py-10 text-muted text-sm">No events yet</p>
            ) : org.events.map(ev => (
              <div key={ev.id} className="flex items-center justify-between p-3 bg-surface border border-border rounded-lg text-sm">
                <div>
                  <p className="font-medium">{ev.title}</p>
                  <p className="text-xs text-muted">{formatDate(ev.starts_at)} · {ev.tickets_sold} tickets sold</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{formatCurrency(ev.gross)}</p>
                  <span className={cn("text-xs", ev.status === "PUBLISHED" ? "text-success" : "text-muted")}>{ev.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "payouts" && (
          <div className="space-y-2">
            {org.payouts.length === 0 ? (
              <p className="text-center py-10 text-muted text-sm">No payouts yet</p>
            ) : org.payouts.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-surface border border-border rounded-lg text-sm">
                <div>
                  <p className="font-bold">{formatCurrency(p.amount)}</p>
                  <p className="text-xs text-muted">{formatDate(p.created_at)}</p>
                </div>
                <span className={cn("text-xs px-2 py-0.5 rounded-full",
                  p.status === "PAID" ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === "fee" && (
          <FeeOverrideRow override={org.platform_fee_override ?? null} onSave={saveFeeOverride} />
        )}
      </div>

      <AnimatePresence>
        {confirm && (
          <ConfirmModal title={confirm.title} body={confirm.body} variant={confirm.variant}
            loading={actLoad}
            onConfirm={() => doAction(confirm.action, confirm.notes ? { reason: confirm.notes } : undefined)}
            onClose={() => setConfirm(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminOrganizersPage() {
  const [orgs,        setOrgs]        = useState<Organizer[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [statusFilter,setStatusFilter]= useState<OrgStatus | "ALL">("ALL");
  const [kycFilter,   setKycFilter]   = useState<string>("ALL");
  const [tierFilter,  setTierFilter]  = useState<OrgTier | "ALL">("ALL");
  const [sortDir,     setSortDir]     = useState<"asc" | "desc">("desc");
  const [page,        setPage]        = useState(1);
  const [total,       setTotal]       = useState(0);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const PAGE_SIZE = 20;

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE), ordering: `-created_at` });
    if (search.trim())            qs.set("search",     search.trim());
    if (statusFilter !== "ALL")   qs.set("status",     statusFilter);
    if (kycFilter    !== "ALL")   qs.set("kyc_status", kycFilter);
    if (tierFilter   !== "ALL")   qs.set("tier",       tierFilter);

    const res = await api.get<{ results: Organizer[] }>(`/admin/organizers/?${qs}`);
    if (res.success && res.data) { 
      setOrgs(res.data.results); 
      setTotal(res.meta?.count || 0); 
    }
    setLoading(false);
  }, [search, statusFilter, kycFilter, tierFilter]);

  useEffect(() => { load(1); setPage(1); }, [load]);

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { load(1); setPage(1); }, 400);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Organizer Management</h1>
          <p className="text-muted text-sm">{total.toLocaleString()} organizers</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => load(page)}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input value={search} onChange={e => handleSearch(e.target.value)}
            placeholder="Search name, email…"
            className="w-full bg-surface-2 border border-border rounded-lg pl-9 pr-4 h-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
          className="bg-surface-2 border border-border rounded-lg px-3 h-9 text-sm focus:outline-none">
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
        <select value={kycFilter} onChange={e => setKycFilter(e.target.value)}
          className="bg-surface-2 border border-border rounded-lg px-3 h-9 text-sm focus:outline-none">
          <option value="ALL">All KYC</option>
          <option value="PENDING_REVIEW">KYC under review</option>
          <option value="APPROVED">KYC approved</option>
          <option value="NOT_SUBMITTED">No KYC</option>
          <option value="REJECTED">KYC rejected</option>
        </select>
        <select value={tierFilter} onChange={e => setTierFilter(e.target.value as any)}
          className="bg-surface-2 border border-border rounded-lg px-3 h-9 text-sm focus:outline-none">
          <option value="ALL">All tiers</option>
          <option value="BASIC">Basic</option>
          <option value="VERIFIED">Verified</option>
          <option value="PREMIUM">Premium</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Organizer</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Status / Tier</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">KYC</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Events</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Gross</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Fee Override</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Joined</th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}><td colSpan={8} className="px-4 py-3">
                    <div className="h-8 bg-surface rounded-lg animate-pulse" />
                  </td></tr>
                ))
              ) : orgs.length === 0 ? (
                <tr><td colSpan={8} className="py-14 text-center text-muted text-sm">
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />No organizers found
                </td></tr>
              ) : orgs.map(org => {
                const sCfg = STATUS_CFG[org.status];
                const tCfg = TIER_CFG[org.tier];
                const kCfg = KYC_CFG[org.kyc_status] || KYC_CFG.NOT_SUBMITTED;
                return (
                  <tr key={org.id} className="hover:bg-surface/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedId(org.id)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {org.logo_url
                            ? <img src={org.logo_url} alt="" className="w-full h-full rounded-full object-cover" />
                            : org.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[160px]">{org.display_name}</p>
                          <p className="text-xs text-muted truncate max-w-[160px]">{org.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium w-fit flex items-center gap-1", sCfg.cls)}>
                          <sCfg.icon className="w-3 h-3" />{sCfg.label}
                        </span>
                        <span className={cn("text-xs px-2 py-0.5 rounded border font-medium w-fit flex items-center gap-1", tCfg.cls)}>
                          <tCfg.icon className="w-3 h-3" />{tCfg.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs font-medium", kCfg.cls)}>{kCfg.label}</span>
                    </td>
                    <td className="px-4 py-3 text-muted">{org.total_events}</td>
                    <td className="px-4 py-3 font-medium">{formatCurrency(org.total_gross)}</td>
                    <td className="px-4 py-3">
                      {org.platform_fee_override
                        ? <span className="text-xs text-primary">KES {org.platform_fee_override.flat} + {org.platform_fee_override.pct}%</span>
                        : <span className="text-xs text-muted">Default</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{formatDate(org.created_at)}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setSelectedId(org.id)}
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
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
            <OrgDrawer orgId={selectedId} onClose={() => setSelectedId(null)} onUpdated={() => load(page)} />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
