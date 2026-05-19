"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "@/lib/icons";

type Notification = {
  id: string;
  type: "analysis_ready" | "upload_failed";
  read: boolean;
  createdAt: string;
  uploadId: string;
  prospectName: string;
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function describe(n: Notification): string {
  if (n.type === "analysis_ready") {
    return `Analysis ready — ${n.prospectName}`;
  }
  return `Upload failed — ${n.prospectName}`;
}

export default function NotificationBell({
  initialUnreadCount,
}: {
  initialUnreadCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(initialUnreadCount);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [markBusy, setMarkBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Lazy-load items on first open. Re-fetch every open so the list
  // reflects whatever the analyze pipeline created since the last
  // glance.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/notifications", { cache: "no-store" })
      .then((r) => r.json())
      .then((body: { rows?: Notification[] }) => {
        setItems(body.rows ?? []);
      })
      .catch((err) => {
        console.error("[bell] fetch failed:", err);
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [open]);

  async function markAllRead() {
    if (markBusy || count === 0) return;
    setMarkBusy(true);
    try {
      const res = await fetch("/api/notifications/read", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCount(0);
      setItems((prev) =>
        prev ? prev.map((n) => ({ ...n, read: true })) : prev,
      );
      // Refresh server components (other places might display
      // unread counts in the future).
      router.refresh();
    } catch (err) {
      console.error("[bell] mark-read failed:", err);
    } finally {
      setMarkBusy(false);
    }
  }

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", display: "inline-block" }}
    >
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ width: 30, padding: 0, position: "relative" }}
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={15} />
        {count > 0 && (
          <span
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 999,
              background: "var(--score-red)",
              color: "#fff",
              fontSize: 9.5,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              display: "grid",
              placeItems: "center",
              lineHeight: 1,
            }}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 340,
            maxWidth: "calc(100vw - 24px)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--shadow-3)",
            zIndex: 100,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "10px 14px",
              borderBottom: "1px solid var(--divider)",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              Notifications
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={markAllRead}
              disabled={markBusy || count === 0}
              style={{ height: 24, fontSize: 11.5 }}
            >
              {markBusy ? "…" : "Mark all read"}
            </button>
          </div>

          <div style={{ maxHeight: 380, overflowY: "auto" }}>
            {loading && (
              <div
                style={{
                  padding: "24px 14px",
                  textAlign: "center",
                  color: "var(--ink-3)",
                  fontSize: 12.5,
                }}
              >
                Loading…
              </div>
            )}
            {!loading && items !== null && items.length === 0 && (
              <div
                style={{
                  padding: "24px 14px",
                  textAlign: "center",
                  color: "var(--ink-3)",
                  fontSize: 12.5,
                }}
              >
                No notifications yet.
              </div>
            )}
            {!loading &&
              items?.map((n) => (
                <Link
                  key={n.id}
                  href={`/analysis/${encodeURIComponent(n.uploadId)}`}
                  onClick={() => setOpen(false)}
                  style={{
                    display: "block",
                    padding: "10px 14px",
                    borderBottom: "1px solid var(--divider)",
                    background: n.read
                      ? "transparent"
                      : "var(--primary-tint)",
                    color: "inherit",
                    textDecoration: "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: n.read ? 400 : 600,
                      color:
                        n.type === "upload_failed"
                          ? "var(--score-red)"
                          : "var(--ink)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {describe(n)}
                  </div>
                  <div
                    className="mono faint"
                    style={{ fontSize: 11, marginTop: 2 }}
                  >
                    {timeAgo(n.createdAt)}
                  </div>
                </Link>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
