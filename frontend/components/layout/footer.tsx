import Link from "next/link";
import { Ticket, Twitter, Instagram, Facebook, Youtube } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <img src="/logo.png" alt="EliteTicketPass Logo" className="h-8 w-auto object-contain" />
            </Link>
            <p className="text-muted text-sm leading-relaxed max-w-xs">
              Africa's premier event ticketing platform. Discover, buy, and manage event tickets with ease.
            </p>
            <div className="flex gap-4 mt-6">
              {[Twitter, Instagram, Facebook, Youtube].map((Icon, i) => (
                <a key={i} href="#" className="w-9 h-9 rounded-sm bg-surface-2 border border-border flex items-center justify-center text-muted hover:text-primary hover:border-primary/50 transition-all">
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-sm text-foreground mb-4">Discover</h4>
            <ul className="space-y-2.5">
              {[["Events", "/events"], ["Free Events", "/events?is_free=true"], ["This Weekend", "/events?date_from=this-weekend"], ["Organizers", "/organizers"]].map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-muted hover:text-foreground transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm text-foreground mb-4">Platform</h4>
            <ul className="space-y-2.5">
              {[["Sell Tickets", "/auth/register?role=ORGANIZER"], ["Dashboard", "/dashboard"], ["Pricing", "/pricing"], ["Help Center", "/help"], ["Contact", "/contact"]].map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-muted hover:text-foreground transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-border mt-10 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-muted">© {new Date().getFullYear()} EliteTicketPass. All rights reserved.</p>
          <div className="flex gap-6">
            {[["Privacy", "/privacy"], ["Terms", "/terms"]].map(([label, href]) => (
              <Link key={href} href={href} className="text-xs text-muted hover:text-foreground transition-colors">{label}</Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
