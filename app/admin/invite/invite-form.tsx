"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowL, ArrowR } from "@/lib/icons";

export default function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{
    email: string;
    inviteId: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = !submitting && emailValid;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        inviteId?: string;
        error?: string;
      };
      if (!res.ok || !body.success) {
        setError(body.error ?? `HTTP ${res.status}`);
        setSubmitting(false);
        return;
      }
      setSuccess({ email: email.trim(), inviteId: body.inviteId ?? "" });
      setSubmitting(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="card card-pad-lg">
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: "var(--score-green)",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Invitation sent
        </div>
        <h2
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          Owner invited
        </h2>
        <p
          style={{
            margin: "10px 0 8px",
            color: "var(--ink-2)",
            fontSize: 13.5,
            lineHeight: 1.55,
          }}
        >
          We emailed{" "}
          <span className="mono">{success.email}</span> a sign-up link. When
          they complete sign-up they&rsquo;ll be sent to a page to name
          and slug their own gym.
        </p>
        <div
          className="muted mono"
          style={{ fontSize: 11.5, marginBottom: 16 }}
        >
          Clerk invitation id: {success.inviteId}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin" className="btn btn-primary">
            Back to admin <ArrowR size={15} />
          </Link>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSuccess(null);
              setEmail("");
            }}
          >
            Invite another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card card-pad-lg">
      <div style={{ marginBottom: 18 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          Invite a gym owner
        </h2>
        <p
          style={{
            margin: "8px 0 0",
            color: "var(--ink-3)",
            fontSize: 13.5,
            lineHeight: 1.5,
          }}
        >
          Clerk emails the address below a sign-up link. After they sign
          up they&rsquo;ll land on the onboarding form where they pick
          their own gym name and slug.
        </p>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        <div className="field">
          <label className="label" htmlFor="invite-email">
            Owner email <span className="req">*</span>
          </label>
          <input
            id="invite-email"
            type="email"
            className="input"
            placeholder="owner@gym.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={submitting}
            required
            autoFocus
          />
        </div>

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
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 4,
          }}
        >
          <Link href="/admin" className="btn btn-secondary">
            <ArrowL size={13} /> Cancel
          </Link>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!canSubmit}
          >
            {submitting ? "Sending…" : "Send invitation"}{" "}
            <ArrowR size={15} />
          </button>
        </div>
      </div>
    </form>
  );
}
