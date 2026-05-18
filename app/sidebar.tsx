"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import {
  Grid,
  Upload as UploadIcon,
  Activity,
  LogOut,
  Settings,
  TrendUp,
} from "@/lib/icons";

export type SidebarRole = "owner" | "manager" | "rep" | null;

function isActive(
  pathname: string,
  kind:
    | "dashboard"
    | "upload"
    | "processing"
    | "reps"
    | "admin",
) {
  if (kind === "dashboard") {
    return (
      pathname.startsWith("/dashboard") || pathname.startsWith("/analysis")
    );
  }
  if (kind === "upload") return pathname === "/";
  if (kind === "processing") return pathname.startsWith("/status");
  if (kind === "reps") return pathname.startsWith("/reps");
  if (kind === "admin") return pathname.startsWith("/admin");
  return false;
}

export default function Sidebar({
  role,
  isSuperAdmin,
}: {
  role: SidebarRole;
  isSuperAdmin: boolean;
}) {
  const pathname = usePathname();
  const canManageReps = role === "owner" || role === "manager";

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
        className={
          "nav-item" + (isActive(pathname, "dashboard") ? " active" : "")
        }
      >
        <Grid /> Consultations
      </Link>
      <Link
        href="/"
        className={
          "nav-item" + (isActive(pathname, "upload") ? " active" : "")
        }
      >
        <UploadIcon /> New upload
      </Link>
      <Link
        href="/dashboard"
        className={
          "nav-item" + (isActive(pathname, "processing") ? " active" : "")
        }
      >
        <Activity /> Processing
      </Link>
      {canManageReps && (
        <Link
          href="/reps"
          className={
            "nav-item" + (isActive(pathname, "reps") ? " active" : "")
          }
        >
          <TrendUp /> Reps
        </Link>
      )}

      {isSuperAdmin && (
        <>
          <div className="nav-section">Platform</div>
          <Link
            href="/admin"
            className={
              "nav-item" + (isActive(pathname, "admin") ? " active" : "")
            }
          >
            <Settings /> Admin
          </Link>
        </>
      )}

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
          <div className="user-role">
            {role
              ? role === "owner"
                ? "Gym owner"
                : role === "manager"
                  ? "Manager"
                  : "Rep"
              : isSuperAdmin
                ? "Super admin"
                : "Signed in"}
          </div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          style={{ width: 28, padding: 0 }}
          aria-label="Settings"
          type="button"
        >
          <Settings size={14} />
        </button>
        {/* Clerk's SignOutButton wraps a child and adds an onClick that
         *  signs the user out + navigates. asChild lets our styled
         *  button be the actual rendered element rather than nesting
         *  inside Clerk's default button (which would double up the
         *  click surface and the styling). */}
        <SignOutButton>
          <button
            className="btn btn-ghost btn-sm"
            style={{ width: 28, padding: 0 }}
            aria-label="Sign out"
            type="button"
          >
            <LogOut size={14} />
          </button>
        </SignOutButton>
      </div>
    </aside>
  );
}
