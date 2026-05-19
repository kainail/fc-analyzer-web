/**
 * Audio upload route — multitenant.
 *
 * Auth: Clerk userId from auth(); 401 if missing. The user must have
 * a Membership row in Postgres for the org they're acting on; 403
 * otherwise. (We don't ask the client which org — we use the only
 * membership the user has. Multi-org membership selection is a
 * future concern.)
 *
 * Storage: audio bytes go to Cloudflare R2 keyed by
 * uploads/<orgSlug>/<uploadId>/<filename>. Metadata lives in the
 * Postgres Upload row. No more SKILL_PATH writes here.
 *
 * Rep name comes from the authenticated Clerk user, not a form
 * field. (The pre-migration `rep` and `gym` form fields are gone
 * from the UI as of the Phase 2 cleanup commit.)
 *
 * Multipart handling: we use the standard Request.formData() API,
 * NOT busboy. The previous busboy-based implementation worked
 * locally but threw "Unexpected end of form" on Railway because
 * the platform's HTTP/2 → backend HTTP/1.1 reverse proxy re-frames
 * the request body in ways that don't survive Readable.fromWeb()
 * piping cleanly. request.formData() is implemented inside the
 * Next.js runtime against the underlying request and works
 * identically across local Node, Railway, Vercel, and Edge.
 *
 * Memory: request.formData() buffers the entire body before
 * resolving. With our 100 MB cap that's bounded; if the cap ever
 * raises significantly we'd want to revisit and stream in chunks
 * via a custom parser.
 */
import { after } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { uploadToR2, audioKey } from "@/lib/r2";
import { transcribeUpload } from "@/lib/transcribe";
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
// Don't try to prerender or cache anything from this route — every
// hit is a multipart upload with side effects.
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

  // --- Content-Type sanity check before we touch the body ----------------
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return Response.json(
      { error: "Content-Type must be multipart/form-data" },
      { status: 400 },
    );
  }

  // --- Parse multipart via the standard Web API ---------------------------
  // request.formData() handles boundary parsing, chunk reassembly, and
  // stream backpressure internally. Failures here surface as a thrown
  // TypeError — we catch and report 400 rather than 500.
  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[upload] formData parse failed:", err);
    return Response.json(
      { error: `Failed to parse multipart body: ${msg}` },
      { status: 400 },
    );
  }

  // --- Field validation ---------------------------------------------------
  const prospect = (form.get("prospect")?.toString() ?? "").trim();
  const consultationDate =
    (form.get("consultation_date")?.toString() ?? "").trim();
  const outcome = (form.get("outcome")?.toString() ?? "").trim();

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

  // --- Recording type + (optional) part 2 file ----------------------------
  const recordingTypeRaw =
    (form.get("recordingType")?.toString() ?? "full").trim();
  if (!RECORDING_TYPES.has(recordingTypeRaw as RecordingType)) {
    return Response.json({ error: "Invalid recording type" }, { status: 400 });
  }
  const recordingType = recordingTypeRaw as RecordingType;

  const audioPart2Field = form.get("audio_part2");
  const audioPart2 =
    audioPart2Field && typeof audioPart2Field !== "string"
      ? (audioPart2Field as File)
      : null;

  if (recordingType === "split" && !audioPart2) {
    return Response.json(
      { error: "Split recording requires two audio files" },
      { status: 400 },
    );
  }

  // --- File validation ----------------------------------------------------
  const audioField = form.get("audio");
  if (!audioField || typeof audioField === "string") {
    return Response.json({ error: "audio file is required" }, { status: 400 });
  }
  // In the Web API spec audioField is a File / Blob. File extends Blob and
  // adds the `name` property we need.
  const audio = audioField as File;
  const audioName = audio.name ?? "";

  if (!isAllowedAudioExtension(audioName)) {
    return Response.json(
      {
        error: `Audio must be one of: ${ALLOWED_AUDIO_EXTENSIONS.join(", ")} (got "${audioName}")`,
      },
      { status: 400 },
    );
  }

  const audioSizeBytes = audio.size;
  if (audioSizeBytes <= 0) {
    return Response.json(
      { error: "audio file is empty" },
      { status: 400 },
    );
  }
  if (audioSizeBytes > MAX_BYTES) {
    return Response.json(
      { error: `Audio file exceeds the 100 MB limit` },
      { status: 413 },
    );
  }

  // Same checks against audioPart2 if a split upload supplied one.
  if (audioPart2) {
    const part2Name = audioPart2.name ?? "";
    if (!isAllowedAudioExtension(part2Name)) {
      return Response.json(
        {
          error: `Part 2 audio must be one of: ${ALLOWED_AUDIO_EXTENSIONS.join(", ")} (got "${part2Name}")`,
        },
        { status: 400 },
      );
    }
    if (audioPart2.size <= 0) {
      return Response.json(
        { error: "Part 2 audio file is empty" },
        { status: 400 },
      );
    }
    if (audioPart2.size > MAX_BYTES) {
      return Response.json(
        { error: `Part 2 audio file exceeds the 100 MB limit` },
        { status: 413 },
      );
    }
  }

  // --- Buffer the bytes and ship to R2 ------------------------------------
  const ext = extensionFromFilename(audioName)!;
  const audioFilename = `recording.${ext}`;
  const audioContentType = audio.type || "application/octet-stream";

  const audioBuffer = Buffer.from(await audio.arrayBuffer());

  // For split uploads, buffer Part 2 alongside Part 1. The Part 2 key
  // reuses Part 1's extension per spec (`recording_part2.<ext>`),
  // even if the uploaded file's actual extension differs — both
  // halves of a consultation should be the same format in practice,
  // and forcing the same suffix keeps storage tidy.
  const audioPart2Buffer = audioPart2
    ? Buffer.from(await audioPart2.arrayBuffer())
    : null;
  const audioPart2ContentType = audioPart2
    ? audioPart2.type || "application/octet-stream"
    : null;

  const uploadId = generateUploadId({
    consultationDate,
    rep: repName,
    outcome,
  });
  const r2Key = audioKey(org.slug, uploadId, audioFilename);
  const r2KeyPart2 = audioPart2
    ? audioKey(org.slug, uploadId, `recording_part2.${ext}`)
    : null;

  // R2 first, DB second. A failed R2 upload never leaves a phantom
  // Upload row pointing at a missing object.
  try {
    await uploadToR2(r2Key, audioBuffer, audioContentType);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[upload] R2 upload failed for ${uploadId}:`, err);
    return Response.json(
      { error: `Failed to upload audio to R2: ${msg}` },
      { status: 500 },
    );
  }

  if (audioPart2Buffer && audioPart2ContentType && r2KeyPart2) {
    try {
      await uploadToR2(
        r2KeyPart2,
        audioPart2Buffer,
        audioPart2ContentType,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[upload] R2 part-2 upload failed for ${uploadId}:`, err);
      // Part 1 is now orphaned in R2; cron sweep cleanup as
      // documented elsewhere. Don't try to compensate inline.
      return Response.json(
        { error: `Failed to upload part 2 audio to R2: ${msg}` },
        { status: 500 },
      );
    }
  }

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
        audioSizeBytes,
        status: "uploaded",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[upload] Postgres insert failed for ${uploadId}:`, err);
    // R2 object is now orphaned; a future cron sweep comparing R2 keys
    // against Upload rows can clean those up.
    return Response.json(
      { error: `Failed to persist upload metadata: ${msg}` },
      { status: 500 },
    );
  }

  after(async () => {
    try {
      await transcribeUpload(uploadId);
    } catch (err) {
      console.error(
        `[upload] Background transcribe threw for ${uploadId}:`,
        err,
      );
    }
  });

  return Response.json({ upload_id: uploadId }, { status: 200 });
}
