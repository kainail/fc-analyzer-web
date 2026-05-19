/**
 * Step 3 of the direct-to-R2 upload flow.
 *
 * Called by the browser after it has successfully PUT the audio
 * (and, for split uploads, the part 2 audio) to the presigned R2
 * URLs returned by /api/upload/presign. We flip the Upload row from
 * "pending_upload" to "uploaded" and schedule transcribeUpload via
 * after().
 *
 * Caller must be the same rep that initiated the upload — scoping is
 * by repUserId rather than just org membership so a different rep in
 * the same org can't confirm someone else's pending upload.
 *
 * We don't HEAD the R2 object here. If the browser called confirm
 * without successfully completing the PUT, transcribeUpload's
 * downloadFromR2 will fail and surface a clean error_transcription
 * status — better than spending an extra R2 round-trip on every
 * happy-path confirm.
 */
import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { transcribeUpload } from "@/lib/transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let body: { uploadId?: unknown };
  try {
    body = (await request.json()) as { uploadId?: unknown };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Invalid JSON body: ${msg}` },
      { status: 400 },
    );
  }

  const uploadId =
    typeof body.uploadId === "string" ? body.uploadId.trim() : "";
  if (!uploadId) {
    return Response.json({ error: "uploadId is required" }, { status: 400 });
  }

  // Tenant + ownership check in one query: only the original rep can
  // confirm their own upload.
  const upload = await prisma.upload.findFirst({
    where: {
      id: uploadId,
      repUserId: userId,
    },
  });
  if (!upload) {
    return Response.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.status !== "pending_upload") {
    return Response.json(
      {
        error: `Upload is not pending — current status: "${upload.status}"`,
      },
      { status: 409 },
    );
  }

  try {
    await prisma.upload.update({
      where: { id: uploadId },
      data: { status: "uploaded" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[confirm] Postgres update failed for ${uploadId}:`, err);
    return Response.json(
      { error: `Failed to update upload status: ${msg}` },
      { status: 500 },
    );
  }

  after(async () => {
    try {
      await transcribeUpload(uploadId);
    } catch (err) {
      console.error(
        `[confirm] Background transcribe threw for ${uploadId}:`,
        err,
      );
    }
  });

  return Response.json({ uploadId, ok: true }, { status: 200 });
}
