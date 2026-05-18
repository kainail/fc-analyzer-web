import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { isSuperAdmin } from "@/lib/super-admin";
import { Plus } from "@/lib/icons";
import { fmtDate } from "@/lib/format";
import GymRowActions from "./gym-row-actions";

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
    console.error("[admin] Clerk batch lookup failed:", err);
  }
  return out;
}

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!(await isSuperAdmin(userId))) redirect("/dashboard");

  // Single Prisma query that pulls every gym with the data the table
  // needs. Owner Membership comes through as a 1-element array
  // (Prisma doesn't have a "take exactly one related row" shortcut
  // beyond findFirst, which we'd need to do per-org — N+1).
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      memberships: {
        where: { role: "owner" },
        take: 1,
        select: { userId: true },
      },
      uploads: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
      _count: {
        select: {
          memberships: { where: { role: "rep" } },
          uploads: true,
        },
      },
    },
  });

  const ownerIds = Array.from(
    new Set(
      orgs
        .map((o) => o.memberships[0]?.userId)
        .filter((id): id is string => typeof id === "string"),
    ),
  );
  const ownerNames = await batchClerkNames(ownerIds);

  return (
    <div className="content wide">
      <div className="page-head">
        <div>
          <h2>Platform admin</h2>
          <div className="sub">
            Every gym on the platform. Super-admin-only — regular users
            land back on their own dashboard.
          </div>
        </div>
        <div className="page-head-actions">
          <Link href="/admin/super-admins" className="btn btn-secondary">
            Super admins
          </Link>
          <Link href="/admin/invite" className="btn btn-primary">
            <Plus size={15} /> Add gym owner
          </Link>
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.5fr 0.9fr 1.2fr 0.6fr 0.6fr 0.9fr 160px",
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
          <div>Gym</div>
          <div>Slug</div>
          <div>Owner</div>
          <div style={{ textAlign: "center" }}>Reps</div>
          <div style={{ textAlign: "center" }}>Uploads</div>
          <div>Last upload</div>
          <div style={{ textAlign: "right" }}>Actions</div>
        </div>

        {orgs.length === 0 ? (
          <div style={{ padding: "60px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
              No gyms yet
            </div>
            <div
              className="muted"
              style={{ fontSize: 12.5, marginBottom: 16 }}
            >
              Invite a gym owner to get started.
            </div>
            <Link href="/admin/invite" className="btn btn-primary btn-sm">
              <Plus size={13} /> Add gym owner
            </Link>
          </div>
        ) : (
          orgs.map((org, i) => {
            const ownerId = org.memberships[0]?.userId;
            const ownerName = ownerId
              ? (ownerNames.get(ownerId) ?? ownerId)
              : "—";
            const lastUpload = org.uploads[0]?.createdAt;
            return (
              <div
                key={org.id}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1.5fr 0.9fr 1.2fr 0.6fr 0.6fr 0.9fr 160px",
                  gap: 12,
                  padding: "13px 20px",
                  borderBottom:
                    i === orgs.length - 1
                      ? "none"
                      : "1px solid var(--divider)",
                  alignItems: "center",
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 500 }}>{org.name}</div>
                <div className="mono faint" style={{ fontSize: 12 }}>
                  {org.slug}
                </div>
                <div
                  style={{
                    color: "var(--ink-2)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {ownerName}
                </div>
                <div
                  className="mono"
                  style={{
                    textAlign: "center",
                    fontSize: 12.5,
                    color: "var(--ink-2)",
                  }}
                >
                  {org._count.memberships}
                </div>
                <div
                  className="mono"
                  style={{
                    textAlign: "center",
                    fontSize: 12.5,
                    color: "var(--ink-2)",
                  }}
                >
                  {org._count.uploads}
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 12, color: "var(--ink-3)" }}
                >
                  {lastUpload
                    ? fmtDate(lastUpload.toISOString().slice(0, 10))
                    : "—"}
                </div>
                <GymRowActions slug={org.slug} name={org.name} />
              </div>
            );
          })
        )}
      </div>

      <div
        className="muted"
        style={{ fontSize: 12, marginTop: 12, textAlign: "right" }}
      >
        {orgs.length} gym{orgs.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}
