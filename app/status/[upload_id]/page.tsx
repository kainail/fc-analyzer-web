import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { uploadDir } from "@/lib/upload-id";
import StatusView, { type Metadata } from "./status-view";

export default async function StatusPage({
  params,
}: {
  params: Promise<{ upload_id: string }>;
}) {
  const { upload_id } = await params;

  const metadataPath = path.join(uploadDir(upload_id), "metadata.json");

  if (!fs.existsSync(metadataPath)) {
    return (
      <main className="mx-auto max-w-md p-4 space-y-4">
        <h1 className="text-xl font-semibold">Upload not found</h1>
        <p className="text-sm">
          No upload with id{" "}
          <span className="font-mono break-all">{upload_id}</span>.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-3 border rounded-lg text-base"
        >
          Back to upload
        </Link>
      </main>
    );
  }

  let metadata: Metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Metadata;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      <main className="mx-auto max-w-md p-4 space-y-4">
        <h1 className="text-xl font-semibold">Metadata error</h1>
        <pre className="text-sm whitespace-pre-wrap text-red-700">{msg}</pre>
        <Link
          href="/"
          className="inline-block px-4 py-3 border rounded-lg text-base"
        >
          Back to upload
        </Link>
      </main>
    );
  }

  return <StatusView initial={metadata} />;
}
