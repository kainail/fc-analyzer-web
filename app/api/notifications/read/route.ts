/**
 * POST /api/notifications/read
 *
 * Marks all of the caller's unread Notification rows as read.
 * Idempotent: no-op when nothing is unread. Returns the count of
 * rows that flipped so the client can update the badge optimistically
 * if it ever needs the exact number.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const res = await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });

  return Response.json({ success: true, marked: res.count });
}
