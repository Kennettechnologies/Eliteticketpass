"use client";

import Link from "next/link";
import { Calendar, MapPin, Heart } from "lucide-react";
import { cn, formatDate, formatCurrency } from "@/lib/utils";

interface Event {
  id: string;
  slug: string;
  title: string;
  cover_image_url: string;
  starts_at: string;
  venue_city: string;
  venue_name: string;
  organizer_name: string;
  organizer_logo: string;
  min_price: string | null;
  max_price: string | null;
  is_free: boolean;
  category_name: string;
  category_color: string;
  tickets_remaining: boolean;
}

interface EventCardProps {
  event: Event;
  featured?: boolean;
  className?: string;
}

export function EventCard({ event, featured, className }: EventCardProps) {
  const priceLabel = event.is_free
    ? "Free"
    : event.min_price
    ? event.min_price === event.max_price
      ? `KES ${Number(event.min_price).toLocaleString()}`
      : `KES ${Number(event.min_price).toLocaleString()} – ${Number(event.max_price).toLocaleString()}`
    : "TBD";

  return (
    <Link href={`/events/${event.slug}`} className={cn("group block", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border border-border bg-surface-2 hover-lift transition-all duration-300",
          featured && "md:col-span-2"
        )}
      >
        {/* Cover image */}
        <div className={cn("relative overflow-hidden bg-surface", featured ? "h-64" : "h-44")}>
          {event.cover_image_url ? (
            <img
              src={event.cover_image_url}
              alt={event.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/10 to-surface flex items-center justify-center">
              <span className="text-4xl">🎪</span>
            </div>
          )}

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-card-gradient" />

          {/* Category badge */}
          {event.category_name && (
            <span
              className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: event.category_color || "#f59e0b" }}
            >
              {event.category_name}
            </span>
          )}

          {/* Price badge */}
          <span
            className={cn(
              "absolute top-3 right-3 px-2.5 py-1 rounded-sm text-xs font-bold",
              event.is_free
                ? "bg-success text-white"
                : "bg-background/80 backdrop-blur-sm text-foreground border border-border/50"
            )}
          >
            {priceLabel}
          </span>

          {/* Tickets remaining warning */}
          {!event.tickets_remaining && !event.is_free && (
            <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded-sm text-xs font-medium bg-error/90 text-white">
              Sold Out
            </div>
          )}

          {/* Save button */}
          <button
            onClick={(e) => { e.preventDefault(); }}
            className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-background/60 backdrop-blur-sm flex items-center justify-center text-muted hover:text-error hover:bg-background/80 transition-all opacity-0 group-hover:opacity-100"
          >
            <Heart className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="font-semibold text-foreground line-clamp-2 mb-2 group-hover:text-primary transition-colors">
            {event.title}
          </h3>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>{formatDate(event.starts_at, "EEE, dd MMM yyyy · h:mm a")}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{event.venue_name ? `${event.venue_name}, ` : ""}{event.venue_city}</span>
            </div>
          </div>

          {/* Organizer */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
            {event.organizer_logo ? (
              <img src={event.organizer_logo} alt="" className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-bold">
                {event.organizer_name?.[0]}
              </div>
            )}
            <span className="text-xs text-muted truncate">{event.organizer_name}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
