"use client";

import { useState, useEffect, useCallback, ElementType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet, CheckCircle2, XCircle, RefreshCw, AlertTriangle,
  TrendingUp, Scale, FileSpreadsheet, ReceiptText, ChevronDown,
  Clock, AlertCircle, X, Download,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatDate, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import jsPDF from "jspdf";

// ── Types ─────────────────────────────────────────────────────────────────────

type PayoutStatus = "PENDING" | "PROCESSING" | "PAID" | "FAILED" | "REJECTED" | "ON_HOLD";
type DisputeStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "CLOSED";

interface FinancialKPIs {
  platform_earnings: string; platform_earnings_mtd: string;
  pending_payout_amount: string; pending_payout_count: number;
  failed_payout_count: number; open_disputes: number;
  disbursed_mtd: string;
}

interface Payout {
  id: string; organizer_name: string; organizer_id: string;
  amount: string; method: string; reference?: string;
  net_amount?: string; deduction_amount?: string; deduction_reason?: string;
  mpesa_phone?: string; bank_name?: string; bank_account_name?: string; bank_account_number?: string; bank_branch?: string;
  status: PayoutStatus; created_at: string; updated_at: string;
  event_titles: string[];
}

interface Dispute {
  id: string; order_number: string; buyer_name: string;
  organizer_name: string; amount: string; reason: string;
  status: DisputeStatus; created_at: string;
}

interface VATRow { period: string; gross: string; vat_amount: string; net: string; }
interface ReconRow {
  date: string; mpesa_ref: string; amount: string;
  db_status: "MATCHED" | "MISSING" | "MISMATCH"; db_order?: string;
}

const PAYOUT_STATUS_CFG: Record<PayoutStatus, { cls: string; label: string }> = {
  PENDING:    { cls: "bg-warning/10 text-warning",  label: "Pending"    },
  PROCESSING: { cls: "bg-primary/10 text-primary",  label: "Processing" },
  PAID:       { cls: "bg-success/10 text-success",  label: "Paid"       },
  FAILED:     { cls: "bg-error/10 text-error",      label: "Failed"     },
  REJECTED:   { cls: "bg-error/10 text-error",      label: "Rejected"   },
  ON_HOLD:    { cls: "bg-orange-500/10 text-orange-500", label: "On Hold" },
};

const DISPUTE_STATUS_CFG: Record<DisputeStatus, { cls: string }> = {
  OPEN:         { cls: "bg-warning/10 text-warning"  },
  UNDER_REVIEW: { cls: "bg-primary/10 text-primary"  },
  RESOLVED:     { cls: "bg-success/10 text-success"  },
  CLOSED:       { cls: "bg-error/10 text-error"       },
};

// ── Confirm modal ─────────────────────────────────────────────────────────────

function ConfirmModal({ title, body, variant = "warning", note, setNote, onConfirm, onClose, loading, deductionAmount, setDeductionAmount, deductionReason, setDeductionReason, showDeduction }: {
  title: string; body: string; variant?: "error" | "warning";
  note?: string; setNote?: (v: string) => void;
  deductionAmount?: string; setDeductionAmount?: (v: string) => void;
  deductionReason?: string; setDeductionReason?: (v: string) => void;
  showDeduction?: boolean;
  onConfirm: () => void; onClose: () => void; loading: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-surface-2 border border-border rounded-xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className={cn("w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4",
          variant === "error" ? "bg-error/10" : "bg-warning/10")}>
          <AlertTriangle className={cn("w-6 h-6", variant === "error" ? "text-error" : "text-warning")} />
        </div>
        <h3 className="font-semibold text-center mb-2">{title}</h3>
        <p className="text-sm text-muted text-center mb-4">{body}</p>
        
        {showDeduction && setDeductionAmount && setDeductionReason && (
          <div className="mb-4 space-y-3 bg-surface p-3 rounded-lg border border-border">
            <h4 className="text-sm font-medium">Manual Deduction</h4>
            <input type="number" step="0.01" value={deductionAmount} onChange={e => setDeductionAmount(e.target.value)}
              placeholder="Amount (e.g. 500)" className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm focus:outline-none" />
            <input type="text" value={deductionReason} onChange={e => setDeductionReason(e.target.value)}
              placeholder="Reason for deduction" className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm focus:outline-none" />
          </div>
        )}

        {setNote !== undefined && (
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            placeholder="Note / reason (optional)"
            className="w-full bg-surface border border-border rounded-sm px-3 py-2 text-sm focus:outline-none mb-4 resize-none" />
        )}
        <div className="flex gap-3 mt-4">
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

// ── Section: Payout queue ─────────────────────────────────────────────────────

function PayoutQueue({ onUpdate }: { onUpdate: () => void }) {
  const [payouts,  setPayouts]  = useState<Payout[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<PayoutStatus | "ALL">("PENDING");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm,  setConfirm]  = useState<null | { action: string; ids: string[]; title: string; body: string; variant: "error" | "warning" }>(null);
  const [note,     setNote]     = useState("");
  const [dedAmt,   setDedAmt]   = useState("");
  const [dedRea,   setDedRea]   = useState("");
  const [actLoad,  setActLoad]  = useState(false);
  const [showDets, setShowDets] = useState<Payout | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: "50" });
    if (filter !== "ALL") qs.set("status", filter);
    const res = await api.get<{ results: Payout[] }>(`/admin/payouts/?${qs}`);
    if (res.success && res.data) setPayouts((res.data as any).results || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const doAction = async (action: string, ids: string[]) => {
    setActLoad(true);
    const res = await api.post(`/admin/payouts/${action}/`, { ids, note, deduction_amount: dedAmt, deduction_reason: dedRea });
    if (res.success) {
      toast.success(`${action} applied to ${ids.length} payout(s)`);
      setSelected(new Set()); load(); onUpdate();
    } else toast.error(res.error || "Action failed");
    setActLoad(false); setConfirm(null); setNote(""); setDedAmt(""); setDedRea("");
  };

  const toggleAll = () =>
    setSelected(selected.size === payouts.length ? new Set() : new Set(payouts.map(p => p.id)));

  const exportCSV = () => {
    const header = ["ID","Organizer","Amount","Method","Status","Created"];
    const rows   = payouts.map(p => [p.id, `"${p.organizer_name}"`, p.amount, p.method, p.status, formatDate(p.created_at)]);
    const csv    = [header, ...rows].map(r => r.join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download = "payouts.csv"; a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 flex-wrap">
          {(["ALL","PENDING","PROCESSING","PAID","FAILED","REJECTED","ON_HOLD"] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                filter === s ? "bg-primary text-background border-primary" : "border-border text-muted hover:text-foreground")}>
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <>
              <Button size="sm" onClick={() => setConfirm({ action: "bulk-approve", ids: [...selected],
                title: `Approve ${selected.size} payouts?`, body: "Funds will be disbursed to organizers.", variant: "warning" })}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Approve {selected.size}
              </Button>
              <Button size="sm" variant="outline"
                onClick={() => setConfirm({ action: "bulk-reject", ids: [...selected],
                  title: `Reject ${selected.size} payouts?`, body: "Organizers will be notified.", variant: "error" })}>
                <XCircle className="w-3.5 h-3.5" /> Reject {selected.size}
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={exportCSV}><Download className="w-3.5 h-3.5" /> CSV</Button>
        </div>
      </div>

      <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={selected.size === payouts.length && payouts.length > 0}
                    onChange={toggleAll} className="accent-primary" />
                </th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Organizer</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Amount</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Method</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Status</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Events</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Date</th>
                <th className="px-4 py-3 text-xs text-muted font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? Array.from({length:5}).map((_,i)=>(
                <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-8 bg-surface rounded animate-pulse" /></td></tr>
              )) : payouts.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-muted text-sm">No payouts found</td></tr>
              ) : payouts.map(p => {
                const sCfg = PAYOUT_STATUS_CFG[p.status];
                return (
                  <tr key={p.id} className="hover:bg-surface/50">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(p.id)}
                        onChange={() => setSelected(prev => { const n=new Set(prev); n.has(p.id)?n.delete(p.id):n.add(p.id); return n; })}
                        className="accent-primary" />
                    </td>
                    <td className="px-4 py-3 font-medium">{p.organizer_name}</td>
                    <td className="px-4 py-3 font-bold">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-3 text-xs text-muted">{p.method.replace(/_/g," ")}</td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", sCfg.cls)}>{sCfg.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted max-w-[160px] truncate">{p.event_titles.join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted">{formatDate(p.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={() => setShowDets(p)}
                          className="p-1.5 text-primary hover:bg-primary/10 rounded-sm transition-colors" title="View details">
                          <AlertCircle className="w-3.5 h-3.5" />
                        </button>
                        {p.status === "PENDING" && (
                          <>
                            <button onClick={() => setConfirm({ action: "bulk-approve", ids: [p.id],
                              title: "Approve payout?", body: "Funds will be disbursed.", variant: "warning" })}
                              className="p-1.5 text-success hover:bg-success/10 rounded-sm transition-colors" title="Approve">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setConfirm({ action: "bulk-hold", ids: [p.id],
                              title: "Hold payout?", body: "Put payout on hold.", variant: "warning" })}
                              className="p-1.5 text-orange-500 hover:bg-orange-500/10 rounded-sm transition-colors" title="Hold">
                              <Scale className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setConfirm({ action: "bulk-reject", ids: [p.id],
                              title: "Reject payout?", body: "Organizer will be notified.", variant: "error" })}
                              className="p-1.5 text-error hover:bg-error/10 rounded-sm transition-colors" title="Reject">
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {p.status === "ON_HOLD" && (
                          <button onClick={() => setConfirm({ action: "bulk-unhold", ids: [p.id],
                            title: "Unhold payout?", body: "Return payout to queue.", variant: "warning" })}
                            className="p-1.5 text-success hover:bg-success/10 rounded-sm transition-colors" title="Unhold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {p.status === "FAILED" && (
                          <button onClick={() => setConfirm({ action: "bulk-retry", ids: [p.id],
                            title: "Retry payout?", body: "A new payout attempt will be initiated.", variant: "warning" })}
                            className="p-1.5 text-warning hover:bg-warning/10 rounded-sm transition-colors" title="Retry">
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
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
            showDeduction={confirm.action === "bulk-approve" && confirm.ids.length === 1}
            deductionAmount={dedAmt} setDeductionAmount={setDedAmt}
            deductionReason={dedRea} setDeductionReason={setDedRea}
            onConfirm={() => doAction(confirm.action, confirm.ids)}
            onClose={() => { setConfirm(null); setNote(""); setDedAmt(""); setDedRea(""); }}
            loading={actLoad} />
        )}
        {showDets && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-end px-4"
            onClick={e => e.target === e.currentTarget && setShowDets(null)}>
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="bg-surface border-l border-border w-full max-w-sm h-full p-6 flex flex-col shadow-2xl" onClick={e=>e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-semibold text-lg">Payout Details</h3>
                <button onClick={() => setShowDets(null)} className="p-1 rounded-sm hover:bg-surface-2"><X className="w-5 h-5"/></button>
              </div>
              <div className="space-y-4 flex-1 overflow-y-auto pr-2">
                <div><span className="block text-xs text-muted mb-1">Organizer</span><p className="font-medium">{showDets.organizer_name}</p></div>
                <div><span className="block text-xs text-muted mb-1">Amount</span><p className="font-bold text-xl">{formatCurrency(showDets.amount)}</p></div>
                {Number(showDets.deduction_amount) > 0 && (
                  <div><span className="block text-xs text-error mb-1">Deduction ({showDets.deduction_reason})</span><p className="font-medium text-error">-{formatCurrency(showDets.deduction_amount!)}</p></div>
                )}
                <div><span className="block text-xs text-muted mb-1">Net Amount</span><p className="font-semibold text-primary">{formatCurrency(showDets.net_amount || showDets.amount)}</p></div>
                <hr className="border-border my-2" />
                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted">Bank / Mobile Details</h4>
                {showDets.method === "MPESA" ? (
                  <div><span className="block text-xs text-muted mb-1">M-Pesa Phone</span><p className="font-medium">{showDets.mpesa_phone || "N/A"}</p></div>
                ) : (
                  <>
                    <div><span className="block text-xs text-muted mb-1">Bank Name</span><p className="font-medium">{showDets.bank_name || "N/A"}</p></div>
                    <div><span className="block text-xs text-muted mb-1">Account Name</span><p className="font-medium">{showDets.bank_account_name || "N/A"}</p></div>
                    <div><span className="block text-xs text-muted mb-1">Account No</span><p className="font-medium">{showDets.bank_account_number || "N/A"}</p></div>
                    <div><span className="block text-xs text-muted mb-1">Branch</span><p className="font-medium">{showDets.bank_branch || "N/A"}</p></div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Section: Disputes ────────────────────────────────────────────────────────

function DisputeCenter() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<DisputeStatus | "ALL">("ALL");
  const [confirm,  setConfirm]  = useState<null | { action: string; id: string; title: string; body: string }>(null);
  const [note,     setNote]     = useState("");
  const [actLoad,  setActLoad]  = useState(false);
  
  const [activeChat, setActiveChat] = useState<Dispute | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [newAtt, setNewAtt] = useState("");
  const [chatLoad, setChatLoad] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: "50" });
    if (filter !== "ALL") qs.set("status", filter);
    const res = await api.get<{ results: Dispute[] }>(`/admin/disputes/?${qs}`);
    if (res.success && res.data) setDisputes((res.data as any).results || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const doAction = async (action: string, id: string) => {
    setActLoad(true);
    const res = await api.post(`/admin/disputes/${id}/${action}/`, { note });
    if (res.success) { toast.success(`Dispute ${action}`); load(); setActiveChat(null); }
    else toast.error(res.error || "Action failed");
    setActLoad(false); setConfirm(null); setNote("");
  };

  const loadMessages = async (id: string) => {
    setChatLoad(true);
    const res = await api.get<any[]>(`/admin/disputes/${id}/messages/`);
    if (res.success && res.data) setMessages(res.data);
    setChatLoad(false);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChat || !newMsg.trim()) return;
    const res = await api.post(`/admin/disputes/${activeChat.id}/messages/`, { message: newMsg, attachment_url: newAtt });
    if (res.success) {
      setNewMsg(""); setNewAtt("");
      loadMessages(activeChat.id);
    } else toast.error("Failed to send message");
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(["ALL","OPEN","UNDER_REVIEW","RESOLVED","CLOSED"] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              filter === s ? "bg-primary text-background border-primary" : "border-border text-muted hover:text-foreground")}>
            {s.replace("_"," ")}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading ? Array.from({length:3}).map((_,i)=>(
          <div key={i} className="h-16 bg-surface-2 border border-border rounded-xl animate-pulse" />
        )) : disputes.length === 0 ? (
          <div className="text-center py-12 text-muted text-sm"><Scale className="w-8 h-8 mx-auto mb-2 opacity-40" />No disputes</div>
        ) : disputes.map(d => (
          <div key={d.id} className="bg-surface-2 border border-border rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-muted">#{d.order_number}</span>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                    DISPUTE_STATUS_CFG[d.status]?.cls || "text-muted")}>
                    {d.status.replace("_"," ")}
                  </span>
                </div>
                <p className="font-medium text-sm">{d.reason}</p>
                <p className="text-xs text-muted mt-0.5">
                  Buyer: {d.buyer_name} · Organizer: {d.organizer_name} · {formatCurrency(d.amount)} · {formatDate(d.created_at)}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => { setActiveChat(d); loadMessages(d.id); }}>
                  Messages
                </Button>
                {(d.status === "OPEN" || d.status === "UNDER_REVIEW") && (
                  <>
                    <Button size="sm" onClick={() => setConfirm({ action: "resolve", id: d.id,
                      title: "Mark as resolved?", body: "The dispute will be closed and parties notified." })}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
                    </Button>
                    <Button size="sm" variant="primary" className="bg-error hover:bg-error/90" onClick={() => setConfirm({ action: "refund", id: d.id,
                      title: "Resolve & Refund?", body: "This will issue a refund and deduct from the organizer payout." })}>
                      Refund
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {confirm && (
          <ConfirmModal title={confirm.title} body={confirm.body} variant="warning"
            note={note} setNote={setNote} loading={actLoad}
            onConfirm={() => doAction(confirm.action, confirm.id)}
            onClose={() => setConfirm(null)} />
        )}
        {activeChat && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-end px-4"
            onClick={e => e.target === e.currentTarget && setActiveChat(null)}>
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="bg-surface border-l border-border w-full max-w-md h-full flex flex-col shadow-2xl" onClick={e=>e.stopPropagation()}>
              <div className="flex justify-between items-center p-6 border-b border-border">
                <div>
                  <h3 className="font-semibold text-lg">Dispute #{activeChat.order_number}</h3>
                  <p className="text-xs text-muted">{activeChat.buyer_name} vs {activeChat.organizer_name}</p>
                </div>
                <button onClick={() => setActiveChat(null)} className="p-1 rounded-sm hover:bg-surface-2"><X className="w-5 h-5"/></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-surface-2/30">
                {chatLoad ? <div className="text-center text-muted text-sm py-4">Loading messages...</div> : messages.length === 0 ? (
                  <div className="text-center text-muted text-sm py-8">No messages yet. Start the conversation.</div>
                ) : messages.map((m, i) => (
                  <div key={i} className={cn("p-3 rounded-xl text-sm max-w-[85%]", m.is_admin ? "bg-primary text-primary-foreground ml-auto rounded-tr-sm" : "bg-surface border border-border rounded-tl-sm")}>
                    <p className="font-semibold text-[10px] mb-1 opacity-70 uppercase tracking-wider">{m.sender}</p>
                    <p>{m.message}</p>
                    {m.attachment_url && <a href={m.attachment_url} target="_blank" rel="noreferrer" className="text-xs underline mt-2 block opacity-80 hover:opacity-100">View Attachment</a>}
                  </div>
                ))}
              </div>

              <div className="p-4 border-t border-border bg-surface">
                <form onSubmit={sendMessage} className="flex gap-2 flex-col">
                  <div className="flex gap-2">
                    <input type="text" value={newMsg} onChange={e => setNewMsg(e.target.value)} placeholder="Type a message..." className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none" />
                    <Button type="submit" disabled={!newMsg.trim()}>Send</Button>
                  </div>
                  <input type="url" value={newAtt} onChange={e => setNewAtt(e.target.value)} placeholder="Attachment URL (optional)" className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none" />
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Section: VAT / Tax report ────────────────────────────────────────────────

function VATReport() {
  const [rows,    setRows]    = useState<VATRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [year,    setYear]    = useState(new Date().getFullYear());

  useEffect(() => {
    setLoading(true);
    api.get<VATRow[]>(`/admin/vat-report/?year=${year}`).then(r => {
      if (r.success && r.data) setRows(r.data);
      setLoading(false);
    });
  }, [year]);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text(`VAT Report — ${year}`, 14, 18);
    doc.setFontSize(10);
    const header = ["Period","Gross (KES)","VAT (KES)","Net (KES)"];
    const data   = rows.map(r => [r.period, Number(r.gross).toFixed(2), Number(r.vat_amount).toFixed(2), Number(r.net).toFixed(2)]);
    [...[header], ...data].forEach((row, i) =>
      row.forEach((cell, j) => doc.text(String(cell), 14 + j * 45, 30 + i * 8))
    );
    doc.save(`vat-report-${year}.pdf`);
  };

  const totals = rows.reduce((acc, r) => ({
    gross: acc.gross + Number(r.gross),
    vat:   acc.vat   + Number(r.vat_amount),
    net:   acc.net   + Number(r.net),
  }), { gross: 0, vat: 0, net: 0 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted">Year:</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="bg-surface-2 border border-border rounded-sm px-2 h-8 text-sm focus:outline-none">
            {[2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportPDF} disabled={rows.length===0}>
            <Download className="w-3.5 h-3.5" /> PDF Invoice
          </Button>
          <Button size="sm" variant="primary" onClick={() => {
            const header = ["Account","Date","Description","Amount","Tax Rate"];
            const csvData = rows.map(r => `Sales,${r.period},Platform Fees,${r.net},16%`).join("\n");
            const csv = header.join(",") + "\n" + csvData;
            const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
            a.download = `xero-export-${year}.csv`; a.click();
          }} disabled={rows.length===0}>
            <FileSpreadsheet className="w-3.5 h-3.5" /> Accounting CSV
          </Button>
        </div>
      </div>

      <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface">
            <tr>
              {["Period","Gross (KES)","VAT 16% (KES)","Net (KES)"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs text-muted font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? Array.from({length:4}).map((_,i)=>(
              <tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-7 bg-surface rounded animate-pulse" /></td></tr>
            )) : rows.length === 0 ? (
              <tr><td colSpan={4} className="py-10 text-center text-muted text-sm">No data for {year}</td></tr>
            ) : rows.map(r => (
              <tr key={r.period} className="hover:bg-surface/50">
                <td className="px-4 py-3 font-medium">{r.period}</td>
                <td className="px-4 py-3">{Number(r.gross).toLocaleString()}</td>
                <td className="px-4 py-3 text-warning">{Number(r.vat_amount).toLocaleString()}</td>
                <td className="px-4 py-3 font-bold text-success">{Number(r.net).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="border-t-2 border-border bg-surface/50 font-bold">
                <td className="px-4 py-3">Total {year}</td>
                <td className="px-4 py-3">{totals.gross.toLocaleString()}</td>
                <td className="px-4 py-3 text-warning">{totals.vat.toLocaleString()}</td>
                <td className="px-4 py-3 text-success">{totals.net.toLocaleString()}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Section: Reconciliation ──────────────────────────────────────────────────

function ReconciliationReport() {
  const [rows,    setRows]    = useState<ReconRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [from,    setFrom]    = useState(() => new Date(Date.now()-7*86400000).toISOString().slice(0,10));
  const [to,      setTo]      = useState(() => new Date().toISOString().slice(0,10));
  const [filter,  setFilter]  = useState<"ALL"|"MISSING"|"MISMATCH">("ALL");

  const run = async () => {
    setLoading(true);
    const res = await api.get<ReconRow[]>(`/admin/reconciliation/?from=${from}&to=${to}`);
    if (res.success && res.data) setRows(res.data);
    else toast.error("Failed to fetch reconciliation data");
    setLoading(false);
  };

  const syncMpesa = async () => {
    setLoading(true);
    const res = await api.post(`/admin/reconciliation/sync/`, { from, to });
    if (res.success) {
      toast.success(`Daraja Sync Complete. ${(res.data as any).synced_count} missing transactions resolved.`);
      run();
    } else toast.error("Sync failed");
    setLoading(false);
  };

  const filtered = rows.filter(r => filter === "ALL" || r.db_status === filter);

  const STATUS_CLR: Record<string, string> = {
    MATCHED:  "text-success",
    MISSING:  "text-error",
    MISMATCH: "text-warning",
  };

  const exportCSV = () => {
    const header = ["Date","M-Pesa Ref","Amount","DB Status","Order"];
    const data   = filtered.map(r => [r.date, r.mpesa_ref, r.amount, r.db_status, r.db_order || ""]);
    const csv    = [header, ...data].map(r => r.join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download = `reconciliation-${from}-${to}.csv`; a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-muted mb-1">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="bg-surface-2 border border-border rounded-sm px-3 h-9 text-sm focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="bg-surface-2 border border-border rounded-sm px-3 h-9 text-sm focus:outline-none" />
        </div>
        <Button size="sm" loading={loading} onClick={run}>Run Reconciliation</Button>
        <Button size="sm" variant="outline" className="text-primary border-primary hover:bg-primary/10" loading={loading} onClick={syncMpesa}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Query Daraja API
        </Button>
        {rows.length > 0 && (
          <>
            <div className="flex gap-2 ml-auto">
              {(["ALL","MISSING","MISMATCH"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    filter===f ? "bg-primary text-background border-primary" : "border-border text-muted hover:text-foreground")}>
                  {f}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={exportCSV}><Download className="w-3.5 h-3.5" />CSV</Button>
          </>
        )}
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3 text-sm">
          {[
            { label: "Matched",  value: rows.filter(r=>r.db_status==="MATCHED").length,  cls: "text-success" },
            { label: "Missing",  value: rows.filter(r=>r.db_status==="MISSING").length,  cls: "text-error"   },
            { label: "Mismatch", value: rows.filter(r=>r.db_status==="MISMATCH").length, cls: "text-warning" },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-surface-2 border border-border rounded-xl p-3 text-center">
              <p className="text-xs text-muted">{label}</p>
              <p className={cn("text-2xl font-bold mt-0.5", cls)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface">
              <tr>
                {["Date","M-Pesa Ref","Amount (KES)","DB Status","Order #"].map(h=>(
                  <th key={h} className="text-left px-4 py-3 text-xs text-muted font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r, i) => (
                <tr key={i} className="hover:bg-surface/50">
                  <td className="px-4 py-2.5 text-xs text-muted">{r.date}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{r.mpesa_ref}</td>
                  <td className="px-4 py-2.5 font-medium">{Number(r.amount).toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn("text-xs font-bold", STATUS_CLR[r.db_status])}>{r.db_status}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">{r.db_order || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type SectionKey = "queue" | "disputes" | "vat" | "reconciliation";

const SECTIONS: { key: SectionKey; label: string; icon: ElementType }[] = [
  { key: "queue",          label: "Payout Queue",    icon: Wallet       },
  { key: "disputes",       label: "Disputes",        icon: Scale        },
  { key: "vat",            label: "VAT / Tax",       icon: ReceiptText  },
  { key: "reconciliation", label: "Reconciliation",  icon: FileSpreadsheet },
];

export default function AdminPayoutsPage() {
  const [kpis,    setKpis]    = useState<FinancialKPIs | null>(null);
  const [section, setSection] = useState<SectionKey>("queue");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadKpis = useCallback(async () => {
    const qs = new URLSearchParams();
    if (dateFrom) qs.set("from", dateFrom);
    if (dateTo) qs.set("to", dateTo);
    const res = await api.get<FinancialKPIs>(`/admin/financial-kpis/?${qs}`);
    if (res.success && res.data) setKpis(res.data);
  }, [dateFrom, dateTo]);

  useEffect(() => { loadKpis(); }, [loadKpis]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Financial Management</h1>
          <p className="text-muted text-sm">Payouts, disputes, VAT, and M-Pesa reconciliation</p>
        </div>
        <div className="flex gap-2 items-center bg-surface-2 p-1.5 rounded-lg border border-border">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-background text-sm rounded px-2 py-1 border border-border outline-none" title="From Date" />
          <span className="text-muted text-sm">-</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-background text-sm rounded px-2 py-1 border border-border outline-none" title="To Date" />
        </div>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Platform Earnings MTD", value: formatCurrency(kpis.platform_earnings_mtd), icon: TrendingUp, color: "text-primary" },
            { label: "Pending Payout Total",  value: formatCurrency(kpis.pending_payout_amount), icon: Clock,      color: "text-warning", sub: `${kpis.pending_payout_count} payouts` },
            { label: "Failed Payouts",        value: kpis.failed_payout_count,                   icon: XCircle,    color: "text-error"   },
            { label: "Open Disputes",         value: kpis.open_disputes,                         icon: Scale,      color: "text-orange-400" },
          ].map(({ label, value, icon: Icon, color, sub }) => (
            <div key={label} className="bg-surface-2 border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted uppercase tracking-wide">{label}</span>
                <Icon className={cn("w-4 h-4", color)} />
              </div>
              <p className={cn("text-xl font-bold font-display", color)}>{value}</p>
              {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Section tabs */}
      <div className="flex gap-1 p-1 bg-surface-2 border border-border rounded-xl w-fit flex-wrap">
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setSection(key)}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              section === key ? "bg-primary text-background" : "text-muted hover:text-foreground")}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {section === "queue"          && <PayoutQueue onUpdate={loadKpis} />}
      {section === "disputes"       && <DisputeCenter />}
      {section === "vat"            && <VATReport />}
      {section === "reconciliation" && <ReconciliationReport />}
    </div>
  );
}
