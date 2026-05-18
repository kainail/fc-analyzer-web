"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "@/lib/icons";

export default function InviteRepForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEmail("");
    setName("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setError("Enter a valid email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reps/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: v, name: name.trim() || undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setOpen(true)}
      >
        <Plus size={15} /> Invite rep
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="card card-pad"
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-end",
        flexWrap: "wrap",
        marginBottom: 14,
      }}
    >
      <div className="field" style={{ flex: 2, minWidth: 220 }}>
        <label className="label" htmlFor="rep-invite-email">
          Email <span className="req">*</span>
        </label>
        <input
          id="rep-invite-email"
          type="email"
          className="input"
          placeholder="rep@gym.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          required
        />
      </div>
      <div className="field" style={{ flex: 1, minWidth: 180 }}>
        <label className="label" htmlFor="rep-invite-name">
          Name <span className="hint">optional</span>
        </label>
        <input
          id="rep-invite-name"
          type="text"
          className="input"
          placeholder="e.g. Maya Soto"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoCapitalize="words"
          disabled={busy}
        />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            if (!busy) {
              setOpen(false);
              reset();
            }
          }}
          disabled={busy}
        >
          <X size={14} /> Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          <Plus size={15} /> {busy ? "Sending…" : "Send invite"}
        </button>
      </div>
      {error && (
        <div
          role="alert"
          style={{
            flexBasis: "100%",
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
