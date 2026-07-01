"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Ticket, Eye, EyeOff, Smartphone, Wand2 } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useGoogleLogin } from "@react-oauth/google";

const schema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
type FormData = z.infer<typeof schema>;

const INPUT = "w-full bg-surface border border-border rounded-sm px-4 h-11 text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all";

function LoginContent() {
  const [mode,       setMode]       = useState<"email" | "phone" | "magic">("email");
  const [showPass,   setShowPass]   = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [phone,      setPhone]      = useState("");
  const [otp,        setOtp]        = useState("");
  const [otpSent,    setOtpSent]    = useState(false);
  const [otpLoad,    setOtpLoad]    = useState(false);
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent,  setMagicSent]  = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const { login, loginWithGoogle } = useAuthStore();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    const result = await login({ email: data.email, password: data.password, remember_me: rememberMe });
    if (result.success) { toast.success("Welcome back!"); router.push(nextPath); }
    else toast.error(result.error || "Login failed. Check your credentials.");
  };

  const sendMagicLink = async () => {
    if (!magicEmail.includes("@")) { toast.error("Enter a valid email"); return; }
    setOtpLoad(true);
    const res = await api.post("/auth/magic-link/send/", { email: magicEmail });
    if (res.success) setMagicSent(true);
    else toast.error((res as any).error || "Could not send magic link");
    setOtpLoad(false);
  };

  const sendOtp = async () => {
    if (!phone) { toast.error("Enter your phone number"); return; }
    setOtpLoad(true);
    const res = await api.post("/auth/otp/send/", { phone });
    if (res.success) { setOtpSent(true); toast.success("OTP sent!"); }
    else toast.error((res as any).error || "Could not send OTP");
    setOtpLoad(false);
  };

  const verifyOtp = async () => {
    if (!otp) return;
    setOtpLoad(true);
    const res = await api.post<{ access: string; refresh: string; user: any }>("/auth/otp/verify/", { phone, otp });
    if (res.success) { toast.success("Welcome!"); router.push(nextPath); }
    else toast.error((res as any).error || "Invalid OTP");
    setOtpLoad(false);
  };

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      const result = await loginWithGoogle(tokenResponse.access_token);
      if (result.success) {
        toast.success("Welcome back!");
        router.push(nextPath);
      } else {
        toast.error(result.error || "Google login failed.");
      }
    },
    onError: () => toast.error("Google login failed.")
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-surface-2 border border-border rounded-xl p-8">

        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <img src="/logo.png" alt="EliteTicketPass Logo" className="h-16 w-auto object-contain mx-auto" />
          </Link>
          <h1 className="font-display text-2xl font-bold">Welcome back</h1>
          <p className="text-muted text-sm mt-1">Sign in to your account</p>
        </div>

        {/* Google OAuth */}
        <button type="button" onClick={() => googleLogin()}
          className="w-full flex items-center justify-center gap-3 h-11 border border-border rounded-sm bg-surface text-sm font-medium hover:bg-surface-2 transition-colors mb-5">
          <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div className="relative mb-5">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center text-xs text-muted"><span className="bg-surface-2 px-3">or</span></div>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-0.5 bg-surface border border-border rounded-lg p-1 mb-5">
          {([
            { key: "email",  label: "Password",   icon: null          },
            { key: "phone",  label: "Phone OTP",  icon: Smartphone    },
            { key: "magic",  label: "Magic link", icon: Wand2         },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setMode(key)}
              className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-sm text-xs font-medium transition-all",
                mode === key ? "bg-primary text-background" : "text-muted hover:text-foreground")}>
              {Icon && <Icon className="w-3 h-3" />}{label}
            </button>
          ))}
        </div>

        {/* Email form */}
        {mode === "email" && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Email address</label>
              <input {...register("email")} type="email" placeholder="you@example.com" className={INPUT} />
              {errors.email && <p className="text-xs text-error mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-sm font-medium">Password</label>
                <Link href="/auth/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
              </div>
              <div className="relative">
                <input {...register("password")} type={showPass ? "text" : "password"} placeholder="••••••••" className={cn(INPUT, "pr-10")} />
                <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-error mt-1">{errors.password.message}</p>}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                className="accent-primary" />
              <span className="text-sm text-muted">Remember me for 30 days</span>
            </label>
            <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Sign In</Button>
          </form>
        )}

        {/* Phone OTP */}
        {mode === "phone" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Phone number</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+2547XXXXXXXX" className={INPUT} disabled={otpSent} />
            </div>
            {!otpSent ? (
              <Button className="w-full" loading={otpLoad} onClick={sendOtp}>Send OTP</Button>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Enter OTP</label>
                  <input value={otp} onChange={e => setOtp(e.target.value)} placeholder="6-digit code" maxLength={6}
                    className={cn(INPUT, "tracking-widest text-center font-mono text-lg")} />
                </div>
                <Button className="w-full" loading={otpLoad} onClick={verifyOtp}>Verify & Sign In</Button>
                <button onClick={() => setOtpSent(false)} className="w-full text-xs text-muted hover:text-foreground text-center">
                  Change number
                </button>
              </>
            )}
          </div>
        )}

        {/* Magic link mode */}
        {mode === "magic" && (
          <div className="space-y-4">
            {magicSent ? (
              <div className="text-center py-4">
                <p className="font-semibold">Check your inbox ✉️</p>
                <p className="text-sm text-muted mt-1">We sent a link to <strong>{magicEmail}</strong>. It expires in 15 min.</p>
                <button onClick={() => setMagicSent(false)} className="mt-4 text-xs text-muted hover:text-foreground underline">Use a different email</button>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Email address</label>
                  <input type="email" value={magicEmail} onChange={e => setMagicEmail(e.target.value)}
                    placeholder="you@example.com" className={INPUT}
                    onKeyDown={e => e.key === "Enter" && sendMagicLink()} />
                </div>
                <Button className="w-full" size="lg" loading={otpLoad} onClick={sendMagicLink}>
                  <Wand2 className="w-4 h-4" /> Send magic link
                </Button>
              </>
            )}
          </div>
        )}

        <p className="text-xs text-muted text-center mt-6 mb-4">
          By signing in you agree to our <Link href="/terms" className="text-primary hover:underline">Terms</Link> and <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
        </p>

        <p className="text-center text-sm text-muted">
          Don't have an account?{" "}
          <Link href="/auth/register" className="text-primary hover:underline font-medium">Sign up</Link>
        </p>
      </motion.div>
    </div>
  );
}

import { Suspense } from "react";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted animate-pulse">Loading login...</div>}>
      <LoginContent />
    </Suspense>
  );
}
