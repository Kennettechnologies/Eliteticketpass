"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Navbar } from "@/components/layout/navbar";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MapPin, Calendar, Tag, Shield, Search, X } from "lucide-react";

interface ResaleTicket {
  id: string;
  event_title: string;
  event_starts_at: string;
  event_venue: string;
  event_city: string;
  tier_name: string;
  resale_price: string;
  ticket_number: string;
}

export default function MarketplacePage() {
  const [tickets, setTickets] = useState<ResaleTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  const [buying, setBuying] = useState<ResaleTicket | null>(null);

  const fetchTickets = () => {
    setLoading(true);
    api.get<{ data: ResaleTicket[] }>("/tickets/marketplace/").then(r => {
      if (r.success) setTickets((r as any).data || []);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const filtered = tickets.filter(t => 
    t.event_title.toLowerCase().includes(search.toLowerCase()) || 
    t.event_city.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      <main className="flex-1 pt-24 pb-20">
        <div className="max-w-6xl mx-auto px-4">
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
            <div>
              <h1 className="font-display text-4xl font-bold tracking-tight mb-3">Ticket Marketplace</h1>
              <p className="text-muted max-w-2xl text-lg">
                Buy tickets safely from other fans. All tickets are verified and instantly transferred to your account upon purchase.
              </p>
            </div>
            
            <div className="relative w-full md:w-80 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input 
                type="text" 
                placeholder="Search events or cities..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-full pl-10 pr-4 h-11 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
          </div>
          
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="h-48 bg-surface-2 border border-border rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-32 bg-surface-2 border border-border rounded-2xl">
              <Tag className="w-12 h-12 text-muted mx-auto mb-4 opacity-50" />
              <h3 className="font-display text-xl font-bold mb-2">No tickets available</h3>
              <p className="text-muted">There are currently no tickets listed for resale.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map(ticket => (
                <div key={ticket.id} className="bg-surface border border-border rounded-2xl overflow-hidden hover:border-primary/50 transition-colors group flex flex-col">
                  <div className="p-5 flex-1">
                    <div className="flex justify-between items-start mb-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                        Verified Resale
                      </span>
                      <span className="font-mono text-xs text-muted opacity-50">{ticket.ticket_number}</span>
                    </div>
                    
                    <h3 className="font-display font-bold text-lg mb-4 group-hover:text-primary transition-colors line-clamp-2">
                      {ticket.event_title}
                    </h3>
                    
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <Calendar className="w-4 h-4 shrink-0" />
                        <span className="truncate">{formatDateTime(ticket.event_starts_at)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <MapPin className="w-4 h-4 shrink-0" />
                        <span className="truncate">{ticket.event_venue}, {ticket.event_city}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <Tag className="w-4 h-4 shrink-0" />
                        <span className="truncate">Tier: {ticket.tier_name}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-5 border-t border-border bg-surface-2 flex items-center justify-between mt-auto">
                    <div>
                      <p className="text-xs text-muted mb-0.5">Asking Price</p>
                      <p className="font-bold text-lg">KES {ticket.resale_price}</p>
                    </div>
                    <Button onClick={() => setBuying(ticket)}>Buy Ticket</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
        </div>
      </main>

      {buying && (
        <CheckoutModal 
          ticket={buying} 
          onClose={() => setBuying(null)} 
          onSuccess={() => {
            setBuying(null);
            fetchTickets();
          }} 
        />
      )}
    </div>
  );
}

function CheckoutModal({ ticket, onClose, onSuccess }: { ticket: ResaleTicket, onClose: () => void, onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    setLoading(true);
    
    // We send a dummy phone number since Paystack doesn't need it for init
    // but the backend might still be expecting `phone` in the payload (or we can just remove it from backend requirement).
    // The backend Resale Checkout now uses `request.user.email`.
    const res = await api.post<{ authorization_url: string }>("/tickets/marketplace/checkout/", { ticket_id: ticket.id, phone: "000" });
    
    if (res.success && res.data?.authorization_url) {
      window.location.href = res.data.authorization_url;
    } else {
      toast.error((res as any).error || "Checkout failed");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-2 border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        
        <div className="p-6 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold text-lg">Secure Checkout</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="p-6 bg-surface">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 bg-primary/10 text-primary rounded-xl shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold">{ticket.event_title}</h3>
              <p className="text-sm text-muted">{ticket.tier_name} Ticket</p>
            </div>
          </div>
          
          <div className="flex items-center justify-between py-4 border-y border-border mb-6">
            <span className="text-muted">Total to pay</span>
            <span className="font-display font-bold text-xl">KES {ticket.resale_price}</span>
          </div>

          <div className="space-y-4">
            <Button className="w-full h-12 text-base" onClick={handlePay} loading={loading}>
              Pay KES {ticket.resale_price} with Paystack
            </Button>
            <p className="text-xs text-muted text-center">
              You will be redirected to Paystack to complete your secure payment.
            </p>
          </div>
        </div>
        
      </div>
    </div>
  );
}
