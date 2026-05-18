/**
 * One-time cleanup for pancakekojo@gmail.com
 * (Clerk user id: user_3DtkvW3Xfx5HTQmYc2O9d9S536q).
 *
 * History: pancakekojo went through the manual /onboarding form
 * before the invite-vs-form flow was correctly gated, so they
 * ended up as owner of a phantom "Jasper Anytime Fitness" org.
 * Intended state was for them to be a rep at Osage Beach.
 *
 * What this does (idempotent — safe to re-run; no-op once the
 * target state is in place):
 *   1. List the user's current Memberships.
 *   2. For each owner Membership in an org they're the SOLE member
 *      of, hard-delete the org (transactional cascade through
 *      analyses, transcripts, uploads, memberships).
 *   3. For any other Memberships outside Osage Beach, just delete
 *      the Membership row (leave the shared org alone).
 *   4. Upsert a rep Membership in Osage Beach.
 *
 * The userId is hardcoded here — pancakekojo's id was looked up
 * via Clerk in the original run, and now lives in this file so
 * subsequent runs don't depend on a Clerk API call. Other cleanups
 * of this shape should fork this script.
 *
 * Run with:
 *   npx tsx prisma/cleanup-pancakekojo.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const TARGET_USER_ID = "user_3DtkvW3Xfx5HTQmYc2O9d9S536q";
const TARGET_ORG_SLUG = "osage-beach";

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  try {
    const memberships = await prisma.membership.findMany({
      where: { userId: TARGET_USER_ID },
      include: {
        org: {
          include: {
            _count: { select: { memberships: true } },
          },
        },
      },
    });
    console.log(
      `[cleanup] ${TARGET_USER_ID} has ${memberships.length} membership(s)`,
    );
    for (const m of memberships) {
      console.log(
        `  - org=${m.org.slug} role=${m.role} membersInOrg=${m.org._count.memberships}`,
      );
    }

    for (const m of memberships) {
      if (m.org.slug === TARGET_ORG_SLUG) continue;
      const isSoleMember = m.org._count.memberships === 1;
      if (m.role === "owner" && isSoleMember) {
        console.log(
          `[cleanup] deleting phantom org id=${m.org.id} slug=${m.org.slug}`,
        );
        await prisma.$transaction([
          prisma.analysis.deleteMany({ where: { orgId: m.org.id } }),
          prisma.transcript.deleteMany({ where: { orgId: m.org.id } }),
          prisma.upload.deleteMany({ where: { orgId: m.org.id } }),
          prisma.membership.deleteMany({ where: { orgId: m.org.id } }),
          prisma.organization.delete({ where: { id: m.org.id } }),
        ]);
      } else {
        console.log(
          `[cleanup] removing membership from shared org slug=${m.org.slug}`,
        );
        await prisma.membership.delete({ where: { id: m.id } });
      }
    }

    const osage = await prisma.organization.findUnique({
      where: { slug: TARGET_ORG_SLUG },
      select: { id: true, name: true },
    });
    if (!osage) {
      throw new Error(
        `Osage Beach org (slug="${TARGET_ORG_SLUG}") not found — seed it first.`,
      );
    }
    const repMembership = await prisma.membership.upsert({
      where: {
        userId_orgId: { userId: TARGET_USER_ID, orgId: osage.id },
      },
      update: { role: "rep" },
      create: { userId: TARGET_USER_ID, orgId: osage.id, role: "rep" },
    });
    console.log(
      `[cleanup] rep membership: id=${repMembership.id} org=${osage.name} role=${repMembership.role}`,
    );

    console.log(`[cleanup] done`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("[cleanup] failed:", e);
  process.exit(1);
});
