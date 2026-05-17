/**
 * Manual analyzer (re-)trigger.
 *
 * POST /api/analyze
 *   body: { upload_id: string, force?: boolean }
 *
 * Auth: Clerk userId required (401). Membership lookup to confirm the
 * user belongs to the same org as the Upload (403 otherwise).
 *
 * - { upload_id }: fires analyzeUpload in the background and returns 202.
 *   analyzeUpload itself refuses to run unless Upload.status="transcribed".
 *
 * - { upload_id, force: true }: resets an already-analyzed upload back
 *   into the analyzer queue — Upload.status="transcribed", clears
 *   analyzedAt, jsonParseError, errorMessage, errorAt, and DELETES the
 *   existing Analysis row so the next analyzeUpload run does a clean
 *   upsert. Then fires analyzeUpload.
 *
 * The force=true path is what the analysis viewer's "Re-run analysis"
 * button calls — most useful when the analyzer's structured output
 * parsed as malformed and you want to try again.
 */
import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { analyzeUpload } from "@/lib/analyze";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // --- Auth + membership lookup --------------------------------------------
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

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

  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: { id: true, orgId: true },
  });
  if (!upload) {
    return Response.json(
      { error: `Upload not found: ${uploadId}` },
      { status: 404 },
    );
  }

  const membership = await prisma.membership.findFirst({
    where: { userId, orgId: upload.orgId },
    select: { id: true },
  });
  if (!membership) {
    return Response.json(
      { error: "Forbidden — not a member of this upload's organization" },
      { status: 403 },
    );
  }

  // --- Force reset (idempotent) --------------------------------------------
  if (force) {
    try {
      // Delete first; the cascade from Upload → Analysis would only
      // fire on Upload delete, not on a status change. Doing this
      // explicitly leaves the next analyzeUpload's upsert with a
      // clean slate so any stale denormalized fields disappear.
      await prisma.analysis.deleteMany({ where: { uploadId } });
      await prisma.upload.update({
        where: { id: uploadId },
        data: {
          status: "transcribed",
          errorMessage: null,
          errorAt: null,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[analyze:re-trigger] Force reset failed for ${uploadId}:`,
        err,
      );
      return Response.json(
        { error: `Failed to reset upload for re-analysis: ${msg}` },
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
