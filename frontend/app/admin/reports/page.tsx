"use client";

import { useState, useCallback, ElementType } from "react";
import {
  TrendingUp, Users, CalendarDays, Download,
  FileText, BarChart2, RefreshCw, Filter,
  Settings2, Mail, CreditCard, ChevronDown
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import jsPDF from "jspdf";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LiabilityRow { period: string; amount: number; }
interface LiabilityData { totals: { pending: number; disbursed: number }; series: LiabilityRow[]; }


interface RevenueRow {
  period: string; gross: number; fees: number;
  net: number; refunds: number; orders: number;
}

interface UserGrowthRow { period: string; buyers: number; organizers: number; total: number; }

interface EventPerfRow {
  event_id: string; title: string; organizer: string;
  tickets_sold: number; capacity: number; gross: number;
  fill_rate: number; starts_at: string;
}

type ReportType = "revenue" | "users" | "events";

const TOOLTIP_STYLE = {
  contentStyle: { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 },
  labelStyle:   { color: "var(--foreground)", fontSize: 12 },
};

// ── CSV helpers ───────────────────────────────────────────────────────────────

function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const a   = document.createElement("a");
  a.href    = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = filename; a.click();
}

function yAxisFormatter(v: number) {
  if (v === 0) return "0";
  return v >= 1000 ? `${(v/1000).toFixed(1).replace('.0','')}k` : String(v);
}

function xAxisFormatter(v: string) {
  if (!v) return "";
  if (v.length === 10) {
    const d = new Date(v);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (v.length === 7) {
    const d = new Date(v + "-01");
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return v;
}


// ── Subscribe Modal ───────────────────────────────────────────────────────────
function SubscribeModal({ open, setOpen }: { open: boolean, setOpen: (v: boolean) => void }) {
  const [email, setEmail] = useState("");
  const [report, setReport] = useState("REVENUE");
  const [freq, setFreq] = useState("WEEKLY");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const submit = async () => {
    setLoading(true);
    const res = await api.post("/admin/reports/subscriptions/", { email, report_type: report, frequency: freq });
    setLoading(false);
    if (res.success) {
      toast.success("Subscribed successfully!");
      setOpen(false);
    } else {
      toast.error("Failed to subscribe");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-xl p-5 w-full max-w-sm">
        <h3 className="font-semibold mb-4">Subscribe to Automated Reports</h3>
        <div className="space-y-3 mb-5">
          <div>
            <label className="text-xs text-muted">Email Address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-surface-2 border border-border rounded px-3 h-9 text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted">Report Type</label>
            <select value={report} onChange={e => setReport(e.target.value)} className="w-full bg-surface-2 border border-border rounded px-3 h-9 text-sm mt-1">
              <option value="REVENUE">Revenue</option>
              <option value="USER_GROWTH">User Growth</option>
              <option value="EVENT_PERFORMANCE">Event Performance</option>
              <option value="LIABILITIES">Liabilities</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted">Frequency</label>
            <select value={freq} onChange={e => setFreq(e.target.value)} className="w-full bg-surface-2 border border-border rounded px-3 h-9 text-sm mt-1">
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" loading={loading} onClick={submit}>Subscribe</Button>
        </div>
      </div>
    </div>
  );
}

// ── Filters bar ───────────────────────────────────────────────────────────────

function FiltersBar({ from, to, setFrom, setTo, onRun, loading, extra }: {
  from: string; to: string; setFrom: (v:string)=>void; setTo: (v:string)=>void;
  onRun: () => void; loading: boolean; extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs text-muted mb-1">From</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="bg-surface-2 border border-border rounded-sm px-3 h-9 text-sm focus:outline-none" />
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">To</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="bg-surface-2 border border-border rounded-sm px-3 h-9 text-sm focus:outline-none" />
      </div>
      {extra}
      <Button size="sm" loading={loading} onClick={onRun}>
        <RefreshCw className="w-3.5 h-3.5" /> Run Report
      </Button>
    </div>
  );
}

// ── Revenue report ────────────────────────────────────────────────────────────

function RevenueReport() {
  const today = new Date();
  const [from,    setFrom]    = useState(() => new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10));
  const [to,      setTo]      = useState(() => today.toISOString().slice(0,10));
  const [groupBy, setGroupBy] = useState<"day"|"week"|"month">("day");
  const [rows,    setRows]    = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    const res = await api.get<RevenueRow[]>(`/admin/reports/revenue/?from=${from}&to=${to}&group=${groupBy}`);
    if (res.success && res.data) {
      const map = new Map(res.data.map(r => [r.period, r]));
      const filled: RevenueRow[] = [];
      const start = new Date(from);
      const end = new Date(to);
      
      if (groupBy === "day") {
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const p = d.toISOString().slice(0, 10);
          filled.push(map.get(p) || { period: p, gross: 0, fees: 0, net: 0, refunds: 0, orders: 0 });
        }
      } else if (groupBy === "month") {
        start.setDate(1);
        for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
          const p = d.toISOString().slice(0, 7);
          filled.push(map.get(p) || { period: p, gross: 0, fees: 0, net: 0, refunds: 0, orders: 0 });
        }
      } else {
        // week or other fallback, just use what backend returns
        filled.push(...res.data);
      }
      setRows(filled);
    } else {
      toast.error("Failed to load report");
    }
    setLoading(false);
  }, [from, to, groupBy]);

  const totals = rows.reduce((a, r) => ({
    gross: a.gross + r.gross, fees: a.fees + r.fees,
    net: a.net + r.net, refunds: a.refunds + r.refunds, orders: a.orders + r.orders,
  }), { gross: 0, fees: 0, net: 0, refunds: 0, orders: 0 });

  
  const exportCSV = () => {
    downloadCSV(
      `revenue-${from}-${to}.csv`,
      ["Period","Gross (KES)","Fees (KES)","Refunds (KES)","Net (KES)","Orders"],
      rows.map(r => [r.period, r.gross.toFixed(2), r.fees.toFixed(2), r.refunds.toFixed(2), r.net.toFixed(2), r.orders])
    );
  };

  const exportXero = () => {
    downloadCSV(
      `xero-export-${from}-${to}.csv`,
      ["*ContactName", "*EmailAddress", "*InvoiceNumber", "*Reference", "*InvoiceDate", "*DueDate", "*Total", "*TaxCode"],
      rows.filter(r => r.fees > 0).map((r, i) => [
        "EliteTicketPass Platform", "finance@eliteticketpass.com", `INV-${r.period.replace(/-/g,'')}`, "Platform Fees", r.period, r.period, r.fees.toFixed(2), "NONE"
      ])
    );
  };


  
  const summaryText = `Between ${from} and ${to}, the platform processed ${formatCurrency(String(totals.gross))} in Gross Revenue, collecting ${formatCurrency(String(totals.fees))} in fees across ${totals.orders} total orders.`;
  const exportPDF = () => {


    const doc = new jsPDF();
    doc.setFontSize(14); 
    doc.text(`Revenue Report — ${from} to ${to}`, 14, 18);
    doc.setFontSize(10);
    const splitText = doc.splitTextToSize(summaryText, 180);
    doc.text(splitText, 14, 25);

    doc.setFontSize(9);
    const header = ["Period","Gross","Fees","Refunds","Net","Orders"];
    const data   = rows.map(r => [r.period, `${r.gross.toFixed(0)}`, `${r.fees.toFixed(0)}`, `${r.refunds.toFixed(0)}`, `${r.net.toFixed(0)}`, `${r.orders}`]);
    [...[header],...data].forEach((row, i) =>
      row.forEach((cell, j) => doc.text(cell, 14 + j * 33, 35 + splitText.length * 4 + i * 7))
    );
    doc.save(`revenue-${from}-${to}.pdf`);
  };

  return (
    <div className="space-y-5">
      <FiltersBar from={from} to={to} setFrom={setFrom} setTo={setTo} loading={loading} onRun={run}
        extra={
          <div>
            <label className="block text-xs text-muted mb-1">Group by</label>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value as any)}
              className="bg-surface-2 border border-border rounded-sm px-3 h-9 text-sm focus:outline-none">
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </div>
        } />
        
      {rows.length > 0 && (
        <>
          <div className="bg-primary/5 border border-primary/20 text-foreground p-3 rounded-lg text-sm mb-4">
            <strong>Smart Summary:</strong> {summaryText}
          </div>
          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label:"Gross",   value: formatCurrency(String(totals.gross)),   cls:"text-primary"  },
              { label:"Fees",    value: formatCurrency(String(totals.fees)),    cls:"text-warning"  },
              { label:"Refunds", value: formatCurrency(String(totals.refunds)), cls:"text-error"    },
              { label:"Net",     value: formatCurrency(String(totals.net)),     cls:"text-success"  },
              { label:"Orders",  value: totals.orders.toLocaleString(),         cls:"text-foreground"},
            ].map(({ label, value, cls }) => (
              <div key={label} className="bg-surface-2 border border-border rounded-xl p-3">
                <p className="text-xs text-muted">{label}</p>
                <p className={cn("font-bold text-sm mt-0.5", cls)}>{value}</p>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="bg-surface-2 border border-border rounded-xl p-4">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={rows} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="period" tick={{ fill:"var(--foreground)", fontSize:11 }} tickLine={false} tickFormatter={xAxisFormatter} minTickGap={30} />
                <YAxis tick={{ fill:"var(--foreground)", fontSize:11 }} tickLine={false} axisLine={false}
                  tickFormatter={yAxisFormatter} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v:number) => [`KES ${v.toLocaleString()}`, ""]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="gross" name="Gross"      stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="net"   name="Net"        stroke="var(--success)" fill="var(--success)" fillOpacity={0.15} strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="fees"  name="Fees"       stroke="var(--warning)" fill="none"     strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-sm font-medium">{rows.length} periods</p>
              <div className="flex gap-2">
                
                <Button size="sm" variant="outline" onClick={exportCSV}><Download className="w-3.5 h-3.5 mr-1" /> CSV</Button>
                
          <Button size="sm" variant="outline" onClick={exportXero}>
            <Download className="w-3.5 h-3.5 mr-1" /> Xero CSV
          </Button>
          <Button size="sm" variant="outline" onClick={exportPDF}><FileText className="w-3.5 h-3.5" />PDF</Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface">
                  <tr>{["Period","Gross","Fees","Refunds","Net","Orders"].map(h=>(
                    <th key={h} className="text-left px-4 py-2.5 text-xs text-muted font-medium">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(r => (
                    <tr key={r.period} className="hover:bg-surface/50">
                      <td className="px-4 py-2.5 font-medium">{r.period}</td>
                      <td className="px-4 py-2.5">{r.gross.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-warning">{r.fees.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-error">{r.refunds.toLocaleString()}</td>
                      <td className="px-4 py-2.5 font-bold text-success">{r.net.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-muted">{r.orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── User growth report ────────────────────────────────────────────────────────

function UserGrowthReport() {
  const today = new Date();
  const [from,    setFrom]    = useState(() => new Date(today.getFullYear()-1, today.getMonth(), 1).toISOString().slice(0,10));
  const [to,      setTo]      = useState(() => today.toISOString().slice(0,10));
  const [rows,    setRows]    = useState<UserGrowthRow[]>([]);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    const res = await api.get<UserGrowthRow[]>(`/admin/reports/user-growth/?from=${from}&to=${to}`);
    if (res.success && res.data) {
      const map = new Map(res.data.map(r => [r.period, r]));
      const filled: UserGrowthRow[] = [];
      const start = new Date(from);
      start.setDate(1);
      const end = new Date(to);
      
      for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
        const p = d.toISOString().slice(0, 7);
        filled.push(map.get(p) || { period: p, buyers: 0, organizers: 0, total: 0 });
      }
      setRows(filled);
    } else {
      toast.error("Failed to load report");
    }
    setLoading(false);
  }, [from, to]);

  const exportCSV = () => downloadCSV(
    `user-growth-${from}-${to}.csv`,
    ["Period","New Buyers","New Organizers","Total"],
    rows.map(r => [r.period, r.buyers, r.organizers, r.total])
  );

  const totalNew = rows.reduce((a, r) => a + r.total, 0);

  return (
    <div className="space-y-5">
      <FiltersBar from={from} to={to} setFrom={setFrom} setTo={setTo} loading={loading} onRun={run} />

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total New Users", value: totalNew, cls: "text-primary"   },
              { label: "New Buyers",      value: rows.reduce((a,r)=>a+r.buyers,0),     cls: "text-success"  },
              { label: "New Organizers",  value: rows.reduce((a,r)=>a+r.organizers,0), cls: "text-warning"  },
            ].map(({ label, value, cls }) => (
              <div key={label} className="bg-surface-2 border border-border rounded-xl p-4">
                <p className="text-xs text-muted">{label}</p>
                <p className={cn("font-bold text-xl mt-0.5", cls)}>{value.toLocaleString()}</p>
              </div>
            ))}
          </div>

          <div className="bg-surface-2 border border-border rounded-xl p-4">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={rows} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="period" tick={{ fill:"var(--foreground)", fontSize:11 }} tickLine={false} tickFormatter={xAxisFormatter} minTickGap={30} />
                <YAxis tick={{ fill:"var(--foreground)", fontSize:11 }} tickLine={false} axisLine={false} tickFormatter={yAxisFormatter} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="buyers"     name="Buyers"     fill="var(--success)" radius={[3,3,0,0]} />
                <Bar dataKey="organizers" name="Organizers" fill="var(--warning)" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={exportCSV}><Download className="w-3.5 h-3.5" />Export CSV</Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Events performance report ────────────────────────────────────────────────

function EventsReport() {
  const today = new Date();
  const [from,     setFrom]     = useState(() => new Date(today.getFullYear(), today.getMonth()-2, 1).toISOString().slice(0,10));
  const [to,       setTo]       = useState(() => today.toISOString().slice(0,10));
  const [orgSearch,setOrgSearch]= useState("");
  const [rows,    setRows]    = useState<EventPerfRow[]>([]);
  const allCols = ["tickets_sold", "capacity", "fill_rate", "gross"];
  const [cols, setCols] = useState<string[]>(allCols);
  const toggleCol = (c: string) => setCols(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const [loading,  setLoading]  = useState(false);
  const [sortBy,   setSortBy]   = useState<keyof EventPerfRow>("gross");

  const run = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ from, to });
    if (orgSearch.trim()) qs.set("organizer", orgSearch.trim());
    const res = await api.get<EventPerfRow[]>(`/admin/reports/events/?${qs}`);
    if (res.success && res.data) setRows(res.data);
    else toast.error("Failed to load report");
    setLoading(false);
  }, [from, to, orgSearch]);

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortBy]; const bv = b[sortBy];
    return typeof av === "number" ? (bv as number) - av : String(bv).localeCompare(String(av));
  });

  const summaryText = `Between ${from} and ${to}, ${rows.length} events were hosted. The average fill rate was ${(rows.reduce((a,r) => a + r.fill_rate, 0) / (rows.length || 1)).toFixed(1)}%.`;
  
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); 
    doc.text(`Event Performance — ${from} to ${to}`, 14, 18);
    doc.setFontSize(10);
    const splitText = doc.splitTextToSize(summaryText, 180);
    doc.text(splitText, 14, 25);

    doc.setFontSize(9);
    const header = ["Event", "Organizer"];
    if (cols.includes("tickets_sold")) header.push("Tickets");
    if (cols.includes("capacity")) header.push("Cap");
    if (cols.includes("fill_rate")) header.push("Fill %");
    if (cols.includes("gross")) header.push("Gross");

    const data = sorted.map(r => {
        const row = [r.title.slice(0,20), r.organizer.slice(0,15)];
        if (cols.includes("tickets_sold")) row.push(`${r.tickets_sold}`);
        if (cols.includes("capacity")) row.push(`${r.capacity}`);
        if (cols.includes("fill_rate")) row.push(`${r.fill_rate.toFixed(1)}%`);
        if (cols.includes("gross")) row.push(`${r.gross.toFixed(0)}`);
        return row;
    });

    [...[header],...data].forEach((row, i) =>
      row.forEach((cell, j) => doc.text(cell, 14 + j * 30, 35 + splitText.length * 4 + i * 7))
    );
    doc.save(`events-performance-${from}-${to}.pdf`);
  };

  const exportCSV = () => downloadCSV(
    `events-performance-${from}-${to}.csv`,
    ["Title","Organizer","Date","Tickets Sold","Capacity","Fill %","Gross (KES)"],
    sorted.map(r => [`"${r.title}"`, `"${r.organizer}"`, r.starts_at, r.tickets_sold, r.capacity, r.fill_rate.toFixed(1), r.gross.toFixed(2)])
  );

  return (
    <div className="space-y-5">
      <FiltersBar from={from} to={to} setFrom={setFrom} setTo={setTo} loading={loading} onRun={run}

        extra={
          <div>
            <label className="block text-xs text-muted mb-1">Organizer filter</label>
            <input value={orgSearch} onChange={e => setOrgSearch(e.target.value)}
              placeholder="Organizer name…"
              className="bg-surface-2 border border-border rounded-sm px-3 h-9 text-sm focus:outline-none" />
          </div>
        } />

      {sorted.length > 0 && (
        <>
          {/* Top 10 by gross chart */}
          <div className="bg-surface-2 border border-border rounded-xl p-4">
            <p className="text-xs font-medium text-muted mb-3">Top 10 Events by Gross Revenue</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sorted.slice(0,10)} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fill:"var(--foreground)", fontSize:10 }} tickLine={false}
                  tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="title" width={120}
                  tick={{ fill:"var(--foreground)", fontSize:10 }} tickLine={false}
                  tickFormatter={v => v.length > 18 ? v.slice(0,18)+"…" : v} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v:number)=>[`KES ${v.toLocaleString()}`,""]} />
                <Bar dataKey="gross" name="Gross" fill="var(--primary)" radius={[0,3,3,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Sort by:</span>
                <select value={sortBy as string} onChange={e => setSortBy(e.target.value as keyof EventPerfRow)}
                  className="bg-surface border border-border rounded-sm px-2 h-7 text-xs focus:outline-none">
                  <option value="gross">Gross</option>
                  <option value="tickets_sold">Tickets sold</option>
                  <option value="fill_rate">Fill rate</option>
                  <option value="starts_at">Date</option>
                </select>
              </div>
              <Button size="sm" variant="outline" onClick={exportCSV}><Download className="w-3.5 h-3.5" />CSV</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface">
                  <tr>{["Event","Organizer","Date","Sold","Cap","Fill","Gross (KES)"].map(h=>(
                    <th key={h} className="text-left px-4 py-2.5 text-xs text-muted font-medium">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sorted.map(r => (
                    <tr key={r.event_id} className="hover:bg-surface/50">
                      <td className="px-4 py-2.5 font-medium max-w-[180px] truncate">{r.title}</td>
                      <td className="px-4 py-2.5 text-xs text-muted">{r.organizer}</td>
                      <td className="px-4 py-2.5 text-xs text-muted">{r.starts_at.slice(0,10)}</td>
                      <td className="px-4 py-2.5">{r.tickets_sold.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-muted">{r.capacity.toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1.5 bg-surface rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width:`${r.fill_rate}%` }} />
                          </div>
                          <span className="text-xs">{r.fill_rate.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-bold">{r.gross.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const REPORT_TABS: { key: ReportType; label: string; icon: ElementType }[] = [
  { key: "revenue", label: "Revenue",          icon: TrendingUp  },
  { key: "users",   label: "User Growth",      icon: Users       },
  { key: "events",  label: "Event Performance",icon: CalendarDays },
];


// ── Liabilities report ────────────────────────────────────────────────────────
function LiabilitiesReport() {
  const today = new Date();
  const [from,    setFrom]    = useState(() => new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10));
  const [to,      setTo]      = useState(() => today.toISOString().slice(0,10));
  const [groupBy, setGroupBy] = useState<"day"|"week"|"month">("day");
  const [data,    setData]    = useState<LiabilityData | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    const res = await api.get<LiabilityData>(`/admin/reports/liabilities/?from=${from}&to=${to}&group=${groupBy}`);
    if (res.success && res.data) {
      setData(res.data);
    } else {
      toast.error("Failed to load liabilities");
    }
    setLoading(false);
  }, [from, to, groupBy]);

  const summaryText = data ? `Currently carrying ${formatCurrency(String(data.totals.pending))} in unpaid liabilities. Disbursed ${formatCurrency(String(data.totals.disbursed))} in the selected period.` : "";

  return (
    <div className="space-y-5">
      <FiltersBar from={from} to={to} setFrom={setFrom} setTo={setTo} loading={loading} onRun={run}
        extra={
          <div>
            <label className="block text-xs text-muted mb-1">Group by</label>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value as any)}
              className="bg-surface-2 border border-border rounded-sm px-3 h-9 text-sm focus:outline-none">
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </div>
        } />
        
      {data && (
        <>
          <div className="bg-primary/5 border border-primary/20 text-foreground p-3 rounded-lg text-sm mb-4">
            <strong>Smart Summary:</strong> {summaryText}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-2 border border-border rounded-xl p-3">
              <p className="text-xs text-muted">Total Pending (Unpaid)</p>
              <p className="font-bold text-xl text-warning mt-0.5">{formatCurrency(String(data.totals.pending))}</p>
            </div>
            <div className="bg-surface-2 border border-border rounded-xl p-3">
              <p className="text-xs text-muted">Total Disbursed (Period)</p>
              <p className="font-bold text-xl text-success mt-0.5">{formatCurrency(String(data.totals.disbursed))}</p>
            </div>
          </div>
          <div className="bg-surface-2 border border-border rounded-xl p-4 mt-4">
            <h3 className="font-semibold text-sm mb-4">Payouts Timeline</h3>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="period" tick={{ fill:"var(--foreground)", fontSize:11 }} tickLine={false} tickFormatter={xAxisFormatter} />
                <YAxis tick={{ fill:"var(--foreground)", fontSize:11 }} tickLine={false} axisLine={false} tickFormatter={yAxisFormatter} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v:number) => [`KES ${v.toLocaleString()}`, "Disbursed"]} />
                <Area type="monotone" dataKey="amount" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminReportsPage() {
  
  const [tab, setTab] = useState<ReportType | "liabilities">("revenue");
  const [subOpen, setSubOpen] = useState(false);


  return (
    <div className="space-y-6">
      
        <div>
          <h1 className="font-display text-2xl font-bold">Reports & Exports</h1>
        <p className="text-muted text-sm">Generate and download platform reports by date range</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {REPORT_TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
              tab === key
                ? "bg-primary text-background border-primary"
                : "border-border text-muted hover:text-foreground hover:border-primary/30")}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      <div className="bg-surface-2 border border-border rounded-xl p-6">
        {tab === "revenue" && <RevenueReport    />}
        {tab === "users"   && <UserGrowthReport />}
        {tab === "events"  && <EventsReport     />}
      </div>
    </div>
  );
}
