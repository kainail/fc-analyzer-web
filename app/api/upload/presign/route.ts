/**
 * Step 1 of the direct-to-R2 upload flow.
 *
 * Accepts metadata only — no audio bytes pass through Railway. Auth +
 * validation are identical to the legacy /api/upload route. On success
 * the Upload row is created with status="pending_upload" and the
 * browser receives one or two presigned R2 PUT URLs (one for split's
 * part 2). The browser PUTs the audio directly to R2, then calls
 * /api/upload/confirm to flip the row to "uploaded" and schedule
 * transcription.
 *
 * The presigned URLs expire after 15 minutes. If the browser never
 * PUTs / never confirms, the pending_upload row is left as-is — a
 * future cron sweep can reap rows older than ~30 min that never moved
 * past pending_upload.
 */
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { audioKey, presignAudioPut } from "@/lib/r2";
import {
  generateUploadId,
  isAllowedAudioExtension,
  extensionFromFilename,
  ALLOWED_AUDIO_EXTENSIONS,
} from "@/lib/upload-id";
import { ALLOWED_OUTCOMES } from "@/lib/outcomes";
import { RecordingType } from "@/lib/generated/prisma/client";

const RECORDING_TYPES = new Set<RecordingType>([
  "full",
  "qualify_only",
  "close_only",
  "split",
]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 100 * 1024 * 1024;

function repDisplayName(u: {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  emailAddresses: { emailAddress: string }[];
  id: string;
}): string {
  const first = (u.firstName ?? "").trim();
  const last = (u.lastName ?? "").trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  if (u.username?.trim()) return u.username.trim();
  const email = u.emailAddresses[0]?.emailAddress;
  return email ?? u.id;
}

export async function POST(request: Request) {
  // --- Auth + membership ---------------------------------------------------
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const user = await currentUser();
  if (!user) {
    return Response.json({ error: "Clerk user not found" }, { status: 401 });
  }

  const membership = await prisma.membership.findFirst({
    where: { userId },
    include: { org: true },
  });
  if (!membership) {
    return Response.json(
      { error: "No organization membership found for this user" },
      { status: 403 },
    );
  }

  const org = membership.org;
  const repName = repDisplayName({
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    emailAddresses: user.emailAddresses.map((e) => ({
      emailAddress: e.emailAddress,
    })),
    id: user.id,
  });

  // --- Parse + validate JSON body -----------------------------------------
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Invalid JSON body: ${msg}` },
      { status: 400 },
    );
  }

  const prospect =
    typeof body.prospect === "string" ? body.prospect.trim() : "";
  const consultationDate =
    typeof body.consultation_date === "string"
      ? body.consultation_date.trim()
      : "";
  const outcome =
    typeof body.outcome === "string" ? body.outcome.trim() : "";
  const recordingTypeRaw =
    typeof body.recordingType === "string"
      ? body.recordingType.trim()
      : "full";
  const filename =
    typeof body.filename === "string" ? body.filename : "";
  const filesize =
    typeof body.filesize === "number" && Number.isFinite(body.filesize)
      ? body.filesize
      : -1;
  const filenamePart2 =
    typeof body.filename_part2 === "string" ? body.filename_part2 : null;
  const filesizePart2 =
    typeof body.filesize_part2 === "number" &&
    Number.isFinite(body.filesize_part2)
      ? body.filesize_part2
      : null;

  if (!prospect) {
    return Response.json({ error: "prospect is required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(consultationDate)) {
    return Response.json(
      {
        error: `Invalid consultation_date: ${consultationDate} (expected YYYY-MM-DD)`,
      },
      { status: 400 },
    );
  }
  if (!outcome) {
    return Response.json({ error: "outcome is required" }, { status: 400 });
  }
  if (!ALLOWED_OUTCOMES.has(outcome)) {
    return Response.json(
      { error: `Invalid outcome: ${outcome}` },
      { status: 400 },
    );
  }
  if (!RECORDING_TYPES.has(recordingTypeRaw as RecordingType)) {
    return Response.json(
      { error: "Invalid recording type" },
      { status: 400 },
    );
  }
  const recordingType = recordingTypeRaw as RecordingType;

  if (!filename) {
    return Response.json({ error: "filename is required" }, { status: 400 });
  }
  if (!isAllowedAudioExtension(filename)) {
    return Response.json(
      {
        error: `Audio must be one of: ${ALLOWED_AUDIO_EXTENSIONS.join(", ")} (got "${filename}")`,
      },
      { status: 400 },
    );
  }
  if (filesize <= 0) {
    return Response.json({ error: "filesize must be > 0" }, { status: 400 });
  }
  if (filesize > MAX_BYTES) {
    return Response.json(
      { error: "Audio file exceeds the 100 MB limit" },
      { status: 413 },
    );
  }

  if (recordingType === "split") {
    if (!filenamePart2) {
      return Response.json(
        { error: "Split recording requires filename_part2" },
        { status: 400 },
      );
    }
    if (!isAllowedAudioExtension(filenamePart2)) {
      return Response.json(
        {
          error: `Part 2 audio must be one of: ${ALLOWED_AUDIO_EXTENSIONS.join(", ")} (got "${filenamePart2}")`,
        },
        { status: 400 },
      );
    }
    if (filesizePart2 == null || filesizePart2 <= 0) {
      return Response.json(
        { error: "filesize_part2 must be > 0" },
        { status: 400 },
      );
    }
    if (filesizePart2 > MAX_BYTES) {
      return Response.json(
        { error: "Part 2 audio file exceeds the 100 MB limit" },
        { status: 413 },
      );
    }
  }

  // --- Build keys + sign URLs --------------------------------------------
  // Part 1's extension drives both keys per the existing storage
  // convention (`recording.<ext>` + `recording_part2.<ext>`).
  const ext = extensionFromFilename(filename)!;
  const audioFilename = `recording.${ext}`;

  const uploadId = generateUploadId({
    consultationDate,
    rep: repName,
    outcome,
  });
  const r2Key = audioKey(org.slug, uploadId, audioFilename);
  const r2KeyPart2 =
    recordingType === "split"
      ? audioKey(org.slug, uploadId, `recording_part2.${ext}`)
      : null;

  let putUrl: string;
  let putUrlPart2: string | null = null;
  try {
    putUrl = await presignAudioPut(r2Key);
    if (r2KeyPart2) {
      putUrlPart2 = await presignAudioPut(r2KeyPart2);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[presign] R2 presign failed for ${uploadId}:`, err);
    return Response.json(
      { error: `Failed to presign R2 upload: ${msg}` },
      { status: 500 },
    );
  }

  // --- Create the Upload row with status="pending_upload" ----------------
  try {
    await prisma.upload.create({
      data: {
        id: uploadId,
        orgId: org.id,
        repUserId: userId,
        prospectName: prospect,
        consultationDate: new Date(`${consultationDate}T00:00:00Z`),
        outcome,
        recordingType,
        audioR2Key: r2Key,
        audioFilename,
        audioSizeBytes: filesize,
        status: "pending_upload",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[presign] Postgres insert failed for ${uploadId}:`, err);
    return Response.json(
      { error: `Failed to persist upload metadata: ${msg}` },
      { status: 500 },
    );
  }

  return Response.json(
    {
      uploadId,
      putUrl,
      putUrlPart2,
    },
    { status: 200 },
  );
}
