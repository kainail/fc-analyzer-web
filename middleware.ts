// Clerk auth + no-membership onboarding gate.
//
// Two-step gate on every request:
//   1. Clerk auth.protect() — redirects unauthenticated users to
//      /sign-in (or 401s API requests). Routes in PUBLIC_ROUTES skip
//      this entirely (Clerk's own pages + the Clerk webhook ingress).
//   2. Membership check — authenticated users who don't have a
//      Postgres Membership row get redirected to /onboarding. The
//      check is short-circuited by a 1-hour HttpOnly cookie
//      (has-membership=1) set by /api/onboarding on success, so
//      we only hit Postgres on the FIRST request after sign-in (or
//      after the cookie expires).
//
// Notes on runtime:
// In Next.js 16, middleware.ts runs on the Node runtime (it's the
// legacy name for proxy.ts and shares its runtime). That means
// Prisma works directly here — no edge-runtime workaround needed.
//
// Routes exempted from the membership check:
//   /onboarding         — that's where we're sending them
//   /sign-in, /sign-up  — already public
//   /api/*              — APIs do their own auth + membership checks
//                         inline; redirecting an API caller to
//                         /onboarding would be useless. The
//                         /api/onboarding route specifically needs
//                         to be reachable WITHOUT a membership.

import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/clerk(.*)",
]);

const skipsMembershipCheck = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboarding(.*)",
  "/api/(.*)",
]);

const ONE_HOUR_S = 60 * 60;

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  // 1. Authenticated?
  await auth.protect();

  // 2. Membership check — only on pages that should be membership-gated.
  if (skipsMembershipCheck(req)) return;

  // Cached: short-circuit on the cookie.
  const cached = req.cookies.get("has-membership")?.value;
  if (cached === "1") return;

  // Cookie missing/expired — hit Postgres once and cache the result.
  const { userId } = await auth();
  if (!userId) return; // already-protected case; defensive guard

  const membership = await prisma.membership
    .findFirst({
      where: { userId },
      select: { id: true },
    })
    .catch((err) => {
      console.error("[middleware] membership lookup failed:", err);
      return null;
    });

  if (membership) {
    // User belongs to an org — set the cache cookie so the next
    // request inside the hour skips this lookup entirely.
    const res = NextResponse.next();
    res.cookies.set("has-membership", "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: ONE_HOUR_S,
    });
    return res;
  }

  // No membership → onboarding.
  const url = req.nextUrl.clone();
  url.pathname = "/onboarding";
  return NextResponse.redirect(url);
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files unless they're
    // referenced from a search param (?next=…).
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run on API and trpc routes.
    "/(api|trpc)(.*)",
  ],
};
