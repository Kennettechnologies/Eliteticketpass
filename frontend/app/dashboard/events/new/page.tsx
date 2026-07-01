"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { api } from "@/lib/api";
import { EventWizard } from "../_components/event-wizard";

export default function NewEventPage() {
  const [categories, setCategories] = useState<{ id: string; name: string; color: string }[]>([]);

  useEffect(() => {
    api.get<{ results: any[] }>("/events/categories/").then(r => {
      if (r.success) setCategories((r.data as any)?.results ?? r.data ?? []);
    });
  }, []);

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dashboard/events" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Events
        </Link>
        <span className="text-muted">/</span>
        <span className="text-sm font-medium">New Event</span>
      </div>

      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold">Create New Event</h1>
        <p className="text-muted text-sm mt-1">Fill in each step. Your progress is saved automatically.</p>
      </div>

      <EventWizard categories={categories} />
    </div>
  );
}
