"use client";

import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Camera, Eye, EyeOff, Download, Trash2, Shield } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth";
import { cn, getInitials } from "@/lib/utils";
import { toast } from "sonner";

const INPUT = "w-full bg-surface border border-border rounded-sm px-4 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted";

const profileSchema = z.object({
  first_name: z.string().min(1, "Required"),
  last_name: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  city: z.string().optional(),
});

const pwSchema = z.object({
  current_password: z.string().min(1, "Required"),
  new_password: z.string().min(8, "Min 8 characters"),
  confirm: z.string(),
}).refine(d => d.new_password === d.confirm, { message: "Passwords don't match", path: ["confirm"] });

type ProfileForm = z.infer<typeof profileSchema>;
type PwForm = z.infer<typeof pwSchema>;

export default function ProfileSettingsPage() {
  const { user, updateUser, logout } = useAuthStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { first_name: "", last_name: "", email: "", phone: "", city: "" },
  });

  useEffect(() => {
    if (user) reset({ first_name: user.first_name || "", last_name: user.last_name || "", email: user.email || "", phone: user.phone || "", city: user.city || "" });
  }, [user, reset]);

  const { register: rPw, handleSubmit: hsPw, reset: rePw, formState: { errors: ePw, isSubmitting: pwSub } } = useForm<PwForm>({
    resolver: zodResolver(pwSchema),
  });

  const onSave = async (data: ProfileForm) => {
    await updateUser(data);
    toast.success("Profile updated!");
  };

  const onAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("avatar", file);
    const res = await api.patch<any>("/auth/me/avatar/", fd);
    if (res.success) { await updateUser({}); toast.success("Photo updated!"); }
    else toast.error("Upload failed");
  };

  const onPw = async (data: PwForm) => {
    const res = await api.post("/auth/change-password/", { current_password: data.current_password, new_password: data.new_password });
    if (res.success) { rePw(); toast.success("Password changed!"); }
    else toast.error((res as any).error || "Incorrect current password");
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res: any = await api.post("/auth/gdpr/export/");
      // The backend returns the raw JSON payload instead of a standard ApiResponse wrapper
      if (res && res.profile) {
        const blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "eliteticketpass-data-export.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Your data export has been downloaded!");
      } else {
        toast.error("Failed to generate data export.");
      }
    } catch (e) {
      toast.error("Failed to generate data export.");
    }
    setExporting(false);
  };

  const handleDeleteAccount = async () => {
    const res = await api.post("/auth/me/delete/");
    if (res.success) { 
      toast.success("Account deleted successfully.");
      await logout(); 
    }
    else toast.error("Could not delete account. Contact support.");
  };

  const initials = getInitials(`${user?.first_name ?? ""} ${user?.last_name ?? ""}`);

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-bold">Profile Settings</h1>

      {/* Avatar */}
      <section className="bg-surface-2 border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-4">Profile Photo</h2>
        <div className="flex items-center gap-5">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center text-xl font-bold text-primary overflow-hidden">
              {user?.avatar_url
                ? <img src={user.avatar_url} alt="" className="w-20 h-20 object-cover" />
                : initials}
            </div>
            <button onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-background flex items-center justify-center hover:bg-primary/90 transition-colors">
              <Camera className="w-3.5 h-3.5" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onAvatar} />
          </div>
          <div>
            <p className="font-medium text-sm">{user?.full_name || user?.display_name}</p>
            <p className="text-xs text-muted mt-0.5">JPG, PNG or WebP · Max 2 MB</p>
          </div>
        </div>
      </section>

      {/* Personal info */}
      <section className="bg-surface-2 border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-5">Personal Information</h2>
        <form onSubmit={handleSubmit(onSave)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">First name</label>
              <input {...register("first_name")} className={INPUT} />
              {errors.first_name && <p className="text-xs text-error mt-1">{errors.first_name.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Last name</label>
              <input {...register("last_name")} className={INPUT} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Email address</label>
            <input {...register("email")} type="email" className={INPUT} />
            {user?.email_verified
              ? <p className="text-xs text-success mt-1 flex items-center gap-1"><Shield className="w-3 h-3" />Verified</p>
              : <p className="text-xs text-warning mt-1">Email not verified</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Phone number</label>
            <input {...register("phone")} placeholder="+2547XXXXXXXX" className={INPUT} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">City</label>
            <input {...register("city")} placeholder="Nairobi" className={INPUT} />
          </div>
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save Changes</Button>
        </form>
      </section>

      {/* Change password */}
      <section className="bg-surface-2 border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-5">Change Password</h2>
        <form onSubmit={hsPw(onPw)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Current password</label>
            <div className="relative">
              <input {...rPw("current_password")} type={showCur ? "text" : "password"} className={cn(INPUT, "pr-10")} />
              <button type="button" onClick={() => setShowCur(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
                {showCur ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {ePw.current_password && <p className="text-xs text-error mt-1">{ePw.current_password.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">New password</label>
            <div className="relative">
              <input {...rPw("new_password")} type={showNew ? "text" : "password"} className={cn(INPUT, "pr-10")} />
              <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {ePw.new_password && <p className="text-xs text-error mt-1">{ePw.new_password.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Confirm new password</label>
            <input {...rPw("confirm")} type="password" className={INPUT} />
            {ePw.confirm && <p className="text-xs text-error mt-1">{ePw.confirm.message}</p>}
          </div>
          <Button type="submit" variant="outline" loading={pwSub}>Update Password</Button>
        </form>
      </section>

      {/* Data & privacy */}
      <section className="bg-surface-2 border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-1">Data & Privacy</h2>
        <p className="text-sm text-muted mb-5">Download a copy of all your data or permanently delete your account.</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" loading={exporting} onClick={handleExport}>
            <Download className="w-4 h-4" /> Export My Data (GDPR)
          </Button>
          {!deleteConfirm ? (
            <Button variant="outline" className="border-error/40 text-error hover:bg-error/5" onClick={() => setDeleteConfirm(true)}>
              <Trash2 className="w-4 h-4" /> Delete Account
            </Button>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-error/30 bg-error/5 w-full">
              <p className="text-sm text-error flex-1">This is permanent and cannot be undone. All your data will be deleted.</p>
              <Button size="sm" className="bg-error hover:bg-error/90 text-white shrink-0" onClick={handleDeleteAccount}>Confirm Delete</Button>
              <button onClick={() => setDeleteConfirm(false)} className="text-xs text-muted hover:text-foreground shrink-0">Cancel</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
