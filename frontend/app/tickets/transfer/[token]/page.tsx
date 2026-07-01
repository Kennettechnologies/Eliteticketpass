"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Ticket, Loader2, Calendar, MapPin, User } from "lucide-react";
import Link from "next/link";

interface TransferInfo {
  status: string;
  expires_at: string;
  event_title: string;
  event_date: string;
  venue_name: string;
  venue_city: string;
  ticket_number: string;
  tier_name: string;
  sender_name: string;
  to_email: string;
}

type PageState = "loading" | "idle" | "declining" | "accepting" | "accepted" | "declined" | "error" | "already_resolved";

export default function TransferAcceptPage() {
  const params = useParams();
  const token = params.token as string;

  const [pageState, setPageState] = useState<PageState>("loading");
  const [info, setInfo]           = useState<TransferInfo | null>(null);
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason]     = useState("");
  const [errorMsg, setErrorMsg]               = useState("");

  useEffect(() => {
    api.get<TransferInfo>(`/tickets/transfer/info/${token}/`).then(res => {
      if (!res.success) { setErrorMsg((res as any).error || "Transfer not found."); setPageState("error"); return; }
      const data = res.data as TransferInfo;
      setInfo(data);
      if (data.status !== "PENDING") setPageState("already_resolved");
      else setPageState("idle");
    });
  }, [token]);

  const accept = async () => {
    setPageState("accepting");
    const res = await api.post<any>(`/tickets/transfer/accept/${token}/`);
    if (res.success) setPageState("accepted");
    else { setErrorMsg((res as any).error || "Failed to accept."); setPageState("error"); }
  };

  const decline = async () => {
    setPageState("declining");
    const res = await api.post<any>(`/tickets/transfer/decline/${token}/`, { reason: declineReason });
    if (res.success) setPageState("declined");
    else { setErrorMsg((res as any).error || "Failed to decline."); setPageState("error"); }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-KE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  if (pageState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (pageState === "accepted") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="bg-surface-2 border border-border rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
          <CheckCircle2 className="w-16 h-16 text-success mx-auto mb-4" />
          <h1 className="text-2xl font-display font-bold mb-2">Ticket Accepted!</h1>
          <p className="text-muted mb-6">The ticket has been added to your account.</p>
          <Link href="/profile/tickets"><Button className="w-full">View My Tickets</Button></Link>
        </div>
      </div>
    );
  }

  if (pageState === "declined") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="bg-surface-2 border border-border rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
          <XCircle className="w-16 h-16 text-muted mx-auto mb-4" />
          <h1 className="text-2xl font-display font-bold mb-2">Transfer Declined</h1>
          <p className="text-muted mb-6">The ticket has been returned to the original owner.</p>
          <Link href="/events"><Button variant="outline" className="w-full">Browse Events</Button></Link>
        </div>
      </div>
    );
  }

  if (pageState === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="bg-surface-2 border border-border rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
          <XCircle className="w-16 h-16 text-error mx-auto mb-4" />
          <h1 className="text-2xl font-display font-bold mb-2">Something went wrong</h1>
          <p className="text-muted mb-6">{errorMsg}</p>
          <Link href="/events"><Button variant="outline" className="w-full">Browse Events</Button></Link>
        </div>
      </div>
    );
  }

  if (pageState === "already_resolved" && info) {
    const resolved = info.status === "ACCEPTED" ? "accepted" : info.status === "CANCELLED" ? "declined" : "expired";
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="bg-surface-2 border border-border rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
          <Ticket className="w-14 h-14 text-muted mx-auto mb-4" />
          <h1 className="text-2xl font-display font-bold mb-2 capitalize">Transfer {resolved}</h1>
          <p className="text-muted mb-6">This transfer link has already been {resolved}.</p>
          <Link href="/profile/tickets"><Button variant="outline" className="w-full">My Tickets</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="bg-surface-2 border border-border rounded-2xl p-8 max-w-md w-full shadow-xl">
        <div className="text-center mb-6">
          <Ticket className="w-12 h-12 text-primary mx-auto mb-3" />
          <h1 className="text-2xl font-display font-bold mb-1">Ticket Transfer</h1>
          <p className="text-muted text-sm">
            <span className="text-foreground font-medium">{info?.sender_name}</span> wants to give you a ticket
          </p>
        </div>

        {/* Ticket details */}
        {info && (
          <div className="bg-surface border border-border rounded-xl p-4 mb-6 space-y-2.5">
            <div className="font-semibold text-sm">{info.event_title}</div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              {formatDate(info.event_date)}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              {info.venue_name}, {info.venue_city}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <Ticket className="w-3.5 h-3.5 shrink-0" />
              #{info.ticket_number} · {info.tier_name}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <User className="w-3.5 h-3.5 shrink-0" />
              To: {info.to_email}
            </div>
          </div>
        )}

        {/* Decline reason form */}
        {showDeclineForm ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium">Reason for declining <span className="text-muted">(optional)</span></label>
            <textarea
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
              rows={3}
              placeholder="e.g. I can no longer attend, please find someone else…"
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowDeclineForm(false)}>
                Cancel
              </Button>
              <Button variant="danger" className="flex-1" onClick={decline} disabled={pageState === "declining"}>
                {pageState === "declining" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Decline"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setShowDeclineForm(true)}>
              Decline
            </Button>
            <Button className="flex-1" onClick={accept} disabled={pageState === "accepting"}>
              {pageState === "accepting" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Accept Ticket"}
            </Button>
          </div>
        )}

        <p className="text-center text-xs text-muted mt-4">
          Link expires {info ? new Date(info.expires_at).toLocaleDateString() : "soon"}
        </p>
      </div>
    </div>
  );
}
