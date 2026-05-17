import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { downloadFromR2 } from "@/lib/r2";
import AnalysisView, {
  type AnalyzerJson,
  type ParseErrorJson,
  type AnalysisMetadata,
} from "./analysis-view";

function notFound(uploadId: string) {
  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <h1 className="text-xl font-semibold">Analysis not found</h1>
      <p className="text-sm">
        No analysis found for{" "}
        <span className="font-mono break-all">{uploadId}</span>.
      </p>
      <Link
        href="/"
        className="inline-block px-4 py-3 border rounded-lg text-base"
      >
        Back to upload
      </Link>
    </main>
  );
}

function notYetAnalyzed(uploadId: string, status: string) {
  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <h1 className="text-xl font-semibold">Analysis not ready</h1>
      <p className="text-sm">
        Upload <span className="font-mono break-all">{uploadId}</span> is at
        status <span className="font-mono">{status}</span> — no analysis to
        view yet.
      </p>
      <Link
        href={`/status/${encodeURIComponent(uploadId)}`}
        className="inline-block px-4 py-3 border rounded-lg text-base"
      >
        Back to status page
      </Link>
    </main>
  );
}

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

function isParseErrorJson(
  value: AnalyzerJson | ParseErrorJson,
): value is ParseErrorJson {
  return (
    typeof (value as ParseErrorJson).parse_error === "string" &&
    typeof (value as ParseErrorJson).raw_response === "string"
  );
}

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ upload_id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) return unauthenticated();

  const { upload_id } = await params;

  // Tenant scoping: find Memberships first, then look up the Upload
  // by id AND orgId-in-memberships. Cross-org probes return notFound
  // (not 403) so we don't leak which upload_ids exist in other orgs.
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { orgId: true },
  });
  if (memberships.length === 0) return notFound(upload_id);

  const upload = await prisma.upload.findFirst({
    where: {
      id: upload_id,
      orgId: { in: memberships.map((m) => m.orgId) },
    },
    include: {
      org: true,
      analysis: true,
    },
  });
  if (!upload) return notFound(upload_id);

  if (upload.status !== "analyzed") {
    return notYetAnalyzed(upload_id, upload.status);
  }
  if (!upload.analysis) {
    // status=analyzed but no Analysis row is an inconsistent state —
    // shouldn't happen, but surface it cleanly rather than crashing.
    return notFound(upload_id);
  }

  // Pull the bytes from R2 in parallel. coaching.md is best-effort;
  // we still render something if it's missing (this matches the
  // pre-migration behavior).
  const [jsonBuf, coachingBuf] = await Promise.all([
    downloadFromR2(upload.analysis.jsonR2Key).catch(() => null),
    downloadFromR2(upload.analysis.coachingR2Key).catch(() => null),
  ]);

  if (!jsonBuf) {
    return (
      <main className="mx-auto max-w-md p-4 space-y-4">
        <h1 className="text-xl font-semibold">Analysis JSON unreadable</h1>
        <p className="text-sm text-red-700">
          R2 returned no body for{" "}
          <span className="font-mono break-all">
            {upload.analysis.jsonR2Key}
          </span>
          .
        </p>
      </main>
    );
  }

  let json: AnalyzerJson | ParseErrorJson;
  try {
    json = JSON.parse(jsonBuf.toString("utf8")) as
      | AnalyzerJson
      | ParseErrorJson;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      <main className="mx-auto max-w-md p-4 space-y-4">
        <h1 className="text-xl font-semibold">Analysis JSON invalid</h1>
        <pre className="text-sm whitespace-pre-wrap text-red-700">{msg}</pre>
      </main>
    );
  }

  const coaching = coachingBuf
    ? coachingBuf.toString("utf8")
    : "_Coaching message file not found._";

  // Build the AnalysisMetadata shape the existing AnalysisView
  // component already renders against. uploaded_at maps to
  // Upload.createdAt; status is always "analyzed" at this point.
  const metadata: AnalysisMetadata = {
    upload_id: upload.id,
    rep: upload.repUserId,
    gym: upload.org.name,
    prospect: upload.prospectName,
    consultation_date: upload.consultationDate.toISOString().slice(0, 10),
    outcome: upload.outcome,
    uploaded_at: upload.createdAt.toISOString(),
    status: upload.status,
    analyzed_at: upload.analysis.analyzedAt?.toISOString(),
    json_parse_error: upload.analysis.jsonParseError ?? undefined,
  };

  const parseError = isParseErrorJson(json);

  return (
    <AnalysisView
      metadata={metadata}
      coaching={coaching}
      json={parseError ? null : (json as AnalyzerJson)}
      parseErrorJson={parseError ? (json as ParseErrorJson) : null}
    />
  );
}
