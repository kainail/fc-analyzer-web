import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { uploadDir } from "@/lib/upload-id";

type Metadata = {
  upload_id: string;
  rep: string;
  gym: string;
  prospect: string;
  consultation_date: string;
  outcome: string;
  audio_filename: string;
  audio_size_bytes: number;
  uploaded_at: string;
  status: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-zinc-200 dark:border-zinc-800 pb-3">
      <dt className="text-zinc-500 text-xs uppercase tracking-wide">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

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
    metadata = JSON.parse(
      fs.readFileSync(metadataPath, "utf8"),
    ) as Metadata;
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

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <Link href="/" className="text-sm underline">
        ← Back to upload
      </Link>
      <h1 className="text-2xl font-semibold">Status</h1>

      <div className="border-2 border-zinc-300 dark:border-zinc-700 rounded-lg p-4">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          Current status
        </div>
        <div className="text-2xl font-semibold capitalize mt-1">
          {metadata.status}
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-3 text-sm">
        <Row
          label="Upload ID"
          value={
            <span className="font-mono break-all">{metadata.upload_id}</span>
          }
        />
        <Row label="Rep" value={metadata.rep} />
        <Row label="Gym" value={metadata.gym} />
        <Row label="Prospect" value={metadata.prospect} />
        <Row
          label="Consultation date"
          value={metadata.consultation_date}
        />
        <Row label="Outcome" value={metadata.outcome} />
        <Row
          label="Audio file"
          value={`${metadata.audio_filename} (${formatBytes(metadata.audio_size_bytes)})`}
        />
        <Row
          label="Uploaded at"
          value={new Date(metadata.uploaded_at).toLocaleString()}
        />
      </dl>
    </main>
  );
}
