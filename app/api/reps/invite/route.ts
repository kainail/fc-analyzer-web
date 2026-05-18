/**
 * Invite a rep to the caller's gym.
 *
 * POST /api/reps/invite
 *   body: { email: string, name?: string }
 *
 * Auth: Clerk user must have a Membership in some Organization with
 * role in (owner, manager). Reps cannot invite. Super admins go
 * through /admin/invite for the gym-owner flow — this endpoint
 * always lands the invitee as role="rep" in the caller's org.
 *
 * Flow:
 *   1. Send Clerk invitation with publicMetadata { invitedOrgId,
 *      invitedRole: "rep" }. Clerk emails the link.
 *   2. Create a "pending" Membership row with userId =
 *      `pending_<invitation.id>` and role=rep so the rep-management
 *      page can list outstanding invites without a separate table.
 *      The Clerk webhook on user.created (Step 2) deletes this row
 *      and inserts the real Membership with the new user's actual id.
 *
 * Return: { success: true, inviteId } where inviteId is the Clerk
 * invitation id — used by the cancel endpoint to revoke + delete
 * the pending row.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  // Membership lookup. The caller must have an owner or manager role
  // in SOME org — we use the first one we find as the target org.
  const membership = await prisma.membership.findFirst({
    where: { userId, role: { in: ["owner", "manager"] } },
    include: { org: true },
  });
  if (!membership) {
    return Response.json(
      {
        error:
          "Forbidden — must be owner or manager of a gym to invite reps",
      },
      { status: 403 },
    );
  }

  let body: { email?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return Response.json(
      { error: "valid email is required" },
      { status: 400 },
    );
  }

  // Redirect URL — Clerk needs an absolute URL. Same pattern as the
  // super-admin invite route: prefer the x-forwarded-* headers so
  // this works behind Railway's proxy AND in local dev.
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (request.url.startsWith("https") ? "https" : "http");
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const redirectUrl = host
    ? `${proto}://${host}/onboarding`
    : "/onboarding";

  let invitationId: string;
  try {
    const client = await clerkClient();
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: {
        invitedOrgId: membership.orgId,
        invitedRole: "rep",
      },
      redirectUrl,
      // ignoreExisting so re-inviting the same email after a typo or
      // expired link just succeeds.
      ignoreExisting: true,
    });
    invitationId = invitation.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[reps/invite] Clerk invitation failed for org=${membership.orgId} email=${email}:`,
      err,
    );
    return Response.json(
      { error: `Failed to send invitation: ${msg}` },
      { status: 502 },
    );
  }

  // Pending Membership row. userId is a synthetic key with the
  // pending_ prefix that the rep-management page filters on. The
  // webhook (Step 2) deletes this row when the real user signs up.
  // upsert on the @unique(userId, orgId) constraint in case
  // ignoreExisting on the Clerk side returned the same invitation.id
  // twice across racing requests.
  const pendingUserId = `pending_${invitationId}`;
  try {
    await prisma.membership.upsert({
      where: {
        userId_orgId: { userId: pendingUserId, orgId: membership.orgId },
      },
      update: {},
      create: {
        userId: pendingUserId,
        orgId: membership.orgId,
        role: "rep",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[reps/invite] Pending membership upsert failed for ${pendingUserId}:`,
      err,
    );
    // Clerk side succeeded — the invitation email is already out. Surface
    // the DB error but the operator can still see / cancel the invite
    // by listing Clerk invitations.
    return Response.json(
      {
        error: `Invitation sent but pending row write failed: ${msg}. The rep can still accept; cancel from Clerk dashboard if needed.`,
      },
      { status: 500 },
    );
  }

  console.log(
    `[reps/invite] ${userId} invited ${email} as rep to org=${membership.orgId} (invitation=${invitationId})`,
  );
  return Response.json({ success: true, inviteId: invitationId });
}
