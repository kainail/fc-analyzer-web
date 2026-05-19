"use client";

import { useState } from "react";

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "ok" }
  | { kind: "err"; message: string };

const MIN_PW = 8;

export default function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  function localError(): string | null {
    if (!current) return "Current password is required.";
    if (!next || next.length < MIN_PW)
      return `New password must be at least ${MIN_PW} characters.`;
    if (next !== confirm) return "New password and confirmation don't match.";
    if (next === current)
      return "New password must differ from the current password.";
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status.kind === "saving") return;
    const err = localError();
    if (err) {
      setStatus({ kind: "err", message: err });
      return;
    }
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: current,
          newPassword: next,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      reset();
      setStatus({ kind: "ok" });
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
          Password
        </h3>
        <div
          className="muted"
          style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.5 }}
        >
          Enter your current password and pick a new one. Minimum {MIN_PW}{" "}
          characters.
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="settings-current-pw">
          Current password
        </label>
        <input
          id="settings-current-pw"
          type="password"
          className="input"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          disabled={status.kind === "saving"}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <div className="field">
          <label className="label" htmlFor="settings-new-pw">
            New password
          </label>
          <input
            id="settings-new-pw"
            type="password"
            className="input"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            disabled={status.kind === "saving"}
            minLength={MIN_PW}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="settings-confirm-pw">
            Confirm new password
          </label>
          <input
            id="settings-confirm-pw"
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            disabled={status.kind === "saving"}
            minLength={MIN_PW}
          />
        </div>
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
          Password updated.
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
          disabled={status.kind === "saving"}
        >
          {status.kind === "saving" ? "Updating…" : "Update password"}
        </button>
      </div>
    </form>
  );
}
