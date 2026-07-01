"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Shield, Laptop, Smartphone, Globe, MapPin,
  AlertTriangle, LogOut, RefreshCw, CheckCircle2,
  Key, Eye, EyeOff, Lock,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth";
import { cn, formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { RoleBadge } from "@/components/auth/role-guard";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Session {
  id: string;
  device_type: "desktop" | "mobile" | "tablet" | "unknown";
  browser: string;
  os: string;
  ip_address: string;
  location?: string;
  last_active: string;
  created_at: string;
  is_current: boolean;
}

interface OAuthProvider {
  provider: "google" | "facebook" | "apple";
  connected: boolean;
  email?: string;
  connected_at?: string;
}

// ── Session card ──────────────────────────────────────────────────────────────

function SessionCard({ session, onRevoke }: { session: Session; onRevoke: (id: string) => void }) {
  const [loading, setLoading] = useState(false);
  const DeviceIcon = session.device_type === "mobile" ? Smartphone : Laptop;

  const revoke = async () => {
    setLoading(true);
    const res = await api.delete(`/auth/sessions/${session.id}/`);
    if (res.success) { toast.success("Session revoked"); onRevoke(session.id); }
    else toast.error(res.error || "Failed to revoke");
    setLoading(false);
  };

  return (
    <div className={cn(
      "flex items-start justify-between gap-4 p-4 rounded-xl border transition-colors",
      session.is_current
        ? "bg-primary/5 border-primary/20"
        : "bg-surface-2 border-border"
    )}>
      <div className="flex items-start gap-3">
        <div className={cn("p-2.5 rounded-lg mt-0.5", session.is_current ? "bg-primary/10" : "bg-surface")}>
          <DeviceIcon className={cn("w-4 h-4", session.is_current ? "text-primary" : "text-muted")} />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-medium">{session.browser} on {session.os}</p>
            {session.is_current && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">This device</span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-muted">
            {session.location && (
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{session.location}</span>
            )}
            <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{session.ip_address}</span>
            <span>Active {formatDateTime(session.last_active)}</span>
          </div>
        </div>
      </div>
      {!session.is_current && (
        <button onClick={revoke} disabled={loading}
          className="shrink-0 flex items-center gap-1.5 text-xs text-error hover:bg-error/10 px-2.5 py-1.5 rounded-lg transition-colors">
          {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
          Revoke
        </button>
      )}
    </div>
  );
}

// ── Change password ───────────────────────────────────────────────────────────

function ChangePassword() {
  const [current,  setCurrent]  = useState("");
  const [next,     setNext]     = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [show,     setShow]     = useState(false);
  const [loading,  setLoading]  = useState(false);

  const save = async () => {
    if (next.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (next !== confirm) { toast.error("Passwords don't match"); return; }
    setLoading(true);
    const res = await api.post("/auth/change-password/", { current_password: current, new_password: next });
    if (res.success) {
      toast.success("Password updated");
      setCurrent(""); setNext(""); setConfirm("");
    } else toast.error(res.error || "Failed to change password");
    setLoading(false);
  };

  const inputCls = "w-full bg-surface border border-border rounded-sm px-3 pr-10 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

  return (
    <div className="space-y-3">
      {[
        { label: "Current password",  value: current,  set: setCurrent  },
        { label: "New password",      value: next,     set: setNext      },
        { label: "Confirm password",  value: confirm,  set: setConfirm  },
      ].map(({ label, value, set }) => (
        <div key={label}>
          <label className="block text-xs text-muted mb-1">{label}</label>
          <div className="relative">
            <input type={show ? "text" : "password"} value={value} onChange={e => set(e.target.value)}
              className={inputCls} />
          </div>
        </div>
      ))}

      <label className="flex items-center gap-2 cursor-pointer text-xs text-muted">
        <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} className="accent-primary" />
        Show passwords
      </label>

      <div className="pt-1">
        <p className="text-xs text-muted mb-3">
          Minimum 8 characters. Use a mix of letters, numbers and symbols.
        </p>
        <Button loading={loading} onClick={save} size="sm">
          <Lock className="w-3.5 h-3.5" /> Update Password
        </Button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const { user, forceLogoutAll } = useAuthStore();
  const router = useRouter();

  const [sessions,    setSessions]    = useState<Session[]>([]);
  const [providers,   setProviders]   = useState<OAuthProvider[]>([]);
  const [sessLoading, setSessLoading] = useState(true);
  const [forceLoad,   setForceLoad]   = useState(false);
  const [confirm2FA,  setConfirm2FA]  = useState(false);

  useEffect(() => {
    api.get<Session[]>("/auth/sessions/").then(r => {
      if (r.success && r.data) setSessions(r.data);
      setSessLoading(false);
    });
    api.get<OAuthProvider[]>("/auth/oauth-providers/").then(r => {
      if (r.success && r.data) setProviders(r.data);
    });
  }, []);

  const handleForceLogout = async () => {
    setForceLoad(true);
    const res = await forceLogoutAll();
    if (res.success) {
      toast.success("All sessions revoked. Signing you out…");
      setTimeout(() => router.push("/auth/login"), 1000);
    } else toast.error(res.error || "Failed");
    setForceLoad(false);
  };

  const revokeSession = (id: string) => setSessions(prev => prev.filter(s => s.id !== id));

  const otherCount = sessions.filter(s => !s.is_current).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Security & Access</h1>
        <p className="text-muted text-sm mt-0.5">Manage your sessions, password, and connected accounts</p>
      </div>

      {/* Account overview */}
      <div className="bg-surface-2 border border-border rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Account</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted mb-1">Role</p>
            {user?.role && <RoleBadge role={user.role} />}
          </div>
          <div>
            <p className="text-xs text-muted mb-1">Email</p>
            <div className="flex items-center gap-2">
              <p className="font-medium">{user?.email || "—"}</p>
              {user?.email_verified
                ? <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                : <AlertTriangle className="w-3.5 h-3.5 text-warning" />}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted mb-1">Phone</p>
            <div className="flex items-center gap-2">
              <p className="font-medium">{user?.phone || "—"}</p>
              {user?.phone && (
                user.phone_verified
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  : <AlertTriangle className="w-3.5 h-3.5 text-warning" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="bg-surface-2 border border-border rounded-xl p-5">
        <div className="flex items-center gap-3 mb-5">
          <Key className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Password</h2>
        </div>
        <ChangePassword />
      </div>

      {/* Active sessions */}
      <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Laptop className="w-5 h-5 text-primary" />
            <div>
              <h2 className="font-semibold">Active Sessions</h2>
              <p className="text-xs text-muted">{sessions.length} session{sessions.length !== 1 ? "s" : ""} active</p>
            </div>
          </div>
          {otherCount > 0 && (
            <button onClick={handleForceLogout} disabled={forceLoad}
              className="flex items-center gap-1.5 text-sm text-error hover:bg-error/10 px-3 py-1.5 rounded-lg transition-colors font-medium">
              {forceLoad ? <RefreshCw className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              Sign out all other sessions
            </button>
          )}
        </div>

        <div className="p-5 space-y-3">
          {sessLoading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-20 bg-surface rounded-xl animate-pulse" />
            ))
          ) : sessions.length === 0 ? (
            <p className="text-center py-6 text-muted text-sm">No active sessions found</p>
          ) : (
            sessions.map(session => (
              <SessionCard key={session.id} session={session} onRevoke={revokeSession} />
            ))
          )}
        </div>

        {/* Force logout all (including current) */}
        <div className="px-5 pb-5">
          <div className="bg-error/5 border border-error/20 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-sm">Sign out everywhere</p>
                <p className="text-xs text-muted mt-0.5">
                  Immediately revoke all sessions on all devices, including this one.
                </p>
              </div>
              <Button size="sm" variant="outline"
                className="shrink-0 border-error/30 text-error hover:bg-error/10"
                loading={forceLoad}
                onClick={handleForceLogout}>
                <LogOut className="w-3.5 h-3.5" /> Force logout all
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Connected OAuth */}
      {providers.length > 0 && (
        <div className="bg-surface-2 border border-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-5">
            <Globe className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Connected Accounts</h2>
          </div>
          <div className="space-y-3">
            {providers.map(p => (
              <div key={p.provider} className="flex items-center justify-between p-3 bg-surface border border-border rounded-xl">
                <div className="flex items-center gap-3">
                  {p.provider === "google" && (
                    <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  )}
                  <div>
                    <p className="text-sm font-medium capitalize">{p.provider}</p>
                    {p.email && <p className="text-xs text-muted">{p.email}</p>}
                  </div>
                </div>
                {p.connected ? (
                  <span className="text-xs text-success flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Connected</span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => {
                    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/${p.provider}/`;
                  }}>Connect</Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
