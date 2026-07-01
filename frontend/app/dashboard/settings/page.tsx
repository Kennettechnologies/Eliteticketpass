"use client";

import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import {
  Building2, Camera, Upload, Landmark, Phone, Shield,
  CheckCircle2, AlertCircle, ChevronRight, Eye, ExternalLink,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const INPUT = "w-full bg-surface border border-border rounded-sm px-4 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted";
const TEXTAREA = "w-full bg-surface border border-border rounded-sm px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted resize-none";

const TABS = [
  { key: "profile",   label: "Profile",       icon: Building2 },
  { key: "kyc",       label: "KYC",           icon: Shield },
  { key: "payout",    label: "Payout",        icon: Landmark },
  { key: "fees",      label: "Fee Agreement", icon: CheckCircle2 },
] as const;
type Tab = typeof TABS[number]["key"];

// ── Schemas ──────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  display_name: z.string().min(2, "Name required"),
  business_type: z.enum(["individual", "company", "ngo"]),
  bio:         z.string().optional(),
  website_url: z.string().url("Invalid URL").optional().or(z.literal("")),
  contact_phone: z.string().optional(),
  contact_email: z.string().email("Invalid email").optional().or(z.literal("")),
  contact_address: z.string().optional(),
  instagram_url: z.string().optional(),
  twitter_url:   z.string().optional(),
  facebook_url:  z.string().optional(),
  youtube_url:   z.string().optional(),
});
type ProfileForm = z.infer<typeof profileSchema>;

const payoutSchema = z.object({
  payout_method:       z.enum(["BANK_TRANSFER", "MPESA"]),
  bank_name:           z.string().optional(),
  bank_account_number: z.string().optional(),
  bank_branch:         z.string().optional(),
  mpesa_phone:         z.string().optional(),
  bank_account_name:   z.string().optional(),
});
type PayoutForm = z.infer<typeof payoutSchema>;

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    APPROVED:  { label: "Verified",  cls: "bg-success/10 text-success" },
    PENDING_REVIEW: { label: "Pending Review", cls: "bg-warning/10 text-warning" },
    REJECTED:  { label: "Rejected",  cls: "bg-error/10 text-error" },
    NOT_SUBMITTED: { label: "Not submitted", cls: "bg-surface text-muted" },
  };
  const s = map[status] || map.NOT_SUBMITTED;
  return <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium", s.cls)}>{s.label}</span>;
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab() {
  const logoRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting, isDirty } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { business_type: "individual" },
  });
  const businessType = watch("business_type");

  useEffect(() => {
    api.get<any>("/organizer/profile/").then(r => {
      if (r.success && r.data) {
        const d = { ...r.data };
        if (d.instagram_url) d.instagram_url = d.instagram_url.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
        if (d.twitter_url) d.twitter_url = d.twitter_url.replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//, '').replace(/\/$/, '');
        if (d.facebook_url) d.facebook_url = d.facebook_url.replace(/^https?:\/\/(www\.)?facebook\.com\//, '').replace(/\/$/, '');
        if (d.youtube_url) d.youtube_url = d.youtube_url.replace(/^https?:\/\/(www\.)?youtube\.com\/@?/, '').replace(/\/$/, '');
        reset(d);
        setLogoUrl(r.data.logo_url || null);
      }
    });
  }, [reset]);

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("logo", file);
    const res = await api.patch<any>("/organizer/profile/logo/", fd);
    if (res.success && res.data?.logo_url) { setLogoUrl(res.data.logo_url); toast.success("Logo updated!"); }
    else toast.error("Upload failed");
  };

  const onSave = async (data: ProfileForm) => {
    const payload = { ...data };
    if (payload.instagram_url && !payload.instagram_url.startsWith('http')) payload.instagram_url = `https://instagram.com/${payload.instagram_url}`;
    if (payload.twitter_url && !payload.twitter_url.startsWith('http')) payload.twitter_url = `https://x.com/${payload.twitter_url}`;
    if (payload.facebook_url && !payload.facebook_url.startsWith('http')) payload.facebook_url = `https://facebook.com/${payload.facebook_url}`;
    if (payload.youtube_url && !payload.youtube_url.startsWith('http')) payload.youtube_url = `https://youtube.com/@${payload.youtube_url}`;

    const res = await api.patch("/organizer/profile/", payload);
    if (res.success) toast.success("Profile saved!");
    else toast.error("Save failed");
  };

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      {/* Logo */}
      <section className="bg-surface-2 border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-4">Logo / Brand Image</h2>
        <div className="flex items-center gap-5">
          <div className="relative">
            <div className="w-32 h-32 rounded-xl bg-surface border border-border flex items-center justify-center overflow-hidden">
              {logoUrl ? <img src={logoUrl} alt="" className="w-32 h-32 object-cover" /> : <Building2 className="w-10 h-10 text-muted" />}
            </div>
            <button type="button" onClick={() => logoRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-background flex items-center justify-center hover:bg-primary/90 transition-colors">
              <Camera className="w-3.5 h-3.5" />
            </button>
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={onLogo} />
          </div>
          <div>
            <p className="text-sm font-medium">Organizer Logo</p>
            <p className="text-xs text-muted mt-0.5">PNG, JPG or WebP · Min 200×200px · Max 2MB</p>
          </div>
        </div>
      </section>

      {/* Basic info */}
      <section className="bg-surface-2 border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold">Basic Information</h2>

        <div>
          <label className="block text-sm font-medium mb-1.5">Account type</label>
          <div className="grid grid-cols-3 gap-2">
            {(["individual", "company", "ngo"] as const).map(t => (
              <label key={t} className="cursor-pointer">
                <input {...register("business_type")} type="radio" value={t} className="sr-only" />
                <div className={cn(
                  "p-3 rounded-lg border text-center text-sm font-medium transition-all",
                  businessType === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/50"
                )}>
                  {t === "individual" ? "👤 Individual" : t === "company" ? "🏢 Company" : "🤝 NGO"}
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Display name *</label>
          <input {...register("display_name")} className={INPUT} placeholder="Your name or organization name" />
          {errors.display_name && <p className="text-xs text-error mt-1">{errors.display_name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Bio / About</label>
          <textarea {...register("bio")} rows={3} className={TEXTAREA} placeholder="Tell attendees about yourself or your organization..." />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Website</label>
            <input {...register("website_url")} className={INPUT} placeholder="https://yoursite.com" />
            {errors.website_url && <p className="text-xs text-error mt-1">{errors.website_url.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Contact phone</label>
            <input {...register("contact_phone")} className={INPUT} placeholder="+2547XXXXXXXX" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Contact email</label>
            <input {...register("contact_email")} type="email" className={INPUT} placeholder="events@yourdomain.com" />
            {errors.contact_email && <p className="text-xs text-error mt-1">{errors.contact_email.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Physical address (for tickets)</label>
            <input {...register("contact_address")} className={INPUT} placeholder="Nairobi, Kenya" />
          </div>
        </div>
      </section>

      {/* Social links */}
      <section className="bg-surface-2 border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold">Social Links</h2>
        {(["instagram_url","twitter_url","facebook_url","youtube_url"] as const).map(platform => (
          <div key={platform}>
            <label className="block text-sm font-medium mb-1.5 capitalize">{platform.replace('_url', '')}</label>
            <div className="flex">
              <span className="flex items-center px-3 bg-surface border border-r-0 border-border rounded-l-sm text-xs text-muted select-none">
                {platform === "instagram_url" ? "instagram.com/" : platform === "twitter_url" ? "x.com/" : platform === "facebook_url" ? "facebook.com/" : "youtube.com/@"}
              </span>
              <input {...register(platform)} className="flex-1 bg-surface border border-border rounded-r-sm px-3 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted" placeholder="username" />
            </div>
          </div>
        ))}
      </section>

      <Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save Profile</Button>
    </form>
  );
}

// ── KYC Tab ───────────────────────────────────────────────────────────────────

function KycTab() {
  const [status, setStatus]   = useState("NOT_SUBMITTED");
  const [uploading, setUploading] = useState(false);
  const [files, setFiles]     = useState<{ type: string; file: File | null }[]>([
    { type: "id_front",       file: null },
    { type: "id_back",        file: null },
    { type: "selfie",         file: null },
    { type: "business_cert",  file: null },
  ]);

  useEffect(() => {
    api.get<any>("/organizer/kyc/").then(r => {
      if (r.success && r.data) setStatus(r.data.status || "NOT_SUBMITTED");
    });
  }, []);

  const setFile = (type: string, file: File | null) =>
    setFiles(f => f.map(d => d.type === type ? { ...d, file } : d));

  const submit = async () => {
    const fd = new FormData();
    files.forEach(({ type, file }) => { if (file) fd.append(type, file); });
    if (![...fd.keys()].length) { toast.error("Upload at least one document"); return; }
    setUploading(true);
    const res = await api.post("/organizer/kyc/", fd);
    if (res.success) { toast.success("Documents submitted for review!"); setStatus("PENDING_REVIEW"); }
    else toast.error("Submission failed. Try again.");
    setUploading(false);
  };

  const DOC_LABELS: Record<string, string> = {
    id_front: "ID / Passport — Front",
    id_back:  "ID / Passport — Back",
    selfie:   "Selfie with ID",
    business_cert: "Business Registration (optional)",
  };

  return (
    <div className="space-y-6">
      <section className="bg-surface-2 border border-border rounded-xl p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="font-semibold">KYC Verification</h2>
            <p className="text-sm text-muted mt-0.5">Required to receive payouts. Your documents are encrypted and never shared.</p>
          </div>
          <StatusBadge status={status} />
        </div>

        {status === "APPROVED" ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-success/5 border border-success/20">
            <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
            <p className="text-sm text-success font-medium">Your identity is verified. You can receive payouts.</p>
          </div>
        ) : status === "REJECTED" ? (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-error/5 border border-error/20 mb-5">
            <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
            <p className="text-sm text-error">Your submission was rejected. Please re-upload clear, valid documents.</p>
          </div>
        ) : status === "PENDING_REVIEW" ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-warning/5 border border-warning/20">
            <AlertCircle className="w-5 h-5 text-warning shrink-0" />
            <p className="text-sm text-warning">Under review. We'll notify you within 1–2 business days.</p>
          </div>
        ) : null}

        {(status === "NOT_SUBMITTED" || status === "REJECTED") && (
          <div className="space-y-4 mt-5">
            {files.map(({ type, file }) => (
              <div key={type}>
                <label className="block text-sm font-medium mb-1.5">{DOC_LABELS[type]}</label>
                <label className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
                  file ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/30"
                )}>
                  <Upload className="w-4 h-4 text-muted shrink-0" />
                  <span className="text-sm text-muted truncate">{file ? file.name : "Click to upload (JPG, PNG, PDF)"}</span>
                  <input type="file" accept="image/*,.pdf" className="hidden"
                    onChange={e => setFile(type, e.target.files?.[0] || null)} />
                </label>
              </div>
            ))}
            <Button loading={uploading} onClick={submit} className="mt-2">Submit for Review</Button>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Payout Tab ────────────────────────────────────────────────────────────────

function PayoutTab() {
  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting, isDirty } } = useForm<PayoutForm>({
    resolver: zodResolver(payoutSchema),
    defaultValues: { payout_method: "MPESA" },
  });
  const method = watch("payout_method");

  useEffect(() => {
    api.get<any>("/organizer/payout-account/").then(r => {
      if (r.success && r.data) reset(r.data);
    });
  }, [reset]);

  const onSave = async (data: PayoutForm) => {
    const res = await api.patch("/organizer/payout-account/", data);
    if (res.success) toast.success("Payout account saved!");
    else toast.error("Save failed");
  };

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <section className="bg-surface-2 border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold">Payout Account</h2>
        <p className="text-sm text-muted -mt-1">Funds from confirmed events are sent here after the event date.</p>

        <div>
          <label className="block text-sm font-medium mb-2">Payout method</label>
          <div className="grid grid-cols-2 gap-2">
            {([["MPESA", "📱 M-Pesa"], ["BANK_TRANSFER", "🏦 Bank Transfer"]] as const).map(([val, label]) => (
              <label key={val} className="cursor-pointer">
                <input {...register("payout_method")} type="radio" value={val} className="sr-only" />
                <div className={cn(
                  "p-3 rounded-lg border text-center text-sm font-medium transition-all",
                  method === val ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/30"
                )}>{label}</div>
              </label>
            ))}
          </div>
        </div>

        {method === "MPESA" && (
          <div className="space-y-3 pt-2">
            <div>
              <label className="block text-sm font-medium mb-1.5">M-Pesa phone number *</label>
              <input {...register("mpesa_phone")} className={INPUT} placeholder="+2547XXXXXXXX" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Registered name</label>
              <input {...register("bank_account_name")} className={INPUT} placeholder="Name on M-Pesa" />
            </div>
          </div>
        )}

        {method === "BANK_TRANSFER" && (
          <div className="space-y-3 pt-2">
            <div>
              <label className="block text-sm font-medium mb-1.5">Bank name *</label>
              <input {...register("bank_name")} className={INPUT} placeholder="e.g. Equity Bank" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Account number *</label>
              <input {...register("bank_account_number")} className={INPUT} placeholder="0123456789" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Account Name *</label>
              <input {...register("bank_account_name")} className={INPUT} placeholder="Name on Account" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Branch</label>
              <input {...register("bank_branch")} className={INPUT} placeholder="e.g. Nairobi CBD" />
            </div>
          </div>
        )}
      </section>

      <Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save Payout Account</Button>
    </form>
  );
}

// ── Fee Agreement Tab ─────────────────────────────────────────────────────────

function FeesTab() {
  const [accepted, setAccepted]   = useState(false);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [fees, setFees] = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    api.get<any>("/organizer/fee-agreement/").then(r => {
      if (r.success && r.data) { 
        setAccepted(r.data.accepted); 
        setAcceptedAt(r.data.accepted_at || null); 
        setFees(r.data.fees);
      }
      setLoading(false);
    });
  }, []);

  const accept = async () => {
    setSaving(true);
    const res = await api.post<any>("/organizer/fee-agreement/accept/");
    if (res.success) { setAccepted(true); setAcceptedAt(new Date().toISOString()); toast.success("Agreement accepted!"); }
    else toast.error("Failed to save agreement");
    setSaving(false);
  };

  const FEE_ROWS = [
    ["Platform fee", fees?.platform_fee || "5% of ticket face value"],
    ["Payment processing (M-Pesa)", fees?.payment_processing_mpesa || "1.5% + KES 20 per transaction"],
    ["Payment processing (Card)", fees?.payment_processing_card || "2.9% + KES 30 per transaction"],
    ["Bank Transfer", fees?.bank_transfer_fee || "KES 50 flat per payout"],
    ["Free events", fees?.free_events_fee || "No charge"],
    ["Payout schedule", fees?.payout_schedule || "5–7 business days after event date"],
  ];

  return (
    <div className="space-y-6">
      <section className="bg-surface-2 border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-1">Platform Fee Agreement</h2>
        <p className="text-sm text-muted mb-5">By creating paid events on EliteTicketPass, you agree to the following fee structure.</p>

        <div className="rounded-lg border border-border overflow-hidden mb-5">
          <table className="w-full text-sm">
            <thead><tr className="bg-surface border-b border-border">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Fee Type</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted">Rate</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {FEE_ROWS.map(([type, rate]) => (
                <tr key={type}>
                  <td className="px-4 py-3 text-foreground">{type}</td>
                  <td className="px-4 py-3 text-right font-mono text-primary font-medium">{rate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 rounded-lg bg-surface border border-border text-xs text-muted space-y-2 mb-5">
          <p>• Fees are deducted from the gross ticket sales before payout.</p>
          <p>• EliteTicketPass reserves the right to update fees with 30 days notice.</p>
          <p>• Full <a href="/terms" target="_blank" className="text-primary hover:underline inline-flex items-center gap-0.5">Terms of Service <ExternalLink className="w-3 h-3" /></a> and <a href="/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</a> apply.</p>
        </div>

        {loading ? (
          <div className="h-10 bg-surface rounded animate-pulse" />
        ) : accepted ? (
          <div className="flex items-center gap-2 text-success text-sm font-medium">
            <CheckCircle2 className="w-5 h-5" />
            Accepted {acceptedAt ? `on ${new Date(acceptedAt).toLocaleDateString("en-KE", { dateStyle: "medium" })}` : ""}
          </div>
        ) : (
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-primary" onChange={e => setSaving(!e.target.checked)} />
              <span className="text-sm text-muted">I have read and agree to the fee structure and EliteTicketPass Terms of Service.</span>
            </label>
            <Button onClick={accept} loading={saving}>Accept & Continue</Button>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OrganizerSettingsPage() {
  const [tab, setTab] = useState<Tab>("profile");

  const CONTENT: Record<Tab, React.ReactNode> = {
    profile: <ProfileTab />,
    kyc:     <KycTab />,
    payout:  <PayoutTab />,
    fees:    <FeesTab />,
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold">Organizer Settings</h1>
        <p className="text-muted text-sm mt-1">Set up your profile, verify your identity, and configure payouts.</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 flex-wrap border-b border-border mb-8">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              tab === key ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"
            )}>
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
        {CONTENT[tab]}
      </motion.div>
    </div>
  );
}
