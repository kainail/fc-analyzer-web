/**
 * POST /api/transcribe-voice
 *
 * Single-shot Whisper transcription for the roleplay voice mode. The
 * client records a short rep response in the browser via MediaRecorder
 * and POSTs it as `multipart/form-data` with an "audio" field. We
 * return { text } so the rep can review-and-confirm before the turn
 * is evaluated.
 *
 * This is intentionally minimal: no chunking, no R2 persistence, no
 * Upload row. A roleplay turn is short by design (a few seconds of
 * speech), well under Whisper's 25 MB limit and the per-call 5 min
 * timeout. Anything longer is a UI bug, not a chunking problem.
 */
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { auth } from "@clerk/nextjs/server";
import { openai, WHISPER_MODEL } from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WHISPER_TIMEOUT_MS = 60 * 1000;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Invalid multipart body: ${msg}` },
      { status: 400 },
    );
  }

  const file = form.get("audio");
  if (!(file instanceof File)) {
    return Response.json(
      { error: "Missing 'audio' file field" },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return Response.json({ error: "Audio file is empty" }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return Response.json(
      { error: "Audio file exceeds 25 MB limit" },
      { status: 413 },
    );
  }

  // OpenAI's SDK wants a real file on disk for audio.transcriptions.
  // Write the blob to a temp file and clean up in finally regardless
  // of outcome.
  const bytes = Buffer.from(await file.arrayBuffer());
  const extFromName = path.extname(file.name).toLowerCase();
  const ext = extFromName || ".webm";
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-voice-"));
  const audioPath = path.join(tmpDir, `recording${ext}`);

  try {
    fs.writeFileSync(audioPath, bytes);

    const controller = new AbortController();
    let aborted = false;
    const timer = setTimeout(() => {
      aborted = true;
      controller.abort();
    }, WHISPER_TIMEOUT_MS);

    try {
      const response = await openai.audio.transcriptions.create(
        {
          model: WHISPER_MODEL,
          file: fs.createReadStream(audioPath),
          response_format: "text",
        },
        { signal: controller.signal },
      );

      // response_format=text returns a plain string, not a JSON object.
      const text = typeof response === "string" ? response : String(response);
      return Response.json({ text: text.trim() }, { status: 200 });
    } catch (err) {
      if (aborted) {
        return Response.json(
          { error: `Whisper exceeded ${WHISPER_TIMEOUT_MS}ms timeout` },
          { status: 504 },
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[transcribe-voice] whisper call failed:", err);
      return Response.json({ error: msg }, { status: 502 });
    } finally {
      clearTimeout(timer);
    }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.error("[transcribe-voice] temp cleanup failed:", cleanupErr);
    }
  }
}
