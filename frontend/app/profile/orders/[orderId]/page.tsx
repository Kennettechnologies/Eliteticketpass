"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, Download, RefreshCw, CheckCircle2, Clock,
  XCircle, AlertCircle, ArrowDownLeft, X, ExternalLink,
  Info, ShieldAlert,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatDate, formatDateTime, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import jsPDF from "jspdf";

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderStatus  = "CONFIRMED" | "PENDING" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED";
type RefundStatus = "NONE" | "REQUESTED" | "PROCESSING" | "COMPLETED" | "PARTIAL" | "DENIED";

interface OrderLine  { tier_name: string; quantity: number; unit_price: string; subtotal: string; }
interface RefundEvent {
  status: RefundStatus;
  amount: string;
  reason: string;
  created_at: string;
  updated_at: string;
  refund_method: string;
  denial_reason?: string;
}
interface OrderDetail {
  id: string;
  order_number: string;
  created_at: string;
  event_title: string;
  event_slug: string;
  event_date: string;
  venue_name: string;
  status: OrderStatus;
  payment_method: string;
  items: OrderLine[];
  subtotal: string;
  platform_fee: string;
  discount: string;
  total: string;
  refund?: RefundEvent;
  refund_policy_days: number;
  refund_deadline: string | null;
  is_refund_eligible: boolean;
  max_refundable: string;
}

const REFUND_REASONS = [
  "I can no longer attend",
  "Event was postponed / rescheduled",
  "Duplicate purchase",
  "Medical / emergency reason",
  "Other",
];

const STATUS_STYLES: Record<OrderStatus, { cls: string; label: string }> = {
  CONFIRMED:          { cls: "bg-success/10 text-success",   label: "Confirmed"          },
  PENDING:            { cls: "bg-warning/10 text-warning",   label: "Pending"            },
  CANCELLED:          { cls: "bg-error/10 text-error",       label: "Cancelled"          },
  REFUNDED:           { cls: "bg-muted/10 text-muted",       label: "Refunded"           },
  PARTIALLY_REFUNDED: { cls: "bg-primary/10 text-primary",   label: "Partially Refunded" },
};

const REFUND_STEPS: { status: RefundStatus; label: string; icon: React.ElementType }[] = [
  { status: "REQUESTED",  label: "Requested",  icon: Clock         },
  { status: "PROCESSING", label: "Processing", icon: RefreshCw     },
  { status: "COMPLETED",  label: "Refunded",   icon: CheckCircle2  },
];

// ── PDF receipt ───────────────────────────────────────────────────────────────

function generateReceipt(order: OrderDetail) {
  const doc = new jsPDF();
  doc.setFontSize(16); doc.text("PAYMENT RECEIPT", 14, 18);
  doc.setFontSize(10);
  const lines = [
    `Order #: ${order.order_number}`,
    `Date: ${formatDateTime(order.created_at)}`,
    `Event: ${order.event_title}`,
    `Venue: ${order.venue_name}`,
    "",
    ...order.items.map(i => `${i.tier_name} × ${i.quantity}   KES ${Number(i.subtotal).toLocaleString()}`),
    "",
    `Subtotal:     KES ${Number(order.subtotal).toLocaleString()}`,
    Number(order.discount) > 0 ? `Discount:    -KES ${Number(order.discount).toLocaleString()}` : "",
    `Platform Fee: KES ${Number(order.platform_fee).toLocaleString()}`,
    `Total:        KES ${Number(order.total).toLocaleString()}`,
    "",
    `Payment Method: ${order.payment_method.replace(/_/g, " ")}`,
    `Status: ${order.status}`,
  ].filter(Boolean);
  lines.forEach((l, i) => doc.text(l, 14, 30 + i * 7));
  doc.save(`receipt-${order.order_number}.pdf`);
}

// ── Refund modal ──────────────────────────────────────────────────────────────

function RefundModal({ order, onDone, onClose }: {
  order: OrderDetail; onDone: () => void; onClose: () => void;
}) {
  const [refundType, setRefundType] = useState<"FULL" | "PARTIAL">("FULL");
  const [amount,     setAmount]     = useState(order.max_refundable);
  const [reason,     setReason]     = useState(REFUND_REASONS[0]);
  const [notes,      setNotes]      = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refundable = Number(order.max_refundable);
  const fee        = Number(order.platform_fee);
  const willGet    = refundType === "FULL" ? refundable : Math.min(Number(amount), refundable);

  const submit = async () => {
    if (refundType === "PARTIAL" && (Number(amount) <= 0 || Number(amount) > refundable)) {
      toast.error(`Amount must be between 1 and KES ${refundable.toLocaleString()}`); return;
    }
    setSubmitting(true);
    const res = await api.post(`/orders/${order.id}/request-refund/`, {
      refund_type: refundType, amount: refundType === "FULL" ? refundable : Number(amount), reason, notes,
    });
    if (res.success) { toast.success("Refund request submitted!"); onDone(); onClose(); }
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
          <h2 className="font-semibold">Request Refund</h2>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-foreground rounded-sm"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Platform fee notice */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-warning/5 border border-warning/20 text-xs text-warning">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Platform fee of <strong>KES {fee.toLocaleString()}</strong> is non-refundable.
              Max refundable: <strong>KES {refundable.toLocaleString()}</strong>
            </span>
          </div>

          <div>
            <p className="text-xs font-medium text-muted mb-2">Refund type</p>
            <div className="grid grid-cols-2 gap-2">
              {(["FULL", "PARTIAL"] as const).map(t => (
                <label key={t} className="cursor-pointer">
                  <input type="radio" value={t} checked={refundType === t} onChange={() => setRefundType(t)} className="sr-only" />
                  <div className={cn("p-3 rounded-lg border text-center text-sm font-medium transition-all",
                    refundType === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/30")}>
                    {t === "FULL" ? `Full — KES ${refundable.toLocaleString()}` : "Partial amount"}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {refundType === "PARTIAL" && (
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Amount to refund (KES)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                max={refundable} min={1}
                className="w-full bg-surface border border-border rounded-sm px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted mb-1">Reason *</label>
            <select value={reason} onChange={e => setReason(e.target.value)}
              className="w-full bg-surface border border-border rounded-sm px-3 h-10 text-sm focus:outline-none">
              {REFUND_REASONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>

          {reason === "Other" && (
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Additional notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                className="w-full bg-surface border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
            </div>
          )}

          <div className="flex justify-between text-sm pt-2 border-t border-border">
            <span className="text-muted">You will receive</span>
            <span className="font-bold text-success">KES {willGet.toLocaleString()}</span>
          </div>
          <p className="text-xs text-muted -mt-1">Refunded to: {order.payment_method.replace(/_/g, " ")}</p>
        </div>

        <div className="flex gap-3 p-5 border-t border-border">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button loading={submitting} onClick={submit} className="flex-1">Submit Request</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Refund status timeline ────────────────────────────────────────────────────

function RefundTimeline({ refund }: { refund: RefundEvent }) {
  const isDenied    = refund.status === "DENIED";
  const isCompleted = refund.status === "COMPLETED" || refund.status === "PARTIAL";

  return (
    <div className="bg-surface-2 border border-border rounded-xl p-5">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <ArrowDownLeft className="w-4 h-4 text-primary" /> Refund Status
      </h3>

      {isDenied ? (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-error/5 border border-error/20">
          <XCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm text-error">Refund Denied</p>
            {refund.denial_reason && <p className="text-xs text-muted mt-1">{refund.denial_reason}</p>}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-4">
          {REFUND_STEPS.map((step, i) => {
            const stepOrder = ["REQUESTED", "PROCESSING", "COMPLETED"];
            const currentIdx = stepOrder.indexOf(refund.status === "PARTIAL" ? "COMPLETED" : refund.status);
            const stepIdx = i;
            const done   = stepIdx < currentIdx || isCompleted;
            const active = stepIdx === currentIdx && !isCompleted;
            const Icon   = step.icon;
            return (
              <div key={step.status} className="flex items-center gap-2 flex-1">
                <div className={cn("flex items-center gap-1.5 text-xs font-medium whitespace-nowrap",
                  done || (isCompleted && stepIdx <= currentIdx) ? "text-success"
                  : active ? "text-primary" : "text-muted")}>
                  <Icon className={cn("w-4 h-4", active && "animate-spin")} />
                  {step.label}
                </div>
                {i < REFUND_STEPS.length - 1 && <div className={cn("flex-1 h-px", done ? "bg-success/40" : "bg-border")} />}
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm mt-3">
        <div>
          <p className="text-xs text-muted">Amount</p>
          <p className="font-bold text-success mt-0.5">KES {Number(refund.amount).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Refund method</p>
          <p className="font-medium mt-0.5">{refund.refund_method.replace(/_/g, " ")}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Reason</p>
          <p className="mt-0.5">{refund.reason}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Requested</p>
          <p className="mt-0.5">{formatDate(refund.created_at)}</p>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const [order,   setOrder]   = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(false);

  const load = useCallback(async () => {
    const res = await api.get<OrderDetail>(`/orders/${orderId}/`);
    if (res.success && res.data) setOrder(res.data);
    else toast.error("Order not found");
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-surface-2 border border-border rounded-xl animate-pulse" />)}
    </div>
  );

  if (!order) return (
    <div className="text-center py-20">
      <AlertCircle className="w-10 h-10 text-muted mx-auto mb-3" />
      <p className="text-muted">Order not found.</p>
      <Button variant="outline" className="mt-4" onClick={() => router.push("/profile/orders")}>Back to Orders</Button>
    </div>
  );

  const statusCfg  = STATUS_STYLES[order.status] || { cls: "bg-surface text-muted", label: order.status };
  const subtotal   = Number(order.subtotal);
  const fee        = Number(order.platform_fee);
  const discount   = Number(order.discount);
  const total      = Number(order.total);
  const hasRefund  = order.refund && order.refund.status !== "NONE";
  const deadlinePassed = order.refund_deadline ? new Date(order.refund_deadline) < new Date() : false;
  const canRequest = order.is_refund_eligible && !hasRefund && !deadlinePassed && order.status === "CONFIRMED";

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/profile/orders" className="flex items-center gap-1.5 text-muted hover:text-foreground">
          <ChevronLeft className="w-4 h-4" /> Orders
        </Link>
        <span className="text-muted">/</span>
        <span className="font-mono">#{order.order_number}</span>
      </div>

      {/* Header card */}
      <div className="bg-surface-2 border border-border rounded-xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-mono text-xs text-muted">#{order.order_number}</span>
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusCfg.cls)}>
                {statusCfg.label}
              </span>
            </div>
            <Link href={`/events/${order.event_slug}`}
              className="font-display text-xl font-bold hover:text-primary transition-colors flex items-center gap-1.5">
              {order.event_title} <ExternalLink className="w-4 h-4 opacity-50" />
            </Link>
            <p className="text-sm text-muted mt-1">
              {order.venue_name} · {formatDateTime(order.event_date)}
            </p>
            <p className="text-xs text-muted mt-0.5">Ordered {formatDateTime(order.created_at)}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => generateReceipt(order)}>
            <Download className="w-3.5 h-3.5" /> Receipt PDF
          </Button>
        </div>
      </div>

      {/* Items + fee breakdown */}
      <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-surface">
          <p className="text-xs font-medium text-muted uppercase tracking-wide">Items</p>
        </div>
        <div className="divide-y divide-border">
          {order.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3 text-sm">
              <div>
                <p className="font-medium">{item.tier_name}</p>
                <p className="text-xs text-muted">× {item.quantity} @ KES {Number(item.unit_price).toLocaleString()}</p>
              </div>
              <p className="font-semibold">KES {Number(item.subtotal).toLocaleString()}</p>
            </div>
          ))}
        </div>

        <div className="px-5 py-4 space-y-2 border-t border-border text-sm">
          <div className="flex justify-between text-muted">
            <span>Subtotal</span><span>KES {subtotal.toLocaleString()}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-success">
              <span>Discount</span><span>− KES {discount.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between text-muted">
            <span className="flex items-center gap-1.5">
              Platform fee
              <span title="Non-refundable service charge" className="cursor-help">
                <Info className="w-3.5 h-3.5 text-muted/60" />
              </span>
            </span>
            <span>KES {fee.toLocaleString()}</span>
          </div>
          <div className="flex justify-between font-bold text-base pt-2 border-t border-border">
            <span>Total paid</span>
            <span className="text-primary">KES {total.toLocaleString()}</span>
          </div>
          <p className="text-xs text-muted">via {order.payment_method.replace(/_/g, " ")}</p>
        </div>
      </div>

      {/* Refund section */}
      {hasRefund && order.refund ? (
        <RefundTimeline refund={order.refund} />
      ) : (
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <ArrowDownLeft className="w-4 h-4 text-primary" /> Refund Policy
          </h3>
          <div className="space-y-2 text-sm text-muted mb-4">
            <p>
              Refunds are available within <strong className="text-foreground">{order.refund_policy_days} days</strong> of purchase.
            </p>
            {order.refund_deadline && (
              <p>
                Refund deadline:{" "}
                <strong className={cn(deadlinePassed ? "text-error" : "text-foreground")}>
                  {formatDate(order.refund_deadline)}
                </strong>
              </p>
            )}
            <p className="flex items-start gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-warning" />
              Platform fee (KES {fee.toLocaleString()}) is non-refundable.
              Max refundable: KES {Number(order.max_refundable).toLocaleString()}.
            </p>
          </div>

          {canRequest ? (
            <Button onClick={() => setModal(true)}>
              <ArrowDownLeft className="w-4 h-4" /> Request Refund
            </Button>
          ) : (
            <p className="text-xs text-muted italic">
              {order.status !== "CONFIRMED"  ? "Refunds are only available for confirmed orders."
               : deadlinePassed             ? "The refund window has closed for this order."
               : hasRefund                  ? "A refund request is already in progress."
               : "This order is not eligible for a refund."}
            </p>
          )}
        </div>
      )}

      <AnimatePresence>
        {modal && <RefundModal order={order} onDone={load} onClose={() => setModal(false)} />}
      </AnimatePresence>
    </div>
  );
}
