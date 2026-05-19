/**
 * Audio transcription via OpenAI Whisper.
 *
 * Now Postgres + R2 backed. The Upload row's status drives the
 * pipeline; transcript bytes go to R2 keyed by
 *   transcripts/<orgSlug>/<uploadId>/transcript.txt (and .json).
 * A Transcript row in Postgres records the R2 keys and derived
 * stats (durationSeconds, wordCount).
 *
 * Audio file is downloaded from R2 into a Node OS temp dir for the
 * duration of the run because ffmpeg (for chunking) and the OpenAI
 * SDK's audio.transcriptions.create both want a real file path on
 * disk — neither accepts an in-memory buffer cleanly across all
 * codecs. The temp dir is removed on every exit path, success or
 * failure.
 *
 * Whisper API limit: audio files MUST be ≤ 25 MB. Files at or under
 * the limit go through a single transcription call. Files above the
 * limit are split into duration-based chunks by lib/audio-chunker.ts
 * (re-encoded to mono 16kHz 64kbps MP3), each chunk is transcribed
 * serially, and the chunk responses are stitched back into a single
 * transcript.txt + transcript.json.
 *
 * Hard 5-minute total timeout per Whisper call (per chunk in the
 * chunked path) via AbortController.
 *
 * ffmpeg must be on PATH for the chunked path. Missing ffmpeg
 * surfaces as status="error_transcription" with FFMPEG_MISSING_ERROR_MESSAGE.
 *
 * Statuses produced here:
 *   uploaded → chunking (large files only) → transcribing → transcribed
 *                                                         → error_transcription
 *
 * This function never throws. Every code path is wrapped in a single
 * top-level try/catch that logs to console.error AND updates the
 * Upload row to status="error_transcription" + errorMessage + errorAt
 * so failures are never silent.
 *
 * What try/catch CAN'T catch: process termination (dev server HMR
 * reloads, OOM, kill -9). If the Next.js dev server restarts while
 * a transcription is in-flight, the after() callback dies mid-await
 * and the Upload row stays at "transcribing" — the startup recovery
 * sweep (lib/startup-recovery.ts) picks those up.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after } from "next/server";
import type { TranscriptionVerbose } from "openai/resources/audio/transcriptions";
import { openai, WHISPER_MODEL } from "@/lib/openai";
import { prisma } from "@/lib/db";
import { analyzeUpload } from "@/lib/analyze";
import { FFMPEG_MISSING_ERROR_MESSAGE } from "@/lib/transcribe-constants";
import {
  downloadFromR2,
  uploadToR2,
  transcriptTextKey,
  transcriptJsonKey,
} from "@/lib/r2";
import {
  chunkAudio,
  probeFfmpeg,
  resolveFfmpegBinary,
  type AudioChunk,
} from "@/lib/audio-chunker";

// Map a Part 1 R2 key to its Part 2 sibling.
//   part1Key:  uploads/<orgSlug>/<uploadId>/recording.<ext>
//   part2Key:  uploads/<orgSlug>/<uploadId>/recording_part2.<ext>
function derivePart2Key(part1Key: string): string {
  return part1Key.replace(/\/recording\./, "/recording_part2.");
}

// Concatenate two audio Buffers into a single Buffer via ffmpeg's
// concat demuxer with -c copy (stream copy, no re-encode). Both
// parts MUST share container + codec — practically that's the case
// for a single consultation recorded in two halves on the same
// device. If they don't match, ffmpeg's exit code is non-zero and
// the captured stderr is bubbled up as the error message.
//
// `extension` is the file extension (without the leading dot) that
// ffmpeg uses to infer the output container — pass the same ext as
// Part 1's audioFilename (e.g. "m4a", "mp3").
//
// Everything happens inside a private temp directory that's wiped
// in finally, so this helper leaves no working files behind on any
// exit path.
async function stitchAudioParts(
  part1: Buffer,
  part2: Buffer,
  ffmpegPath: string,
  extension: string,
): Promise<Buffer> {
  const ext = extension.replace(/^\./, "");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-stitch-"));
  const part1Path = path.join(dir, `part1.${ext}`);
  const part2Path = path.join(dir, `part2.${ext}`);
  const listPath = path.join(dir, "filelist.txt");
  const outPath = path.join(dir, `stitched.${ext}`);

  try {
    fs.writeFileSync(part1Path, part1);
    fs.writeFileSync(part2Path, part2);
    // Concat-demuxer filelist syntax: `file '<path>'` per line.
    // Single quotes guard against any spaces/specials in the path.
    fs.writeFileSync(
      listPath,
      `file '${part1Path}'\nfile '${part2Path}'\n`,
    );

    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      outPath,
    ];

    const result = await new Promise<{ code: number; stderr: string }>(
      (resolve) => {
        let stderr = "";
        const proc = spawn(ffmpegPath, args, { windowsHide: true });
        proc.stderr.on("data", (d) => {
          stderr += d.toString();
        });
        proc.stdout.resume();
        proc.on("error", (err) => {
          resolve({ code: -1, stderr: `${stderr}\n${err}` });
        });
        proc.on("close", (code) => {
          resolve({ code: code ?? -1, stderr });
        });
      },
    );

    if (result.code !== 0) {
      throw new Error(
        `ffmpeg concat failed (exit ${result.code}): ${result.stderr.trim() || "no stderr"}`,
      );
    }

    return fs.readFileSync(outPath);
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.error("[transcribe] stitch temp dir cleanup failed:", cleanupErr);
    }
  }
}

const WHISPER_MAX_BYTES = 25 * 1024 * 1024;
const WHISPER_TIMEOUT_MS = 5 * 60 * 1000;

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

async function transcribeFile(
  audioPath: string,
): Promise<TranscriptionVerbose> {
  // AbortController enforces a hard total cap on the Whisper call,
  // including retries — unlike RequestOptions.timeout which applies
  // per-attempt and would allow ~3x the configured time across the
  // SDK's default retry chain.
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

async function writeUploadError(
  uploadId: string,
  message: string,
): Promise<void> {
  try {
    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        status: "error_transcription",
        errorMessage: message,
        errorAt: new Date(),
      },
    });
  } catch (writeErr) {
    console.error(
      `[transcribe] ${uploadId}: Failed to write error status to Postgres:`,
      writeErr,
    );
  }
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

export async function transcribeUpload(uploadId: string): Promise<void> {
  console.log(`[transcribe] ${uploadId}: starting`);

  let failingStep = "load upload row";
  let tmpDir: string | null = null;

  try {
    const upload = await prisma.upload.findUnique({
      where: { id: uploadId },
      include: { org: true },
    });
    if (!upload) {
      console.error(
        `[transcribe] ${uploadId}: no Upload row in Postgres — aborting`,
      );
      return;
    }
    if (upload.status !== "uploaded") {
      console.warn(
        `[transcribe] ${uploadId}: expected status="uploaded", got "${upload.status}" — skipping`,
      );
      return;
    }

    let needsChunking = upload.audioSizeBytes > WHISPER_MAX_BYTES;
    console.log(
      `[transcribe] ${uploadId}: audio=${upload.audioFilename} size=${upload.audioSizeBytes}B needsChunking=${needsChunking}`,
    );

    // --- Pull audio from R2 to a temp file -------------------------------
    failingStep = "download audio from R2";
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `fc-transcribe-${uploadId}-`));
    const audioPath = path.join(tmpDir, upload.audioFilename);
    let audioBuffer = await downloadFromR2(upload.audioR2Key);

    // Split recordings ship two R2 objects (recording.<ext> +
    // recording_part2.<ext>). Stitch them into a single file via the
    // ffmpeg concat demuxer BEFORE the rest of the pipeline runs —
    // chunking, transcription, segment offsetting, etc. all stay
    // unaware that this upload started life as two parts.
    if (upload.recordingType === "split") {
      failingStep = "resolve ffmpeg for stitch";
      const ffmpegPath = await resolveFfmpegBinary();
      if (!ffmpegPath) {
        console.error(
          `[transcribe] ${uploadId}: ffmpeg unavailable, cannot stitch split parts`,
        );
        await writeUploadError(uploadId, FFMPEG_MISSING_ERROR_MESSAGE);
        return;
      }

      failingStep = "download part 2 from R2";
      const part2Key = derivePart2Key(upload.audioR2Key);
      const part2Buffer = await downloadFromR2(part2Key);

      failingStep = "stitch split parts";
      const ext =
        upload.audioFilename.split(".").pop()?.toLowerCase() ?? "mp3";
      console.log(
        `[transcribe] ${uploadId}: stitching split parts (${audioBuffer.length}B + ${part2Buffer.length}B, .${ext})`,
      );
      audioBuffer = await stitchAudioParts(
        audioBuffer,
        part2Buffer,
        ffmpegPath,
        ext,
      );
      console.log(
        `[transcribe] ${uploadId}: stitched buffer is ${audioBuffer.length}B`,
      );

      // upload.audioSizeBytes only counts Part 1 — recompute against
      // the stitched buffer so a split where Part 1 alone fits under
      // Whisper's 25 MB cap but Part 1 + Part 2 doesn't still goes
      // through the chunking path.
      const stitchedNeedsChunking = audioBuffer.byteLength > WHISPER_MAX_BYTES;
      if (stitchedNeedsChunking !== needsChunking) {
        console.log(
          `[transcribe] ${uploadId}: needsChunking ${needsChunking} → ${stitchedNeedsChunking} after stitch (${audioBuffer.byteLength}B)`,
        );
      }
      needsChunking = stitchedNeedsChunking;
    }

    fs.writeFileSync(audioPath, audioBuffer);

    const chunksDir = path.join(tmpDir, "chunks");

    let response: TranscriptionVerbose;

    if (needsChunking) {
      // Probe ffmpeg before touching status so we fail fast.
      failingStep = "probe ffmpeg";
      const haveFfmpeg = await probeFfmpeg();
      if (!haveFfmpeg) {
        console.error(
          `[transcribe] ${uploadId}: ffmpeg unavailable, cannot chunk`,
        );
        await writeUploadError(uploadId, FFMPEG_MISSING_ERROR_MESSAGE);
        return;
      }

      failingStep = "status chunking";
      await prisma.upload.update({
        where: { id: uploadId },
        data: { status: "chunking" },
      });

      failingStep = "chunk audio";
      console.log(`[transcribe] ${uploadId}: chunking audio`);
      const chunks = await chunkAudio(audioPath, chunksDir);
      console.log(`[transcribe] ${uploadId}: produced ${chunks.length} chunks`);

      failingStep = "status transcribing";
      await prisma.upload.update({
        where: { id: uploadId },
        data: { status: "transcribing", chunkCount: chunks.length },
      });

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
      await prisma.upload.update({
        where: { id: uploadId },
        data: { status: "transcribing" },
      });

      failingStep = "whisper call";
      console.log(`[transcribe] ${uploadId}: calling Whisper`);
      response = await transcribeFile(audioPath);
      console.log(
        `[transcribe] ${uploadId}: Whisper returned ${response.text?.length ?? 0} chars`,
      );
    }

    // --- Push transcript bytes to R2 -------------------------------------
    const textKey = transcriptTextKey(upload.org.slug, uploadId);
    const jsonKey = transcriptJsonKey(upload.org.slug, uploadId);

    failingStep = "upload transcript.txt to R2";
    await uploadToR2(textKey, Buffer.from(response.text, "utf8"), "text/plain");

    failingStep = "upload transcript.json to R2";
    await uploadToR2(
      jsonKey,
      Buffer.from(JSON.stringify(response, null, 2), "utf8"),
      "application/json",
    );

    // --- Persist Transcript row + flip Upload status ---------------------
    // upsert (instead of create) so a retry after a half-failed
    // previous run doesn't trip the @unique uploadId constraint.
    failingStep = "persist Transcript row";
    const durationSeconds =
      typeof response.duration === "number" ? response.duration : null;
    const wc = wordCount(response.text);
    await prisma.transcript.upsert({
      where: { uploadId },
      create: {
        uploadId,
        orgId: upload.orgId,
        textR2Key: textKey,
        jsonR2Key: jsonKey,
        durationSeconds: durationSeconds ?? undefined,
        wordCount: wc,
      },
      update: {
        textR2Key: textKey,
        jsonR2Key: jsonKey,
        durationSeconds: durationSeconds ?? undefined,
        wordCount: wc,
      },
    });

    failingStep = "status transcribed";
    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        status: "transcribed",
        errorMessage: null,
        errorAt: null,
      },
    });
    console.log(`[transcribe] ${uploadId}: done — status=transcribed`);

    // Chain to analysis. Fire-and-forget via after() when called from
    // a request scope; fall back to setImmediate when there's no
    // request (e.g., the startup-recovery sweep).
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
      setImmediate(runAnalyze);
    }
  } catch (err) {
    const { name, message, stack } = describeError(err);
    console.error(
      `[transcribe] ${uploadId}: UNCAUGHT at step "${failingStep}" — ${name}: ${message}`,
    );
    if (stack) console.error(stack);
    await writeUploadError(
      uploadId,
      `Failed at ${failingStep}: ${name}: ${message}`,
    );
  } finally {
    // Clean up the temp directory regardless of outcome — audio +
    // chunks were ephemeral working files, everything we needed has
    // already been written to R2 (or, on failure, lost — which is fine,
    // R2 still has the original audio for a retry).
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.error(
          `[transcribe] ${uploadId}: temp dir cleanup failed:`,
          cleanupErr,
        );
      }
    }
  }
}
