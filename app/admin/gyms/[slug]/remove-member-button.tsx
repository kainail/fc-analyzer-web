"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RemoveMemberButton({
  slug,
  userId,
  name,
}: {
  slug: string;
  userId: string;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    if (busy) return;
    if (
      !window.confirm(
        `Remove ${name} from this gym? Their Membership row is deleted; their uploads (if any) stay.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/gyms/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`,
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
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-sm"
        onClick={onClick}
        disabled={busy}
        style={{
          background: "var(--score-red-bg)",
          color: "var(--score-red)",
          border: "1px solid var(--score-red)",
        }}
      >
        {busy ? "Removing…" : "Remove"}
      </button>
      {err && (
        <div
          style={{
            fontSize: 11,
            color: "var(--score-red)",
            marginTop: 4,
          }}
        >
          {err}
        </div>
      )}
    </>
  );
}
