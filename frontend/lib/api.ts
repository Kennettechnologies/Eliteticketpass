const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  error: string | null;
  meta: {
    count?: number;
    total_pages?: number;
    next?: string | null;
    previous?: string | null;
    page?: number;
    page_size?: number;
  } | null;
}

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/auth/token/refresh/`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return null;
    const data: ApiResponse<{ access: string }> = await res.json();
    if (data.success && data.data?.access) {
      accessToken = data.data.access;
      return accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

function getCsrfCookie(): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<ApiResponse<T>> {
  const method = (options.method ?? "GET").toUpperCase();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  // Include CSRF token for mutating requests (Django CsrfViewMiddleware)
  if (MUTATING_METHODS.has(method)) {
    const csrf = getCsrfCookie();
    if (csrf) headers["X-CSRFToken"] = csrf;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  // 429 — Rate limit / brute-force lockout
  if (res.status === 429) {
    let body: Record<string, unknown> = {};
    try { body = await res.json(); } catch {}
    const retryAfter =
      Number(res.headers.get("Retry-After") ?? body.wait ?? 60);
    return {
      success: false,
      data: null as unknown as T,
      error: (body.error as string) || `Rate limit reached. Try again in ${retryAfter}s.`,
      meta: { rateLimited: true, retryAfter, locked: !!(body.locked) } as any,
    };
  }

  if (res.status === 401 && retry) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const newToken = await refreshPromise;
    if (newToken) {
      return apiFetch<T>(path, options, false);
    }
    // Refresh failed — clear token
    accessToken = null;
  }

  const contentType = res.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return res.json() as Promise<ApiResponse<T>>;
  }

  return {
    success: res.ok,
    data: null as unknown as T,
    error: res.ok ? null : `HTTP ${res.status}`,
    meta: null,
  };
}

export const api = {
  get: <T>(path: string, options?: RequestInit) =>
    apiFetch<T>(path, { method: "GET", ...options }),

  post: <T>(path: string, body?: unknown, options?: RequestInit) =>
    apiFetch<T>(path, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body),
      ...options,
    }),

  patch: <T>(path: string, body?: unknown, options?: RequestInit) =>
    apiFetch<T>(path, {
      method: "PATCH",
      body: body instanceof FormData ? body : JSON.stringify(body),
      ...options,
    }),

  put: <T>(path: string, body?: unknown, options?: RequestInit) =>
    apiFetch<T>(path, {
      method: "PUT",
      body: body instanceof FormData ? body : JSON.stringify(body),
      ...options,
    }),

  delete: <T>(path: string, options?: RequestInit) =>
    apiFetch<T>(path, { method: "DELETE", ...options }),
};
