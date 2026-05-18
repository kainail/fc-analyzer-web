/**
 * Super admin authorization helpers.
 *
 * Super admins are platform-level grants that exist outside any
 * Organization scope. The SuperAdmin Postgres table is the source of
 * truth — there's no Clerk-side claim or session metadata involved.
 *
 * Convention:
 *   - Page server components: call `isSuperAdmin(userId)` and
 *     redirect("/dashboard") on false.
 *   - Route handlers: call `isSuperAdmin(userId)` and return a 403
 *     Response on false, OR catch the throw from
 *     `requireSuperAdmin(userId)`.
 *
 * canDeleteSuperAdmin gates the destructive "remove another super
 * admin" action. Only the irrevocable seed admin (Kai, set via
 * SUPER_ADMIN_SEED_ID env) is allowed — keeps the root-of-trust
 * intact even if every other super admin colluded.
 */
import { prisma } from "@/lib/db";

export async function isSuperAdmin(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  const row = await prisma.superAdmin.findUnique({
    where: { userId },
    select: { id: true },
  });
  return row !== null;
}

export async function requireSuperAdmin(
  userId: string | null | undefined,
): Promise<void> {
  if (!(await isSuperAdmin(userId))) {
    throw new Error("Forbidden: super admin required");
  }
}

/**
 * True only when the requesting user is the irrevocable seed super
 * admin (Kai). Used to gate the "delete another super admin" UI and
 * API. The target user id is accepted for symmetry with future
 * policy (e.g., "can't delete yourself") but isn't checked here —
 * the page layer enforces self-protection by hiding Kai's own
 * remove button.
 */
export function canDeleteSuperAdmin(
  requestingUserId: string | null | undefined,
  _targetUserId: string,
): boolean {
  const seedId = process.env.SUPER_ADMIN_SEED_ID?.trim();
  if (!seedId || !requestingUserId) return false;
  return requestingUserId === seedId;
}
