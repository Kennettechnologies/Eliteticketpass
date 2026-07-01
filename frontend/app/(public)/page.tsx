"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";
import {
  Search, MapPin, Zap, TrendingUp,
  CalendarDays, Sparkles, Tag, Music, Laugh, Cpu, Trophy,
  Utensils, Palette, GraduationCap, Heart, Shield, Clock,
  Smartphone, QrCode, ArrowRight, Star, Users, Ticket,
  CheckCircle, Play,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { EventCard } from "@/components/events/event-card";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Event {
  id: string; slug: string; title: string; cover_image_url: string;
  starts_at: string; venue_city: string; venue_name: string;
  organizer_name: string; organizer_logo: string;
  min_price: string | null; max_price: string | null;
  is_free: boolean; category_name: string; category_color: string;
  tickets_remaining: boolean; is_featured: boolean;
}

interface Category { id: number; name: string; slug: string; icon_url: string; color_hex: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWeekendRange() {
  const now = new Date(); const day = now.getDay();
  const friday = new Date(now); friday.setDate(now.getDate() + (day <= 5 ? 5 - day : 6)); friday.setHours(0,0,0,0);
  const sunday = new Date(friday); sunday.setDate(friday.getDate() + 2); sunday.setHours(23,59,59,999);
  return { date_from: friday.toISOString().split("T")[0], date_to: sunday.toISOString().split("T")[0] };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, subtitle, href }: { icon: React.ElementType; title: string; subtitle: string; href: string }) {
  const ref = useRef(null); const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5 }}
      className="flex items-center justify-between mb-8 border-b border-border pb-4">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          <p className="text-muted text-sm">{subtitle}</p>
        </div>
      </div>
      <Link href={href} className="group flex items-center gap-1.5 text-sm font-medium hover:text-primary transition-all">
        View all <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </motion.div>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl bg-surface-2 border border-border overflow-hidden animate-pulse">
      <div className="h-52 bg-surface" />
      <div className="p-4 space-y-3"><div className="h-4 bg-surface rounded w-3/4" /><div className="h-3 bg-surface rounded w-1/2" /><div className="h-3 bg-surface rounded w-2/3" /></div>
    </div>
  );
}

function GridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  );
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  music: Music, comedy: Laugh, technology: Cpu, sports: Trophy,
  food: Utensils, art: Palette, education: GraduationCap, health: Heart,
};

const CITIES = [
  { name: "Nairobi", emoji: "🏙️", href: "/events?city=nairobi" },
  { name: "Mombasa", emoji: "🌊", href: "/events?city=mombasa" },
  { name: "Kisumu", emoji: "🏞️", href: "/events?city=kisumu" },
  { name: "Nakuru", emoji: "🦩", href: "/events?city=nakuru" },
  { name: "Eldoret", emoji: "🏃", href: "/events?city=eldoret" },
  { name: "Thika", emoji: "🌿", href: "/events?city=thika" },
];

const HOW_IT_WORKS = [
  { icon: Search, step: "01", title: "Discover Events", desc: "Browse concerts, conferences, sports & more. Filter by city, date, price or category." },
  { icon: Ticket, step: "02", title: "Pick Your Tickets", desc: "Select your tier — VIP, Early Bird, or Free. No account needed to book." },
  { icon: Smartphone, step: "03", title: "Pay with M-Pesa", desc: "Instant STK Push, Paybill, or card. Secure payment confirmed in seconds." },
  { icon: QrCode, step: "04", title: "Scan & Attend", desc: "Get your e-ticket instantly via email. Show your QR code at the gate." },
];

const TRUST_BADGES = [
  { icon: Shield, label: "Secure Payments", desc: "256-bit encrypted" },
  { icon: Smartphone, label: "M-Pesa Ready", desc: "STK Push & Paybill" },
  { icon: Clock, label: "Instant Tickets", desc: "Delivered in seconds" },
  { icon: CheckCircle, label: "Verified Events", desc: "Every organizer KYC'd" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [featured, setFeatured] = useState<Event[]>([]);
  const [trending, setTrending] = useState<Event[]>([]);
  const [weekend, setWeekend] = useState<Event[]>([]);
  const [freeEvents, setFreeEvents] = useState<Event[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const wr = getWeekendRange();
  const weekendHref = `/events?date_from=${wr.date_from}&date_to=${wr.date_to}`;

  useEffect(() => {
    async function load() {
      const wr = getWeekendRange();
      const [featuredRes, categoriesRes, freeRes, trendingRes, weekendRes] = await Promise.all([
        api.get<{ results: Event[] }>("/events/featured/"),
        api.get<Category[]>("/events/categories/"),
        api.get<{ results: Event[] }>("/events/?is_free=true&page_size=6"),
        api.get<{ results: Event[] }>("/events/?ordering=-view_count&page_size=8"),
        api.get<{ results: Event[] }>(`/events/?date_from=${wr.date_from}&date_to=${wr.date_to}&page_size=6`),
      ]);
      const extract = (d: any) => d?.results ?? (Array.isArray(d) ? d : []);
      if (featuredRes.success) setFeatured(extract(featuredRes.data));
      if (categoriesRes.success) setCategories(extract(categoriesRes.data));
      if (freeRes.success) setFreeEvents(extract(freeRes.data));
      if (trendingRes.success) setTrending(extract(trendingRes.data));
      if (weekendRes.success) setWeekend(extract(weekendRes.data));
      setLoading(false);
    }
    load();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (city) p.set("city", city);
    router.push(`/events?${p.toString()}`);
  };

  return (
    <div className="overflow-hidden">

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
          <div className="grid lg:grid-cols-12 gap-8 items-center">
            
            {/* Left: Text & Search */}
            <div className="lg:col-span-5 space-y-6">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight text-foreground tracking-tight">
                Discover & Book <br />
                <span className="text-primary">Incredible Events</span>
              </h1>
              <p className="text-muted text-lg max-w-md">
                Your portal to concerts, sports, theater, and festivals. Secure your tickets instantly.
              </p>
              
              <form onSubmit={handleSearch} className="flex flex-col gap-3 bg-surface-2 p-3 rounded-xl border border-border shadow-sm">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search events, artists..."
                    className="w-full bg-surface border border-border rounded-lg pl-10 pr-4 h-11 text-sm focus:outline-none focus:border-primary" />
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                    <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="City..."
                      className="w-full bg-surface border border-border rounded-lg pl-10 pr-4 h-11 text-sm focus:outline-none focus:border-primary" />
                  </div>
                  <Button type="submit" className="h-11 px-6 font-semibold shrink-0 rounded-lg">Search</Button>
                </div>
              </form>
            </div>

            {/* Right: Featured Banner */}
            <div className="lg:col-span-7">
              {featured.length > 0 ? (
                <Link href={`/events/${featured[0].slug}`} className="block relative aspect-[16/9] rounded-2xl overflow-hidden group border border-border shadow-md">
                  <img src={featured[0].cover_image_url || "https://placehold.co/800x450/e2e8f0/1e293b?text=Featured+Event"} alt={featured[0].title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-6 w-full">
                    <span className="inline-block px-3 py-1 rounded bg-primary text-white text-xs font-bold uppercase mb-3">Featured</span>
                    <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2 line-clamp-2">{featured[0].title}</h3>
                    <div className="flex flex-wrap items-center gap-4 text-white/80 text-sm">
                      <span className="flex items-center gap-1.5"><CalendarDays className="w-4 h-4" />{new Date(featured[0].starts_at).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                      <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{featured[0].venue_city}</span>
                    </div>
                  </div>
                </Link>
              ) : (
                <div className="aspect-[16/9] rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-muted shadow-sm">
                  {loading ? "Loading featured events..." : "No featured events"}
                </div>
              )}
            </div>

          </div>
        </div>
      </section>

      {/* ═══════════════ TRUST BAR ═══════════════ */}
      <section className="border-b border-border bg-surface-2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
            {TRUST_BADGES.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex flex-col items-center gap-2 px-6 py-6 text-center">
                <Icon className="w-6 h-6 text-muted" />
                <div>
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="text-xs text-muted mt-1">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ FEATURED EVENTS ═══════════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <SectionHeader icon={Sparkles} title="Featured Events" subtitle="Handpicked by our team" href="/events" />
        {loading ? <GridSkeleton /> : featured.length === 0 ? (
          trending.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {trending.slice(0, 6).map((event, i) => (
                <motion.div key={event.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                  <EventCard event={event} featured={i === 0} />
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-muted text-sm">No featured events yet — check back soon!</div>
          )
        ) : (
          <>
            {/* Hero featured card */}
            {featured[0] && (
              <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <Link href={`/events/${featured[0].slug}`} className="group block">
                  <div className="relative h-[420px] sm:h-[500px] rounded-2xl overflow-hidden border border-border">
                    {featured[0].cover_image_url
                      ? <img src={featured[0].cover_image_url} alt={featured[0].title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                      : <div className="w-full h-full bg-gradient-to-br from-primary/20 to-surface flex items-center justify-center text-8xl">🎪</div>}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                    <div className="absolute top-4 left-4 flex gap-2">
                      <span className="px-3 py-1 rounded-full bg-primary text-background text-xs font-bold uppercase tracking-wide">Featured</span>
                      {featured[0].category_name && (
                        <span className="px-3 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: featured[0].category_color || "#f59e0b" }}>{featured[0].category_name}</span>
                      )}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
                      <h3 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-2 group-hover:text-primary transition-colors line-clamp-2">{featured[0].title}</h3>
                      <div className="flex flex-wrap gap-4 text-white/70 text-sm mb-4">
                        <span className="flex items-center gap-1.5"><CalendarDays className="w-4 h-4" />{new Date(featured[0].starts_at).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                        <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{featured[0].venue_name ? `${featured[0].venue_name}, ` : ""}{featured[0].venue_city}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-lg font-bold ${featured[0].is_free ? "text-green-400" : "text-primary"}`}>
                          {featured[0].is_free ? "Free Entry" : featured[0].min_price ? `KES ${Number(featured[0].min_price).toLocaleString()}` : "TBD"}
                        </span>
                        <span className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-background text-sm font-bold group-hover:bg-primary/90 transition-colors">
                          Get Tickets <ArrowRight className="w-4 h-4" />
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            )}
            {featured.length > 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {featured.slice(1, 7).map((event, i) => (
                  <motion.div key={event.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
                    <EventCard event={event} />
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* ═══════════════ CATEGORIES ═══════════════ */}
      <section className="bg-surface/40 border-y border-border py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader icon={Tag} title="Browse by Category" subtitle="What kind of event are you looking for?" href="/events" />
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {(categories.length > 0 ? categories : [
              { id: 1, name: "Music", slug: "music", color_hex: "#8b5cf6", icon_url: "" },
              { id: 2, name: "Comedy", slug: "comedy", color_hex: "#f59e0b", icon_url: "" },
              { id: 3, name: "Technology", slug: "technology", color_hex: "#3b82f6", icon_url: "" },
              { id: 4, name: "Sports", slug: "sports", color_hex: "#22c55e", icon_url: "" },
              { id: 5, name: "Food & Drink", slug: "food", color_hex: "#f97316", icon_url: "" },
              { id: 6, name: "Art", slug: "art", color_hex: "#ec4899", icon_url: "" },
              { id: 7, name: "Education", slug: "education", color_hex: "#6366f1", icon_url: "" },
              { id: 8, name: "Health", slug: "health", color_hex: "#ef4444", icon_url: "" },
            ]).map((cat, i) => {
              const Icon = CATEGORY_ICONS[cat.slug] || Tag;
              return (
                <motion.div key={cat.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }}>
                  <Link href={`/events?category=${cat.slug}`}
                    className={`group flex flex-col items-center gap-3 p-5 rounded-2xl bg-surface border border-border hover:border-primary/50 hover:shadow-sm transition-all duration-200`}>
                    <div className="w-12 h-12 rounded-full flex items-center justify-center bg-surface-2 border border-border">
                      <Icon className="w-6 h-6 text-muted group-hover:text-primary transition-colors" />
                    </div>
                    <span className="text-sm font-semibold text-center leading-tight group-hover:text-primary transition-colors">{cat.name}</span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════ TRENDING ═══════════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <SectionHeader icon={TrendingUp} title="Trending Now" subtitle="Most popular events this week" href="/events?ordering=-view_count" />
        {loading ? <GridSkeleton count={4} /> : trending.length === 0 ? (
          <div className="text-center py-12 text-muted text-sm">No trending events yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {trending.slice(0, 8).map((event, i) => (
              <motion.div key={event.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <EventCard event={event} />
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* ═══════════════ THIS WEEKEND ═══════════════ */}
      <section className="bg-surface/40 border-y border-border py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader icon={CalendarDays} title="This Weekend" subtitle="Events happening Friday – Sunday" href={weekendHref} />
          {loading ? <GridSkeleton /> : weekend.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-4"><CalendarDays className="w-7 h-7 text-muted" /></div>
              <p className="text-foreground font-medium mb-1">Nothing this weekend yet</p>
              <p className="text-muted text-sm mb-5">Check out all upcoming events instead</p>
              <Link href="/events"><Button variant="outline">Browse All Events</Button></Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {weekend.map((event, i) => (
                <motion.div key={event.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                  <EventCard event={event} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════ FREE EVENTS ═══════════════ */}
      {(loading || freeEvents.length > 0) && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <SectionHeader icon={Tag} title="Free Events" subtitle="Zero cost, maximum experience" href="/events?is_free=true" />
          {loading ? <GridSkeleton /> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {freeEvents.map((event, i) => (
                <motion.div key={event.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                  <EventCard event={event} />
                </motion.div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ═══════════════ HOW IT WORKS ═══════════════ */}
      <section className="bg-surface/40 border-y border-border py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className="inline-block px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-4 uppercase tracking-wider">Simple Process</span>
            <h2 className="font-display text-4xl sm:text-5xl font-bold mb-3">How It Works</h2>
            <p className="text-muted text-lg max-w-xl mx-auto">From discovery to gate — in four easy steps</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map(({ icon: Icon, step, title, desc }, i) => (
              <motion.div key={step} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="relative flex flex-col items-center text-center p-6 rounded-2xl bg-surface-2 border border-border">
                <div className="relative mb-5">
                  <div className="w-16 h-16 rounded-full bg-surface border border-border flex items-center justify-center">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">{step.slice(1)}</span>
                </div>
                <h3 className="font-bold text-base mb-2">{title}</h3>
                <p className="text-muted text-sm leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ POPULAR CITIES ═══════════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <SectionHeader icon={MapPin} title="Events by City" subtitle="Find events in your city" href="/events" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {CITIES.map(({ name, emoji, href }, i) => (
            <motion.div key={name} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
              <Link href={href}
                className="group flex flex-col items-center gap-2 p-5 rounded-2xl bg-surface-2 border border-border hover:border-primary/30 hover:bg-primary/5 hover:-translate-y-1 transition-all duration-200 text-center">
                <span className="text-3xl">{emoji}</span>
                <span className="text-sm font-semibold group-hover:text-primary transition-colors">{name}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>



      {/* ═══════════════ ORGANIZER CTA ═══════════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="relative rounded-3xl overflow-hidden border border-border bg-surface-2 p-10 sm:p-16 text-center">
          <div className="relative z-10 max-w-2xl mx-auto">
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">Sell Tickets on EliteTicketPass</h2>
            <p className="text-muted text-lg mb-8 leading-relaxed">
              Join 200+ event organizers across Kenya. Set up your event in minutes,<br className="hidden sm:block" />
              collect M-Pesa payments, and manage everything from your dashboard.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/auth/register?role=ORGANIZER">
                <Button size="lg" className="text-base px-8 rounded-xl h-12">
                  Start Selling Tickets <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="/events">
                <Button size="lg" variant="outline" className="text-base px-8 rounded-xl h-12">
                  Browse Events <Play className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

    </div>
  );
}
