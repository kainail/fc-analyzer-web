"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function GymRowActions({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/gyms/${encodeURIComponent(slug)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <Link
          href={`/admin/gyms/${encodeURIComponent(slug)}`}
          className="btn btn-secondary btn-sm"
        >
          View
        </Link>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setConfirming(true)}
          style={{
            background: "var(--score-red-bg)",
            color: "var(--score-red)",
            border: "1px solid var(--score-red)",
          }}
        >
          Delete
        </button>
      </div>

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) setConfirming(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            className="card card-pad-lg"
            style={{
              maxWidth: 440,
              width: "100%",
              border: "1px solid var(--score-red)",
            }}
          >
            <div
              className="mono"
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: "var(--score-red)",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Destructive
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: "-0.01em",
              }}
            >
              Delete {name}?
            </h2>
            <p
              style={{
                margin: "10px 0 16px",
                fontSize: 13.5,
                lineHeight: 1.55,
                color: "var(--ink-2)",
              }}
            >
              This removes the Organization plus every Membership, Upload,
              Transcript, and Analysis row associated with it. R2 audio /
              transcript / coaching objects are <strong>not</strong> deleted
              by this action — clean them up separately if needed. This
              can&rsquo;t be undone.
            </p>

            {error && (
              <div
                role="alert"
                style={{
                  padding: "10px 12px",
                  background: "var(--score-red-bg)",
                  color: "var(--score-red)",
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 500,
                  marginBottom: 12,
                }}
              >
                {error}
              </div>
            )}

            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirming(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={doDelete}
                disabled={deleting}
                style={{
                  background: "var(--score-red)",
                  color: "#fff",
                }}
              >
                {deleting ? "Deleting…" : `Delete ${name}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
