/**
 * Super admin — remove a single Membership from a gym.
 *
 * DELETE /api/admin/gyms/<slug>/members/<userId>
 *
 * Wipes the (orgId, userId) Membership row only. The user's Upload
 * rows (and their R2 audio / transcripts / analyses) stay intact —
 * they're owned by the org via orgId, not by the rep — so removing
 * the rep keeps their historical work accessible to the org's
 * remaining members.
 *
 * Super-admin only (lib/super-admin.isSuperAdmin).
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { isSuperAdmin } from "@/lib/super-admin";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ slug: string; userId: string }> },
) {
  const { userId: callerId } = await auth();
  if (!callerId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }
  if (!(await isSuperAdmin(callerId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug, userId } = await ctx.params;

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!org) {
    return Response.json({ error: "Gym not found" }, { status: 404 });
  }

  const deleted = await prisma.membership.deleteMany({
    where: { orgId: org.id, userId },
  });

  if (deleted.count === 0) {
    return Response.json(
      { error: "Membership not found for this gym + user" },
      { status: 404 },
    );
  }

  return Response.json({ success: true });
}
