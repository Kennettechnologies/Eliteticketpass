"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, ArrowDownLeft, Wallet, Calendar, Clock,
  CheckCircle2, AlertCircle, XCircle, RefreshCw,
  Download, FileText, Plus, X, ChevronDown, Banknote,
  Phone, Building2, Settings2,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import jsPDF from "jspdf";

// ── Types ─────────────────────────────────────────────────────────────────────

type PayoutStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
type PayoutMethod = "MPESA" | "BANK";
type ScheduleType = "INSTANT" | "POST_EVENT" | "ON_DEMAND";

interface PayoutSummary {
  total_earned: string;
  platform_fees: string;
  net_payable: string;
  pending_payout: string;
  total_paid_out: string;
}

interface Payout {
  id: string;
  amount: string;
  method: PayoutMethod;
  status: PayoutStatus;
  reference: string;
  event_title: string;
  created_at: string;
  completed_at: string | null;
  failure_reason: string | null;
  invoice_url: string | null;
}

interface PayoutSettings {
  schedule: ScheduleType;
  auto_payout_days_after: number;
  preferred_method: PayoutMethod;
}

const STATUS_CONFIG: Record<PayoutStatus, { label: string; icon: React.ElementType; cls: string }> = {
  QUEUED:     { label: "Queued",     icon: Clock,         cls: "bg-warning/10 text-warning"  },
  PROCESSING: { label: "Processing", icon: RefreshCw,     cls: "bg-primary/10 text-primary"  },
  COMPLETED:  { label: "Completed",  icon: CheckCircle2,  cls: "bg-success/10 text-success"  },
  FAILED:     { label: "Failed",     icon: XCircle,       cls: "bg-error/10 text-error"      },
};

const INPUT  = "w-full bg-surface border border-border rounded-sm px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted";
const LABEL  = "block text-xs font-medium mb-1 text-muted";

// ── Tax invoice PDF ───────────────────────────────────────────────────────────

function generateInvoice(payout: Payout) {
  const doc = new jsPDF();
  doc.setFontSize(16); doc.text("TAX INVOICE", 14, 18);
  doc.setFontSize(10);
  const lines = [
    `Reference: ${payout.reference}`,
    `Date: ${formatDate(payout.created_at)}`,
    `Event: ${payout.event_title}`,
    "",
    `Gross Amount: KES ${Number(payout.amount).toLocaleString()}`,
    `Method: ${payout.method === "MPESA" ? "M-Pesa" : "Bank Transfer"}`,
    `Status: ${payout.status}`,
    payout.completed_at ? `Completed: ${formatDate(payout.completed_at)}` : "",
  ];
  lines.forEach((l, i) => doc.text(l, 14, 30 + i * 8));
  doc.save(`invoice-${payout.reference}.pdf`);
}

// ── Request Payout Modal ───────────────────────────────────────────────────────

function RequestPayoutModal({
  netPayable, onDone, onClose,
}: { netPayable: string; onDone: () => void; onClose: () => void }) {
  const [method,  setMethod]  = useState<PayoutMethod>("MPESA");
  const [amount,  setAmount]  = useState(netPayable);
  const [phone,   setPhone]   = useState("");
  const [accountName,  setAccountName]  = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!amount || Number(amount) <= 0) { toast.error("Invalid amount"); return; }
    if (method === "MPESA" && !phone.trim()) { toast.error("M-Pesa phone required"); return; }
    if (method === "BANK" && (!accountNumber.trim() || !bankName.trim())) { toast.error("Bank details required"); return; }
    setSubmitting(true);
    const res = await api.post("/organizer/payouts/request/", {
      amount, method, phone: method === "MPESA" ? phone : undefined,
      account_name: method === "BANK" ? accountName : undefined,
      account_number: method === "BANK" ? accountNumber : undefined,
      bank_name: method === "BANK" ? bankName : undefined,
    });
    if (res.success) { toast.success("Payout request submitted!"); onDone(); onClose(); }
    else toast.error(res.error || "Request failed");
    setSubmitting(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-surface-2 border border-border rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold">Request Payout</h2>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-foreground rounded-sm transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={LABEL}>Payout method</label>
            <div className="grid grid-cols-2 gap-2">
              {([["MPESA", "📱 M-Pesa"], ["BANK", "🏦 Bank Transfer"]] as const).map(([v, l]) => (
                <label key={v} className="cursor-pointer">
                  <input type="radio" value={v} checked={method === v} onChange={() => setMethod(v)} className="sr-only" />
                  <div className={cn("p-3 rounded-lg border text-center text-sm font-medium transition-all",
                    method === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/30")}>
                    {l}
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className={LABEL}>Amount (KES)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              className={INPUT} max={netPayable} placeholder="Enter amount" />
            <p className="text-xs text-muted mt-1">Available: {formatCurrency(netPayable)}</p>
          </div>
          {method === "MPESA" ? (
            <div>
              <label className={LABEL}>M-Pesa phone number *</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} className={INPUT} placeholder="+2547XXXXXXXX" />
            </div>
          ) : (
            <>
              <div>
                <label className={LABEL}>Account holder name *</label>
                <input value={accountName} onChange={e => setAccountName(e.target.value)} className={INPUT} placeholder="Jane Doe" />
              </div>
              <div>
                <label className={LABEL}>Account number *</label>
                <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className={INPUT} placeholder="0123456789" />
              </div>
              <div>
                <label className={LABEL}>Bank name *</label>
                <input value={bankName} onChange={e => setBankName(e.target.value)} className={INPUT} placeholder="Equity Bank" />
              </div>
            </>
          )}
        </div>
        <div className="flex gap-3 p-5 border-t border-border">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button loading={submitting} onClick={submit} className="flex-1">Submit Request</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Payout Settings Modal ─────────────────────────────────────────────────────

function SettingsModal({ initial, onDone, onClose }: {
  initial: PayoutSettings; onDone: () => void; onClose: () => void;
}) {
  const [settings, setSettings] = useState(initial);
  const [saving,   setSaving]   = useState(false);
  const patch = (p: Partial<PayoutSettings>) => setSettings(s => ({ ...s, ...p }));

  const save = async () => {
    setSaving(true);
    const res = await api.patch("/organizer/payout-settings/", settings);
    if (res.success) { toast.success("Settings saved"); onDone(); onClose(); }
    else toast.error(res.error || "Save failed");
    setSaving(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-surface-2 border border-border rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold">Payout Settings</h2>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-foreground rounded-sm transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <label className={LABEL}>Payout schedule</label>
            <div className="space-y-2">
              {([
                ["INSTANT",    "⚡ Instant",    "Paid out immediately after each ticket purchase"],
                ["POST_EVENT", "📅 Post-Event",  "Paid out automatically N days after event ends"],
                ["ON_DEMAND",  "🖐 On-Demand",   "Manually request payouts whenever you want"],
              ] as const).map(([v, l, desc]) => (
                <label key={v} className="cursor-pointer flex items-start gap-3">
                  <input type="radio" value={v} checked={settings.schedule === v} onChange={() => patch({ schedule: v })} className="accent-primary mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{l}</p>
                    <p className="text-xs text-muted">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {settings.schedule === "POST_EVENT" && (
            <div>
              <label className={LABEL}>Days after event to auto-pay</label>
              <input type="number" value={settings.auto_payout_days_after}
                onChange={e => patch({ auto_payout_days_after: Number(e.target.value) })}
                className={INPUT} min={0} max={30} />
            </div>
          )}
          <div>
            <label className={LABEL}>Preferred payout method</label>
            <select value={settings.preferred_method} onChange={e => patch({ preferred_method: e.target.value as PayoutMethod })}
              className={INPUT}>
              <option value="MPESA">M-Pesa</option>
              <option value="BANK">Bank Transfer</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-border">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button loading={saving} onClick={save} className="flex-1">Save Settings</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PayoutsPage() {
  const [summary,  setSummary]  = useState<PayoutSummary | null>(null);
  const [payouts,  setPayouts]  = useState<Payout[]>([]);
  const [settings, setSettings] = useState<PayoutSettings>({ schedule: "ON_DEMAND", auto_payout_days_after: 3, preferred_method: "MPESA" });
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState<"request" | "settings" | null>(null);
  const [statusFilter, setStatusFilter] = useState<PayoutStatus | "">("");

  const load = useCallback(async () => {
    setLoading(true);
    const [sumRes, payRes, setRes] = await Promise.all([
      api.get<PayoutSummary>("/organizer/payouts/summary/"),
      api.get<{ results: Payout[] }>("/organizer/payouts/"),
      api.get<PayoutSettings>("/organizer/payout-settings/"),
    ]);
    if (sumRes.success && sumRes.data) setSummary(sumRes.data);
    if (payRes.success) setPayouts((payRes.data as any)?.results ?? payRes.data ?? []);
    if (setRes.success && setRes.data) setSettings(setRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = statusFilter ? payouts.filter(p => p.status === statusFilter) : payouts;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold">Payouts</h1>
          <p className="text-muted text-sm mt-1">
            Schedule: <span className="font-medium">{settings.schedule === "INSTANT" ? "Instant" : settings.schedule === "POST_EVENT" ? `Post-event (${settings.auto_payout_days_after}d)` : "On-demand"}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setModal("settings")}><Settings2 className="w-4 h-4" /> Settings</Button>
          <Button onClick={() => setModal("request")} disabled={!summary || Number(summary.net_payable) <= 0}>
            <Banknote className="w-4 h-4" /> Request Payout
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 bg-surface-2 border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[
            { label: "Total Earned",    value: formatCurrency(summary.total_earned),   icon: TrendingUp,    color: "text-primary" },
            { label: "Platform Fees",   value: formatCurrency(summary.platform_fees),  icon: ArrowDownLeft, color: "text-error"   },
            { label: "Net Payable",     value: formatCurrency(summary.net_payable),     icon: Wallet,        color: "text-success" },
            { label: "Pending Payout",  value: formatCurrency(summary.pending_payout), icon: Clock,         color: "text-warning" },
            { label: "Total Paid Out",  value: formatCurrency(summary.total_paid_out), icon: CheckCircle2,  color: "text-muted"   },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-surface-2 border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted">{label}</span>
                <Icon className={cn("w-4 h-4", color)} />
              </div>
              <p className={cn("text-xl font-bold font-display", color)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Payout history */}
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <h2 className="font-semibold">Payout History</h2>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
          className="bg-surface border border-border rounded-sm px-3 h-9 text-sm focus:outline-none">
          <option value="">All Statuses</option>
          {(["QUEUED","PROCESSING","COMPLETED","FAILED"] as PayoutStatus[]).map(s => (
            <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-surface-2 border border-border rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-surface-2 border border-border rounded-xl">
          <Banknote className="w-10 h-10 text-muted mx-auto mb-3" />
          <h3 className="font-semibold mb-1">No payouts yet</h3>
          <p className="text-muted text-sm">Payouts will appear here once you request or receive them.</p>
        </div>
      ) : (
        <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted">Reference</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted">Event</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted hidden md:table-cell">Method</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted hidden lg:table-cell">Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(p => {
                  const cfg = STATUS_CONFIG[p.status];
                  const Icon = cfg.icon;
                  return (
                    <tr key={p.id} className="hover:bg-surface/40 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs">{p.reference}</td>
                      <td className="px-4 py-3 max-w-[160px]"><span className="truncate block text-sm">{p.event_title}</span></td>
                      <td className="px-4 py-3 font-semibold">{formatCurrency(p.amount)}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="flex items-center gap-1.5 text-xs">
                          {p.method === "MPESA" ? <Phone className="w-3.5 h-3.5 text-muted" /> : <Building2 className="w-3.5 h-3.5 text-muted" />}
                          {p.method === "MPESA" ? "M-Pesa" : "Bank"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium w-fit", cfg.cls)}>
                          <Icon className="w-3 h-3" />{cfg.label}
                        </span>
                        {p.failure_reason && <p className="text-xs text-error mt-0.5">{p.failure_reason}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted hidden lg:table-cell whitespace-nowrap">
                        {formatDate(p.created_at)}
                        {p.completed_at && <p className="text-success">{formatDate(p.completed_at)}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => generateInvoice(p)}
                          className="p-1.5 text-muted hover:text-primary hover:bg-primary/5 rounded-sm transition-colors" title="Download invoice">
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {modal === "request"  && summary && (
          <RequestPayoutModal netPayable={summary.net_payable} onDone={load} onClose={() => setModal(null)} />
        )}
        {modal === "settings" && (
          <SettingsModal initial={settings} onDone={load} onClose={() => setModal(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
