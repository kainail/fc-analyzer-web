/**
 * Status read endpoint, polled every 3s by the status page.
 *
 * Tenant-scoped: the upload must belong to the caller's organization.
 * Cross-org lookups return 404 (not 403) to avoid leaking which
 * upload_ids exist outside the caller's tenant.
 *
 * Response shape matches the client's status-view.tsx Metadata type
 * (notably `prospect`, not `prospect_name`, to avoid breaking the
 * existing UI consumer).
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

function dateToIso(d: Date | null | undefined): string | undefined {
  return d ? d.toISOString() : undefined;
}

function dateOnly(d: Date): string {
  // consultationDate is stored at UTC midnight; we want YYYY-MM-DD.
  return d.toISOString().slice(0, 10);
}

type ClerkUserMin = {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  emailAddresses: { emailAddress: string }[];
  id: string;
};

function repDisplayName(u: ClerkUserMin): string {
  const first = (u.firstName ?? "").trim();
  const last = (u.lastName ?? "").trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  if (u.username?.trim()) return u.username.trim();
  const email = u.emailAddresses[0]?.emailAddress;
  return email ?? u.id;
}

async function lookupRepName(repUserId: string): Promise<string> {
  try {
    const client = await clerkClient();
    const u = await client.users.getUser(repUserId);
    return repDisplayName({
      firstName: u.firstName,
      lastName: u.lastName,
      username: u.username,
      emailAddresses: u.emailAddresses.map((e) => ({
        emailAddress: e.emailAddress,
      })),
      id: u.id,
    });
  } catch {
    // Clerk lookup is best-effort — if the user has been deleted or
    // the API throws, we surface the raw id so the row is still
    // identifiable rather than 500'ing the whole status read.
    return repUserId;
  }
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ upload_id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { upload_id } = await ctx.params;

  // Pull membership(s) first so we can scope the upload query by orgId.
  // A user may belong to multiple orgs eventually; for now we accept
  // whichever org the upload belongs to as long as the user is in it.
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { orgId: true },
  });
  if (memberships.length === 0) {
    return Response.json(
      { error: "No organization membership found for this user" },
      { status: 403 },
    );
  }

  const upload = await prisma.upload.findFirst({
    where: {
      id: upload_id,
      orgId: { in: memberships.map((m) => m.orgId) },
    },
    include: {
      org: true,
      transcript: { select: { createdAt: true } },
      analysis: {
        select: { analyzedAt: true, jsonParseError: true },
      },
    },
  });

  if (!upload) {
    return Response.json(
      { error: `Upload not found: ${upload_id}` },
      { status: 404 },
    );
  }

  const repName = await lookupRepName(upload.repUserId);

  return Response.json(
    {
      upload_id: upload.id,
      status: upload.status,
      rep: repName,
      gym: upload.org.name,
      prospect: upload.prospectName,
      consultation_date: dateOnly(upload.consultationDate),
      outcome: upload.outcome,
      audio_filename: upload.audioFilename,
      audio_size_bytes: upload.audioSizeBytes,
      uploaded_at: upload.createdAt.toISOString(),
      transcribed_at: dateToIso(upload.transcript?.createdAt),
      analyzed_at: dateToIso(upload.analysis?.analyzedAt ?? null),
      json_parse_error: upload.analysis?.jsonParseError ?? undefined,
      error_message: upload.errorMessage ?? undefined,
      error_at: dateToIso(upload.errorAt),
      chunk_count: upload.chunkCount ?? undefined,
    },
    { status: 200 },
  );
}
