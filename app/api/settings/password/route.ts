/**
 * Change the caller's Clerk password.
 *
 * POST /api/settings/password
 *   body: { currentPassword: string, newPassword: string }
 *
 * Two-step against Clerk:
 *   1. users.verifyPassword({ userId, password: currentPassword }) —
 *      throws if the current password is wrong. The wrong-password
 *      case surfaces as Clerk's 422 form_password_incorrect.
 *   2. users.updateUser(userId, { password: newPassword }).
 *
 * The pre-verify is what makes "current password" actually
 * meaningful — updateUser alone would happily change the password
 * with just a session, no proof-of-current-knowledge.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";

export const runtime = "nodejs";

const MIN_PW = 8;

type ClerkError = {
  status?: number;
  errors?: Array<{ code?: string; message?: string; longMessage?: string }>;
};

function describeClerkError(err: unknown): {
  status: number;
  message: string;
} {
  const e = err as ClerkError;
  const status = typeof e?.status === "number" ? e.status : 502;
  // Clerk error responses include an `errors` array; the longMessage
  // is usually the human-readable one. Fall back through.
  const firstError = e?.errors?.[0];
  const message =
    firstError?.longMessage ??
    firstError?.message ??
    (err instanceof Error ? err.message : String(err));
  return { status, message };
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";

  if (!currentPassword) {
    return Response.json(
      { error: "Current password is required." },
      { status: 400 },
    );
  }
  if (!newPassword || newPassword.length < MIN_PW) {
    return Response.json(
      { error: `New password must be at least ${MIN_PW} characters.` },
      { status: 400 },
    );
  }
  if (newPassword === currentPassword) {
    return Response.json(
      { error: "New password must differ from the current password." },
      { status: 400 },
    );
  }

  const client = await clerkClient();

  // Verify current password. Clerk throws on mismatch; we map to a
  // friendly 400 + clear message so the form can highlight the
  // currentPassword field.
  try {
    await client.users.verifyPassword({ userId, password: currentPassword });
  } catch (err) {
    const { status, message } = describeClerkError(err);
    if (
      status === 422 ||
      status === 400 ||
      message.toLowerCase().includes("incorrect")
    ) {
      return Response.json(
        { error: "Current password is incorrect." },
        { status: 400 },
      );
    }
    console.error(
      `[settings/password] verifyPassword failed for ${userId}:`,
      err,
    );
    return Response.json(
      { error: `Failed to verify current password: ${message}` },
      { status: 502 },
    );
  }

  try {
    await client.users.updateUser(userId, { password: newPassword });
  } catch (err) {
    const { message } = describeClerkError(err);
    console.error(
      `[settings/password] updateUser password failed for ${userId}:`,
      err,
    );
    // Clerk may reject the new password under its policy (compromised,
    // too short, etc.) — surface that copy directly.
    return Response.json(
      { error: `Failed to update password: ${message}` },
      { status: 400 },
    );
  }

  return Response.json({ success: true });
}
