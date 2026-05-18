/**
 * Cancel an outstanding rep invitation.
 *
 * DELETE /api/reps/invite/<inviteId>
 *
 * Two-step:
 *   1. Revoke the Clerk invitation so the email link stops working.
 *   2. Delete the pending Membership row (`pending_<inviteId>`).
 *
 * Both steps are scoped to the caller's org — owner / manager only.
 * The Clerk invitation's publicMetadata.invitedOrgId must match the
 * caller's org, otherwise we 404 (no leaking which invitations
 * exist across orgs).
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
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

  // Verify the invitation belongs to this org before doing anything.
  const client = await clerkClient();
  let invitedOrgId: string | undefined;
  try {
    // Clerk doesn't have a get-by-id helper on InvitationAPI; list
    // and filter. Page size 100 is plenty for the active set in
    // practice, and we're querying by status=pending to keep it small.
    const list = await client.invitations.getInvitationList({
      status: "pending",
      limit: 100,
    });
    const inv = list.data.find((i) => i.id === inviteId);
    invitedOrgId = (inv?.publicMetadata as { invitedOrgId?: string } | null)
      ?.invitedOrgId;
  } catch (err) {
    console.error("[reps/invite cancel] Clerk lookup failed:", err);
  }

  if (!invitedOrgId || invitedOrgId !== membership.orgId) {
    return Response.json(
      { error: "Invitation not found" },
      { status: 404 },
    );
  }

  // Revoke first — if Clerk fails we don't want to leave a live
  // invitation around but the local pending row also gone (would
  // leak the invitation acceptance to a stranger).
  try {
    await client.invitations.revokeInvitation(inviteId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[reps/invite cancel] revoke failed for ${inviteId}:`,
      err,
    );
    return Response.json(
      { error: `Failed to revoke Clerk invitation: ${msg}` },
      { status: 502 },
    );
  }

  await prisma.membership.deleteMany({
    where: {
      userId: `pending_${inviteId}`,
      orgId: membership.orgId,
    },
  });

  console.log(
    `[reps/invite cancel] ${userId} cancelled invitation=${inviteId} org=${membership.orgId}`,
  );
  return Response.json({ success: true });
}
