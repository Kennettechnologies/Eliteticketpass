"use client";

import { useState, useEffect, useCallback, ElementType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings2, Percent, CreditCard, Mail, Smartphone,
  Tag, FileText, AlertTriangle, Save, Plus, Trash2,
  Eye, EyeOff, RefreshCw, ToggleLeft, ToggleRight,
  Home,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlatformFeeConfig {
  default_flat_fee: number; default_pct_fee: number;
  fee_absorbed_by: "BUYER" | "ORGANIZER"; refund_window_days: number;
}

interface FeeTextConfig {
  platform_fee: string;
  payment_processing_mpesa: string;
  payment_processing_card: string;
  bank_transfer_fee: string;
  free_events_fee: string;
  payout_schedule: string;
}

interface GatewayConfig {
  daraja_consumer_key: string; daraja_consumer_secret: string;
  daraja_shortcode: string; daraja_passkey: string;
  daraja_env: "sandbox" | "production";
  stripe_secret_key: string; stripe_publishable_key: string;
  stripe_webhook_secret: string;
  paystack_secret_key: string;
  paystack_public_key: string;
}

interface ProviderConfig {
  resend_api_key: string; resend_from_email: string;
  africastalking_username: string; africastalking_api_key: string;
  twilio_account_sid: string; twilio_auth_token: string; twilio_whatsapp_from: string;
}

interface Category { id: string; name: string; slug: string; color?: string; color_hex?: string; icon?: string; }

interface PolicyConfig { terms_of_service: string; refund_policy: string; privacy_policy: string; }

interface MaintenanceConfig { enabled: boolean; message: string; }

// ── Helper: masked secret input ───────────────────────────────────────────────

function SecretInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-xs font-medium text-muted mb-1.5">{label}</label>
      <div className="relative">
        <input type={show ? "text" : "password"} value={value} onChange={e => onChange(e.target.value)}
          className="w-full bg-surface border border-border rounded-sm px-3 pr-9 h-9 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
        <button type="button" onClick={() => setShow(s => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted mb-1.5">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-surface border border-border rounded-sm px-3 h-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
    </div>
  );
}

// ── Section: Platform Fees ────────────────────────────────────────────────────

function FeesSection() {
  const [cfg,     setCfg]     = useState<PlatformFeeConfig | null>(null);
  const [textCfg, setTextCfg] = useState<FeeTextConfig | null>(null);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<any>("/admin/config/"),
      api.get<any>("/admin/fee-settings/")
    ]).then(([r1, r2]) => {
      if (r1.success && r1.data) {
        setCfg({
          ...r1.data,
          default_flat_fee: Number(r1.data.default_flat_fee || 0),
          default_pct_fee: Number(r1.data.default_pct_fee || 0),
          refund_window_days: Number(r1.data.refund_window_days || 0)
        });
      }
      if (r2.success && r2.data) {
        setTextCfg(r2.data);
      }
    });
  }, []);

  const save = async () => {
    if (!cfg || !textCfg) return;
    setSaving(true);
    const [res1, res2] = await Promise.all([
      api.patch("/admin/config/", cfg),
      api.patch("/admin/fee-settings/", textCfg)
    ]);
    if (res1.success && res2.success) toast.success("Fee settings saved"); 
    else toast.error("Failed to save settings");
    setSaving(false);
  };

  if (!cfg) return <div className="h-40 bg-surface-2 border border-border rounded-xl animate-pulse" />;

  const preview = {
    buyerPays:    cfg.fee_absorbed_by === "BUYER" ? 1000 + cfg.default_flat_fee + 1000 * cfg.default_pct_fee / 100 : 1000,
    orgReceives:  cfg.fee_absorbed_by === "ORGANIZER" ? 1000 - cfg.default_flat_fee - 1000 * cfg.default_pct_fee / 100 : 1000,
  };

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Flat fee per ticket (KES)</label>
          <input type="number" value={cfg.default_flat_fee} min={0}
            onChange={e => setCfg({ ...cfg, default_flat_fee: Number(e.target.value) })}
            className="w-full bg-surface border border-border rounded-sm px-3 h-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Percentage (%)</label>
          <input type="number" value={cfg.default_pct_fee} min={0} max={100}
            onChange={e => setCfg({ ...cfg, default_pct_fee: Number(e.target.value) })}
            className="w-full bg-surface border border-border rounded-sm px-3 h-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Refund window (days)</label>
          <input type="number" value={cfg.refund_window_days} min={0}
            onChange={e => setCfg({ ...cfg, refund_window_days: Number(e.target.value) })}
            className="w-full bg-surface border border-border rounded-sm px-3 h-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-muted mb-2">Fee absorbed by</p>
        <div className="flex gap-3">
          {(["BUYER","ORGANIZER"] as const).map(opt => (
            <label key={opt} className="cursor-pointer flex items-center gap-2">
              <div onClick={() => setCfg({ ...cfg, fee_absorbed_by: opt })}
                className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors",
                  cfg.fee_absorbed_by === opt ? "border-primary" : "border-border")}>
                {cfg.fee_absorbed_by === opt && <div className="w-2 h-2 rounded-full bg-primary" />}
              </div>
              <span className="text-sm">{opt === "BUYER" ? "Buyer pays fee" : "Organizer absorbs"}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-lg p-3 text-sm grid grid-cols-2 gap-3">
        <div><p className="text-xs text-muted">Buyer pays (KES 1,000 ticket)</p><p className="font-bold">KES {preview.buyerPays.toLocaleString()}</p></div>
        <div><p className="text-xs text-muted">Organizer receives</p><p className="font-bold text-success">KES {preview.orgReceives.toLocaleString()}</p></div>
      </div>

      <hr className="border-border my-6" />

      <div>
        <h3 className="font-semibold text-sm mb-4">Fee Agreement Text (Shown to Organizers)</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <TextInput label="Platform fee" value={textCfg?.platform_fee || ""} onChange={v => setTextCfg(c => c ? {...c, platform_fee: v} : c)} />
          <TextInput label="Payment processing (M-Pesa)" value={textCfg?.payment_processing_mpesa || ""} onChange={v => setTextCfg(c => c ? {...c, payment_processing_mpesa: v} : c)} />
          <TextInput label="Payment processing (Card)" value={textCfg?.payment_processing_card || ""} onChange={v => setTextCfg(c => c ? {...c, payment_processing_card: v} : c)} />
          <TextInput label="Bank Transfer" value={textCfg?.bank_transfer_fee || ""} onChange={v => setTextCfg(c => c ? {...c, bank_transfer_fee: v} : c)} />
          <TextInput label="Free events" value={textCfg?.free_events_fee || ""} onChange={v => setTextCfg(c => c ? {...c, free_events_fee: v} : c)} />
          <TextInput label="Payout schedule" value={textCfg?.payout_schedule || ""} onChange={v => setTextCfg(c => c ? {...c, payout_schedule: v} : c)} />
        </div>
      </div>

      <Button loading={saving} onClick={save}><Save className="w-4 h-4" /> Save Fee Settings</Button>
    </div>
  );
}

// ── Section: Payment Gateways ────────────────────────────────────────────────

function GatewaysSection() {
  const [cfg, setCfg] = useState<GatewayConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const upd = (k: keyof GatewayConfig, v: string) => setCfg(c => c ? { ...c, [k]: v } : c);

  useEffect(() => {
    api.get<GatewayConfig>("/admin/config/").then(r => { if (r.success && r.data) setCfg(r.data); });
  }, []);

  const save = async () => {
    if (!cfg) return; setSaving(true);
    const res = await api.patch("/admin/config/", cfg);
    if (res.success) toast.success("Gateway settings saved"); else toast.error(res.error || "Failed");
    setSaving(false);
  };

  if (!cfg) return <div className="h-60 bg-surface-2 border border-border rounded-xl animate-pulse" />;

  return (
    <div className="space-y-6">
      <div className="bg-surface-2 border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">M-Pesa Daraja</h3>
          <div className="flex gap-2">
            {(["sandbox","production"] as const).map(env => (
              <button key={env} onClick={() => upd("daraja_env", env)}
                className={cn("px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                  cfg.daraja_env === env ? "bg-primary text-background border-primary" : "border-border text-muted")}>
                {env}
              </button>
            ))}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <SecretInput label="Consumer Key"    value={cfg.daraja_consumer_key}    onChange={v => upd("daraja_consumer_key", v)} />
          <SecretInput label="Consumer Secret" value={cfg.daraja_consumer_secret} onChange={v => upd("daraja_consumer_secret", v)} />
          <TextInput   label="Shortcode"       value={cfg.daraja_shortcode}       onChange={v => upd("daraja_shortcode", v)} />
          <SecretInput label="Passkey"         value={cfg.daraja_passkey}         onChange={v => upd("daraja_passkey", v)} />
        </div>
      </div>

      <div className="bg-surface-2 border border-border rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-sm">Stripe</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <SecretInput label="Secret Key"       value={cfg.stripe_secret_key}       onChange={v => upd("stripe_secret_key", v)} />
          <TextInput   label="Publishable Key"  value={cfg.stripe_publishable_key}  onChange={v => upd("stripe_publishable_key", v)} />
          <SecretInput label="Webhook Secret"   value={cfg.stripe_webhook_secret}   onChange={v => upd("stripe_webhook_secret", v)} />
        </div>
      </div>

      <div className="bg-surface-2 border border-border rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-sm">Paystack</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <SecretInput label="Secret Key"       value={cfg.paystack_secret_key}       onChange={v => upd("paystack_secret_key", v)} />
          <TextInput   label="Public Key"       value={cfg.paystack_public_key}       onChange={v => upd("paystack_public_key", v)} />
        </div>
      </div>

      <Button loading={saving} onClick={save}><Save className="w-4 h-4" /> Save Gateway Settings</Button>
    </div>
  );
}

// ── Section: Providers ────────────────────────────────────────────────────────

function ProvidersSection() {
  const [cfg, setCfg] = useState<ProviderConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const upd = (k: keyof ProviderConfig, v: string) => setCfg(c => c ? { ...c, [k]: v } : c);

  useEffect(() => {
    api.get<ProviderConfig>("/admin/config/").then(r => { if (r.success && r.data) setCfg(r.data); });
  }, []);

  const save = async () => {
    if (!cfg) return; setSaving(true);
    const res = await api.patch("/admin/config/", cfg);
    if (res.success) toast.success("Provider settings saved"); else toast.error(res.error || "Failed");
    setSaving(false);
  };

  if (!cfg) return <div className="h-60 bg-surface-2 border border-border rounded-xl animate-pulse" />;

  return (
    <div className="space-y-6">
      {[
        { title: "Resend (Email)", fields: [
          { label: "API Key",    key: "resend_api_key"    as keyof ProviderConfig, secret: true  },
          { label: "From Email", key: "resend_from_email" as keyof ProviderConfig, secret: false },
        ]},
        { title: "Africa's Talking (SMS)", fields: [
          { label: "Username", key: "africastalking_username" as keyof ProviderConfig, secret: false },
          { label: "API Key",  key: "africastalking_api_key"  as keyof ProviderConfig, secret: true  },
        ]},
        { title: "Twilio (WhatsApp / SMS)", fields: [
          { label: "Account SID",     key: "twilio_account_sid"     as keyof ProviderConfig, secret: false },
          { label: "Auth Token",      key: "twilio_auth_token"      as keyof ProviderConfig, secret: true  },
          { label: "WhatsApp From",   key: "twilio_whatsapp_from"   as keyof ProviderConfig, secret: false },
        ]},
      ].map(({ title, fields }) => (
        <div key={title} className="bg-surface-2 border border-border rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-sm">{title}</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {fields.map(f => f.secret
              ? <SecretInput key={f.key} label={f.label} value={String(cfg[f.key])} onChange={v => upd(f.key, v)} />
              : <TextInput   key={f.key} label={f.label} value={String(cfg[f.key])} onChange={v => upd(f.key, v)} />
            )}
          </div>
        </div>
      ))}
      <Button loading={saving} onClick={save}><Save className="w-4 h-4" /> Save Provider Settings</Button>
    </div>
  );
}

// ── Section: Categories ──────────────────────────────────────────────────────

const PRESET_COLORS = ["#6366f1","#22c55e","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#ec4899"];

function CategoriesSection() {
  const [cats,    setCats]    = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newColor,setNewColor]= useState(PRESET_COLORS[0]);
  const [adding,  setAdding]  = useState(false);
  const [deleting,setDeleting]= useState<string | null>(null);

  useEffect(() => {
    api.get<Category[]>("/admin/categories/").then(r => { if (r.success && r.data) setCats(r.data); setLoading(false); });
  }, []);

  const addCat = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    const res = await api.post<Category>("/admin/categories/", { name: newName.trim(), color: newColor });
    if (res.success && res.data) { setCats(c => [...c, res.data!]); setNewName(""); toast.success("Category added"); }
    else toast.error(res.error || "Failed");
    setAdding(false);
  };

  const deleteCat = async (id: string) => {
    setDeleting(id);
    const res = await api.delete(`/admin/categories/${id}/`);
    if (res.success) { setCats(c => c.filter(x => x.id !== id)); toast.success("Category removed"); }
    else toast.error(res.error || "Failed to delete");
    setDeleting(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-end flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-muted mb-1.5">Category name</label>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Music"
            onKeyDown={e => e.key === "Enter" && addCat()}
            className="w-full bg-surface border border-border rounded-sm px-3 h-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Color</label>
          <div className="flex gap-1.5 flex-wrap">
            {PRESET_COLORS.map(c => (
              <button key={c} onClick={() => setNewColor(c)}
                className={cn("w-7 h-7 rounded-full border-2 transition-all", newColor === c ? "border-white scale-110" : "border-transparent")}
                style={{ background: c }} />
            ))}
          </div>
        </div>
        <Button size="sm" loading={adding} onClick={addCat} disabled={!newName.trim()}>
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({length:4}).map((_,i)=><div key={i} className="h-10 bg-surface-2 border border-border rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="space-y-2">
          {cats.map(cat => (
            <div key={cat.id} className="flex items-center justify-between p-3 bg-surface-2 border border-border rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full shrink-0" style={{ background: cat.color || cat.color_hex }} />
                <div>
                  <p className="text-sm font-medium">{cat.name}</p>
                  <p className="text-xs text-muted">{cat.slug}</p>
                </div>
              </div>
              <button onClick={() => deleteCat(cat.id)} disabled={deleting === cat.id}
                className="p-1.5 text-error hover:bg-error/10 rounded-sm transition-colors">
                {deleting === cat.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Section: Policies ────────────────────────────────────────────────────────

function PoliciesSection() {
  const [cfg,    setCfg]    = useState<PolicyConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab,    setTab]    = useState<keyof PolicyConfig>("terms_of_service");

  useEffect(() => {
    api.get<PolicyConfig>("/admin/config/").then(r => { if (r.success && r.data) setCfg(r.data); });
  }, []);

  const save = async () => {
    if (!cfg) return; setSaving(true);
    const res = await api.patch("/admin/config/", cfg);
    if (res.success) toast.success("Policy saved"); else toast.error(res.error || "Failed");
    setSaving(false);
  };

  if (!cfg) return <div className="h-60 bg-surface-2 border border-border rounded-xl animate-pulse" />;

  const TABS: { key: keyof PolicyConfig; label: string }[] = [
    { key: "terms_of_service", label: "Terms of Service" },
    { key: "refund_policy",    label: "Refund Policy"    },
    { key: "privacy_policy",   label: "Privacy Policy"   },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 bg-surface-2 border border-border rounded-lg w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              tab === t.key ? "bg-primary text-background" : "text-muted hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>
      <textarea value={cfg[tab]} onChange={e => setCfg({ ...cfg, [tab]: e.target.value })} rows={18}
        className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
      <Button loading={saving} onClick={save}><Save className="w-4 h-4" /> Save {TABS.find(t=>t.key===tab)?.label}</Button>
    </div>
  );
}

// ── Section: Maintenance ─────────────────────────────────────────────────────

function MaintenanceSection() {
  const [cfg,    setCfg]    = useState<MaintenanceConfig>({ enabled: false, message: "" });
  const [loading,setLoading]= useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<any>("/admin/config/").then(r => {
      if (r.success && r.data) {
        setCfg({
          ...r.data,
          enabled: String(r.data.enabled).toLowerCase() === 'true'
        });
      }
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    const res = await api.patch("/admin/config/", cfg);
    if (res.success) toast.success(cfg.enabled ? "Maintenance mode ENABLED" : "Maintenance mode disabled");
    else toast.error(res.error || "Failed");
    setSaving(false);
  };

  if (loading) return <div className="h-40 bg-surface-2 border border-border rounded-xl animate-pulse" />;

  return (
    <div className="space-y-5">
      <div className={cn("p-4 rounded-xl border", cfg.enabled ? "bg-error/5 border-error/30" : "bg-surface-2 border-border")}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="font-semibold">Maintenance Mode</p>
            <p className="text-xs text-muted mt-0.5">
              {cfg.enabled ? "⚠️ Platform is currently offline to users" : "Platform is live and accessible"}
            </p>
          </div>
          <button onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))}
            className="transition-colors">
            {cfg.enabled
              ? <ToggleRight className="w-10 h-10 text-error" />
              : <ToggleLeft  className="w-10 h-10 text-muted" />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">
          Maintenance message (shown to users)
        </label>
        <textarea value={cfg.message} onChange={e => setCfg({ ...cfg, message: e.target.value })}
          rows={4} placeholder="We'll be back shortly. Scheduled maintenance in progress."
          className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
      </div>

      <Button loading={saving} onClick={save}
        className={cn(cfg.enabled && "bg-error hover:bg-error/90")}>
        <Save className="w-4 h-4" /> {cfg.enabled ? "Apply Maintenance Mode" : "Save Settings"}
      </Button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type ConfigTab = "fees" | "gateways" | "providers" | "categories" | "policies" | "maintenance";

const CONFIG_TABS: { key: ConfigTab; label: string; icon: ElementType }[] = [
  { key: "fees",        label: "Platform Fees",    icon: Percent     },
  { key: "gateways",    label: "Payment Gateways", icon: CreditCard  },
  { key: "providers",   label: "Email / SMS",      icon: Mail        },
  { key: "categories",  label: "Categories",       icon: Tag         },
  { key: "policies",    label: "Policies & ToS",   icon: FileText    },
  { key: "maintenance", label: "Maintenance",      icon: AlertTriangle },
];

export default function AdminConfigPage() {
  const [tab, setTab] = useState<ConfigTab>("fees");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Platform Configuration</h1>
        <p className="text-muted text-sm">Global settings, integrations, and platform management</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {CONFIG_TABS.map(({ key, label, icon: Icon }) => (
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
        {tab === "fees"        && <FeesSection      />}
        {tab === "gateways"    && <GatewaysSection  />}
        {tab === "providers"   && <ProvidersSection />}
        {tab === "categories"  && <CategoriesSection/>}
        {tab === "policies"    && <PoliciesSection  />}
        {tab === "maintenance" && <MaintenanceSection />}
      </div>
    </div>
  );
}
