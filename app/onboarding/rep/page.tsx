import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { Sparkle } from "@/lib/icons";
import GoToDashboardButton from "./go-to-dashboard-button";

export const dynamic = "force-dynamic";

export default async function RepOnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  const meta = (user?.publicMetadata ?? {}) as {
    invitedOrgId?: unknown;
    invitedRole?: unknown;
  };

  // Hard requirements for this screen: rep invite metadata. If the
  // user landed here without it (manual URL typing, expired cookie,
  // etc.) bounce them to the regular onboarding entry point.
  if (meta.invitedRole !== "rep" || typeof meta.invitedOrgId !== "string") {
    redirect("/onboarding");
  }

  const org = await prisma.organization.findUnique({
    where: { id: meta.invitedOrgId },
    select: { name: true },
  });
  if (!org) {
    // The org was deleted between invite-send and accept. Fall back
    // to the regular onboarding screen, which renders a friendly
    // "create your own gym" form.
    redirect("/onboarding");
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
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "var(--primary)",
            color: "#fff",
            marginBottom: 18,
          }}
        >
          <Sparkle size={26} />
        </div>

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
          You&rsquo;re in
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          Welcome to {org.name}
        </h1>
        <p
          style={{
            margin: "10px 0 22px",
            color: "var(--ink-3)",
            fontSize: 13.5,
            lineHeight: 1.55,
          }}
        >
          You&rsquo;re all set as a rep. Upload your first consultation
          recording from the dashboard whenever you&rsquo;re ready.
        </p>

        <GoToDashboardButton />
      </div>
    </div>
  );
}
