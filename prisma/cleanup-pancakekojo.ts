/**
 * One-time cleanup for pancakekojo@gmail.com.
 *
 * They went through the manual /onboarding form before the invite
 * flow was correctly gated, so they ended up as the owner of a
 * phantom "Jasper Anytime Fitness" org. The intended state was for
 * them to be a rep at Osage Beach.
 *
 * What this does (idempotent — safe to re-run):
 *   1. Look up the Clerk user id from email pancakekojo@gmail.com.
 *   2. List their Memberships.
 *   3. For each owner Membership in an org they're the SOLE member
 *      of, hard-delete the org (transactional cascade through
 *      analyses, transcripts, uploads, memberships).
 *   4. Delete any other Memberships they have that aren't in
 *      Osage Beach.
 *   5. Upsert a rep Membership for them in Osage Beach.
 *
 * Run with:
 *   npx tsx prisma/cleanup-pancakekojo.ts
 *
 * Keeps the script in-tree as a record of what happened. Re-running
 * does nothing because the Membership already exists in the desired
 * state.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { createClerkClient } from "@clerk/backend";

const TARGET_EMAIL = "pancakekojo@gmail.com";
const TARGET_ORG_SLUG = "osage-beach";

async function main() {
  // --- Resolve Clerk userId from email ------------------------------------
  const cc = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY!,
  });
  const list = await cc.users.getUserList({
    query: TARGET_EMAIL,
    limit: 5,
  });
  const user = list.data.find((u) =>
    u.emailAddresses.some(
      (e) => e.emailAddress.toLowerCase() === TARGET_EMAIL,
    ),
  );
  if (!user) {
    console.log(`[cleanup] no Clerk user found for ${TARGET_EMAIL} — done`);
    return;
  }
  const userId = user.id;
  console.log(`[cleanup] resolved ${TARGET_EMAIL} -> ${userId}`);

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  try {
    // --- Inspect current state --------------------------------------------
    const memberships = await prisma.membership.findMany({
      where: { userId },
      include: {
        org: {
          include: {
            _count: { select: { memberships: true } },
          },
        },
      },
    });
    console.log(`[cleanup] current memberships: ${memberships.length}`);
    for (const m of memberships) {
      console.log(
        `  - org=${m.org.slug} role=${m.role} membersInOrg=${m.org._count.memberships}`,
      );
    }

    // --- Tear down phantom orgs (sole-owner, not osage-beach) ------------
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
        // Org has other members — don't touch the org, just remove
        // pancakekojo's row from it.
        console.log(
          `[cleanup] removing membership from shared org slug=${m.org.slug}`,
        );
        await prisma.membership.delete({ where: { id: m.id } });
      }
    }

    // --- Upsert rep Membership in Osage Beach ----------------------------
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
      where: { userId_orgId: { userId, orgId: osage.id } },
      update: { role: "rep" },
      create: { userId, orgId: osage.id, role: "rep" },
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
