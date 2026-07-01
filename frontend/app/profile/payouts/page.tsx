"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Wallet, Smartphone, ShieldCheck } from "lucide-react";

export default function UserPayoutsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banks, setBanks] = useState<any[]>([]);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<any[]>("/payments/organizer/payout-profile/banks/"),
      api.get<{ bank_code: string, account_number: string }>("/auth/payout-profile/")
    ]).then(([banksRes, profileRes]) => {
      if (banksRes.success && Array.isArray(banksRes.data)) {
        setBanks(banksRes.data);
      } else {
        // Fallback for Kenya banks if API fails
        setBanks([
          { code: "01", name: "Kenya Commercial Bank" },
          { code: "02", name: "Standard Chartered Bank" },
          { code: "03", name: "Barclays Bank" },
          { code: "07", name: "Commercial Bank of Africa" },
          { code: "11", name: "Co-operative Bank" },
          { code: "12", name: "National Bank of Kenya" },
          { code: "63", name: "Diamond Trust Bank" },
          { code: "68", name: "Equity Bank" },
          { code: "70", name: "Family Bank" }
        ]);
      }
      
      if (profileRes.success && profileRes.data) {
        setBankCode(profileRes.data.bank_code || "");
        setAccountNumber(profileRes.data.account_number || "");
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    if (!bankCode || !accountNumber) {
      toast.error("Please enter both bank and account number");
      return;
    }
    
    setSaving(true);
    const res = await api.post<{ bank_code: string, account_number: string }>("/auth/payout-profile/", { 
      bank_code: bankCode, 
      account_number: accountNumber 
    });
    
    if (res.success) {
      toast.success("Payout profile updated successfully!");
      setBankCode(res.data?.bank_code || bankCode);
      setAccountNumber(res.data?.account_number || accountNumber);
    } else {
      toast.error((res as any).error || "Failed to update payout profile.");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-display text-2xl font-bold">Payout Settings</h1>
      <p className="text-muted text-sm">
        Configure how you want to receive your money when you sell a ticket on the Resale Marketplace.
      </p>

      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-40 bg-surface-2 rounded-xl" />
        </div>
      ) : (
        <div className="bg-surface-2 border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-primary/10 text-primary rounded-lg">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-lg">Bank Transfer Payouts</h2>
              <p className="text-sm text-muted">Receive your resale revenue directly to your bank account via Paystack.</p>
            </div>
          </div>
          
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium mb-1.5 flex items-center gap-2">
                Bank Name
              </label>
              <select 
                value={bankCode}
                onChange={e => setBankCode(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-4 h-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Select a Bank</option>
                {banks.map((b: any) => (
                  <option key={b.code} value={b.code}>{b.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 flex items-center gap-2">
                Account Number
              </label>
              <input 
                type="text" 
                value={accountNumber}
                onChange={e => setAccountNumber(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-4 h-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="1234567890"
              />
              <p className="text-xs text-muted mt-2">
                Funds will be sent automatically once your buyer's payment clears.
              </p>
            </div>
            
            <div className="pt-4 border-t border-border flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-success bg-success/10 px-3 py-1.5 rounded-full">
                <ShieldCheck className="w-3.5 h-3.5" /> Secured by Paystack
              </div>
              <Button onClick={handleSave} loading={saving}>
                Save Settings
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
