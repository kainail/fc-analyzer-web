/**
 * Onboarding: create an Organization + owner Membership for the
 * authenticated Clerk user.
 *
 * POST /api/onboarding
 *   body: { name: string, slug: string }
 *
 * - 401 if no Clerk session.
 * - 409 with { error: "slug_taken" } if the slug is already in use.
 * - 400 if name / slug are missing or malformed.
 * - 200 with { success: true } on success; also sets a one-hour
 *   has-membership=1 cookie so the middleware-side check short-
 *   circuits without hitting Postgres on the next request.
 *
 * Note: we don't gate on "user already has a membership" here —
 * the existing membership case is handled at the page layer
 * (/onboarding redirects to /dashboard). If a request somehow
 * arrives with an existing membership the unique constraint on
 * Organization.slug or Membership.[userId, orgId] would still
 * keep things consistent, but the page-layer redirect should
 * prevent that from happening in normal use.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";

export const runtime = "nodejs";

const SLUG_RE = /^[a-z0-9-]+$/;
const ONE_HOUR_S = 60 * 60;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let body: { name?: string; slug?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  const name = body.name?.trim();
  const slug = body.slug?.trim();
  if (!name) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  if (!slug) {
    return Response.json({ error: "slug is required" }, { status: 400 });
  }
  if (!SLUG_RE.test(slug)) {
    return Response.json(
      {
        error:
          "slug must contain only lowercase letters, numbers, and hyphens",
      },
      { status: 400 },
    );
  }

  // Pre-check the slug for a clean { error: "slug_taken" } response
  // before falling into the create. The transaction below ALSO catches
  // the unique-constraint violation if two requests race past this
  // check; the pre-check just gives us a friendlier 409 in the common
  // single-request case.
  const existingByslug = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existingByslug) {
    return Response.json({ error: "slug_taken" }, { status: 409 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name, slug },
      });
      await tx.membership.create({
        data: { userId, orgId: org.id, role: "owner" },
      });
    });
  } catch (err) {
    // P2002 = unique constraint violation. The only unique key we
    // can realistically trip is Organization.slug — a race after the
    // pre-check. (Membership.[userId, orgId] can't collide because
    // org.id is fresh.)
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return Response.json({ error: "slug_taken" }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[onboarding] create failed:", err);
    return Response.json(
      { error: `Failed to create organization: ${msg}` },
      { status: 500 },
    );
  }

  // Two cookies on success:
  // - has-membership=1 (HttpOnly, 1h) tells the middleware to skip
  //   its Postgres lookup for the next hour.
  // - show-welcome=1 (session, NOT HttpOnly so the dashboard's
  //   welcome banner can clear it client-side on dismiss).
  const response = new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  response.headers.append(
    "set-cookie",
    `has-membership=1; Path=/; Max-Age=${ONE_HOUR_S}; HttpOnly; SameSite=Lax`,
  );
  response.headers.append(
    "set-cookie",
    `show-welcome=1; Path=/; SameSite=Lax`,
  );
  return response;
}
