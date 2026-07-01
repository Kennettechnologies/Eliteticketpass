"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Ticket, ShoppingBag, Heart, Users, Bell, Settings, LogOut, Menu, X, Shield, ArrowRightLeft, Wallet, ScanLine } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { cn, getInitials } from "@/lib/utils";
import { Navbar } from "@/components/layout/navbar";

const NAV = [
  { href: "/checkin",               label: "Scanner",       icon: ScanLine, gatePassHide: false, gatePassOnly: true },
  { href: "/profile/tickets",       label: "My Tickets",    icon: Ticket, gatePassHide: true },
  { href: "/tickets/transfer",      label: "Transfers",     icon: ArrowRightLeft, gatePassHide: true },
  { href: "/profile/orders",        label: "Order History", icon: ShoppingBag, gatePassHide: true },
  { href: "/profile/saved",         label: "Saved Events",  icon: Heart, gatePassHide: true },
  { href: "/profile/following",     label: "Following",     icon: Users, gatePassHide: true },
  { href: "/profile/notifications", label: "Notifications", icon: Bell, gatePassHide: false },
  { href: "/profile/payouts",       label: "Payouts",       icon: Wallet, gatePassHide: true },
  { href: "/profile/security",      label: "Security",      icon: Shield, gatePassHide: false },
  { href: "/profile",               label: "Settings",      icon: Settings, exact: true, gatePassHide: false },
];

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  const pathname   = usePathname();
  const router     = useRouter();
  const { user, logout, isLoading, isAuthenticated } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/auth/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const active = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const handleLogout = async () => { await logout(); router.push("/"); };

  const initials = getInitials(`${user?.first_name ?? ""} ${user?.last_name ?? ""}`);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 pt-24 pb-12">

        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between mb-6">
          <h1 className="font-display text-xl font-bold">My Account</h1>
          <button onClick={() => setMenuOpen(o => !o)} className="p-2 text-muted hover:text-foreground">
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">

          {/* Sidebar */}
          <aside className={cn("lg:block", menuOpen ? "block" : "hidden")}>
            <div className="sticky top-24 space-y-1">

              {/* Avatar + name */}
              <div className="flex items-center gap-3 px-3 py-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0 overflow-hidden">
                  {user?.avatar_url
                    ? <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                    : initials}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{user?.first_name} {user?.last_name}</p>
                  <p className="text-xs text-muted truncate">{user?.email}</p>
                </div>
              </div>

              {NAV.filter(nav => {
                if (user?.role === "GATE_STAFF" && nav.gatePassHide) return false;
                if (user?.role !== "GATE_STAFF" && nav.gatePassOnly) return false;
                return true;
              }).map(({ href, label, icon: Icon, exact }) => (
                <Link key={href} href={href} onClick={() => setMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    active(href, exact)
                      ? "bg-primary/10 text-primary"
                      : "text-muted hover:text-foreground hover:bg-surface-2"
                  )}>
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </Link>
              ))}

              <button onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:text-error hover:bg-error/5 transition-colors mt-2">
                <LogOut className="w-4 h-4 shrink-0" />
                Sign Out
              </button>
            </div>
          </aside>

          {/* Page content */}
          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
