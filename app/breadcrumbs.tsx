"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Fragment } from "react";
import { Chevron } from "@/lib/icons";

type Crumb = { label: string; href?: string };

function buildCrumbs(
  pathname: string,
  params: Record<string, string | string[] | undefined>,
): Crumb[] {
  if (pathname === "/") {
    return [
      { label: "Dashboard", href: "/dashboard" },
      { label: "New upload" },
    ];
  }
  if (pathname.startsWith("/dashboard")) {
    return [{ label: "Dashboard" }];
  }
  if (pathname.startsWith("/status")) {
    const id = typeof params.upload_id === "string" ? params.upload_id : "";
    return [
      { label: "Dashboard", href: "/dashboard" },
      { label: id ? `Status · ${id}` : "Upload status" },
    ];
  }
  if (pathname.startsWith("/analysis")) {
    const id = typeof params.upload_id === "string" ? params.upload_id : "";
    return [
      { label: "Dashboard", href: "/dashboard" },
      { label: id ? `Analysis · ${id}` : "Analysis" },
    ];
  }
  return [{ label: "Dashboard", href: "/dashboard" }];
}

export default function Breadcrumbs() {
  const pathname = usePathname();
  const params = useParams();
  const crumbs = buildCrumbs(pathname, params);

  return (
    <div className="crumbs">
      {crumbs.map((c, i) => (
        <Fragment key={i}>
          {c.href ? (
            <Link href={c.href}>{c.label}</Link>
          ) : (
            <span style={{ color: "var(--ink)" }}>{c.label}</span>
          )}
          {i < crumbs.length - 1 && (
            <span className="crumb-sep">
              <Chevron size={12} />
            </span>
          )}
        </Fragment>
      ))}
    </div>
  );
}
