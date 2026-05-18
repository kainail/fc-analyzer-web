"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PendingRowActions({
  inviteId,
  email,
}: {
  inviteId: string;
  email: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"idle" | "resending" | "cancelling">(
    "idle",
  );
  const [err, setErr] = useState<string | null>(null);

  async function onResend() {
    if (busy !== "idle") return;
    setBusy("resending");
    setErr(null);
    try {
      const res = await fetch(
        `/api/reps/invite/${encodeURIComponent(inviteId)}/resend`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("idle");
    }
  }

  async function onCancel() {
    if (busy !== "idle") return;
    if (!window.confirm(`Cancel invitation to ${email}?`)) return;
    setBusy("cancelling");
    setErr(null);
    try {
      const res = await fetch(
        `/api/reps/invite/${encodeURIComponent(inviteId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy("idle");
    }
  }

  return (
    <>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onResend}
          disabled={busy !== "idle"}
        >
          {busy === "resending" ? "Resending…" : "Resend"}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={onCancel}
          disabled={busy !== "idle"}
          style={{
            background: "var(--score-red-bg)",
            color: "var(--score-red)",
            border: "1px solid var(--score-red)",
          }}
        >
          {busy === "cancelling" ? "Cancelling…" : "Cancel"}
        </button>
      </div>
      {err && (
        <div
          style={{
            fontSize: 11,
            color: "var(--score-red)",
            marginTop: 4,
            textAlign: "right",
          }}
        >
          {err}
        </div>
      )}
    </>
  );
}
