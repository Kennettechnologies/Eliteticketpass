"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { motion } from "framer-motion";
import {
  Check, Timer, Phone, RefreshCw, X, Ticket,
  Tag, AlertCircle, Building2, ChevronRight,
  Hash, Smartphone, Circle, CheckCircle2, XCircle, Loader2,
  MessageCircle, CalendarPlus, ZoomIn, Twitter, Linkedin, Facebook, Download,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { formatDateTime, cn } from "@/lib/utils";
import confetti from "canvas-confetti";

// ── Types ──────────────────────────────────────────────────────────────────

type Step = "summary" | "buyer" | "payment" | "awaiting" | "success" | "failed";
type PayMethod = "MPESA_STK" | "MPESA_PAYBILL" | "MPESA_BUY_GOODS" | "CARD_STRIPE" | "CARD_FLUTTERWAVE" | "CARD_PAYSTACK" | "BANK_TRANSFER" | "USSD" | "FREE";
type PayStatus = "PENDING" | "PROCESSING" | "CONFIRMED" | "FAILED" | "REFUNDED";

interface OrderItem { tier_name: string; quantity: number; unit_price: string; subtotal: string; }
interface FeeBreakdown { subtotal: string; discount: string; platform_fee: string; total: string; }
interface OrderData {
  session_id: string; order_id: string; order_number: string;
  event_title: string; event_slug: string; event_cover_url?: string;
  event_date: string; venue_name: string; venue_city: string;
  items: OrderItem[]; fee_breakdown: FeeBreakdown;
  expires_at: string; is_free: boolean;
}

const INPUT = "w-full bg-surface border border-border rounded-sm px-4 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted";

// ── Order Summary Panel ────────────────────────────────────────────────────

function OrderSummaryPanel({ order, timeLeft }: { order: OrderData | null; timeLeft: number }) {
  const mins = Math.floor(timeLeft / 60).toString().padStart(2, "0");
  const secs = (timeLeft % 60).toString().padStart(2, "0");
  const tc = timeLeft < 60 ? "text-error" : timeLeft < 180 ? "text-warning" : "text-primary";

  if (!order) return (
    <div className="bg-surface border border-border rounded-xl p-6 animate-pulse space-y-4 shadow-sm">
      <div className="h-4 bg-surface-2 rounded w-1/3 mb-4" />
      <div className="h-6 bg-surface-2 rounded w-2/3 mb-6" />
      <div className="h-24 bg-surface-2 rounded mb-6" />
      <div className="h-10 bg-surface-2 rounded" />
    </div>
  );

  const total = Number(order.fee_breakdown.total);
  const disc  = Number(order.fee_breakdown.discount);

  // We use current date for "Order created on" during active checkout
  const createdOn = new Date().toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' });

  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm p-6 lg:p-8">
      <h3 className="font-display font-bold text-lg text-foreground mb-4">Your Order</h3>
      <div className="border-b border-border mb-6" />

      <h4 className="font-display font-bold text-base mb-6">Payment for {order.event_title}</h4>

      <div className="flex justify-between items-start mb-8 gap-4">
        <div className="space-y-3 text-sm text-muted flex-1">
          {order.event_date && <p>Start date: {new Date(order.event_date).toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' })}</p>}
          <p>Order created on: {createdOn}</p>
        </div>
        {order.event_cover_url && (
          <img src={order.event_cover_url} alt="" className="w-20 h-20 md:w-24 md:h-24 object-cover rounded-md border border-border shrink-0" />
        )}
      </div>

      <div className="border-b border-border mb-6" />

      <div className="space-y-3 mb-6">
        {order.items.map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-muted">{item.quantity} x {item.tier_name}</span>
            <span className="text-foreground">{Number(item.unit_price) === 0 ? "Free" : `KES ${Number(item.subtotal).toLocaleString()}`}</span>
          </div>
        ))}
      </div>

      <div className="border-b border-border mb-6" />

      <h4 className="font-display font-bold text-base mb-4">Total Amount</h4>
      <div className="space-y-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted">Subtotal</span>
          <span className="text-muted">KES {Number(order.fee_breakdown.subtotal).toLocaleString()}</span>
        </div>
        
        {disc > 0 && (
          <div className="flex justify-between text-sm text-success">
            <span>Discount</span>
            <span>− KES {disc.toLocaleString()}</span>
          </div>
        )}

        <div className="flex justify-between font-bold text-base pt-2">
          <span>Amount to pay</span>
          <span className="text-foreground">{total === 0 ? "Free" : `KES ${total.toLocaleString()}`}</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-6 mt-6 border-t border-border">
        <span className="flex items-center gap-1.5 text-xs text-muted"><Timer className="w-3.5 h-3.5" />Hold expires</span>
        <span className={cn("font-mono font-bold text-sm", tc)}>{mins}:{secs}</span>
      </div>
    </div>
  );
}

// ── Step Indicator ─────────────────────────────────────────────────────────

const FLOW: { key: Step; label: string }[] = [
  { key: "summary", label: "Order" },
  { key: "buyer",   label: "Details" },
  { key: "payment", label: "Payment" },
];

function StepIndicator({ current }: { current: Step }) {
  const ai = FLOW.findIndex(s => s.key === current);
  return (
    <div className="flex items-center gap-1 mb-8">
      {FLOW.map(({ key, label }, i) => (
        <div key={key} className="flex items-center gap-1">
          <div className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors",
            i < ai ? "bg-success text-white" : i === ai ? "bg-primary text-background" : "bg-surface-2 border border-border text-muted"
          )}>
            {i < ai ? <Check className="w-3.5 h-3.5" /> : i + 1}
          </div>
          <span className={cn("text-sm font-medium", i === ai ? "text-foreground" : "text-muted")}>{label}</span>
          {i < FLOW.length - 1 && <ChevronRight className="w-4 h-4 text-border mx-1" />}
        </div>
      ))}
    </div>
  );
}

import { Suspense } from "react";

function CheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session");
  const orderId   = searchParams.get("order");

  const [step,         setStep]         = useState<Step>("summary");
  const [order,        setOrder]        = useState<OrderData | null>(null);
  const [timeLeft,     setTimeLeft]     = useState(600);
  const [buyer,        setBuyer]        = useState({ first_name: "", last_name: "", email: "", phone: "", city: "" });
  const [payMethod,    setPayMethod]    = useState<PayMethod>("CARD_PAYSTACK");
  const [mpesaPhone,   setMpesaPhone]   = useState("");
  const [promoCode,    setPromoCode]    = useState("");
  const [promoApplying,setPromoApplying]= useState(false);
  const [promoError,   setPromoError]   = useState("");
  const [agreed,       setAgreed]       = useState(false);
  const [confirming,   setConfirming]   = useState(false);
  const [availErr,     setAvailErr]     = useState("");
  const [tickets,      setTickets]      = useState<any[]>([]);
  const [orderNumber,  setOrderNumber]  = useState("");
  const [payStatus,    setPayStatus]    = useState<PayStatus>("PENDING");
  const [stkRetries,   setStkRetries]   = useState(0);
  const [stkCooldown,  setStkCooldown]  = useState(0);
  const [isDuplicate,  setIsDuplicate]  = useState(false);
  const [failReason,   setFailReason]   = useState("");
  const [paybillInfo,  setPaybillInfo]  = useState<{ number: string; account: string } | null>(null);
  const [ussdCode,     setUssdCode]     = useState("");
  const [qrLightbox,   setQrLightbox]   = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);
  const { user } = useAuthStore();

  const downloadTicketPdf = async (token: string, ticketNumber: string) => {
    try {
      setDownloadingPdf(token);
      const res = await api.get(`/tickets/public/pdf/${token}/`);
      const data = res.data as any;
      if (data?.pdf_base64) {
        const link = document.createElement("a");
        link.href = `data:application/pdf;base64,${data.pdf_base64}`;
        link.download = `Ticket-${ticketNumber}.pdf`;
        link.click();
      }
    } catch (err) {
      console.error("Failed to download PDF", err);
    } finally {
      setDownloadingPdf(null);
    }
  };

  // Pre-fill buyer from logged-in user
  useEffect(() => {
    if (user) {
      setBuyer(b => ({
        first_name: b.first_name || user.first_name || "",
        last_name:  b.last_name  || user.last_name  || "",
        email:      b.email      || user.email       || "",
        phone:      b.phone      || user.phone       || "",
        city:       b.city       || user.city        || "",
      }));
    }
  }, [user]);

  // STK cooldown ticker
  useEffect(() => {
    if (stkCooldown <= 0) return;
    const id = setInterval(() => setStkCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [stkCooldown]);

  // Load order
  useEffect(() => {
    if (!sessionId || !orderId) { router.push("/events"); return; }
    api.get<any>(`/checkout/status/?order_id=${orderId}`).then(res => {
      if (res.success && res.data) {
        setOrder(res.data);
        if (Number(res.data?.fee_breakdown?.total) === 0) setPayMethod("FREE");
        if (res.data?.expires_at) {
          const s = Math.max(0, Math.floor((new Date(res.data.expires_at).getTime() - Date.now()) / 1000));
          setTimeLeft(s);
        }
        // Detect duplicate — order already has a pending/confirmed payment
        if (res.data?.order_status === "CONFIRMED") {
          setTickets(res.data.tickets || []); setOrderNumber(res.data.order_number || "");
          setStep("success");
        } else if (["AWAITING_PAYMENT","PROCESSING"].includes(res.data?.order_status)) {
          setIsDuplicate(true);
          setStep("awaiting");
        }
      } else { router.push("/events"); }
    });
  }, [sessionId, orderId, router]);

  // Hold timer
  useEffect(() => {
    if (step === "success" || step === "failed") return;
    const id = setInterval(() => setTimeLeft(t => { if (t <= 1) { clearInterval(id); setStep("failed"); return 0; } return t - 1; }), 1000);
    return () => clearInterval(id);
  }, [step]);

  // Polling
  const poll = useCallback(async () => {
    if (!orderId) return;
    const res = await api.get<any>(`/checkout/status/?order_id=${orderId}`);
    if (res.success && res.data) {
      const st = res.data.order_status;
      if (st === "CONFIRMED") {
        setTickets(res.data.tickets || []); setOrderNumber(res.data.order_number || "");
        setPayStatus("CONFIRMED"); setStep("success");
        setTimeout(() => confetti({ particleCount: 140, spread: 70, origin: { y: 0.6 }, colors: ["#f59e0b","#10b981","#3b82f6"] }), 200);
      } else if (["CANCELLED","FAILED","EXPIRED"].includes(st)) {
        setFailReason(res.data.failure_reason || "");
        setPayStatus("FAILED"); setStep("failed");
      } else if (st === "PROCESSING") { setPayStatus("PROCESSING"); }
    }
  }, [orderId]);

  useEffect(() => {
    if (step !== "awaiting") return;
    const iv = setInterval(poll, 3000);
    const to = setTimeout(() => { clearInterval(iv); setStep("failed"); }, 180000);
    return () => { clearInterval(iv); clearTimeout(to); };
  }, [step, poll]);

  // Apply promo
  const applyPromo = async () => {
    if (!promoCode.trim() || !sessionId) return;
    setPromoApplying(true); setPromoError("");
    const res = await api.post<any>("/checkout/apply-promo/", { session_id: sessionId, promo_code: promoCode });
    if (res.success && res.data) setOrder(prev => prev ? { ...prev, fee_breakdown: res.data.fee_breakdown } : prev);
    else setPromoError(res.error || "Invalid or expired promo code");
    setPromoApplying(false);
  };

  // Confirm payment (stock was already reserved at checkout_init)
  const checkAndPay = async () => {
    if (!sessionId) return;
    setAvailErr(""); setConfirming(true);
    const res = await api.post<any>("/checkout/confirm/", {
      session_id: sessionId, buyer, payment_method: payMethod,
      mpesa_phone: ["MPESA_STK","MPESA_PAYBILL","MPESA_BUY_GOODS"].includes(payMethod) ? (mpesaPhone || buyer.phone) : undefined,
    });
    if (res.success && res.data) {
      const st = res.data.order_status || res.data.status;
      if (st === "CONFIRMED") {
        setTickets(res.data.tickets || []); setOrderNumber(res.data.order_number || "");
        setPayStatus("CONFIRMED"); setStep("success");
        confetti({ particleCount: 140, spread: 70, origin: { y: 0.6 } });
      } else if (res.data.stripe_url)       { window.location.href = res.data.stripe_url; }
      else if (res.data.flutterwave_url)    { window.location.href = res.data.flutterwave_url; }
      else if (res.data.authorization_url)  { window.location.href = res.data.authorization_url; }
      else if (res.data.paybill_number)     { setPaybillInfo({ number: res.data.paybill_number, account: res.data.account_number || order?.order_number || "" }); setStep("awaiting"); }
      else if (res.data.ussd_code)          { setUssdCode(res.data.ussd_code); setStep("awaiting"); }
      else                                  { setPayStatus("PENDING"); setStep("awaiting"); }
    } else if (res.error?.toLowerCase().includes("already") || res.error?.toLowerCase().includes("duplicate")) {
      setIsDuplicate(true); setStep("awaiting");
    } else { setAvailErr(res.error || "Payment failed. Please try again."); }
    setConfirming(false);
  };

  const retryStkPush = async () => {
    if (stkCooldown > 0 || stkRetries >= 3) return;
    setStkRetries(r => r + 1); setStkCooldown(30);
    await api.post("/checkout/resend-stk/", { session_id: sessionId, mpesa_phone: mpesaPhone || buyer.phone });
  };

  const isFlow    = ["summary","buyer","payment"].includes(step);
  const isFree    = order && Number(order.fee_breakdown?.total) === 0;
  const total     = Number(order?.fee_breakdown?.total || 0);
  const mins      = Math.floor(timeLeft / 60).toString().padStart(2,"0");
  const secs      = (timeLeft % 60).toString().padStart(2,"0");
  const timerCls  = timeLeft < 60 ? "text-error" : timeLeft < 180 ? "text-warning" : "text-foreground";

    const hasDiscount = order && Number(order.fee_breakdown?.discount) > 0;

  const PAY_OPTS: { method: PayMethod; label: string; icon: string; desc: string; hide?: boolean }[] = [
    // { method: "MPESA_STK",          label: "M-Pesa STK Push",       icon: "🟢", desc: "Instant STK push — enter PIN on your phone" },
    // { method: "MPESA_PAYBILL",      label: "M-Pesa Paybill",        icon: "📲", desc: "Pay via Paybill and enter order # as account", hide: isFree ?? false },
    // { method: "MPESA_BUY_GOODS",    label: "M-Pesa Buy Goods",      icon: "🛒", desc: "Pay via Till number — manual confirmation",    hide: isFree ?? false },
    // { method: "CARD_STRIPE",        label: "Card — Stripe",          icon: "💳", desc: "Visa / Mastercard via Stripe",                hide: isFree ?? false },
    { method: "CARD_PAYSTACK",      label: "Card / Mobile — Paystack", icon: "🟡", desc: "Pay securely via Paystack",                  hide: isFree ?? false },
    // { method: "CARD_FLUTTERWAVE",   label: "Card — Flutterwave",     icon: "🌊", desc: "Visa / Mastercard / mobile money via Flutterwave", hide: isFree ?? false },
    // { method: "BANK_TRANSFER",      label: "Bank Transfer",          icon: "🏦", desc: "Manual EFT / wire — 1–2 business days",        hide: isFree ?? false },
    // { method: "USSD",               label: "USSD (Feature Phone)",   icon: "📟", desc: "Pay via USSD — no smartphone needed",           hide: isFree ?? false },
    { 
      method: "FREE", 
      label: hasDiscount ? "Complimentary Pass" : "Free Ticket", 
      icon: "🎟️", 
      desc: hasDiscount ? "Promo applied — no payment required" : "No payment required", 
      hide: !isFree 
    },
  ];

  return (
    <div className="min-h-screen bg-background pt-16">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link href={order?.event_slug ? `/events/${order.event_slug}` : "/events"}
            className="text-sm text-muted hover:text-foreground transition-colors">← Back to event</Link>
          {isFlow && (
            <span className={cn("flex items-center gap-1.5 text-sm font-mono font-bold", timerCls)}>
              <Timer className="w-4 h-4" />{mins}:{secs}
            </span>
          )}
        </div>

        <div className={cn("grid gap-8", isFlow ? "grid-cols-1 lg:grid-cols-[1fr_320px]" : step === "success" ? "grid-cols-1 w-full" : "grid-cols-1 max-w-lg mx-auto")}>

          {/* ── Step Content ── */}
          <div>
            {isFlow && <StepIndicator current={step} />}

            {/* Summary */}
            {step === "summary" && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="font-display text-2xl font-bold mb-6">Review your order</h1>
                <div className="bg-surface-2 border border-border rounded-xl overflow-hidden mb-6">
                  <div className="divide-y divide-border">
                    {order?.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between px-5 py-4">
                        <div>
                          <p className="font-medium text-sm">{item.tier_name}</p>
                          <p className="text-xs text-muted">× {item.quantity} @ {Number(item.unit_price) === 0 ? "Free" : `KES ${Number(item.unit_price).toLocaleString()}`} each</p>
                        </div>
                        <p className="font-semibold text-sm">{Number(item.unit_price) === 0 ? "Free" : `KES ${Number(item.subtotal).toLocaleString()}`}</p>
                      </div>
                    )) ?? <div className="px-5 py-8 text-center text-muted text-sm animate-pulse">Loading…</div>}
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2">Promo / Discount Code</label>
                  <div className="flex gap-2">
                    <input value={promoCode} onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoError(""); }}
                      placeholder="ENTER CODE" className={cn(INPUT, "flex-1 tracking-widest font-mono")}
                      onKeyDown={e => e.key === "Enter" && applyPromo()} />
                    <Button variant="outline" loading={promoApplying} onClick={applyPromo} disabled={!promoCode.trim()}>
                      <Tag className="w-4 h-4" /> Apply
                    </Button>
                  </div>
                  {promoError && <p className="text-xs text-error mt-1.5 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{promoError}</p>}
                  {!promoError && order && Number(order.fee_breakdown.discount) > 0 && (
                    <p className="text-xs text-success mt-1.5 flex items-center gap-1"><Check className="w-3.5 h-3.5" />Discount applied!</p>
                  )}
                </div>

                <Button className="w-full" size="lg" disabled={!order} onClick={() => setStep("buyer")}>
                  Continue → Enter Details
                </Button>
              </motion.div>
            )}

            {/* Buyer */}
            {step === "buyer" && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="font-display text-2xl font-bold mb-6">Your Details</h1>
                <div className="space-y-4 mb-6">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-sm font-medium mb-1.5">First name *</label>
                      <input value={buyer.first_name} onChange={e => setBuyer(b => ({ ...b, first_name: e.target.value }))} className={INPUT} /></div>
                    <div><label className="block text-sm font-medium mb-1.5">Last name *</label>
                      <input value={buyer.last_name} onChange={e => setBuyer(b => ({ ...b, last_name: e.target.value }))} className={INPUT} /></div>
                  </div>
                  <div><label className="block text-sm font-medium mb-1.5">Email address *</label>
                    <input type="email" value={buyer.email} onChange={e => setBuyer(b => ({ ...b, email: e.target.value }))} placeholder="your@email.com" className={INPUT} />
                    <p className="text-xs text-muted mt-1">Tickets will be sent here</p></div>
                  <div><label className="block text-sm font-medium mb-1.5">Phone number *</label>
                    <input value={buyer.phone} onChange={e => setBuyer(b => ({ ...b, phone: e.target.value }))} placeholder="07XXXXXXXX or +2547XXXXXXXX" className={INPUT} /></div>
                  <div><label className="block text-sm font-medium mb-1.5">City <span className="text-muted font-normal">(Optional)</span></label>
                    <input value={buyer.city} onChange={e => setBuyer(b => ({ ...b, city: e.target.value }))} placeholder="e.g. Nairobi" className={INPUT} />
                    <p className="text-xs text-muted mt-1">Helps organizers understand their audience</p></div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setStep("summary")}>Back</Button>
                  <Button className="flex-1" onClick={() => setStep("payment")}
                    disabled={!buyer.first_name || !buyer.last_name || !buyer.email || !buyer.phone}>
                    Continue → Payment
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Payment */}
            {step === "payment" && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="font-display text-2xl font-bold mb-6">Payment Method</h1>
                <div className="space-y-3 mb-5">
                  {PAY_OPTS.filter(o => !o.hide).map(({ method, label, icon, desc }) => (
                    <button key={method} onClick={() => setPayMethod(method)}
                      className={cn("w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all",
                        payMethod === method ? "border-primary bg-primary/5" : "border-border bg-surface-2 hover:border-border/80")}>
                      <span className="text-2xl shrink-0">{icon}</span>
                      <div className="flex-1"><p className="font-medium text-sm">{label}</p><p className="text-xs text-muted">{desc}</p></div>
                      {payMethod === method && <Check className="w-4 h-4 text-primary shrink-0" />}
                    </button>
                  ))}
                </div>

                {["MPESA_STK","MPESA_PAYBILL","MPESA_BUY_GOODS"].includes(payMethod) && (
                  <div className="mb-5 p-4 bg-surface-2 border border-border rounded-xl space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">
                        {payMethod === "MPESA_STK" ? "M-Pesa Number" : "Your M-Pesa Number (for confirmation)"}
                      </label>
                      <input value={mpesaPhone || buyer.phone} onChange={e => setMpesaPhone(e.target.value)} placeholder="07XXXXXXXX" className={INPUT} />
                      {payMethod === "MPESA_STK" && <p className="text-xs text-muted mt-1.5">You'll receive an STK push — enter your M-Pesa PIN to pay</p>}
                    </div>
                    {payMethod === "MPESA_PAYBILL" && (
                      <div className="bg-surface border border-border rounded-lg p-3 space-y-1.5 text-sm">
                        <p className="font-medium mb-1 flex items-center gap-1.5"><Hash className="w-3.5 h-3.5 text-primary" />Paybill Details</p>
                        {[["Paybill Number","522522"],["Account Number", order?.order_number || "Your Order #"],["Amount",`KES ${total.toLocaleString()}`]].map(([l,v]) => (
                          <div key={l} className="flex justify-between"><span className="text-muted">{l}</span><span className="font-mono font-medium">{v}</span></div>
                        ))}
                        <p className="text-xs text-warning mt-1">⚠ Use your exact order number as the account — confirmation is manual (up to 30 min)</p>
                      </div>
                    )}
                    {payMethod === "MPESA_BUY_GOODS" && (
                      <div className="bg-surface border border-border rounded-lg p-3 space-y-1.5 text-sm">
                        <p className="font-medium mb-1 flex items-center gap-1.5"><Hash className="w-3.5 h-3.5 text-primary" />Buy Goods Details</p>
                        {[["Till Number","1234567"],["Amount",`KES ${total.toLocaleString()}`]].map(([l,v]) => (
                          <div key={l} className="flex justify-between"><span className="text-muted">{l}</span><span className="font-mono font-medium">{v}</span></div>
                        ))}
                        <p className="text-xs text-warning mt-1">⚠ Send the exact amount. Manual confirmation may take up to 30 min.</p>
                      </div>
                    )}
                  </div>
                )}

                {payMethod === "USSD" && (
                  <div className="mb-5 p-4 bg-surface-2 border border-border rounded-xl space-y-2">
                    <div className="flex items-center gap-2 mb-1"><Smartphone className="w-4 h-4 text-primary" /><p className="font-medium text-sm">USSD Payment</p></div>
                    <p className="text-sm text-muted">On your feature phone, dial:</p>
                    <p className="font-mono text-xl font-bold text-primary tracking-widest">*334#</p>
                    <p className="text-xs text-muted">Follow the prompts and enter order reference:</p>
                    <p className="font-mono font-bold text-sm">{order?.order_number || "—"}</p>
                    <p className="text-xs text-warning mt-1">⚠ No smartphone needed. Works on all Safaricom lines.</p>
                  </div>
                )}

                {payMethod === "BANK_TRANSFER" && (
                  <div className="mb-5 p-4 bg-surface-2 border border-border rounded-xl space-y-2">
                    <div className="flex items-center gap-2 mb-2"><Building2 className="w-4 h-4 text-primary" /><p className="font-medium text-sm">Bank Account Details</p></div>
                    {[["Bank","Equity Bank Kenya"],["Account Name","EliteTicketPass Ltd"],["Account No.","0123456789012"],["Branch","Westlands, Nairobi"],["Reference", order?.order_number || "—"]].map(([l,v]) => (
                      <div key={l} className="flex justify-between text-sm"><span className="text-muted">{l}</span><span className="font-mono text-xs">{v}</span></div>
                    ))}
                    <p className="text-xs text-warning mt-2 flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />Use your order number as the payment reference. Allow 1–2 business days.
                    </p>
                  </div>
                )}

                {availErr && (
                  <div className="mb-4 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{availErr}
                  </div>
                )}

                {/* T&C */}
                <label className="flex items-start gap-3 mb-6 cursor-pointer group">
                  <div className={cn("w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                    agreed ? "border-primary bg-primary" : "border-border group-hover:border-primary/50")}
                    onClick={() => setAgreed(v => !v)}>
                    {agreed && <Check className="w-3 h-3 text-background" />}
                  </div>
                  <span className="text-sm text-muted leading-relaxed">
                    I agree to the <Link href="/terms" className="text-primary hover:underline">Terms & Conditions</Link> and{" "}
                    <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
                    Tickets are non-transferable unless stated otherwise.
                  </span>
                </label>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setStep("buyer")}>Back</Button>
                  <Button className="flex-1" loading={confirming} disabled={!agreed} onClick={checkAndPay}>
                    {isFree ? "Confirm Free Tickets →" : `Pay KES ${total.toLocaleString()} →`}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Awaiting */}
            {step === "awaiting" && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">

                {/* Payment status trail */}
                <div className="flex items-center justify-center gap-2 mb-8 text-xs">
                  {(["PENDING","PROCESSING","CONFIRMED"] as PayStatus[]).map((s, i, arr) => {
                    const done = (["PROCESSING","CONFIRMED"].includes(payStatus) && s === "PENDING") || (payStatus === "CONFIRMED" && s === "PROCESSING");
                    const active = s === payStatus;
                    return (
                      <div key={s} className="flex items-center gap-2">
                        <div className={cn("flex items-center gap-1 font-medium transition-colors",
                          done ? "text-success" : active ? "text-primary" : "text-muted")}>
                          {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : active ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Circle className="w-3.5 h-3.5" />}
                          {s.charAt(0)+s.slice(1).toLowerCase()}
                        </div>
                        {i < arr.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-border" />}
                      </div>
                    );
                  })}
                </div>

                {isDuplicate ? (
                  <>
                    <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-warning/10 border-2 border-warning flex items-center justify-center">
                      <AlertCircle className="w-10 h-10 text-warning" />
                    </div>
                    <h2 className="font-display text-2xl font-bold mb-2">Payment already initiated</h2>
                    <p className="text-muted text-sm mb-6 max-w-xs mx-auto">A payment for this order is already in progress. Please wait — we'll confirm automatically.</p>
                  </>
                ) : paybillInfo ? (
                  <>
                    <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
                      <Hash className="w-10 h-10 text-primary" />
                    </div>
                    <h2 className="font-display text-2xl font-bold mb-3">Complete your Paybill payment</h2>
                    <div className="bg-surface-2 border border-border rounded-xl p-4 text-left max-w-xs mx-auto mb-6 space-y-2 text-sm">
                      {[["Paybill", paybillInfo.number],["Account", paybillInfo.account],["Amount",`KES ${total.toLocaleString()}`]].map(([l,v]) => (
                        <div key={l} className="flex justify-between"><span className="text-muted">{l}</span><span className="font-mono font-bold">{v}</span></div>
                      ))}
                    </div>
                    <p className="text-xs text-muted mb-6">We'll confirm your payment automatically once received.</p>
                  </>
                ) : ussdCode ? (
                  <>
                    <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
                      <Smartphone className="w-10 h-10 text-primary" />
                    </div>
                    <h2 className="font-display text-2xl font-bold mb-3">Dial USSD to pay</h2>
                    <p className="font-mono text-3xl font-black text-primary tracking-widest mb-3">{ussdCode}</p>
                    <p className="text-muted text-sm mb-6">Follow the prompts and use <strong>{order?.order_number}</strong> as your reference</p>
                  </>
                ) : (
                  <>
                    <div className="relative w-24 h-24 mx-auto mb-6">
                      <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />
                      <div className="w-24 h-24 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
                        <Phone className="w-10 h-10 text-primary" />
                      </div>
                    </div>
                    <h2 className="font-display text-2xl font-bold mb-2">Check your phone</h2>
                    <p className="text-muted text-sm mb-1 max-w-xs mx-auto">M-Pesa prompt sent to</p>
                    <p className="font-semibold mb-2">{mpesaPhone || buyer.phone}</p>
                    <p className="text-muted text-xs mb-6">Enter your M-Pesa PIN to complete payment</p>

                    {/* Retry STK */}
                    {stkRetries < 3 ? (
                      <button onClick={retryStkPush} disabled={stkCooldown > 0}
                        className={cn("text-sm font-medium mb-4 transition-colors",
                          stkCooldown > 0 ? "text-muted cursor-not-allowed" : "text-primary hover:underline")}>
                        {stkCooldown > 0 ? `Resend in ${stkCooldown}s` : stkRetries > 0 ? `Resend STK Push (${3-stkRetries} left)` : "Didn't get the prompt? Resend"}
                      </button>
                    ) : (
                      <p className="text-xs text-muted mb-4">Max retries reached. Try a different payment method.</p>
                    )}
                  </>
                )}

                <div className="flex items-center justify-center gap-2 text-muted text-sm mb-3">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Waiting for confirmation…
                </div>
                <div className={cn("text-xl font-mono font-bold mb-5", timerCls)}>{mins}:{secs}</div>
                {!isDuplicate && (
                  <button onClick={() => { setStep("payment"); setIsDuplicate(false); setPaybillInfo(null); setUssdCode(""); }}
                    className="text-xs text-muted hover:text-foreground underline">
                    ← Change payment method
                  </button>
                )}
              </motion.div>
            )}

            {/* QR Lightbox */}
            {qrLightbox && (
              <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-6" onClick={() => setQrLightbox(null)}>
                <button className="absolute top-5 right-5 text-white/60 hover:text-white" onClick={() => setQrLightbox(null)}>
                  <X className="w-7 h-7" />
                </button>
                <div className="text-center" onClick={e => e.stopPropagation()}>
                  <img src={qrLightbox} alt="QR Code" className="w-72 h-72 mx-auto rounded-xl border-4 border-white/10 bg-white p-2" />
                  <p className="text-white/50 text-xs mt-4">Show this QR code at the gate</p>
                </div>
              </div>
            )}

            {/* Success */}
            {step === "success" && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full">
                <div className="flex items-center gap-3 mb-6">
                  <h1 className="font-display text-2xl font-bold">Payment Confirmation</h1>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column (Main Success Card) */}
                  <div className="lg:col-span-2 bg-surface-2 border border-border rounded-xl p-8 lg:p-12 text-center shadow-sm">
                    {/* SVG Illustration */}
                    <div className="flex justify-center mb-8 relative">
                      <svg width="200" height="150" viewBox="0 0 200 150" fill="none" xmlns="http://www.w3.org/2000/svg" className="mx-auto">
                        {/* Confetti & Bursts */}
                        <circle cx="45" cy="40" r="3" fill="#3b82f6" />
                        <circle cx="55" cy="45" r="2" fill="#ef4444" />
                        <circle cx="150" cy="55" r="2" fill="#3b82f6" />
                        <circle cx="155" cy="35" r="2.5" fill="#f59e0b" />
                        <circle cx="35" cy="78" r="2" fill="#10b981" />
                        <circle cx="170" cy="85" r="2" fill="#ef4444" />
                        <path d="M72 45L65 30" stroke="#ef4444" strokeWidth="3" strokeLinecap="round"/>
                        <path d="M128 45L135 30" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round"/>
                        <path d="M92 35L90 20" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round"/>
                        <path d="M108 35L110 20" stroke="#10b981" strokeWidth="3" strokeLinecap="round"/>
                        <path d="M50 60L35 55" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round"/>
                        <path d="M48 68L35 68" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round"/>
                        <path d="M150 60L165 55" stroke="#ef4444" strokeWidth="3" strokeLinecap="round"/>
                        {/* Cloud base */}
                        <path d="M140 125 H60 C48.9543 125 40 116.046 40 105 C40 93.9543 48.9543 85 60 85 C61.1046 85 63.3137 85 65 85 C68.3137 73.9543 78.9543 65 92 65 C105.046 65 115.686 73.9543 119 85 C121 85 122.895 85 124 85 C132.837 85 140 92.1634 140 101 C140 109.837 132.837 117 124 117 C120 117 117 117 114 117 C109.582 117 106 120.582 106 125 H140 Z" fill="#bfdbfe" />
                        <path d="M30 125 H170" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round"/>
                        {/* Credit Card */}
                        <rect x="65" y="60" width="70" height="45" rx="4" fill="#9ca3af" />
                        <rect x="65" y="68" width="70" height="10" fill="#1e3a8a" />
                        <rect x="75" y="85" width="20" height="6" rx="2" fill="#e5e7eb" />
                        {/* Green Check Badge */}
                        <circle cx="120" cy="55" r="16" fill="#10b981" />
                        <path d="M113 55 L118 60 L127 49" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>

                    <h2 className="font-display text-3xl font-bold text-success mb-6">Success!</h2>
                    <p className="text-sm font-medium mb-3 max-w-lg mx-auto leading-relaxed text-foreground">
                      Hi <strong>{buyer.first_name || (order as any)?.buyer_first_name}</strong> your payment for <strong>{order?.event_title}</strong> is successful.
                    </p>
                    <p className="text-xs text-muted mb-8 max-w-lg mx-auto">
                      An email has been sent to <strong>{buyer.email || (order as any)?.buyer_email}</strong> with more information.
                    </p>

                    {/* Ticket cards inline (retained functionality) */}
                    {tickets.length > 0 && (
                      <div className="border-t border-border pt-8 text-left">
                        <p className="font-semibold text-sm mb-4 flex items-center justify-between">
                          <span>Your Tickets</span>
                          {orderNumber && <span className="font-mono text-xs text-muted font-normal">Order #{orderNumber}</span>}
                        </p>
                        <div className="space-y-3 mb-6 text-left">
                          {tickets.map((t: any) => (
                            <div key={t.id} className="bg-background border border-border rounded-xl p-4 flex items-start gap-4 shadow-sm">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-base">{t.tier_name}</p>
                                <p className="text-sm text-muted font-mono mt-0.5">{t.ticket_number}</p>
                                <p className="text-sm text-muted mt-1 mb-3">{t.holder_name}</p>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="h-8 text-xs font-medium"
                                  onClick={() => downloadTicketPdf(t.qr_token, t.ticket_number)}
                                  disabled={downloadingPdf === t.qr_token}
                                >
                                  {downloadingPdf === t.qr_token ? (
                                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                  ) : (
                                    <Download className="w-3.5 h-3.5 mr-1.5" />
                                  )}
                                  Download PDF
                                </Button>
                              </div>
                              {t.qr_code_url && (
                                <button onClick={() => setQrLightbox(t.qr_code_url)}
                                  className="shrink-0 group relative" title="Tap to expand">
                                  <img src={t.qr_code_url} alt="QR" className="w-24 h-24 rounded-lg border border-border bg-white p-1 group-hover:opacity-80 transition-opacity" />
                                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ZoomIn className="w-6 h-6 text-white drop-shadow" />
                                  </div>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-col sm:flex-row justify-center gap-3">
                          <Button size="sm" onClick={() => router.push("/profile/tickets")}>
                            <Ticket className="w-4 h-4 mr-2" /> View My Tickets
                          </Button>
                          {order?.event_date && (
                            <a href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(order.event_title || '')}&dates=${new Date(order.event_date).toISOString().replace(/[-:]/g,'').split('.')[0]+'Z'}/${new Date(order.event_date).toISOString().replace(/[-:]/g,'').split('.')[0]+'Z'}&location=${encodeURIComponent(`${order.venue_name || ''}, ${order.venue_city || ''}`)}`}
                               target="_blank" rel="noreferrer">
                              <Button variant="outline" size="sm" className="w-full">
                                <CalendarPlus className="w-4 h-4 mr-2" /> Add to Calendar
                              </Button>
                            </a>
                          )}
                          <Button variant="outline" size="sm" onClick={() => router.push("/events")}>Browse Events</Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column (Sidebar) */}
                  <div className="lg:col-span-1 space-y-6">
                    {/* Support Card */}
                    <div className="bg-surface-2 border border-border rounded-xl p-6 text-center">
                      <h3 className="font-bold text-lg mb-3">Customer Support</h3>
                      <p className="text-xs text-muted mb-4">In case of a support query, call us on</p>
                      <p className="text-sm font-medium mb-3 flex items-center justify-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-muted" /> +254 709 816 000
                      </p>
                      <a href="mailto:events@eliteticketpass.com" className="text-sm font-medium text-error hover:underline break-all">
                        events@eliteticketpass.com
                      </a>
                    </div>
                    
                    {/* Share Card */}
                    <div className="bg-surface-2 border border-border rounded-xl p-6 text-center">
                      <h3 className="font-bold text-lg mb-3">Share</h3>
                      <p className="text-xs text-muted mb-5 leading-relaxed">
                        For now you can head on and tell your friends to join you too.
                      </p>
                      <div className="flex items-center justify-center gap-3">
                        <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I just got tickets to ${order?.event_title}! Join me 🎟️`)}`} target="_blank" rel="noreferrer" 
                          className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors" title="Share on X (Twitter)">
                          <Twitter className="w-5 h-5 fill-current" />
                        </a>
                        <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin + '/events/' + (order?.event_slug || '') : '')}`} target="_blank" rel="noreferrer" 
                          className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors" title="Share on Facebook">
                          <Facebook className="w-5 h-5 fill-current" />
                        </a>
                        <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin + '/events/' + (order?.event_slug || '') : '')}`} target="_blank" rel="noreferrer" 
                          className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors" title="Share on LinkedIn">
                          <Linkedin className="w-5 h-5 fill-current" />
                        </a>
                        <a href={`https://wa.me/?text=${encodeURIComponent(`🎉 I just got tickets to ${order?.event_title}! Join me 🎟️ — book yours at ${typeof window !== 'undefined' ? window.location.origin + '/events/' + (order?.event_slug || '') : ''}`)}`} target="_blank" rel="noreferrer" 
                          className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors" title="Share on WhatsApp">
                          <MessageCircle className="w-5 h-5" />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Failed */}
            {step === "failed" && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center py-12">
                <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-error/10 border-2 border-error flex items-center justify-center">
                  <XCircle className="w-10 h-10 text-error" />
                </div>
                <h2 className="font-display text-2xl font-bold mb-2">Payment failed</h2>
                <p className="text-muted text-sm mb-3 max-w-xs mx-auto">
                  {timeLeft === 0
                    ? "Your ticket hold expired. Please restart your order."
                    : "Payment was cancelled or could not be processed."}
                </p>
                {failReason && (
                  <div className="inline-flex items-start gap-2 bg-error/5 border border-error/20 rounded-lg px-3 py-2 text-sm text-error mb-6 max-w-xs mx-auto">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{failReason}
                  </div>
                )}
                <div className="flex flex-col gap-3 max-w-xs mx-auto mt-4">
                  {timeLeft > 0 && <Button onClick={() => { setAvailErr(""); setFailReason(""); setStep("payment"); }}>Try Again</Button>}
                  <Button variant="outline" onClick={() => router.push("/events")}>Browse Events</Button>
                </div>
              </motion.div>
            )}
          </div>

          {/* ── Sticky Order Summary (desktop) ── */}
          {isFlow && (
            <div className="hidden lg:block">
              <p className="text-xs text-muted uppercase tracking-widest mb-3">Order Summary</p>
              <div className="sticky top-24">
                <OrderSummaryPanel order={order} timeLeft={timeLeft} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen pt-32 text-center text-muted animate-pulse">Loading checkout...</div>}>
      <CheckoutContent />
    </Suspense>
  );
}
