/**
 * Update the caller's Clerk profile (firstName + lastName).
 *
 * POST /api/settings/profile
 *   body: { firstName: string, lastName: string }
 *
 * Auth required. Empty strings are accepted — Clerk treats them
 * as "clear this field" which is a legitimate intent.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";

export const runtime = "nodejs";

const MAX_LEN = 100;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let body: { firstName?: string; lastName?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  // Trim + length cap. Clerk rejects oversized inputs anyway but we
  // give a friendlier error before the round trip.
  const firstName = (body.firstName ?? "").trim();
  const lastName = (body.lastName ?? "").trim();
  if (firstName.length > MAX_LEN || lastName.length > MAX_LEN) {
    return Response.json(
      { error: `Names must be ${MAX_LEN} characters or fewer.` },
      { status: 400 },
    );
  }

  try {
    const client = await clerkClient();
    await client.users.updateUser(userId, { firstName, lastName });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[settings/profile] Clerk updateUser failed for ${userId}:`,
      err,
    );
    return Response.json(
      { error: `Failed to update profile: ${msg}` },
      { status: 502 },
    );
  }

  return Response.json({ success: true });
}
