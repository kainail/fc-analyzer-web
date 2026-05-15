/**
 * Audio transcription via OpenAI Whisper.
 *
 * Whisper API limit: audio files MUST be ≤ 25 MB. Files at or under
 * the limit go through a single transcription call. Files above the
 * limit are split into duration-based chunks by lib/audio-chunker.ts
 * (re-encoded to mono 16kHz 64kbps MP3), each chunk is transcribed
 * serially, and the chunk responses are stitched back into a single
 * transcript.txt + transcript.json. Chunk files live under
 * <uploadDir>/chunks/ and are deleted on success; on failure they are
 * left in place for inspection.
 *
 * ffmpeg must be on PATH for the chunked path. Missing ffmpeg
 * surfaces as status="error_transcription" with a clear error_message.
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
 * Statuses produced here:
 *   uploaded → chunking (large files only) → transcribing → transcribed
 *                                                         → error_transcription
 *
 * This function never throws. Every code path is wrapped in a single
 * top-level try/catch that always logs to console.error AND attempts
 * to write status="error_transcription" + error_message + error_at
 * to metadata.json so failures are never silent. If metadata.json
 * itself can't be read, a minimal error record is written in its
 * place. The caller's .catch() in after() is belt-and-suspenders.
 *
 * What try/catch CAN'T catch: process termination (dev server HMR
 * reloads, OOM, kill -9). If the Next.js dev server restarts while a
 * transcription is in-flight, the after() callback dies mid-await
 * and the status stays at "transcribing" with no final write — no
 * JS error fires. In dev, avoid editing source files while uploads
 * are processing; in production, the process is stable.
 */
import fs from "node:fs";
import path from "node:path";
import { after } from "next/server";
import type { TranscriptionVerbose } from "openai/resources/audio/transcriptions";
import { openai, WHISPER_MODEL } from "@/lib/openai";
import { uploadDir } from "@/lib/upload-id";
import { analyzeUpload } from "@/lib/analyze";
import { FFMPEG_MISSING_ERROR_MESSAGE } from "@/lib/transcribe-constants";
import {
  chunkAudio,
  probeFfmpeg,
  type AudioChunk,
} from "@/lib/audio-chunker";

const WHISPER_MAX_BYTES = 25 * 1024 * 1024;
const WHISPER_TIMEOUT_MS = 5 * 60 * 1000;

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

// Fallback for when metadata.json was unreadable at start of run.
// Writes a minimal error record so the status page surfaces the
// failure instead of staying stuck on a stale status.
function tryWriteMinimalErrorMetadata(
  metadataPath: string,
  uploadId: string,
  errorMessage: string,
): void {
  try {
    fs.writeFileSync(
      metadataPath,
      JSON.stringify(
        {
          upload_id: uploadId,
          status: "error_transcription",
          error_message: errorMessage,
          error_at: nowIso(),
        },
        null,
        2,
      ),
    );
  } catch (writeErr) {
    console.error(
      `[transcribe] Failed to write minimal error metadata for ${uploadId}:`,
      writeErr,
    );
  }
}

function describeError(err: unknown): {
  name: string;
  message: string;
  stack?: string;
} {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { name: typeof err, message: String(err) };
}

// Stitch chunk responses into one verbose_json. Segment ids are
// renumbered globally; start/end/seek are offset by each chunk's
// position in the original timeline. text is concatenated with a
// single space (Whisper output is trimmed).
function stitchTranscripts(
  chunkResponses: Array<{ chunk: AudioChunk; response: TranscriptionVerbose }>,
): TranscriptionVerbose {
  const allSegments: NonNullable<TranscriptionVerbose["segments"]> = [];
  const textParts: string[] = [];
  let totalDuration = 0;
  let nextId = 0;
  let language = "";

  for (const { chunk, response } of chunkResponses) {
    if (!language && response.language) language = response.language;
    textParts.push(response.text);
    totalDuration += response.duration ?? chunk.durationSec;

    for (const seg of response.segments ?? []) {
      allSegments.push({
        ...seg,
        id: nextId++,
        start: seg.start + chunk.startSec,
        end: seg.end + chunk.startSec,
        seek: seg.seek + chunk.startSec,
      });
    }
  }

  return {
    text: textParts.join(" ").trim(),
    language,
    duration: totalDuration,
    segments: allSegments,
  };
}

function removeChunksDir(chunksDir: string, uploadId: string): void {
  try {
    if (fs.existsSync(chunksDir)) {
      fs.rmSync(chunksDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(
      `[transcribe] Failed to clean up chunks dir for ${uploadId}:`,
      err,
    );
  }
}

async function transcribeFile(
  audioPath: string,
): Promise<TranscriptionVerbose> {
  // AbortController enforces a hard total cap on the Whisper call,
  // including retries — unlike RequestOptions.timeout which applies
  // per-attempt and would allow ~3x the configured time across the
  // SDK's default retry chain. An aborted call surfaces as a clear
  // timeout error rather than hanging indefinitely.
  const controller = new AbortController();
  let aborted = false;
  const timer = setTimeout(() => {
    aborted = true;
    controller.abort();
  }, WHISPER_TIMEOUT_MS);
  try {
    return await openai.audio.transcriptions.create(
      {
        model: WHISPER_MODEL,
        file: fs.createReadStream(audioPath),
        response_format: "verbose_json",
        timestamp_granularities: ["segment"],
      },
      { signal: controller.signal },
    );
  } catch (err) {
    if (aborted) {
      throw new Error(
        `Whisper API call exceeded ${WHISPER_TIMEOUT_MS}ms timeout`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function transcribeUpload(uploadId: string): Promise<void> {
  const dir = uploadDir(uploadId);
  const metadataPath = path.join(dir, "metadata.json");
  const chunksDir = path.join(dir, "chunks");

  let metadata: Metadata | null = null;
  let failingStep = "read metadata";

  console.log(`[transcribe] ${uploadId}: starting`);

  try {
    metadata = readMetadata(metadataPath);
    if (!metadata) {
      const msg = `metadata.json unreadable at ${metadataPath}`;
      console.error(`[transcribe] ${uploadId}: ${msg} — writing minimal error record`);
      tryWriteMinimalErrorMetadata(metadataPath, uploadId, msg);
      return;
    }

    const audioPath = path.join(dir, metadata.audio_filename);
    const needsChunking = metadata.audio_size_bytes > WHISPER_MAX_BYTES;

    console.log(
      `[transcribe] ${uploadId}: audio=${metadata.audio_filename} size=${metadata.audio_size_bytes}B needsChunking=${needsChunking}`,
    );

    let response: TranscriptionVerbose;

    if (needsChunking) {
      // Probe ffmpeg before touching status so we fail fast with a
      // clear message instead of half-transitioning state.
      failingStep = "probe ffmpeg";
      const haveFfmpeg = await probeFfmpeg();
      if (!haveFfmpeg) {
        console.error(
          `[transcribe] ${uploadId}: ffmpeg unavailable, cannot chunk`,
        );
        tryWriteErrorMetadata(
          metadataPath,
          metadata,
          FFMPEG_MISSING_ERROR_MESSAGE,
          uploadId,
        );
        return;
      }

      failingStep = "status chunking";
      metadata.status = "chunking";
      writeMetadata(metadataPath, metadata);

      failingStep = "chunk audio";
      console.log(`[transcribe] ${uploadId}: chunking audio`);
      const chunks = await chunkAudio(audioPath, chunksDir);
      metadata.chunk_count = chunks.length;
      console.log(`[transcribe] ${uploadId}: produced ${chunks.length} chunks`);

      failingStep = "status transcribing";
      metadata.status = "transcribing";
      writeMetadata(metadataPath, metadata);

      const chunkResponses: Array<{
        chunk: AudioChunk;
        response: TranscriptionVerbose;
      }> = [];
      for (let i = 0; i < chunks.length; i++) {
        failingStep = `whisper call chunk ${i + 1}/${chunks.length}`;
        console.log(`[transcribe] ${uploadId}: ${failingStep}`);
        const chunkResponse = await transcribeFile(chunks[i].chunkPath);
        chunkResponses.push({ chunk: chunks[i], response: chunkResponse });
      }

      failingStep = "stitch transcripts";
      response = stitchTranscripts(chunkResponses);
    } else {
      failingStep = "status transcribing";
      metadata.status = "transcribing";
      writeMetadata(metadataPath, metadata);

      failingStep = "whisper call";
      console.log(`[transcribe] ${uploadId}: calling Whisper`);
      response = await transcribeFile(audioPath);
      console.log(
        `[transcribe] ${uploadId}: Whisper returned ${response.text?.length ?? 0} chars`,
      );
    }

    failingStep = "transcript.txt write";
    fs.writeFileSync(path.join(dir, "transcript.txt"), response.text);

    failingStep = "transcript.json write";
    fs.writeFileSync(
      path.join(dir, "transcript.json"),
      JSON.stringify(response, null, 2),
    );

    if (needsChunking) {
      // Successful stitch — chunks are no longer needed. Best-effort
      // cleanup; failure here is non-fatal.
      removeChunksDir(chunksDir, uploadId);
    }

    failingStep = "metadata final write";
    metadata.status = "transcribed";
    metadata.transcribed_at = nowIso();
    writeMetadata(metadataPath, metadata);
    console.log(`[transcribe] ${uploadId}: done — status=transcribed`);

    // Chain to analysis. Fire-and-forget via after() when called from
    // a request scope; fall back to setImmediate when there's no
    // request (e.g., the startup-recovery sweep, which calls
    // transcribeUpload directly from instrumentation.ts and so has no
    // response lifecycle for after() to hang off of). analyzeUpload
    // never throws; the .catch is belt-and-suspenders.
    const runAnalyze = async () => {
      try {
        await analyzeUpload(uploadId);
      } catch (analyzeErr) {
        console.error(
          `[transcribe] Background analyze threw for ${uploadId}:`,
          analyzeErr,
        );
      }
    };
    try {
      after(runAnalyze);
    } catch {
      // No request scope — schedule directly so the chain still runs.
      setImmediate(runAnalyze);
    }
  } catch (err) {
    const { name, message, stack } = describeError(err);
    console.error(
      `[transcribe] ${uploadId}: UNCAUGHT at step "${failingStep}" — ${name}: ${message}`,
    );
    if (stack) console.error(stack);

    const recordedMessage = `Failed at ${failingStep}: ${name}: ${message}`;
    if (metadata) {
      tryWriteErrorMetadata(metadataPath, metadata, recordedMessage, uploadId);
    } else {
      tryWriteMinimalErrorMetadata(metadataPath, uploadId, recordedMessage);
    }
    // chunks/ intentionally left in place for inspection on failure.
  }
}
