import Link from "next/link";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import StatusView, { type Metadata } from "./status-view";

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
    return repUserId;
  }
}

function notFoundScreen(uploadId: string) {
  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <h1 className="text-xl font-semibold">Upload not found</h1>
      <p className="text-sm">
        No upload with id{" "}
        <span className="font-mono break-all">{uploadId}</span>.
      </p>
      <Link
        href="/"
        className="inline-block px-4 py-3 border rounded-lg text-base"
      >
        Back to upload
      </Link>
    </main>
  );
}

export default async function StatusPage({
  params,
}: {
  params: Promise<{ upload_id: string }>;
}) {
  const { userId } = await auth();
  const { upload_id } = await params;
  if (!userId) return notFoundScreen(upload_id);

  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { orgId: true },
  });
  if (memberships.length === 0) return notFoundScreen(upload_id);

  const upload = await prisma.upload.findFirst({
    where: {
      id: upload_id,
      orgId: { in: memberships.map((m) => m.orgId) },
    },
    include: {
      org: true,
      transcript: { select: { createdAt: true } },
      analysis: { select: { analyzedAt: true, jsonParseError: true } },
    },
  });
  if (!upload) return notFoundScreen(upload_id);

  const repName = await lookupRepName(upload.repUserId);

  const metadata: Metadata = {
    upload_id: upload.id,
    status: upload.status,
    rep: repName,
    gym: upload.org.name,
    prospect: upload.prospectName,
    consultation_date: upload.consultationDate.toISOString().slice(0, 10),
    outcome: upload.outcome,
    audio_filename: upload.audioFilename,
    audio_size_bytes: upload.audioSizeBytes,
    uploaded_at: upload.createdAt.toISOString(),
    transcribed_at: upload.transcript?.createdAt.toISOString(),
    analyzed_at: upload.analysis?.analyzedAt?.toISOString(),
    json_parse_error: upload.analysis?.jsonParseError ?? undefined,
    error_message: upload.errorMessage ?? undefined,
    error_at: upload.errorAt?.toISOString(),
    chunk_count: upload.chunkCount ?? undefined,
  };

  return <StatusView initial={metadata} />;
}
