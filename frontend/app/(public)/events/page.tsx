"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { SlidersHorizontal, X, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { EventCard } from "@/components/events/event-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Event {
  id: string; slug: string; title: string; cover_image_url: string;
  starts_at: string; venue_city: string; venue_name: string;
  organizer_name: string; organizer_logo: string;
  min_price: string | null; max_price: string | null; is_free: boolean;
  category_name: string; category_color: string; tickets_remaining: boolean;
  is_featured: boolean;
}
interface Category { id: number; name: string; slug: string; color_hex: string; }

const SORT_OPTIONS = [
  { value: "starts_at", label: "Soonest" },
  { value: "-created_at", label: "Newest" },
  { value: "price_min", label: "Price: Low to High" },
  { value: "-view_count", label: "Most Popular" },
];

function EventsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);

  const [filters, setFilters] = useState({
    search: searchParams.get("search") || "",
    category: searchParams.get("category") || "",
    city: searchParams.get("city") || "",
    is_free: searchParams.get("is_free") || "",
    event_type: searchParams.get("event_type") || "",
    ordering: searchParams.get("ordering") || "starts_at",
    date_from: searchParams.get("date_from") || "",
    date_to: searchParams.get("date_to") || "",
    price_min: searchParams.get("price_min") || "",
    price_max: searchParams.get("price_max") || "",
  });

  const buildQuery = useCallback((f: typeof filters, p: number) => {
    const params = new URLSearchParams();
    if (f.search) params.set("search", f.search);
    if (f.category) params.set("category", f.category);
    if (f.city) params.set("city", f.city);
    if (f.is_free) params.set("is_free", f.is_free);
    if (f.event_type) params.set("event_type", f.event_type);
    if (f.date_from) params.set("date_from", f.date_from);
    if (f.date_to) params.set("date_to", f.date_to);
    if (f.price_min) params.set("price_min", f.price_min);
    if (f.price_max) params.set("price_max", f.price_max);
    params.set("ordering", f.ordering);
    params.set("page", String(p));
    params.set("page_size", "20");
    return params.toString();
  }, []);

  const fetchEvents = useCallback(async (reset = false) => {
    const currentPage = reset ? 1 : page;
    if (reset) setLoading(true);
    const res = await api.get<any>(`/events/?${buildQuery(filters, currentPage)}`);
    if (res.success) {
      const results: Event[] = res.data?.results ?? (Array.isArray(res.data) ? res.data : []);
      setEvents((prev) => (reset ? results : [...prev, ...results]));
      setHasMore(!!res.meta?.next);
      if (reset) setPage(2); else setPage((p) => p + 1);
    }
    if (reset) setLoading(false);
  }, [filters, page, buildQuery]);

  useEffect(() => { fetchEvents(true); }, [filters]);

  useEffect(() => { api.get<any>("/events/categories/").then((r) => { if (r.success) setCategories(r.data?.results ?? (Array.isArray(r.data) ? r.data : [])); }); }, []);

  useEffect(() => {
    if (!loaderRef.current || !hasMore) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting && !loading) fetchEvents(); }, { threshold: 0.5 });
    obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [hasMore, loading, fetchEvents]);

  const updateFilter = (key: string, value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const clearFilters = () => setFilters({ search: "", category: "", city: "", is_free: "", event_type: "", ordering: "starts_at", date_from: "", date_to: "", price_min: "", price_max: "" });
  const activeFilterCount = [filters.category, filters.city, filters.is_free, filters.event_type, filters.date_from, filters.date_to, filters.price_min, filters.price_max].filter(Boolean).length;

  const applyWeekend = () => {
    const now = new Date();
    const day = now.getDay();
    const daysToFriday = day <= 5 ? 5 - day : 6;
    const friday = new Date(now);
    friday.setDate(now.getDate() + daysToFriday);
    const sunday = new Date(friday);
    sunday.setDate(friday.getDate() + 2);
    setFilters((f) => ({
      ...f,
      date_from: friday.toISOString().split("T")[0],
      date_to: sunday.toISOString().split("T")[0],
    }));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold mb-2">Discover Events</h1>
        <p className="text-muted">Find your next unforgettable experience</p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input
          type="text"
          value={filters.search}
          onChange={(e) => updateFilter("search", e.target.value)}
          placeholder="Search events..."
          className="flex-1 min-w-48 bg-surface border border-border rounded-sm px-4 h-10 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
        />

        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className={cn("flex items-center gap-2 px-4 h-10 rounded-sm border text-sm font-medium transition-all", activeFilterCount > 0 ? "border-primary text-primary bg-primary/10" : "border-border text-muted hover:text-foreground hover:border-border/80")}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && <span className="w-5 h-5 rounded-full bg-primary text-background text-xs flex items-center justify-center">{activeFilterCount}</span>}
        </button>

        <div className="relative">
          <button onClick={() => setSortOpen(!sortOpen)} className="flex items-center gap-2 px-4 h-10 rounded-sm border border-border text-sm text-muted hover:text-foreground">
            {SORT_OPTIONS.find(o => o.value === filters.ordering)?.label || "Sort"}
            <ChevronDown className="w-4 h-4" />
          </button>
          <AnimatePresence>
            {sortOpen && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                className="absolute right-0 mt-1 w-48 bg-surface-2 border border-border rounded-lg shadow-xl z-10 py-1">
                {SORT_OPTIONS.map(o => (
                  <button key={o.value} onClick={() => { updateFilter("ordering", o.value); setSortOpen(false); }}
                    className={cn("w-full text-left px-4 py-2 text-sm hover:bg-surface transition-colors", filters.ordering === o.value ? "text-primary" : "text-muted")}>
                    {o.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {activeFilterCount > 0 && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-sm text-error hover:text-error/80">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Quick chips */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={applyWeekend}
          className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
            filters.date_from ? "border-primary text-primary bg-primary/10" : "border-border text-muted hover:border-border/80 hover:text-foreground")}>
          📅 This Weekend
        </button>
        <button onClick={() => updateFilter("is_free", filters.is_free === "true" ? "" : "true")}
          className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
            filters.is_free === "true" ? "border-primary text-primary bg-primary/10" : "border-border text-muted hover:border-border/80 hover:text-foreground")}>
          🎟 Free Events
        </button>
        <button onClick={() => updateFilter("ordering", filters.ordering === "-view_count" ? "starts_at" : "-view_count")}
          className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
            filters.ordering === "-view_count" ? "border-primary text-primary bg-primary/10" : "border-border text-muted hover:border-border/80 hover:text-foreground")}>
          🔥 Trending
        </button>
      </div>

      {/* Filter drawer */}
      <AnimatePresence>
        {filtersOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-6">
            <div className="bg-surface-2 border border-border rounded-lg p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-muted mb-1.5">Category</label>
                <select value={filters.category} onChange={(e) => updateFilter("category", e.target.value)}
                  className="w-full bg-surface border border-border rounded-sm px-3 h-9 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50">
                  <option value="">All categories</option>
                  {categories.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">City</label>
                <input type="text" value={filters.city} onChange={(e) => updateFilter("city", e.target.value)} placeholder="e.g. Nairobi"
                  className="w-full bg-surface border border-border rounded-sm px-3 h-9 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">Event Type</label>
                <select value={filters.event_type} onChange={(e) => updateFilter("event_type", e.target.value)}
                  className="w-full bg-surface border border-border rounded-sm px-3 h-9 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50">
                  <option value="">All types</option>
                  <option value="PHYSICAL">In Person</option>
                  <option value="ONLINE">Online</option>
                  <option value="HYBRID">Hybrid</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">Price</label>
                <select value={filters.is_free} onChange={(e) => updateFilter("is_free", e.target.value)}
                  className="w-full bg-surface border border-border rounded-sm px-3 h-9 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50">
                  <option value="">All prices</option>
                  <option value="true">Free only</option>
                  <option value="false">Paid only</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">Date From</label>
                <input type="date" value={filters.date_from} onChange={(e) => updateFilter("date_from", e.target.value)}
                  className="w-full bg-surface border border-border rounded-sm px-3 h-9 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">Date To</label>
                <input type="date" value={filters.date_to} onChange={(e) => updateFilter("date_to", e.target.value)}
                  className="w-full bg-surface border border-border rounded-sm px-3 h-9 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">Min Price (KES)</label>
                <input type="number" min="0" value={filters.price_min} onChange={(e) => updateFilter("price_min", e.target.value)} placeholder="0"
                  className="w-full bg-surface border border-border rounded-sm px-3 h-9 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">Max Price (KES)</label>
                <input type="number" min="0" value={filters.price_max} onChange={(e) => updateFilter("price_max", e.target.value)} placeholder="Any"
                  className="w-full bg-surface border border-border rounded-sm px-3 h-9 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="rounded-lg bg-surface-2 border border-border overflow-hidden animate-pulse">
              <div className="h-44 bg-surface" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-surface rounded w-3/4" />
                <div className="h-3 bg-surface rounded w-1/2" />
                <div className="h-3 bg-surface rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-4">🎪</p>
          <h3 className="font-display text-xl font-bold mb-2">No events found</h3>
          <p className="text-muted text-sm">Try adjusting your filters or search terms.</p>
          <button onClick={clearFilters} className="mt-4 text-sm text-primary hover:underline">Clear all filters</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event, i) => (
            <motion.div key={event.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.05, 0.3) }}>
              <EventCard event={event} />
            </motion.div>
          ))}
        </div>
      )}

      {/* Infinite scroll loader */}
      <div ref={loaderRef} className="h-16 flex items-center justify-center mt-8">
        {hasMore && !loading && <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />}
      </div>
    </div>
  );
}

import { Suspense } from "react";

export default function EventsPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center animate-pulse text-muted">Loading events...</div>}>
      <EventsContent />
    </Suspense>
  );
}
