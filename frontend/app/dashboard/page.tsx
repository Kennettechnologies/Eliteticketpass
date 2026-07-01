"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Ticket, CalendarDays, Users, ArrowUpRight, Plus, ScanLine, Wallet, Tag } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatCurrency, formatDate, statusColor } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface DashboardData {
  total_revenue: string; tickets_sold: number;
  upcoming_events: number; total_events: number;
  total_views: number;
  revenue_this_month: string;
  revenue_chart: { date: string; revenue: number; tickets: number }[];
  tier_sales: { name: string; sold: number }[];
  top_events: { id: string; title: string; tickets_sold: number; capacity: number; date: string }[];
  recent_orders: any[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<DashboardData>("/organizer/dashboard/").then(r => {
      if (r.success) setData(r.data);
      setLoading(false);
    });
  }, []);

  const kpis = data ? [
    { label: "Total Revenue", value: formatCurrency(data.total_revenue), icon: TrendingUp, color: "text-primary" },
    { label: "Tickets Sold", value: data.tickets_sold.toLocaleString(), icon: Ticket, color: "text-secondary" },
    { label: "Event Views", value: data.total_views?.toLocaleString() || "0", icon: Users, color: "text-info" },
    { label: "Upcoming Events", value: data.upcoming_events, icon: CalendarDays, color: "text-success" },
  ] : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold">Dashboard</h1>
          <p className="text-muted text-sm">Welcome back! Here's how your events are performing.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/checkin">
            <Button variant="outline" size="sm"><ScanLine className="w-4 h-4 mr-2" /> Scan Tickets</Button>
          </Link>
          <Link href="/profile/payouts">
            <Button variant="outline" size="sm"><Wallet className="w-4 h-4 mr-2" /> Payouts</Button>
          </Link>
          <Link href="/dashboard/events/new">
            <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Create Event</Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-surface-2 border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {kpis.map(({ label, value, icon: Icon, color }, i) => (
              <motion.div key={label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                className="bg-surface-2 border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-muted">{label}</span>
                  <Icon className={cn("w-4 h-4", color)} />
                </div>
                <p className="text-2xl font-bold font-display">{value}</p>
              </motion.div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Revenue Line Chart */}
            <div className="lg:col-span-2 bg-surface-2 border border-border rounded-xl p-5">
              <h3 className="font-semibold mb-4">Revenue — Last 30 Days</h3>
              {data?.revenue_chart && data.revenue_chart.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={data.revenue_chart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                    <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} tickFormatter={d => formatDate(d, "dd MMM")} />
                    <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                    <Tooltip contentStyle={{ background: "#111", border: "1px solid #262626", borderRadius: 8 }}
                      labelFormatter={d => formatDate(d)} formatter={(v: any) => [`KES ${Number(v).toLocaleString()}`, "Revenue"]} />
                    <Line type="monotone" dataKey="revenue" stroke="#f59e0b" strokeWidth={2} dot={data.revenue_chart.length === 1} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] flex items-center justify-center text-muted text-sm border border-dashed border-border rounded-lg">
                  No revenue data yet
                </div>
              )}
            </div>

            {/* Ticket Tier Pie Chart */}
            <div className="bg-surface-2 border border-border rounded-xl p-5">
              <h3 className="font-semibold mb-4">Sales by Ticket Tier</h3>
              {data?.tier_sales && data.tier_sales.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={data.tier_sales}
                      cx="50%" cy="50%"
                      innerRadius={60} outerRadius={80}
                      paddingAngle={5}
                      dataKey="sold" nameKey="name"
                    >
                      {data.tier_sales.map((entry, index) => {
                        const colors = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
                        return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                      })}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ background: "#111", border: "1px solid #262626", borderRadius: 8 }}
                      formatter={(v: any) => [`${v} tickets`, "Sold"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] flex items-center justify-center text-muted text-sm border border-dashed border-border rounded-lg">
                  No sales data yet
                </div>
              )}
              {/* Pie Chart Legend */}
              <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
                {data?.tier_sales?.slice(0, 4).map((tier, i) => {
                  const colors = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
                  return (
                    <div key={tier.name} className="flex items-center gap-1.5 text-xs text-muted">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />
                      {tier.name} ({tier.sold})
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Active Events */}
            {data?.top_events && data.top_events.length > 0 && (
              <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <h3 className="font-semibold">Top Active Events</h3>
                  <Link href="/dashboard/events" className="text-xs text-primary hover:underline flex items-center gap-1">Manage <ArrowUpRight className="w-3 h-3" /></Link>
                </div>
                <div className="divide-y divide-border">
                  {data.top_events.map((event) => {
                    const percentage = event.capacity > 0 ? Math.round((event.tickets_sold / event.capacity) * 100) : 0;
                    return (
                      <div key={event.id} className="px-5 py-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <Link href={`/dashboard/events/${event.id}`} className="text-sm font-medium hover:text-primary transition-colors line-clamp-1">
                              {event.title}
                            </Link>
                            <p className="text-xs text-muted mt-0.5">{formatDate(event.date, "dd MMM yyyy, h:mm a")}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold">{event.tickets_sold} <span className="text-muted text-xs font-normal">/ {event.capacity}</span></p>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div className="w-full bg-surface h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-primary h-full rounded-full transition-all duration-500" 
                            style={{ width: `${Math.min(100, percentage)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted text-right mt-1.5">{percentage}% Sold</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Orders */}
            {data?.recent_orders && data.recent_orders.length > 0 && (
              <div className="bg-surface-2 border border-border rounded-xl overflow-hidden h-fit">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <h3 className="font-semibold">Recent Orders</h3>
                  <Link href="/dashboard/orders" className="text-xs text-primary hover:underline flex items-center gap-1">View all <ArrowUpRight className="w-3 h-3" /></Link>
                </div>
                <div className="divide-y divide-border">
                  {data.recent_orders.slice(0, 5).map((order: any) => (
                    <div key={order.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-medium">{order.buyer_first_name} {order.buyer_last_name}</p>
                        <p className="text-xs text-muted">{order.event_title} · #{order.order_number}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">KES {Number(order.total).toLocaleString()}</p>
                        <span className={cn("text-xs px-1.5 py-0.5 rounded-full", statusColor(order.status))}>{order.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}
