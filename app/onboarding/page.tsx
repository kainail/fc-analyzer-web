import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import OnboardingForm from "./onboarding-form";
import ActivateInvite from "./activate-invite";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  // Already a member of some org → /dashboard, no work to do here.
  const existing = await prisma.membership.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (existing) {
    redirect("/dashboard");
  }

  // Invite path: Clerk publicMetadata carries the invitedOrgId +
  // invitedRole the inviter set. If BOTH are present we render the
  // ActivateInvite client which POSTs to /api/onboarding/activate
  // (single source of truth for invite → Membership). That route
  // does its own validation — we just check for presence here to
  // decide which UI to show.
  //
  // PREVIOUS BUG: the old version of this file did the membership
  // create inline in the server component, defaulting role to
  // "owner" whenever invitedRole !== "rep". Any rep invite where
  // the metadata didn't round-trip cleanly silently promoted the
  // invitee to owner. The activate route's parseRole is strict
  // and rejects unknown values instead of defaulting.
  const user = await currentUser();
  const meta = (user?.publicMetadata ?? {}) as {
    invitedOrgId?: unknown;
    invitedRole?: unknown;
  };
  const hasInvite =
    typeof meta.invitedOrgId === "string" &&
    meta.invitedOrgId.length > 0 &&
    (meta.invitedRole === "owner" ||
      meta.invitedRole === "manager" ||
      meta.invitedRole === "rep");

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
            {hasInvite ? "Joining your team…" : "Set up your gym"}
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              color: "var(--ink-3)",
              fontSize: 13.5,
              lineHeight: 1.5,
            }}
          >
            {hasInvite
              ? "Your invitation is being activated — you'll land on the dashboard in a moment."
              : "One quick step before you can upload consultations. Pick a name and a URL slug for your gym."}
          </p>
        </div>

        {hasInvite ? <ActivateInvite /> : <OnboardingForm />}

        {!hasInvite && (
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
        )}
      </div>
    </div>
  );
}
