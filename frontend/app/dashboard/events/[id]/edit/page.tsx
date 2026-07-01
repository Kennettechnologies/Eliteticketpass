"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { api } from "@/lib/api";
import { EventWizard, EventDraft } from "../../_components/event-wizard";

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const [categories, setCategories] = useState<{ id: string; name: string; color: string }[]>([]);
  const [draft, setDraft]           = useState<Partial<EventDraft> | null>(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<{ results: any[] }>("/events/categories/"),
      api.get<any>(`/organizer/events/${id}/`),
    ]).then(([catRes, evRes]) => {
      if (catRes.success) setCategories((catRes.data as any)?.results ?? catRes.data ?? []);
      if (evRes.success && evRes.data) {
        const e = evRes.data;
        setDraft({
          title:           e.title,
          category_id:     e.category_id,
          tags:            (e.tags || []).join(", "),
          description:     e.description,
          date_type:       e.date_type || "single",
          starts_at:       e.starts_at?.slice(0, 16) || "",
          ends_at:         e.ends_at?.slice(0, 16) || "",
          recurrence_rule: e.recurrence_rule || "",
          is_online:       e.is_online,
          venue_name:      e.venue_name || "",
          venue_address:   e.venue_address || "",
          venue_city:      e.venue_city || "",
          venue_country:   e.venue_country || "Kenya",
          online_url:      e.online_url || "",
          tiers:           e.tiers?.map((t: any) => ({
            id:             t.id,
            name:           t.name,
            description:    t.description || "",
            price:          t.price,
            quantity:       String(t.quantity),
            max_per_order:  String(t.max_per_order || 10),
            sale_starts_at: t.sale_starts_at?.slice(0, 16) || "",
            sale_ends_at:   t.sale_ends_at?.slice(0, 16) || "",
            is_free:        t.is_free,
          })) || [],
          cover_image_url: e.cover_image_url || "",
          promo_video_url: e.promo_video_url || "",
          visibility:      e.visibility || "PUBLIC",
          age_restriction: e.age_restriction ? String(e.age_restriction) : "",
          max_per_order:   String(e.max_per_order || 10),
          status:          e.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
        });
      }
      setLoading(false);
    });
  }, [id]);

  if (loading) return (
    <div className="max-w-2xl mx-auto space-y-4 mt-8">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-14 bg-surface-2 border border-border rounded-xl animate-pulse" />
      ))}
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dashboard/events" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Events
        </Link>
        <span className="text-muted">/</span>
        <span className="text-sm font-medium">Edit Event</span>
      </div>

      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold">Edit Event</h1>
        <p className="text-muted text-sm mt-1">Changes are saved to draft until you publish.</p>
      </div>

      {draft && <EventWizard initialData={draft} eventId={id} categories={categories} />}
    </div>
  );
}
