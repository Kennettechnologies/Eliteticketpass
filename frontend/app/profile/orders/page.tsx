"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { formatDateTime, cn } from "@/lib/utils";
import { ShoppingBag, Download, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface OrderLine { tier_name: string; quantity: number; unit_price: string; subtotal: string; }
interface Order {
  id: string; order_number: string; created_at: string;
  event_title: string; event_slug: string;
  status: "CONFIRMED" | "PENDING" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED";
  total: string; payment_method: string;
  items: OrderLine[];
  refund_status?: "REQUESTED" | "PROCESSING" | "COMPLETED" | "DENIED" | null;
}

const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: "bg-success/10 text-success",
  PENDING:   "bg-warning/10 text-warning",
  CANCELLED: "bg-error/10 text-error",
  REFUNDED:  "bg-muted/10 text-muted",
};

export default function OrderHistoryPage() {
  const [orders,   setOrders]   = useState<Order[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ results: Order[] }>("/orders/my/").then(r => {
      if (r.success) setOrders((r.data as any)?.results || []);
      setLoading(false);
    });
  }, []);

  const downloadReceipt = async (orderId: string, orderNumber: string) => {
    const res = await api.get<{ pdf_base64: string }>(`/orders/${orderId}/receipt/`);
    if (res.success && res.data?.pdf_base64) {
      const a = document.createElement("a");
      a.href = `data:application/pdf;base64,${res.data.pdf_base64}`;
      a.download = `receipt-${orderNumber}.pdf`;
      a.click();
    } else toast.error("Could not download receipt");
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Order History</h1>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-surface-2 border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20">
          <ShoppingBag className="w-12 h-12 text-muted mx-auto mb-4" />
          <h3 className="font-display text-lg font-bold mb-2">No orders yet</h3>
          <p className="text-muted text-sm">Your purchase history will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <div key={order.id} className="bg-surface-2 border border-border rounded-xl overflow-hidden">
              <div className="flex items-start justify-between gap-4 p-5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-mono text-muted">#{order.order_number}</span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_STYLES[order.status] || "bg-surface text-muted")}>
                      {order.status}
                    </span>
                  </div>
                  <Link href={`/events/${order.event_slug}`}
                    className="font-semibold text-sm hover:text-primary transition-colors flex items-center gap-1 line-clamp-1">
                    {order.event_title} <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                  </Link>
                  <p className="text-xs text-muted mt-0.5">{formatDateTime(order.created_at)} · {order.payment_method.replace("_", " ")}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-sm">KES {Number(order.total).toLocaleString()}</p>
                  {order.refund_status && (
                    <p className={cn("text-xs font-medium mt-1",
                      order.refund_status === "COMPLETED" ? "text-success"
                      : order.refund_status === "DENIED"   ? "text-error"
                      : "text-warning")}>↩ Refund {order.refund_status.toLowerCase()}</p>
                  )}
                  <div className="flex gap-2 mt-2 justify-end">
                    <button onClick={() => downloadReceipt(order.id, order.order_number)}
                      className="flex items-center gap-1 text-xs text-muted hover:text-foreground border border-border rounded-sm px-2 py-1 transition-colors">
                      <Download className="w-3 h-3" /> Receipt
                    </button>
                    <Link href={`/profile/orders/${order.id}`}
                      className="flex items-center gap-1 text-xs text-muted hover:text-foreground border border-border rounded-sm px-2 py-1 transition-colors">
                      Details
                    </Link>
                    <button onClick={() => setExpanded(e => e === order.id ? null : order.id)}
                      className="flex items-center gap-1 text-xs text-muted hover:text-foreground border border-border rounded-sm px-2 py-1 transition-colors">
                      {expanded === order.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      Items
                    </button>
                  </div>
                </div>
              </div>

              {expanded === order.id && (
                <div className="border-t border-border px-5 py-4 space-y-2">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-muted">{item.tier_name} × {item.quantity}</span>
                      <span className="font-medium">KES {Number(item.subtotal).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
