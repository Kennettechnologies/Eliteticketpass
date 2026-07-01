const fs = require('fs');
let code = fs.readFileSync('frontend/app/admin/analytics/page.tsx', 'utf8');

// Types
code = code.replace('// ── Types', `// ── Types ─────────────────────────────────────────────────────────────────────

interface LiveData { today_gmv: string; today_orders: number; disputes_pending: number; disputes_resolved: number; }
interface FunnelData { views: number; checkouts: number; confirmed: number; refunded: number; }
interface TierRow { name: string; sales: number; revenue: string; }`);

// Lucide imports
code = code.replace(/import {([^}]+)} from "lucide-react";/, (match, p1) => {
    return `import {${p1}, AlertCircle, Clock, CheckCircle2, ShieldAlert} from "lucide-react";`;
});

// Recharts imports
code = code.replace(/import {([^}]+)} from "recharts";/, (match, p1) => {
    if (!p1.includes("PieChart")) p1 += ", PieChart, Pie, Cell";
    return `import {${p1}} from "recharts";`;
});

// Main component state
code = code.replace(/const \[days,\s+setDays\]\s*=\s*useState\(90\);/, `const [days,    setDays]    = useState(90);
  const [eventType, setEventType] = useState("all");
  const [category,  setCategory]  = useState("all");`);

code = code.replace(/const \[growth,\s*setGrowth\]\s*=\s*useState<GrowthRow\[\]>\(\[\]\);/, `const [growth,  setGrowth]  = useState<GrowthRow[]>([]);
  const [live,    setLive]    = useState<LiveData | null>(null);
  const [funnel,  setFunnel]  = useState<FunnelData | null>(null);
  const [tiers,   setTiers]   = useState<TierRow[]>([]);`);

// Load function
const newLoad = `const load = useCallback(async () => {
    setLoading(true);
    const qs = \`?days=\${days}&group_by=\${groupBy}&event_type=\${eventType}&category=\${category}\`;
    const [g, o, c, ge, gr, l, f, t] = await Promise.all([
      api.get<GmvData>(\`/analytics/admin/gmv/\${qs}\`),
      api.get<OrgRow[]>(\`/analytics/admin/organizers/\${qs}&limit=10\`),
      api.get<CatRow[]>(\`/analytics/admin/categories/\${qs}\`),
      api.get<GeoData>(\`/analytics/admin/geo/\${qs}\`),
      api.get<GrowthRow[]>(\`/analytics/admin/user-growth/\${qs}\`),
      api.get<LiveData>(\`/analytics/admin/live/\`),
      api.get<FunnelData>(\`/analytics/admin/funnel/\${qs}\`),
      api.get<TierRow[]>(\`/analytics/admin/tiers/\${qs}\`)
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
  }, [days, groupBy, eventType, category]);`;

code = code.replace(/const load = useCallback\(async \(\) => \{[\s\S]*?\}, \[days, groupBy\]\);/, newLoad);

// Live Strip Header
const liveStrip = `
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
      )}`;

code = code.replace(/<div className="space-y-2 pb-12">/, '<div className="space-y-2 pb-12">' + liveStrip);

// Filters Update
const filters = `
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
`;
code = code.replace(/<div className="flex gap-2 flex-wrap">\s*\{\/\* Group-by \*\/\}/, filters);

// Funnel & Tiers
const newWidgets = `
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
                       <div className={\`p-2 rounded-md \${step.bg} \${step.color}\`}><step.icon className="w-4 h-4"/></div>
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
                  <Tooltip formatter={(v: number, n: string, p: any) => [\`\${v} sales (\${formatCurrency(parseFloat(p.payload.revenue))})\`, n]} />
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
`;
code = code.replace(/\{\/\* GMV over time \*\/\}/, newWidgets + '\n      {/* GMV over time */}');

fs.writeFileSync('frontend/app/admin/analytics/page.tsx', code);
