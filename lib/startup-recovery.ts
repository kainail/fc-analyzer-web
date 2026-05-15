/**
 * Startup recovery sweep for stuck transcription rows.
 *
 * Why this exists: in dev, every HMR reload kills any in-flight
 * after() background work. If transcription was mid-Whisper-call when
 * the dev server restarted, the row stays at status="transcribing"
 * (or "chunking") forever — no JS error fires because the process
 * was terminated, not because anything threw.
 *
 * This sweep runs once on server start (from instrumentation.ts).
 * It scans incoming/, finds rows in mid-pipeline statuses whose
 * metadata.json was last written more than 15 minutes ago, and:
 *   1. Resets status back to "uploaded" with reset_at + reset_reason
 *      noting the prior status and how long it had been stuck
 *   2. Fire-and-forgets a fresh transcribeUpload() call for each
 *      one so the pipeline picks it back up automatically
 *
 * 15 min is comfortably longer than a normal transcription would
 * take (single-call Whisper on a <25MB file is typically under 90s;
 * chunked runs with ffmpeg encode + multiple chunks can take a few
 * minutes), so anything past that threshold is genuinely stuck.
 *
 * Errors during the sweep are logged but never thrown — the server
 * must always start, even if recovery hits a snag.
 */
import fs from "node:fs";
import path from "node:path";
import { getIncomingRoot } from "@/lib/upload-id";

const STUCK_STATUSES = new Set(["transcribing", "chunking"]);
const STUCK_THRESHOLD_MS = 15 * 60 * 1000;

type LooseMetadata = Record<string, unknown> & {
  status?: string;
};

export async function runStartupRecovery(): Promise<void> {
  let incomingRoot: string;
  try {
    incomingRoot = getIncomingRoot();
  } catch {
    console.warn(
      "[startup-recovery] Skipping: SKILL_PATH not set or invalid.",
    );
    return;
  }
  if (!fs.existsSync(incomingRoot)) {
    return;
  }

  const now = Date.now();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(incomingRoot, { withFileTypes: true });
  } catch (err) {
    console.error(
      `[startup-recovery] Failed to read incoming/ at ${incomingRoot}:`,
      err,
    );
    return;
  }

  const resetIds: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const uploadId = entry.name;
    const metadataPath = path.join(incomingRoot, uploadId, "metadata.json");
    if (!fs.existsSync(metadataPath)) continue;

    let metadata: LooseMetadata;
    try {
      metadata = JSON.parse(
        fs.readFileSync(metadataPath, "utf8"),
      ) as LooseMetadata;
    } catch (err) {
      console.error(
        `[startup-recovery] Skipping ${uploadId}: metadata.json unreadable:`,
        err,
      );
      continue;
    }

    if (typeof metadata.status !== "string") continue;
    if (!STUCK_STATUSES.has(metadata.status)) continue;

    let ageMs: number;
    try {
      ageMs = now - fs.statSync(metadataPath).mtimeMs;
    } catch (err) {
      console.error(
        `[startup-recovery] Skipping ${uploadId}: stat failed:`,
        err,
      );
      continue;
    }
    if (ageMs < STUCK_THRESHOLD_MS) continue;

    const ageMin = Math.round(ageMs / 60000);
    const priorStatus = metadata.status;
    console.warn(
      `[startup-recovery] ${uploadId}: stuck at status="${priorStatus}" for ${ageMin} min — resetting to "uploaded"`,
    );

    metadata.status = "uploaded";
    metadata.reset_at = new Date().toISOString();
    metadata.reset_reason = `Stuck at "${priorStatus}" for ${ageMin} min before server restart`;
    // Drop fields that no longer apply after the reset so the row
    // looks clean to the next pass through the pipeline.
    delete metadata.transcribed_at;
    delete metadata.chunk_count;
    delete metadata.error_message;
    delete metadata.error_at;

    try {
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      resetIds.push(uploadId);
    } catch (err) {
      console.error(
        `[startup-recovery] Failed to write reset metadata for ${uploadId}:`,
        err,
      );
    }
  }

  if (resetIds.length === 0) return;

  console.warn(
    `[startup-recovery] Reset ${resetIds.length} stuck upload(s); auto-retrying transcription`,
  );

  // Re-fire transcription for each reset row. Dynamic import avoids
  // loading the OpenAI client at boot when SKILL_PATH is missing, and
  // avoids any potential import cycle between this module and
  // lib/transcribe.ts.
  const { transcribeUpload } = await import("@/lib/transcribe");
  for (const uploadId of resetIds) {
    void transcribeUpload(uploadId).catch((err) => {
      console.error(
        `[startup-recovery] Auto-retry threw for ${uploadId}:`,
        err,
      );
    });
  }
}
