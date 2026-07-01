"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, Wallet, ReceiptText, Settings2, Download,
  X, Save, AlertCircle, ChevronDown, FileText, Info,
  PiggyBank, Percent,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import jsPDF from "jspdf";

// ── Types ─────────────────────────────────────────────────────────────────────

interface KPI { label: string; value: string; sub?: string; icon: React.ElementType; color: string; }

interface FeeConfig {
  default_flat_fee:   number;
  default_pct_fee:    number;
  fee_absorbed_by:    "BUYER" | "ORGANIZER";
}

interface EventFeeOverride {
  event_id:   string;
  event_title:string;
  flat_fee:   number;
  pct_fee:    number;
  absorbed_by:"BUYER" | "ORGANIZER";
}

interface LedgerRow {
  event_id:    string;
  event_title: string;
  event_date:  string;
  gross:       string;
  platform_fee:string;
  net:         string;
  refunds:     string;
  payable:     string;
  status:      "PENDING" | "PAID" | "PROCESSING";
}

interface RevenueSummary {
  total_gross:    string;
  total_fees:     string;
  total_net:      string;
  total_refunds:  string;
  total_payable:  string;
  ledger:         LedgerRow[];
  fee_config:     FeeConfig;
  fee_overrides:  EventFeeOverride[];
}

const ABSORBED_OPTIONS: { value: "BUYER" | "ORGANIZER"; label: string; desc: string }[] = [
  { value: "BUYER",     label: "Buyer pays fee",     desc: "Fee added on top of ticket price at checkout" },
  { value: "ORGANIZER", label: "Organizer absorbs",  desc: "Fee deducted from your payout, buyer sees full price" },
];

const STATUS_STYLES: Record<string, string> = {
  PENDING:    "bg-warning/10 text-warning",
  PROCESSING: "bg-primary/10 text-primary",
  PAID:       "bg-success/10 text-success",
};

// ── Invoice PDF ───────────────────────────────────────────────────────────────

function generateInvoice(row: LedgerRow) {
  const doc = new jsPDF();
  const now = new Date();
  doc.setFontSize(16); doc.text("TAX INVOICE", 14, 18);
  doc.setFontSize(9); doc.setTextColor(130);
  doc.text("EliteTicketPass Ltd  |  P.O Box 00100, Nairobi  |  VAT: P051234567M", 14, 25);
  doc.setTextColor(0);
  doc.setFontSize(10);
  const lines = [
    "",
    `Invoice Date:   ${formatDate(now.toISOString())}`,
    `Event:          ${row.event_title}`,
    `Event Date:     ${formatDate(row.event_date)}`,
    "",
    "─────────────────────────────────────────────",
    `Gross Sales:          KES ${Number(row.gross).toLocaleString()}`,
    `Refunds Issued:      -KES ${Number(row.refunds).toLocaleString()}`,
    `Platform Fee (excl. VAT): KES ${(Number(row.platform_fee) / 1.16).toFixed(2)}`,
    `VAT (16%):             KES ${(Number(row.platform_fee) - Number(row.platform_fee) / 1.16).toFixed(2)}`,
    `Total Platform Fee:   KES ${Number(row.platform_fee).toLocaleString()}`,
    "─────────────────────────────────────────────",
    `Net Payable to Organizer: KES ${Number(row.payable).toLocaleString()}`,
    "",
    `Status: ${row.status}`,
  ];
  lines.forEach((l, i) => doc.text(l, 14, 35 + i * 7));
  doc.save(`invoice-${row.event_title.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}

// ── Fee config modal ──────────────────────────────────────────────────────────

function FeeConfigModal({ config, onSave, onClose }: {
  config: FeeConfig; onSave: (c: FeeConfig) => void; onClose: () => void;
}) {
  const [flat,     setFlat]    = useState(String(config.default_flat_fee));
  const [pct,      setPct]     = useState(String(config.default_pct_fee));
  const [absorbed, setAbsorbed]= useState<"BUYER"|"ORGANIZER">(config.fee_absorbed_by);
  const [saving,   setSaving]  = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const res = await api.post("/organizer/fee-config/", {
      default_flat_fee: Number(flat), default_pct_fee: Number(pct), fee_absorbed_by: absorbed,
    });
    if (res.success) {
      toast.success("Fee settings saved");
      onSave({ default_flat_fee: Number(flat), default_pct_fee: Number(pct), fee_absorbed_by: absorbed });
      onClose();
    } else toast.error(res.error || "Failed to save");
    setSaving(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-surface-2 border border-border rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2"><Settings2 className="w-4 h-4 text-primary" /> Platform Fee Settings</h2>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-5">
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted flex items-start gap-2">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            These are your default settings. You can override per-event from the event's settings.
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Flat fee per ticket (KES)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">KES</span>
                <input type="number" value={flat} onChange={e => setFlat(e.target.value)} min={0}
                  className="w-full bg-surface border border-border rounded-sm pl-10 pr-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Percentage (%)</label>
              <div className="relative">
                <input type="number" value={pct} onChange={e => setPct(e.target.value)} min={0} max={100}
                  className="w-full bg-surface border border-border rounded-sm px-3 pr-8 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted mb-2">Fee absorbed by</p>
            <div className="space-y-2">
              {ABSORBED_OPTIONS.map(opt => (
                <label key={opt.value} className="cursor-pointer flex items-start gap-3">
                  <div className={cn("mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors",
                    absorbed === opt.value ? "border-primary" : "border-border")}
                    onClick={() => setAbsorbed(opt.value)}>
                    {absorbed === opt.value && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="bg-surface border border-border rounded-lg p-3 text-sm space-y-1">
            <p className="text-xs text-muted font-medium mb-2">Preview — KES 1,000 ticket</p>
            {absorbed === "BUYER" ? (
              <>
                <div className="flex justify-between"><span className="text-muted">Ticket price</span><span>KES 1,000</span></div>
                <div className="flex justify-between text-primary"><span>+ Fee</span><span>KES {(Number(flat) + 1000 * Number(pct) / 100).toLocaleString()}</span></div>
                <div className="flex justify-between font-bold border-t border-border pt-1 mt-1"><span>Buyer pays</span><span>KES {(1000 + Number(flat) + 1000 * Number(pct) / 100).toLocaleString()}</span></div>
                <div className="flex justify-between text-success"><span>You receive</span><span>KES 1,000</span></div>
              </>
            ) : (
              <>
                <div className="flex justify-between"><span className="text-muted">Buyer pays</span><span>KES 1,000</span></div>
                <div className="flex justify-between text-error"><span>− Fee</span><span>KES {(Number(flat) + 1000 * Number(pct) / 100).toLocaleString()}</span></div>
                <div className="flex justify-between font-bold border-t border-border pt-1 mt-1 text-success"><span>You receive</span><span>KES {(1000 - Number(flat) - 1000 * Number(pct) / 100).toLocaleString()}</span></div>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-border">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button loading={saving} onClick={handleSave} className="flex-1"><Save className="w-4 h-4" /> Save Settings</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RevenuePage() {
  const [data,        setData]       = useState<RevenueSummary | null>(null);
  const [loading,     setLoading]    = useState(true);
  const [statusFilter,setStatusFilter] = useState<string>("ALL");
  const [showFeeModal,setShowFeeModal] = useState(false);
  const [expandedRow, setExpandedRow]  = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<RevenueSummary>("/organizer/revenue/");
    if (res.success && res.data) setData(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const exportCSV = () => {
    if (!data) return;
    const header = ["Event","Event Date","Gross (KES)","Platform Fee (KES)","Refunds (KES)","Net (KES)","Payable (KES)","Status"];
    const rows = data.ledger.map(r => [
      `"${r.event_title}"`, formatDate(r.event_date),
      Number(r.gross).toFixed(2), Number(r.platform_fee).toFixed(2),
      Number(r.refunds).toFixed(2), Number(r.net).toFixed(2),
      Number(r.payable).toFixed(2), r.status,
    ]);
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `revenue-ledger-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };

  const filtered = data?.ledger.filter(r => statusFilter === "ALL" || r.status === statusFilter) ?? [];

  const KPIs: KPI[] = data ? [
    { label: "Total Gross",    value: `KES ${Number(data.total_gross).toLocaleString()}`,    icon: TrendingUp,   color: "text-primary" },
    { label: "Platform Fees",  value: `KES ${Number(data.total_fees).toLocaleString()}`,     icon: Percent,      color: "text-warning" },
    { label: "Total Refunds",  value: `KES ${Number(data.total_refunds).toLocaleString()}`,  icon: AlertCircle,  color: "text-error" },
    { label: "Net Payable",    value: `KES ${Number(data.total_payable).toLocaleString()}`,  icon: PiggyBank,    color: "text-success" },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Revenue & Fees</h1>
          <p className="text-sm text-muted mt-0.5">Revenue split ledger, fee configuration, and tax invoices</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data}>
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button size="sm" onClick={() => setShowFeeModal(true)} disabled={!data}>
            <Settings2 className="w-4 h-4" /> Fee Settings
          </Button>
        </div>
      </div>

      {/* KPI row */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-surface-2 border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {KPIs.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-surface-2 border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn("w-4 h-4", color)} />
                <span className="text-xs text-muted">{label}</span>
              </div>
              <p className={cn("text-xl font-bold", color)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Fee config summary */}
      {data?.fee_config && (
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2"><Settings2 className="w-4 h-4 text-primary" /> Current Fee Structure</h2>
            <button onClick={() => setShowFeeModal(true)} className="text-xs text-primary hover:underline">Edit</button>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted mb-0.5">Flat fee per ticket</p>
              <p className="font-bold">KES {data.fee_config.default_flat_fee.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted mb-0.5">Percentage</p>
              <p className="font-bold">{data.fee_config.default_pct_fee}%</p>
            </div>
            <div>
              <p className="text-xs text-muted mb-0.5">Absorbed by</p>
              <span className={cn("inline-block text-xs px-2 py-0.5 rounded-full font-medium",
                data.fee_config.fee_absorbed_by === "BUYER" ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning")}>
                {data.fee_config.fee_absorbed_by === "BUYER" ? "Buyer" : "Organizer"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Ledger table */}
      <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border gap-3 flex-wrap">
          <h2 className="font-semibold flex items-center gap-2"><ReceiptText className="w-4 h-4 text-primary" /> Revenue Ledger</h2>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-surface border border-border rounded-sm px-3 h-8 text-xs focus:outline-none">
            <option value="ALL">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="PROCESSING">Processing</option>
            <option value="PAID">Paid</option>
          </select>
        </div>

        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-surface rounded-lg animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14">
            <Wallet className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-muted text-sm">No ledger entries found.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(row => (
              <div key={row.event_id}>
                <div className="flex items-center gap-4 px-5 py-4 hover:bg-surface/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{row.event_title}</p>
                    <p className="text-xs text-muted">{formatDate(row.event_date)}</p>
                  </div>
                  <div className="hidden sm:grid grid-cols-4 gap-4 text-right text-sm">
                    <div>
                      <p className="text-xs text-muted">Gross</p>
                      <p className="font-medium">KES {Number(row.gross).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Fee</p>
                      <p className="text-warning">KES {Number(row.platform_fee).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Net Payable</p>
                      <p className="font-bold text-success">KES {Number(row.payable).toLocaleString()}</p>
                    </div>
                    <div>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_STYLES[row.status] || "bg-surface text-muted")}>
                        {row.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => generateInvoice(row)} title="Download tax invoice"
                      className="p-1.5 text-muted hover:text-foreground border border-border rounded-sm transition-colors">
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setExpandedRow(r => r === row.event_id ? null : row.event_id)}
                      className="p-1.5 text-muted hover:text-foreground border border-border rounded-sm transition-colors">
                      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expandedRow === row.event_id && "rotate-180")} />
                    </button>
                  </div>
                </div>

                {/* Mobile + expanded breakdown */}
                <AnimatePresence>
                  {expandedRow === row.event_id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-t border-border bg-surface/50">
                      <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        {[
                          { label: "Gross",        value: `KES ${Number(row.gross).toLocaleString()}`,        cls: "" },
                          { label: "Platform Fee", value: `KES ${Number(row.platform_fee).toLocaleString()}`, cls: "text-warning" },
                          { label: "Refunds",      value: `KES ${Number(row.refunds).toLocaleString()}`,      cls: "text-error" },
                          { label: "Net Payable",  value: `KES ${Number(row.payable).toLocaleString()}`,      cls: "text-success font-bold" },
                        ].map(({ label, value, cls }) => (
                          <div key={label} className="bg-surface border border-border rounded-lg p-3">
                            <p className="text-xs text-muted mb-0.5">{label}</p>
                            <p className={cn("font-medium", cls)}>{value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="px-5 pb-4 flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => generateInvoice(row)}>
                          <FileText className="w-3.5 h-3.5" /> Tax Invoice (VAT)
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showFeeModal && data?.fee_config && (
          <FeeConfigModal
            config={data.fee_config}
            onSave={c => setData(d => d ? { ...d, fee_config: c } : d)}
            onClose={() => setShowFeeModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
