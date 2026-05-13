"use client";

import { useState } from "react";

const MAX_FILE_SIZE = 1024 * 1024;
const ALLOWED_EXTENSIONS = [".md", ".txt"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function Page() {
  const [transcriptId, setTranscriptId] = useState("");
  const [transcript, setTranscript] = useState("");
  const [loadedFile, setLoadedFile] = useState<{ name: string; size: number } | null>(null);
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const extOk = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!extOk) {
      setError(`File must end in .md or .txt (got "${file.name}")`);
      input.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(
        `File too large: ${formatBytes(file.size)} exceeds the 1 MB limit`,
      );
      input.value = "";
      return;
    }

    const text = await file.text();
    setError(null);
    setTranscript(text);
    setLoadedFile({ name: file.name, size: file.size });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setOutput("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript_id: transcriptId, transcript }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
      } else {
        setOutput(data.text ?? "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-4">
      <h1 className="text-2xl font-semibold">FC Sales Analyzer</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="text"
          placeholder="transcript_id"
          value={transcriptId}
          onChange={(e) => setTranscriptId(e.target.value)}
          className="w-full border rounded px-2 py-1"
        />
        <div className="space-y-1">
          <label htmlFor="transcript-file" className="block text-sm">
            Upload transcript (.md or .txt, max 1 MB):
          </label>
          <input
            id="transcript-file"
            type="file"
            accept=".md,.txt,text/markdown,text/plain"
            onChange={onFileChange}
            className="block text-sm"
          />
          {loadedFile && (
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              Loaded: <span className="font-mono">{loadedFile.name}</span>{" "}
              ({formatBytes(loadedFile.size)})
            </div>
          )}
        </div>
        <textarea
          placeholder="Or paste transcript here..."
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={16}
          className="w-full border rounded px-2 py-1 font-mono text-sm"
        />
        <button
          type="submit"
          disabled={loading || !transcriptId || !transcript}
          className="px-4 py-2 border rounded disabled:opacity-50"
        >
          {loading ? "Analyzing..." : "Analyze"}
        </button>
      </form>
      {error && (
        <div
          role="alert"
          className="border-2 border-red-500 bg-red-50 dark:bg-red-950/30 rounded p-4 space-y-1"
        >
          <div className="font-semibold text-red-700 dark:text-red-300">
            Error
          </div>
          <pre className="whitespace-pre-wrap text-sm text-red-900 dark:text-red-200">
            {error}
          </pre>
        </div>
      )}
      {output && (
        <pre className="whitespace-pre-wrap border rounded p-3 text-sm">
          {output}
        </pre>
      )}
    </main>
  );
}
