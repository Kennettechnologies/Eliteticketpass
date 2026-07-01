"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  ChevronLeft, TrendingUp, Ticket, ShoppingBag, RefreshCw,
  Users, ArrowDownLeft, Target, Download, FileText, MapPin,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import jsPDF from "jspdf";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsData {
  event_title: string;
  total_revenue: string;
  tickets_sold: number;
  orders_count: number;
  refunds_issued: number;
  refund_amount: string;
  capacity: number;
  fill_rate: number;
  avg_order_value: string;
  revenue_by_tier: { name: string; revenue: number; sold: number; color: string }[];
  sales_over_time: { label: string; revenue: number; tickets: number }[];
  traffic_sources: { source: string; views: number; checkouts: number; paid: number }[];
  funnel: { step: string; count: number }[];
  top_locations: { city: string; count: number; pct: number }[];
}

const COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#06b6d4"];
const GRANULARITY = ["hourly", "daily", "weekly"] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-surface-2 border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted">{label}</span>
        <Icon className={cn("w-4 h-4", color)} />
      </div>
      <p className="text-2xl font-bold font-display">{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  );
}

const CustomTooltipStyle = {
  contentStyle: { background: "#111", border: "1px solid #262626", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#9ca3af" },
};

// ── Export helpers ────────────────────────────────────────────────────────────

function exportCSV(data: AnalyticsData) {
  const rows = [
    ["Metric", "Value"],
    ["Total Revenue", data.total_revenue],
    ["Tickets Sold", data.tickets_sold],
    ["Orders", data.orders_count],
    ["Refunds", data.refunds_issued],
    ["Fill Rate", `${data.fill_rate}%`],
    [],
    ["Tier", "Revenue", "Sold"],
    ...data.revenue_by_tier.map(t => [t.name, t.revenue, t.sold]),
    [],
    ["Location", "Attendees", "%"],
    ...data.top_locations.map(l => [l.city, l.count, `${l.pct}%`]),
  ];
  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a"); a.href = url;
  a.download = `analytics-${data.event_title.replace(/\s+/g, "-")}.csv`; a.click();
}

function exportPDF(data: AnalyticsData) {
  const doc = new jsPDF();
  doc.setFontSize(16); doc.text(data.event_title, 14, 18);
  doc.setFontSize(11); doc.text("Sales Analytics Report", 14, 26);
  doc.setFontSize(10);
  const kpis = [
    `Total Revenue: ${data.total_revenue}`,
    `Tickets Sold: ${data.tickets_sold}`,
    `Orders: ${data.orders_count}`,
    `Refunds: ${data.refunds_issued}`,
    `Fill Rate: ${data.fill_rate}%`,
    `Avg Order Value: ${data.avg_order_value}`,
  ];
  kpis.forEach((k, i) => doc.text(k, 14, 38 + i * 8));
  let y = 38 + kpis.length * 8 + 8;
  doc.setFontSize(11); doc.text("Revenue by Tier", 14, y); y += 7;
  doc.setFontSize(9);
  data.revenue_by_tier.forEach(t => { doc.text(`${t.name}: KES ${t.revenue.toLocaleString()} (${t.sold} sold)`, 14, y); y += 6; });
  y += 6; doc.setFontSize(11); doc.text("Top Locations", 14, y); y += 7;
  doc.setFontSize(9);
  data.top_locations.forEach(l => { doc.text(`${l.city}: ${l.count} (${l.pct}%)`, 14, y); y += 6; });
  doc.save(`analytics-${data.event_title.replace(/\s+/g, "-")}.pdf`);
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData]           = useState<AnalyticsData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [granularity, setGranularity] = useState<"hourly" | "daily" | "weekly">("daily");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get<AnalyticsData>(`/organizer/events/${id}/analytics/?granularity=${granularity}`);
    if (res.success && res.data) setData(res.data);
    else toast.error("Failed to load analytics");
    setLoading(false);
  }, [id, granularity]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="space-y-4">
      <div className="h-8 w-48 bg-surface-2 border border-border rounded animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 bg-surface-2 border border-border rounded-xl animate-pulse" />)}
      </div>
      <div className="h-64 bg-surface-2 border border-border rounded-xl animate-pulse" />
    </div>
  );

  if (!data) return <div className="text-center py-24 text-muted">No analytics data available.</div>;

  const funnelMax = data.funnel[0]?.count || 1;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/events" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ChevronLeft className="w-4 h-4" /> Events
        </Link>
        <span className="text-muted">/</span>
        <span className="text-sm font-medium truncate max-w-[200px]">{data.event_title}</span>
        <span className="text-muted">/</span>
        <span className="text-sm font-medium">Analytics</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold">Sales Analytics</h1>
          <p className="text-muted text-sm mt-1">{data.event_title}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV(data)}>
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPDF(data)}>
            <FileText className="w-3.5 h-3.5" /> PDF
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <KpiCard label="Total Revenue"     value={formatCurrency(data.total_revenue)}   sub={`Avg ${formatCurrency(data.avg_order_value)}/order`} icon={TrendingUp}    color="text-primary" />
        <KpiCard label="Tickets Sold"      value={data.tickets_sold.toLocaleString()}   sub={`${data.fill_rate}% fill rate`}                       icon={Ticket}        color="text-secondary" />
        <KpiCard label="Orders"            value={data.orders_count.toLocaleString()}   icon={ShoppingBag}  color="text-success" />
        <KpiCard label="Fill Rate"         value={`${data.fill_rate}%`}                sub={`${data.tickets_sold} / ${data.capacity}`}             icon={Target}        color="text-warning" />
        <KpiCard label="Refunds Issued"    value={data.refunds_issued}                 sub={formatCurrency(data.refund_amount)}                    icon={ArrowDownLeft} color="text-error" />
        <KpiCard label="Capacity"          value={data.capacity.toLocaleString()}       icon={Users}         color="text-muted" />
      </div>

      {/* Sales over time */}
      <div className="bg-surface-2 border border-border rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <h3 className="font-semibold">Sales Over Time</h3>
          <div className="flex gap-1">
            {GRANULARITY.map(g => (
              <button key={g} onClick={() => setGranularity(g)}
                className={cn("px-3 h-7 rounded-sm text-xs font-medium capitalize transition-colors",
                  granularity === g ? "bg-primary text-background" : "bg-surface border border-border text-muted hover:text-foreground")}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data.sales_over_time}>
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
            <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <YAxis yAxisId="left"  tick={{ fill: "#9ca3af", fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <Tooltip {...CustomTooltipStyle}
              formatter={(v: number, name: string) => [
                name === "revenue" ? `KES ${v.toLocaleString()}` : v, name === "revenue" ? "Revenue" : "Tickets"
              ]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line yAxisId="left"  type="monotone" dataKey="revenue" stroke="#f59e0b" strokeWidth={2} dot={false} name="Revenue" />
            <Line yAxisId="right" type="monotone" dataKey="tickets" stroke="#10b981" strokeWidth={2} dot={false} name="Tickets" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Revenue by tier + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Tier breakdown */}
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-5">Revenue by Tier</h3>
          {data.revenue_by_tier.length === 0 ? (
            <p className="text-muted text-sm py-8 text-center">No sales data yet</p>
          ) : (
            <div className="flex items-center gap-6">
              <PieChart width={140} height={140}>
                <Pie data={data.revenue_by_tier} cx={65} cy={65} innerRadius={40} outerRadius={65}
                  dataKey="revenue" paddingAngle={3}>
                  {data.revenue_by_tier.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip {...CustomTooltipStyle} formatter={(v: number) => [`KES ${v.toLocaleString()}`, "Revenue"]} />
              </PieChart>
              <div className="flex-1 space-y-2.5">
                {data.revenue_by_tier.map((t, i) => (
                  <div key={t.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        {t.name}
                      </span>
                      <span className="text-muted">{t.sold} sold</span>
                    </div>
                    <div className="h-1.5 bg-surface rounded-full">
                      <div className="h-full rounded-full" style={{ width: `${(t.revenue / (data.revenue_by_tier[0]?.revenue || 1)) * 100}%`, background: COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Conversion funnel */}
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-5">Conversion Funnel</h3>
          <div className="space-y-3">
            {data.funnel.map((step, i) => {
              const pct = Math.round((step.count / funnelMax) * 100);
              const convRate = i > 0 && data.funnel[i-1].count > 0
                ? `${Math.round((step.count / data.funnel[i-1].count) * 100)}% from prev`
                : null;
              return (
                <div key={step.step}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium">{step.step}</span>
                    <span className="text-muted">{step.count.toLocaleString()} {convRate && `· ${convRate}`}</span>
                  </div>
                  <div className="h-6 bg-surface rounded-sm overflow-hidden relative">
                    <div className="h-full bg-primary/20 rounded-sm transition-all" style={{ width: `${pct}%` }} />
                    <div className="absolute inset-y-0 left-2 flex items-center">
                      <span className="text-xs font-medium text-primary">{pct}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Traffic sources + Top locations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Traffic sources */}
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-5">Traffic Sources</h3>
          {data.traffic_sources.length === 0 ? (
            <p className="text-muted text-sm py-8 text-center">No traffic data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.traffic_sources} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis dataKey="source" type="category" tick={{ fill: "#9ca3af", fontSize: 11 }} width={80} />
                <Tooltip {...CustomTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="views"     fill="#3b82f6" name="Views"     radius={[0,2,2,0]} barSize={8} />
                <Bar dataKey="checkouts" fill="#f59e0b" name="Checkouts" radius={[0,2,2,0]} barSize={8} />
                <Bar dataKey="paid"      fill="#10b981" name="Paid"      radius={[0,2,2,0]} barSize={8} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top locations */}
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-5 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-muted" /> Top Buyer Locations
          </h3>
          {data.top_locations.length === 0 ? (
            <p className="text-muted text-sm py-8 text-center">No location data yet</p>
          ) : (
            <div className="space-y-3">
              {data.top_locations.slice(0, 8).map((loc, i) => (
                <div key={loc.city}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="flex items-center gap-2">
                      <span className="text-muted w-4 text-right">{i+1}</span>
                      <span className="font-medium">{loc.city}</span>
                    </span>
                    <span className="text-muted">{loc.count} · {loc.pct}%</span>
                  </div>
                  <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                    <div className="h-full bg-secondary rounded-full" style={{ width: `${loc.pct}%` }} />
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
