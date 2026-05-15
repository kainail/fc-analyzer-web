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
 * This function never throws. All errors are logged via console.error
 * AND recorded in metadata.json. The caller's .catch() in after() is
 * defensive belt-and-suspenders only.
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
  return openai.audio.transcriptions.create({
    model: WHISPER_MODEL,
    file: fs.createReadStream(audioPath),
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });
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

  const audioPath = path.join(dir, metadata.audio_filename);
  const needsChunking = metadata.audio_size_bytes > WHISPER_MAX_BYTES;
  const chunksDir = path.join(dir, "chunks");

  let failingStep = "init";

  try {
    let response: TranscriptionVerbose;

    if (needsChunking) {
      // Probe ffmpeg before touching status so we fail fast with a
      // clear message instead of half-transitioning state.
      failingStep = "probe ffmpeg";
      const haveFfmpeg = await probeFfmpeg();
      if (!haveFfmpeg) {
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
      const chunks = await chunkAudio(audioPath, chunksDir);
      metadata.chunk_count = chunks.length;

      failingStep = "status transcribing";
      metadata.status = "transcribing";
      writeMetadata(metadataPath, metadata);

      const chunkResponses: Array<{
        chunk: AudioChunk;
        response: TranscriptionVerbose;
      }> = [];
      for (let i = 0; i < chunks.length; i++) {
        failingStep = `whisper call chunk ${i + 1}/${chunks.length}`;
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
      response = await transcribeFile(audioPath);
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

    // Chain to analysis. Fire-and-forget via after() so we don't block
    // the rest of this after() callback's completion. analyzeUpload
    // never throws; the .catch is belt-and-suspenders.
    after(async () => {
      try {
        await analyzeUpload(uploadId);
      } catch (analyzeErr) {
        console.error(
          `[transcribe] Background analyze threw for ${uploadId}:`,
          analyzeErr,
        );
      }
    });
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
    // chunks/ intentionally left in place for inspection on failure.
  }
}
