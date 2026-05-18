"use client";

import { useState } from "react";
import { ArrowR } from "@/lib/icons";

/**
 * "Go to dashboard →" button for the rep welcome page. POSTs to
 * /api/onboarding/activate (idempotent — upserts the rep Membership
 * if it doesn't already exist) and then hard-navigates to /dashboard
 * so middleware sees the freshly-set has-membership cookie on a
 * full request.
 */
export default function GoToDashboardButton() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/onboarding/activate", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !body.success) {
        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      }
      window.location.href = "/dashboard";
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={onClick}
        disabled={busy}
        style={{ width: "100%" }}
      >
        {busy ? "Going…" : "Go to dashboard"} <ArrowR size={15} />
      </button>
      {err && (
        <div
          role="alert"
          style={{
            marginTop: 10,
            padding: "8px 12px",
            background: "var(--score-red-bg)",
            color: "var(--score-red)",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            whiteSpace: "pre-wrap",
          }}
        >
          {err}
        </div>
      )}
    </>
  );
}
