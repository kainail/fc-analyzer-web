"use client";

import { useEffect, useRef, useState } from "react";
import { Spin } from "@/lib/icons";

/**
 * Tiny client component that fires POST /api/onboarding/activate on
 * mount, then hard-navigates to /dashboard on success. Server-side
 * page detected invitedOrgId + invitedRole in publicMetadata and
 * delegated the actual membership creation to the API route so the
 * page render stays read-only.
 */
export default function ActivateInvite() {
  const firedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // StrictMode + dev double-renders would otherwise fire the
    // request twice (idempotent server side, but wasted call).
    if (firedRef.current) return;
    firedRef.current = true;

    (async () => {
      try {
        const res = await fetch("/api/onboarding/activate", {
          method: "POST",
        });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          message?: string;
        };
        if (!res.ok || !body.success) {
          throw new Error(
            body.message ?? body.error ?? `HTTP ${res.status}`,
          );
        }
        // Hard navigation, not router.push — middleware needs to see
        // the freshly-set has-membership cookie on a full request.
        window.location.href = "/dashboard";
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  if (error) {
    return (
      <div
        role="alert"
        style={{
          padding: "12px 14px",
          background: "var(--score-red-bg)",
          color: "var(--score-red)",
          borderRadius: 8,
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          Couldn&rsquo;t activate your invitation
        </div>
        <div style={{ whiteSpace: "pre-wrap" }}>{error}</div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        color: "var(--ink-2)",
        fontSize: 14,
      }}
    >
      <Spin size={16} style={{ animation: "spin 1s linear infinite" }} />
      Activating your invitation…
    </div>
  );
}
