"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Eye, EyeOff, Smartphone, Wand2 } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useGoogleLogin } from "@react-oauth/google";

const schema = z.object({
  first_name: z.string().min(2, "First name required"),
  last_name: z.string().optional(),
  email: z.string().email("Invalid email"),
  phone: z.string().optional(),
  password: z.string().min(8, "Minimum 8 characters"),
  role: z.enum(["BUYER", "ORGANIZER"]),
});
type FormData = z.infer<typeof schema>;

const nameSchema = z.object({
  first_name: z.string().min(2, "First name required"),
  last_name: z.string().optional(),
});
type NameFormData = z.infer<typeof nameSchema>;

const INPUT = "w-full bg-surface border border-border rounded-sm px-4 h-11 text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all";

function RegisterContent() {
  const [mode, setMode] = useState<"email" | "phone" | "magic">("email");
  const [showPass, setShowPass] = useState(false);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoad, setOtpLoad] = useState(false);
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  
  const [needsName, setNeedsName] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultRole = (searchParams.get("role") as "BUYER" | "ORGANIZER") || "BUYER";
  
  const { login, loginWithGoogle, loginWithOtp, updateUser } = useAuthStore();
  
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: defaultRole },
  });
  
  const { register: registerName, handleSubmit: handleNameSubmit, formState: { errors: nameErrors, isSubmitting: isNameSubmitting } } = useForm<NameFormData>({
    resolver: zodResolver(nameSchema),
  });

  const selectedRole = watch("role");

  const handleAuthSuccess = (user: any) => {
    if (!user.first_name) {
      setNeedsName(true);
    } else {
      router.push(selectedRole === "ORGANIZER" || user.role === "ORGANIZER" ? "/dashboard/settings" : "/profile/tickets");
    }
  };

  const onSubmit = async (data: FormData) => {
    if (!data.phone) delete (data as Partial<FormData>).phone;
    const res = await api.post<{ access: string; user: any }>("/auth/register/", data);
    if (res.success) {
      toast.success("Account created!");
      const loginRes = await login({ email: data.email, password: data.password });
      if (loginRes.success && loginRes.user) {
        handleAuthSuccess(loginRes.user);
      } else {
        router.push("/auth/login");
      }
    } else {
      toast.error(res.error || "Registration failed.");
    }
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
    const result = await loginWithOtp(phone, otp);
    if (result.success && result.user) {
      toast.success("Account verified!");
      handleAuthSuccess(result.user);
    } else {
      toast.error(result.error || "Invalid OTP");
    }
    setOtpLoad(false);
  };

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      const result = await loginWithGoogle(tokenResponse.access_token);
      if (result.success && result.user) {
        toast.success("Account connected!");
        handleAuthSuccess(result.user);
      } else {
        toast.error(result.error || "Google registration failed.");
      }
    },
    onError: () => toast.error("Google registration failed.")
  });
  
  const onNameSubmit = async (data: NameFormData) => {
    await updateUser({ first_name: data.first_name, last_name: data.last_name, role: selectedRole });
    router.push(selectedRole === "ORGANIZER" ? "/dashboard/settings" : "/profile/tickets");
  };

  if (needsName) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-surface-2 border border-border rounded-xl p-8 text-center">
          <h2 className="font-display text-2xl font-bold mb-2">Complete your profile</h2>
          <p className="text-muted text-sm mb-6">What should we call you?</p>
          <form onSubmit={handleNameSubmit(onNameSubmit)} className="space-y-4 text-left">
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
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-surface-2 border border-border rounded-xl p-8">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <img src="/logo.png" alt="EliteTicketPass Logo" className="h-16 w-auto object-contain mx-auto" />
          </Link>
          <h1 className="font-display text-2xl font-bold">Create your account</h1>
          <p className="text-muted text-sm mt-1">Start discovering and selling events</p>
        </div>

        {/* Account type global to all modes */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">I want to</label>
          <div className="grid grid-cols-2 gap-2">
            {(["BUYER", "ORGANIZER"] as const).map(role => (
              <label key={role} className="cursor-pointer">
                <input {...register("role")} type="radio" value={role} className="sr-only" />
                <div className={`p-3 rounded-lg border text-center text-sm font-medium transition-all ${selectedRole === role ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-border/80"}`}>
                  {role === "BUYER" ? "🎟 Buy Tickets" : "🎪 Sell Tickets"}
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Google OAuth */}
        <button type="button" onClick={() => googleLogin()}
          className="w-full flex items-center justify-center gap-3 h-11 border border-border rounded-sm bg-surface text-sm font-medium hover:bg-surface-2 transition-colors mb-5">
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <div className="relative mb-5">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center text-xs text-muted"><span className="bg-surface-2 px-3">or</span></div>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-0.5 bg-surface border border-border rounded-lg p-1 mb-5">
          {([
            { key: "email",  label: "Email",   icon: null          },
            { key: "phone",  label: "Phone OTP",  icon: Smartphone    },
            { key: "magic",  label: "Magic link", icon: Wand2         },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => setMode(key)}
              className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-sm text-xs font-medium transition-all",
                mode === key ? "bg-primary text-background" : "text-muted hover:text-foreground")}>
              {Icon && <Icon className="w-3 h-3" />}{label}
            </button>
          ))}
        </div>

        {/* Email form */}
        {mode === "email" && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">First name</label>
                <input {...register("first_name")} type="text" placeholder="Jane" className={INPUT} />
                {errors.first_name && <p className="text-xs text-error mt-1">{errors.first_name.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Last name</label>
                <input {...register("last_name")} type="text" placeholder="Doe" className={INPUT} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Email address</label>
              <input {...register("email")} type="email" placeholder="you@example.com" className={INPUT} />
              {errors.email && <p className="text-xs text-error mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Password</label>
              <div className="relative">
                <input {...register("password")} type={showPass ? "text" : "password"} placeholder="Min. 8 characters" className={cn(INPUT, "pr-10")} />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-error mt-1">{errors.password.message}</p>}
            </div>

            <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Create Account</Button>
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
              <Button className="w-full" size="lg" loading={otpLoad} onClick={sendOtp}>Send OTP</Button>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Enter OTP</label>
                  <input value={otp} onChange={e => setOtp(e.target.value)} placeholder="6-digit code" maxLength={6}
                    className={cn(INPUT, "tracking-widest text-center font-mono text-lg")} />
                </div>
                <Button className="w-full" size="lg" loading={otpLoad} onClick={verifyOtp}>Verify & Sign Up</Button>
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
                  <Wand2 className="w-4 h-4 mr-2" /> Send magic link
                </Button>
              </>
            )}
          </div>
        )}

        <p className="text-xs text-muted text-center mt-6 mb-4">
          By signing up you agree to our <Link href="/terms" className="text-primary hover:underline">Terms</Link> and <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
        </p>

        <p className="text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-primary hover:underline font-medium">Sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}

import { Suspense } from "react";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted animate-pulse">Loading registration...</div>}>
      <RegisterContent />
    </Suspense>
  );
}
