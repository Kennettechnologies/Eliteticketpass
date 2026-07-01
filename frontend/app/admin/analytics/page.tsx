"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp, Users, Building2, Tag, MapPin,
  RefreshCw, Download, DollarSign, BarChart2,
  AlertCircle, Clock, CheckCircle2, ShieldAlert
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LiveData { today_gmv: string; today_orders: number; disputes_pending: number; disputes_resolved: number; }
interface FunnelData { views: number; checkouts: number; confirmed: number; refunded: number; }
interface TierRow { name: string; sales: number; revenue: string; }

interface GmvSeries {
  period: string; gmv: string; fees: string;
  refunds: string; orders: number; new_users: number;
}
interface GmvData {
  period: { start: string; end: string; group_by: string };
  totals: { gmv: string; fees: string; refunds: string; orders: string; payouts: string };
  series: GmvSeries[];
}
interface OrgRow {
  organizer_id: number; name: string;
  gmv: string; platform_fees: string;
  orders: number; refund_rate: number;
}
interface CatRow { category: string; gmv: string; orders: number; events: number; }
interface GeoRow { city: string; buyers: number; orders: number; pct: number; }
interface GeoData { total_buyers: number; by_city: GeoRow[]; }
interface GrowthRow { period: string; users: number; organizers: number; }

// ── Palette ───────────────────────────────────────────────────────────────────

const COLORS = ["#c9a84c","#4f8ef7","#22c55e","#f97316","#a855f7","#ec4899","#14b8a6","#f43f5e"];

// ── Sub-components ────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-surface-2 border border-border rounded-xl p-4">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs text-muted">{label}</p>
        <div className={cn("p-2 rounded-lg", color)}><Icon className="w-4 h-4" /></div>
      </div>
      <p className="text-2xl font-bold font-display">{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

const DAYS_OPTIONS = [30, 60, 90, 180, 365];
const GROUP_OPTIONS: { label: string; value: string }[] = [
  { label: "Daily", value: "day" },
  { label: "Weekly", value: "week" },
  { label: "Monthly", value: "month" },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted">{p.name}:</span>
          <span className="font-medium">
            {typeof p.value === "number" && p.name !== "Orders" && p.name !== "New Users"
              ? formatCurrency(p.value) : p.value?.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminAnalyticsPage() {
  const [days,    setDays]    = useState(90);
  const [eventType, setEventType] = useState("all");
  const [category,  setCategory]  = useState("all");
  const [groupBy, setGroupBy] = useState("day");
  const [loading, setLoading] = useState(true);

  const [gmv,     setGmv]     = useState<GmvData | null>(null);
  const [topOrgs, setTopOrgs] = useState<OrgRow[]>([]);
  const [cats,    setCats]    = useState<CatRow[]>([]);
  const [geo,     setGeo]     = useState<GeoData | null>(null);
  const [growth,  setGrowth]  = useState<GrowthRow[]>([]);
  const [live,    setLive]    = useState<LiveData | null>(null);
  const [funnel,  setFunnel]  = useState<FunnelData | null>(null);
  const [tiers,   setTiers]   = useState<TierRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = `?days=${days}&group_by=${groupBy}&event_type=${eventType}&category=${category}`;
    const [g, o, c, ge, gr, l, f, t] = await Promise.all([
      api.get<GmvData>(`/analytics/admin/gmv/${qs}`),
      api.get<OrgRow[]>(`/analytics/admin/organizers/${qs}&limit=10`),
      api.get<CatRow[]>(`/analytics/admin/categories/${qs}`),
      api.get<GeoData>(`/analytics/admin/geo/${qs}`),
      api.get<GrowthRow[]>(`/analytics/admin/user-growth/${qs}`),
      api.get<LiveData>(`/analytics/admin/live/`),
      api.get<FunnelData>(`/analytics/admin/funnel/${qs}`),
      api.get<TierRow[]>(`/analytics/admin/tiers/${qs}`)
    ]);
    if (g.success  && g.data)  setGmv(g.data);
    if (o.success  && o.data)  setTopOrgs(o.data);
    if (c.success  && c.data)  setCats(c.data);
    if (ge.success && ge.data) setGeo(ge.data);
    if (gr.success && gr.data) setGrowth(gr.data);
    if (l.success  && l.data)  setLive(l.data);
    if (f.success  && f.data)  setFunnel(f.data);
    if (t.success  && t.data)  setTiers(t.data);
    setLoading(false);
  }, [days, groupBy, eventType, category]);

  useEffect(() => { load(); }, [load]);

  const gmvSeries = (gmv?.series ?? []).map(s => ({
    period: s.period.slice(0, 10),
    GMV:    parseFloat(s.gmv),
    Fees:   parseFloat(s.fees),
    Refunds: parseFloat(s.refunds),
    "Orders": s.orders,
    "New Users": s.new_users,
  }));

  const growthSeries = growth.map(g => ({
    period: g.period.slice(0, 10),
    "New Users": g.users,
    "New Organizers": g.organizers,
  }));

  const catData = cats.slice(0, 8).map(c => ({
    name: c.category || "Uncategorised",
    GMV: parseFloat(c.gmv),
    Orders: c.orders,
  }));

  const topOrgsBar = topOrgs.slice(0, 8).map(o => ({
    name: o.name.length > 16 ? o.name.slice(0, 14) + "…" : o.name,
    GMV: parseFloat(o.gmv),
  }));

  const geoMax = Math.max(1, ...(geo?.by_city ?? []).map(c => c.buyers));

  const exportCSV = (data: Record<string, unknown>[], filename: string) => {
    if (!data.length) return;
    const header = Object.keys(data[0]).join(",");
    const rows   = data.map(r => Object.values(r).join(","));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([[header, ...rows].join("\n")], { type: "text/csv" }));
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-2 pb-12">
      {/* Live Metrics Strip */}
      {live && (
        <div className="bg-gradient-to-r from-primary/10 via-surface to-surface border border-primary/20 rounded-xl p-4 mb-6 flex flex-wrap gap-6 items-center">
          <div className="flex items-center gap-3 pr-6 border-r border-border/50">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <div>
              <p className="text-xs text-muted font-medium uppercase tracking-wider">Today So Far</p>
              <p className="font-display font-bold text-xl">{formatCurrency(parseFloat(live.today_gmv))}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 pr-6 border-r border-border/50">
             <BarChart2 className="w-5 h-5 text-primary" />
             <div>
               <p className="text-xs text-muted font-medium uppercase tracking-wider">Tickets Today</p>
               <p className="font-display font-bold text-xl">{live.today_orders.toLocaleString()}</p>
             </div>
          </div>
          <div className="flex items-center gap-3">
             <ShieldAlert className="w-5 h-5 text-error" />
             <div>
               <p className="text-xs text-muted font-medium uppercase tracking-wider">Disputes</p>
               <p className="font-display font-bold text-xl">{live.disputes_pending} <span className="text-sm font-normal text-muted">pending</span> / {live.disputes_resolved} <span className="text-sm font-normal text-muted">resolved</span></p>
             </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Platform Analytics</h1>
          <p className="text-muted text-sm mt-0.5">GMV, growth, and market breakdown</p>
        </div>
        
        <div className="flex gap-2 flex-wrap">
          {/* Advanced Filters */}
          <select value={eventType} onChange={e => setEventType(e.target.value)}
            className="bg-surface border border-border rounded-sm px-3 h-9 text-xs focus:outline-none">
            <option value="all">All Events</option>
            <option value="physical">Physical</option>
            <option value="online">Online</option>
            <option value="hybrid">Hybrid</option>
          </select>
          <input type="text" value={category === "all" ? "" : category} onChange={e => setCategory(e.target.value || "all")}
            placeholder="Category filter..." className="bg-surface border border-border rounded-sm px-3 h-9 text-xs focus:outline-none w-32" />
          
          {/* Group-by */}

          <div className="flex rounded-sm border border-border overflow-hidden">
            {GROUP_OPTIONS.map(g => (
              <button key={g.value} onClick={() => setGroupBy(g.value)}
                className={cn("px-3 h-9 text-xs font-medium transition-colors",
                  groupBy === g.value ? "bg-primary text-background" : "bg-surface text-muted hover:text-foreground")}>
                {g.label}
              </button>
            ))}
          </div>
          {/* Days */}
          <div className="flex rounded-sm border border-border overflow-hidden">
            {DAYS_OPTIONS.map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={cn("px-3 h-9 text-xs font-medium transition-colors",
                  days === d ? "bg-primary text-background" : "bg-surface text-muted hover:text-foreground")}>
                {d >= 365 ? "1y" : `${d}d`}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard label="GMV" value={formatCurrency(parseFloat(gmv?.totals.gmv ?? "0"))} icon={TrendingUp} color="bg-primary/10 text-primary" />
        <KPICard label="Platform Fees" value={formatCurrency(parseFloat(gmv?.totals.fees ?? "0"))} icon={DollarSign} color="bg-success/10 text-success" />
        <KPICard label="Total Orders" value={(parseInt(gmv?.totals.orders ?? "0")).toLocaleString()} icon={BarChart2} color="bg-primary/10 text-primary" />
        <KPICard label="Refunds" value={formatCurrency(parseFloat(gmv?.totals.refunds ?? "0"))} icon={RefreshCw} color="bg-error/10 text-error" />
        <KPICard label="Total Payouts" value={formatCurrency(parseFloat(gmv?.totals.payouts ?? "0"))} icon={Building2} color="bg-warning/10 text-warning" />
      </div>

      
      {/* Funnel & Tiers */}
      <div className="grid lg:grid-cols-2 gap-5 mt-4">
        {/* Conversion Funnel */}
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4">Platform Conversion Funnel</h2>
          {funnel && (
            <div className="space-y-4">
               {[
                 { label: "Page Views", val: funnel.views, icon: Users, color: "text-primary", bg: "bg-primary/10" },
                 { label: "Checkouts Started", val: funnel.checkouts, icon: Clock, color: "text-warning", bg: "bg-warning/10" },
                 { label: "Confirmed Orders", val: funnel.confirmed, icon: CheckCircle2, color: "text-success", bg: "bg-success/10" },
                 { label: "Refunds", val: funnel.refunded, icon: AlertCircle, color: "text-error", bg: "bg-error/10" }
               ].map((step, i, arr) => {
                 const pct = i === 0 ? 100 : (arr[i-1].val ? (step.val / arr[i-1].val * 100).toFixed(1) : 0);
                 return (
                   <div key={step.label} className="relative flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
                     <div className="flex items-center gap-3">
                       <div className={`p-2 rounded-md ${step.bg} ${step.color}`}><step.icon className="w-4 h-4"/></div>
                       <span className="font-medium text-sm">{step.label}</span>
                     </div>
                     <div className="flex flex-col items-end">
                       <span className="font-bold text-lg">{step.val.toLocaleString()}</span>
                       {i > 0 && <span className="text-xs text-muted">↓ {pct}% from previous</span>}
                     </div>
                   </div>
                 );
               })}
            </div>
          )}
        </div>

        {/* Ticket Tier Performance */}
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4">Ticket Tier Performance</h2>
          {tiers.length > 0 ? (
            <div className="flex flex-col h-full">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={tiers} dataKey="sales" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2}>
                    {tiers.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string, p: any) => [`${v} sales (${formatCurrency(parseFloat(p.payload.revenue))})`, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {tiers.map((t, i) => (
                  <div key={t.name} className="flex items-center justify-between text-xs p-2 rounded hover:bg-surface/50">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="font-medium">{t.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-muted">{t.sales.toLocaleString()} sold</span>
                      <span className="font-semibold w-24 text-right">{formatCurrency(parseFloat(t.revenue))}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-muted text-sm text-center py-12">No tier data</p>
          )}
        </div>
      </div>

      {/* GMV over time */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-lg">GMV Over Time</h2>
          <Button size="sm" variant="outline" onClick={() => exportCSV(gmvSeries as any, "gmv")}>
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
        </div>
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={gmvSeries}>
              <defs>
                <linearGradient id="gmvGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#c9a84c" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#c9a84c" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="feeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="period" tick={{ fontSize: 10 }} stroke="var(--muted)" />
              <YAxis tick={{ fontSize: 10 }} stroke="var(--muted)" />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="GMV"   stroke="#c9a84c" fill="url(#gmvGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="Fees"  stroke="#22c55e" fill="url(#feeGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="Refunds" stroke="#ef4444" fill="none" strokeWidth={1.5} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* User growth */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-lg">User Growth</h2>
          <Button size="sm" variant="outline" onClick={() => exportCSV(growthSeries as any, "user-growth")}>
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
        </div>
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={growthSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="period" tick={{ fontSize: 10 }} stroke="var(--muted)" />
              <YAxis tick={{ fontSize: 10 }} stroke="var(--muted)" />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="New Users"       fill="#4f8ef7" radius={[3,3,0,0]} />
              <Bar dataKey="New Organizers"  fill="#c9a84c" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top organizers + Categories side by side */}
      <div className="grid lg:grid-cols-2 gap-5 mt-4">

        {/* Top organizers bar */}
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm">Top Organizers by GMV</h2>
            <Button size="sm" variant="outline" onClick={() => exportCSV(topOrgs as any, "top-organizers")}>
              <Download className="w-3 h-3" />
            </Button>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topOrgsBar} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} stroke="var(--muted)" tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} stroke="var(--muted)" />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="GMV" radius={[0,4,4,0]}>
                {topOrgsBar.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* Table below */}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border">
                <th className="text-left py-2 px-2 text-muted font-medium">Organizer</th>
                <th className="text-right py-2 px-2 text-muted font-medium">GMV</th>
                <th className="text-right py-2 px-2 text-muted font-medium">Orders</th>
                <th className="text-right py-2 px-2 text-muted font-medium">Refund %</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {topOrgs.slice(0, 8).map((o, i) => (
                  <tr key={o.organizer_id} className="hover:bg-surface/50">
                    <td className="py-2 px-2 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      {o.name}
                    </td>
                    <td className="py-2 px-2 text-right font-medium text-primary">{formatCurrency(parseFloat(o.gmv))}</td>
                    <td className="py-2 px-2 text-right text-muted">{o.orders}</td>
                    <td className="py-2 px-2 text-right">
                      <span className={cn(o.refund_rate > 10 ? "text-error" : "text-muted")}>{o.refund_rate}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Categories */}
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm">Popular Categories</h2>
          </div>
          {catData.length === 0 ? (
            <p className="text-muted text-sm text-center py-12">No category data</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={catData} dataKey="GMV" cx="50%" cy="50%" outerRadius={75} innerRadius={40}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}>
                    {catData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-2">
                {catData.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="flex-1 text-muted">{c.name}</span>
                    <span className="font-medium">{formatCurrency(c.GMV)}</span>
                    <span className="text-muted ml-1">{c.Orders} orders</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Geographic Heatmap */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-display font-semibold text-lg">Geographic Distribution</h2>
            <p className="text-xs text-muted mt-0.5">{geo?.total_buyers?.toLocaleString() ?? 0} unique buyers</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => exportCSV(geo?.by_city as any ?? [], "geo-heatmap")}>
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
        </div>
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          {!geo?.by_city?.length ? (
            <p className="text-muted text-sm text-center py-10">No location data for this period</p>
          ) : (
            <div className="space-y-2">
              {geo.by_city.map((city, i) => (
                <div key={city.city} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-40 shrink-0">
                    <MapPin className="w-3.5 h-3.5 text-muted shrink-0" />
                    <span className="text-sm truncate" title={city.city}>{city.city}</span>
                  </div>
                  <div className="flex-1 h-6 bg-surface rounded overflow-hidden">
                    <div
                      className="h-6 rounded flex items-center justify-end pr-2 transition-all"
                      style={{
                        width: `${Math.max(4, (city.buyers / geoMax) * 100)}%`,
                        background: `${COLORS[i % COLORS.length]}`,
                        opacity: 0.85,
                      }}>
                      <span className="text-xs font-medium text-background whitespace-nowrap">
                        {city.buyers.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="w-16 text-right shrink-0">
                    <span className="text-xs text-muted">{city.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
