"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, MapPin, Share2, ChevronDown, Plus, Minus, Star,
  Copy, Check, Users, Shield, ExternalLink, ChevronRight, X,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EventCard } from "@/components/events/event-card";
import { formatDateTime, cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";

interface Tier {
  id: string; name: string; description: string; price: string;
  available: number; max_per_order: number; perks: string[];
  is_free: boolean; is_active: boolean; visibility: string;
}
interface Review {
  id: string; author_name: string; rating: number; comment: string;
}
interface RelatedEvent {
  id: string; slug: string; title: string; cover_image_url: string;
  starts_at: string; venue_city: string; venue_name: string;
  organizer_name: string; organizer_logo: string;
  min_price: string | null; max_price: string | null;
  is_free: boolean; category_name: string; category_color: string;
  tickets_remaining: boolean; is_featured: boolean;
}
interface EventDetail {
  id: string; slug: string; title: string; description: string;
  short_description: string; cover_image_url: string;
  starts_at: string; ends_at: string; timezone: string;
  venue_name: string; venue_address: string; venue_city: string;
  organizer: { id: string; name: string; logo_url: string; slug: string; is_verified: boolean; follower_count?: number; is_following?: boolean };
  ticket_tiers: Tier[];
  faq: { question: string; answer: string }[];
  refund_policies: { days_before_event: number; refund_percent: string }[];
  avg_rating: number | null; review_count: number; event_type: string;
  age_restriction: number | null; dress_code: string; is_free: boolean;
  organizer_name: string; organizer_logo: string;
  gallery_images?: string[]; category_name?: string; category_color?: string;
}

// ── Countdown ──────────────────────────────────────────────────────────────
function CountdownDisplay({ startsAt }: { startsAt: string }) {
  const calc = () => {
    const diff = new Date(startsAt).getTime() - Date.now();
    if (diff <= 0) return { d: 0, h: 0, m: 0, s: 0, over: true };
    return { d: Math.floor(diff / 86400000), h: Math.floor((diff % 86400000) / 3600000), m: Math.floor((diff % 3600000) / 60000), s: Math.floor((diff % 60000) / 1000), over: false };
  };
  const [t, setT] = useState(calc);
  useEffect(() => { const id = setInterval(() => setT(calc()), 1000); return () => clearInterval(id); }, [startsAt]);
  if (t.over) return <p className="text-center text-sm text-primary font-semibold py-1">Event is live!</p>;
  return (
    <div className="grid grid-cols-4 gap-2 text-center">
      {([["Days", t.d], ["Hrs", t.h], ["Min", t.m], ["Sec", t.s]] as [string, number][]).map(([l, v]) => (
        <div key={l} className="bg-background border border-border rounded-sm p-2">
          <div className="text-xl font-bold font-display text-primary">{String(v).padStart(2, "0")}</div>
          <div className="text-xs text-muted">{l}</div>
        </div>
      ))}
    </div>
  );
}

// ── Share Menu ─────────────────────────────────────────────────────────────
function ShareMenu({ title, url }: { title: string; url: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const enc = encodeURIComponent(url);
  const text = encodeURIComponent(`"${title}" on EliteTicketPass`);
  const copy = async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const links = [
    { label: "WhatsApp", href: `https://wa.me/?text=${text}%20${enc}`, cls: "text-green-400" },
    { label: "Twitter / X", href: `https://twitter.com/intent/tweet?text=${text}&url=${enc}`, cls: "text-sky-400" },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${enc}`, cls: "text-blue-500" },
  ];
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 px-3 py-2 rounded-sm border border-border text-sm text-muted hover:text-foreground transition-all">
        <Share2 className="w-4 h-4" /> Share
      </button>
      <AnimatePresence>
        {open && (<>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="absolute left-0 mt-1 w-52 bg-surface-2 border border-border rounded-lg shadow-xl z-20 py-1.5">
            {links.map(({ label, href, cls }) => (
              <a key={label} href={href} target="_blank" rel="noreferrer" className={cn("flex items-center px-4 py-2.5 text-sm hover:bg-surface transition-colors", cls)}>{label}</a>
            ))}
            <div className="border-t border-border my-1" />
            <button onClick={copy} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-muted hover:bg-surface hover:text-foreground transition-colors">
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy link"}
            </button>
          </motion.div>
        </>)}
      </AnimatePresence>
    </div>
  );
}

// ── Add to Calendar ────────────────────────────────────────────────────────
function AddToCalendar({ event }: { event: EventDetail }) {
  const [open, setOpen] = useState(false);
  const toZ = (d: string) => new Date(d).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const start = toZ(event.starts_at); const end = toZ(event.ends_at || event.starts_at);
  const loc = encodeURIComponent(`${event.venue_name}, ${event.venue_city}`);
  const t = encodeURIComponent(event.title); const b = encodeURIComponent(event.short_description || "");
  const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${t}&dates=${start}/${end}&location=${loc}&details=${b}`;
  const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${t}&startdt=${encodeURIComponent(event.starts_at)}&enddt=${encodeURIComponent(event.ends_at || event.starts_at)}&location=${loc}&body=${b}`;
  const downloadICS = () => {
    const ics = ["BEGIN:VCALENDAR","VERSION:2.0","BEGIN:VEVENT",`DTSTART:${start}`,`DTEND:${end}`,`SUMMARY:${event.title}`,`LOCATION:${event.venue_name}, ${event.venue_city}`,"END:VEVENT","END:VCALENDAR"].join("\r\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([ics], { type: "text/calendar" })), download: `${event.slug}.ics` });
    a.click();
  };
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 px-3 py-2 rounded-sm border border-border text-sm text-muted hover:text-foreground transition-all">
        <Calendar className="w-4 h-4" /> Add to Calendar
      </button>
      <AnimatePresence>
        {open && (<>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="absolute left-0 mt-1 w-48 bg-surface-2 border border-border rounded-lg shadow-xl z-20 py-1.5">
            <a href={googleUrl} target="_blank" rel="noreferrer" className="flex items-center px-4 py-2.5 text-sm text-muted hover:bg-surface hover:text-foreground transition-colors">Google Calendar</a>
            <button onClick={downloadICS} className="w-full text-left px-4 py-2.5 text-sm text-muted hover:bg-surface hover:text-foreground transition-colors">Apple Calendar (.ics)</button>
            <a href={outlookUrl} target="_blank" rel="noreferrer" className="flex items-center px-4 py-2.5 text-sm text-muted hover:bg-surface hover:text-foreground transition-colors">Outlook</a>
          </motion.div>
        </>)}
      </AnimatePresence>
    </div>
  );
}

// ── Photo Gallery ──────────────────────────────────────────────────────────
function PhotoGallery({ images }: { images: string[] }) {
  const [lb, setLb] = useState<string | null>(null);
  return (<>
    <div className="grid grid-cols-3 gap-2">
      {images.slice(0, 6).map((src, i) => (
        <button key={i} onClick={() => setLb(src)} className="relative aspect-square overflow-hidden rounded-sm bg-surface hover:opacity-90 transition-opacity">
          <img src={src} alt="" className="w-full h-full object-cover" />
          {i === 5 && images.length > 6 && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold text-xl">+{images.length - 6}</div>}
        </button>
      ))}
    </div>
    <AnimatePresence>
      {lb && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLb(null)}>
          <button className="absolute top-4 right-4 text-white/60 hover:text-white"><X className="w-7 h-7" /></button>
          <img src={lb} alt="" className="max-w-full max-h-[90vh] rounded-lg object-contain" onClick={e => e.stopPropagation()} />
        </motion.div>
      )}
    </AnimatePresence>
  </>);
}

export default function EventDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<"about" | "gallery" | "faq" | "reviews">("about");
  const [adding, setAdding] = useState(false);
  const [related, setRelated] = useState<RelatedEvent[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    api.get<EventDetail>(`/events/${slug}/`).then((r) => {
      if (r.success && r.data) {
        setEvent(r.data);
        if (r.data.organizer?.is_following !== undefined) {
          setFollowing(r.data.organizer.is_following);
        }
        const init: Record<string, number> = {};
        r.data.ticket_tiers?.filter(t => t.is_active && t.visibility === "PUBLIC").forEach(t => { init[t.id] = 0; });
        setQuantities(init);
        api.get<{ results: RelatedEvent[] }>(`/events/?page_size=4`).then(rel => {
          if (rel.success) setRelated(((rel.data as any)?.results || []).filter((e: RelatedEvent) => e.id !== r.data!.id).slice(0, 3));
        });
        api.get<{ results: Review[] }>(`/events/${slug}/reviews/`).then(rev => {
          if (rev.success) setReviews((rev.data as any)?.results || []);
        });
      }
      setLoading(false);
    });
  }, [slug]);

  const updateQty = (tierId: string, delta: number, tier: Tier) => {
    setQuantities(prev => {
      const next = Math.max(0, Math.min((prev[tierId] || 0) + delta, Math.min(tier.max_per_order || 10, tier.available)));
      return { ...prev, [tierId]: next };
    });
  };

  const totalQty = Object.values(quantities).reduce((s, v) => s + v, 0);
  const totalPrice = event
    ? Object.entries(quantities).reduce((sum, [tid, qty]) => {
        const tier = event.ticket_tiers?.find(t => t.id === tid);
        return sum + (tier && !tier.is_free ? Number(tier.price) * qty : 0);
      }, 0)
    : 0;

  const { isAuthenticated } = useAuthStore();

  const handleCheckout = async () => {
    if (totalQty === 0) return;
    if (!isAuthenticated) {
      router.push(`/auth/login?next=/events/${slug}`);
      return;
    }
    setAdding(true);
    const items = Object.entries(quantities).filter(([, qty]) => qty > 0).map(([tier_id, quantity]) => ({ tier_id, quantity }));
    const res = await api.post<{ session_id: string; order_id: string }>("/checkout/init/", { event_id: event?.id, items });
    if (res.success && res.data) router.push(`/checkout?session=${res.data.session_id}&order=${res.data.order_id}`);
    else if (res.error) alert(res.error);
    setAdding(false);
  };

  const handleFollow = async () => {
    if (!event?.organizer?.slug) return;
    setFollowLoading(true);
    await api.post(`/organizers/${event.organizer.slug}/follow/`, {});
    setFollowing(f => !f);
    setFollowLoading(false);
  };

  if (loading) return (
    <div className="animate-pulse">
      <div className="h-[55vh] bg-surface" />
      <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-8 bg-surface-2 rounded w-3/4" />
          <div className="h-4 bg-surface-2 rounded w-1/2" />
          <div className="h-40 bg-surface-2 rounded" />
        </div>
        <div className="h-64 bg-surface-2 rounded" />
      </div>
    </div>
  );

  if (!event) return <div className="text-center py-32 text-muted">Event not found.</div>;

  const publicTiers = event.ticket_tiers?.filter(t => t.is_active && t.visibility === "PUBLIC") || [];
  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const mapsQuery = encodeURIComponent(`${event.venue_name}, ${event.venue_address}, ${event.venue_city}`);
  const hasGallery = (event.gallery_images?.length ?? 0) > 0;

  return (
    <div>
      {/* ── Hero ── */}
      <div className="relative h-[55vh] min-h-80 bg-surface overflow-hidden">
        {event.cover_image_url ? (
          <img src={event.cover_image_url} alt={event.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-surface flex items-center justify-center text-7xl">🎪</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        <div className="absolute top-6 left-0 right-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-2">
          {event.category_name && (
            <span className="px-3 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: event.category_color || "#f59e0b" }}>
              {event.category_name}
            </span>
          )}
          {event.is_free && <span className="px-3 py-1 rounded-full bg-success text-white text-xs font-bold">FREE</span>}
          {event.event_type && event.event_type !== "PHYSICAL" && (
            <span className="px-3 py-1 rounded-full bg-surface/80 text-white text-xs font-medium">{event.event_type}</span>
          )}
        </div>
        <div className="absolute bottom-8 left-0 right-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="font-display text-3xl sm:text-5xl font-bold text-white leading-tight mb-2">{event.title}</h1>
          {event.short_description && (
            <p className="text-white/70 text-sm sm:text-base max-w-2xl line-clamp-2">{event.short_description}</p>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

          {/* ── Main Column ── */}
          <div className="lg:col-span-2 space-y-8">

            {/* Action bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <ShareMenu title={event.title} url={pageUrl} />
              <AddToCalendar event={event} />
              <a href={`https://maps.google.com/?q=${mapsQuery}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-sm border border-border text-sm text-muted hover:text-foreground transition-all">
                <ExternalLink className="w-4 h-4" /> Directions
              </a>
            </div>

            {/* Meta cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3 bg-surface-2 border border-border rounded-lg p-4">
                <Calendar className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted mb-0.5">Date & Time</p>
                  <p className="text-sm font-medium">{formatDateTime(event.starts_at)}</p>
                  {event.ends_at && <p className="text-xs text-muted">Ends {formatDateTime(event.ends_at)}</p>}
                  <p className="text-xs text-muted mt-0.5">{event.timezone}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-surface-2 border border-border rounded-lg p-4">
                <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted mb-0.5">Location</p>
                  <p className="text-sm font-medium">{event.venue_name}</p>
                  <p className="text-xs text-muted">{event.venue_address}, {event.venue_city}</p>
                  <a href={`https://maps.google.com/?q=${mapsQuery}`} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                    Open in Maps <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* Google Maps embed */}
            <div className="rounded-xl overflow-hidden border border-border h-56 bg-surface">
              <iframe
                src={`https://maps.google.com/maps?q=${mapsQuery}&output=embed`}
                width="100%" height="100%" style={{ border: 0 }}
                allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade"
                title="Event location map"
              />
            </div>

            {/* Organizer card */}
            <div className="flex items-center justify-between bg-surface-2 border border-border rounded-xl p-5">
              <div className="flex items-center gap-4">
                {(event.organizer?.logo_url || event.organizer_logo) ? (
                  <img src={event.organizer?.logo_url || event.organizer_logo} alt=""
                    className="w-14 h-14 rounded-full object-cover border-2 border-border" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xl font-bold">
                    {(event.organizer?.name || event.organizer_name)?.[0]}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="font-semibold">{event.organizer?.name || event.organizer_name}</p>
                    {event.organizer?.is_verified && <Shield className="w-4 h-4 text-primary" />}
                  </div>
                  <p className="text-xs text-muted">Organizer</p>
                  {event.organizer?.follower_count !== undefined && (
                    <p className="text-xs text-muted mt-0.5 flex items-center gap-1">
                      <Users className="w-3 h-3" />{event.organizer.follower_count.toLocaleString()} followers
                    </p>
                  )}
                </div>
              </div>
              <Button variant={following ? "ghost" : "outline"} size="sm" loading={followLoading} onClick={handleFollow}>
                {following ? "Following ✓" : "Follow"}
              </Button>
            </div>

            {/* Tabs */}
            <div>
              <div className="flex gap-0 border-b border-border mb-6 overflow-x-auto">
                {(["about", ...(hasGallery ? ["gallery"] : []), "faq", "reviews"] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab as typeof activeTab)}
                    className={cn("px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px shrink-0",
                      activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground")}>
                    {tab}{tab === "reviews" && event.review_count ? ` (${event.review_count})` : ""}
                  </button>
                ))}
              </div>

              {activeTab === "about" && (
                <div
                  className="prose prose-invert max-w-none
                    prose-headings:font-display prose-headings:text-foreground prose-headings:font-bold prose-headings:mt-6 prose-headings:mb-3
                    prose-h2:text-xl prose-h3:text-lg
                    prose-p:text-muted prose-p:leading-relaxed prose-p:text-sm
                    prose-ul:text-muted prose-ul:text-sm prose-ul:leading-relaxed
                    prose-ol:text-muted prose-ol:text-sm
                    prose-li:text-muted prose-li:marker:text-primary
                    prose-strong:text-foreground prose-strong:font-semibold
                    prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                    prose-blockquote:border-primary prose-blockquote:text-muted"
                  dangerouslySetInnerHTML={{
                    __html: event.description || event.short_description || "No description provided.",
                  }}
                />
              )}

              {activeTab === "gallery" && hasGallery && (
                <PhotoGallery images={event.gallery_images!} />
              )}

              {activeTab === "faq" && (
                <div className="space-y-3">
                  {event.faq?.length ? event.faq.map((item, i) => (
                    <details key={i} className="group bg-surface-2 border border-border rounded-lg">
                      <summary className="flex items-center justify-between p-4 cursor-pointer text-sm font-medium list-none">
                        {item.question}
                        <ChevronDown className="w-4 h-4 text-muted group-open:rotate-180 transition-transform shrink-0" />
                      </summary>
                      <div className="px-4 pb-4 text-sm text-muted leading-relaxed">{item.answer}</div>
                    </details>
                  )) : <p className="text-muted text-sm">No FAQ available.</p>}
                </div>
              )}

              {activeTab === "reviews" && (
                <div className="space-y-6">
                  {event.avg_rating != null && (
                    <div className="flex items-center gap-4 p-4 bg-surface-2 border border-border rounded-lg">
                      <div className="text-5xl font-bold font-display text-primary">{event.avg_rating.toFixed(1)}</div>
                      <div>
                        <div className="flex gap-0.5 mb-1">
                          {[1,2,3,4,5].map(s => <Star key={s} className={cn("w-5 h-5", s <= Math.round(event.avg_rating!) ? "text-primary fill-primary" : "text-border")} />)}
                        </div>
                        <p className="text-sm text-muted">{event.review_count} reviews</p>
                      </div>
                    </div>
                  )}
                  {reviews.length > 0 ? reviews.map(r => (
                    <div key={r.id} className="flex gap-3">
                      <div className="w-9 h-9 rounded-full bg-surface-2 border border-border flex items-center justify-center text-sm font-bold shrink-0">
                        {r.author_name[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">{r.author_name}</span>
                          <div className="flex gap-0.5">
                            {[1,2,3,4,5].map(s => <Star key={s} className={cn("w-3 h-3", s <= r.rating ? "text-primary fill-primary" : "text-border")} />)}
                          </div>
                        </div>
                        <p className="text-sm text-muted">{r.comment}</p>
                      </div>
                    </div>
                  )) : <p className="text-sm text-muted">No reviews yet — check back after the event.</p>}
                </div>
              )}
            </div>

            {/* Notices */}
            <div className="space-y-3">
              {event.age_restriction && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-warning/10 border border-warning/20 text-sm">
                  <span className="text-xl">🔞</span>
                  <div>
                    <p className="font-medium text-warning">Age Restriction</p>
                    <p className="text-warning/80 text-xs">This event is for attendees aged {event.age_restriction}+. Valid ID required at entry.</p>
                  </div>
                </div>
              )}
              {event.dress_code && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-surface-2 border border-border text-sm">
                  <span className="text-xl">👔</span>
                  <div>
                    <p className="font-medium">Dress Code</p>
                    <p className="text-muted text-xs">{event.dress_code}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Related Events */}
            {related.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-xl font-bold">Similar Events</h3>
                  <Link href="/events" className="flex items-center gap-1 text-sm text-primary hover:underline">
                    Browse all <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {related.map(e => <EventCard key={e.id} event={e} />)}
                </div>
              </div>
            )}
          </div>

          {/* ── Sticky Sidebar ── */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-4">

              {/* Countdown */}
              <div className="bg-surface-2 border border-border rounded-xl p-4">
                <p className="text-xs text-muted text-center mb-3 uppercase tracking-widest">Time Until Event</p>
                <CountdownDisplay startsAt={event.starts_at} />
              </div>

              {/* Ticket panel */}
              <div className="bg-surface-2 border border-border rounded-xl p-5 space-y-4">
                <h3 className="font-display font-bold text-lg">Get Tickets</h3>

                {publicTiers.length === 0 ? (
                  <p className="text-muted text-sm">No tickets available at this time.</p>
                ) : (
                  <div className="space-y-3">
                    {publicTiers.map(tier => (
                      <div key={tier.id} className={cn("border rounded-lg p-4 transition-all",
                        quantities[tier.id] > 0 ? "border-primary/40 bg-primary/5" : "border-border bg-surface")}>
                        <div className="flex justify-between items-start mb-1.5">
                          <div className="flex-1 min-w-0 mr-2">
                            <p className="font-medium text-sm">{tier.name}</p>
                            {tier.description && <p className="text-xs text-muted truncate">{tier.description}</p>}
                          </div>
                          <p className="font-bold text-primary text-sm shrink-0">
                            {tier.is_free ? "Free" : `KES ${Number(tier.price).toLocaleString()}`}
                          </p>
                        </div>
                        {tier.perks?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {tier.perks.map(p => <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{p}</span>)}
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          {tier.available > 0 ? (
                            <>
                              <span className={cn("text-xs", tier.available <= 20 ? "text-warning" : "text-muted")}>
                                {tier.available <= 20 ? `⚠️ Only ${tier.available} left` : `${tier.available} available`}
                              </span>
                              <div className="flex items-center gap-2">
                                <button onClick={() => updateQty(tier.id, -1, tier)}
                                  className="w-7 h-7 rounded-full border border-border hover:border-primary transition-colors flex items-center justify-center">
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="w-6 text-center text-sm font-medium">{quantities[tier.id] || 0}</span>
                                <button onClick={() => updateQty(tier.id, 1, tier)}
                                  className="w-7 h-7 rounded-full border border-border hover:border-primary transition-colors flex items-center justify-center">
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-error font-medium">Sold out</span>
                          )}
                        </div>
                        {tier.max_per_order > 0 && (
                          <p className="text-xs text-muted mt-1">Max {tier.max_per_order} per order</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {totalQty > 0 && (
                  <div className="flex items-center justify-between text-sm border-t border-border pt-3">
                    <span className="text-muted">{totalQty} ticket{totalQty > 1 ? "s" : ""}</span>
                    <span className="font-bold">{totalPrice === 0 ? "Free" : `KES ${totalPrice.toLocaleString()}`}</span>
                  </div>
                )}

                <Button className="w-full" onClick={handleCheckout} disabled={totalQty === 0} loading={adding}>
                  {totalQty === 0 ? "Select Tickets" : `Get ${totalQty} Ticket${totalQty > 1 ? "s" : ""} →`}
                </Button>

                {event.refund_policies?.length > 0 && (
                  <p className="text-xs text-muted text-center">
                    ✓ Refund available up to {event.refund_policies[0].days_before_event} days before event
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
