import { Readable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import busboy from "busboy";
import { after } from "next/server";
import {
  generateUniqueUploadId,
  uploadDir,
  isAllowedAudioExtension,
  extensionFromFilename,
  ALLOWED_AUDIO_EXTENSIONS,
} from "@/lib/upload-id";
import { transcribeUpload } from "@/lib/transcribe";

export const runtime = "nodejs";

const MAX_BYTES = 100 * 1024 * 1024;

const ALLOWED_OUTCOMES = new Set<string>([
  "sold-1x",
  "sold-2x",
  "sold-3x",
  "sold-4x",
  "transformation-challenge",
  "not-sold-think-about-it",
  "not-sold-too-expensive",
  "not-sold-decision-maker",
  "not-sold-procrastination",
  "not-sold-not-interested",
  "not-sold-commitment",
]);

const REQUIRED_FIELDS = [
  "rep",
  "gym",
  "prospect",
  "consultation_date",
  "outcome",
] as const;

type Fields = Partial<Record<(typeof REQUIRED_FIELDS)[number], string>>;

export async function POST(request: Request) {
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

  return new Promise<Response>((resolve) => {
    const bb = busboy({
      headers: { "content-type": contentType },
      limits: { fileSize: MAX_BYTES, files: 1 },
    });

    const fields: Fields = {};
    let dir: string | null = null;
    let uploadId: string | null = null;
    let audioFilename: string | null = null;
    let writeStream: fs.WriteStream | null = null;
    let tooLarge = false;
    let extensionInvalid = false;
    let invalidName: string | null = null;
    let writeError: Error | null = null;
    let resolved = false;

    function safeCleanup() {
      if (dir && fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch (cleanupErr) {
          console.error(
            `Failed to clean up partial upload at ${dir}:`,
            cleanupErr,
          );
        }
      }
    }

    function reply(res: Response) {
      if (resolved) return;
      resolved = true;
      resolve(res);
    }

    bb.on("field", (name, value) => {
      if ((REQUIRED_FIELDS as readonly string[]).includes(name)) {
        fields[name as (typeof REQUIRED_FIELDS)[number]] = value;
      }
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

      const missing = REQUIRED_FIELDS.filter(
        (k) => !fields[k]?.trim(),
      );
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

      try {
        uploadId = generateUniqueUploadId({
          consultationDate: fields.consultation_date!,
          rep: fields.rep!,
          outcome: fields.outcome!,
        });
      } catch (err) {
        file.resume();
        const msg = err instanceof Error ? err.message : String(err);
        reply(Response.json({ error: msg }, { status: 500 }));
        return;
      }

      dir = uploadDir(uploadId);
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
        file.resume();
        const msg = err instanceof Error ? err.message : String(err);
        reply(
          Response.json(
            { error: `Failed to create upload directory: ${msg}` },
            { status: 500 },
          ),
        );
        return;
      }

      const ext = extensionFromFilename(filename)!;
      audioFilename = `recording.${ext}`;
      const audioPath = path.join(dir, audioFilename);
      writeStream = fs.createWriteStream(audioPath);

      writeStream.on("error", (err) => {
        writeError = err;
      });

      file.on("limit", () => {
        tooLarge = true;
      });

      file.pipe(writeStream);
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

      if (!uploadId || !dir || !audioFilename || !writeStream) {
        return reply(
          Response.json({ error: "No audio file received" }, { status: 400 }),
        );
      }

      await new Promise<void>((res) => {
        if (writeStream!.closed) res();
        else writeStream!.once("close", () => res());
      });

      if (writeError) {
        safeCleanup();
        return reply(
          Response.json(
            { error: `Failed to write audio: ${writeError.message}` },
            { status: 500 },
          ),
        );
      }

      if (tooLarge) {
        safeCleanup();
        return reply(
          Response.json(
            { error: `Audio file exceeds the 100 MB limit` },
            { status: 413 },
          ),
        );
      }

      const metadata = {
        upload_id: uploadId,
        rep: fields.rep!.trim(),
        gym: fields.gym!.trim(),
        prospect: fields.prospect!.trim(),
        consultation_date: fields.consultation_date!,
        outcome: fields.outcome!,
        audio_filename: audioFilename,
        audio_size_bytes: writeStream.bytesWritten,
        uploaded_at: new Date().toISOString(),
        status: "uploaded" as const,
      };

      try {
        fs.writeFileSync(
          path.join(dir, "metadata.json"),
          JSON.stringify(metadata, null, 2),
        );
      } catch (err) {
        safeCleanup();
        const msg = err instanceof Error ? err.message : String(err);
        return reply(
          Response.json(
            { error: `Failed to write metadata: ${msg}` },
            { status: 500 },
          ),
        );
      }

      // Schedule transcription to run after the response is sent. This
      // uses Next.js's after() so the request lifecycle stays clean and
      // it works the same on Node and (future) serverless deployments.
      // transcribeUpload never throws — the .catch is belt-and-suspenders.
      const finalUploadId = uploadId;
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

      reply(Response.json({ upload_id: uploadId }, { status: 200 }));
    });

    bb.on("error", (err: Error) => {
      safeCleanup();
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
      safeCleanup();
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
