/**
 * Clerk webhook receiver.
 *
 * Currently handles a single event: user.created. When a user signs
 * up via an invitation that carried publicMetadata.invitedOrgId, we
 * find the pending Membership row keyed `pending_<inviteId>`,
 * delete it, and create the real Membership against the new user's
 * actual Clerk id.
 *
 * Signature verification: svix Webhook.verify(rawBody, headers)
 * against CLERK_WEBHOOK_SECRET. Required — without it anyone who
 * can reach the public route can inject Memberships. If the secret
 * is missing or verification fails we reject the request before
 * touching the database.
 *
 * Route is in the middleware's public-route list so Clerk's servers
 * can post here without auth headers.
 */
import { Webhook } from "svix";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { Prisma, Role } from "@/lib/generated/prisma/client";

export const runtime = "nodejs";

type ClerkUserCreatedEvent = {
  type: "user.created";
  data: {
    id: string;
    email_addresses?: Array<{
      email_address: string;
      verification?: unknown;
    }>;
    public_metadata?: {
      invitedOrgId?: string;
      invitedRole?: string;
    };
  };
};

type ClerkWebhookPayload =
  | ClerkUserCreatedEvent
  | { type: string; data: Record<string, unknown> };

function normalizeRole(role: string | undefined): Role {
  switch (role) {
    case "owner":
      return "owner" as Role;
    case "manager":
      return "manager" as Role;
    case "rep":
    default:
      return "rep" as Role;
  }
}

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      "[webhooks/clerk] CLERK_WEBHOOK_SECRET is not set — rejecting",
    );
    return Response.json(
      { error: "Server is not configured to receive Clerk webhooks" },
      { status: 500 },
    );
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json(
      { error: "Missing svix signature headers" },
      { status: 400 },
    );
  }

  // svix needs the raw body string for verification. Read once.
  const rawBody = await request.text();
  const wh = new Webhook(secret);
  let payload: ClerkWebhookPayload;
  try {
    payload = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookPayload;
  } catch (err) {
    console.error("[webhooks/clerk] signature verification failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (payload.type !== "user.created") {
    // Ack other events but don't act on them. Logging at info so we
    // can spot unexpected event volume later.
    console.log(`[webhooks/clerk] ignored event type=${payload.type}`);
    return Response.json({ ok: true });
  }

  const data = (payload as ClerkUserCreatedEvent).data;
  const userId = data.id;
  const meta = data.public_metadata ?? {};
  const invitedOrgId = meta.invitedOrgId;
  const invitedRole = meta.invitedRole;

  if (!userId) {
    console.error("[webhooks/clerk] user.created missing data.id");
    return Response.json({ error: "Malformed payload" }, { status: 400 });
  }
  if (!invitedOrgId) {
    // User signed up without an invitation — nothing for us to do.
    // The /onboarding page handles the manual create-a-gym flow.
    console.log(
      `[webhooks/clerk] user.created without invitation, ignoring (user=${userId})`,
    );
    return Response.json({ ok: true });
  }

  // Find the accepted Clerk invitation for this user's email to get
  // the invitation.id — that's what the pending Membership row's
  // userId is keyed on (pending_<inviteId>). publicMetadata can't
  // carry invitation.id because the id only exists post-create.
  const email = data.email_addresses?.[0]?.email_address;
  let inviteId: string | null = null;
  if (email) {
    try {
      const client = await clerkClient();
      const list = await client.invitations.getInvitationList({
        query: email,
        status: "accepted",
        orderBy: "-created_at",
      });
      // The most recent accepted invitation for this email is the
      // one that just got accepted by this signup.
      inviteId = list.data[0]?.id ?? null;
    } catch (err) {
      console.error(
        "[webhooks/clerk] failed to list invitations for pending-row lookup:",
        err,
      );
    }
  }

  // Verify the invited org still exists. If a super admin or owner
  // deleted it between invite-send and accept, fall through without
  // creating a Membership — the user will land on /onboarding and
  // can be manually invited again or set up their own gym.
  const org = await prisma.organization.findUnique({
    where: { id: invitedOrgId },
    select: { id: true },
  });
  if (!org) {
    console.warn(
      `[webhooks/clerk] user=${userId} invited to org=${invitedOrgId} but org no longer exists; skipping membership create`,
    );
    return Response.json({ ok: true });
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (inviteId) {
        await tx.membership.deleteMany({
          where: { userId: `pending_${inviteId}`, orgId: invitedOrgId },
        });
      }
      await tx.membership.upsert({
        where: { userId_orgId: { userId, orgId: invitedOrgId } },
        update: { role: normalizeRole(invitedRole) },
        create: {
          userId,
          orgId: invitedOrgId,
          role: normalizeRole(invitedRole),
        },
      });
    });
    console.log(
      `[webhooks/clerk] activated user=${userId} as ${invitedRole ?? "rep"} in org=${invitedOrgId} (pending=${inviteId ?? "<unknown>"})`,
    );
  } catch (err) {
    // Don't fail the webhook hard — Clerk will retry, and a retry
    // after a transient DB issue should succeed. But log loudly so
    // we can spot persistent failures.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Already a member — treat as success. (e.g. a manual
      // /onboarding pickup beat the webhook to it.)
      console.log(
        `[webhooks/clerk] user=${userId} already had a Membership in org=${invitedOrgId}, no-op`,
      );
      return Response.json({ ok: true });
    }
    console.error(
      `[webhooks/clerk] activation transaction failed for user=${userId}:`,
      err,
    );
    return Response.json(
      { error: "Activation failed; Clerk will retry" },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}
