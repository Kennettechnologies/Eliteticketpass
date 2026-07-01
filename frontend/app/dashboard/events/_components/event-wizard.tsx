"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronLeft, Check, Plus, Trash2, Upload,
  MapPin, Globe, Image, Video, Info, Calendar, Ticket,
  Settings2, Eye, Send, Clock,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import "react-quill/dist/quill.snow.css";

const ReactQuill = dynamic(() => import("react-quill"), { 
  ssr: false, 
  loading: () => <div className="h-48 bg-surface border border-border rounded-sm animate-pulse" /> 
});

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TierDraft {
  id?: string;
  name: string;
  description: string;
  price: string;
  quantity: string;
  max_per_order: string;
  sale_starts_at: string;
  sale_ends_at: string;
  is_free: boolean;
}

export interface EventDraft {
  // Step 1
  title: string;
  category_id: string;
  tags: string;
  description: string;
  // Step 2
  date_type: "single" | "multi" | "recurring";
  starts_at: string;
  ends_at: string;
  recurrence_rule: string;
  // Step 3
  is_online: boolean;
  venue_name: string;
  venue_address: string;
  venue_city: string;
  venue_country: string;
  online_url: string;
  // Step 4
  tiers: TierDraft[];
  // Step 5
  cover_image_url: string;
  promo_video_url: string;
  // Step 6
  visibility: "PUBLIC" | "PRIVATE" | "UNLISTED";
  age_restriction: string;
  max_per_order: string;
  ticket_terms: string;
  status: "DRAFT" | "PUBLISHED";
}

const DEFAULT_TIER: TierDraft = {
  name: "", description: "", price: "", quantity: "",
  max_per_order: "10", sale_starts_at: "", sale_ends_at: "", is_free: false,
};

const DEFAULT_DRAFT: EventDraft = {
  title: "", category_id: "", tags: "", description: "",
  date_type: "single", starts_at: "", ends_at: "", recurrence_rule: "",
  is_online: false, venue_name: "", venue_address: "", venue_city: "", venue_country: "Kenya", online_url: "",
  tiers: [{ ...DEFAULT_TIER, name: "General Admission" }],
  cover_image_url: "", promo_video_url: "",
  visibility: "PUBLIC", age_restriction: "", max_per_order: "10", ticket_terms: "",
  status: "DRAFT",
};

const STEPS = [
  { label: "Basic Info",  icon: Info },
  { label: "Date & Time", icon: Calendar },
  { label: "Location",    icon: MapPin },
  { label: "Tickets",     icon: Ticket },
  { label: "Media",       icon: Image },
  { label: "Settings",    icon: Settings2 },
] as const;

const INPUT = "w-full bg-surface border border-border rounded-sm px-4 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted";
const TEXTAREA = "w-full bg-surface border border-border rounded-sm px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted resize-none";
const LABEL = "block text-sm font-medium mb-1.5";

// ── Step 1 — Basic Info ───────────────────────────────────────────────────────

function StepBasicInfo({ data, onChange, categories }: {
  data: EventDraft;
  onChange: (p: Partial<EventDraft>) => void;
  categories: { id: string; name: string; color: string }[];
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className={LABEL}>Event title *</label>
        <input value={data.title} onChange={e => onChange({ title: e.target.value })}
          className={INPUT} placeholder="e.g. Nairobi Jazz Festival 2025" />
      </div>
      <div>
        <label className={LABEL}>Category *</label>
        <select value={data.category_id} onChange={e => onChange({ category_id: e.target.value })}
          className={INPUT}>
          <option value="">Select a category</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className={LABEL}>Tags <span className="text-muted font-normal">(comma-separated)</span></label>
        <input value={data.tags} onChange={e => onChange({ tags: e.target.value })}
          className={INPUT} placeholder="music, jazz, outdoor, festival" />
      </div>
      <div>
        <label className={LABEL}>Description *</label>
        <div className="bg-surface border border-border rounded-sm overflow-hidden [&_.ql-toolbar]:border-none [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-border [&_.ql-toolbar]:bg-surface-2 [&_.ql-container]:border-none [&_.ql-editor]:min-h-[200px] [&_.ql-editor]:text-sm">
          <ReactQuill theme="snow" value={data.description} onChange={val => onChange({ description: val })}
            placeholder="Tell attendees what to expect. Use formatting, lists, and links." />
        </div>
        <p className="text-xs text-muted mt-1">Rich text supported. Length: {data.description.replace(/<[^>]*>?/gm, '').length} chars</p>
      </div>
    </div>
  );
}

// ── Step 2 — Date & Time ─────────────────────────────────────────────────────

function StepDateTime({ data, onChange }: { data: EventDraft; onChange: (p: Partial<EventDraft>) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <label className={LABEL}>Date type</label>
        <div className="grid grid-cols-3 gap-2">
          {(["single", "multi", "recurring"] as const).map(t => (
            <label key={t} className="cursor-pointer">
              <input type="radio" value={t} checked={data.date_type === t}
                onChange={() => onChange({ date_type: t })} className="sr-only" />
              <div className={cn("p-3 rounded-lg border text-center text-sm font-medium transition-all",
                data.date_type === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/30")}>
                {t === "single" ? "📅 Single Day" : t === "multi" ? "📆 Multi-Day" : "🔁 Recurring"}
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>Start date & time *</label>
          <input type="datetime-local" value={data.starts_at} onChange={e => onChange({ starts_at: e.target.value })}
            className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>{data.date_type === "single" ? "End time" : "End date & time"} *</label>
          <input type="datetime-local" value={data.ends_at} onChange={e => onChange({ ends_at: e.target.value })}
            className={INPUT} />
        </div>
      </div>

      {data.date_type === "recurring" && (
        <div>
          <label className={LABEL}>Recurrence rule</label>
          <select value={data.recurrence_rule} onChange={e => onChange({ recurrence_rule: e.target.value })}
            className={INPUT}>
            <option value="">Select frequency</option>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="BIWEEKLY">Bi-weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </div>
      )}
    </div>
  );
}

// ── Step 3 — Location ─────────────────────────────────────────────────────────

function StepLocation({ data, onChange }: { data: EventDraft; onChange: (p: Partial<EventDraft>) => void }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <label className="cursor-pointer">
          <input type="radio" checked={!data.is_online} onChange={() => onChange({ is_online: false })} className="sr-only" />
          <div className={cn("p-4 rounded-lg border text-center transition-all",
            !data.is_online ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/30")}>
            <MapPin className="w-5 h-5 mx-auto mb-1" />
            <span className="text-sm font-medium">Physical Venue</span>
          </div>
        </label>
        <label className="cursor-pointer">
          <input type="radio" checked={data.is_online} onChange={() => onChange({ is_online: true })} className="sr-only" />
          <div className={cn("p-4 rounded-lg border text-center transition-all",
            data.is_online ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/30")}>
            <Globe className="w-5 h-5 mx-auto mb-1" />
            <span className="text-sm font-medium">Online Event</span>
          </div>
        </label>
      </div>

      {data.is_online ? (
        <div>
          <label className={LABEL}>Online event link</label>
          <input value={data.online_url} onChange={e => onChange({ online_url: e.target.value })}
            className={INPUT} placeholder="https://zoom.us/j/..." />
          <p className="text-xs text-muted mt-1">Link will only be visible to ticket holders after purchase.</p>
        </div>
      ) : (
        <>
          <div>
            <label className={LABEL}>Venue name *</label>
            <input value={data.venue_name} onChange={e => onChange({ venue_name: e.target.value })}
              className={INPUT} placeholder="e.g. Carnivore Grounds" />
          </div>
          <div>
            <label className={LABEL}>Street address</label>
            <input value={data.venue_address} onChange={e => onChange({ venue_address: e.target.value })}
              className={INPUT} placeholder="e.g. Langata Road, Nairobi" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>City *</label>
              <input value={data.venue_city} onChange={e => onChange({ venue_city: e.target.value })}
                className={INPUT} placeholder="Nairobi" />
            </div>
            <div>
              <label className={LABEL}>Country</label>
              <input value={data.venue_country} onChange={e => onChange({ venue_country: e.target.value })}
                className={INPUT} placeholder="Kenya" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Step 4 — Ticket Tiers ─────────────────────────────────────────────────────

function StepTickets({ data, onChange }: { data: EventDraft; onChange: (p: Partial<EventDraft>) => void }) {
  const updateTier = (idx: number, patch: Partial<TierDraft>) => {
    const tiers = data.tiers.map((t, i) => i === idx ? { ...t, ...patch } : t);
    onChange({ tiers });
  };
  const removeTier = (idx: number) => onChange({ tiers: data.tiers.filter((_, i) => i !== idx) });
  const addTier = () => onChange({ tiers: [...data.tiers, { ...DEFAULT_TIER }] });

  return (
    <div className="space-y-4">
      {data.tiers.map((tier, idx) => (
        <div key={idx} className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">Tier {idx + 1}</h3>
            {data.tiers.length > 1 && (
              <button onClick={() => removeTier(idx)} className="p-1.5 text-error hover:bg-error/10 rounded-sm transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Tier name *</label>
              <input value={tier.name} onChange={e => updateTier(idx, { name: e.target.value })}
                className={INPUT} placeholder="e.g. VIP, Early Bird" />
            </div>
            <div>
              <label className={LABEL}>Quantity *</label>
              <input type="number" value={tier.quantity} onChange={e => updateTier(idx, { quantity: e.target.value })}
                className={INPUT} placeholder="100" min={1} />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input type="checkbox" checked={tier.is_free} onChange={e => updateTier(idx, { is_free: e.target.checked, price: e.target.checked ? "0" : "" })}
                className="accent-primary" />
              <span className="text-sm font-medium">Free ticket</span>
            </label>
            {!tier.is_free && (
              <div>
                <label className={LABEL}>Price (KES) *</label>
                <input type="number" value={tier.price} onChange={e => updateTier(idx, { price: e.target.value })}
                  className={INPUT} placeholder="1500" min={0} />
              </div>
            )}
          </div>

          <div>
            <label className={LABEL}>Description <span className="text-muted font-normal">(optional)</span></label>
            <input value={tier.description} onChange={e => updateTier(idx, { description: e.target.value })}
              className={INPUT} placeholder="What's included?" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={LABEL}>Max per order</label>
              <input type="number" value={tier.max_per_order} onChange={e => updateTier(idx, { max_per_order: e.target.value })}
                className={INPUT} min={1} />
            </div>
            <div>
              <label className={LABEL}>Sale starts</label>
              <input type="datetime-local" value={tier.sale_starts_at} onChange={e => updateTier(idx, { sale_starts_at: e.target.value })}
                className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Sale ends</label>
              <input type="datetime-local" value={tier.sale_ends_at} onChange={e => updateTier(idx, { sale_ends_at: e.target.value })}
                className={INPUT} />
            </div>
          </div>
        </div>
      ))}

      <button onClick={addTier}
        className="w-full flex items-center justify-center gap-2 h-11 border-2 border-dashed border-border rounded-xl text-sm text-muted hover:border-primary/40 hover:text-primary transition-colors">
        <Plus className="w-4 h-4" /> Add Ticket Tier
      </button>
    </div>
  );
}

// ── Step 5 — Media ────────────────────────────────────────────────────────────

function StepMedia({ data, onChange, eventId }: {
  data: EventDraft; onChange: (p: Partial<EventDraft>) => void; eventId?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const uploadCover = async (file: File) => {
    if (!eventId) { toast.error("Save the event first before uploading cover"); return; }
    setUploading(true);
    const fd = new FormData(); fd.append("cover_image", file);
    const res = await api.patch<any>(`/organizer/events/${eventId}/cover/`, fd);
    if (res.success && res.data?.cover_image_url) {
      onChange({ cover_image_url: res.data.cover_image_url });
      toast.success("Cover image uploaded!");
    } else toast.error("Upload failed");
    setUploading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <label className={LABEL}>Cover image</label>
        <div
          onClick={() => fileRef.current?.click()}
          className={cn(
            "relative border-2 border-dashed rounded-xl overflow-hidden cursor-pointer transition-colors",
            data.cover_image_url ? "border-primary/30" : "border-border hover:border-primary/40"
          )}
          style={{ height: 220 }}>
          {data.cover_image_url ? (
            <img src={data.cover_image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted">
              {uploading
                ? <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                : <><Upload className="w-8 h-8" /><p className="text-sm">Click to upload cover image</p><p className="text-xs">JPG, PNG, WebP · Min 1200×630px · Max 5MB</p></>}
            </div>
          )}
          {data.cover_image_url && (
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-sm font-medium">Change cover</span>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadCover(f); }} />
      </div>

      <div>
        <label className={LABEL}>Promo video URL <span className="text-muted font-normal">(YouTube or Vimeo)</span></label>
        <input value={data.promo_video_url} onChange={e => onChange({ promo_video_url: e.target.value })}
          className={INPUT} placeholder="https://youtube.com/watch?v=..." />
      </div>
    </div>
  );
}

// ── Step 6 — Settings ─────────────────────────────────────────────────────────

function StepSettings({ data, onChange }: { data: EventDraft; onChange: (p: Partial<EventDraft>) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <label className={LABEL}>Visibility</label>
        <div className="grid grid-cols-3 gap-2">
          {([["PUBLIC", "🌍 Public"], ["UNLISTED", "🔗 Unlisted"], ["PRIVATE", "🔒 Private"]] as const).map(([v, l]) => (
            <label key={v} className="cursor-pointer">
              <input type="radio" value={v} checked={data.visibility === v} onChange={() => onChange({ visibility: v })} className="sr-only" />
              <div className={cn("p-3 rounded-lg border text-center text-sm font-medium transition-all",
                data.visibility === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/30")}>
                {l}
              </div>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted mt-2">
          {data.visibility === "PUBLIC" ? "Visible to everyone in search and discovery."
            : data.visibility === "UNLISTED" ? "Only accessible via direct link."
            : "Invite-only. Not listed publicly."}
        </p>
      </div>

      <div>
        <label className={LABEL}>Age restriction <span className="text-muted font-normal">(leave blank for all ages)</span></label>
        <select value={data.age_restriction} onChange={e => onChange({ age_restriction: e.target.value })}
          className={INPUT}>
          <option value="">All ages</option>
          <option value="16">16+</option>
          <option value="18">18+</option>
          <option value="21">21+</option>
        </select>
      </div>

      <div>
        <label className={LABEL}>Max tickets per order</label>
        <input type="number" value={data.max_per_order} onChange={e => onChange({ max_per_order: e.target.value })}
          className={INPUT} min={1} max={50} />
      </div>

      <div>
        <label className={LABEL}>Ticket Terms & Conditions <span className="text-muted font-normal">(optional)</span></label>
        <textarea value={data.ticket_terms} onChange={e => onChange({ ticket_terms: e.target.value })}
          className={TEXTAREA} rows={4} placeholder="e.g. Management reserves the right to admission..." />
        <p className="text-xs text-muted mt-1">These will appear on the generated PDF tickets. Leave blank for default platform terms.</p>
      </div>

      <div className="pt-3 border-t border-border">
        <label className={LABEL}>Publish status</label>
        <div className="grid grid-cols-2 gap-2">
          {([["DRAFT", "💾 Save as Draft"], ["PUBLISHED", "🚀 Publish Now"]] as const).map(([v, l]) => (
            <label key={v} className="cursor-pointer">
              <input type="radio" value={v} checked={data.status === v} onChange={() => onChange({ status: v })} className="sr-only" />
              <div className={cn("p-3 rounded-lg border text-center text-sm font-medium transition-all",
                data.status === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/30")}>
                {l}
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Progress indicator ────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {STEPS.map((s, i) => (
        <div key={i} className="flex items-center gap-1 flex-1">
          <div className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors",
            i < current ? "bg-primary text-background" : i === current ? "bg-primary/20 text-primary ring-2 ring-primary" : "bg-surface border border-border text-muted"
          )}>
            {i < current ? <Check className="w-3.5 h-3.5" /> : i + 1}
          </div>
          <span className={cn("text-xs hidden sm:block truncate", i === current ? "text-primary font-medium" : "text-muted")}>{s.label}</span>
          {i < total - 1 && <div className={cn("flex-1 h-px mx-1", i < current ? "bg-primary" : "bg-border")} />}
        </div>
      ))}
    </div>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────────

interface Props {
  initialData?: Partial<EventDraft>;
  eventId?: string;
  categories: { id: string; name: string; color: string }[];
}

export function EventWizard({ initialData, eventId: initEventId, categories }: Props) {
  const router = useRouter();
  const [step, setStep]     = useState(0);
  const [data, setData]     = useState<EventDraft>({ ...DEFAULT_DRAFT, ...initialData });
  const [eventId, setEventId] = useState<string | undefined>(initEventId);
  const [saving, setSaving]   = useState(false);

  const patch = useCallback((p: Partial<EventDraft>) => setData(d => ({ ...d, ...p })), []);

  const validate = (): string | null => {
    if (step === 0) {
      if (!data.title.trim()) return "Event title is required";
      if (!data.category_id) return "Please select a category";
      if (!data.description.trim()) return "Description is required";
    }
    if (step === 1) {
      if (!data.starts_at) return "Start date is required";
      if (!data.ends_at)   return "End date is required";
      if (new Date(data.ends_at) <= new Date(data.starts_at)) return "End must be after start";
    }
    if (step === 2) {
      if (!data.is_online && !data.venue_name.trim()) return "Venue name is required";
      if (!data.is_online && !data.venue_city.trim()) return "City is required";
    }
    if (step === 3) {
      for (const t of data.tiers) {
        if (!t.name.trim()) return "All tier names are required";
        if (!t.is_free && (!t.price || Number(t.price) < 0)) return "All paid tiers need a valid price";
        if (!t.quantity || Number(t.quantity) < 1) return "All tiers need a quantity";
      }
    }
    return null;
  };

  const saveProgress = async (): Promise<boolean> => {
    setSaving(true);
    const payload = {
      ...data,
      age_restriction: data.age_restriction ? parseInt(data.age_restriction) : null,
      venue_country: data.venue_country === "Kenya" ? "KE" : data.venue_country,
      tags: data.tags.split(",").map(t => t.trim()).filter(Boolean),
    };
    const res = eventId
      ? await api.patch<any>(`/organizer/events/${eventId}/`, payload)
      : await api.post<any>("/organizer/events/create/", payload);
    setSaving(false);
    if (res.success && res.data) {
      if (!eventId) setEventId(res.data.id);
      return true;
    }
    toast.error(res.error || "Save failed");
    return false;
  };

  const next = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    if (step < STEPS.length - 1) {
      await saveProgress();
      setStep(s => s + 1);
    }
  };

  const submit = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    const ok = await saveProgress();
    if (ok) {
      toast.success(data.status === "PUBLISHED" ? "Event published! 🎉" : "Event saved as draft.");
      router.push("/dashboard/events");
    }
  };

  const STEP_CONTENT = [
    <StepBasicInfo key={0} data={data} onChange={patch} categories={categories} />,
    <StepDateTime  key={1} data={data} onChange={patch} />,
    <StepLocation  key={2} data={data} onChange={patch} />,
    <StepTickets   key={3} data={data} onChange={patch} />,
    <StepMedia     key={4} data={data} onChange={patch} eventId={eventId} />,
    <StepSettings  key={5} data={data} onChange={patch} />,
  ];

  return (
    <div className="max-w-2xl mx-auto">
      <StepIndicator current={step} total={STEPS.length} />

      <div className="bg-surface-2 border border-border rounded-xl p-6 mb-6">
        <h2 className="font-display text-lg font-bold mb-5 flex items-center gap-2">
          {(() => { const S = STEPS[step]; return <><S.icon className="w-5 h-5 text-primary" /> {S.label}</>; })()}
        </h2>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.15 }}>
            {STEP_CONTENT[step]}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={step === 0}>
          <ChevronLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex items-center gap-3">
          <Button variant="ghost" loading={saving} onClick={saveProgress}>Save draft</Button>
          {step < STEPS.length - 1 ? (
            <Button loading={saving} onClick={next}>
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button loading={saving} onClick={submit}>
              {data.status === "PUBLISHED" ? <><Send className="w-4 h-4" /> Publish</> : <><Check className="w-4 h-4" /> Save</>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
