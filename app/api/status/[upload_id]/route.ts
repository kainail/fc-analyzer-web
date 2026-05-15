import fs from "node:fs";
import path from "node:path";
import { uploadDir } from "@/lib/upload-id";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ upload_id: string }> },
) {
  const { upload_id } = await ctx.params;
  const metadataPath = path.join(uploadDir(upload_id), "metadata.json");

  if (!fs.existsSync(metadataPath)) {
    return Response.json(
      { error: `Upload not found: ${upload_id}` },
      { status: 404 },
    );
  }

  try {
    const data = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    return Response.json(data, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Failed to read metadata: ${message}` },
      { status: 500 },
    );
  }
}
