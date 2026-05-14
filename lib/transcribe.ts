/**
 * Audio transcription via OpenAI Whisper.
 *
 * Whisper API limit: audio files MUST be ≤ 25 MB. Larger files are
 * rejected upfront with a specific error_message; we do NOT call the
 * Whisper API in that case. Chunking support for longer recordings is
 * a planned follow-up.
 *
 * Success-path write order is INTENTIONAL:
 *   1. Write transcript.txt
 *   2. Write transcript.json
 *   3. ONLY THEN update metadata.json with status="transcribed"
 *
 * This guarantees status="transcribed" never appears unless both
 * transcript files are on disk. If step 1 succeeds but step 2 fails,
 * metadata is left at status="error_transcription" with error_message
 * naming the failing step. Partial files stay in place for inspection
 * (no cleanup).
 *
 * This function never throws. All errors are logged via console.error
 * AND recorded in metadata.json. The caller's .catch() in after() is
 * defensive belt-and-suspenders only.
 */
import fs from "node:fs";
import path from "node:path";
import { openai, WHISPER_MODEL } from "@/lib/openai";
import { uploadDir } from "@/lib/upload-id";

const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

// Marker substring used by the status page to detect the size-limit
// error and render a user-friendly message. Keep in sync if the text
// here changes.
export const SIZE_LIMIT_ERROR_MESSAGE =
  "File exceeds Whisper 25MB limit — chunking not yet implemented.";

type Metadata = Record<string, unknown> & {
  upload_id: string;
  status: string;
  audio_filename: string;
  audio_size_bytes: number;
};

function nowIso(): string {
  return new Date().toISOString();
}

function readMetadata(metadataPath: string): Metadata | null {
  try {
    return JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Metadata;
  } catch {
    return null;
  }
}

function writeMetadata(metadataPath: string, metadata: Metadata): void {
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}

function tryWriteErrorMetadata(
  metadataPath: string,
  metadata: Metadata,
  errorMessage: string,
  uploadId: string,
): void {
  metadata.status = "error_transcription";
  metadata.error_message = errorMessage;
  metadata.error_at = nowIso();
  try {
    writeMetadata(metadataPath, metadata);
  } catch (writeErr) {
    console.error(
      `[transcribe] Failed to write error metadata for ${uploadId}:`,
      writeErr,
    );
  }
}

export async function transcribeUpload(uploadId: string): Promise<void> {
  const dir = uploadDir(uploadId);
  const metadataPath = path.join(dir, "metadata.json");

  const metadata = readMetadata(metadataPath);
  if (!metadata) {
    console.error(
      `[transcribe] No metadata.json at ${metadataPath} — aborting transcription for ${uploadId}`,
    );
    return;
  }

  // Pre-flight size check. Oversized files do NOT pass through
  // status="transcribing" — they go uploaded → error_transcription.
  if (metadata.audio_size_bytes > WHISPER_MAX_BYTES) {
    tryWriteErrorMetadata(
      metadataPath,
      metadata,
      SIZE_LIMIT_ERROR_MESSAGE,
      uploadId,
    );
    return;
  }

  // Move status to "transcribing".
  metadata.status = "transcribing";
  try {
    writeMetadata(metadataPath, metadata);
  } catch (writeErr) {
    console.error(
      `[transcribe] Failed to write 'transcribing' status for ${uploadId}:`,
      writeErr,
    );
    return;
  }

  const audioPath = path.join(dir, metadata.audio_filename);
  let failingStep = "whisper call";

  try {
    const response = await openai.audio.transcriptions.create({
      model: WHISPER_MODEL,
      file: fs.createReadStream(audioPath),
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    failingStep = "transcript.txt write";
    fs.writeFileSync(path.join(dir, "transcript.txt"), response.text);

    failingStep = "transcript.json write";
    fs.writeFileSync(
      path.join(dir, "transcript.json"),
      JSON.stringify(response, null, 2),
    );

    failingStep = "metadata final write";
    metadata.status = "transcribed";
    metadata.transcribed_at = nowIso();
    writeMetadata(metadataPath, metadata);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[transcribe] Failed at step "${failingStep}" for ${uploadId}:`,
      err,
    );
    tryWriteErrorMetadata(
      metadataPath,
      metadata,
      `Failed at ${failingStep}: ${message}`,
      uploadId,
    );
  }
}
