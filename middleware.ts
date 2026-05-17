// Clerk auth middleware.
//
// Protects every route by default — any path not in the public-route
// list redirects unauthenticated users to /sign-in. Public routes
// are the Clerk sign-in/sign-up flows and the Clerk webhook endpoint
// (webhooks come from Clerk's servers and must skip auth so org/user
// sync events can be ingested).
//
// The matcher exclusion is the standard Next.js pattern: skip the
// static asset paths and the Next.js internal files entirely so we
// don't run auth on every /_next/static request.

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/clerk(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
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
