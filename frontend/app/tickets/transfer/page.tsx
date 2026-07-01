"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { formatDateTime, cn } from "@/lib/utils";
import { ArrowRightLeft, CheckCircle2, XCircle, Clock, ExternalLink, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface Transfer {
  id: string;
  transfer_token: string;
  status: "PENDING" | "ACCEPTED" | "CANCELLED" | "EXPIRED";
  direction: "sent" | "received";
  ticket_number: string;
  tier_name: string;
  event_title: string;
  event_slug: string;
  event_date: string | null;
  to_email: string;
  to_name: string;
  sender_name: string;
  accepted_at: string | null;
  declined_at: string | null;
  decline_reason: string;
  expires_at: string;
  created_at: string;
}

const STATUS_CONFIG = {
  PENDING:   { label: "Pending",  icon: Clock,         cls: "text-warning bg-warning/10" },
  ACCEPTED:  { label: "Accepted", icon: CheckCircle2,  cls: "text-success bg-success/10" },
  CANCELLED: { label: "Declined", icon: XCircle,       cls: "text-error bg-error/10" },
  EXPIRED:   { label: "Expired",  icon: Clock,         cls: "text-muted bg-muted/10" },
};

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<"all" | "sent" | "received">("all");

  useEffect(() => {
    api.get<Transfer[]>("/tickets/transfers/").then(r => {
      if (r.success) setTransfers((r.data as any) || []);
      setLoading(false);
    });
  }, []);

  const filtered = tab === "all" ? transfers : transfers.filter(t => t.direction === tab);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="p-2 rounded-lg hover:bg-surface-2 transition-colors text-muted hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <ArrowRightLeft className="w-6 h-6 text-primary" />
          <h1 className="font-display text-2xl font-bold">Ticket Transfers</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(["all", "sent", "received"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors",
                tab === t ? "bg-primary text-background" : "bg-surface-2 text-muted hover:text-foreground"
              )}>
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-24 bg-surface-2 border border-border rounded-xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <ArrowRightLeft className="w-12 h-12 text-muted mx-auto mb-4" />
            <h3 className="font-display text-lg font-bold mb-2">No transfers yet</h3>
            <p className="text-muted text-sm">Ticket transfers will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(t => {
              const cfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.EXPIRED;
              const Icon = cfg.icon;
              return (
                <div key={t.id} className="bg-surface-2 border border-border rounded-xl p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Direction badge */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1", cfg.cls)}>
                          <Icon className="w-3 h-3" /> {cfg.label}
                        </span>
                        <span className="text-xs text-muted capitalize bg-surface px-2 py-0.5 rounded-full border border-border">
                          {t.direction === "sent" ? "You sent" : "Received"}
                        </span>
                      </div>

                      {/* Event + ticket */}
                      {t.event_slug ? (
                        <Link href={`/events/${t.event_slug}`}
                          className="font-semibold text-sm hover:text-primary transition-colors flex items-center gap-1 line-clamp-1 mb-0.5">
                          {t.event_title} <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
                        </Link>
                      ) : (
                        <p className="font-semibold text-sm mb-0.5">{t.event_title}</p>
                      )}
                      <p className="text-xs text-muted">
                        {t.ticket_number} · {t.tier_name}
                      </p>

                      {/* Who */}
                      <p className="text-xs text-muted mt-1.5">
                        {t.direction === "sent"
                          ? <>To: <span className="text-foreground">{t.to_name}</span> ({t.to_email})</>
                          : <>From: <span className="text-foreground">{t.sender_name}</span></>
                        }
                      </p>

                      {/* Decline reason */}
                      {t.status === "CANCELLED" && t.decline_reason && (
                        <p className="text-xs text-error mt-1.5 bg-error/5 rounded px-2 py-1">
                          Reason: {t.decline_reason}
                        </p>
                      )}
                    </div>

                    {/* Date + action */}
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted">{formatDateTime(t.created_at)}</p>
                      {t.accepted_at && (
                        <p className="text-xs text-success mt-1">Accepted {formatDateTime(t.accepted_at)}</p>
                      )}
                      {t.declined_at && (
                        <p className="text-xs text-error mt-1">Declined {formatDateTime(t.declined_at)}</p>
                      )}
                      
                      {t.status === "PENDING" && t.direction === "received" && (
                        <Link href={`/tickets/transfer/${t.transfer_token}`}
                          className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
                          Accept / Decline →
                        </Link>
                      )}
                      
                      {t.status === "PENDING" && t.direction === "sent" && (
                        <button
                          onClick={async () => {
                            if (!confirm("Are you sure you want to cancel this transfer?")) return;
                            const res = await api.post(`/tickets/transfer/cancel/${t.id}/`);
                            if (res.success) {
                              setTransfers(prev => prev.map(pt => pt.id === t.id ? { ...pt, status: "CANCELLED", decline_reason: "Cancelled by sender" } : pt));
                            } else {
                              alert((res as any).error || "Failed to cancel transfer.");
                            }
                          }}
                          className="mt-2 text-xs font-medium text-error hover:underline block w-full text-right">
                          Cancel Transfer
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
