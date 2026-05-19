/**
 * GET /api/notifications
 *
 * Returns the caller's most recent 10 notifications, newest first,
 * joined with the upload's prospect name so the topbar bell can
 * render "Analysis ready — Aisha Brennan" without a second round-
 * trip.
 *
 * Tenant scoping is implicit: Notification.userId is the caller's
 * Clerk id, so we only return rows belonging to them. No org check
 * needed.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const LIMIT = 10;

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: LIMIT,
    include: {
      upload: { select: { prospectName: true } },
    },
  });

  return Response.json({
    rows: rows.map((n) => ({
      id: n.id,
      type: n.type,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
      uploadId: n.uploadId,
      prospectName: n.upload.prospectName,
    })),
  });
}
