import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { fmtDate, fmtDateLong } from "@/lib/format";
import InviteRepForm from "./invite-form";
import RemoveRepButton from "./remove-rep-button";
import PendingRowActions from "./pending-row-actions";

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

type RepInfo = { name: string; email: string };

async function batchClerkInfo(
  ids: string[],
): Promise<Map<string, RepInfo>> {
  const out = new Map<string, RepInfo>();
  if (ids.length === 0) return out;
  try {
    const client = await clerkClient();
    const res = await client.users.getUserList({ userId: ids });
    for (const u of res.data) {
      out.set(u.id, {
        name: repDisplayName({
          firstName: u.firstName,
          lastName: u.lastName,
          username: u.username,
          emailAddresses: u.emailAddresses.map((e) => ({
            emailAddress: e.emailAddress,
          })),
          id: u.id,
        }),
        email: u.emailAddresses[0]?.emailAddress ?? "",
      });
    }
  } catch (err) {
    console.error("[reps] Clerk batch lookup failed:", err);
  }
  return out;
}

export default async function RepsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Owner / manager only. Reps land on the dashboard with no nav
  // visible into this page anyway, but a typed URL needs handling.
  const callerMembership = await prisma.membership.findFirst({
    where: { userId },
    include: { org: true },
  });
  if (!callerMembership) redirect("/onboarding");
  if (
    callerMembership.role !== "owner" &&
    callerMembership.role !== "manager"
  ) {
    redirect("/dashboard");
  }

  const orgId = callerMembership.orgId;

  // All rep Memberships for the org — both active and pending live
  // in the same table, distinguished by the userId prefix.
  const repRows = await prisma.membership.findMany({
    where: { orgId, role: "rep" },
    orderBy: { createdAt: "asc" },
  });
  const active = repRows.filter((r) => !r.userId.startsWith("pending_"));
  const pending = repRows.filter((r) => r.userId.startsWith("pending_"));

  // Active reps: Clerk name/email + per-user upload count and most
  // recent upload date.
  const activeIds = active.map((r) => r.userId);
  const [info, uploadCounts] = await Promise.all([
    batchClerkInfo(activeIds),
    prisma.upload.groupBy({
      by: ["repUserId"],
      where: { orgId, repUserId: { in: activeIds } },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
  ]);
  const uploadsByUser = new Map(
    uploadCounts.map((u) => [
      u.repUserId,
      { count: u._count._all, last: u._max.createdAt },
    ]),
  );

  // Pending invites: cross-reference the pending Membership rows with
  // the live Clerk invitation list (status=pending) to get email +
  // sent-at. If Clerk drops an invitation that we still have a
  // pending row for, render it as best-effort with placeholder text
  // — the row can be cancelled via the UI to clean up.
  const pendingInviteIds = pending.map((p) =>
    p.userId.replace(/^pending_/, ""),
  );
  let clerkInvitations: Array<{
    id: string;
    emailAddress: string;
    createdAt: number;
    publicMetadata: unknown;
  }> = [];
  if (pendingInviteIds.length > 0) {
    try {
      const client = await clerkClient();
      const list = await client.invitations.getInvitationList({
        status: "pending",
        limit: 100,
      });
      clerkInvitations = list.data.map((i) => ({
        id: i.id,
        emailAddress: i.emailAddress,
        createdAt: i.createdAt,
        publicMetadata: i.publicMetadata,
      }));
    } catch (err) {
      console.error("[reps] failed to list Clerk invitations:", err);
    }
  }
  const invitationsById = new Map(
    clerkInvitations.map((i) => [i.id, i]),
  );

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h2>Reps</h2>
          <div className="sub">
            {callerMembership.org.name} ·{" "}
            <span className="mono">{callerMembership.org.slug}</span> · invite,
            remove, and track activity for your team.
          </div>
        </div>
        <div className="page-head-actions">
          <InviteRepForm />
        </div>
      </div>

      {/* Active reps */}
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
          Active reps · {active.length}
        </h3>
        <div className="card" style={{ overflow: "hidden" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1.4fr 0.6fr 0.9fr 110px",
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
            <div>Name</div>
            <div>Email</div>
            <div style={{ textAlign: "center" }}>Uploads</div>
            <div>Last upload</div>
            <div style={{ textAlign: "right" }}>Actions</div>
          </div>
          {active.length === 0 ? (
            <div
              style={{
                padding: "32px 20px",
                textAlign: "center",
                color: "var(--ink-3)",
                fontSize: 13,
              }}
            >
              No active reps yet. Invite one with the button above.
            </div>
          ) : (
            active.map((m, i) => {
              const meta = info.get(m.userId);
              const stats = uploadsByUser.get(m.userId);
              const name = meta?.name ?? m.userId;
              const email = meta?.email ?? "—";
              const last = stats?.last;
              return (
                <div
                  key={m.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "1.2fr 1.4fr 0.6fr 0.9fr 110px",
                    gap: 12,
                    padding: "12px 20px",
                    borderBottom:
                      i === active.length - 1
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
                  <div
                    style={{
                      color: "var(--ink-2)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {email}
                  </div>
                  <div
                    className="mono"
                    style={{
                      textAlign: "center",
                      fontSize: 12.5,
                      color: "var(--ink-2)",
                    }}
                  >
                    {stats?.count ?? 0}
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 12, color: "var(--ink-3)" }}
                  >
                    {last
                      ? fmtDate(last.toISOString().slice(0, 10))
                      : "—"}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <RemoveRepButton userId={m.userId} name={name} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Pending invites */}
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
          Pending invites · {pending.length}
        </h3>
        <div className="card" style={{ overflow: "hidden" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 1.1fr 200px",
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
            <div>Email</div>
            <div>Invited</div>
            <div style={{ textAlign: "right" }}>Actions</div>
          </div>
          {pending.length === 0 ? (
            <div
              style={{
                padding: "32px 20px",
                textAlign: "center",
                color: "var(--ink-3)",
                fontSize: 13,
              }}
            >
              No outstanding invites.
            </div>
          ) : (
            pending.map((p, i) => {
              const inviteId = p.userId.replace(/^pending_/, "");
              const inv = invitationsById.get(inviteId);
              const email = inv?.emailAddress ?? "(unknown — Clerk lost it)";
              const invitedAt = inv?.createdAt
                ? new Date(inv.createdAt)
                : p.createdAt;
              return (
                <div
                  key={p.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.6fr 1.1fr 200px",
                    gap: 12,
                    padding: "12px 20px",
                    borderBottom:
                      i === pending.length - 1
                        ? "none"
                        : "1px solid var(--divider)",
                    alignItems: "center",
                    fontSize: 13,
                  }}
                >
                  <div
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {email}
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 12, color: "var(--ink-3)" }}
                  >
                    {fmtDateLong(invitedAt.toISOString().slice(0, 10))}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                    }}
                  >
                    <PendingRowActions
                      inviteId={inviteId}
                      email={email}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
