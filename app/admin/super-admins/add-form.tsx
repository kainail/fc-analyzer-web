"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "@/lib/icons";

export default function AddSuperAdminForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function looksLikeEmail(s: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }
  function looksLikeUserId(s: string) {
    return /^user_[A-Za-z0-9]+$/.test(s);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = identifier.trim();
    setError(null);
    if (!v) return;
    if (!looksLikeEmail(v) && !looksLikeUserId(v)) {
      setError(
        "Enter either a Clerk user id (user_…) or an email address.",
      );
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/super-admins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          looksLikeUserId(v) ? { userId: v } : { email: v },
        ),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setIdentifier("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginBottom: 18 }}>
      <div
        className="card card-pad"
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div className="field" style={{ flex: 1, minWidth: 240 }}>
          <label className="label" htmlFor="add-super-admin">
            Grant super admin{" "}
            <span className="hint">Clerk user id or email</span>
          </label>
          <input
            id="add-super-admin"
            type="text"
            className="input"
            placeholder="user_xxx or owner@gym.com"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !identifier.trim()}
        >
          <Plus size={15} /> {busy ? "Granting…" : "Grant"}
        </button>
      </div>
      {error && (
        <div
          role="alert"
          style={{
            marginTop: 8,
            padding: "8px 12px",
            background: "var(--score-red-bg)",
            color: "var(--score-red)",
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 500,
          }}
        >
          {error}
        </div>
      )}
    </form>
  );
}
