"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, Building2, CalendarDays, Wallet,
  RefreshCw, Settings, FileText, ScrollText, Ticket, LogOut, BarChart2, CreditCard
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/organizers", label: "Organizers", icon: Building2 },
  { href: "/admin/events", label: "Events", icon: CalendarDays },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/payouts", label: "Payouts", icon: Wallet },
  { href: "/admin/refunds", label: "Refunds", icon: RefreshCw },
  { href: "/admin/analytics",  label: "Analytics",  icon: BarChart2 },
  { href: "/admin/reports",    label: "Reports",    icon: ScrollText },
  { href: "/admin/config",     label: "Config",     icon: Settings  },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: FileText  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuthStore();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-56 shrink-0 flex flex-col bg-surface border-r border-border">
        <div className="flex items-center gap-2 h-14 px-4 border-b border-border">
          <img src="/logo.png" alt="EliteTicketPass Admin" className="h-7 w-auto object-contain" />
        </div>
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/admin" && pathname?.startsWith(href));
            return (
              <Link key={href} href={href}
                className={cn("flex items-center gap-2.5 px-3 py-2 rounded-sm text-sm font-medium transition-colors",
                  active ? "bg-primary/10 text-primary" : "text-muted hover:text-foreground hover:bg-surface-2")}>
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border">
          <button onClick={async () => { await logout(); router.push("/"); }}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-sm text-sm text-error hover:bg-error/10">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
    </div>
  );
}
