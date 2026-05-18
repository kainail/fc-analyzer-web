"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowL, ArrowR } from "@/lib/icons";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const slugTouchedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{
    email: string;
    inviteId: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slugTouchedRef.current) setSlug(slugify(name));
  }, [name]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const slugValid = /^[a-z0-9-]+$/.test(slug);
  const canSubmit =
    !submitting &&
    emailValid &&
    name.trim().length > 0 &&
    slug.length > 0 &&
    slugValid;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim(), slug }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        inviteId?: string;
        error?: string;
      };
      if (!res.ok || !body.success) {
        if (body.error === "slug_taken") {
          setError(`Slug "${slug}" is already taken — pick something else.`);
        } else {
          setError(body.error ?? `HTTP ${res.status}`);
        }
        setSubmitting(false);
        return;
      }
      setSuccess({ email: email.trim(), inviteId: body.inviteId ?? "" });
      setSubmitting(false);
      // The org now exists — refresh the parent admin table when the
      // user navigates back.
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
          {name} is ready to go
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
          they accept and complete sign-up, they&rsquo;ll be set up as the
          gym&rsquo;s owner automatically.
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
              setName("");
              setSlug("");
              slugTouchedRef.current = false;
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
          The gym&rsquo;s Organization is created immediately. Clerk emails
          the address below a sign-up link; the new account becomes the
          gym&rsquo;s owner once they accept.
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
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="invite-name">
            Gym name <span className="req">*</span>
          </label>
          <input
            id="invite-name"
            type="text"
            className="input"
            placeholder="e.g. Westside Strength"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoCapitalize="words"
            disabled={submitting}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="invite-slug">
            URL slug <span className="req">*</span>
            <span className="hint">lowercase, numbers, hyphens</span>
          </label>
          <input
            id="invite-slug"
            type="text"
            className="input"
            placeholder="westside-strength"
            value={slug}
            onChange={(e) => {
              slugTouchedRef.current = true;
              setSlug(e.target.value.toLowerCase());
            }}
            autoComplete="off"
            spellCheck={false}
            disabled={submitting}
          />
          {slug && !slugValid && (
            <div
              style={{
                fontSize: 11.5,
                color: "var(--score-red)",
                marginTop: 4,
              }}
            >
              Slug can only contain lowercase letters, numbers, and hyphens.
            </div>
          )}
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
