"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, Plus, Trash2, GripVertical, Users, Crown,
  Gift, Package, Eye, EyeOff, Lock, Pause, Play,
  CheckCircle2, Edit2, X, Save,
} from "lucide-react";
import * as Switch from "@radix-ui/react-switch";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type TierType = "REGULAR" | "VIP" | "VVIP" | "EARLY_BIRD" | "TABLE" | "GROUP" | "COMPLIMENTARY" | "GUEST_LIST";
type Visibility = "PUBLIC" | "HIDDEN" | "INVITE_ONLY";

interface Tier {
  id: string;
  name: string;
  description: string;
  type: TierType;
  price: string;
  quantity: number;
  sold: number;
  max_per_order: number;
  is_free: boolean;
  is_complimentary: boolean;
  visibility: Visibility;
  sale_starts_at: string;
  sale_ends_at: string;
  is_paused: boolean;
  sort_order: number;
  bundle_size: number;
}

const TIER_ICONS: Record<TierType, string> = {
  REGULAR: "🎟", VIP: "⭐", VVIP: "👑", EARLY_BIRD: "🐦",
  TABLE: "🪑", GROUP: "👥", COMPLIMENTARY: "🎁", GUEST_LIST: "📋",
};

const TIER_TYPE_LABELS: Record<TierType, string> = {
  REGULAR: "Regular", VIP: "VIP", VVIP: "VVIP", EARLY_BIRD: "Early Bird",
  TABLE: "Table", GROUP: "Group Bundle", COMPLIMENTARY: "Complimentary", GUEST_LIST: "Guest List",
};

const VISIBILITY_CONFIG: Record<Visibility, { label: string; icon: React.ElementType; cls: string }> = {
  PUBLIC:      { label: "Public",      icon: Eye,     cls: "text-success" },
  HIDDEN:      { label: "Hidden",      icon: EyeOff,  cls: "text-muted"   },
  INVITE_ONLY: { label: "Invite only", icon: Lock,    cls: "text-warning"  },
};

const BLANK_TIER: Omit<Tier, "id" | "sold" | "sort_order"> = {
  name: "", description: "", type: "REGULAR", price: "0",
  quantity: 100, max_per_order: 10, is_free: false, is_complimentary: false,
  visibility: "PUBLIC", sale_starts_at: "", sale_ends_at: "", is_paused: false, bundle_size: 1,
};

const INPUT = "w-full bg-surface border border-border rounded-sm px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted";
const LABEL = "block text-xs font-medium mb-1 text-muted";

// ── Tier Card ─────────────────────────────────────────────────────────────────

function TierCard({
  tier, onEdit, onDelete, onTogglePause, onToggleVisibility,
  dragHandleProps, isDragging,
}: {
  tier: Tier;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePause: () => void;
  onToggleVisibility: (v: Visibility) => void;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
  isDragging: boolean;
}) {
  const pct = tier.quantity > 0 ? Math.min(100, (tier.sold / tier.quantity) * 100) : 0;
  const Vis = VISIBILITY_CONFIG[tier.visibility];

  return (
    <motion.div layout
      className={cn(
        "bg-surface-2 border border-border rounded-xl overflow-hidden transition-shadow",
        isDragging && "shadow-2xl ring-2 ring-primary/30 scale-[1.01]",
        tier.is_paused && "opacity-60"
      )}>
      <div className="flex items-stretch">
        {/* Drag handle */}
        <div {...dragHandleProps}
          className="flex items-center px-3 text-muted hover:text-foreground cursor-grab active:cursor-grabbing border-r border-border bg-surface">
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Main content */}
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xl shrink-0">{TIER_ICONS[tier.type]}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm truncate">{tier.name}</h3>
                  {tier.is_complimentary && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary/10 text-secondary font-medium shrink-0">Comp</span>
                  )}
                  {tier.is_paused && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-warning/10 text-warning font-medium shrink-0">Paused</span>
                  )}
                </div>
                {tier.description && <p className="text-xs text-muted mt-0.5 truncate">{tier.description}</p>}
              </div>
            </div>

            {/* Price */}
            <div className="text-right shrink-0">
              <p className="font-bold text-sm">{tier.is_free || tier.is_complimentary ? "Free" : formatCurrency(tier.price)}</p>
              {tier.bundle_size > 1 && <p className="text-xs text-muted">×{tier.bundle_size} pax</p>}
            </div>
          </div>

          {/* Sales bar */}
          <div className="mb-3">
            <div className="flex justify-between text-xs text-muted mb-1">
              <span>{tier.sold.toLocaleString()} sold</span>
              <span>{tier.quantity.toLocaleString()} total</span>
            </div>
            <div className="h-1.5 bg-surface rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 flex-wrap text-xs text-muted">
            <span>Max {tier.max_per_order}/order</span>
            {tier.sale_ends_at && <span>Ends {new Date(tier.sale_ends_at).toLocaleDateString("en-KE", { dateStyle: "medium" })}</span>}
            <span className={cn("flex items-center gap-1", Vis.cls)}>
              <Vis.icon className="w-3 h-3" />{Vis.label}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col border-l border-border divide-y divide-border">
          <button onClick={onEdit}    className="flex-1 px-4 flex items-center justify-center text-muted hover:text-primary hover:bg-primary/5 transition-colors"><Edit2 className="w-4 h-4" /></button>
          <button onClick={onTogglePause} className="flex-1 px-4 flex items-center justify-center text-muted hover:text-warning hover:bg-warning/5 transition-colors">
            {tier.is_paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
          <button onClick={onDelete}  className="flex-1 px-4 flex items-center justify-center text-muted hover:text-error hover:bg-error/5 transition-colors"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Tier Form Modal ───────────────────────────────────────────────────────────

function TierFormModal({
  initial, onSave, onClose,
}: {
  initial: Partial<Tier> | null;
  onSave: (data: Omit<Tier, "id" | "sold" | "sort_order">) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Omit<Tier, "id" | "sold" | "sort_order">>({
    ...BLANK_TIER, ...initial,
  });
  const [saving, setSaving] = useState(false);
  const patch = (p: Partial<typeof form>) => setForm(f => ({ ...f, ...p }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Tier name required"); return; }
    if (!form.is_free && !form.is_complimentary && Number(form.price) < 0) { toast.error("Invalid price"); return; }
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  const isGroupOrTable = form.type === "GROUP" || form.type === "TABLE";
  const isFreeType     = form.is_complimentary || form.type === "COMPLIMENTARY" || form.type === "GUEST_LIST";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4 py-6 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-surface-2 border border-border rounded-xl w-full max-w-xl my-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold">{initial?.id ? "Edit Tier" : "Add Ticket Tier"}</h2>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-foreground rounded-sm transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Type picker */}
          <div>
            <label className={LABEL}>Tier type</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.entries(TIER_ICONS) as [TierType, string][]).map(([type, icon]) => (
                <label key={type} className="cursor-pointer">
                  <input type="radio" value={type} checked={form.type === type}
                    onChange={() => patch({ type, is_free: type === "COMPLIMENTARY" || type === "GUEST_LIST", is_complimentary: type === "COMPLIMENTARY" || type === "GUEST_LIST" })}
                    className="sr-only" />
                  <div className={cn("p-2 rounded-lg border text-center text-xs font-medium transition-all",
                    form.type === type ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/30")}>
                    <div className="text-lg mb-0.5">{icon}</div>
                    {TIER_TYPE_LABELS[type]}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className={LABEL}>Tier name *</label>
            <input value={form.name} onChange={e => patch({ name: e.target.value })} className={INPUT} placeholder="e.g. VIP Table for 10" />
          </div>

          {/* Description */}
          <div>
            <label className={LABEL}>Description</label>
            <textarea value={form.description} onChange={e => patch({ description: e.target.value })} rows={2}
              className="w-full bg-surface border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted resize-none"
              placeholder="What's included with this tier?" />
          </div>

          {/* Price / Free */}
          {!isFreeType && (
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_free} onChange={e => patch({ is_free: e.target.checked })} className="accent-primary" />
                <span className="text-sm font-medium">Free ticket</span>
              </label>
              {!form.is_free && (
                <div className="flex-1">
                  <label className={LABEL}>Price (KES) *</label>
                  <input type="number" value={form.price} onChange={e => patch({ price: e.target.value })}
                    className={INPUT} min={0} placeholder="1500" />
                </div>
              )}
            </div>
          )}
          {isFreeType && (
            <div className="flex items-center gap-2 text-sm text-secondary bg-secondary/5 border border-secondary/20 rounded-lg px-3 py-2">
              <Gift className="w-4 h-4" /> This tier type is always complimentary / free.
            </div>
          )}

          {/* Group/Table bundle size */}
          {isGroupOrTable && (
            <div>
              <label className={LABEL}>Bundle size (people per ticket)</label>
              <input type="number" value={form.bundle_size} onChange={e => patch({ bundle_size: Number(e.target.value) })}
                className={INPUT} min={2} placeholder="10" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Quantity *</label>
              <input type="number" value={form.quantity} onChange={e => patch({ quantity: Number(e.target.value) })}
                className={INPUT} min={1} />
            </div>
            <div>
              <label className={LABEL}>Max per order</label>
              <input type="number" value={form.max_per_order} onChange={e => patch({ max_per_order: Number(e.target.value) })}
                className={INPUT} min={1} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Sale starts</label>
              <input type="datetime-local" value={form.sale_starts_at} onChange={e => patch({ sale_starts_at: e.target.value })}
                className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Sale ends</label>
              <input type="datetime-local" value={form.sale_ends_at} onChange={e => patch({ sale_ends_at: e.target.value })}
                className={INPUT} />
            </div>
          </div>

          {/* Visibility */}
          <div>
            <label className={LABEL}>Visibility</label>
            <div className="grid grid-cols-3 gap-2">
              {(["PUBLIC", "HIDDEN", "INVITE_ONLY"] as Visibility[]).map(v => {
                const cfg = VISIBILITY_CONFIG[v];
                return (
                  <label key={v} className="cursor-pointer">
                    <input type="radio" value={v} checked={form.visibility === v} onChange={() => patch({ visibility: v })} className="sr-only" />
                    <div className={cn("p-2.5 rounded-lg border text-center text-xs font-medium transition-all flex flex-col items-center gap-1",
                      form.visibility === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/30")}>
                      <cfg.icon className="w-4 h-4" /> {cfg.label}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-border">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button loading={saving} onClick={handleSave} className="flex-1"><Save className="w-4 h-4" /> Save Tier</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TiersPage() {
  const { id } = useParams<{ id: string }>();
  const [tiers,    setTiers]    = useState<Tier[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState<Partial<Tier> | null | "new">(null);
  const [eventTitle, setEventTitle] = useState("");

  // Drag state
  const [dragIdx,  setDragIdx]  = useState<number | null>(null);
  const [overIdx,  setOverIdx]  = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const [evRes, tierRes] = await Promise.all([
      api.get<any>(`/organizer/events/${id}/`),
      api.get<{ results: Tier[] }>(`/organizer/events/${id}/tiers/`),
    ]);
    if (evRes.success)   setEventTitle(evRes.data?.title || "");
    if (tierRes.success) setTiers(((tierRes.data as any)?.results ?? tierRes.data ?? []).sort((a: Tier, b: Tier) => a.sort_order - b.sort_order));
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const onDragStart = (idx: number) => setDragIdx(idx);
  const onDragEnter = (idx: number) => setOverIdx(idx);

  const onDragEnd = async () => {
    if (dragIdx === null || overIdx === null || dragIdx === overIdx) {
      setDragIdx(null); setOverIdx(null); return;
    }
    const reordered = [...tiers];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(overIdx, 0, moved);
    const updated = reordered.map((t, i) => ({ ...t, sort_order: i }));
    setTiers(updated);
    setDragIdx(null); setOverIdx(null);
    await api.post(`/organizer/events/${id}/tiers/reorder/`, {
      order: updated.map(t => t.id),
    });
  };

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const saveTier = async (data: Omit<Tier, "id" | "sold" | "sort_order">) => {
    const editingTier = editing !== "new" ? editing : null;
    const res = editingTier?.id
      ? await api.patch<Tier>(`/organizer/events/${id}/tiers/${editingTier.id}/`, data)
      : await api.post<Tier>(`/organizer/events/${id}/tiers/`, data);
    if (res.success && res.data) {
      toast.success(editingTier?.id ? "Tier updated!" : "Tier added!");
      setEditing(null);
      load();
    } else toast.error(res.error || "Save failed");
  };

  const deleteTier = async (tierId: string) => {
    if (!confirm("Delete this tier? Sold tickets will not be affected.")) return;
    const res = await api.delete(`/organizer/events/${id}/tiers/${tierId}/`);
    if (res.success) { toast.success("Tier deleted"); load(); }
    else toast.error("Delete failed");
  };

  const togglePause = async (tier: Tier) => {
    const res = await api.patch(`/organizer/events/${id}/tiers/${tier.id}/`, { is_paused: !tier.is_paused });
    if (res.success) {
      toast.success(tier.is_paused ? "Sales resumed" : "Sales paused");
      setTiers(ts => ts.map(t => t.id === tier.id ? { ...t, is_paused: !t.is_paused } : t));
    }
  };

  const setVisibility = async (tier: Tier, visibility: Visibility) => {
    const res = await api.patch(`/organizer/events/${id}/tiers/${tier.id}/`, { visibility });
    if (res.success) setTiers(ts => ts.map(t => t.id === tier.id ? { ...t, visibility } : t));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/events" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ChevronLeft className="w-4 h-4" /> Events
        </Link>
        <span className="text-muted">/</span>
        <Link href={`/dashboard/events/${id}/edit`} className="text-sm text-muted hover:text-foreground truncate max-w-[160px]">{eventTitle || "Event"}</Link>
        <span className="text-muted">/</span>
        <span className="text-sm font-medium">Ticket Tiers</span>
      </div>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold">Ticket Tiers</h1>
          <p className="text-muted text-sm mt-1">Drag to reorder · Click pause to stop sales independently</p>
        </div>
        <Button onClick={() => setEditing("new")}><Plus className="w-4 h-4" /> Add Tier</Button>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 bg-surface-2 border border-border rounded-xl animate-pulse" />
        ))}</div>
      ) : tiers.length === 0 ? (
        <div className="text-center py-24 bg-surface-2 border border-border rounded-xl">
          <Package className="w-10 h-10 text-muted mx-auto mb-3" />
          <h3 className="font-semibold mb-1">No ticket tiers yet</h3>
          <p className="text-muted text-sm mb-5">Add at least one tier before publishing.</p>
          <Button onClick={() => setEditing("new")}><Plus className="w-4 h-4" /> Add First Tier</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {tiers.map((tier, idx) => (
            <div key={tier.id}
              draggable
              onDragStart={() => onDragStart(idx)}
              onDragEnter={() => onDragEnter(idx)}
              onDragEnd={onDragEnd}
              onDragOver={e => e.preventDefault()}
              className={cn("transition-all", overIdx === idx && dragIdx !== idx && "translate-y-1 opacity-70")}>
              <TierCard
                tier={tier}
                onEdit={() => setEditing(tier)}
                onDelete={() => deleteTier(tier.id)}
                onTogglePause={() => togglePause(tier)}
                onToggleVisibility={v => setVisibility(tier, v)}
                dragHandleProps={{ onMouseDown: () => {} }}
                isDragging={dragIdx === idx}
              />
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {tiers.length > 0 && (
        <div className="mt-6 grid grid-cols-3 gap-4">
          {[
            { label: "Total Capacity", value: tiers.reduce((s, t) => s + t.quantity, 0).toLocaleString() },
            { label: "Tickets Sold",   value: tiers.reduce((s, t) => s + t.sold, 0).toLocaleString() },
            { label: "Revenue",        value: formatCurrency(tiers.reduce((s, t) => s + (t.sold * Number(t.price)), 0)) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-surface-2 border border-border rounded-xl p-4 text-center">
              <p className="text-xs text-muted mb-1">{label}</p>
              <p className="font-bold text-lg">{value}</p>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {editing !== null && (
          <TierFormModal
            initial={editing === "new" ? null : editing}
            onSave={saveTier}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
