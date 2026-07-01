"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Bell, Mail, MessageSquare, Clock, CheckCircle2,
  Plus, Trash2, Edit2, X, Save, Eye, ChevronDown,
  Megaphone, Zap, FileText, Users, ToggleLeft, ToggleRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "announcements" | "automations" | "templates";
type Channel = "EMAIL" | "SMS" | "WHATSAPP" | "PUSH";

interface Announcement {
  id: string;
  subject: string;
  body: string;
  channels: Channel[];
  event_id: string | null;
  event_title: string | null;
  sent_at: string;
  recipient_count: number;
}

interface Automation {
  id: string;
  trigger: string;
  trigger_label: string;
  channel: Channel;
  subject: string;
  body: string;
  offset_hours: number;
  is_active: boolean;
}

interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  channel: Channel;
  updated_at: string;
}

interface Event { id: string; title: string; }

const CHANNEL_CONFIG: Record<Channel, { label: string; icon: React.ElementType; color: string }> = {
  EMAIL:    { label: "Email",     icon: Mail,           color: "text-primary"   },
  SMS:      { label: "SMS",       icon: MessageSquare,  color: "text-success"   },
  WHATSAPP: { label: "WhatsApp",  icon: MessageSquare,  color: "text-success"   },
  PUSH:     { label: "Push",      icon: Bell,           color: "text-warning"   },
};

const TRIGGERS = [
  { value: "PRE_EVENT_24H",   label: "24h before event"    },
  { value: "PRE_EVENT_48H",   label: "48h before event"    },
  { value: "PRE_EVENT_1H",    label: "1h before event"     },
  { value: "POST_EVENT_1H",   label: "1h after event ends" },
  { value: "POST_EVENT_24H",  label: "24h after event ends"},
  { value: "TICKET_PURCHASE", label: "After ticket purchase"},
  { value: "CHECK_IN",        label: "After check-in"      },
];

const INPUT    = "w-full bg-surface border border-border rounded-sm px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted";
const TEXTAREA = "w-full bg-surface border border-border rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted resize-none";
const LABEL    = "block text-xs font-medium mb-1 text-muted";

// ── Compose / Announcement Modal ───────────────────────────────────────────────

function ComposeModal({ events, onDone, onClose }: {
  events: Event[]; onDone: () => void; onClose: () => void;
}) {
  const [subject,   setSubject]   = useState("");
  const [body,      setBody]      = useState("");
  const [channels,  setChannels]  = useState<Channel[]>(["EMAIL"]);
  const [eventId,   setEventId]   = useState("");
  const [preview,   setPreview]   = useState(false);
  const [sending,   setSending]   = useState(false);

  const toggleChannel = (c: Channel) =>
    setChannels(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]);

  const send = async () => {
    if (!body.trim()) { toast.error("Message body required"); return; }
    if (channels.includes("EMAIL") && !subject.trim()) { toast.error("Subject required for email"); return; }
    setSending(true);
    const res = await api.post("/organizer/announcements/", { subject, body, channels, event_id: eventId || null });
    if (res.success) { toast.success("Announcement sent!"); onDone(); onClose(); }
    else toast.error(res.error || "Send failed");
    setSending(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4 py-6 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-surface-2 border border-border rounded-xl w-full max-w-xl my-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold">Send Announcement</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setPreview(p => !p)}
              className={cn("flex items-center gap-1.5 text-xs px-2.5 h-7 rounded-sm border transition-colors", preview ? "border-primary text-primary" : "border-border text-muted hover:text-foreground")}>
              <Eye className="w-3.5 h-3.5" /> Preview
            </button>
            <button onClick={onClose} className="p-1.5 text-muted hover:text-foreground rounded-sm transition-colors"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Channels */}
          <div>
            <label className={LABEL}>Send via</label>
            <div className="flex flex-wrap gap-2">
              {(["EMAIL", "SMS", "WHATSAPP", "PUSH"] as Channel[]).map(c => {
                const cfg = CHANNEL_CONFIG[c];
                return (
                  <button key={c} onClick={() => toggleChannel(c)}
                    className={cn("flex items-center gap-1.5 px-3 h-8 rounded-full border text-xs font-medium transition-all",
                      channels.includes(c) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/30")}>
                    <cfg.icon className="w-3.5 h-3.5" />{cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Event scope */}
          <div>
            <label className={LABEL}>Target event (blank = all your events)</label>
            <select value={eventId} onChange={e => setEventId(e.target.value)} className={INPUT}>
              <option value="">All events — all ticket holders</option>
              {events.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>

          {channels.includes("EMAIL") && (
            <div>
              <label className={LABEL}>Subject *</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} className={INPUT}
                placeholder="Important update about your upcoming event" />
            </div>
          )}

          <div>
            <label className={LABEL}>Message *</label>
            {preview ? (
              <div className="bg-surface border border-border rounded-sm px-3 py-2.5 text-sm min-h-[120px] whitespace-pre-wrap">
                {body || <span className="text-muted">Nothing to preview yet.</span>}
              </div>
            ) : (
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={6} className={TEXTAREA}
                placeholder="Hi {first_name}, we have an update about your tickets to {event_title}..." />
            )}
            <p className="text-xs text-muted mt-1">
              Optional personalization: <code className="font-mono">{"{first_name}"}</code> <code className="font-mono">{"{event_title}"}</code> <code className="font-mono">{"{event_date}"}</code>
            </p>
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-border">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button loading={sending} onClick={send} className="flex-1 gap-2"><Send className="w-4 h-4" /> Send Now</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Template Modal ────────────────────────────────────────────────────────────

function TemplateModal({ initial, onDone, onClose }: {
  initial: Partial<Template> | null; onDone: () => void; onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name || "", subject: initial?.subject || "",
    body: initial?.body || "", channel: (initial?.channel || "EMAIL") as Channel,
  });
  const [saving, setSaving] = useState(false);
  const patch = (p: Partial<typeof form>) => setForm(f => ({ ...f, ...p }));

  const save = async () => {
    if (!form.name.trim() || !form.body.trim()) { toast.error("Name and body required"); return; }
    setSaving(true);
    const res = initial?.id
      ? await api.patch(`/organizer/templates/${initial.id}/`, form)
      : await api.post("/organizer/templates/", form);
    if (res.success) { toast.success("Template saved!"); onDone(); onClose(); }
    else toast.error(res.error || "Save failed");
    setSaving(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-surface-2 border border-border rounded-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold">{initial?.id ? "Edit Template" : "New Template"}</h2>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-foreground rounded-sm transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Template name *</label>
              <input value={form.name} onChange={e => patch({ name: e.target.value })} className={INPUT} placeholder="Pre-event Reminder" />
            </div>
            <div>
              <label className={LABEL}>Channel</label>
              <select value={form.channel} onChange={e => patch({ channel: e.target.value as Channel })} className={INPUT}>
                {(["EMAIL", "SMS", "WHATSAPP"] as Channel[]).map(c => <option key={c} value={c}>{CHANNEL_CONFIG[c].label}</option>)}
              </select>
            </div>
          </div>
          {form.channel === "EMAIL" && (
            <div>
              <label className={LABEL}>Subject</label>
              <input value={form.subject} onChange={e => patch({ subject: e.target.value })} className={INPUT} placeholder="Your ticket to {event_title}" />
            </div>
          )}
          <div>
            <label className={LABEL}>Body *</label>
            <textarea value={form.body} onChange={e => patch({ body: e.target.value })} rows={6} className={TEXTAREA}
              placeholder="Hi {first_name}, your event is coming up on {event_date}..." />
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-border">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button loading={saving} onClick={save} className="flex-1"><Save className="w-4 h-4" /> Save Template</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Automations Tab ───────────────────────────────────────────────────────────

function AutomationsTab({ automations, onToggle, onEdit, onAdd }: {
  automations: Automation[];
  onToggle: (a: Automation) => void;
  onEdit: (a: Automation) => void;
  onAdd: () => void;
}) {
  const DEFAULT_AUTOMATIONS: Omit<Automation, "id" | "is_active">[] = [
    { trigger: "PRE_EVENT_24H",   trigger_label: "24h before event",    channel: "EMAIL",    subject: "See you tomorrow! 🎉",        body: "Hi {first_name}, your event {event_title} is tomorrow at {event_time}. Here are your tickets.", offset_hours: -24 },
    { trigger: "PRE_EVENT_1H",    trigger_label: "1h before event",     channel: "SMS",      subject: "",                            body: "Your event {event_title} starts in 1 hour! See you soon.", offset_hours: -1  },
    { trigger: "POST_EVENT_24H",  trigger_label: "Post-event thank-you",channel: "EMAIL",    subject: "Thank you for attending! 💛", body: "Hi {first_name}, thanks for joining {event_title}. We'd love your feedback: {survey_link}", offset_hours: 24 },
  ];

  const existing = new Set(automations.map(a => a.trigger));
  const suggested = DEFAULT_AUTOMATIONS.filter(d => !existing.has(d.trigger));

  return (
    <div className="space-y-4">
      {automations.map(a => (
        <div key={a.id} className="bg-surface-2 border border-border rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className={cn("p-2 rounded-lg shrink-0", a.is_active ? "bg-success/10" : "bg-surface")}>
                <Zap className={cn("w-4 h-4", a.is_active ? "text-success" : "text-muted")} />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm">{a.trigger_label}</p>
                <p className="text-xs text-muted mt-0.5 truncate">{a.channel} · {a.subject || a.body.slice(0, 60)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => onEdit(a)} className="p-1.5 text-muted hover:text-primary hover:bg-primary/5 rounded-sm transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
              <button onClick={() => onToggle(a)} className="flex items-center gap-1.5 text-xs font-medium px-2.5 h-7 rounded-sm border border-border hover:bg-surface transition-colors">
                {a.is_active ? <><ToggleRight className="w-4 h-4 text-success" />On</> : <><ToggleLeft className="w-4 h-4 text-muted" />Off</>}
              </button>
            </div>
          </div>
        </div>
      ))}

      {suggested.length > 0 && (
        <div className="border-t border-dashed border-border pt-4">
          <p className="text-xs text-muted mb-3">Suggested automations</p>
          {suggested.map(s => (
            <div key={s.trigger} className="flex items-center justify-between gap-3 p-3 bg-surface border border-dashed border-border rounded-xl mb-2 opacity-60">
              <div className="flex items-center gap-2.5 min-w-0">
                <Zap className="w-4 h-4 text-muted shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.trigger_label}</p>
                  <p className="text-xs text-muted">{s.channel}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={onAdd}><Plus className="w-3.5 h-3.5" /> Enable</Button>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" onClick={onAdd} className="w-full"><Plus className="w-4 h-4" /> Add Custom Automation</Button>
    </div>
  );
}

// ── Automation Edit Modal ─────────────────────────────────────────────────────

function AutomationModal({ initial, onDone, onClose }: {
  initial: Partial<Automation> | null; onDone: () => void; onClose: () => void;
}) {
  const [form, setForm] = useState({
    trigger:      initial?.trigger      || "PRE_EVENT_24H",
    channel:      (initial?.channel     || "EMAIL") as Channel,
    subject:      initial?.subject      || "",
    body:         initial?.body         || "",
    offset_hours: initial?.offset_hours ?? -24,
    is_active:    initial?.is_active    ?? true,
  });
  const [saving, setSaving] = useState(false);
  const patch = (p: Partial<typeof form>) => setForm(f => ({ ...f, ...p }));

  const save = async () => {
    if (!form.body.trim()) { toast.error("Message body required"); return; }
    setSaving(true);
    const res = initial?.id
      ? await api.patch(`/organizer/automations/${initial.id}/`, form)
      : await api.post("/organizer/automations/", form);
    if (res.success) { toast.success("Automation saved!"); onDone(); onClose(); }
    else toast.error(res.error || "Save failed");
    setSaving(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-surface-2 border border-border rounded-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold">{initial?.id ? "Edit Automation" : "Add Automation"}</h2>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-foreground rounded-sm transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Trigger</label>
              <select value={form.trigger} onChange={e => patch({ trigger: e.target.value })} className={INPUT}>
                {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Channel</label>
              <select value={form.channel} onChange={e => patch({ channel: e.target.value as Channel })} className={INPUT}>
                {(["EMAIL", "SMS", "WHATSAPP"] as Channel[]).map(c => <option key={c} value={c}>{CHANNEL_CONFIG[c].label}</option>)}
              </select>
            </div>
          </div>
          {form.channel === "EMAIL" && (
            <div>
              <label className={LABEL}>Subject</label>
              <input value={form.subject} onChange={e => patch({ subject: e.target.value })} className={INPUT} placeholder="Your event is coming up!" />
            </div>
          )}
          <div>
            <label className={LABEL}>Message body *</label>
            <textarea value={form.body} onChange={e => patch({ body: e.target.value })} rows={5} className={TEXTAREA}
              placeholder="Hi {first_name}, ..." />
            <p className="text-xs text-muted mt-1">Optional personalization: <code className="font-mono text-xs">{"{first_name}"} {"{event_title}"} {"{event_date}"} {"{survey_link}"}</code></p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => patch({ is_active: e.target.checked })} className="accent-primary" />
            <span className="text-sm font-medium">Active immediately</span>
          </label>
        </div>
        <div className="flex gap-3 p-5 border-t border-border">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button loading={saving} onClick={save} className="flex-1"><Save className="w-4 h-4" /> Save</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CommunicationsPage() {
  const [tab,            setTab]           = useState<Tab>("announcements");
  const [announcements,  setAnnouncements] = useState<Announcement[]>([]);
  const [automations,    setAutomations]   = useState<Automation[]>([]);
  const [templates,      setTemplates]     = useState<Template[]>([]);
  const [events,         setEvents]        = useState<Event[]>([]);
  const [loading,        setLoading]       = useState(true);
  const [modal, setModal] = useState<"compose" | "template" | "automation" | null>(null);
  const [editingTemplate,   setEditingTemplate]   = useState<Partial<Template> | null>(null);
  const [editingAutomation, setEditingAutomation] = useState<Partial<Automation> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [annRes, autoRes, tmplRes, evRes] = await Promise.all([
      api.get<{ results: Announcement[] }>("/organizer/announcements/"),
      api.get<{ results: Automation[] }>("/organizer/automations/"),
      api.get<{ results: Template[] }>("/organizer/templates/"),
      api.get<{ results: Event[] }>("/organizer/events/?status=PUBLISHED&page_size=100"),
    ]);
    if (annRes.success)  setAnnouncements((annRes.data as any)?.results  ?? annRes.data  ?? []);
    if (autoRes.success) setAutomations((autoRes.data as any)?.results   ?? autoRes.data ?? []);
    if (tmplRes.success) setTemplates((tmplRes.data as any)?.results     ?? tmplRes.data ?? []);
    if (evRes.success)   setEvents((evRes.data as any)?.results          ?? evRes.data   ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleAutomation = async (a: Automation) => {
    const res = await api.patch(`/organizer/automations/${a.id}/`, { is_active: !a.is_active });
    if (res.success) setAutomations(list => list.map(x => x.id === a.id ? { ...x, is_active: !x.is_active } : x));
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    const res = await api.delete(`/organizer/templates/${id}/`);
    if (res.success) { setTemplates(ts => ts.filter(t => t.id !== id)); toast.success("Deleted"); }
  };

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "announcements", label: "Announcements", icon: Megaphone },
    { id: "automations",   label: "Automations",   icon: Zap       },
    { id: "templates",     label: "Templates",     icon: FileText  },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold">Communications</h1>
          <p className="text-muted text-sm mt-1">Send updates, automate emails, manage templates</p>
        </div>
        {tab === "announcements" && <Button onClick={() => setModal("compose")}><Send className="w-4 h-4" /> Send Announcement</Button>}
        {tab === "automations"   && <Button onClick={() => { setEditingAutomation(null); setModal("automation"); }}><Plus className="w-4 h-4" /> Add Automation</Button>}
        {tab === "templates"     && <Button onClick={() => { setEditingTemplate(null); setModal("template"); }}><Plus className="w-4 h-4" /> New Template</Button>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-surface border border-border rounded-lg p-1 w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn("flex items-center gap-2 px-4 h-9 rounded-md text-sm font-medium transition-colors",
              tab === id ? "bg-surface-2 text-foreground shadow-sm" : "text-muted hover:text-foreground")}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ── Announcements ── */}
      {tab === "announcements" && (
        loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-surface-2 border border-border rounded-xl animate-pulse" />)}</div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-24 bg-surface-2 border border-border rounded-xl">
            <Megaphone className="w-10 h-10 text-muted mx-auto mb-3" />
            <h3 className="font-semibold mb-1">No announcements sent yet</h3>
            <p className="text-muted text-sm mb-5">Send updates to all your ticket holders.</p>
            <Button onClick={() => setModal("compose")}><Send className="w-4 h-4" /> Send First Announcement</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map(a => (
              <div key={a.id} className="bg-surface-2 border border-border rounded-xl p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="font-medium">{a.subject || "(No subject)"}</p>
                    {a.event_title && <p className="text-xs text-muted mt-0.5">Event: {a.event_title}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.channels.map(c => {
                      const cfg = CHANNEL_CONFIG[c];
                      return <cfg.icon key={c} className={cn("w-3.5 h-3.5", cfg.color)} title={cfg.label} />;
                    })}
                  </div>
                </div>
                <p className="text-sm text-muted line-clamp-2 mb-3">{a.body}</p>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{a.recipient_count} recipients</span>
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-success" />Sent {formatDate(a.sent_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Automations ── */}
      {tab === "automations" && !loading && (
        <AutomationsTab
          automations={automations}
          onToggle={toggleAutomation}
          onEdit={a => { setEditingAutomation(a); setModal("automation"); }}
          onAdd={() => { setEditingAutomation(null); setModal("automation"); }}
        />
      )}

      {/* ── Templates ── */}
      {tab === "templates" && (
        loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 bg-surface-2 border border-border rounded-xl animate-pulse" />)}</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-24 bg-surface-2 border border-border rounded-xl">
            <FileText className="w-10 h-10 text-muted mx-auto mb-3" />
            <h3 className="font-semibold mb-1">No templates yet</h3>
            <p className="text-muted text-sm mb-5">Create reusable message templates.</p>
            <Button onClick={() => { setEditingTemplate(null); setModal("template"); }}><Plus className="w-4 h-4" /> Create Template</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map(t => {
              const cfg = CHANNEL_CONFIG[t.channel];
              return (
                <div key={t.id} className="bg-surface-2 border border-border rounded-xl p-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <cfg.icon className={cn("w-4 h-4 shrink-0", cfg.color)} />
                      <p className="font-medium truncate">{t.name}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-surface border border-border text-muted shrink-0">{cfg.label}</span>
                  </div>
                  {t.subject && <p className="text-xs text-muted mb-1">Subject: {t.subject}</p>}
                  <p className="text-sm text-muted line-clamp-2 mb-3">{t.body}</p>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>Updated {formatDate(t.updated_at)}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditingTemplate(t); setModal("template"); }}
                        className="p-1.5 text-muted hover:text-primary hover:bg-primary/5 rounded-sm transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteTemplate(t.id)}
                        className="p-1.5 text-muted hover:text-error hover:bg-error/5 rounded-sm transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Modals */}
      <AnimatePresence>
        {modal === "compose" && <ComposeModal events={events} onDone={load} onClose={() => setModal(null)} />}
        {modal === "template" && (
          <TemplateModal initial={editingTemplate} onDone={load} onClose={() => setModal(null)} />
        )}
        {modal === "automation" && (
          <AutomationModal initial={editingAutomation} onDone={load} onClose={() => setModal(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
