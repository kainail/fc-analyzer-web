import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
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
