"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Ticket, LayoutDashboard, CalendarDays, BarChart2,
  Wallet, Settings, Tag, Send, TrendingUp, ChevronLeft, Menu, X, LogOut
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard",                label: "Overview",        icon: LayoutDashboard },
  { href: "/dashboard/events",         label: "Events",          icon: CalendarDays    },
  { href: "/dashboard/analytics",      label: "Analytics",       icon: BarChart2       },
  { href: "/dashboard/promos",         label: "Promo Codes",     icon: Tag             },
  { href: "/dashboard/revenue",        label: "Revenue & Fees",  icon: TrendingUp      },
  { href: "/dashboard/communications", label: "Communications",  icon: Send            },
  { href: "/dashboard/payouts",        label: "Payouts",         icon: Wallet          },
  { href: "/dashboard/settings",       label: "Settings",        icon: Settings        },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => { await logout(); router.push("/"); };

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <aside className={cn(
      "flex flex-col bg-surface border-r border-border h-full transition-all",
      mobile ? "w-64" : collapsed ? "w-16" : "w-60"
    )}>
      <div className="flex items-center justify-between h-16 px-4 border-b border-border shrink-0">
        {(!collapsed || mobile) && (
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="EliteTicketPass Dashboard" className="h-12 w-auto object-contain" />
          </Link>
        )}
        {!mobile && (
          <button onClick={() => setCollapsed(!collapsed)} className="p-1 text-muted hover:text-foreground ml-auto">
            <ChevronLeft className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
          </button>
        )}
      </div>

      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname?.startsWith(href));
          return (
            <Link key={href} href={href} onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium transition-colors",
                active ? "bg-primary/10 text-primary" : "text-muted hover:text-foreground hover:bg-surface-2"
              )}>
              <Icon className={cn("w-4.5 h-4.5 shrink-0", active ? "text-primary" : "text-muted")} />
              {(!collapsed || mobile) && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border">
        {(!collapsed || mobile) && user && (
          <div className="flex items-center gap-2.5 mb-2 px-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
              {user.first_name?.[0] || "U"}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium truncate">{user.first_name}</p>
              <p className="text-xs text-muted truncate">{user.email}</p>
            </div>
          </div>
        )}
        <button onClick={handleLogout}
          className={cn("flex items-center gap-2 w-full px-3 py-2 rounded-sm text-sm text-error hover:bg-error/10 transition-colors", collapsed && !mobile && "justify-center")}>
          <LogOut className="w-4 h-4 shrink-0" />
          {(!collapsed || mobile) && "Sign Out"}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:block shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
            <motion.div initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: "spring", damping: 30 }}
              className="fixed left-0 top-0 bottom-0 z-50 md:hidden">
              <Sidebar mobile />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between h-14 px-4 border-b border-border bg-surface">
          <button onClick={() => setMobileOpen(true)} className="p-1 text-muted">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-display font-bold gold-text">Dashboard</span>
          <div />
        </div>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
