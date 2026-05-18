"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowR } from "@/lib/icons";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function OnboardingForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // Once the user manually edits the slug, stop auto-deriving from name.
  // Otherwise typing in the name field would clobber their manual slug.
  const slugTouchedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slugTouchedRef.current) {
      setSlug(slugify(name));
    }
  }, [name]);

  const slugValid = /^[a-z0-9-]+$/.test(slug);
  const canSubmit =
    !submitting && name.trim().length > 0 && slug.length > 0 && slugValid;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !body.success) {
        if (body.error === "slug_taken") {
          setError(
            `Slug "${slug}" is already taken — pick something else.`,
          );
        } else {
          setError(body.error ?? `HTTP ${res.status}`);
        }
        setSubmitting(false);
        return;
      }
      // Hard navigation (not router.push) so the new has-membership
      // cookie is picked up by middleware on a fresh request rather
      // than relying on RSC payload updates from the soft transition.
      // router.push + router.refresh left a brief blank-page window
      // because middleware's cookie read was racing the soft nav.
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
      <div className="field">
        <label className="label" htmlFor="onboarding-name">
          Gym name <span className="req">*</span>
        </label>
        <input
          id="onboarding-name"
          type="text"
          className="input"
          placeholder="e.g. Osage Beach"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          autoCapitalize="words"
          autoFocus
          disabled={submitting}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="onboarding-slug">
          URL slug <span className="req">*</span>
          <span className="hint">lowercase letters, numbers, hyphens</span>
        </label>
        <input
          id="onboarding-slug"
          type="text"
          className="input"
          placeholder="osage-beach"
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
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary"
        disabled={!canSubmit}
        style={{ marginTop: 4 }}
      >
        {submitting ? "Creating…" : "Create my gym"} <ArrowR size={15} />
      </button>
    </form>
  );
}
