// Upload-id helpers + Postgres lookup for an Upload row.
//
// The pre-migration filesystem helpers (uploadDir, processedDir,
// resolveUploadDir, getIncomingRoot, getProcessedRoot) and the
// generateUniqueUploadId alias are gone — every caller is on the
// Postgres-backed getUploadById() and the cleaner generateUploadId
// factory now.

import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import type { UploadModel } from "@/lib/generated/prisma/models/Upload";

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

// Returns the Upload row (or null if no such row exists). The
// canonical lookup for code paths that need the full row by id.
export async function getUploadById(
  uploadId: string,
): Promise<UploadModel | null> {
  return prisma.upload.findUnique({ where: { id: uploadId } });
}

// Format: YYYY-MM-DD-<rep-slug>-<outcome>-<4 hex>. The hex suffix
// reduces collision probability to ~1 in 65k per (date, rep, outcome)
// triple; the Upload.id primary-key constraint catches the rest as
// an insert-time error.
export function generateUploadId(opts: {
  consultationDate: string;
  rep: string;
  outcome: string;
}): string {
  const base = `${opts.consultationDate}-${repSlug(opts.rep)}-${opts.outcome}`;
  const random = crypto.randomBytes(2).toString("hex");
  return `${base}-${random}`;
}
