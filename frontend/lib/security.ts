/**
 * Frontend security utilities:
 *  - Input sanitization (XSS prevention without external deps)
 *  - 429 / rate-limit response handler
 *  - CSRF token reader
 *  - URL parameter sanitization
 */

// ── XSS / HTML sanitization ───────────────────────────────────────────────────

const DANGEROUS_TAGS  = /<\s*(script|iframe|object|embed|link|meta|base|form)[^>]*>[\s\S]*?<\/\1>/gi;
const DANGEROUS_ATTRS = /\s+on\w+\s*=\s*["'][^"']*["']/gi;
const JAVASCRIPT_HREFS = /href\s*=\s*["']?\s*javascript:/gi;
const DATA_HREFS       = /href\s*=\s*["']?\s*data:/gi;
const HTML_TAG_RE      = /<[^>]+>/g;

/**
 * Strip all HTML tags and dangerous attributes.
 * Safe for inserting into React props / form fields.
 */
export function sanitize(value: string): string {
  if (typeof value !== "string") return String(value ?? "");
  return value
    .replace(DANGEROUS_TAGS, "")
    .replace(DANGEROUS_ATTRS, "")
    .replace(JAVASCRIPT_HREFS, "href=#")
    .replace(DATA_HREFS, "href=#")
    .replace(HTML_TAG_RE, "")
    .trim();
}

/**
 * HTML-encode special characters for safe insertion into HTML contexts.
 * Use when you must render user content as raw text node.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Sanitize all string values in a plain object (shallow).
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result = {} as T;
  for (const key in obj) {
    const val = obj[key];
    (result as Record<string, unknown>)[key] =
      typeof val === "string" ? sanitize(val) : val;
  }
  return result;
}

// ── CSRF token ────────────────────────────────────────────────────────────────

/**
 * Read the CSRF token from the `csrftoken` cookie Django sets.
 * Pass as `X-CSRFToken` header on mutating requests to Django views
 * (not needed for DRF JWT auth endpoints, but useful for session-based views).
 */
export function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

// ── Rate limit / 429 handling ─────────────────────────────────────────────────

export interface RateLimitInfo {
  isLimited: boolean;
  retryAfter: number;   // seconds to wait
  locked: boolean;      // brute-force lockout
  message: string;
}

/**
 * Parse a 429 API response body into a RateLimitInfo object.
 * The backend returns: { error, wait, locked }
 */
export function parseRateLimitError(body: unknown): RateLimitInfo {
  const b = (body ?? {}) as Record<string, unknown>;
  const wait    = typeof b.wait    === "number" ? b.wait    : 60;
  const locked  = typeof b.locked  === "boolean" ? b.locked : false;
  const message = typeof b.error   === "string"  ? b.error
    : locked
      ? `Too many failed attempts. Try again in ${formatWait(wait)}.`
      : `Rate limit reached. Try again in ${formatWait(wait)}.`;
  return { isLimited: true, retryAfter: wait, locked, message };
}

function formatWait(seconds: number): string {
  if (seconds >= 60) return `${Math.ceil(seconds / 60)} minute${Math.ceil(seconds / 60) !== 1 ? "s" : ""}`;
  return `${seconds} second${seconds !== 1 ? "s" : ""}`;
}

// ── URL / redirect safety ─────────────────────────────────────────────────────

/**
 * Ensure a redirect `next` param is a relative path (no open redirect).
 */
export function safeRedirectPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  // Must be a relative path starting with /
  if (/^\/[^/\\]/.test(next) || next === "/") return next;
  return fallback;
}

// ── Password strength ─────────────────────────────────────────────────────────

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Very weak" | "Weak" | "Fair" | "Strong" | "Very strong";
  color: string;
  suggestions: string[];
}

export function checkPasswordStrength(password: string): PasswordStrength {
  const suggestions: string[] = [];
  let score = 0;

  if (password.length >= 8)  score++;
  else suggestions.push("Use at least 8 characters");

  if (password.length >= 12) score++;
  else if (password.length >= 8) suggestions.push("12+ characters is stronger");

  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  else suggestions.push("Mix uppercase and lowercase letters");

  if (/[0-9]/.test(password)) score++;
  else suggestions.push("Add numbers");

  if (/[^A-Za-z0-9]/.test(password)) score++;
  else suggestions.push("Add symbols (!@#$...)");

  const capped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  const labels: PasswordStrength["label"][] = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];
  const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a"];

  return { score: capped, label: labels[capped], color: colors[capped], suggestions };
}
