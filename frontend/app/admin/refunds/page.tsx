"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatDate, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

type RefundStatus = "PENDING" | "APPROVED" | "REJECTED" | "PROCESSED" | "FAILED";

interface Refund {
  id: string;
  order_number: string;
  amount: string;
  reason: string;
  status: RefundStatus;
  created_at: string;
  buyer_name?: string;
  buyer_email?: string;
  buyer_phone?: string;
  subtotal?: string;
  platform_fee?: string;
  total_paid?: string;
  mpesa_phone?: string;
  mpesa_receipt?: string;
  gateway_refund_id?: string;
}

interface RefundKPIs {
  pending_count: number;
  pending_amount: string;
  approved_count: number;
  processed_amount: string;
  failed_count: number;
}

const STATUS_CFG: Record<RefundStatus, { cls: string; label: string }> = {
  PENDING:    { cls: "bg-warning/10 text-warning",  label: "Pending" },
  APPROVED:   { cls: "bg-primary/10 text-primary",  label: "Approved" },
  REJECTED:   { cls: "bg-error/10 text-error",      label: "Rejected" },
  PROCESSED:  { cls: "bg-success/10 text-success",  label: "Processed" },
  FAILED:     { cls: "bg-error/10 text-error",      label: "Failed" },
};

function ConfirmModal({ title, body, variant = "warning", note, setNote, onConfirm, onClose, loading, amountOverride, setAmountOverride }: {
  title: string; body: string; variant?: "error" | "warning";
  note?: string; setNote?: (v: string) => void;
  amountOverride?: string; setAmountOverride?: (v: string) => void;
  onConfirm: () => void; onClose: () => void; loading: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-surface-2 border border-border rounded-xl w-full max-w-sm p-6">
        <div className={cn("w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4",
          variant === "error" ? "bg-error/10" : "bg-warning/10")}>
          <AlertTriangle className={cn("w-6 h-6", variant === "error" ? "text-error" : "text-warning")} />
        </div>
        <h3 className="font-semibold text-center mb-2">{title}</h3>
        <p className="text-sm text-muted text-center mb-4">{body}</p>
        
        {setAmountOverride !== undefined && (
          <div className="mb-4 space-y-1">
            <label className="text-xs text-muted">Refund Amount (KES)</label>
            <input type="number" step="0.01" value={amountOverride} onChange={e => setAmountOverride(e.target.value)}
              className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm focus:outline-none" />
          </div>
        )}

        {setNote !== undefined && (
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            placeholder="Note / reason (optional)"
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

export default function AdminRefundsPage() {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RefundStatus | "ALL">("ALL");
  const [confirm, setConfirm] = useState<null | { action: string; id: string; title: string; body: string; variant: "error" | "warning" }>(null);
  const [note, setNote] = useState("");
  const [actLoad, setActLoad] = useState(false);

  const [kpis, setKpis] = useState<RefundKPIs | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDets, setShowDets] = useState<Refund | null>(null);
  const [amtOverride, setAmtOverride] = useState("");

  const loadKpis = useCallback(async () => {
    const qs = new URLSearchParams();
    if (dateFrom) qs.set("from", dateFrom);
    if (dateTo) qs.set("to", dateTo);
    const res = await api.get<RefundKPIs>(`/admin/refunds/kpis/?${qs}`);
    if (res.success && res.data) setKpis(res.data);
  }, [dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: "50" });
    if (filter !== "ALL") qs.set("status", filter);
    if (dateFrom) qs.set("from", dateFrom);
    if (dateTo) qs.set("to", dateTo);
    const res = await api.get<{ results: Refund[] }>(`/admin/refunds/?${qs}`);
    if (res.success && res.data) setRefunds((res.data as any).results || []);
    setLoading(false);
  }, [filter, dateFrom, dateTo]);

  useEffect(() => { load(); loadKpis(); }, [load, loadKpis]);

  const doAction = async (action: string, id: string) => {
    setActLoad(true);
    const res = await api.post(`/admin/refunds/${id}/${action}/`, { note, amount: amtOverride });
    if (res.success) {
      toast.success(`Refund ${action}d successfully`);
      load(); loadKpis();
    } else toast.error(res.error || "Action failed");
    setActLoad(false); setConfirm(null); setNote(""); setAmtOverride("");
  };

  const exportCSV = () => {
    const header = ["Order","Amount","Status","Gateway Ref","Created"];
    const rows   = refunds.map(r => [r.order_number, r.amount, r.status, r.gateway_refund_id || "", formatDate(r.created_at)]);
    const csv    = [header, ...rows].map(r => r.join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download = `refunds-export.csv`; a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <RefreshCw className="w-6 h-6 text-primary" /> Refund Management
          </h1>
          <p className="text-muted text-sm mt-1">Review and process refund requests from users.</p>
        </div>
        <div className="flex gap-2 items-center bg-surface-2 p-1.5 rounded-lg border border-border">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-background text-sm rounded px-2 py-1 border border-border outline-none" title="From Date" />
          <span className="text-muted text-sm">-</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-background text-sm rounded px-2 py-1 border border-border outline-none" title="To Date" />
        </div>
      </div>

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surface-2 border border-border p-4 rounded-xl">
            <h3 className="text-xs text-muted font-medium mb-1 uppercase tracking-wider">Pending Approvals</h3>
            <p className="text-2xl font-bold font-mono">{kpis.pending_count}</p>
            <p className="text-xs text-warning mt-1">{formatCurrency(kpis.pending_amount)}</p>
          </div>
          <div className="bg-surface-2 border border-border p-4 rounded-xl">
            <h3 className="text-xs text-muted font-medium mb-1 uppercase tracking-wider">Awaiting Process</h3>
            <p className="text-2xl font-bold font-mono">{kpis.approved_count}</p>
            <p className="text-xs text-muted mt-1">Needs gateway action</p>
          </div>
          <div className="bg-surface-2 border border-border p-4 rounded-xl">
            <h3 className="text-xs text-muted font-medium mb-1 uppercase tracking-wider">Disbursed Refunds</h3>
            <p className="text-2xl font-bold font-mono text-success">{formatCurrency(kpis.processed_amount)}</p>
            <p className="text-xs text-muted mt-1">Total refunded</p>
          </div>
          <div className="bg-surface-2 border border-border p-4 rounded-xl">
            <h3 className="text-xs text-muted font-medium mb-1 uppercase tracking-wider">Failed Reversals</h3>
            <p className="text-2xl font-bold font-mono">{kpis.failed_count}</p>
            <p className="text-xs text-error mt-1">Requires attention</p>
          </div>
        </div>
      )}

      <div className="flex justify-between flex-wrap gap-2 items-center">
        <div className="flex gap-1 flex-wrap">
          {(["ALL", "PENDING", "APPROVED", "PROCESSED", "REJECTED", "FAILED"] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                filter === s ? "bg-primary text-background border-primary" : "border-border text-muted hover:text-foreground")}>
              {s}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={exportCSV}>CSV Export</Button>
      </div>

      <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Order #</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Amount</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Reason</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Status</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Date</th>
                <th className="px-4 py-3 text-xs text-muted font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-8 bg-surface rounded animate-pulse" /></td></tr>
              )) : refunds.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-muted text-sm">No refund requests found</td></tr>
              ) : refunds.map(r => {
                const sCfg = STATUS_CFG[r.status];
                return (
                  <tr key={r.id} className="hover:bg-surface/50">
                    <td className="px-4 py-3 font-mono text-xs">{r.order_number}</td>
                    <td className="px-4 py-3 font-bold">{formatCurrency(r.amount)}</td>
                    <td className="px-4 py-3 max-w-[200px] truncate" title={r.reason}>{r.reason}</td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", sCfg.cls)}>{sCfg.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={() => setShowDets(r)} className="p-1.5 text-primary hover:bg-primary/10 rounded-sm transition-colors" title="View details">
                          <AlertTriangle className="w-4 h-4 opacity-0 absolute" />
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
                        </button>
                        {r.status === "PENDING" && (
                          <>
                            <button onClick={() => { setAmtOverride(r.amount); setConfirm({ action: "approve", id: r.id,
                              title: "Approve refund?", body: "This will approve the refund. You can deduct fees below.", variant: "warning" }); }}
                              className="p-1.5 text-success hover:bg-success/10 rounded-sm transition-colors" title="Approve">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => setConfirm({ action: "reject", id: r.id,
                              title: "Reject refund?", body: "This will reject the refund request.", variant: "error" })}
                              className="p-1.5 text-error hover:bg-error/10 rounded-sm transition-colors" title="Reject">
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {r.status === "APPROVED" && (
                          <Button size="sm" onClick={() => setConfirm({ action: "process", id: r.id, title: "Process via Gateway?", body: "This will attempt to reverse the transaction with Daraja.", variant: "warning" })}>
                            Process
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {confirm && (
          <ConfirmModal title={confirm.title} body={confirm.body} variant={confirm.variant}
            note={note} setNote={setNote}
            amountOverride={confirm.action === "approve" ? amtOverride : undefined} setAmountOverride={setAmtOverride}
            onConfirm={() => doAction(confirm.action, confirm.id)}
            onClose={() => { setConfirm(null); setNote(""); setAmtOverride(""); }}
            loading={actLoad} />
        )}
        {showDets && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-end px-4"
            onClick={e => e.target === e.currentTarget && setShowDets(null)}>
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="bg-surface border-l border-border w-full max-w-sm h-full p-6 flex flex-col shadow-2xl" onClick={e=>e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-semibold text-lg">Refund Details</h3>
                <button onClick={() => setShowDets(null)} className="p-1 rounded-sm hover:bg-surface-2"><XCircle className="w-5 h-5"/></button>
              </div>
              <div className="space-y-4 flex-1 overflow-y-auto pr-2">
                <div><span className="block text-xs text-muted mb-1">Buyer Info</span>
                  <p className="font-medium">{showDets.buyer_name}</p>
                  <p className="text-xs text-muted">{showDets.buyer_email}</p>
                  <p className="text-xs text-muted">{showDets.buyer_phone}</p>
                </div>
                <hr className="border-border my-2" />
                <div><span className="block text-xs text-muted mb-1">Requested Amount</span><p className="font-bold text-xl">{formatCurrency(showDets.amount)}</p></div>
                <div><span className="block text-xs text-muted mb-1">Reason</span><p className="text-sm">{showDets.reason}</p></div>
                
                <hr className="border-border my-2" />
                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted">Original Order</h4>
                <div className="flex justify-between text-sm"><span className="text-muted">Subtotal</span><span>{formatCurrency(showDets.subtotal || "0")}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted">Platform Fee</span><span>{formatCurrency(showDets.platform_fee || "0")}</span></div>
                <div className="flex justify-between text-sm font-bold"><span className="text-muted">Total Paid</span><span>{formatCurrency(showDets.total_paid || "0")}</span></div>
                
                <hr className="border-border my-2" />
                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted">M-Pesa Tracking</h4>
                <div><span className="block text-xs text-muted mb-1">Payment Phone</span><p className="font-medium">{showDets.mpesa_phone || "N/A"}</p></div>
                <div><span className="block text-xs text-muted mb-1">Receipt Number</span><p className="font-medium font-mono">{showDets.mpesa_receipt || "N/A"}</p></div>
                {showDets.gateway_refund_id && (
                  <div><span className="block text-xs text-muted mb-1">Refund Reversal ID</span><p className="font-medium text-success">{showDets.gateway_refund_id}</p></div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
