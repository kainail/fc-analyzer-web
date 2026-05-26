/**
 * Super admin — invite a new gym owner.
 *
 * POST /api/admin/invite
 *   body: { email: string }
 *
 * Sends a Clerk invitation with publicMetadata
 * { invitedRole: "owner" }. NO invitedOrgId — the org doesn't
 * exist yet. The invitee accepts the invite, signs up, and lands
 * on /onboarding where they fill in their own gym name + slug
 * via OnboardingForm. /api/onboarding then creates the
 * Organization + the owner Membership in one transaction.
 *
 * Pre-creating the org here was the old design and caused two
 * problems: (1) orphan orgs when invitees never accepted, and
 * (2) the super admin had to invent a slug for the owner instead
 * of letting them pick. Both gone now.
 *
 * Super admin only.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isSuperAdmin } from "@/lib/super-admin";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }
  if (!(await isSuperAdmin(userId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return Response.json(
      { error: "valid email is required" },
      { status: 400 },
    );
  }

  // Invitations land on /sign-up so the invitee is forced through
  // Clerk's hosted signup (password creation) before they reach
  // /onboarding (their post-signup destination configured in Clerk).
  // NEXT_PUBLIC_APP_URL wins when set; otherwise fall back to
  // building the base from forwarded request headers so local dev
  // and Railway both work without extra config.
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (request.url.startsWith("https") ? "https" : "http");
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const dynamicBase = host ? `${proto}://${host}` : "";
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || dynamicBase;
  const redirectUrl = baseUrl ? `${baseUrl}/sign-up` : "/sign-up";

  try {
    const client = await clerkClient();
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: {
        invitedRole: "owner",
      },
      redirectUrl,
      ignoreExisting: true,
    });

    console.log(
      `[admin/invite] ${userId} invited new owner: email=${email} (invitation=${invitation.id})`,
    );
    return Response.json({ success: true, inviteId: invitation.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[admin/invite] Clerk invitation failed for ${email}:`, err);
    return Response.json(
      { error: `Failed to send invitation: ${msg}` },
      { status: 502 },
    );
  }
}

