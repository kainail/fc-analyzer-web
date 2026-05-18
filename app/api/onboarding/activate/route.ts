/**
 * Activate an invited user's Membership.
 *
 * POST /api/onboarding/activate (no body)
 *
 * Used by the /onboarding/rep welcome screen's "Go to dashboard"
 * button to create the rep's Membership row from their Clerk
 * publicMetadata.
 *
 * In practice this route is rep-only:
 *   - Owners now go through /api/onboarding (the gym creation form
 *     creates the Organization AND the owner Membership in one
 *     transaction; super-admin invites no longer pre-create orgs).
 *   - Reps land here because their invite carries an existing
 *     invitedOrgId pointing at the inviter's gym.
 *
 * The route still validates `invitedRole` strictly (owner | manager
 * | rep) so an owner who somehow ends up here doesn't get silently
 * mis-roled, and so manager invites would Just Work if we ever add
 * that flow.
 *
 * The old org-existence pre-check is gone. The Organization is now
 * guaranteed to exist (rep invites pull invitedOrgId straight from
 * the inviter's Membership row), so the extra round-trip is wasted
 * work — the FK constraint on Membership.orgId catches any
 * inconsistency at write time.
 */
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { Prisma, Role } from "@/lib/generated/prisma/client";

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

  try {
    await prisma.membership.upsert({
      where: { userId_orgId: { userId, orgId: invitedOrgId } },
      update: { role },
      create: { userId, orgId: invitedOrgId, role },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2003"
    ) {
      // FK violation on Membership.orgId — the invited org was
      // deleted between invite-send and accept. The /onboarding/rep
      // page already redirects in that case, so this is a defense-
      // in-depth path; the response code is the relevant signal.
      return Response.json(
        {
          error: "org_not_found",
          message:
            "The gym you were invited to no longer exists. Contact the person who invited you, or create a new gym at /onboarding.",
        },
        { status: 404 },
      );
    }
    throw err;
  }

  console.log(
    `[onboarding/activate] activated user=${userId} as role=${role} in org=${invitedOrgId}`,
  );

  const response = new Response(
    JSON.stringify({ success: true, role, orgId: invitedOrgId }),
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
