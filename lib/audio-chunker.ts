/**
 * Audio chunking via ffmpeg.
 *
 * For recordings larger than Whisper's 25MB limit, this module splits
 * the source into duration-based chunks (default 600s / 10 min) and
 * re-encodes each chunk to mono 16kHz 64kbps MP3. That output profile:
 *   - matches Whisper's recommended ingest format
 *   - keeps each chunk well under 25MB regardless of source bitrate
 *   - produces clean cut boundaries (re-encoding handles arbitrary
 *     timestamps cleanly, unlike stream-copy which depends on
 *     keyframe alignment)
 *
 * Binary resolution order (first one that responds to `-version` wins):
 *   1. FFMPEG_PATH env var (set in .env.local)
 *   2. ffmpeg-static — the npm-bundled binary, no system install needed
 *   3. "ffmpeg" on PATH
 *   4. Hardcoded Windows fallback at the WinGet Gyan.FFmpeg install
 *      location on the dev machine — keeps things working when PATH
 *      isn't configured.
 *
 * The resolved path is cached for the process lifetime so we only pay
 * the probe cost once. Probe with probeFfmpeg() before chunkAudio() /
 * probeAudioDuration() so a missing binary surfaces as a friendly
 * error rather than an opaque ENOENT from inside the work path.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

export const CHUNK_DURATION_SECONDS = 600;

// Last-resort fallback for the dev machine where WinGet installs
// ffmpeg outside of PATH. Override with FFMPEG_PATH env on any other
// machine.
const HARDCODED_FFMPEG_FALLBACK =
  "C:\\Users\\kaial\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe";

export type AudioChunk = {
  chunkPath: string;
  startSec: number;
  durationSec: number;
};

// undefined = not yet probed; null = probed and nothing worked
let resolvedFfmpegPath: string | null | undefined;

function tryRunFfmpeg(
  binary: string,
  args: string[],
  opts: { captureStderr?: boolean; timeoutMs?: number } = {},
): Promise<{ code: number; stderr: string; spawnError: NodeJS.ErrnoException | null }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (
      code: number,
      stderr: string,
      spawnError: NodeJS.ErrnoException | null,
    ) => {
      if (settled) return;
      settled = true;
      resolve({ code, stderr, spawnError });
    };

    const proc = spawn(binary, args, { windowsHide: true });
    let stderr = "";
    if (opts.captureStderr) {
      proc.stderr.on("data", (d) => {
        stderr += d.toString();
      });
    } else {
      proc.stderr.resume();
    }
    proc.stdout.resume();

    const timeout = opts.timeoutMs
      ? setTimeout(() => {
          proc.kill("SIGKILL");
          finish(
            -1,
            stderr,
            Object.assign(new Error(`ffmpeg timed out after ${opts.timeoutMs}ms`), {
              code: "ETIMEDOUT",
            }),
          );
        }, opts.timeoutMs)
      : null;

    proc.on("error", (err) => {
      if (timeout) clearTimeout(timeout);
      finish(-1, stderr, err as NodeJS.ErrnoException);
    });
    proc.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      finish(code ?? -1, stderr, null);
    });
  });
}

export async function resolveFfmpegBinary(): Promise<string | null> {
  if (resolvedFfmpegPath !== undefined) return resolvedFfmpegPath;

  const candidates: string[] = [];
  if (process.env.FFMPEG_PATH?.trim()) {
    candidates.push(process.env.FFMPEG_PATH.trim());
  }
  // ffmpeg-static returns the path to its bundled binary, or null on
  // unsupported platforms. Trying it before the PATH lookup means
  // production (Railway, Vercel, anywhere) doesn't need a system
  // ffmpeg install — just the npm dep.
  if (ffmpegStatic && !candidates.includes(ffmpegStatic)) {
    candidates.push(ffmpegStatic);
  }
  candidates.push("ffmpeg");
  if (
    HARDCODED_FFMPEG_FALLBACK &&
    !candidates.includes(HARDCODED_FFMPEG_FALLBACK)
  ) {
    candidates.push(HARDCODED_FFMPEG_FALLBACK);
  }

  for (const candidate of candidates) {
    const { code, spawnError } = await tryRunFfmpeg(
      candidate,
      ["-hide_banner", "-version"],
      { timeoutMs: 5000 },
    );
    if (!spawnError && code === 0) {
      resolvedFfmpegPath = candidate;
      return candidate;
    }
  }

  resolvedFfmpegPath = null;
  return null;
}

async function runFfmpeg(
  args: string[],
  opts: { captureStderr?: boolean; timeoutMs?: number } = {},
): Promise<{ code: number; stderr: string }> {
  const binary = await resolveFfmpegBinary();
  if (!binary) {
    throw Object.assign(new Error("ffmpeg binary not found"), {
      code: "ENOENT",
    });
  }
  const { code, stderr, spawnError } = await tryRunFfmpeg(binary, args, opts);
  if (spawnError) throw spawnError;
  return { code, stderr };
}

export async function probeFfmpeg(): Promise<boolean> {
  return (await resolveFfmpegBinary()) !== null;
}

// Returns duration of the audio in seconds, parsed from ffmpeg's
// stderr metadata block. We use ffmpeg rather than ffprobe so we only
// require one binary on PATH.
export async function probeAudioDuration(audioPath: string): Promise<number> {
  const { stderr } = await runFfmpeg(["-hide_banner", "-i", audioPath], {
    captureStderr: true,
    timeoutMs: 30000,
  });
  // ffmpeg with -i and no output exits non-zero by design; we only
  // care about the stderr metadata it printed before exiting.
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  if (!match) {
    throw new Error(
      `Could not parse duration from ffmpeg output for ${audioPath}`,
    );
  }
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseFloat(match[3]);
  return hours * 3600 + minutes * 60 + seconds;
}

// Splits the audio into duration-based chunks, re-encoded to mono
// 16kHz 64kbps MP3. Returns the chunk file paths with their original
// timeline positions so the caller can offset segment timestamps when
// stitching transcripts.
export async function chunkAudio(
  audioPath: string,
  outputDir: string,
  chunkDurationSec: number = CHUNK_DURATION_SECONDS,
): Promise<AudioChunk[]> {
  fs.mkdirSync(outputDir, { recursive: true });

  const totalDuration = await probeAudioDuration(audioPath);
  const chunkCount = Math.max(1, Math.ceil(totalDuration / chunkDurationSec));

  const chunks: AudioChunk[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const startSec = i * chunkDurationSec;
    const remainingSec = totalDuration - startSec;
    if (remainingSec <= 0) break;
    const durationSec = Math.min(chunkDurationSec, remainingSec);
    const chunkPath = path.join(
      outputDir,
      `chunk-${String(i).padStart(3, "0")}.mp3`,
    );

    // -ss before -i = fast seek (keyframe-accurate enough since we're
    // re-encoding anyway). -t = limit duration. Re-encode to mono
    // 16kHz 64kbps MP3 — Whisper's recommended ingest profile.
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(startSec),
      "-i",
      audioPath,
      "-t",
      String(durationSec),
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "64k",
      "-vn",
      chunkPath,
    ];

    const { code, stderr } = await runFfmpeg(args, {
      captureStderr: true,
      timeoutMs: 5 * 60 * 1000,
    });
    if (code !== 0) {
      throw new Error(
        `ffmpeg failed encoding chunk ${i} (exit ${code}): ${stderr.trim() || "no stderr"}`,
      );
    }
    if (!fs.existsSync(chunkPath)) {
      throw new Error(
        `ffmpeg returned 0 but chunk ${i} was not written: ${chunkPath}`,
      );
    }

    chunks.push({ chunkPath, startSec, durationSec });
  }

  return chunks;
}
