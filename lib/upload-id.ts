// Upload-id helpers + Postgres lookup for an Upload row.
//
// The old filesystem helpers (uploadDir, processedDir, resolveUploadDir,
// getIncomingRoot, getProcessedRoot) used to read from disk. They're
// preserved here as TYPE-COMPATIBLE THROW STUBS so the rest of the
// codebase still typechecks during the multi-step migration — every
// caller will be migrated to getUploadById() in subsequent steps,
// and the stubs disappear in Step 12 cleanup. Calling any of them at
// runtime is now a programmer error.

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
// canonical lookup for every code path that used to walk
// SKILL_PATH/transcripts/incoming/ or .../processed/.
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

/** @deprecated Use generateUploadId — the old name returned an id
 *  guaranteed unique against the local filesystem, which the new
 *  Postgres-backed model handles via PK constraint instead. */
export function generateUniqueUploadId(opts: {
  consultationDate: string;
  rep: string;
  outcome: string;
}): string {
  return generateUploadId(opts);
}

// --- Filesystem helper THROW STUBS ------------------------------------------
// These exist only to keep TypeScript happy across the multi-step
// migration. Every caller is migrated to getUploadById() / direct R2
// keys in subsequent steps; once nothing references these names,
// Step 12 deletes them.

const STUB_MSG =
  "Filesystem upload-id helpers are no longer supported — use getUploadById() and Upload.audioR2Key / transcriptR2Key / etc.";

/** @deprecated migration stub — will throw at runtime */
export function getIncomingRoot(): string {
  throw new Error(STUB_MSG);
}

/** @deprecated migration stub — will throw at runtime */
export function getProcessedRoot(): string {
  throw new Error(STUB_MSG);
}

/** @deprecated migration stub — will throw at runtime */
export function uploadDir(_uploadId: string): string {
  throw new Error(STUB_MSG);
}

/** @deprecated migration stub — will throw at runtime */
export function processedDir(_uploadId: string): string {
  throw new Error(STUB_MSG);
}

/** @deprecated migration stub — will throw at runtime */
export function resolveUploadDir(_uploadId: string): string | null {
  throw new Error(STUB_MSG);
}
