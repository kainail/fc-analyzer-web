"use client";

import { useState } from "react";

export default function Page() {
  const [transcriptId, setTranscriptId] = useState("");
  const [transcript, setTranscript] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <textarea
          placeholder="Paste transcript here..."
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
