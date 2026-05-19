"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "ok" }
  | { kind: "err"; message: string };

export default function ProfileForm({
  initialFirstName,
  initialLastName,
  email,
}: {
  initialFirstName: string;
  initialLastName: string;
  email: string;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const dirty =
    firstName !== initialFirstName || lastName !== initialLastName;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || status.kind === "saving") return;
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/settings/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setStatus({ kind: "ok" });
      // Refresh so the sidebar's name/initials re-fetch from Clerk.
      router.refresh();
    } catch (err) {
      setStatus({
        kind: "err",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="card card-pad-lg"
      style={{ display: "grid", gap: 14 }}
    >
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          Profile
        </h3>
        <div
          className="muted"
          style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.5 }}
        >
          Your name appears in the sidebar, the rep dropdown, and on every
          consultation you upload.
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <div className="field">
          <label className="label" htmlFor="settings-first-name">
            First name
          </label>
          <input
            id="settings-first-name"
            type="text"
            className="input"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            disabled={status.kind === "saving"}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="settings-last-name">
            Last name
          </label>
          <input
            id="settings-last-name"
            type="text"
            className="input"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
            disabled={status.kind === "saving"}
          />
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="settings-email">
          Email <span className="hint">read-only</span>
        </label>
        <input
          id="settings-email"
          type="email"
          className="input"
          value={email}
          readOnly
          disabled
          style={{ color: "var(--ink-3)" }}
        />
      </div>

      {status.kind === "ok" && (
        <div
          role="status"
          style={{
            padding: "8px 12px",
            background: "var(--score-green-bg)",
            color: "var(--score-green)",
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 500,
          }}
        >
          Profile updated.
        </div>
      )}
      {status.kind === "err" && (
        <div
          role="alert"
          style={{
            padding: "8px 12px",
            background: "var(--score-red-bg)",
            color: "var(--score-red)",
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 500,
          }}
        >
          {status.message}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!dirty || status.kind === "saving"}
        >
          {status.kind === "saving" ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}
