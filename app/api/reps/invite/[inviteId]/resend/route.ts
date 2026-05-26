/**
 * Resend an outstanding rep invitation.
 *
 * POST /api/reps/invite/<inviteId>/resend
 *
 * Clerk doesn't have a "resend" primitive — invitations.create with
 * ignoreExisting: true returns the existing pending row without
 * actually firing another email. To get a fresh email out, we:
 *   1. Look up the existing invitation (for email + publicMetadata).
 *   2. Revoke it.
 *   3. Create a new invitation with the same email + metadata.
 *   4. Rekey the pending Membership row from
 *      `pending_<old>` → `pending_<new>` so the UI's invite list
 *      stays in sync.
 *
 * Owner / manager only, scoped to the caller's org via the
 * publicMetadata.invitedOrgId check.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ inviteId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const membership = await prisma.membership.findFirst({
    where: { userId, role: { in: ["owner", "manager"] } },
    select: { orgId: true },
  });
  if (!membership) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { inviteId } = await ctx.params;
  const client = await clerkClient();

  // Find the existing invitation so we can grab the email + metadata.
  const list = await client.invitations.getInvitationList({
    status: "pending",
    limit: 100,
  });
  const existing = list.data.find((i) => i.id === inviteId);
  if (!existing) {
    return Response.json(
      { error: "Invitation not found or already accepted/revoked" },
      { status: 404 },
    );
  }
  const meta =
    (existing.publicMetadata as { invitedOrgId?: string } | null) ?? {};
  if (meta.invitedOrgId !== membership.orgId) {
    return Response.json(
      { error: "Invitation not found" },
      { status: 404 },
    );
  }

  // Redirect URL — same construction as the invite route. Lands on
  // /sign-up so the invitee must set a password before /onboarding.
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (request.url.startsWith("https") ? "https" : "http");
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const dynamicBase = host ? `${proto}://${host}` : "";
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || dynamicBase;
  const redirectUrl = baseUrl ? `${baseUrl}/sign-up` : "/sign-up";

  // Revoke first so the new invitation's create doesn't collide on
  // a unique-email constraint (Clerk rejects two pending invitations
  // to the same email).
  try {
    await client.invitations.revokeInvitation(inviteId);
  } catch (err) {
    console.error(
      `[reps/invite resend] revoke failed for ${inviteId}:`,
      err,
    );
    return Response.json(
      { error: "Failed to revoke prior invitation" },
      { status: 502 },
    );
  }

  let newInviteId: string;
  try {
    const fresh = await client.invitations.createInvitation({
      emailAddress: existing.emailAddress,
      publicMetadata: existing.publicMetadata ?? {},
      redirectUrl,
      ignoreExisting: true,
    });
    newInviteId = fresh.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reps/invite resend] recreate failed:", err);
    // Pending membership row's userId still references the OLD
    // invitation id at this point — clean it up so the UI doesn't
    // show a phantom invite that points at nothing.
    await prisma.membership.deleteMany({
      where: {
        userId: `pending_${inviteId}`,
        orgId: membership.orgId,
      },
    });
    return Response.json(
      { error: `Failed to resend invitation: ${msg}` },
      { status: 502 },
    );
  }

  // Re-key the pending row. We can't UPDATE the userId because it's
  // part of the primary unique key (userId, orgId) — delete + create
  // inside a transaction.
  await prisma.$transaction([
    prisma.membership.deleteMany({
      where: {
        userId: `pending_${inviteId}`,
        orgId: membership.orgId,
      },
    }),
    prisma.membership.create({
      data: {
        userId: `pending_${newInviteId}`,
        orgId: membership.orgId,
        role: "rep",
      },
    }),
  ]);

  console.log(
    `[reps/invite resend] ${userId} resent invitation org=${membership.orgId} old=${inviteId} new=${newInviteId}`,
  );
  return Response.json({ success: true, inviteId: newInviteId });
}
