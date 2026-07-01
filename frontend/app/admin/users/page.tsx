"use client";

import { useState, useEffect, useCallback, useRef, ElementType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Filter, Users, ChevronDown, ChevronUp, MoreVertical,
  ShieldOff, Ban, CheckCircle2, Mail, UserCog, X, AlertTriangle,
  ShoppingBag, CalendarDays, Wallet, ExternalLink, RefreshCw,
  Eye, EyeOff, Copy,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatDate, formatDateTime, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type UserRole   = "BUYER" | "ORGANIZER" | "GATE_STAFF" | "ADMIN" | "SUPER_ADMIN";
type UserStatus = "ACTIVE" | "SUSPENDED" | "BANNED";
type SortField  = "created_at" | "email" | "total_spent" | "total_events";

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  is_email_verified: boolean;
  created_at: string;
  last_login?: string;
  total_orders?: number;
  total_spent?: string;
  total_events?: number;
  avatar_url?: string;
}

interface UserDetail extends AdminUser {
  orders:  { id: string; order_number: string; event_title: string; total: string; status: string; created_at: string }[];
  events:  { id: string; title: string; starts_at: string; tickets_sold: number; gross: string }[];
  payouts: { id: string; amount: string; status: string; created_at: string }[];
}

const ROLE_STYLES: Record<UserRole, string> = {
  BUYER:       "bg-surface text-muted border-border",
  GATE_STAFF:  "bg-surface text-foreground border-border",
  ORGANIZER:   "bg-primary/10 text-primary border-primary/20",
  ADMIN:       "bg-warning/10 text-warning border-warning/20",
  SUPER_ADMIN: "bg-error/10 text-error border-error/20",
};

const STATUS_STYLES: Record<UserStatus, string> = {
  ACTIVE:    "bg-success/10 text-success",
  SUSPENDED: "bg-warning/10 text-warning",
  BANNED:    "bg-error/10 text-error",
};

// ── Confirm modal ─────────────────────────────────────────────────────────────

function ConfirmModal({ title, body, variant = "error", onConfirm, onClose, loading }: {
  title: string; body: string; variant?: "error" | "warning";
  onConfirm: () => void; onClose: () => void; loading: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-surface-2 border border-border rounded-xl w-full max-w-sm p-6">
        <div className={cn("w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4",
          variant === "error" ? "bg-error/10" : "bg-warning/10")}>
          <AlertTriangle className={cn("w-6 h-6", variant === "error" ? "text-error" : "text-warning")} />
        </div>
        <h3 className="font-semibold text-center mb-2">{title}</h3>
        <p className="text-sm text-muted text-center mb-6">{body}</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button loading={loading} onClick={onConfirm}
            className={cn("flex-1", variant === "error" ? "bg-error hover:bg-error/90" : "")}>
            Confirm
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── User detail drawer ────────────────────────────────────────────────────────

function UserDrawer({ userId, onClose, onUpdated }: {
  userId: string; onClose: () => void; onUpdated: () => void;
}) {
  const [user,     setUser]     = useState<UserDetail | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<"orders" | "events" | "payouts">("orders");
  const [confirm,  setConfirm]  = useState<null | { action: string; payload?: any; title: string; body: string; variant: "error" | "warning" }>(null);
  const [actLoading, setActLoading] = useState(false);
  const [impToken, setImpToken]  = useState("");
  const [showImp,  setShowImp]   = useState(false);

  useEffect(() => {
    api.get<UserDetail>(`/admin/users/${userId}/`).then(r => {
      if (r.success && r.data) setUser(r.data);
      setLoading(false);
    });
  }, [userId]);

  const doAction = async (action: string, payload: any = {}) => {
    setActLoading(true);
    const res = await api.post(`/admin/users/${userId}/${action}/`, payload);
    if (res.success) {
      toast.success(`Action '${action}' applied`);
      if (action === "impersonate" && (res.data as any)?.token) {
        setImpToken((res.data as any).token);
        setShowImp(true);
      } else {
        // Reload user + parent list
        const r2 = await api.get<UserDetail>(`/admin/users/${userId}/`);
        if (r2.success && r2.data) setUser(r2.data);
        onUpdated();
      }
    } else toast.error(res.error || "Action failed");
    setActLoading(false);
    setConfirm(null);
  };

  const copyToken = () => { navigator.clipboard.writeText(impToken); toast.success("Token copied"); };

  if (loading) return (
    <div className="fixed inset-y-0 right-0 w-full max-w-xl z-50 bg-surface border-l border-border flex items-center justify-center">
      <RefreshCw className="w-6 h-6 text-muted animate-spin" />
    </div>
  );

  if (!user) return null;

  return (
    <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="fixed inset-y-0 right-0 w-full max-w-xl z-50 bg-surface border-l border-border flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
          {user.avatar_url
            ? <img src={user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
            : user.full_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{user.full_name || user.email}</p>
          <p className="text-xs text-muted truncate">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_STYLES[user.status])}>
            {user.status}
          </span>
          <span className={cn("text-xs px-2 py-0.5 rounded border font-medium", ROLE_STYLES[user.role])}>
            {user.role}
          </span>
        </div>
        <button onClick={onClose} className="p-1.5 text-muted hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Info grid */}
      <div className="px-5 py-4 border-b border-border shrink-0">
        <div className="grid grid-cols-3 gap-3 text-sm mb-4">
          {[
            { label: "Joined",       value: formatDate(user.created_at) },
            { label: "Last login",   value: user.last_login ? formatDate(user.last_login) : "Never" },
            { label: "Email",        value: user.is_email_verified ? "Verified ✓" : "Unverified", cls: user.is_email_verified ? "text-success" : "text-warning" },
            { label: "Orders",       value: user.total_orders ?? "—" },
            { label: "Total spent",  value: user.total_spent ? formatCurrency(user.total_spent) : "—" },
            { label: "Events",       value: user.total_events ?? "—" },
          ].map(({ label, value, cls }) => (
            <div key={label}>
              <p className="text-xs text-muted mb-0.5">{label}</p>
              <p className={cn("font-medium", cls)}>{String(value)}</p>
            </div>
          ))}
        </div>

        {/* Actions row */}
        <div className="flex flex-wrap gap-2">
          {user.status === "ACTIVE" && (
            <>
              <Button size="sm" variant="outline"
                onClick={() => setConfirm({ action: "suspend", title: "Suspend account?",
                  body: "The user will be logged out and blocked from accessing the platform.", variant: "warning" })}>
                <ShieldOff className="w-3.5 h-3.5" /> Suspend
              </Button>
              <Button size="sm" variant="outline"
                onClick={() => setConfirm({ action: "ban", title: "Ban account?",
                  body: "This will permanently block the account. All active sessions end immediately.", variant: "error" })}>
                <Ban className="w-3.5 h-3.5" /> Ban
              </Button>
            </>
          )}
          {user.status !== "ACTIVE" && (
            <Button size="sm" variant="outline"
              onClick={() => setConfirm({ action: "reinstate", title: "Reinstate account?",
                body: "The user will regain full access to the platform.", variant: "warning" })}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Reinstate
            </Button>
          )}
          {!user.is_email_verified && (
            <Button size="sm" variant="outline"
              onClick={() => setConfirm({ action: "verify-email", title: "Manually verify email?",
                body: "This will mark the user's email as verified without them clicking the link.", variant: "warning" })}>
              <Mail className="w-3.5 h-3.5" /> Verify Email
            </Button>
          )}
          <Button size="sm" variant="outline"
            onClick={() => setConfirm({ action: "impersonate", title: "Impersonate user?",
              body: "A short-lived support token will be generated. Use it to access the account for support purposes only.", variant: "warning" })}>
            <UserCog className="w-3.5 h-3.5" /> Impersonate
          </Button>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-muted">Role:</span>
            <select
              value={user.role}
              onChange={(e) => {
                const newRole = e.target.value as UserRole;
                if (newRole === user.role) return;
                setConfirm({
                  action: "change-role",
                  payload: { role: newRole },
                  title: `Change role to ${newRole}?`,
                  body: `This will grant the user ${newRole} privileges across the platform.` + 
                        (newRole === "ORGANIZER" ? " An organizer profile will be generated if one does not exist." : ""),
                  variant: newRole === "ADMIN" || newRole === "SUPER_ADMIN" ? "error" : "warning"
                });
              }}
              className="bg-surface border border-border rounded-lg px-2 h-8 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="BUYER">BUYER</option>
              <option value="GATE_STAFF">GATE STAFF</option>
              <option value="ORGANIZER">ORGANIZER</option>
              <option value="ADMIN">ADMIN</option>
              <option value="SUPER_ADMIN">SUPER ADMIN</option>
            </select>
          </div>
        </div>

        {/* Impersonation token */}
        {showImp && impToken && (
          <div className="mt-3 p-3 bg-warning/5 border border-warning/20 rounded-lg">
            <p className="text-xs text-warning font-medium mb-1">Support token (expires in 15 min)</p>
            <div className="flex items-center gap-2">
              <p className="font-mono text-xs break-all flex-1">{impToken}</p>
              <button onClick={copyToken} className="shrink-0 p-1.5 hover:bg-surface rounded-sm"><Copy className="w-3.5 h-3.5 text-muted" /></button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        {(["orders", "events", "payouts"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("flex-1 py-2.5 text-xs font-medium capitalize transition-colors border-b-2 -mb-px",
              tab === t ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground")}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "orders" && (
          <div className="divide-y divide-border">
            {user.orders.length === 0 ? <p className="text-center py-10 text-muted text-sm">No orders</p>
            : user.orders.map(o => (
              <div key={o.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <p className="font-medium">{o.event_title}</p>
                  <p className="text-xs text-muted font-mono">#{o.order_number} · {formatDate(o.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">KES {Number(o.total).toLocaleString()}</p>
                  <p className={cn("text-xs", o.status === "CONFIRMED" ? "text-success" : "text-muted")}>{o.status}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "events" && (
          <div className="divide-y divide-border">
            {user.events.length === 0 ? <p className="text-center py-10 text-muted text-sm">No events</p>
            : user.events.map(e => (
              <div key={e.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <p className="font-medium">{e.title}</p>
                  <p className="text-xs text-muted">{formatDate(e.starts_at)} · {e.tickets_sold} sold</p>
                </div>
                <p className="font-semibold">KES {Number(e.gross).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
        {tab === "payouts" && (
          <div className="divide-y divide-border">
            {user.payouts.length === 0 ? <p className="text-center py-10 text-muted text-sm">No payouts</p>
            : user.payouts.map(p => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <p className="font-medium">KES {Number(p.amount).toLocaleString()}</p>
                  <p className="text-xs text-muted">{formatDate(p.created_at)}</p>
                </div>
                <span className={cn("text-xs px-2 py-0.5 rounded-full",
                  p.status === "PAID" ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {confirm && (
          <ConfirmModal title={confirm.title} body={confirm.body} variant={confirm.variant}
            loading={actLoading} onConfirm={() => doAction(confirm.action, confirm.payload)} onClose={() => setConfirm(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [users,      setUsers]      = useState<AdminUser[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "ALL">("ALL");
  const [sortField,  setSortField]  = useState<SortField>("created_at");
  const [sortDir,    setSortDir]    = useState<"asc" | "desc">("desc");
  const [page,       setPage]       = useState(1);
  const [total,      setTotal]      = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const PAGE_SIZE = 25;

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    const qs = new URLSearchParams({
      page: String(p), limit: String(PAGE_SIZE),
      ordering: `${sortDir === "desc" ? "-" : ""}${sortField}`,
    });
    if (search.trim())          qs.set("search", search.trim());
    if (roleFilter   !== "ALL") qs.set("role",   roleFilter);
    if (statusFilter !== "ALL") qs.set("status", statusFilter);

    const res = await api.get<{ results: AdminUser[] }>(`/admin/users/?${qs}`);
    if (res.success && res.data) {
      setUsers(res.data.results);
      setTotal(res.meta?.count || 0);
    }
    setLoading(false);
  }, [search, roleFilter, statusFilter, sortField, sortDir]);

  useEffect(() => { load(1); setPage(1); }, [load]);

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { load(1); setPage(1); }, 400);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) =>
    sortField === field
      ? sortDir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
      : <ChevronDown className="w-3 h-3 opacity-30" />;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">User Management</h1>
          <p className="text-muted text-sm">{total.toLocaleString()} total accounts</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => load(page)}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input value={search} onChange={e => handleSearch(e.target.value)}
            placeholder="Search name, email, phone…"
            className="w-full bg-surface-2 border border-border rounded-lg pl-9 pr-4 h-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value as any)}
          className="bg-surface-2 border border-border rounded-lg px-3 h-9 text-sm focus:outline-none">
          <option value="ALL">All roles</option>
          <option value="BUYER">Buyer</option>
          <option value="ORGANIZER">Organizer</option>
          <option value="ADMIN">Admin</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
          className="bg-surface-2 border border-border rounded-lg px-3 h-9 text-sm focus:outline-none">
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="BANNED">Banned</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">User</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Role / Status</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium cursor-pointer hover:text-foreground"
                  onClick={() => toggleSort("total_spent")}>
                  <span className="flex items-center gap-1">Spent <SortIcon field="total_spent" /></span>
                </th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium cursor-pointer hover:text-foreground"
                  onClick={() => toggleSort("total_events")}>
                  <span className="flex items-center gap-1">Events <SortIcon field="total_events" /></span>
                </th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium cursor-pointer hover:text-foreground"
                  onClick={() => toggleSort("created_at")}>
                  <span className="flex items-center gap-1">Joined <SortIcon field="created_at" /></span>
                </th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-8 bg-surface rounded-lg animate-pulse" /></td></tr>
                ))
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="py-14 text-center text-muted text-sm">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />No users found
                </td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="hover:bg-surface/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedId(u.id)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {u.avatar_url
                          ? <img src={u.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                          : u.full_name?.charAt(0) || u.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate max-w-[160px]">{u.full_name || "—"}</p>
                        <p className="text-xs text-muted truncate max-w-[160px]">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className={cn("text-xs px-2 py-0.5 rounded border font-medium w-fit", ROLE_STYLES[u.role])}>
                        {u.role}
                      </span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium w-fit", STATUS_STYLES[u.status])}>
                        {u.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {u.total_spent ? `KES ${Number(u.total_spent).toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">{u.total_events ?? "—"}</td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(u.created_at)}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setSelectedId(u.id)}
                      className="p-1.5 text-muted hover:text-foreground hover:bg-surface rounded-sm transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
            <p className="text-muted text-xs">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1}
                onClick={() => { const p = page - 1; setPage(p); load(p); }}>← Prev</Button>
              <span className="px-3 py-1 text-xs text-muted self-center">
                {page} / {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page === totalPages}
                onClick={() => { const p = page + 1; setPage(p); load(p); }}>Next →</Button>
            </div>
          </div>
        )}
      </div>

      {/* Backdrop */}
      <AnimatePresence>
        {selectedId && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setSelectedId(null)} />
            <UserDrawer
              userId={selectedId}
              onClose={() => setSelectedId(null)}
              onUpdated={() => load(page)} />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
