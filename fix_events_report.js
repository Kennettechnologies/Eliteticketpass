const fs = require('fs');
let code = fs.readFileSync('frontend/app/admin/reports/page.tsx', 'utf8');

// Fix Revenue summary text double definition
code = code.replace(/const summaryText = \`Between \$\{from\} and \$\{to\}, the platform processed [^\`]+\`;[\s\S]*?const summaryText = \`Between \$\{from\} and \$\{to\}, \$\{rows\.length\}[^\`]+\`;/,
  'const summaryText = `Between ${from} and ${to}, the platform processed ${formatCurrency(String(totals.gross))} in Gross Revenue, collecting ${formatCurrency(String(totals.fees))} in fees across ${totals.orders} total orders.`;');

// Fix EventsReport completely
const eventsReportRegex = /\/\/ ── Events performance report ────────────────────────────────────────────────[\s\S]*?\}\n/g;
const newEventsReport = `// ── Events performance report ────────────────────────────────────────────────

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
    const res = await api.get<EventPerfRow[]>(\`/admin/reports/events/?\${qs}\`);
    if (res.success && res.data) setRows(res.data);
    else toast.error("Failed to load report");
    setLoading(false);
  }, [from, to, orgSearch]);

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortBy]; const bv = b[sortBy];
    return typeof av === "number" ? (bv as number) - av : String(bv).localeCompare(String(av));
  });

  const summaryText = \`Between \${from} and \${to}, \${rows.length} events were hosted. The average fill rate was \${(rows.reduce((a,r) => a + r.fill_rate, 0) / (rows.length || 1)).toFixed(1)}%.\`;
  
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); 
    doc.text(\`Event Performance — \${from} to \${to}\`, 14, 18);
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
        if (cols.includes("tickets_sold")) row.push(\`\${r.tickets_sold}\`);
        if (cols.includes("capacity")) row.push(\`\${r.capacity}\`);
        if (cols.includes("fill_rate")) row.push(\`\${r.fill_rate.toFixed(1)}%\`);
        if (cols.includes("gross")) row.push(\`\${r.gross.toFixed(0)}\`);
        return row;
    });

    [...[header],...data].forEach((row, i) =>
      row.forEach((cell, j) => doc.text(cell, 14 + j * 30, 35 + splitText.length * 4 + i * 7))
    );
    doc.save(\`events-performance-\${from}-\${to}.pdf\`);
  };

  const exportCSV = () => downloadCSV(
    \`events-performance-\${from}-\${to}.csv\`,
    ["Title","Organizer","Date","Tickets Sold","Capacity","Fill %","Gross (KES)"],
    sorted.map(r => [\`"\${r.title}"\`, \`"\${r.organizer}"\`, r.starts_at, r.tickets_sold, r.capacity, r.fill_rate.toFixed(1), r.gross.toFixed(2)])
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
          <div className="bg-primary/5 border border-primary/20 text-primary-foreground/80 p-3 rounded-lg text-sm mb-4">
            <strong>Smart Summary:</strong> {summaryText}
          </div>
          
          <div className="bg-surface-2 border border-border rounded-xl p-4">
            <p className="text-xs font-medium text-muted mb-3">Top 10 Events by Gross Revenue</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sorted.slice(0,10)} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fill:"hsl(var(--muted-foreground))", fontSize:10 }} tickLine={false}
                  tickFormatter={v => \`\${(v/1000).toFixed(0)}k\`} />
                <YAxis type="category" dataKey="title" width={120}
                  tick={{ fill:"hsl(var(--muted-foreground))", fontSize:10 }} tickLine={false}
                  tickFormatter={v => v.length > 18 ? v.slice(0,18)+"…" : v} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v:number)=>[\`KES \${v.toLocaleString()}\`,""]} />
                <Bar dataKey="gross" name="Gross" fill="hsl(var(--primary))" radius={[0,3,3,0]} />
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
              <div className="flex gap-2">
                  <div className="relative group z-20">
                    <Button size="sm" variant="outline" className="gap-2"><Settings2 className="w-3.5 h-3.5"/> Columns <ChevronDown className="w-3 h-3"/></Button>
                    <div className="absolute right-0 mt-1 w-32 bg-surface border border-border rounded-md shadow-xl p-2 hidden group-hover:block">
                      {allCols.map(c => (
                        <label key={c} className="flex items-center gap-2 text-xs py-1 cursor-pointer hover:bg-surface-2 px-1 rounded">
                          <input type="checkbox" checked={cols.includes(c)} onChange={() => toggleCol(c)} /> {c.replace('_', ' ')}
                        </label>
                      ))}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={exportCSV}><Download className="w-3.5 h-3.5 mr-1" />CSV</Button>
                  <Button size="sm" variant="outline" onClick={exportPDF}><Download className="w-3.5 h-3.5 mr-1" />PDF</Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs text-muted font-medium">Event</th>
                    <th className="text-left px-4 py-2.5 text-xs text-muted font-medium">Organizer</th>
                    <th className="text-left px-4 py-2.5 text-xs text-muted font-medium">Date</th>
                    {cols.includes("tickets_sold") && <th className="text-left px-4 py-2.5 text-xs text-muted font-medium">Sold</th>}
                    {cols.includes("capacity") && <th className="text-left px-4 py-2.5 text-xs text-muted font-medium">Cap</th>}
                    {cols.includes("fill_rate") && <th className="text-left px-4 py-2.5 text-xs text-muted font-medium">Fill</th>}
                    {cols.includes("gross") && <th className="text-left px-4 py-2.5 text-xs text-muted font-medium">Gross (KES)</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sorted.map(r => (
                    <tr key={r.event_id} className="hover:bg-surface/50">
                      <td className="px-4 py-2.5 font-medium max-w-[180px] truncate">{r.title}</td>
                      <td className="px-4 py-2.5 text-xs text-muted">{r.organizer}</td>
                      <td className="px-4 py-2.5 text-xs text-muted">{r.starts_at.slice(0,10)}</td>
                      {cols.includes("tickets_sold") && <td className="px-4 py-2.5">{r.tickets_sold.toLocaleString()}</td>}
                      {cols.includes("capacity") && <td className="px-4 py-2.5 text-muted">{r.capacity.toLocaleString()}</td>}
                      {cols.includes("fill_rate") && <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1.5 bg-surface rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width:\`\${r.fill_rate}%\` }} />
                          </div>
                          <span className="text-xs">{r.fill_rate.toFixed(0)}%</span>
                        </div>
                      </td>}
                      {cols.includes("gross") && <td className="px-4 py-2.5 font-bold">{r.gross.toLocaleString()}</td>}
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
`;
code = code.replace(eventsReportRegex, newEventsReport);
fs.writeFileSync('frontend/app/admin/reports/page.tsx', code);
