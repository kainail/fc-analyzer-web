import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { isSuperAdmin } from "@/lib/super-admin";
import { listAnalyzedUploads, parseFilters } from "@/lib/dashboard-data";
import { ArrowL } from "@/lib/icons";
import { fmtDate, initials, scoreBand, bandClass } from "@/lib/format";
import RemoveMemberButton from "./remove-member-button";

export const dynamic = "force-dynamic";

type ClerkUserMin = {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  emailAddresses: { emailAddress: string }[];
  id: string;
};

function repDisplayName(u: ClerkUserMin): string {
  const first = (u.firstName ?? "").trim();
  const last = (u.lastName ?? "").trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  if (u.username?.trim()) return u.username.trim();
  const email = u.emailAddresses[0]?.emailAddress;
  return email ?? u.id;
}

async function batchClerkNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  try {
    const client = await clerkClient();
    const res = await client.users.getUserList({ userId: ids });
    for (const u of res.data) {
      out.set(
        u.id,
        repDisplayName({
          firstName: u.firstName,
          lastName: u.lastName,
          username: u.username,
          emailAddresses: u.emailAddresses.map((e) => ({
            emailAddress: e.emailAddress,
          })),
          id: u.id,
        }),
      );
    }
  } catch (err) {
    console.error("[admin/gym] Clerk batch lookup failed:", err);
  }
  return out;
}

function isSoldOutcome(outcome: string): boolean {
  return outcome.startsWith("sold-") || outcome === "transformation-challenge";
}

export default async function AdminGymPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!(await isSuperAdmin(userId))) redirect("/dashboard");

  const { slug } = await params;
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const org = await prisma.organization.findUnique({
    where: { slug },
    include: { memberships: true },
  });
  if (!org) {
    return (
      <div className="content narrow">
        <div style={{ marginBottom: 14 }}>
          <Link
            href="/admin"
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: -8 }}
          >
            <ArrowL size={13} /> Admin
          </Link>
        </div>
        <div className="card card-pad-lg">
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
            Gym not found
          </h2>
          <p
            style={{
              margin: "8px 0 0",
              color: "var(--ink-3)",
              fontSize: 13.5,
            }}
          >
            No organization with slug{" "}
            <span className="mono">{slug}</span>.
          </p>
        </div>
      </div>
    );
  }

  // Compute the per-member upload counts in a single groupBy so we
  // don't N+1 against Upload.
  const uploadCounts = await prisma.upload.groupBy({
    by: ["repUserId"],
    where: { orgId: org.id },
    _count: { _all: true },
  });
  const uploadsByUser = new Map<string, number>(
    uploadCounts.map((u) => [u.repUserId, u._count._all]),
  );

  const memberIds = org.memberships.map((m) => m.userId);
  const names = await batchClerkNames(memberIds);

  // Re-use the dashboard data layer for the analyses table — same
  // shape the gym owner sees, just scoped to this org from the super
  // admin's perspective.
  const rows = await listAnalyzedUploads(org.id, filters);

  // Order: owners first, then by name.
  const members = [...org.memberships].sort((a, b) => {
    if (a.role !== b.role) {
      if (a.role === "owner") return -1;
      if (b.role === "owner") return 1;
    }
    const an = names.get(a.userId) ?? a.userId;
    const bn = names.get(b.userId) ?? b.userId;
    return an.localeCompare(bn);
  });

  return (
    <div className="content wide">
      <div style={{ marginBottom: 14 }}>
        <Link
          href="/admin"
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: -8 }}
        >
          <ArrowL size={13} /> Admin
        </Link>
      </div>

      <div className="page-head">
        <div>
          <h2>{org.name}</h2>
          <div className="sub">
            <span className="mono">{org.slug}</span> ·{" "}
            {org.memberships.length} member
            {org.memberships.length === 1 ? "" : "s"} · {rows.length} analyzed
            consultation{rows.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* Members table */}
      <section style={{ marginBottom: 22 }}>
        <h3
          className="mono"
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: "var(--ink-4)",
            textTransform: "uppercase",
            margin: "0 0 8px",
          }}
        >
          Members
        </h3>
        <div className="card" style={{ overflow: "hidden" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 0.8fr 0.7fr 120px",
              padding: "11px 20px",
              background: "var(--surface-2)",
              borderBottom: "1px solid var(--border)",
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--ink-4)",
              gap: 12,
            }}
          >
            <div>Member</div>
            <div>Role</div>
            <div style={{ textAlign: "center" }}>Uploads</div>
            <div style={{ textAlign: "right" }}>Actions</div>
          </div>
          {members.length === 0 ? (
            <div
              style={{
                padding: "32px 20px",
                textAlign: "center",
                color: "var(--ink-3)",
                fontSize: 13,
              }}
            >
              No members.
            </div>
          ) : (
            members.map((m, i) => {
              const name = names.get(m.userId) ?? m.userId;
              const uploads = uploadsByUser.get(m.userId) ?? 0;
              return (
                <div
                  key={m.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.5fr 0.8fr 0.7fr 120px",
                    gap: 12,
                    padding: "12px 20px",
                    borderBottom:
                      i === members.length - 1
                        ? "none"
                        : "1px solid var(--divider)",
                    alignItems: "center",
                    fontSize: 13,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {name}
                    </div>
                    <div className="mono faint" style={{ fontSize: 11 }}>
                      {m.userId}
                    </div>
                  </div>
                  <div>
                    <span
                      className={
                        m.role === "owner"
                          ? "chip chip-primary"
                          : "chip chip-neutral"
                      }
                    >
                      {m.role}
                    </span>
                  </div>
                  <div
                    className="mono"
                    style={{
                      textAlign: "center",
                      fontSize: 12.5,
                      color: "var(--ink-2)",
                    }}
                  >
                    {uploads}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                    }}
                  >
                    <RemoveMemberButton
                      slug={org.slug}
                      userId={m.userId}
                      name={name}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Analyses table */}
      <section>
        <h3
          className="mono"
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: "var(--ink-4)",
            textTransform: "uppercase",
            margin: "0 0 8px",
          }}
        >
          Analyzed consultations
        </h3>
        <div className="card" style={{ overflow: "hidden" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "1.5fr 1.0fr 0.7fr 1.1fr 0.7fr 0.6fr 1.6fr",
              padding: "11px 20px",
              background: "var(--surface-2)",
              borderBottom: "1px solid var(--border)",
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--ink-4)",
              gap: 12,
            }}
          >
            <div>Prospect</div>
            <div>Rep</div>
            <div>Date</div>
            <div>Outcome</div>
            <div style={{ textAlign: "center" }}>Score</div>
            <div style={{ textAlign: "center" }}>Weak</div>
            <div>Drill focus</div>
          </div>
          {rows.length === 0 ? (
            <div
              style={{
                padding: "32px 20px",
                textAlign: "center",
                color: "var(--ink-3)",
                fontSize: 13,
              }}
            >
              No analyzed consultations yet.
            </div>
          ) : (
            rows.map((row, i) => {
              const sold = isSoldOutcome(row.outcome);
              const band = scoreBand(row.scores?.overall_score ?? null);
              return (
                <Link
                  key={row.upload_id}
                  href={`/analysis/${encodeURIComponent(row.upload_id)}`}
                  className="dash-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "1.5fr 1.0fr 0.7fr 1.1fr 0.7fr 0.6fr 1.6fr",
                    gap: 12,
                    padding: "13px 20px",
                    borderBottom:
                      i === rows.length - 1
                        ? "none"
                        : "1px solid var(--divider)",
                    alignItems: "center",
                    textDecoration: "none",
                    color: "inherit",
                    fontSize: 13,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        background: "var(--surface-sunken)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        fontWeight: 600,
                        color: "var(--ink-3)",
                        flexShrink: 0,
                      }}
                    >
                      {initials(row.prospect)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 500,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {row.prospect}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {row.rep}
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 12.5, color: "var(--ink-2)" }}
                  >
                    {fmtDate(row.consultation_date)}
                  </div>
                  <div>
                    <span
                      className={`chip ${sold ? "chip-sold" : "chip-notsold"}`}
                    >
                      <span className="dot" />
                      {row.outcome}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    {row.scores?.overall_score != null ? (
                      <span className={`score-pill ${bandClass(band)}`}>
                        {row.scores.overall_score.toFixed(1)}
                      </span>
                    ) : (
                      <span className="mono faint" style={{ fontSize: 12 }}>
                        —
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    {row.scores?.weak_stage_count ? (
                      <span
                        className="mono"
                        style={{ fontSize: 12, fontWeight: 600 }}
                      >
                        {row.scores.weak_stage_count}
                      </span>
                    ) : (
                      <span className="mono faint" style={{ fontSize: 12 }}>
                        —
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--ink-2)",
                      minWidth: 0,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={row.scores?.primary_focus_skill ?? ""}
                  >
                    {row.scores?.primary_focus_skill ?? (
                      <span className="faint">—</span>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
