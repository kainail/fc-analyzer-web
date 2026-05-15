"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RerunButton({
  uploadId,
}: {
  uploadId: string;
}) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();

  async function onClick() {
    if (state === "running") return;
    setState("running");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ upload_id: uploadId, force: true }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setState("done");
      // Send the user to the status page so they can watch it re-run.
      router.push(`/status/${encodeURIComponent(uploadId)}`);
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={state === "running" || state === "done"}
        className="inline-block px-4 py-2 border-2 border-amber-600 dark:border-amber-500 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {state === "idle" && "Re-run analysis"}
        {state === "running" && "Re-queuing…"}
        {state === "done" && "Re-queued — redirecting…"}
        {state === "error" && "Re-run failed — try again"}
      </button>
      {errorMsg && (
        <p className="text-xs text-red-700 dark:text-red-300">{errorMsg}</p>
      )}
    </div>
  );
}
