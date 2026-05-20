/**
 * /roleplay/[upload_id]
 *
 * Server component that loads the upload, validates tenant scope,
 * pulls the analysis JSON from R2, extracts the roleplay scenario
 * seed, then hands everything to the Game client component.
 *
 * Auth/scope behavior matches /analysis/[upload_id]: missing upload
 * or cross-org probes render a not-found page (no leak), and an
 * unanalyzed upload renders a "not ready" page.
 */
import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { downloadFromR2 } from "@/lib/r2";
import Game, { type RoleplaySeed } from "./game";

function unauthenticated() {
  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <h1 className="text-xl font-semibold">Sign in required</h1>
      <Link
        href="/sign-in"
        className="inline-block px-4 py-3 border rounded-lg text-base"
      >
        Go to sign in
      </Link>
    </main>
  );
}

function notFoundPage(uploadId: string) {
  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <h1 className="text-xl font-semibold">Roleplay not found</h1>
      <p className="text-sm">
        No analysis found for{" "}
        <span className="font-mono break-all">{uploadId}</span>.
      </p>
      <Link
        href="/"
        className="inline-block px-4 py-3 border rounded-lg text-base"
      >
        Back to dashboard
      </Link>
    </main>
  );
}

function notReadyPage(uploadId: string, status: string) {
  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <h1 className="text-xl font-semibold">Analysis not ready</h1>
      <p className="text-sm">
        Upload <span className="font-mono break-all">{uploadId}</span> is at
        status <span className="font-mono">{status}</span> — finish analysis
        before starting a roleplay drill.
      </p>
      <Link
        href={`/status/${encodeURIComponent(uploadId)}`}
        className="inline-block px-4 py-3 border rounded-lg text-base"
      >
        Back to status
      </Link>
    </main>
  );
}

function noSeedPage(uploadId: string) {
  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <h1 className="text-xl font-semibold">No roleplay seed</h1>
      <p className="text-sm">
        This analysis did not produce a roleplay scenario seed — the
        transcript may have been too sparse to construct a drill.
      </p>
      <Link
        href={`/analysis/${encodeURIComponent(uploadId)}`}
        className="inline-block px-4 py-3 border rounded-lg text-base"
      >
        Back to analysis
      </Link>
    </main>
  );
}

export default async function RoleplayPage({
  params,
}: {
  params: Promise<{ upload_id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) return unauthenticated();

  const { upload_id } = await params;

  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { orgId: true },
  });
  if (memberships.length === 0) return notFoundPage(upload_id);

  const upload = await prisma.upload.findFirst({
    where: {
      id: upload_id,
      orgId: { in: memberships.map((m) => m.orgId) },
    },
    include: { org: true, analysis: true },
  });
  if (!upload) return notFoundPage(upload_id);

  if (upload.status !== "analyzed") {
    return notReadyPage(upload_id, upload.status);
  }
  if (!upload.analysis) return notFoundPage(upload_id);

  let parsed: unknown;
  try {
    const buf = await downloadFromR2(upload.analysis.jsonR2Key);
    parsed = JSON.parse(buf.toString("utf8"));
  } catch (err) {
    console.error(`[roleplay-page] R2/JSON load failed for ${upload_id}:`, err);
    return noSeedPage(upload_id);
  }

  const seed =
    parsed &&
    typeof parsed === "object" &&
    "roleplay_scenario_seed" in parsed
      ? (parsed as { roleplay_scenario_seed: RoleplaySeed | null }).roleplay_scenario_seed
      : null;
  if (seed == null) return noSeedPage(upload_id);

  // Build a friendly rep display name from Clerk for the YOU header
  // in the battle UI. Falls back through username → email → "REP".
  const user = await currentUser();
  const firstName = user?.firstName?.trim() ?? "";
  const lastName = user?.lastName?.trim() ?? "";
  const fullName = `${firstName} ${lastName}`.trim();
  const repName =
    fullName ||
    user?.username?.trim() ||
    user?.emailAddresses[0]?.emailAddress?.split("@")[0] ||
    "REP";

  return (
    <Game
      uploadId={upload.id}
      prospectName={upload.prospectName}
      consultationDate={upload.consultationDate.toISOString().slice(0, 10)}
      orgName={upload.org.name}
      repName={repName}
      seed={seed}
    />
  );
}
