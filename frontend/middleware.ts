import { NextRequest, NextResponse } from "next/server";

// ── Role hierarchy ────────────────────────────────────────────────────────────

type Role = "SUPER_ADMIN" | "ADMIN" | "ORGANIZER" | "GATE_STAFF" | "BUYER";

const ROLE_RANK: Record<Role, number> = {
  SUPER_ADMIN: 5,
  ADMIN:       4,
  ORGANIZER:   3,
  GATE_STAFF:  2,
  BUYER:       1,
};

function hasRole(userRole: string, required: Role[]): boolean {
  const rank = ROLE_RANK[userRole as Role] ?? 0;
  return required.some(r => rank >= ROLE_RANK[r]);
}

// ── Route rules ───────────────────────────────────────────────────────────────

interface RouteRule {
  pattern: RegExp;
  requireAuth: boolean;
  allowedRoles?: Role[];   // undefined = any authenticated user
  redirectIfAuth?: string; // redirect authenticated users away (e.g. login page)
}

const RULES: RouteRule[] = [
  // Auth pages: redirect authenticated users to home
  { pattern: /^\/auth\/(login|register|forgot-password|magic-link)/, requireAuth: false, redirectIfAuth: "/" },

  // Admin: ADMIN or SUPER_ADMIN
  { pattern: /^\/admin/, requireAuth: true, allowedRoles: ["ADMIN", "SUPER_ADMIN"] },

  // Dashboard (organizer tools): ORGANIZER, ADMIN, SUPER_ADMIN
  { pattern: /^\/dashboard/, requireAuth: true, allowedRoles: ["ORGANIZER", "ADMIN", "SUPER_ADMIN"] },

  // Check-in scanner: GATE_STAFF and above
  { pattern: /^\/checkin/, requireAuth: true, allowedRoles: ["GATE_STAFF", "ORGANIZER", "ADMIN", "SUPER_ADMIN"] },

  // Profile: any authenticated user
  { pattern: /^\/profile/, requireAuth: true },

  // Checkout: open to guests (backend supports guest orders)
  // { pattern: /^\/checkout/, requireAuth: true },
];

// ── Middleware ────────────────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAuth = request.cookies.get("tb_auth")?.value === "1";
  const role   = request.cookies.get("tb_role")?.value ?? "";

  for (const rule of RULES) {
    if (!rule.pattern.test(pathname)) continue;

    // Redirect authenticated users away from auth pages
    if (!rule.requireAuth && rule.redirectIfAuth && isAuth) {
      const dest = rule.redirectIfAuth;
      // Role-based post-login landing
      const landing =
        role === "SUPER_ADMIN" || role === "ADMIN" ? "/admin"
        : role === "ORGANIZER" ? "/dashboard"
        : role === "GATE_STAFF" ? "/checkin"
        : dest;
      return NextResponse.redirect(new URL(landing, request.url));
    }

    // Require auth
    if (rule.requireAuth && !isAuth) {
      const url  = request.nextUrl.clone();
      url.pathname = "/auth/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    // Role check
    if (rule.requireAuth && isAuth && rule.allowedRoles && !hasRole(role, rule.allowedRoles)) {
      // Redirect to role-appropriate home
      const fallback =
        role === "ORGANIZER" ? "/dashboard"
        : role === "GATE_STAFF" ? "/checkin"
        : "/";
      return NextResponse.redirect(new URL(fallback, request.url));
    }

    break;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/auth/:path*",
    "/admin/:path*",
    "/dashboard/:path*",
    "/checkin/:path*",
    "/profile/:path*",
  ],
};
