/**
 * Activate an invited user's Membership.
 *
 * POST /api/onboarding/activate (no body)
 *
 * Reads the authenticated user's Clerk publicMetadata
 * (`invitedOrgId`, `invitedRole`) and creates the corresponding
 * Membership row. Sets the `has-membership=1` cookie so the
 * middleware's per-request DB check stays cached.
 *
 * Why this is a separate endpoint from /api/onboarding (which
 * creates a brand-new gym from form input): the previous flow read
 * publicMetadata inside the /onboarding server component itself,
 * mixing a read-only page render with an unconditional write side
 * effect. Worse, the page-level code defaulted to `role: "owner"`
 * whenever `invitedRole` wasn't literally the string "rep" — which
 * meant any flicker in metadata copy-through, or any case where
 * `invitedRole` was missing, silently promoted the invitee to gym
 * owner.
 *
 * Behavior here:
 *   - Caller must be authenticated (Clerk).
 *   - Caller's currentUser().publicMetadata MUST have both
 *     `invitedOrgId` and `invitedRole`. Either missing → 400.
 *   - `invitedRole` is strictly normalized: only "owner", "manager",
 *     or "rep" are accepted; anything else returns 400 rather than
 *     defaulting to a role the inviter didn't intend.
 *   - The invited org must still exist → 404 otherwise (super
 *     admin or owner may have deleted it between invite-send and
 *     accept; user can re-invite or set up a new gym).
 *   - Membership upsert by (userId, orgId) — re-runs are idempotent.
 */
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { Role } from "@/lib/generated/prisma/client";

export const runtime = "nodejs";

const ONE_HOUR_S = 60 * 60;

function parseRole(raw: unknown): Role | null {
  if (raw === "owner") return "owner" as Role;
  if (raw === "manager") return "manager" as Role;
  if (raw === "rep") return "rep" as Role;
  return null;
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const user = await currentUser();
  if (!user) {
    return Response.json({ error: "Clerk user not found" }, { status: 401 });
  }

  const meta = (user.publicMetadata ?? {}) as {
    invitedOrgId?: unknown;
    invitedRole?: unknown;
  };
  const invitedOrgId =
    typeof meta.invitedOrgId === "string" ? meta.invitedOrgId.trim() : "";
  const role = parseRole(meta.invitedRole);

  if (!invitedOrgId) {
    return Response.json(
      {
        error: "no_invite",
        message:
          "No invitedOrgId in publicMetadata — go to /onboarding to create a new gym instead.",
      },
      { status: 400 },
    );
  }
  if (!role) {
    return Response.json(
      {
        error: "invalid_role",
        message: `invitedRole must be one of: owner, manager, rep. Got: ${JSON.stringify(meta.invitedRole)}`,
      },
      { status: 400 },
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: invitedOrgId },
    select: { id: true, slug: true },
  });
  if (!org) {
    return Response.json(
      {
        error: "org_not_found",
        message:
          "The gym you were invited to no longer exists. Contact the person who invited you, or create a new gym at /onboarding.",
      },
      { status: 404 },
    );
  }

  await prisma.membership.upsert({
    where: { userId_orgId: { userId, orgId: org.id } },
    update: { role },
    create: { userId, orgId: org.id, role },
  });

  console.log(
    `[onboarding/activate] activated user=${userId} as role=${role} in org=${org.slug}`,
  );

  const response = new Response(
    JSON.stringify({ success: true, role, orgSlug: org.slug }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
  response.headers.append(
    "set-cookie",
    `has-membership=1; Path=/; Max-Age=${ONE_HOUR_S}; HttpOnly; SameSite=Lax`,
  );
  return response;
}
