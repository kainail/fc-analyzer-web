"use client";

import { useState } from "react";
import { Sparkle, X } from "@/lib/icons";

export default function WelcomeBanner() {
  const [open, setOpen] = useState(true);

  function dismiss() {
    // Clear the session cookie so the banner doesn't reappear on
    // subsequent loads in this session. Cookie was set non-HttpOnly
    // by /api/onboarding specifically so this is possible.
    document.cookie = "show-welcome=; Max-Age=0; Path=/; SameSite=Lax";
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        marginBottom: 14,
        border: "1px solid var(--primary-200)",
        background: "var(--primary-tint)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "var(--primary)",
          color: "#fff",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <Sparkle size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 13.5,
            color: "var(--ink)",
            marginBottom: 2,
          }}
        >
          Welcome to FC Analyzer
        </div>
        <div
          style={{
            color: "var(--ink-2)",
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          Your gym is set up. Invite your first rep to get started.
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="btn btn-ghost btn-sm"
        style={{ width: 28, padding: 0, flexShrink: 0 }}
        aria-label="Dismiss welcome banner"
      >
        <X size={14} />
      </button>
    </div>
  );
}
