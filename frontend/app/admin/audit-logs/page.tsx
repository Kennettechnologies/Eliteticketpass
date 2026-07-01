"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText, Search, Filter, Download, RefreshCw,
  User, Shield, Trash2, Edit2, LogIn, LogOut,
  CreditCard, RotateCcw, QrCode, Wallet, XCircle,
  CheckCircle2, AlertTriangle, Eye,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import type { ElementType } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type AuditAction =
  | "CREATE" | "UPDATE" | "DELETE"
  | "LOGIN"  | "LOGOUT"
  | "PAYMENT" | "REFUND" | "CHECKIN"
  | "PAYOUT" | "SUSPEND" | "BAN"
  | "APPROVE" | "REJECT" | "IMPERSONATE";

interface AuditEntry {
  id: string;
  user_email: string | null;
  user_id: string | null;
  action: AuditAction;
  entity: string;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string;
  created_at: string;
}

interface PaginatedResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: AuditEntry[];
}

// ── Action config ─────────────────────────────────────────────────────────────

const ACTION_CFG: Record<AuditAction, { icon: ElementType; cls: string; label: string }> = {
  CREATE:      { icon: Edit2,         cls: "bg-success/10 text-success",  label: "Create"      },
  UPDATE:      { icon: Edit2,         cls: "bg-primary/10 text-primary",  label: "Update"      },
  DELETE:      { icon: Trash2,        cls: "bg-error/10 text-error",      label: "Delete"      },
  LOGIN:       { icon: LogIn,         cls: "bg-success/10 text-success",  label: "Login"       },
  LOGOUT:      { icon: LogOut,        cls: "bg-muted/10 text-muted",      label: "Logout"      },
  PAYMENT:     { icon: CreditCard,    cls: "bg-primary/10 text-primary",  label: "Payment"     },
  REFUND:      { icon: RotateCcw,     cls: "bg-warning/10 text-warning",  label: "Refund"      },
  CHECKIN:     { icon: QrCode,        cls: "bg-success/10 text-success",  label: "Check-in"    },
  PAYOUT:      { icon: Wallet,        cls: "bg-primary/10 text-primary",  label: "Payout"      },
  SUSPEND:     { icon: AlertTriangle, cls: "bg-warning/10 text-warning",  label: "Suspend"     },
  BAN:         { icon: XCircle,       cls: "bg-error/10 text-error",      label: "Ban"         },
  APPROVE:     { icon: CheckCircle2,  cls: "bg-success/10 text-success",  label: "Approve"     },
  REJECT:      { icon: XCircle,       cls: "bg-error/10 text-error",      label: "Reject"      },
  IMPERSONATE: { icon: Eye,           cls: "bg-orange-500/10 text-orange-400", label: "Impersonate" },
};

const ALL_ACTIONS: AuditAction[] = [
  "CREATE","UPDATE","DELETE","LOGIN","LOGOUT",
  "PAYMENT","REFUND","CHECKIN","PAYOUT",
  "SUSPEND","BAN","APPROVE","REJECT","IMPERSONATE",
];

// ── Detail drawer ─────────────────────────────────────────────────────────────

function EntryDrawer({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  const cfg = ACTION_CFG[entry.action] ?? ACTION_CFG.UPDATE;
  const Icon = cfg.icon;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 flex justify-end"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="w-full max-w-lg h-full bg-surface-2 border-l border-border overflow-y-auto">

        <div className="sticky top-0 z-10 bg-surface-2 border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", cfg.cls)}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold">{cfg.label} — {entry.entity}</p>
              <p className="text-xs text-muted">{formatDateTime(entry.created_at)}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5 text-sm">
          <Field label="Actor"     value={entry.user_email ?? "Anonymous"} />
          <Field label="User ID"   value={entry.user_id ?? "—"} mono />
          <Field label="Entity ID" value={entry.entity_id ?? "—"} mono />
          <Field label="IP Address" value={entry.ip_address ?? "—"} mono />
          <Field label="User Agent" value={entry.user_agent || "—"} />

          {entry.metadata && (
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Metadata</p>
              <pre className="bg-surface border border-border rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </div>
          )}

          {entry.old_value && (
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Before</p>
              <pre className="bg-error/5 border border-error/20 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap text-error">
                {JSON.stringify(entry.old_value, null, 2)}
              </pre>
            </div>
          )}

          {entry.new_value && (
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">After</p>
              <pre className="bg-success/5 border border-success/20 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap text-success">
                {JSON.stringify(entry.new_value, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-4">
      <span className="text-xs text-muted w-24 shrink-0 pt-0.5">{label}</span>
      <span className={cn("text-sm break-all", mono && "font-mono")}>{value}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AuditLogsPage() {
  const [entries,  setEntries]  = useState<AuditEntry[]>([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);
  const PAGE_SIZE = 30;

  // Filters
  const [search,     setSearch]     = useState("");
  const [action,     setAction]     = useState<AuditAction | "">("");
  const [entity,     setEntity]     = useState("");
  const [from,       setFrom]       = useState("");
  const [to,         setTo]         = useState("");
  const [selected,   setSelected]   = useState<AuditEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      page:  String(page),
      limit: String(PAGE_SIZE),
    });
    if (search.trim()) qs.set("search",  search.trim());
    if (action)        qs.set("action",  action);
    if (entity.trim()) qs.set("entity",  entity.trim());
    if (from)          qs.set("from",    from);
    if (to)            qs.set("to",      to);

    const res = await api.get<PaginatedResponse>(`/admin/audit-logs/?${qs}`);
    if (res.success && res.data) {
      setEntries((res.data as any).results ?? []);
      setTotal(res.meta?.count || (res.data as any).count || 0);
    }
    setLoading(false);
  }, [page, search, action, entity, from, to]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportCSV = () => {
    const header = ["Time","Actor","Action","Entity","Entity ID","IP"];
    const rows   = entries.map(e => [
      e.created_at, `"${e.user_email ?? "anon"}"`,
      e.action, e.entity, e.entity_id ?? "",
      e.ip_address ?? "",
    ]);
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const a   = document.createElement("a");
    a.href    = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `audit-log-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold">Audit Log</h1>
          <p className="text-muted text-sm">{total.toLocaleString()} entries</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={exportCSV} disabled={entries.length === 0}>
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-2 border border-border rounded-xl p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search user or entity…"
            className="w-full bg-surface border border-border rounded-sm pl-9 pr-3 h-9 text-sm focus:outline-none" />
        </div>
        <select value={action} onChange={e => { setAction(e.target.value as any); setPage(1); }}
          className="bg-surface border border-border rounded-sm px-3 h-9 text-sm focus:outline-none min-w-[130px]">
          <option value="">All actions</option>
          {ALL_ACTIONS.map(a => <option key={a} value={a}>{ACTION_CFG[a].label}</option>)}
        </select>
        <input value={entity} onChange={e => { setEntity(e.target.value); setPage(1); }}
          placeholder="Entity (e.g. Event)"
          className="bg-surface border border-border rounded-sm px-3 h-9 text-sm focus:outline-none w-36" />
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }}
            className="bg-surface border border-border rounded-sm px-3 h-9 text-sm focus:outline-none" />
          <span className="text-muted text-xs">to</span>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }}
            className="bg-surface border border-border rounded-sm px-3 h-9 text-sm focus:outline-none" />
        </div>
        {(search || action || entity || from || to) && (
          <button onClick={() => { setSearch(""); setAction(""); setEntity(""); setFrom(""); setTo(""); setPage(1); }}
            className="text-xs text-error hover:underline">Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface">
              <tr>
                {["Time","Actor","Action","Entity","Entity ID","IP",""].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-muted font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-4 py-3">
                      <div className="h-7 bg-surface rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-muted">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No audit log entries found
                  </td>
                </tr>
              ) : entries.map(entry => {
                const cfg  = ACTION_CFG[entry.action] ?? ACTION_CFG.UPDATE;
                const Icon = cfg.icon;
                return (
                  <tr key={entry.id} className="hover:bg-surface/50 cursor-pointer"
                    onClick={() => setSelected(entry)}>
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {formatDateTime(entry.created_at)}
                    </td>
                    <td className="px-4 py-3 max-w-[160px] truncate text-xs">
                      {entry.user_email ?? <span className="text-muted italic">Anonymous</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium", cfg.cls)}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">{entry.entity}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted max-w-[120px] truncate">
                      {entry.entity_id ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted">
                      {entry.ip_address ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button className="text-xs text-primary hover:underline">Details</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted">
              Page {page} of {totalPages} · {total.toLocaleString()} entries
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                ← Prev
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={cn("w-8 h-8 text-xs rounded-sm transition-colors",
                      p === page ? "bg-primary text-background" : "hover:bg-surface text-muted")}>
                    {p}
                  </button>
                );
              })}
              <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                Next →
              </Button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selected && <EntryDrawer entry={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}
