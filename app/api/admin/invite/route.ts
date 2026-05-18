/**
 * Super admin — invite a new gym owner.
 *
 * POST /api/admin/invite
 *   body: { email: string, name: string, slug: string }
 *
 * Two-step flow:
 *   1. Create the Organization row with the chosen slug. The slug
 *      uniqueness check happens here (409 if taken) — the
 *      Organization is the durable record of the gym, even if the
 *      invitee never accepts.
 *   2. Send a Clerk invitation to `email` with publicMetadata
 *      carrying { invitedOrgId, invitedRole: "owner" }. Clerk emails
 *      the recipient a sign-up link. When they accept and complete
 *      sign-up, Clerk copies the metadata onto the new User object.
 *      The /onboarding page reads it and auto-creates the owner
 *      Membership for the pre-existing Organization.
 *
 * Failure mode: if step 2 fails after step 1 succeeded, the
 * Organization sits orphaned (no members). The super admin can
 * delete it from /admin and re-invite. We don't roll back step 1
 * automatically because partial-rollback of Clerk side effects gets
 * messy, and the visible org with no members is easier to recover
 * from than a stuck-in-transaction state.
 *
 * Super admin only.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { isSuperAdmin } from "@/lib/super-admin";
import { Prisma } from "@/lib/generated/prisma/client";

export const runtime = "nodejs";

const SLUG_RE = /^[a-z0-9-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }
  if (!(await isSuperAdmin(userId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { email?: string; name?: string; slug?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  const email = body.email?.trim().toLowerCase();
  const name = body.name?.trim();
  const slug = body.slug?.trim();

  if (!email || !EMAIL_RE.test(email)) {
    return Response.json(
      { error: "valid email is required" },
      { status: 400 },
    );
  }
  if (!name) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  if (!slug || !SLUG_RE.test(slug)) {
    return Response.json(
      {
        error:
          "slug must contain only lowercase letters, numbers, and hyphens",
      },
      { status: 400 },
    );
  }

  // Step 1: create the Organization.
  let orgId: string;
  try {
    const org = await prisma.organization.create({
      data: { name, slug },
    });
    orgId = org.id;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return Response.json({ error: "slug_taken" }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/invite] org create failed:", err);
    return Response.json(
      { error: `Failed to create organization: ${msg}` },
      { status: 500 },
    );
  }

  // Build the post-signup redirect URL. Clerk wants an absolute URL.
  // Prefer X-Forwarded-Host / Host so this works in both local dev
  // and Railway (which sits behind a proxy).
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (request.url.startsWith("https") ? "https" : "http");
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const redirectUrl = host
    ? `${proto}://${host}/onboarding`
    : "/onboarding";

  // Step 2: Clerk invitation.
  try {
    const client = await clerkClient();
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      // Metadata is copied onto the resulting User object when the
      // invitee accepts. /onboarding reads it.
      publicMetadata: {
        invitedOrgId: orgId,
        invitedRole: "owner",
      },
      redirectUrl,
      // ignoreExisting: invitations to the same email can be re-sent
      // — useful when re-inviting after a typo or expired link.
      ignoreExisting: true,
    });

    console.log(
      `[admin/invite] invited ${email} to org=${orgId} (invitation=${invitation.id})`,
    );
    return Response.json({ success: true, inviteId: invitation.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[admin/invite] Clerk invitation failed for org=${orgId} email=${email}:`,
      err,
    );
    // Org row left in place — super admin can delete or re-invite
    // from /admin. See file header for the partial-rollback rationale.
    return Response.json(
      {
        error: `Organization created but invitation send failed: ${msg}. Re-invite from /admin.`,
      },
      { status: 502 },
    );
  }
}
