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
 * field. The `rep` value submitted by the upload form is intentionally
 * ignored — it's still in the UI as a leftover from the file-based
 * era but doesn't influence persistence.
 */
import { Readable } from "node:stream";
import busboy from "busboy";
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

export const runtime = "nodejs";

const MAX_BYTES = 100 * 1024 * 1024;

const REQUIRED_FIELDS = [
  "prospect",
  "consultation_date",
  "outcome",
] as const;

type Fields = Partial<Record<(typeof REQUIRED_FIELDS)[number], string>>;

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

  // --- Request shape -------------------------------------------------------
  if (!request.body) {
    return Response.json({ error: "No request body" }, { status: 400 });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return Response.json(
      { error: "Content-Type must be multipart/form-data" },
      { status: 400 },
    );
  }

  // --- Multipart parse -----------------------------------------------------
  // We buffer the audio body into memory rather than streaming it to R2
  // because R2's S3 PutObject expects a known-length body and the SDK's
  // multipart upload (Upload from @aws-sdk/lib-storage) adds another dep
  // we don't need at this scale (100 MB cap).
  return new Promise<Response>((resolve) => {
    const bb = busboy({
      headers: { "content-type": contentType },
      limits: { fileSize: MAX_BYTES, files: 1 },
    });

    const fields: Fields = {};
    let uploadId: string | null = null;
    let audioFilename: string | null = null;
    let audioContentType = "application/octet-stream";
    const audioChunks: Buffer[] = [];
    let audioBytes = 0;
    let tooLarge = false;
    let extensionInvalid = false;
    let invalidName: string | null = null;
    let resolved = false;

    function reply(res: Response) {
      if (resolved) return;
      resolved = true;
      resolve(res);
    }

    bb.on("field", (name, value) => {
      if ((REQUIRED_FIELDS as readonly string[]).includes(name)) {
        fields[name as (typeof REQUIRED_FIELDS)[number]] = value;
      }
      // `rep` and `gym` form fields are accepted (no-op) for back-compat
      // with the existing upload-form.tsx — the server doesn't persist
      // them; rep comes from Clerk, gym is implicit in the org.
    });

    bb.on("file", (fieldname, file, info) => {
      if (fieldname !== "audio") {
        file.resume();
        return;
      }

      const filename = info.filename ?? "";

      if (!isAllowedAudioExtension(filename)) {
        extensionInvalid = true;
        invalidName = filename;
        file.resume();
        return;
      }

      const missing = REQUIRED_FIELDS.filter((k) => !fields[k]?.trim());
      if (missing.length > 0) {
        file.resume();
        reply(
          Response.json(
            {
              error: `Form fields must be sent before the audio file. Missing: ${missing.join(", ")}`,
            },
            { status: 400 },
          ),
        );
        return;
      }

      if (!ALLOWED_OUTCOMES.has(fields.outcome!)) {
        file.resume();
        reply(
          Response.json(
            { error: `Invalid outcome: ${fields.outcome}` },
            { status: 400 },
          ),
        );
        return;
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.consultation_date!)) {
        file.resume();
        reply(
          Response.json(
            {
              error: `Invalid consultation_date: ${fields.consultation_date} (expected YYYY-MM-DD)`,
            },
            { status: 400 },
          ),
        );
        return;
      }

      uploadId = generateUploadId({
        consultationDate: fields.consultation_date!,
        rep: repName,
        outcome: fields.outcome!,
      });

      const ext = extensionFromFilename(filename)!;
      audioFilename = `recording.${ext}`;
      audioContentType = info.mimeType || "application/octet-stream";

      file.on("data", (chunk: Buffer) => {
        audioBytes += chunk.length;
        audioChunks.push(chunk);
      });
      file.on("limit", () => {
        tooLarge = true;
      });
    });

    bb.on("close", async () => {
      if (extensionInvalid) {
        return reply(
          Response.json(
            {
              error: `Audio must be one of: ${ALLOWED_AUDIO_EXTENSIONS.join(", ")} (got "${invalidName}")`,
            },
            { status: 400 },
          ),
        );
      }

      if (!uploadId || !audioFilename) {
        return reply(
          Response.json({ error: "No audio file received" }, { status: 400 }),
        );
      }

      if (tooLarge) {
        return reply(
          Response.json(
            { error: `Audio file exceeds the 100 MB limit` },
            { status: 413 },
          ),
        );
      }

      const audioBuffer = Buffer.concat(audioChunks);
      const r2Key = audioKey(org.slug, uploadId, audioFilename);

      // R2 first, DB second. If R2 fails we never create a phantom
      // Upload row pointing at a missing object.
      try {
        await uploadToR2(r2Key, audioBuffer, audioContentType);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[upload] R2 upload failed for ${uploadId}:`, err);
        return reply(
          Response.json(
            { error: `Failed to upload audio to R2: ${msg}` },
            { status: 500 },
          ),
        );
      }

      const finalUploadId = uploadId;
      try {
        await prisma.upload.create({
          data: {
            id: finalUploadId,
            orgId: org.id,
            repUserId: userId,
            prospectName: fields.prospect!.trim(),
            consultationDate: new Date(`${fields.consultation_date}T00:00:00Z`),
            outcome: fields.outcome!,
            audioR2Key: r2Key,
            audioFilename,
            audioSizeBytes: audioBytes,
            status: "uploaded",
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[upload] Postgres insert failed for ${finalUploadId}:`,
          err,
        );
        // Best-effort: the R2 object will be orphaned. A cron cleanup
        // that compares R2 keys against the Upload table can sweep
        // these later — not urgent enough to do inline.
        return reply(
          Response.json(
            { error: `Failed to persist upload metadata: ${msg}` },
            { status: 500 },
          ),
        );
      }

      after(async () => {
        try {
          await transcribeUpload(finalUploadId);
        } catch (err) {
          console.error(
            `[upload] Background transcribe threw for ${finalUploadId}:`,
            err,
          );
        }
      });

      reply(Response.json({ upload_id: finalUploadId }, { status: 200 }));
    });

    bb.on("error", (err: Error) => {
      reply(
        Response.json(
          { error: `Upload parse error: ${err.message}` },
          { status: 400 },
        ),
      );
    });

    const nodeReadable = Readable.fromWeb(
      request.body as unknown as import("node:stream/web").ReadableStream,
    );
    nodeReadable.on("error", (err) => {
      reply(
        Response.json(
          { error: `Request stream error: ${err.message}` },
          { status: 400 },
        ),
      );
    });
    nodeReadable.pipe(bb);
  });
}
