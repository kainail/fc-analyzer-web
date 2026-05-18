import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import OnboardingForm from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  // If the user already has a membership, they don't belong here.
  const existing = await prisma.membership.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (existing) {
    redirect("/dashboard");
  }

  // Invite path: super-admin-initiated signups carry the pre-created
  // org id in Clerk publicMetadata (see /api/admin/invite). If we see
  // it AND the org still exists, auto-create the owner Membership and
  // skip the form entirely. If the org has been deleted between
  // invite-send and accept, fall through to the normal form so the
  // user can still create a gym manually.
  const user = await currentUser();
  const meta = (user?.publicMetadata ?? {}) as {
    invitedOrgId?: string;
    invitedRole?: string;
  };
  if (meta.invitedOrgId) {
    const org = await prisma.organization.findUnique({
      where: { id: meta.invitedOrgId },
      select: { id: true },
    });
    if (org) {
      try {
        await prisma.membership.create({
          data: {
            userId,
            orgId: org.id,
            role: meta.invitedRole === "rep" ? "rep" : "owner",
          },
        });
      } catch (err) {
        // P2002 = the (userId, orgId) tuple already exists. Treat
        // as success — somebody else (or a retry) already wired it
        // up; we just want to get them to the dashboard.
        if (
          !(
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2002"
          )
        ) {
          throw err;
        }
      }
      redirect("/dashboard");
    }
  }

  return (
    <div
      style={{
        minHeight: "calc(100vh - 0px)",
        display: "grid",
        placeItems: "center",
        padding: "32px 16px",
      }}
    >
      <div
        className="card card-pad-lg"
        style={{
          width: "100%",
          maxWidth: 460,
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <div
            className="mono"
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: "var(--ink-4)",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Welcome
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            Set up your gym
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              color: "var(--ink-3)",
              fontSize: 13.5,
              lineHeight: 1.5,
            }}
          >
            One quick step before you can upload consultations. Pick a name
            and a URL slug for your gym.
          </p>
        </div>

        <OnboardingForm />

        <div
          style={{
            marginTop: 18,
            paddingTop: 14,
            borderTop: "1px solid var(--divider)",
            color: "var(--ink-4)",
            fontSize: 12,
          }}
        >
          You&rsquo;ll be the owner. You can invite reps after setup.
        </div>
      </div>
    </div>
  );
}
