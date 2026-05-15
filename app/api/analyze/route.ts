/**
 * Manual analyzer (re-)trigger.
 *
 * POST /api/analyze
 *   body: { upload_id: string, force?: boolean }
 *
 * - { upload_id }: fires analyzeUpload in the background and returns 202.
 *   analyzeUpload itself refuses to run unless metadata.status="transcribed".
 *
 * - { upload_id, force: true }: resets an already-analyzed upload back
 *   into the analyzer queue. If the folder currently lives in processed/,
 *   it's moved back to incoming/. metadata.status is reset to
 *   "transcribed" and analyzed_at / json_parse_error are cleared.
 *   Then analyzeUpload fires.
 *
 * The force=true path is what the analysis viewer's "Re-run analysis"
 * button calls — most useful when the analyzer's structured output
 * parsed as malformed and you want to try again.
 */
import { after } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { analyzeUpload } from "@/lib/analyze";
import {
  resolveUploadDir,
  uploadDir,
  processedDir,
  getIncomingRoot,
} from "@/lib/upload-id";

export const runtime = "nodejs";

type Metadata = Record<string, unknown> & {
  upload_id: string;
  status: string;
};

function readMetadata(p: string): Metadata | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as Metadata;
  } catch {
    return null;
  }
}

function writeMetadata(p: string, m: Metadata): void {
  fs.writeFileSync(p, JSON.stringify(m, null, 2));
}

export async function POST(request: Request) {
  let body: { upload_id?: string; force?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  const uploadId = body.upload_id?.trim();
  if (!uploadId) {
    return Response.json(
      { error: "upload_id is required" },
      { status: 400 },
    );
  }

  const force = body.force === true;

  const currentDir = resolveUploadDir(uploadId);
  if (!currentDir) {
    return Response.json(
      { error: `Upload not found: ${uploadId}` },
      { status: 404 },
    );
  }

  if (force) {
    const incoming = uploadDir(uploadId);
    const processed = processedDir(uploadId);

    // If the upload was already moved to processed/, move it back so
    // analyzeUpload (which reads from incoming/) can pick it up. The
    // resolver also covers incoming-only, in which case there's nothing
    // to move.
    if (currentDir === processed) {
      try {
        fs.mkdirSync(getIncomingRoot(), { recursive: true });
        if (fs.existsSync(incoming)) {
          return Response.json(
            {
              error: `Cannot reset: ${incoming} already exists — manual cleanup needed`,
            },
            { status: 409 },
          );
        }
        fs.renameSync(processed, incoming);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return Response.json(
          { error: `Failed to move folder back to incoming/: ${msg}` },
          { status: 500 },
        );
      }
    }

    const metadataPath = path.join(incoming, "metadata.json");
    const metadata = readMetadata(metadataPath);
    if (!metadata) {
      return Response.json(
        { error: `Failed to read metadata.json after reset` },
        { status: 500 },
      );
    }

    metadata.status = "transcribed";
    delete metadata.analyzed_at;
    delete metadata.json_parse_error;
    delete metadata.error_message;
    delete metadata.error_at;
    try {
      writeMetadata(metadataPath, metadata);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json(
        { error: `Failed to reset metadata: ${msg}` },
        { status: 500 },
      );
    }
  }

  after(async () => {
    try {
      await analyzeUpload(uploadId);
    } catch (err) {
      console.error(
        `[analyze:re-trigger] Background analyze threw for ${uploadId}:`,
        err,
      );
    }
  });

  return Response.json(
    { upload_id: uploadId, queued: true, force },
    { status: 202 },
  );
}
