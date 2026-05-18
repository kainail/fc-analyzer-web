import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { canDeleteSuperAdmin, isSuperAdmin } from "@/lib/super-admin";
import { ArrowL } from "@/lib/icons";
import { fmtDateLong } from "@/lib/format";
import AddSuperAdminForm from "./add-form";
import RemoveSuperAdminButton from "./remove-button";

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
    console.error("[admin/super-admins] Clerk batch lookup failed:", err);
  }
  return out;
}

export default async function SuperAdminsPage() {
  const { userId: callerId } = await auth();
  if (!callerId) redirect("/sign-in");
  if (!(await isSuperAdmin(callerId))) redirect("/dashboard");

  const rows = await prisma.superAdmin.findMany({
    orderBy: { createdAt: "asc" },
  });

  // Resolve display names for both the super admin AND their grantor
  // in one Clerk call.
  const allIds = Array.from(
    new Set(rows.flatMap((r) => [r.userId, r.addedBy])),
  );
  const names = await batchClerkNames(allIds);

  return (
    <div className="content">
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
          <h2>Super admins</h2>
          <div className="sub">
            Platform-level grants. Any super admin can add others;
            removing other super admins is restricted to the seed
            account (SUPER_ADMIN_SEED_ID).
          </div>
        </div>
      </div>

      <AddSuperAdminForm />

      <div className="card" style={{ overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1.2fr 1.1fr 120px",
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
          <div>Super admin</div>
          <div>Added by</div>
          <div>Date added</div>
          <div style={{ textAlign: "right" }}>Actions</div>
        </div>

        {rows.length === 0 ? (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "var(--ink-3)",
              fontSize: 13,
            }}
          >
            No super admins. (How did you reach this page?)
          </div>
        ) : (
          rows.map((row, i) => {
            const isSelf = row.userId === callerId;
            const isSelfGrant = row.userId === row.addedBy;
            const canRemove =
              !isSelf && canDeleteSuperAdmin(callerId, row.userId);
            const targetName = names.get(row.userId) ?? row.userId;
            const grantorName = isSelfGrant
              ? `${targetName} (self)`
              : (names.get(row.addedBy) ?? row.addedBy);
            return (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.4fr 1.2fr 1.1fr 120px",
                  gap: 12,
                  padding: "13px 20px",
                  borderBottom:
                    i === rows.length - 1
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
                    {targetName}
                    {isSelf && (
                      <span
                        className="chip chip-primary"
                        style={{ marginLeft: 8 }}
                      >
                        you
                      </span>
                    )}
                  </div>
                  <div className="mono faint" style={{ fontSize: 11 }}>
                    {row.userId}
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
                  {grantorName}
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 12, color: "var(--ink-3)" }}
                >
                  {fmtDateLong(row.createdAt.toISOString().slice(0, 10))}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  {canRemove ? (
                    <RemoveSuperAdminButton
                      userId={row.userId}
                      name={targetName}
                    />
                  ) : (
                    <span
                      className="mono faint"
                      style={{ fontSize: 11 }}
                      title={
                        isSelf
                          ? "You can't remove yourself"
                          : "Only the seed super admin can remove other super admins"
                      }
                    >
                      —
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div
        className="muted"
        style={{ fontSize: 12, marginTop: 12, textAlign: "right" }}
      >
        {rows.length} super admin{rows.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}
