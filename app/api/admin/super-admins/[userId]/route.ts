/**
 * Super admin management — remove.
 *
 * DELETE /api/admin/super-admins/<userId>
 *
 * Only the SUPER_ADMIN_SEED_ID account (Kai) can remove other super
 * admins. This is enforced via canDeleteSuperAdmin in
 * lib/super-admin.ts so the gate logic lives next to the rest of the
 * super-admin auth.
 *
 * You cannot remove yourself even if you ARE the seed admin —
 * removing the seed account would leave the platform without any
 * irrevocable-trust root, which defeats the whole point of having
 * one. The page layer hides the self-row's button; this route
 * double-checks server-side.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { canDeleteSuperAdmin, isSuperAdmin } from "@/lib/super-admin";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ userId: string }> },
) {
  const { userId: callerId } = await auth();
  if (!callerId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }
  if (!(await isSuperAdmin(callerId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId: targetUserId } = await ctx.params;

  if (callerId === targetUserId) {
    return Response.json(
      { error: "Cannot remove yourself as super admin" },
      { status: 400 },
    );
  }

  if (!canDeleteSuperAdmin(callerId, targetUserId)) {
    return Response.json(
      {
        error:
          "Only the seed super admin (SUPER_ADMIN_SEED_ID) can remove other super admins",
      },
      { status: 403 },
    );
  }

  const deleted = await prisma.superAdmin.deleteMany({
    where: { userId: targetUserId },
  });
  if (deleted.count === 0) {
    return Response.json(
      { error: "Super admin not found" },
      { status: 404 },
    );
  }

  console.warn(
    `[admin/super-admins] ${callerId} removed super admin ${targetUserId}`,
  );
  return Response.json({ success: true });
}
