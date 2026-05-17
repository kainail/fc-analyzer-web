/**
 * Startup recovery sweep for stuck transcription rows.
 *
 * Why this exists: in dev, every HMR reload kills any in-flight
 * after() background work. If transcription was mid-Whisper-call
 * when the dev server restarted, the Upload row stays at
 * status="transcribing" (or "chunking") forever — no JS error fires
 * because the process was terminated, not because anything threw.
 *
 * This sweep runs once on server start (from instrumentation.ts).
 * It queries Postgres for Upload rows where status is "transcribing"
 * or "chunking" and updatedAt is older than 15 minutes, resets each
 * back to "uploaded" (clearing the mid-pipeline fields), then fires
 * a fresh transcribeUpload() so the pipeline picks it back up.
 *
 * 15 min is comfortably longer than a normal transcription would
 * take (single-call Whisper on a <25MB file is typically under 90s;
 * chunked runs with ffmpeg encode + multiple chunks can take a few
 * minutes), so anything past that threshold is genuinely stuck.
 *
 * Errors during the sweep are logged but never thrown — the server
 * must always start, even if recovery hits a snag.
 */
import { prisma } from "@/lib/db";

const STUCK_STATUSES = ["transcribing", "chunking"] as const;
const STUCK_THRESHOLD_MS = 15 * 60 * 1000;

export async function runStartupRecovery(): Promise<void> {
  let stuck: Array<{ id: string; status: string; updatedAt: Date }>;
  try {
    const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);
    stuck = await prisma.upload.findMany({
      where: {
        status: { in: [...STUCK_STATUSES] },
        updatedAt: { lt: cutoff },
      },
      select: { id: true, status: true, updatedAt: true },
    });
  } catch (err) {
    console.error(
      "[startup-recovery] Failed to query stuck uploads from Postgres:",
      err,
    );
    return;
  }

  if (stuck.length === 0) return;

  const resetIds: string[] = [];
  for (const row of stuck) {
    const ageMin = Math.round(
      (Date.now() - row.updatedAt.getTime()) / 60000,
    );
    console.warn(
      `[startup-recovery] ${row.id}: stuck at status="${row.status}" for ${ageMin} min — resetting to "uploaded"`,
    );
    try {
      await prisma.upload.update({
        where: { id: row.id },
        data: {
          status: "uploaded",
          chunkCount: null,
          errorMessage: null,
          errorAt: null,
        },
      });
      resetIds.push(row.id);
    } catch (err) {
      console.error(
        `[startup-recovery] Failed to reset ${row.id} in Postgres:`,
        err,
      );
    }
  }

  if (resetIds.length === 0) return;

  console.warn(
    `[startup-recovery] Reset ${resetIds.length} stuck upload(s); auto-retrying transcription`,
  );

  // Dynamic import: avoid eagerly loading the OpenAI client at boot
  // when OPENAI_API_KEY isn't set, and avoid potential import cycles
  // between this module and lib/transcribe.ts.
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
