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
 * ffmpeg must be on PATH. Probe with probeFfmpeg() before calling
 * chunkAudio() or probeAudioDuration() — otherwise spawn errors
 * propagate as opaque ENOENT.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const CHUNK_DURATION_SECONDS = 600;

export type AudioChunk = {
  chunkPath: string;
  startSec: number;
  durationSec: number;
};

function runFfmpeg(
  args: string[],
  opts: { captureStderr?: boolean; timeoutMs?: number } = {},
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { windowsHide: true });
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
          reject(new Error(`ffmpeg timed out after ${opts.timeoutMs}ms`));
        }, opts.timeoutMs)
      : null;

    proc.on("error", (err) => {
      if (timeout) clearTimeout(timeout);
      reject(err);
    });
    proc.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      resolve({ code: code ?? -1, stderr });
    });
  });
}

export async function probeFfmpeg(): Promise<boolean> {
  try {
    const { code } = await runFfmpeg(["-hide_banner", "-version"], {
      timeoutMs: 5000,
    });
    return code === 0;
  } catch {
    return false;
  }
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
