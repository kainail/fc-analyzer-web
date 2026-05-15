"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SIZE_LIMIT_ERROR_MESSAGE } from "@/lib/transcribe-constants";

export type Metadata = {
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
  analyzed_at?: string;
  json_parse_error?: string;
  error_message?: string;
  error_at?: string;
};

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded — preparing for transcription",
  transcribing: "Transcribing audio (this can take a few minutes)",
  transcribed: "Transcript ready — queued for analysis",
  analyzing: "Analyzing call against your sales methodology",
  analyzed: "Analysis complete",
  error_transcription:
    "Transcription failed. Check error_message in metadata for details",
  error_analysis:
    "Analysis failed. Check error_message for details",
};

const OVERSIZE_USER_MESSAGE =
  "Audio file exceeds the 25MB limit. Chunking support is being added — for now, please split the recording into shorter segments before uploading.";

const TERMINAL_STATUSES = new Set([
  "transcribed",
  "analyzed",
  "error_transcription",
  "error_analysis",
]);

const POLL_INTERVAL_MS = 3000;
const MAX_CONSECUTIVE_FAILURES = 5;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function statusLabel(metadata: Metadata): string {
  if (
    metadata.status === "error_transcription" &&
    metadata.error_message === SIZE_LIMIT_ERROR_MESSAGE
  ) {
    return OVERSIZE_USER_MESSAGE;
  }
  return STATUS_LABEL[metadata.status] ?? metadata.status;
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

export default function StatusView({ initial }: { initial: Metadata }) {
  const [metadata, setMetadata] = useState<Metadata>(initial);
  const [connectionLost, setConnectionLost] = useState(false);
  const failuresRef = useRef(0);

  const isTerminal = TERMINAL_STATUSES.has(metadata.status);
  const isError =
    metadata.status === "error_transcription" ||
    metadata.status === "error_analysis";
  const isOversize =
    metadata.status === "error_transcription" &&
    metadata.error_message === SIZE_LIMIT_ERROR_MESSAGE;
  const polling = !isTerminal && !connectionLost;

  useEffect(() => {
    if (isTerminal || connectionLost) return;

    let cancelled = false;
    const uploadId = initial.upload_id;

    const tick = async () => {
      try {
        const res = await fetch(
          `/api/status/${encodeURIComponent(uploadId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as Metadata;
        if (cancelled) return;
        failuresRef.current = 0;
        setMetadata(data);
      } catch {
        if (cancelled) return;
        failuresRef.current += 1;
        if (failuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
          setConnectionLost(true);
        }
      }
    };

    const handle = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [isTerminal, connectionLost, initial.upload_id]);

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
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Current status
          </div>
          {polling && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-zinc-500">Live</span>
            </div>
          )}
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
        {metadata.status === "analyzed" && (
          <div className="mt-3">
            <Link
              href={`/analysis/${encodeURIComponent(metadata.upload_id)}`}
              className="inline-block px-4 py-2 border rounded-lg text-sm font-medium underline"
            >
              View analysis →
            </Link>
            {metadata.json_parse_error && (
              <p className="text-xs mt-2 text-amber-700 dark:text-amber-400">
                Note: analyzer output was malformed — coaching message
                captured, JSON saved as parse-error record.
              </p>
            )}
          </div>
        )}
      </div>

      {connectionLost && (
        <div className="text-sm text-zinc-500">
          Connection lost — refresh to retry
        </div>
      )}

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
        {metadata.analyzed_at && (
          <Row
            label="Analyzed at"
            value={new Date(metadata.analyzed_at).toLocaleString()}
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
