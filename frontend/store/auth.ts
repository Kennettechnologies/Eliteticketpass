import { create } from "zustand";
import { api, setAccessToken } from "@/lib/api";

export type UserRole = "SUPER_ADMIN" | "ADMIN" | "ORGANIZER" | "GATE_STAFF" | "BUYER";

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  status: string;
  first_name: string;
  last_name: string;
  display_name: string;
  full_name: string;
  avatar_url: string;
  email_verified: boolean;
  phone_verified: boolean;
  city: string;
  timezone: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { email?: string; phone?: string; password: string; remember_me?: boolean }) => Promise<{ success: boolean; error?: string; user?: User }>;
  loginWithMagicToken: (token: string) => Promise<{ success: boolean; error?: string; user?: User }>;
  loginWithGoogle: (credential: string) => Promise<{ success: boolean; error?: string; user?: User }>;
  loginWithOtp: (phone: string, otp: string) => Promise<{ success: boolean; error?: string; user?: User }>;
  logout: () => Promise<void>;
  forceLogoutAll: () => Promise<{ success: boolean; error?: string }>;
  refresh: () => Promise<boolean>;
  updateUser: (data: Partial<User>) => Promise<void>;
  hydrate: () => Promise<void>;
}

// ── Cookie helpers (role + auth flag — not sensitive, read by middleware) ─────

function setAuthCookies(role: UserRole) {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 30; // 30 days
  document.cookie = `tb_role=${role}; path=/; SameSite=Strict; max-age=${maxAge}`;
  document.cookie = `tb_auth=1; path=/; SameSite=Strict; max-age=${maxAge}`;
}

function clearAuthCookies() {
  if (typeof document === "undefined") return;
  document.cookie = "tb_role=; path=/; max-age=0";
  document.cookie = "tb_auth=; path=/; max-age=0";
}

function applySession(data: { access: string; user: User }) {
  setAccessToken(data.access);
  setAuthCookies(data.user.role);
  return { user: data.user, accessToken: data.access, isAuthenticated: true };
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (credentials) => {
    const res = await api.post<{ access: string; refresh: string; user: User }>("/auth/login/", credentials);
    if (res.success && res.data) {
      set(applySession(res.data));
      return { success: true, user: res.data.user };
    }
    return { success: false, error: res.error || "Login failed." };
  },

  loginWithMagicToken: async (token) => {
    const res = await api.post<{ access: string; refresh: string; user: User }>("/auth/magic-link/verify/", { token });
    if (res.success && res.data) {
      set(applySession(res.data));
      return { success: true, user: res.data.user };
    }
    return { success: false, error: res.error || "Invalid or expired magic link." };
  },

  loginWithGoogle: async (credential) => {
    const res = await api.post<{ access: string; user: User }>("/auth/google/", { credential });
    if (res.success && res.data) {
      set(applySession(res.data));
      return { success: true, user: res.data.user };
    }
    return { success: false, error: res.error || "Google login failed." };
  },

  loginWithOtp: async (phone, otp) => {
    const res = await api.post<{ access: string; user: User }>("/auth/otp/verify/", { phone, otp });
    if (res.success && res.data) {
      set(applySession(res.data));
      return { success: true, user: res.data.user };
    }
    return { success: false, error: res.error || "Invalid OTP." };
  },

  logout: async () => {
    try { await api.post("/auth/logout/", { refresh: "" }); } catch {}
    setAccessToken(null);
    clearAuthCookies();
    set({ user: null, accessToken: null, isAuthenticated: false });
  },

  forceLogoutAll: async () => {
    const res = await api.post("/auth/sessions/revoke-all/", {});
    if (res.success) {
      setAccessToken(null);
      clearAuthCookies();
      set({ user: null, accessToken: null, isAuthenticated: false });
      return { success: true };
    }
    return { success: false, error: res.error || "Failed to revoke sessions." };
  },

  refresh: async () => {
    try {
      const res = await api.post<{ access: string; user: User }>("/auth/token/refresh/");
      if (res.success && res.data?.access) {
        setAccessToken(res.data.access);
        set({ accessToken: res.data.access, isAuthenticated: true });
        const meRes = await api.get<User>("/auth/me/");
        if (meRes.success && meRes.data) {
          setAuthCookies(meRes.data.role);
          set({ user: meRes.data });
        }
        return true;
      }
    } catch {}
    return false;
  },

  updateUser: async (data) => {
    const res = await api.patch<User>("/auth/me/update/", data);
    if (res.success && res.data) {
      setAuthCookies(res.data.role);
      set({ user: res.data });
    }
  },

  hydrate: async () => {
    set({ isLoading: true });
    try {
      const refreshed = await get().refresh();
      if (!refreshed) {
        clearAuthCookies();
        set({ isAuthenticated: false, user: null, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
