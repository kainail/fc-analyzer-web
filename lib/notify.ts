/**
 * In-app + email notification helpers.
 *
 * createNotification writes a Notification row that the topbar bell
 * surfaces to the user. sendEmailNotification is the transactional
 * email half — currently a stub (see below).
 *
 * Both are best-effort: callers should wrap them in try/catch and
 * never let a notification failure break the pipeline that triggered
 * it. The pipeline-side wrappers (lib/analyze.ts) do this already.
 *
 * EMAIL PROVIDER STATUS: Clerk removed their `emails.createEmail`
 * server API in recent SDK versions (the installed @clerk/backend
 * only exposes EmailAddressApi for managing addresses, not for
 * sending transactional messages). Until we wire in Resend / SendGrid
 * / SES, sendEmailNotification logs the message it WOULD have sent
 * to stderr and returns. The in-app notification path still works
 * normally — users just don't get the email until the provider is
 * connected.
 */
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { NotificationType } from "@/lib/generated/prisma/client";

export type { NotificationType };

export async function createNotification(
  userId: string,
  orgId: string,
  uploadId: string,
  type: NotificationType,
): Promise<void> {
  await prisma.notification.create({
    data: { userId, orgId, uploadId, type },
  });
}

/**
 * Fetch the user's primary email + send a "your analysis is ready"
 * style message. Subject line is derived from the upload's
 * prospectName + the notification type.
 *
 * Currently a console.warn stub — see the file header.
 */
export async function sendEmailNotification(
  userId: string,
  uploadId: string,
  type: NotificationType,
): Promise<void> {
  // We need the user's email + the upload's prospect name to build
  // a useful message. Fetch both concurrently.
  const [user, upload] = await Promise.all([
    (async () => {
      try {
        const client = await clerkClient();
        return await client.users.getUser(userId);
      } catch (err) {
        console.error(
          `[notify] Clerk getUser failed for ${userId}:`,
          err,
        );
        return null;
      }
    })(),
    prisma.upload.findUnique({
      where: { id: uploadId },
      select: { prospectName: true },
    }),
  ]);

  if (!user) return;
  const email =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
  if (!email) {
    console.warn(`[notify] no email on user ${userId}; skipping send`);
    return;
  }

  const prospect = upload?.prospectName ?? "your prospect";
  const subject =
    type === "analysis_ready"
      ? `Your analysis is ready — ${prospect}`
      : `Upload failed — ${prospect}`;
  const link = `/analysis/${encodeURIComponent(uploadId)}`;

  // TODO(email): swap this console.warn for a real provider call
  // (Resend's emails.send, SendGrid's mail.send, etc.) once
  // EMAIL_PROVIDER_API_KEY is wired in .env. Keep the signature
  // stable so the call sites in lib/analyze.ts don't change.
  console.warn(
    `[notify] EMAIL-STUB to=${email} subject="${subject}" link=${link} type=${type}`,
  );
}
