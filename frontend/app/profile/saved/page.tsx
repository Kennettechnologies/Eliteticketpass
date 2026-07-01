"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Heart, Trash2 } from "lucide-react";
import { EventCard } from "@/components/events/event-card";
import { toast } from "sonner";

interface SavedEvent {
  id: string;
  event: {
    id: string; title: string; slug: string; cover_image_url?: string;
    starts_at: string; venue_name: string; venue_city: string;
    category_name: string; category_color: string;
    min_price: string | null; max_price: string | null; is_free: boolean;
    organizer_name: string; organizer_logo: string; tickets_remaining: boolean;
  };
}

export default function SavedEventsPage() {
  const [saved,   setSaved]   = useState<SavedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ results: SavedEvent[] }>("/events/saved/").then(r => {
      if (r.success) setSaved((r.data as any)?.results || []);
      setLoading(false);
    });
  }, []);

  const unsave = async (savedId: string, eventId: string) => {
    const res = await api.delete(`/events/${eventId}/save/`);
    if (res.success) {
      setSaved(s => s.filter(e => e.id !== savedId));
      toast.success("Removed from saved");
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Saved Events</h1>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-60 bg-surface-2 border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : saved.length === 0 ? (
        <div className="text-center py-20">
          <Heart className="w-12 h-12 text-muted mx-auto mb-4" />
          <h3 className="font-display text-lg font-bold mb-2">No saved events</h3>
          <p className="text-muted text-sm">Tap the heart on any event to save it here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {saved.map(({ id, event }) => (
            <div key={id} className="relative group">
              <EventCard event={event as any} />
              <button
                onClick={() => unsave(id, event.id)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-error/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-error">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
