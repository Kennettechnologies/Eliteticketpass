"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { formatDateTime, cn, statusColor } from "@/lib/utils";
import { Ticket, Download, Send, X, ArrowRightLeft, Calendar, Wallet, DollarSign, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface TicketItem {
  id: string; ticket_number: string; event_title: string;
  event_starts_at: string; event_venue: string; event_city: string;
  tier_name: string; status: string; qr_code_url: string;
  holder_name: string; checked_in_at: string | null;
  resale_price?: string;
}

interface TransferForm { name: string; email: string; phone: string; }

function TransferModal({ ticket, onClose, onDone }: { ticket: TicketItem; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState<TransferForm>({ name: "", email: "", phone: "" });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!form.name || (!form.email && !form.phone)) { toast.error("Name and email or phone required"); return; }
    setLoading(true);
    const res = await api.post(`/tickets/${ticket.id}/transfer/`, form);
    if (res.success) { toast.success("Ticket transferred!"); onDone(); }
    else toast.error((res as any).error || "Transfer failed");
    setLoading(false);
  };

  const INPUT = "w-full bg-surface border border-border rounded-sm px-4 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-2 border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-bold text-lg">Transfer Ticket</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-muted mb-4">
          Transferring: <strong className="text-foreground">{ticket.tier_name}</strong> — {ticket.event_title}
        </p>
        <div className="space-y-3 mb-5">
          <div><label className="block text-xs font-medium mb-1">Recipient name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={INPUT} placeholder="Full name" /></div>
          <div><label className="block text-xs font-medium mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={INPUT} placeholder="recipient@email.com" /></div>
          <div><label className="block text-xs font-medium mb-1">Phone (WhatsApp)</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={INPUT} placeholder="+2547XXXXXXXX" /></div>
        </div>
        <p className="text-xs text-warning mb-4">⚠ This action cannot be undone. The ticket will be permanently transferred.</p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" loading={loading} onClick={submit}>Transfer Ticket</Button>
        </div>
      </div>
    </div>
  );
}

function ResaleModal({ ticket, onClose, onDone }: { ticket: TicketItem; onClose: () => void; onDone: () => void }) {
  const [price, setPrice] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!price || isNaN(Number(price))) { toast.error("Valid price required"); return; }
    setLoading(true);
    const res = await api.post(`/tickets/${ticket.id}/resale/`, { price });
    if (res.success) { toast.success("Ticket listed for resale!"); onDone(); }
    else toast.error((res as any).error || "Failed to list");
    setLoading(false);
  };

  const INPUT = "w-full bg-surface border border-border rounded-sm px-4 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-2 border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-bold text-lg">List for Resale</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-muted mb-4">
          Listing: <strong className="text-foreground">{ticket.tier_name}</strong> — {ticket.event_title}
        </p>
        <div className="space-y-3 mb-5">
          <div><label className="block text-xs font-medium mb-1">Asking Price (KES) *</label>
            <input value={price} onChange={e => setPrice(e.target.value)} type="number" className={INPUT} placeholder="Amount" /></div>
        </div>
        <p className="text-xs text-muted mb-4">When someone buys this ticket, the platform fee will be deducted from your payout.</p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" loading={loading} onClick={submit}>List Ticket</Button>
        </div>
      </div>
    </div>
  );
}

export default function MyTicketsPage() {
  const [tickets,    setTickets]    = useState<TicketItem[]>([]);
  const [transfers,  setTransfers]  = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<"upcoming" | "past" | "cancelled" | "transfers" | "resale">("upcoming");
  const [expandedQr, setExpandedQr] = useState<string | null>(null);
  const [transfering, setTransfering] = useState<TicketItem | null>(null);
  const [reselling, setReselling] = useState<TicketItem | null>(null);

  const fetchTickets = () => {
    setLoading(true);
    if (tab === "transfers") {
      api.get<{ data: any[] }>(`/tickets/transfers/`).then(r => {
        if (r.success) setTransfers((r as any).data || []);
        setLoading(false);
      });
    } else {
      const statusMap = { upcoming: "ACTIVE", past: "USED", cancelled: "CANCELLED", resale: "FOR_RESALE" };
      api.get<{ results: TicketItem[] }>(`/tickets/?status=${statusMap[tab]}`).then(r => {
        if (r.success) setTickets((r.data as any)?.results || []);
        setLoading(false);
      });
    }
  };
  useEffect(fetchTickets, [tab]);

  const handleResend = async (ticketId: string) => {
    const res = await api.post(`/tickets/${ticketId}/resend/`);
    if (res.success) toast.success("Ticket resent by email!");
    else toast.error("Resend failed. Try again.");
  };

  const handleWhatsApp = async (ticketId: string) => {
    const res = await api.post(`/tickets/${ticketId}/resend/`, { channel: "whatsapp" });
    if (res.success) toast.success("Ticket sent via WhatsApp!");
    else toast.error("WhatsApp delivery failed.");
  };

  const handleDownloadPdf = async (ticketId: string, number: string) => {
    const res = await api.get<{ pdf_base64: string }>(`/tickets/${ticketId}/pdf/`);
    if (res.success && res.data?.pdf_base64) {
      const a = document.createElement("a");
      a.href = `data:application/pdf;base64,${res.data.pdf_base64}`;
      a.download = `ticket-${number}.pdf`;
      a.click();
    } else toast.error("PDF download failed");
  };
  
  const handleCalendar = async (ticketId: string, title: string) => {
    const res = await api.get<{ ics_data: string, filename: string }>(`/tickets/${ticketId}/calendar/`);
    if (res.success && res.data?.ics_data) {
      const a = document.createElement("a");
      a.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(res.data.ics_data)}`;
      a.download = res.data.filename || `${title}.ics`;
      a.click();
    } else toast.error("Failed to generate calendar file");
  };
  
  const handleWallet = async (ticketId: string) => {
    const res = await api.get<{ pkpass_base64: string }>(`/tickets/${ticketId}/wallet/`);
    if (res.success && res.data?.pkpass_base64) {
      if (res.data.pkpass_base64.includes("MOCK")) {
        toast.info("Wallet integration pending Apple Developer certificates.");
        return;
      }
      const a = document.createElement("a");
      a.href = `data:application/vnd.apple.pkpass;base64,${res.data.pkpass_base64}`;
      a.download = `ticket.pkpass`;
      a.click();
    } else toast.error("Failed to generate wallet pass");
  };
  
  const handleToggleResale = async (ticketId: string) => {
    const res = await api.post(`/tickets/${ticketId}/resale/`);
    if (res.success) {
      toast.success("Resale cancelled. Ticket is active again.");
      fetchTickets();
    } else toast.error("Failed to cancel resale.");
  };
  
  const handleCancelTransfer = async (transferId: string) => {
    const res = await api.post(`/tickets/transfer/cancel/${transferId}/`);
    if (res.success) {
      toast.success("Transfer cancelled.");
      fetchTickets();
    } else toast.error("Failed to cancel transfer.");
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">My Tickets</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-2 border border-border rounded-lg p-1 w-fit overflow-x-auto max-w-full">
        {(["upcoming", "past", "cancelled", "transfers", "resale"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-2 rounded-sm text-sm font-medium capitalize transition-all whitespace-nowrap",
              tab === t ? "bg-primary text-background" : "text-muted hover:text-foreground")}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-surface-2 border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : tab === "transfers" ? (
        transfers.length === 0 ? (
          <div className="text-center py-20">
            <ArrowRightLeft className="w-12 h-12 text-muted mx-auto mb-4" />
            <h3 className="font-display text-lg font-bold mb-2">No transfers yet</h3>
            <p className="text-muted text-sm">Tickets you send to others will appear here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {transfers.map(t => (
              <div key={t.id} className="bg-surface-2 border border-border rounded-xl p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                      t.direction === "sent" ? "bg-blue-500/10 text-blue-500" : "bg-purple-500/10 text-purple-500"
                    )}>{t.direction === "sent" ? "Sent" : "Received"}</span>
                    <span className={cn("text-xs font-medium",
                      t.status === "PENDING" ? "text-warning" : t.status === "ACCEPTED" ? "text-success" : "text-error"
                    )}>{t.status}</span>
                  </div>
                  <h3 className="font-semibold truncate">{t.event_title}</h3>
                  <p className="text-sm text-muted">To: {t.to_email}</p>
                </div>
                {t.direction === "sent" && t.status === "PENDING" && (
                  <Button variant="outline" size="sm" onClick={() => handleCancelTransfer(t.id)}>Cancel</Button>
                )}
              </div>
            ))}
          </div>
        )
      ) : tickets.length === 0 ? (
        <div className="text-center py-20">
          <Ticket className="w-12 h-12 text-muted mx-auto mb-4" />
          <h3 className="font-display text-lg font-bold mb-2">No {tab} tickets</h3>
          <p className="text-muted text-sm">Tickets you purchase will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tickets.map(ticket => (
            <div key={ticket.id} className="bg-surface-2 border border-border rounded-xl overflow-hidden">
              <div className="p-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{ticket.event_title}</h3>
                  <p className="text-sm text-muted">{ticket.tier_name}</p>
                  <p className="text-xs text-muted mt-1">{formatDateTime(ticket.event_starts_at)}</p>
                  <p className="text-xs text-muted">{ticket.event_venue}, {ticket.event_city}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs font-mono text-muted">{ticket.ticket_number}</span>
                    <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", statusColor(ticket.status))}>{ticket.status}</span>
                    {ticket.checked_in_at && <span className="text-xs text-success">✓ Checked in</span>}
                    {ticket.resale_price && <span className="text-xs text-warning">Resale: KES {ticket.resale_price}</span>}
                  </div>
                </div>
                {ticket.qr_code_url && (
                  <button onClick={() => setExpandedQr(expandedQr === ticket.id ? null : ticket.id)} className="shrink-0">
                    <img src={ticket.qr_code_url} alt="QR" className="w-16 h-16 rounded border border-border hover:opacity-80 transition-opacity" />
                  </button>
                )}
              </div>

              {expandedQr === ticket.id && ticket.qr_code_url && (
                <div className="px-4 pb-4 flex justify-center">
                  <img src={ticket.qr_code_url} alt="QR Code" className="w-52 h-52 rounded-lg" />
                </div>
              )}

              <div className="flex gap-2 flex-wrap px-4 pb-4">
                <button onClick={() => handleDownloadPdf(ticket.id, ticket.ticket_number)}
                  className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground border border-border rounded-sm px-3 py-1.5 transition-colors">
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
                <button onClick={() => handleCalendar(ticket.id, ticket.event_title)}
                  className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground border border-border rounded-sm px-3 py-1.5 transition-colors">
                  <Calendar className="w-3.5 h-3.5" /> Calendar
                </button>
                <button onClick={() => handleWallet(ticket.id)}
                  className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground border border-border rounded-sm px-3 py-1.5 transition-colors">
                  <Wallet className="w-3.5 h-3.5" /> Wallet
                </button>
                <button onClick={() => handleResend(ticket.id)}
                  className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground border border-border rounded-sm px-3 py-1.5 transition-colors">
                  <Send className="w-3.5 h-3.5" /> Email
                </button>
                {ticket.status === "ACTIVE" && (
                  <>
                    <button onClick={() => setTransfering(ticket)}
                      className="flex items-center gap-1.5 text-xs text-muted hover:text-primary border border-border rounded-sm px-3 py-1.5 transition-colors">
                      <ArrowRightLeft className="w-3.5 h-3.5" /> Transfer
                    </button>
                    <button onClick={() => setReselling(ticket)}
                      className="flex items-center gap-1.5 text-xs text-muted hover:text-success border border-border rounded-sm px-3 py-1.5 transition-colors">
                      <DollarSign className="w-3.5 h-3.5" /> Sell
                    </button>
                  </
                  >
                )}
                {ticket.status === "FOR_RESALE" && (
                  <button onClick={() => handleToggleResale(ticket.id)}
                    className="flex items-center gap-1.5 text-xs text-warning hover:text-error border border-border rounded-sm px-3 py-1.5 transition-colors">
                    <RefreshCw className="w-3.5 h-3.5" /> Cancel Sale
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {transfering && (
        <TransferModal
          ticket={transfering}
          onClose={() => setTransfering(null)}
          onDone={() => { setTransfering(null); fetchTickets(); }}
        />
      )}
      
      {reselling && (
        <ResaleModal
          ticket={reselling}
          onClose={() => setReselling(null)}
          onDone={() => { setReselling(null); fetchTickets(); }}
        />
      )}
    </div>
  );
}
