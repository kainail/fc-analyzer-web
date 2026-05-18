/**
 * Seed: initial Organization + owner Membership + platform super admin.
 *
 * Idempotent — re-running the script upserts all three rows by their
 * unique keys (Organization.slug, Membership.[userId, orgId],
 * SuperAdmin.userId) so it's safe to run repeatedly during onboarding
 * / dev resets.
 *
 * Usage:
 *   SEED_USER_ID="user_xxx" npx prisma db seed
 *
 * SEED_USER_ID is the Clerk user id that gets the org's owner
 * Membership row. Copy it from the Clerk dashboard after signing in.
 *
 * SUPER_ADMIN_USER_ID (optional) is the Clerk user id seeded as the
 * platform super admin. Defaults to the hardcoded Kai id below if
 * unset — that's the irrevocable seed admin who keeps the
 * canDeleteSuperAdmin authority defined in lib/super-admin.ts.
 *
 * Direct PrismaClient instantiation (not lib/db.ts) because seed
 * scripts run outside the Next.js runtime where the @/ alias isn't
 * resolved; pulling from the generated client by relative path keeps
 * this file tsx-runnable without extra tsconfig-paths plumbing.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const ORG_NAME = "Osage Beach";
const ORG_SLUG = "osage-beach";

// Kai's Clerk id — the seed super admin who can delete other super
// admins (per canDeleteSuperAdmin / SUPER_ADMIN_SEED_ID). Hardcoded so
// the seed always re-establishes the platform's root of trust even if
// the env var drifts.
const KAI_USER_ID = "user_3Dry3xyWxKVlS1vMseLkOV5Pyoh";

async function main() {
  const userId = process.env.SEED_USER_ID?.trim();
  if (!userId) {
    throw new Error(
      "SEED_USER_ID is not set. Pass the Clerk user id of the owner to seed:\n  SEED_USER_ID=\"user_xxx\" npx prisma db seed",
    );
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — set it in .env.local (loaded automatically) before seeding.",
    );
  }

  // Default to Kai if SUPER_ADMIN_USER_ID isn't set. Allows alternate
  // deployments / dev environments to seed a different super admin
  // without editing this file.
  const superAdminId =
    process.env.SUPER_ADMIN_USER_ID?.trim() || KAI_USER_ID;

  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  try {
    const org = await prisma.organization.upsert({
      where: { slug: ORG_SLUG },
      update: { name: ORG_NAME },
      create: { name: ORG_NAME, slug: ORG_SLUG },
    });
    console.log(`[seed] org: id=${org.id} slug=${org.slug} name="${org.name}"`);

    const membership = await prisma.membership.upsert({
      where: { userId_orgId: { userId, orgId: org.id } },
      update: { role: "owner" },
      create: { userId, orgId: org.id, role: "owner" },
    });
    console.log(
      `[seed] membership: id=${membership.id} user=${membership.userId} role=${membership.role}`,
    );

    // Self-seeded: addedBy points at the same user. This is the only
    // SuperAdmin row that doesn't have a real grantor.
    const superAdmin = await prisma.superAdmin.upsert({
      where: { userId: superAdminId },
      update: {},
      create: { userId: superAdminId, addedBy: superAdminId },
    });
    console.log(
      `[seed] super admin: id=${superAdmin.id} user=${superAdmin.userId}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
