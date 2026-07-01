"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuthStore } from "@/store/auth";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Smartphone, Building2, CheckCircle2, Clock, AlertTriangle, ShieldCheck } from "lucide-react";

export default function PayoutSettingsPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [method, setMethod] = useState<"mpesa" | "bank">("mpesa");
  const [profile, setProfile] = useState<any>(null);
  const [banks, setBanks] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);

  // Form State
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNum, setBankAccountNum] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankBranchCode, setBankBranchCode] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [profRes, histRes, banksRes] = await Promise.all([
        api.get("/payments/organizer/payout-profile/"),
        api.get("/payments/organizer/payouts/"),
        api.get("/payments/organizer/payout-profile/banks/").catch(() => ({ data: [] }))
      ]);

      if (profRes.success) {
        const p = profRes.data as any;
        setProfile(p);
        setMethod(p.payout_method || "mpesa");
        setMpesaPhone(p.mpesa_phone || "");
        setBankName(p.bank_name || "");
        setBankAccountNum(p.bank_account_number || "");
        setBankAccountName(p.bank_account_name || "");
        setBankBranchCode(p.bank_branch_code || "");
      }
      if (histRes.success) setHistory(histRes.data as any[]);
      if ((banksRes as any).success || banksRes.data) setBanks((banksRes.data || banksRes) as any[]);
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      payout_method: method,
      ...(method === "mpesa" ? { mpesa_phone: mpesaPhone } : {
        bank_name: bankName,
        bank_account_number: bankAccountNum,
        bank_account_name: bankAccountName,
        bank_branch_code: bankBranchCode,
      })
    };

    const res = await api.put("/payments/organizer/payout-profile/", payload);
    if (res.success) {
      toast.success("Payout settings saved successfully");
      setProfile(res.data);
    } else {
      toast.error(res.error || "Failed to save settings");
    }
    setSaving(false);
  };

  if (loading) return <div className="p-8 text-center text-muted animate-pulse">Loading settings...</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8 space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Payout Settings</h1>
        <p className="text-muted text-sm mt-1">Manage how you receive your ticket sales revenue.</p>
      </div>

      <div className="glass border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Receiving Account
          </h2>
          {profile?.payout_status === 'active' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" /> Active
            </span>
          )}
          {profile?.payout_status === 'pending_verification' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Clock className="w-3.5 h-3.5" /> Pending Verification
            </span>
          )}
          {profile?.payout_status === 'suspended' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20">
              <AlertTriangle className="w-3.5 h-3.5" /> Suspended
            </span>
          )}
        </div>

        {/* Method Toggle */}
        <div className="flex gap-2 p-1 bg-surface-2 rounded-lg mb-6 w-full max-w-sm">
          <button
            onClick={() => setMethod("mpesa")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${
              method === "mpesa" ? "bg-surface shadow-sm text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            <Smartphone className="w-4 h-4" /> M-Pesa
          </button>
          <button
            onClick={() => setMethod("bank")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${
              method === "bank" ? "bg-surface shadow-sm text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            <Building2 className="w-4 h-4" /> Bank Transfer
          </button>
        </div>

        <div className="space-y-4 max-w-md">
          {method === "mpesa" ? (
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">M-Pesa Phone Number</label>
              <input
                type="text"
                value={mpesaPhone}
                onChange={e => setMpesaPhone(e.target.value)}
                placeholder="2547XXXXXXXX"
                className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-xs text-muted mt-1.5">Format: 2547XXXXXXXX (Include country code, no + prefix)</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">Bank</label>
                <select
                  value={bankBranchCode}
                  onChange={e => {
                    setBankBranchCode(e.target.value);
                    const b = banks.find(x => x.code === e.target.value);
                    if (b) setBankName(b.name);
                  }}
                  className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select Bank</option>
                  {banks?.map(b => (
                    <option key={b.id || b.code} value={b.code}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">Account Number</label>
                <input
                  type="text"
                  value={bankAccountNum}
                  onChange={e => setBankAccountNum(e.target.value)}
                  placeholder="Enter account number"
                  className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">Account Name</label>
                <input
                  type="text"
                  value={bankAccountName}
                  onChange={e => setBankAccountName(e.target.value)}
                  placeholder="E.g. John Doe"
                  className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </>
          )}

          <div className="pt-4">
            <Button onClick={handleSave} loading={saving}>Save Settings</Button>
          </div>
          <p className="text-xs text-muted mt-4">
            🔒 Your banking details are encrypted and never shared. Payouts are sent within 24 hours of ticket sales confirmation.
          </p>
        </div>
      </div>

      <div className="glass border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-6">Payout History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted text-center py-8">No payouts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted uppercase bg-surface-2/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Amount (KES)</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} className="border-b border-border hover:bg-surface-2/20">
                    <td className="px-4 py-3">{new Date(item.disbursed_at || new Date()).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-medium">{item.event_name || 'Ticket Sales'}</td>
                    <td className="px-4 py-3 uppercase text-xs">{item.method}</td>
                    <td className="px-4 py-3 font-mono">{Number(item.amount).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${
                        item.status === 'completed' ? 'bg-green-500/10 text-green-500' :
                        item.status === 'processing' ? 'bg-blue-500/10 text-blue-500' :
                        item.status === 'failed' || item.status === 'permanently_failed' ? 'bg-red-500/10 text-red-500' :
                        'bg-amber-500/10 text-amber-500'
                      }`}>
                        {item.status.replace('_', ' ')}
                      </span>
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
