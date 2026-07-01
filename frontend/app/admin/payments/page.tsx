"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RefreshCcw, DollarSign, Activity, AlertCircle } from "lucide-react";

export default function AdminPaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [revenue, setRevenue] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [payoutRes, revRes] = await Promise.all([
        api.get("/payments/admin/payouts/"),
        api.get("/payments/admin/revenue/")
      ]);

      if (payoutRes.success) setPayouts(payoutRes.data as any[]);
      if (revRes.success) setRevenue((revRes.data as any).total_revenue || 0);
    } catch (error) {
      toast.error("Failed to load payment data");
    }
    setLoading(false);
  };

  const handleRetry = async (id: string) => {
    const res = await api.post(`/payments/admin/payouts/${id}/retry/`, {});
    if (res.success) {
      toast.success("Retry queued successfully");
      fetchData();
    } else {
      toast.error(res.error || "Failed to queue retry");
    }
  };

  if (loading) return <div className="p-8 text-center text-muted animate-pulse">Loading payment oversight...</div>;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Payments Oversight</h1>
        <p className="text-muted text-sm mt-1">Monitor platform revenue and organizer payouts.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
              <DollarSign className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-medium text-muted">Total Platform Revenue</h3>
          </div>
          <p className="text-3xl font-display font-bold">KES {Number(revenue).toLocaleString()}</p>
        </div>

        <div className="glass border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
              <Activity className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-medium text-muted">Total Payouts</h3>
          </div>
          <p className="text-3xl font-display font-bold">{payouts.length}</p>
        </div>

        <div className="glass border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-medium text-muted">Failed Payouts</h3>
          </div>
          <p className="text-3xl font-display font-bold">
            {payouts.filter(p => p.status === 'permanently_failed' || p.status === 'failed').length}
          </p>
        </div>
      </div>

      <div className="glass border border-border rounded-xl overflow-hidden">
        <div className="p-5 border-b border-border flex justify-between items-center bg-surface-2/30">
          <h2 className="text-lg font-semibold">Organizer Payouts</h2>
          <Button variant="outline" size="sm" onClick={fetchData}><RefreshCcw className="w-4 h-4 mr-2"/> Refresh</Button>
        </div>
        
        {payouts.length === 0 ? (
          <p className="text-sm text-muted text-center py-8">No payouts tracked yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted uppercase bg-surface-2/50 border-b border-border">
                <tr>
                  <th className="px-5 py-4">ID</th>
                  <th className="px-5 py-4">Organizer</th>
                  <th className="px-5 py-4">Amount (KES)</th>
                  <th className="px-5 py-4">Method</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Retries</th>
                  <th className="px-5 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payouts.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-2/20">
                    <td className="px-5 py-4 font-mono text-xs">{item.id.split('-')[0]}</td>
                    <td className="px-5 py-4 font-medium">{item.organizer}</td>
                    <td className="px-5 py-4 font-mono">{Number(item.amount).toLocaleString()}</td>
                    <td className="px-5 py-4 uppercase text-xs">{item.method}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-1 rounded text-xs ${
                        item.status === 'completed' ? 'bg-green-500/10 text-green-500 border border-green-500/20' :
                        item.status === 'processing' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                        item.status === 'permanently_failed' ? 'bg-red-500/10 text-red-500 border border-red-500/20 font-bold' :
                        item.status === 'failed' ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' :
                        'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                      }`}>
                        {item.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-4">{item.retries}</td>
                    <td className="px-5 py-4">
                      {item.status === 'permanently_failed' && (
                        <Button size="sm" variant="danger" onClick={() => handleRetry(item.id)}>
                          Retry Now
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
