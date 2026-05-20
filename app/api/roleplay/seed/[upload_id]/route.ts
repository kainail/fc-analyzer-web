/**
 * GET /api/roleplay/seed/[upload_id]
 *
 * Returns the roleplay scenario seed embedded in an analyzed upload's
 * Analysis JSON, scoped to the caller's org memberships (same tenant
 * pattern as /analysis/[upload_id]).
 *
 * Response shape on success:
 *   {
 *     upload_id, prospect_name, consultation_date,
 *     seed: { ... roleplay_scenario_seed ... }
 *   }
 *
 * Error codes:
 *   401 — unauthenticated
 *   404 — upload not found / not in caller's org, OR no Analysis row,
 *         OR analysis JSON has no roleplay_scenario_seed
 *   409 — upload exists but status !== "analyzed" (analysis still in
 *         flight, errored, etc.)
 *   502 — R2 download failed or analysis JSON couldn't be parsed
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { downloadFromR2 } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ upload_id: string }> },
) {
  const { upload_id } = await params;

  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  // Tenant scoping: caller must belong to the upload's org. Cross-org
  // probes return 404 (not 403) so we don't leak the existence of
  // upload_ids in other orgs.
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { orgId: true },
  });
  if (memberships.length === 0) {
    return Response.json({ error: "Upload not found" }, { status: 404 });
  }

  const upload = await prisma.upload.findFirst({
    where: {
      id: upload_id,
      orgId: { in: memberships.map((m) => m.orgId) },
    },
    include: { analysis: true },
  });
  if (!upload) {
    return Response.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.status !== "analyzed") {
    return Response.json(
      { error: "Analysis not complete", status: upload.status },
      { status: 409 },
    );
  }

  if (!upload.analysis) {
    return Response.json({ error: "Analysis not found" }, { status: 404 });
  }

  let jsonBuf: Buffer;
  try {
    jsonBuf = await downloadFromR2(upload.analysis.jsonR2Key);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[roleplay-seed] R2 download failed for ${upload_id}:`,
      err,
    );
    return Response.json(
      { error: `Failed to download analysis JSON: ${msg}` },
      { status: 502 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBuf.toString("utf8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[roleplay-seed] JSON parse failed for ${upload_id}:`,
      err,
    );
    return Response.json(
      { error: `Analysis JSON could not be parsed: ${msg}` },
      { status: 502 },
    );
  }

  const seed =
    parsed &&
    typeof parsed === "object" &&
    "roleplay_scenario_seed" in parsed
      ? (parsed as { roleplay_scenario_seed: unknown }).roleplay_scenario_seed
      : null;

  if (seed == null) {
    return Response.json(
      { error: "No roleplay seed in this analysis" },
      { status: 404 },
    );
  }

  return Response.json(
    {
      upload_id: upload.id,
      prospect_name: upload.prospectName,
      consultation_date: upload.consultationDate.toISOString().slice(0, 10),
      seed,
    },
    { status: 200 },
  );
}
