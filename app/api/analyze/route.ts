/**
 * Manual analyzer re-trigger.
 *
 * POST /api/analyze with body { upload_id: string } fires analyzeUpload
 * for that id in the background and returns 202 immediately. Use this
 * to re-run analysis after rubric tweaks or when debugging.
 *
 * Caveats:
 *   - The upload must currently have status="transcribed". analyzeUpload
 *     will refuse to run on any other status and log a warning.
 *   - To re-run an already-analyzed upload, set its metadata.status back
 *     to "transcribed" first. (Intentionally manual — this is a
 *     debugging tool, not a normal pipeline path.)
 */
import { after } from "next/server";
import fs from "node:fs";
import { analyzeUpload } from "@/lib/analyze";
import { resolveUploadDir } from "@/lib/upload-id";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { upload_id?: string };
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

  const dir = resolveUploadDir(uploadId);
  if (!dir || !fs.existsSync(dir)) {
    return Response.json(
      { error: `Upload not found: ${uploadId}` },
      { status: 404 },
    );
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
    { upload_id: uploadId, queued: true },
    { status: 202 },
  );
}
