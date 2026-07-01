"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, ScanLine, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export default function ScannerSelectionPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch organizer events
    api.get<any>("/organizer/events/").then(r => {
      if (r.success) {
        // Filter for active/published events
        const activeEvents = (r.data?.results || r.data || []).filter(
          (e: any) => e.status === "PUBLISHED"
        );
        setEvents(activeEvents);
      }
      setLoading(false);
    });
  }, []);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="mb-4">
        <Link href="/profile" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 transition-colors">
          ← Back
        </Link>
      </div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold flex items-center gap-3">
          <ScanLine className="w-8 h-8 text-primary" />
          Select Event to Scan
        </h1>
        <p className="text-muted mt-2">
          Choose an active event to open its check-in scanner dashboard.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-surface-2 border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="bg-surface-2 border border-border rounded-xl p-12 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-warning mb-4" />
          <h2 className="text-xl font-bold mb-2">No Active Events Found</h2>
          <p className="text-muted mb-6 max-w-md">
            You don't have any published events right now. You can only scan tickets for active events.
          </p>
          <Link href="/dashboard/events/new">
            <Button>Create Event</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {events.map(event => (
            <Link key={event.id} href={`/checkin/${event.checkin_access_code}`}>
              <div className="group bg-surface-2 hover:bg-surface border border-border hover:border-primary/50 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all cursor-pointer">
                <div className="flex gap-4 items-center">
                  {event.cover_image_url ? (
                    <img src={event.cover_image_url} alt={event.title} className="w-16 h-16 rounded-lg object-cover bg-surface" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-surface border border-border flex items-center justify-center text-muted">
                      <CalendarDays className="w-6 h-6" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-bold text-lg group-hover:text-primary transition-colors line-clamp-1">{event.title}</h3>
                    <p className="text-sm text-muted">{formatDate(event.starts_at, "dd MMM yyyy, h:mm a")}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 shrink-0 sm:ml-auto">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-muted">Tickets Sold</p>
                    <p className="font-bold text-sm">{event.tickets_sold || 0} <span className="text-muted font-normal">/ {event.capacity || 0}</span></p>
                  </div>
                  <Button variant="outline" className="group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-colors w-full sm:w-auto">
                    Open Scanner <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
