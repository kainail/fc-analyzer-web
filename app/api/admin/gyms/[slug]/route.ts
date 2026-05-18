/**
 * Super admin — hard delete a gym.
 *
 * DELETE /api/admin/gyms/<slug>
 *
 * Wipes the Organization plus every row that references it
 * (Memberships, Uploads, Transcripts, Analyses) inside a single
 * transaction. The schema's onDelete: Cascade FKs would handle most
 * of the cleanup automatically on the final Organization delete,
 * but we issue explicit deletes per table so the transaction is
 * fully observable in the query log and the order is deterministic
 * if the cascade direction ever changes.
 *
 * TODO: R2 cleanup. Audio recordings, transcript .txt/.json, and
 * analysis .json + coaching.md are all left behind in the R2 bucket
 * after this runs. The keys are predictable
 * (uploads/<slug>/<id>/..., transcripts/<slug>/<id>/...,
 * analyses/<slug>/<id>/...) so a future sweep job can list-and-delete
 * by prefix once we have one. Don't do it inline: the DB delete
 * needs to be fast and atomic, the R2 calls would balloon latency
 * and aren't transactional with the DB anyway.
 *
 * Super admin only.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { isSuperAdmin } from "@/lib/super-admin";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }
  if (!(await isSuperAdmin(userId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug } = await ctx.params;

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!org) {
    return Response.json({ error: "Gym not found" }, { status: 404 });
  }

  try {
    await prisma.$transaction([
      prisma.analysis.deleteMany({ where: { orgId: org.id } }),
      prisma.transcript.deleteMany({ where: { orgId: org.id } }),
      prisma.upload.deleteMany({ where: { orgId: org.id } }),
      prisma.membership.deleteMany({ where: { orgId: org.id } }),
      prisma.organization.delete({ where: { id: org.id } }),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[admin] delete gym ${slug} failed:`, err);
    return Response.json(
      { error: `Failed to delete gym: ${msg}` },
      { status: 500 },
    );
  }

  console.warn(
    `[admin] Gym deleted by ${userId}: id=${org.id} slug=${slug} name="${org.name}"`,
  );
  return Response.json({ success: true });
}
