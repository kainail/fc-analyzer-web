/**
 * Remove a rep from the caller's gym.
 *
 * DELETE /api/reps/<userId>
 *
 * Auth: caller must be authenticated and have a Membership in the
 * same org as the target user with role in (owner, manager). Reps
 * cannot remove other reps.
 *
 * Deletes the target's Membership row. The rep's Upload rows (and
 * their Transcripts / Analyses + R2 objects) stay intact — uploads
 * are scoped by orgId, not by repUserId, so historical work remains
 * accessible to the org's other members after the rep leaves.
 *
 * The owner can't remove themselves through this endpoint — the
 * page-layer "Remove" button isn't rendered for the caller's own
 * row, but this is a server-side belt-and-suspenders check.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ userId: string }> },
) {
  const { userId: callerId } = await auth();
  if (!callerId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const callerMembership = await prisma.membership.findFirst({
    where: { userId: callerId, role: { in: ["owner", "manager"] } },
    select: { orgId: true },
  });
  if (!callerMembership) {
    return Response.json(
      {
        error:
          "Forbidden — must be owner or manager of a gym to remove reps",
      },
      { status: 403 },
    );
  }

  const { userId: targetUserId } = await ctx.params;

  if (callerId === targetUserId) {
    return Response.json(
      { error: "Cannot remove yourself" },
      { status: 400 },
    );
  }

  const deleted = await prisma.membership.deleteMany({
    where: { orgId: callerMembership.orgId, userId: targetUserId },
  });

  if (deleted.count === 0) {
    return Response.json(
      { error: "Membership not found in this gym" },
      { status: 404 },
    );
  }

  console.log(
    `[reps] ${callerId} removed ${targetUserId} from org=${callerMembership.orgId}`,
  );
  return Response.json({ success: true });
}
