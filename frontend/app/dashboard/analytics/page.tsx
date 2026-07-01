"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users, TrendingUp, Ticket, MapPin, RefreshCw,
  Repeat2, UserCheck, Globe, BarChart2, Eye,
  CheckCircle2, RotateCcw, Download, ChevronDown,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrgOverview {
  period: { start: string; end: string };
  revenue: string; net_revenue: string;
  orders: number; tickets_sold: number;
  check_in_count: number; check_in_rate: number;
  total_events: number;
  daily_series: { date: string; revenue: string; tickets: number; views: number }[];
}

interface Demographics {
  unique_buyers: number; repeat_buyers: number;
  first_time_buyers: number; repeat_rate: number;
  by_city: { city: string; count: number }[];
}

interface Traffic {
  by_source: { source: string; medium: string | null; visits: number }[];
  daily_series: { date: string; source: string; visits: number }[];
}

interface TierRow { name: string; capacity: number; sold: number; price: string; revenue: string; fill_pct: number; }
interface EventRow {
  id: string; title: string; date: string | null;
  capacity: number; tickets_sold: number; fill_rate: number;
  check_in_count: number; check_in_rate: number;
  revenue: string; refunds: string; refund_rate: number;
  tiers: TierRow[];
}

// ── Palette ───────────────────────────────────────────────────────────────────

const COLORS = ["#c9a84c", "#4f8ef7", "#22c55e", "#f97316", "#a855f7", "#ec4899"];

// ── Sub-components ────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-surface-2 border border-border rounded-xl p-4">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs text-muted">{label}</p>
        <div className={cn("p-2 rounded-lg", color)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold font-display">{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display font-semibold text-lg mt-6 mb-4">{children}</h2>;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const DAYS_OPTIONS = [7, 14, 30, 60, 90];

export default function OrganizerAnalyticsPage() {
  const [days,     setDays]     = useState(30);
  const [eventId,  setEventId]  = useState("");
  const [events,   setEvents]   = useState<{ id: string; title: string }[]>([]);
  const [loading,  setLoading]  = useState(true);

  const [overview, setOverview] = useState<OrgOverview | null>(null);
  const [demo,     setDemo]     = useState<Demographics | null>(null);
  const [traffic,  setTraffic]  = useState<Traffic | null>(null);
  const [perf,     setPerf]     = useState<EventRow[]>([]);
  const [selEvent, setSelEvent] = useState<EventRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = `?days=${days}${eventId ? `&event_id=${eventId}` : ""}`;
    const [ov, dm, tr, pf] = await Promise.all([
      api.get<OrgOverview>(`/analytics/organizer/overview/${qs}`),
      api.get<Demographics>(`/analytics/organizer/demographics/${qs}`),
      api.get<Traffic>(`/analytics/organizer/traffic/${qs}`),
      api.get<EventRow[]>(`/analytics/organizer/performance/${eventId ? `?event_id=${eventId}` : ""}`),
    ]);
    if (ov.success && ov.data)  setOverview(ov.data);
    if (dm.success && dm.data)  setDemo(dm.data);
    if (tr.success && tr.data)  setTraffic(tr.data);
    if (pf.success && pf.data)  { setPerf(pf.data); setSelEvent(pf.data[0] ?? null); }
    setLoading(false);
  }, [days, eventId]);

  useEffect(() => {
    api.get<{ results: { id: string; title: string }[] }>("/events/?mine=true&limit=100")
      .then(r => { if (r.success && r.data) setEvents((r.data as any).results ?? []); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const revenueData = (overview?.daily_series ?? []).map(d => ({
    date: d.date.slice(5),
    Revenue: parseFloat(d.revenue),
    Tickets: d.tickets,
    Views: d.views,
  }));

  const cityData = (demo?.by_city ?? []).slice(0, 8);

  const sourceData = (traffic?.by_source ?? []).slice(0, 6).map(s => ({
    name: s.medium ? `${s.source} / ${s.medium}` : s.source,
    visits: s.visits,
  }));

  return (
    <div className="space-y-2 pb-12">
      {/* Header + filters */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Analytics</h1>
          <p className="text-muted text-sm mt-0.5">Audience and event performance insights</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={eventId} onChange={e => setEventId(e.target.value)}
            className="bg-surface border border-border rounded-sm px-3 h-9 text-sm focus:outline-none min-w-[160px]">
            <option value="">All events</option>
            {events.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          <div className="flex rounded-sm border border-border overflow-hidden">
            {DAYS_OPTIONS.map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={cn("px-3 h-9 text-xs font-medium transition-colors",
                  days === d ? "bg-primary text-background" : "bg-surface text-muted hover:text-foreground")}>
                {d}d
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard label="Revenue" value={formatCurrency(parseFloat(overview?.revenue ?? "0"))} icon={TrendingUp} color="bg-primary/10 text-primary" />
        <KPICard label="Net Revenue" value={formatCurrency(parseFloat(overview?.net_revenue ?? "0"))} sub="after fees" icon={TrendingUp} color="bg-success/10 text-success" />
        <KPICard label="Tickets Sold" value={overview?.tickets_sold ?? 0} icon={Ticket} color="bg-primary/10 text-primary" />
        <KPICard label="Unique Buyers" value={demo?.unique_buyers ?? 0} icon={Users} color="bg-primary/10 text-primary" />
        <KPICard label="Check-in Rate" value={`${overview?.check_in_rate ?? 0}%`} sub={`${overview?.check_in_count ?? 0} attended`} icon={CheckCircle2} color="bg-success/10 text-success" />
        <KPICard label="Repeat Rate" value={`${demo?.repeat_rate ?? 0}%`} sub={`${demo?.repeat_buyers ?? 0} return buyers`} icon={Repeat2} color="bg-warning/10 text-warning" />
      </div>

      {/* Revenue over time */}
      <SectionTitle>Revenue Over Time</SectionTitle>
      <div className="bg-surface-2 border border-border rounded-xl p-5">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={revenueData}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#c9a84c" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#c9a84c" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted)" />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Area type="monotone" dataKey="Revenue" stroke="#c9a84c" fill="url(#revGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Buyer demographics + traffic side by side */}
      <div className="grid md:grid-cols-2 gap-5 mt-2">

        {/* Buyer types */}
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4 text-sm">Buyer Type</h3>
          <div className="flex items-center gap-6 mb-4">
            <div className="text-center">
              <p className="text-3xl font-bold font-display text-primary">{demo?.repeat_rate ?? 0}%</p>
              <p className="text-xs text-muted mt-0.5">Repeat</p>
            </div>
            <div className="flex-1 h-3 bg-surface rounded-full overflow-hidden">
              <div className="h-3 bg-primary rounded-full transition-all"
                style={{ width: `${demo?.repeat_rate ?? 0}%` }} />
            </div>
          </div>
          <div className="flex gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Repeat2 className="w-4 h-4 text-primary" />
              <span className="text-muted">Repeat:</span>
              <span className="font-semibold">{demo?.repeat_buyers ?? 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-success" />
              <span className="text-muted">First-time:</span>
              <span className="font-semibold">{demo?.first_time_buyers ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Traffic sources pie */}
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4 text-sm">Traffic Sources</h3>
          {sourceData.length === 0 ? (
            <p className="text-muted text-sm text-center py-8">No traffic data for this period</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Tooltip />
                  <Pie data={sourceData} dataKey="visits" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                    {sourceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 flex-1 min-w-0">
                {sourceData.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-muted truncate flex-1">{s.name}</span>
                    <span className="font-medium">{s.visits.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Buyer locations */}
      <SectionTitle>Buyer Locations</SectionTitle>
      <div className="bg-surface-2 border border-border rounded-xl p-5">
        {cityData.length === 0 ? (
          <p className="text-muted text-sm text-center py-8">No location data available</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={cityData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted)" />
              <YAxis type="category" dataKey="city" width={90} tick={{ fontSize: 11 }} stroke="var(--muted)" />
              <Tooltip />
              <Bar dataKey="count" fill="#c9a84c" radius={[0, 4, 4, 0]} name="Orders" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Event Performance Table */}
      <SectionTitle>Event Performance</SectionTitle>
      <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface">
              <tr>
                {["Event","Date","Sold / Cap","Fill","Check-in","Revenue","Refund Rate"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-muted font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-6 bg-surface rounded animate-pulse" /></td></tr>
              )) : perf.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-muted text-sm">No events found</td></tr>
              ) : perf.map(ev => (
                <tr key={ev.id} className="hover:bg-surface/50 cursor-pointer"
                  onClick={() => setSelEvent(selEvent?.id === ev.id ? null : ev)}>
                  <td className="px-4 py-3 font-medium max-w-[160px] truncate">{ev.title}</td>
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{ev.date ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{ev.tickets_sold} / {ev.capacity}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden">
                        <div className="h-1.5 bg-primary rounded-full" style={{ width: `${ev.fill_rate}%` }} />
                      </div>
                      <span className="text-xs">{ev.fill_rate}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className={cn("font-medium", ev.check_in_rate >= 70 ? "text-success" : ev.check_in_rate >= 40 ? "text-warning" : "text-error")}>
                      {ev.check_in_rate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-medium">{formatCurrency(parseFloat(ev.revenue))}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className={cn(ev.refund_rate > 10 ? "text-error" : "text-muted")}>{ev.refund_rate}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Tier drill-down */}
        {selEvent && selEvent.tiers.length > 0 && (
          <div className="border-t border-border px-5 py-4 bg-surface/30">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
              Tier breakdown — {selEvent.title}
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {selEvent.tiers.map(tier => (
                <div key={tier.name} className="bg-surface border border-border rounded-lg p-3">
                  <p className="font-semibold text-sm mb-2">{tier.name}</p>
                  <div className="space-y-1 text-xs text-muted">
                    <div className="flex justify-between"><span>Sold</span><span className="text-foreground font-medium">{tier.sold} / {tier.capacity}</span></div>
                    <div className="flex justify-between"><span>Price</span><span className="text-foreground font-medium">{formatCurrency(parseFloat(tier.price))}</span></div>
                    <div className="flex justify-between"><span>Revenue</span><span className="text-primary font-medium">{formatCurrency(parseFloat(tier.revenue))}</span></div>
                  </div>
                  <div className="mt-2 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div className="h-1.5 bg-primary rounded-full" style={{ width: `${tier.fill_pct}%` }} />
                  </div>
                  <p className="text-right text-xs text-muted mt-0.5">{tier.fill_pct}% full</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
