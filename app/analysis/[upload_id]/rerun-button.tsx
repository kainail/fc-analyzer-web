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
      router.push(`/status/${encodeURIComponent(uploadId)}`);
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={state === "running" || state === "done"}
        className="btn btn-secondary btn-sm"
        style={{
          borderColor: "var(--score-amber)",
          color: "var(--score-amber)",
        }}
      >
        {state === "idle" && "Re-run analysis"}
        {state === "running" && "Re-queuing…"}
        {state === "done" && "Re-queued — redirecting…"}
        {state === "error" && "Re-run failed — try again"}
      </button>
      {errorMsg && (
        <p
          style={{
            fontSize: 11.5,
            color: "var(--score-red)",
            margin: "6px 0 0",
          }}
        >
          {errorMsg}
        </p>
      )}
    </div>
  );
}
