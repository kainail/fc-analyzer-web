import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const ALLOWED_AUDIO_EXTENSIONS = [
  "mp3",
  "m4a",
  "wav",
  "ogg",
  "aac",
  "flac",
] as const;

export function isAllowedAudioExtension(filename: string): boolean {
  const ext = extensionFromFilename(filename);
  return ext !== null && (ALLOWED_AUDIO_EXTENSIONS as readonly string[]).includes(ext);
}

export function extensionFromFilename(filename: string): string | null {
  const idx = filename.lastIndexOf(".");
  if (idx < 0 || idx === filename.length - 1) return null;
  return filename.slice(idx + 1).toLowerCase();
}

export function repSlug(rep: string): string {
  return rep
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getIncomingRoot(): string {
  const skillPath = process.env.SKILL_PATH;
  if (!skillPath) {
    throw new Error("SKILL_PATH is not set");
  }
  return path.join(skillPath, "transcripts", "incoming");
}

export function getProcessedRoot(): string {
  const skillPath = process.env.SKILL_PATH;
  if (!skillPath) {
    throw new Error("SKILL_PATH is not set");
  }
  return path.join(skillPath, "transcripts", "processed");
}

export function uploadDir(uploadId: string): string {
  return path.join(getIncomingRoot(), uploadId);
}

export function processedDir(uploadId: string): string {
  return path.join(getProcessedRoot(), uploadId);
}

// Finds the upload folder in either incoming/ or processed/. Returns
// null if neither exists. Used by status reads and the analyzer
// re-trigger route so callers don't need to know where a given upload
// currently lives in the pipeline.
export function resolveUploadDir(uploadId: string): string | null {
  const incoming = uploadDir(uploadId);
  if (fs.existsSync(incoming)) return incoming;
  const processed = processedDir(uploadId);
  if (fs.existsSync(processed)) return processed;
  return null;
}

export function generateUniqueUploadId(opts: {
  consultationDate: string;
  rep: string;
  outcome: string;
}): string {
  const base = `${opts.consultationDate}-${repSlug(opts.rep)}-${opts.outcome}`;
  for (let i = 0; i < 5; i++) {
    const random = crypto.randomBytes(2).toString("hex");
    const id = `${base}-${random}`;
    if (!fs.existsSync(uploadDir(id))) {
      return id;
    }
  }
  throw new Error("Could not generate a unique upload_id after 5 attempts");
}
