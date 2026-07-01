"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore, type UserRole } from "@/store/auth";
import { cn } from "@/lib/utils";

// ── Role hierarchy ────────────────────────────────────────────────────────────

const ROLE_RANK: Record<UserRole, number> = {
  SUPER_ADMIN: 5,
  ADMIN:       4,
  ORGANIZER:   3,
  GATE_STAFF:  2,
  BUYER:       1,
};

export function hasMinRole(userRole: UserRole | undefined, required: UserRole): boolean {
  if (!userRole) return false;
  return (ROLE_RANK[userRole] ?? 0) >= ROLE_RANK[required];
}

export function hasAnyRole(userRole: UserRole | undefined, allowed: UserRole[]): boolean {
  if (!userRole) return false;
  return allowed.some(r => (ROLE_RANK[userRole] ?? 0) >= ROLE_RANK[r]);
}

// ── RoleGuard component ───────────────────────────────────────────────────────

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
  redirect?: string;
}

/**
 * Client-side role guard. Renders children only when the authenticated user
 * has a role in `allowedRoles`. Optionally redirects or renders a fallback.
 */
export function RoleGuard({ allowedRoles, children, fallback, redirect }: RoleGuardProps) {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();

  const allowed = hasAnyRole(user?.role, allowedRoles);

  useEffect(() => {
    if (!isLoading && !allowed && redirect) {
      router.replace(redirect);
    }
  }, [isLoading, allowed, redirect, router]);

  if (isLoading) return null;

  if (!allowed) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}

// ── AdminOnly / OrgOnly shortcuts ─────────────────────────────────────────────

export function AdminOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <RoleGuard allowedRoles={["ADMIN", "SUPER_ADMIN"]} fallback={fallback}>{children}</RoleGuard>;
}

export function OrganizerOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <RoleGuard allowedRoles={["ORGANIZER", "ADMIN", "SUPER_ADMIN"]} fallback={fallback}>{children}</RoleGuard>;
}

export function GateStaffOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <RoleGuard allowedRoles={["GATE_STAFF", "ORGANIZER", "ADMIN", "SUPER_ADMIN"]} fallback={fallback}>{children}</RoleGuard>;
}

// ── RoleBadge display component ───────────────────────────────────────────────

const ROLE_BADGE: Record<UserRole, { label: string; cls: string }> = {
  SUPER_ADMIN: { label: "Super Admin", cls: "bg-error/10 text-error border-error/20"         },
  ADMIN:       { label: "Admin",       cls: "bg-warning/10 text-warning border-warning/20"   },
  ORGANIZER:   { label: "Organizer",   cls: "bg-primary/10 text-primary border-primary/20"   },
  GATE_STAFF:  { label: "Gate Staff",  cls: "bg-success/10 text-success border-success/20"   },
  BUYER:       { label: "Buyer",       cls: "bg-surface text-muted border-border"             },
};

export function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
  const cfg = ROLE_BADGE[role];
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium", cfg.cls, className)}>
      {cfg.label}
    </span>
  );
}
