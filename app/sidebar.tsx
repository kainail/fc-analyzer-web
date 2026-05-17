"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Grid,
  Upload as UploadIcon,
  Activity,
  Settings,
} from "@/lib/icons";

function isActive(pathname: string, kind: "dashboard" | "upload" | "processing") {
  if (kind === "dashboard") {
    return pathname.startsWith("/dashboard") || pathname.startsWith("/analysis");
  }
  if (kind === "upload") return pathname === "/";
  if (kind === "processing") return pathname.startsWith("/status");
  return false;
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">FC</div>
        <div style={{ minWidth: 0 }}>
          <div className="brand-name">FC Analyzer</div>
          <div className="brand-sub">v4.2.1</div>
        </div>
      </div>

      <div className="nav-section">Workspace</div>
      <Link
        href="/dashboard"
        className={"nav-item" + (isActive(pathname, "dashboard") ? " active" : "")}
      >
        <Grid /> Consultations
      </Link>
      <Link
        href="/"
        className={"nav-item" + (isActive(pathname, "upload") ? " active" : "")}
      >
        <UploadIcon /> New upload
      </Link>
      <Link
        href="/dashboard"
        className={"nav-item" + (isActive(pathname, "processing") ? " active" : "")}
      >
        <Activity /> Processing
      </Link>

      <div className="sidebar-foot">
        <div className="avatar">CS</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            className="user-name"
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Cam Singh
          </div>
          <div className="user-role">Regional manager</div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          style={{ width: 28, padding: 0 }}
          aria-label="Settings"
          type="button"
        >
          <Settings size={14} />
        </button>
      </div>
    </aside>
  );
}
