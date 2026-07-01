"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Ticket, Mail, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const nameSchema = z.object({
  first_name: z.string().min(2, "First name required"),
  last_name: z.string().optional(),
});
type NameFormData = z.infer<typeof nameSchema>;

const INPUT = "w-full bg-surface border border-border rounded-sm px-4 h-11 text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all";

// ── Token verify (reads ?token= from URL) ────────────────────────────────────

function TokenVerifier() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const { loginWithMagicToken, updateUser, user } = useAuthStore();
  const [status, setStatus] = useState<"verifying" | "success" | "error" | "needs_name">("verifying");
  const [errMsg, setErrMsg] = useState("");
  
  const { register: registerName, handleSubmit: handleNameSubmit, formState: { errors: nameErrors, isSubmitting: isNameSubmitting } } = useForm<NameFormData>({
    resolver: zodResolver(nameSchema),
  });

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) { setStatus("error"); setErrMsg("No token found in URL."); return; }

    loginWithMagicToken(token).then(result => {
      if (result.success && result.user) {
        if (!result.user.first_name) {
          setStatus("needs_name");
        } else {
          setStatus("success");
          setTimeout(() => router.push(result.user?.role === "ORGANIZER" ? "/dashboard/settings" : "/profile/tickets"), 1500);
        }
      } else {
        setStatus("error");
        setErrMsg(result.error || "Invalid or expired link.");
      }
    });
  }, [searchParams, loginWithMagicToken, router]);

  const onNameSubmit = async (data: NameFormData) => {
    await updateUser({ first_name: data.first_name, last_name: data.last_name });
    router.push(user?.role === "ORGANIZER" ? "/dashboard/settings" : "/profile/tickets");
  };

  return (
    <div className="text-center py-6">
      {status === "verifying" && (
        <>
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
          <p className="font-semibold">Verifying your magic link…</p>
          <p className="text-sm text-muted mt-1">Please wait a moment</p>
        </>
      )}
      {status === "success" && (
        <>
          <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-4" />
          <p className="font-semibold text-success">Signed in successfully!</p>
          <p className="text-sm text-muted mt-1">Redirecting you…</p>
        </>
      )}
      {status === "error" && (
        <>
          <AlertCircle className="w-10 h-10 text-error mx-auto mb-4" />
          <p className="font-semibold text-error">Link invalid or expired</p>
          <p className="text-sm text-muted mt-2 mb-5">{errMsg}</p>
          <Link href="/auth/magic-link">
            <Button variant="outline" className="w-full">Request a new link</Button>
          </Link>
        </>
      )}
      {status === "needs_name" && (
        <div className="text-left">
          <h2 className="font-display text-2xl font-bold mb-2 text-center">Complete your profile</h2>
          <p className="text-muted text-sm mb-6 text-center">What should we call you?</p>
          <form onSubmit={handleNameSubmit(onNameSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">First name</label>
              <input {...registerName("first_name")} type="text" placeholder="Jane" className={INPUT} />
              {nameErrors.first_name && <p className="text-xs text-error mt-1">{nameErrors.first_name.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Last name</label>
              <input {...registerName("last_name")} type="text" placeholder="Doe" className={INPUT} />
            </div>
            <Button type="submit" className="w-full" size="lg" loading={isNameSubmitting}>Continue</Button>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MagicLinkPage() {
  const searchParams_check = typeof window !== "undefined" && new URLSearchParams(window.location.search);
  const hasToken = searchParams_check && searchParams_check.has("token");

  const [email,   setEmail]   = useState("");
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);

  const sendLink = async () => {
    if (!email.includes("@")) { toast.error("Enter a valid email address"); return; }
    setLoading(true);
    const res = await api.post("/auth/magic-link/send/", { email });
    if (res.success) setSent(true);
    else toast.error((res as any).error || "Could not send magic link");
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-surface-2 border border-border rounded-xl p-8">

        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <img src="/logo.png" alt="EliteTicketPass Logo" className="h-16 w-auto object-contain mx-auto" />
          </Link>
          <h1 className="font-display text-2xl font-bold">
            {hasToken ? "Signing you in" : "Magic link login"}
          </h1>
          {!hasToken && <p className="text-muted text-sm mt-1">We'll email you a one-click sign-in link</p>}
        </div>

        {hasToken ? (
          <Suspense fallback={<div className="text-center py-10"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>}>
            <TokenVerifier />
          </Suspense>
        ) : sent ? (
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-success" />
            </div>
            <p className="font-semibold text-lg">Check your inbox</p>
            <p className="text-muted text-sm mt-2 max-w-xs mx-auto">
              We sent a magic link to <span className="text-foreground font-medium">{email}</span>. It expires in 15 minutes.
            </p>
            <button onClick={() => setSent(false)} className="mt-6 text-xs text-muted hover:text-foreground underline">
              Use a different email
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Email address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" className={INPUT}
                onKeyDown={e => e.key === "Enter" && sendLink()} />
            </div>
            <Button className="w-full" size="lg" loading={loading} onClick={sendLink}>
              <Mail className="w-4 h-4" /> Send magic link
            </Button>
          </div>
        )}

        <p className="text-center text-sm text-muted mt-6">
          <Link href="/auth/login" className="text-primary hover:underline">← Back to login</Link>
        </p>
      </motion.div>
    </div>
  );
}
