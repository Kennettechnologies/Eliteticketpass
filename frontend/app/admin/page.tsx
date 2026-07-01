"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users, Building2, CalendarDays, TrendingUp, Clock,
  FileCheck, AlertCircle, Activity, CheckCircle2,
  XCircle, MapPin, RefreshCw,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { api } from "@/lib/api";
import { formatCurrency, cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Range = "today" | "week" | "month" | "all";

interface AdminStats {
  total_users: number;      total_organizers: number;
  total_events: number;     pending_payouts: number;
  pending_kyc: number;      active_events_today: number;
  revenue: { today: string; week: string; month: string; all_time: string };
  fees:    { today: string; week: string; month: string; all_time: string };
}

interface ChartPoint { date: string; gmv: number; fees: number; }

interface ActiveEvent {
  id: string; title: string; organizer: string;
  venue_city: string; starts_at: string; checked_in: number; capacity: number;
}

interface HealthService { name: string; status: "ok" | "degraded" | "down"; latency_ms?: number; }

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-surface-2 border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted uppercase tracking-wide">{label}</span>
        <Icon className={cn("w-4 h-4", color)} />
      </div>
      <p className="text-xl font-bold font-display">{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function HealthBadge({ status }: { status: HealthService["status"] }) {
  const cfg = {
    ok:       { cls: "text-success bg-success/10",   icon: CheckCircle2, label: "OK"       },
    degraded: { cls: "text-warning bg-warning/10",   icon: AlertCircle,  label: "Degraded" },
    down:     { cls: "text-error bg-error/10",        icon: XCircle,      label: "Down"     },
  }[status];
  const Icon = cfg.icon;
  return (
    <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", cfg.cls)}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [stats,   setStats]   = useState<AdminStats | null>(null);
  const [chart,   setChart]   = useState<ChartPoint[]>([]);
  const [events,  setEvents]  = useState<ActiveEvent[]>([]);
  const [health,  setHealth]  = useState<HealthService[]>([]);
  const [loading, setLoading] = useState(true);
  const [range,   setRange]   = useState<Range>("week");

  const load = useCallback(async () => {
    const [sRes, cRes, eRes, hRes] = await Promise.all([
      api.get<AdminStats>("/admin/dashboard/"),
      api.get<ChartPoint[]>(`/admin/revenue-chart/?range=${range}`),
      api.get<{ results: ActiveEvent[] }>("/admin/active-events/"),
      api.get<HealthService[]>("/admin/health/"),
    ]);
    if (sRes.success && sRes.data) setStats(sRes.data);
    if (cRes.success && cRes.data) setChart(cRes.data);
    if (eRes.success && eRes.data) setEvents((eRes.data as any)?.results || []);
    if (hRes.success && hRes.data) setHealth(hRes.data);
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const rev = stats?.revenue;
  const fee = stats?.fees;
  const revValue = rev ? { today: rev.today, week: rev.week, month: rev.month, all: rev.all_time }[range] : "—";
  const feeValue = fee ? { today: fee.today, week: fee.week, month: fee.month, all: fee.all_time }[range] : "—";

  const RANGE_OPTS: { value: Range; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "week",  label: "7 days" },
    { value: "month", label: "30 days" },
    { value: "all",   label: "All time" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-muted text-sm">Platform-wide overview</p>
        </div>
        <div className="flex gap-1 p-1 bg-surface-2 border border-border rounded-lg text-xs">
          {RANGE_OPTS.map(o => (
            <button key={o.value} onClick={() => setRange(o.value)}
              className={cn("px-3 py-1.5 rounded-md font-medium transition-colors",
                range === o.value ? "bg-primary text-background" : "text-muted hover:text-foreground")}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI grid */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 bg-surface-2 border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Users"      value={stats.total_users.toLocaleString()}       icon={Users}       color="text-primary"  />
          <KpiCard label="Organizers"       value={stats.total_organizers.toLocaleString()}   icon={Building2}   color="text-secondary"/>
          <KpiCard label="Total Events"     value={stats.total_events.toLocaleString()}       icon={CalendarDays}color="text-success"  />
          <KpiCard label="Active Today"     value={stats.active_events_today}                 icon={Clock}       color="text-warning"  />
          <KpiCard label="GMV"              value={formatCurrency(revValue!)}                 icon={TrendingUp}  color="text-primary"
            sub={RANGE_OPTS.find(o=>o.value===range)?.label} />
          <KpiCard label="Platform Fees"   value={formatCurrency(feeValue!)}                 icon={TrendingUp}  color="text-success"
            sub={RANGE_OPTS.find(o=>o.value===range)?.label} />
          <KpiCard label="Pending Payouts" value={stats.pending_payouts}                      icon={AlertCircle} color="text-error"    />
          <KpiCard label="Pending KYC"     value={stats.pending_kyc}                          icon={FileCheck}   color="text-warning"  />
        </div>
      )}

      {/* Revenue chart */}
      <div className="bg-surface-2 border border-border rounded-xl p-5">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" /> Revenue Over Time
        </h2>
        {chart.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center text-muted text-sm gap-2">
            <span>No revenue data available yet.</span>
            <span>Try switching the range or confirm that there are confirmed orders in the selected period.</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gmvGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--primary, #f59e0b)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--primary, #f59e0b)" stopOpacity={0}   />
                </linearGradient>
                <linearGradient id="feeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #262626)" />
              <XAxis dataKey="date" tick={{ fill: "var(--muted, #9ca3af)", fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fill: "var(--muted, #9ca3af)", fontSize: 11 }} tickLine={false} axisLine={false}
                tickFormatter={(v) => {
                  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
                  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
                  return v.toString();
                }} />
              <Tooltip contentStyle={{ background: "var(--surface-2, #1a1a1a)", border: "1px solid var(--border, #262626)", borderRadius: 8 }}
                labelStyle={{ color: "var(--foreground, #f9fafb)", fontSize: 12 }}
                formatter={(v: number) => [`KES ${v.toLocaleString()}`, ""]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="gmv"  name="GMV"         stroke="var(--primary, #f59e0b)" fill="url(#gmvGrad)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="fees" name="Platform Fee" stroke="#10b981" fill="url(#feeGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Active events */}
        <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
            <MapPin className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Live Events Now</h2>
            <span className="ml-auto text-xs text-muted">{events.length} active</span>
          </div>
          {events.length === 0 ? (
            <div className="py-10 text-center text-muted text-sm">No live events currently active. Check event status and times.</div>
          ) : (
            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {events.map(ev => (
                <div key={ev.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-2 h-2 rounded-full bg-success animate-pulse shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ev.title}</p>
                    <p className="text-xs text-muted">{ev.organizer} · {ev.venue_city}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-mono font-bold text-success">{ev.checked_in}/{ev.capacity}</p>
                    <p className="text-xs text-muted">checked in</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* System health */}
        <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">System Health</h2>
            </div>
            <button onClick={load} className="text-muted hover:text-foreground transition-colors" title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {health.length === 0 ? (
            <div className="p-5 space-y-3">
              <div className="text-sm text-muted">System health data is unavailable. Reload or check backend health endpoints.</div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {health.map(svc => (
                <div key={svc.name} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">{svc.name}</p>
                    {svc.latency_ms != null && (
                      <p className="text-xs text-muted">{svc.latency_ms}ms</p>
                    )}
                  </div>
                  <HealthBadge status={svc.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
