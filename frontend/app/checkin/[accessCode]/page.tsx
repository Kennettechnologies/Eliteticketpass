"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, X, AlertTriangle, Users, RefreshCw, Camera,
  SwitchCamera, Wifi, WifiOff, Upload, ShieldCheck,
  DoorOpen, BarChart2, ChevronDown, Ban,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ScanResult = "VALID" | "INVALID" | "ALREADY_USED" | "CANCELLED" | null;

interface ScanResponse {
  result: ScanResult;
  message: string;
  holder_name?: string;
  holder_photo?: string;
  tier_name?: string;
  ticket_number?: string;
  event_name?: string;
  checked_in_at?: string;
}

interface Stats {
  total_sold: number;
  total_checked_in: number;
  event_name: string;
  gates: { id: string; name: string; scanned: number }[];
}

interface Gate { id: string; name: string; }

interface OfflineScan { qr_token: string; gate_id: string; scanned_at: string; }

const QUEUE_KEY  = (code: string) => `tb_scan_queue_${code}`;
const CACHE_KEY  = (code: string) => `tb_ticket_cache_${code}`;
const GATE_KEY   = (code: string) => `tb_gate_${code}`;
const SYNC_KEY   = (code: string) => `tb_last_sync_${code}`;

// ── Audio helpers ─────────────────────────────────────────────────────────────

function playTone(result: ScanResult) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const configs: Record<NonNullable<ScanResult>, { freq: number; type: OscillatorType; dur: number; repeats: number }> = {
      VALID:       { freq: 880,  type: "sine",    dur: 0.18, repeats: 1 },
      INVALID:     { freq: 180,  type: "square",  dur: 0.25, repeats: 2 },
      ALREADY_USED:{ freq: 440,  type: "triangle",dur: 0.2,  repeats: 2 },
      CANCELLED:   { freq: 160,  type: "square",  dur: 0.3,  repeats: 3 },
    };
    if (!result) return;
    const c = configs[result];
    for (let i = 0; i < c.repeats; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = c.freq; osc.type = c.type;
      const t = ctx.currentTime + i * (c.dur + 0.08);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + c.dur);
      osc.start(t); osc.stop(t + c.dur);
    }
  } catch {}
}

function vibrate(result: ScanResult) {
  if (!navigator.vibrate) return;
  if (result === "VALID")        navigator.vibrate([120]);
  else if (result === "ALREADY_USED") navigator.vibrate([60, 60, 60]);
  else                           navigator.vibrate([80, 60, 80, 60, 80]);
}

// ── Result overlay ────────────────────────────────────────────────────────────

const RESULT_CONFIG = {
  VALID:       { bg: "bg-[#16a34a]", label: "✓ VALID",        icon: Check          },
  INVALID:     { bg: "bg-[#dc2626]", label: "✕ INVALID",      icon: X              },
  ALREADY_USED:{ bg: "bg-[#d97706]", label: "⚠ ALREADY USED", icon: AlertTriangle  },
  CANCELLED:   { bg: "bg-[#dc2626]", label: "✕ CANCELLED",    icon: Ban            },
} as const;

function ResultOverlay({ scan, onDismiss }: { scan: ScanResponse; onDismiss: () => void }) {
  if (!scan.result) return null;
  const cfg = RESULT_CONFIG[scan.result];
  const Icon = cfg.icon;
  return (
    <motion.div key="overlay"
      initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className={cn("absolute inset-0 flex flex-col items-center justify-center cursor-pointer select-none", cfg.bg)}
      onClick={onDismiss}>
      <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 20 }}>
        <Icon className="w-28 h-28 text-white mb-3 drop-shadow-lg" strokeWidth={2.5} />
      </motion.div>
      <h2 className="text-4xl font-black text-white tracking-wider mb-4">{cfg.label}</h2>
      {scan.holder_photo && (
        <img src={scan.holder_photo} alt="" className="w-20 h-20 rounded-full border-4 border-white/50 object-cover mb-3" />
      )}
      {scan.holder_name   && <p className="text-white text-xl font-bold">{scan.holder_name}</p>}
      {scan.tier_name     && <p className="text-white/80 text-base mt-1">{scan.tier_name}</p>}
      {scan.ticket_number && <p className="text-white/60 text-sm font-mono mt-1">#{scan.ticket_number}</p>}
      {scan.message       && <p className="text-white/60 text-sm mt-3 px-8 text-center">{scan.message}</p>}
      {scan.result === "ALREADY_USED" && scan.checked_in_at && (
        <p className="text-white/50 text-xs mt-2">
          First checked in: {new Date(scan.checked_in_at).toLocaleTimeString()}
        </p>
      )}
      <p className="text-white/40 text-xs mt-6">Tap to dismiss</p>
    </motion.div>
  );
}

// ── Gate picker modal ─────────────────────────────────────────────────────────

function GatePicker({ gates, current, onSelect }: {
  gates: Gate[]; current: Gate | null; onSelect: (g: Gate) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end">
      <motion.div initial={{ y: 300 }} animate={{ y: 0 }} className="w-full bg-[#111] rounded-t-2xl p-6">
        <h2 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
          <DoorOpen className="w-5 h-5 text-primary" /> Select Your Gate
        </h2>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {gates.map(g => (
            <button key={g.id} onClick={() => onSelect(g)}
              className={cn("w-full text-left px-4 py-3 rounded-xl font-medium transition-colors text-sm",
                current?.id === g.id ? "bg-primary text-background" : "bg-white/10 text-white hover:bg-white/15")}>
              {g.name}
            </button>
          ))}
        </div>
        {gates.length === 0 && (
          <p className="text-white/50 text-sm text-center py-4">No gates configured — you'll scan all tickets.</p>
        )}
        {gates.length === 0 && (
          <button onClick={() => onSelect({ id: "default", name: "Main Gate" })}
            className="w-full mt-3 px-4 py-3 rounded-xl bg-primary text-background font-medium text-sm">
            Continue as Main Gate
          </button>
        )}
      </motion.div>
    </div>
  );
}

// ── Supervisor override panel ─────────────────────────────────────────────────

function SupervisorPanel({ onOverride, onClose }: {
  onOverride: (ticketId: string, reason: string) => void; onClose: () => void;
}) {
  const [ticketId, setTicketId] = useState("");
  const [reason,   setReason]   = useState("");

  return (
    <motion.div initial={{ y: 300 }} animate={{ y: 0 }} exit={{ y: 300 }}
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#111] border-t border-white/10 p-5 rounded-t-2xl">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="w-4 h-4 text-warning" />
        <h3 className="text-white font-semibold text-sm">Supervisor Override</h3>
        <button onClick={onClose} className="ml-auto text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <input value={ticketId} onChange={e => setTicketId(e.target.value)}
        placeholder="Ticket ID or ticket number"
        className="w-full bg-white/10 text-white placeholder-white/30 rounded-lg px-3 h-10 text-sm mb-3 focus:outline-none border border-white/10" />
      <input value={reason} onChange={e => setReason(e.target.value)}
        placeholder="Override reason (required)"
        className="w-full bg-white/10 text-white placeholder-white/30 rounded-lg px-3 h-10 text-sm mb-3 focus:outline-none border border-white/10" />
      <button onClick={() => { if (ticketId && reason) { onOverride(ticketId, reason); onClose(); } }}
        disabled={!ticketId || !reason}
        className="w-full h-10 bg-warning text-background rounded-lg text-sm font-semibold disabled:opacity-40">
        Force Check-In
      </button>
    </motion.div>
  );
}

// ── Stats drawer ──────────────────────────────────────────────────────────────

function StatsDrawer({ stats, gate, onClose }: {
  stats: Stats | null; gate: Gate | null; onClose: () => void;
}) {
  const gateStats = gate ? stats?.gates?.find(g => g.id === gate.id) : null;
  return (
    <motion.div initial={{ y: 400 }} animate={{ y: 0 }} exit={{ y: 400 }}
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#111] border-t border-white/10 p-5 rounded-t-2xl">
      <div className="flex items-center gap-2 mb-5">
        <BarChart2 className="w-4 h-4 text-primary" />
        <h3 className="text-white font-semibold text-sm">Live Stats</h3>
        <button onClick={onClose} className="ml-auto text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      {stats && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Checked In",  value: stats.total_checked_in, color: "text-green-400" },
              { label: "Remaining",   value: stats.total_sold - stats.total_checked_in, color: "text-yellow-400" },
              { label: "Total",       value: stats.total_sold, color: "text-white" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white/5 rounded-xl p-3 text-center">
                <p className={cn("text-xl font-bold", color)}>{value}</p>
                <p className="text-white/40 text-xs mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          {/* Fill bar */}
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${stats.total_sold > 0 ? Math.round(stats.total_checked_in / stats.total_sold * 100) : 0}%` }} />
          </div>
          {/* Per-gate breakdown */}
          {stats.gates?.length > 0 && (
            <div>
              <p className="text-white/40 text-xs mb-2">Per Gate</p>
              <div className="space-y-1.5">
                {stats.gates.map(g => (
                  <div key={g.id} className={cn("flex justify-between items-center px-3 py-2 rounded-lg text-sm",
                    gate?.id === g.id ? "bg-primary/20 border border-primary/30" : "bg-white/5")}>
                    <span className="text-white">{g.name}</span>
                    <span className={cn("font-bold", gate?.id === g.id ? "text-primary" : "text-white/60")}>{g.scanned}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {gateStats && (
            <p className="text-white/40 text-xs text-center">This gate: {gateStats.scanned} scanned</p>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GateCheckInPage() {
  const { accessCode } = useParams<{ accessCode: string }>();

  const [gate,         setGate]        = useState<Gate | null>(null);
  const [gates,        setGates]       = useState<Gate[]>([]);
  const [showGatePick, setShowGatePick]= useState(false);
  const [stats,        setStats]       = useState<Stats | null>(null);
  const [scanResult,   setScanResult]  = useState<ScanResponse | null>(null);
  const [manualInput,  setManualInput] = useState("");
  const [scannerReady, setScannerReady]= useState(false);
  const [cameraError,  setCameraError] = useState<string | null>(null);
  const [facingMode,   setFacingMode]  = useState<"environment" | "user">("environment");
  const [isOnline,     setIsOnline]    = useState(true);
  const [queueCount,   setQueueCount]  = useState(0);
  const [lastSync,     setLastSync]    = useState<string | null>(null);
  const [scanning,     setScanning]    = useState(false);
  const [showStats,    setShowStats]   = useState(false);
  const [showSupervisor, setShowSupervisor] = useState(false);

  const scannerRef     = useRef<any>(null);
  const clearTimer     = useRef<ReturnType<typeof setTimeout>>();
  const isScanningRef  = useRef(false);

  // ── Queue helpers ──────────────────────────────────────────────────────────

  const getQueue  = (): OfflineScan[] => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY(accessCode)) || "[]"); } catch { return []; } };
  const pushQueue = (scan: OfflineScan) => {
    const q = getQueue(); q.push(scan);
    localStorage.setItem(QUEUE_KEY(accessCode), JSON.stringify(q));
    setQueueCount(q.length);
  };
  const clearQueue = () => { localStorage.removeItem(QUEUE_KEY(accessCode)); setQueueCount(0); };

  const syncQueue = useCallback(async () => {
    const q = getQueue(); if (!q.length) return;
    const res = await api.post(`/checkin/${accessCode}/sync/`, { scans: q });
    if (res.success) {
      clearQueue();
      const now = new Date().toISOString();
      localStorage.setItem(SYNC_KEY(accessCode), now);
      setLastSync(now);
    }
  }, [accessCode]);

  // ── Ticket cache (offline validation) ────────────────────────────────────

  const cacheTickets = useCallback(async () => {
    const res = await api.get<{ tokens: string[] }>(`/checkin/${accessCode}/ticket-tokens/`);
    if (res.success && res.data?.tokens) {
      localStorage.setItem(CACHE_KEY(accessCode), JSON.stringify(res.data.tokens));
      const now = new Date().toISOString();
      localStorage.setItem(SYNC_KEY(accessCode), now);
      setLastSync(now);
    }
  }, [accessCode]);

  const validateOffline = (token: string): ScanResponse => {
    try {
      const cache: string[] = JSON.parse(localStorage.getItem(CACHE_KEY(accessCode)) || "[]");
      return cache.includes(token)
        ? { result: "VALID",   message: "Offline — will sync when online", holder_name: "Ticket holder" }
        : { result: "INVALID", message: "Not found in offline cache" };
    } catch {
      return { result: "INVALID", message: "Offline — cache unavailable" };
    }
  };

  // ── Online/offline ────────────────────────────────────────────────────────

  useEffect(() => {
    const goOnline  = () => { setIsOnline(true);  syncQueue(); fetchStats(); cacheTickets(); };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    setIsOnline(navigator.onLine);
    setQueueCount(getQueue().length);
    const saved = localStorage.getItem(SYNC_KEY(accessCode));
    if (saved) setLastSync(saved);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, [syncQueue, cacheTickets]);

  // ── Stats + gate load ─────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    const res = await api.get<Stats>(`/checkin/${accessCode}/stats/`);
    if (res.success && res.data) {
      setStats(res.data);
      setGates(res.data.gates || []);
    }
  }, [accessCode]);

  useEffect(() => {
    fetchStats();
    cacheTickets();
    // Restore saved gate
    const saved = localStorage.getItem(GATE_KEY(accessCode));
    if (saved) { try { setGate(JSON.parse(saved)); } catch {} }
    else setShowGatePick(true);
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, [fetchStats, cacheTickets]);

  // ── QR Scanner ────────────────────────────────────────────────────────────

  const startScanner = useCallback(async (facing: "environment" | "user") => {
    try {
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      }
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: facing },
        { fps: 12, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
        async (decoded: string) => {
          if (isScanningRef.current) return;
          isScanningRef.current = true;
          await handleScan(decoded);
          setTimeout(() => { isScanningRef.current = false; }, 2000);
        },
        () => {}
      );
      setScannerReady(true); setCameraError(null);
    } catch (e: any) {
      setCameraError("Camera unavailable. Use manual entry below.");
    }
  }, []);

  useEffect(() => {
    startScanner(facingMode);
    return () => {
      scannerRef.current?.isScanning && scannerRef.current.stop().catch(() => {});
    };
  }, []);

  const switchCamera = async () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    await startScanner(next);
  };

  // ── Core scan handler ─────────────────────────────────────────────────────

  const handleScan = async (token: string) => {
    if (clearTimer.current) clearTimeout(clearTimer.current);

    let result: ScanResponse;

    if (!isOnline) {
      result = validateOffline(token);
      if (result.result === "VALID") {
        pushQueue({ qr_token: token, gate_id: gate?.id || "default", scanned_at: new Date().toISOString() });
      }
    } else {
      const res = await api.post<ScanResponse>("/checkin/scan/", {
        qr_token: token,
        session_access_code: accessCode,
        gate_id: gate?.id,
      });
      result = res.success && res.data
        ? res.data
        : { result: "INVALID", message: res.error || "Scan failed" };
    }

    setScanResult(result);
    playTone(result.result);
    vibrate(result.result);
    clearTimer.current = setTimeout(() => setScanResult(null), 4000);
    if (isOnline) fetchStats();
  };

  const supervisorOverride = async (ticketId: string, reason: string) => {
    const res = await api.post<ScanResponse>("/checkin/override/", {
      ticket_id: ticketId, reason, session_access_code: accessCode, gate_id: gate?.id,
    });
    if (res.success && res.data) {
      setScanResult(res.data);
      playTone(res.data.result);
      vibrate(res.data.result);
      clearTimer.current = setTimeout(() => setScanResult(null), 5000);
      fetchStats();
    }
  };

  const handleManual = () => {
    if (!manualInput.trim()) return;
    handleScan(manualInput.trim());
    setManualInput("");
  };

  const selectGate = (g: Gate) => {
    setGate(g);
    localStorage.setItem(GATE_KEY(accessCode), JSON.stringify(g));
    setShowGatePick(false);
  };

  const fillPct = stats && stats.total_sold > 0
    ? Math.round(stats.total_checked_in / stats.total_sold * 100) : 0;

  return (
    <div className="h-screen bg-black flex flex-col select-none overflow-hidden">
      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 py-2.5 bg-black/80 backdrop-blur-sm border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          {isOnline
            ? <Wifi className="w-3.5 h-3.5 text-green-400 shrink-0" />
            : <WifiOff className="w-3.5 h-3.5 text-yellow-400 shrink-0" />}
          <span className="text-white font-bold font-mono text-sm tabular-nums">
            {stats ? `${stats.total_checked_in} / ${stats.total_sold}` : "—"}
          </span>
          <span className="text-white/40 text-xs">{fillPct}%</span>
          {queueCount > 0 && (
            <button onClick={syncQueue}
              className="flex items-center gap-1 text-yellow-400 text-xs ml-1 animate-pulse">
              <Upload className="w-3 h-3" />{queueCount}
            </button>
          )}
        </div>

        <button onClick={() => setShowGatePick(true)}
          className="flex items-center gap-1.5 text-white/70 text-xs font-medium hover:text-white transition-colors">
          <DoorOpen className="w-3.5 h-3.5" />
          {gate?.name || "Select gate"}
          <ChevronDown className="w-3 h-3" />
        </button>

        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowStats(s => !s)} className="p-1.5 text-white/50 hover:text-white">
            <BarChart2 className="w-4 h-4" />
          </button>
          <button onClick={() => setShowSupervisor(s => !s)} className="p-1.5 text-white/50 hover:text-white">
            <ShieldCheck className="w-4 h-4" />
          </button>
          <button onClick={switchCamera} className="p-1.5 text-white/50 hover:text-white">
            <SwitchCamera className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Camera */}
      <div className="flex-1 relative bg-black overflow-hidden">
        <div id="qr-reader" className="w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover [&>div]:hidden" />

        {/* Corner brackets overlay */}
        {scannerReady && !scanResult && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-64 h-64">
              {/* Dark vignette */}
              <div className="absolute inset-[-9999px] bg-black/40" />
              {/* Corners */}
              {(["tl","tr","bl","br"] as const).map(c => (
                <div key={c} className={cn("absolute w-10 h-10 border-primary border-[3px]",
                  c[0] === "t" ? "top-0" : "bottom-0",
                  c[1] === "l" ? "left-0" : "right-0",
                  c === "tl" && "border-r-0 border-b-0 rounded-tl-sm",
                  c === "tr" && "border-l-0 border-b-0 rounded-tr-sm",
                  c === "bl" && "border-r-0 border-t-0 rounded-bl-sm",
                  c === "br" && "border-l-0 border-t-0 rounded-br-sm",
                )} />
              ))}
              {/* Animated scan line */}
              <motion.div className="absolute left-2 right-2 h-0.5 bg-primary/70 shadow-[0_0_8px_2px_rgba(245,158,11,0.5)]"
                animate={{ top: ["8px", "248px", "8px"] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }} />
            </div>
          </div>
        )}

        {/* Camera error */}
        {cameraError && !scanResult && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 px-8">
            <Camera className="w-14 h-14 text-white/20 mb-4" />
            <p className="text-white/50 text-sm text-center">{cameraError}</p>
          </div>
        )}

        {/* Offline banner */}
        {!isOnline && !scanResult && (
          <div className="absolute top-0 left-0 right-0 flex items-center justify-center gap-2 py-2 bg-yellow-500/90 text-black text-xs font-semibold">
            <WifiOff className="w-3.5 h-3.5" /> OFFLINE MODE — scans queued
            {lastSync && <span className="opacity-60">· synced {new Date(lastSync).toLocaleTimeString()}</span>}
          </div>
        )}

        {/* Result overlay */}
        <AnimatePresence>
          {scanResult && <ResultOverlay scan={scanResult} onDismiss={() => setScanResult(null)} />}
        </AnimatePresence>
      </div>

      {/* Bottom controls */}
      <div className="relative z-10 bg-black/90 backdrop-blur-sm border-t border-white/10 px-4 py-3">
        <div className="flex gap-2">
          <input value={manualInput} onChange={e => setManualInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleManual()}
            placeholder="Enter ticket ID or QR token…"
            className="flex-1 bg-white/10 text-white placeholder-white/30 rounded-xl px-4 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 border border-white/10" />
          <button onClick={handleManual}
            className="px-5 h-11 bg-primary text-background rounded-xl text-sm font-bold hover:opacity-90 active:scale-95 transition-transform">
            Scan
          </button>
        </div>
        {lastSync && (
          <p className="text-white/20 text-xs text-center mt-2">
            Last sync: {new Date(lastSync).toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {showGatePick && (
          <GatePicker gates={gates} current={gate} onSelect={selectGate} />
        )}
        {showStats && (
          <StatsDrawer stats={stats} gate={gate} onClose={() => setShowStats(false)} />
        )}
        {showSupervisor && (
          <SupervisorPanel
            onOverride={supervisorOverride}
            onClose={() => setShowSupervisor(false)} />
        )}
      </AnimatePresence>

      {/* Stats + supervisor backdrop */}
      {(showStats || showSupervisor) && (
        <div className="fixed inset-0 z-40 bg-black/50"
          onClick={() => { setShowStats(false); setShowSupervisor(false); }} />
      )}
    </div>
  );
}
