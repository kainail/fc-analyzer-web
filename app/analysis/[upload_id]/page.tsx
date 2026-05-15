import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { resolveUploadDir } from "@/lib/upload-id";
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
  const { upload_id } = await params;

  const dir = resolveUploadDir(upload_id);
  if (!dir) return notFound(upload_id);

  const metadataPath = path.join(dir, "metadata.json");
  if (!fs.existsSync(metadataPath)) return notFound(upload_id);

  let metadata: AnalysisMetadata;
  try {
    metadata = JSON.parse(
      fs.readFileSync(metadataPath, "utf8"),
    ) as AnalysisMetadata;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      <main className="mx-auto max-w-md p-4 space-y-4">
        <h1 className="text-xl font-semibold">Metadata error</h1>
        <pre className="text-sm whitespace-pre-wrap text-red-700">{msg}</pre>
      </main>
    );
  }

  if (metadata.status !== "analyzed") {
    return notYetAnalyzed(upload_id, metadata.status);
  }

  const skillPath = process.env.SKILL_PATH;
  if (!skillPath) {
    return (
      <main className="mx-auto max-w-md p-4 space-y-4">
        <h1 className="text-xl font-semibold">Configuration error</h1>
        <p className="text-sm text-red-700">SKILL_PATH is not set.</p>
      </main>
    );
  }

  const jsonPath =
    metadata.analysis_json_path ??
    path.join(skillPath, "analyses", "json", `${upload_id}.json`);
  const coachingPath =
    metadata.coaching_path ??
    path.join(skillPath, "analyses", "coaching", `${upload_id}.md`);

  let json: AnalyzerJson | ParseErrorJson;
  try {
    json = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as
      | AnalyzerJson
      | ParseErrorJson;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      <main className="mx-auto max-w-md p-4 space-y-4">
        <h1 className="text-xl font-semibold">Analysis JSON unreadable</h1>
        <pre className="text-sm whitespace-pre-wrap text-red-700">{msg}</pre>
      </main>
    );
  }

  let coaching: string;
  try {
    coaching = fs.readFileSync(coachingPath, "utf8");
  } catch {
    coaching = "_Coaching message file not found._";
  }

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
