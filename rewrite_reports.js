const fs = require('fs');
let code = fs.readFileSync('frontend/app/admin/reports/page.tsx', 'utf8');

// Imports
code = code.replace(/import {([^}]+)} from "lucide-react";/, (match, p1) => {
    return `import {${p1}, Settings2, Mail, CreditCard, ChevronDown} from "lucide-react";`;
});

// Types
code = code.replace('// ── Types ─────────────────────────────────────────────────────────────────────', `// ── Types ─────────────────────────────────────────────────────────────────────

interface LiabilityRow { period: string; amount: number; }
interface LiabilityData { totals: { pending: number; disbursed: number }; series: LiabilityRow[]; }
`);

// Subscription Modal
const modalCode = `
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
`;
code = code.replace('// ── Filters bar ───────────────────────────────────────────────────────────────', modalCode + '\n// ── Filters bar ───────────────────────────────────────────────────────────────');

// Xero Export in Revenue
code = code.replace(/const exportCSV = \(\) => downloadCSV\([^;]+;/s, `
  const exportCSV = () => {
    downloadCSV(
      \`revenue-\${from}-\${to}.csv\`,
      ["Period","Gross (KES)","Fees (KES)","Refunds (KES)","Net (KES)","Orders"],
      rows.map(r => [r.period, r.gross.toFixed(2), r.fees.toFixed(2), r.refunds.toFixed(2), r.net.toFixed(2), r.orders])
    );
  };

  const exportXero = () => {
    downloadCSV(
      \`xero-export-\${from}-\${to}.csv\`,
      ["*ContactName", "*EmailAddress", "*InvoiceNumber", "*Reference", "*InvoiceDate", "*DueDate", "*Total", "*TaxCode"],
      rows.filter(r => r.fees > 0).map((r, i) => [
        "EliteTicketPass Platform", "finance@eliteticketpass.com", \`INV-\${r.period.replace(/-/g,'')}\`, "Platform Fees", r.period, r.period, r.fees.toFixed(2), "NONE"
      ])
    );
  };
`);

// Add summary in Revenue
code = code.replace(/const exportPDF = \(\) => \{/, `
  const summaryText = \`Between \${from} and \${to}, the platform processed \${formatCurrency(String(totals.gross))} in Gross Revenue, collecting \${formatCurrency(String(totals.fees))} in fees across \${totals.orders} total orders.\`;
  const exportPDF = () => {
`);
code = code.replace(/doc\.text\(\`Revenue Report — \$\{from\} to \$\{to\}\`, 14, 18\);/, `
    doc.text(\`Revenue Report — \${from} to \${to}\`, 14, 18);
    doc.setFontSize(10);
    const splitText = doc.splitTextToSize(summaryText, 180);
    doc.text(splitText, 14, 25);
`);
// Shift PDF elements down due to summary
code = code.replace(/14 \+ j \* 33, 28 \+ i \* 7/, '14 + j * 33, 35 + splitText.length * 4 + i * 7');

// Add summary UI in Revenue
code = code.replace(/<FiltersBar[^>]+>/, `$&
      <div className="bg-primary/5 border border-primary/20 text-primary-foreground/80 p-3 rounded-lg text-sm mb-4">
        <strong>Smart Summary:</strong> {summaryText}
      </div>`);

// Add Xero Button
code = code.replace(/<Button size="sm" variant="outline" onClick=\{exportPDF\}>/, `
          <Button size="sm" variant="outline" onClick={exportXero}>
            <Download className="w-3.5 h-3.5 mr-1" /> Xero CSV
          </Button>
          <Button size="sm" variant="outline" onClick={exportPDF}>`);


// Column Toggles in Events
const evToggles = `
  const allCols = ["tickets_sold", "capacity", "fill_rate", "gross"];
  const [cols, setCols] = useState<string[]>(allCols);
  const toggleCol = (c: string) => setCols(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
`;
code = code.replace(/const \[rows,\s*setRows\]\s*=\s*useState<EventPerfRow\[\]>\(\[\]\);/, `const [rows,    setRows]    = useState<EventPerfRow[]>([]);` + evToggles);

code = code.replace(/const exportPDF = \(\) => \{/, `
  const summaryText = \`Between \${from} and \${to}, \${rows.length} events were hosted. The average fill rate was \${(rows.reduce((a,r) => a + r.fill_rate, 0) / (rows.length || 1)).toFixed(1)}%.\`;
  const exportPDF = () => {
`);
code = code.replace(/doc\.text\(\`Event Performance — \$\{from\} to \$\{to\}\`, 14, 18\);/, `
    doc.text(\`Event Performance — \${from} to \${to}\`, 14, 18);
    doc.setFontSize(10);
    const splitText = doc.splitTextToSize(summaryText, 180);
    doc.text(splitText, 14, 25);
`);
code = code.replace(/14 \+ j \* 33, 28 \+ i \* 7/, '14 + j * 33, 35 + splitText.length * 4 + i * 7');

code = code.replace(/<FiltersBar[^>]+>/, `$&
      <div className="bg-primary/5 border border-primary/20 text-primary-foreground/80 p-3 rounded-lg text-sm mb-4">
        <strong>Smart Summary:</strong> {summaryText}
      </div>`);

// Update table headers in Events
code = code.replace(/<th>Tickets<\/th>[\s\S]*?<th>Gross<\/th>/, `
                    {cols.includes("tickets_sold") && <th>Tickets</th>}
                    {cols.includes("capacity") && <th>Cap</th>}
                    {cols.includes("fill_rate") && <th>Fill %</th>}
                    {cols.includes("gross") && <th>Gross</th>}
`);

// Update table cells in Events
code = code.replace(/<td className="font-medium">\{r\.tickets_sold\}<\/td>[\s\S]*?<td className="text-right font-medium">\{formatCurrency\(String\(r\.gross\)\)\}<\/td>/, `
                    {cols.includes("tickets_sold") && <td className="font-medium">{r.tickets_sold}</td>}
                    {cols.includes("capacity") && <td className="text-muted">{r.capacity}</td>}
                    {cols.includes("fill_rate") && <td><span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold", r.fill_rate >= 80 ? "bg-success/20 text-success" : r.fill_rate < 30 ? "bg-error/20 text-error" : "bg-warning/20 text-warning")}>{r.fill_rate}%</span></td>}
                    {cols.includes("gross") && <td className="text-right font-medium">{formatCurrency(String(r.gross))}</td>}
`);

// Add Columns button
code = code.replace(/<Button size="sm" variant="outline" onClick=\{exportCSV\}>/, `
          <div className="relative group z-20">
            <Button size="sm" variant="outline" className="gap-2"><Settings2 className="w-3.5 h-3.5"/> Columns <ChevronDown className="w-3 h-3"/></Button>
            <div className="absolute right-0 mt-1 w-32 bg-surface border border-border rounded-md shadow-xl p-2 hidden group-hover:block">
              {allCols.map(c => (
                <label key={c} className="flex items-center gap-2 text-xs py-1 cursor-pointer hover:bg-surface-2 px-1 rounded">
                  <input type="checkbox" checked={cols.includes(c)} onChange={() => toggleCol(c)} /> {c}
                </label>
              ))}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={exportCSV}>
`);


// Liabilities Component
const liabilitiesComp = `
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
    const res = await api.get<LiabilityData>(\`/admin/reports/liabilities/?from=\${from}&to=\${to}&group=\${groupBy}\`);
    if (res.success && res.data) {
      setData(res.data);
    } else {
      toast.error("Failed to load liabilities");
    }
    setLoading(false);
  }, [from, to, groupBy]);

  const summaryText = data ? \`Currently carrying \${formatCurrency(String(data.totals.pending))} in unpaid liabilities. Disbursed \${formatCurrency(String(data.totals.disbursed))} in the selected period.\` : "";

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
          <div className="bg-primary/5 border border-primary/20 text-primary-foreground/80 p-3 rounded-lg text-sm mb-4">
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
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="period" tick={{ fill:"hsl(var(--muted-foreground))", fontSize:11 }} tickLine={false} tickFormatter={xAxisFormatter} />
                <YAxis tick={{ fill:"hsl(var(--muted-foreground))", fontSize:11 }} tickLine={false} axisLine={false} tickFormatter={yAxisFormatter} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v:number) => [\`KES \${v.toLocaleString()}\`, "Disbursed"]} />
                <Area type="monotone" dataKey="amount" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
`;
code = code.replace(/export default function AdminReportsPage\(\) \{/, liabilitiesComp + '\nexport default function AdminReportsPage() {');

// Update Main Page
code = code.replace(/const \[tab, setTab\] = useState<ReportType>\("revenue"\);/, `
  const [tab, setTab] = useState<ReportType | "liabilities">("revenue");
  const [subOpen, setSubOpen] = useState(false);
`);

code = code.replace(/<div className="flex items-start justify-between gap-4 mb-6">/, `
      <SubscribeModal open={subOpen} setOpen={setSubOpen} />
      <div className="flex items-start justify-between gap-4 mb-6">`);

code = code.replace(/<div>\s*<h1 className="font-display text-2xl font-bold">Reports & Exports<\/h1>/, `
        <div>
          <h1 className="font-display text-2xl font-bold">Reports & Exports</h1>`);

code = code.replace(/<\/div>\s*<\/div>\s*\{\/\* Tabs \*\/\}/, `
        </div>
        <Button size="sm" onClick={() => setSubOpen(true)} className="gap-2">
          <Mail className="w-4 h-4" /> Subscribe
        </Button>
      </div>

      {/* Tabs */}`);

code = code.replace(/<button onClick=\{[^}]+\} className=\{cn\("pb-2 border-b-2 text-sm font-medium transition-colors", tab === "events".*?<\/button>/s, `
          $&
          <button onClick={() => setTab("liabilities")} className={cn("pb-2 border-b-2 text-sm font-medium transition-colors", tab === "liabilities" ? "border-primary text-foreground" : "border-transparent text-muted hover:text-foreground hover:border-border")}>
            Liabilities
          </button>
`);

code = code.replace(/\{tab === "events" && <EventPerformanceReport \/>\}/, `
        $&
        {tab === "liabilities" && <LiabilitiesReport />}
`);


fs.writeFileSync('frontend/app/admin/reports/page.tsx', code);
