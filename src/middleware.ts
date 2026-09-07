import { NextResponse, type NextRequest } from "next/server";

import { config as env } from "@/lib/env";

/**
 * Optional password gate.
 *
 * Off by default: with DASHBOARD_PASSWORD unset this middleware does nothing,
 * which is the configuration chosen for this deployment (a private URL that is
 * never shared).
 *
 * Set DASHBOARD_PASSWORD in Vercel and the dashboard plus every mutating route
 * immediately requires HTTP Basic auth. Basic auth is used deliberately: the
 * browser renders the prompt natively, it works identically on iOS and
 * Android, and it needs no login page, session store or cookie handling.
 *
 * The publish callback is exempt — it authenticates with its own shared secret
 * and is called by GitHub Actions, which cannot answer a Basic auth challenge.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/api/generate",
  "/api/approve",
  "/api/reject",
  "/api/videos",
];

export function middleware(request: NextRequest) {
  const password = env.dashboardPassword;
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (!PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      // Any username is accepted; only the password is checked.
      const supplied = decoded.slice(decoded.indexOf(":") + 1);
      if (supplied === password) return NextResponse.next();
    } catch {
      /* malformed header falls through to the challenge */
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Spiritual Content Engine"' },
  });
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
