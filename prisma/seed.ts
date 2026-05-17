/**
 * Seed: initial Organization + owner Membership.
 *
 * Idempotent — re-running the script upserts both rows by their
 * unique keys (Organization.slug, Membership.[userId, orgId]) so
 * it's safe to run repeatedly during onboarding / dev resets.
 *
 * Usage:
 *   SEED_USER_ID="user_xxx" npx prisma db seed
 *
 * SEED_USER_ID is the Clerk user id of whoever should own the org —
 * you can copy it from the Clerk dashboard after signing in once.
 *
 * Direct PrismaClient instantiation (not lib/db.ts) because seed
 * scripts run outside the Next.js runtime where the @/ alias isn't
 * resolved; pulling from the generated client by relative path keeps
 * this file ts-node-runnable without extra tsconfig-paths plumbing.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const ORG_NAME = "Osage Beach";
const ORG_SLUG = "osage-beach";

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
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
