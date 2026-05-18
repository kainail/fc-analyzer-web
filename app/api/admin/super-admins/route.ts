/**
 * Super admin management — list / create.
 *
 * GET (super-admin only): return all SuperAdmin rows.
 *   Used by the management page's table.
 *
 * POST (super-admin only): grant super admin to a user.
 *   body: { userId?: string, email?: string }
 *   Resolves email → Clerk userId if email is provided.
 *   Upserts the SuperAdmin row with addedBy = the requesting user.
 *
 * Any super admin can add another. Removing other super admins is
 * separately gated to the SUPER_ADMIN_SEED_ID account
 * (canDeleteSuperAdmin in lib/super-admin.ts) — see the [userId]
 * DELETE route in this directory.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { isSuperAdmin } from "@/lib/super-admin";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLERK_USER_ID_RE = /^user_[A-Za-z0-9]+$/;

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }
  if (!(await isSuperAdmin(userId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.superAdmin.findMany({
    orderBy: { createdAt: "asc" },
  });
  return Response.json({ rows });
}

export async function POST(request: Request) {
  const { userId: callerId } = await auth();
  if (!callerId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }
  if (!(await isSuperAdmin(callerId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { userId?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  const rawUserId = body.userId?.trim();
  const rawEmail = body.email?.trim().toLowerCase();

  if (!rawUserId && !rawEmail) {
    return Response.json(
      { error: "userId or email is required" },
      { status: 400 },
    );
  }

  let targetUserId: string;
  if (rawUserId) {
    if (!CLERK_USER_ID_RE.test(rawUserId)) {
      return Response.json(
        {
          error:
            "userId must be a Clerk user id (starts with user_ followed by alphanumerics)",
        },
        { status: 400 },
      );
    }
    targetUserId = rawUserId;
  } else {
    if (!EMAIL_RE.test(rawEmail!)) {
      return Response.json(
        { error: "email is not valid" },
        { status: 400 },
      );
    }
    // Resolve email → Clerk userId. Clerk's getUserList accepts an
    // emailAddress[] filter.
    try {
      const client = await clerkClient();
      const res = await client.users.getUserList({
        emailAddress: [rawEmail!],
        limit: 1,
      });
      if (res.data.length === 0) {
        return Response.json(
          {
            error: `No Clerk user with email "${rawEmail}". They need to sign up first before they can be made a super admin.`,
          },
          { status: 404 },
        );
      }
      targetUserId = res.data[0].id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[admin/super-admins] Clerk lookup failed:", err);
      return Response.json(
        { error: `Failed to look up user in Clerk: ${msg}` },
        { status: 500 },
      );
    }
  }

  const row = await prisma.superAdmin.upsert({
    where: { userId: targetUserId },
    update: {}, // no-op: don't change addedBy on re-grant
    create: { userId: targetUserId, addedBy: callerId },
  });

  console.log(
    `[admin/super-admins] ${callerId} granted super admin to ${targetUserId} (row=${row.id})`,
  );

  return Response.json({ success: true, userId: targetUserId });
}
