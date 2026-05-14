import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { uploadDir } from "@/lib/upload-id";
import { SIZE_LIMIT_ERROR_MESSAGE } from "@/lib/transcribe";

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
  transcribed_at?: string;
  error_message?: string;
  error_at?: string;
};

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded — preparing for transcription",
  transcribing: "Transcribing audio (this can take a few minutes)",
  transcribed: "Transcript ready — analyzer not yet wired up",
  error_transcription:
    "Transcription failed. Check error_message in metadata for details",
};

const OVERSIZE_USER_MESSAGE =
  "Audio file exceeds the 25MB limit. Chunking support is being added — for now, please split the recording into shorter segments before uploading.";

function statusLabel(metadata: Metadata): string {
  if (
    metadata.status === "error_transcription" &&
    metadata.error_message === SIZE_LIMIT_ERROR_MESSAGE
  ) {
    return OVERSIZE_USER_MESSAGE;
  }
  return STATUS_LABEL[metadata.status] ?? metadata.status;
}

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

  const isError = metadata.status === "error_transcription";
  const isOversize =
    isError && metadata.error_message === SIZE_LIMIT_ERROR_MESSAGE;

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <Link href="/" className="text-sm underline">
        ← Back to upload
      </Link>
      <h1 className="text-2xl font-semibold">Status</h1>

      <div
        className={
          isError
            ? "border-2 border-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg p-4"
            : "border-2 border-zinc-300 dark:border-zinc-700 rounded-lg p-4"
        }
      >
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          Current status
        </div>
        <div
          className={
            "text-lg font-semibold mt-1 " +
            (isError ? "text-red-700 dark:text-red-300" : "")
          }
        >
          {statusLabel(metadata)}
        </div>
        {isError && !isOversize && metadata.error_message && (
          <pre className="whitespace-pre-wrap text-sm mt-3 text-red-900 dark:text-red-200">
            {metadata.error_message}
          </pre>
        )}
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
        <Row label="Consultation date" value={metadata.consultation_date} />
        <Row label="Outcome" value={metadata.outcome} />
        <Row
          label="Audio file"
          value={`${metadata.audio_filename} (${formatBytes(metadata.audio_size_bytes)})`}
        />
        <Row
          label="Uploaded at"
          value={new Date(metadata.uploaded_at).toLocaleString()}
        />
        {metadata.transcribed_at && (
          <Row
            label="Transcribed at"
            value={new Date(metadata.transcribed_at).toLocaleString()}
          />
        )}
        {metadata.error_at && (
          <Row
            label="Error at"
            value={new Date(metadata.error_at).toLocaleString()}
          />
        )}
      </dl>
    </main>
  );
}
