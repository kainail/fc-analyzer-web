// Server-only helpers for /dashboard. Reads processed/<id>/metadata.json
// as the canonical "analyzed" index, enriched with score data pulled
// from analyses/json/<id>.json where the payload parsed cleanly.

import fs from "node:fs";
import path from "node:path";
import { getProcessedRoot } from "@/lib/upload-id";

export type RowMetadata = {
  upload_id: string;
  rep: string;
  gym: string;
  prospect: string;
  consultation_date: string;
  outcome: string;
  status: string;
  analyzed_at?: string;
  json_parse_error?: string;
};

export type RowScores = {
  overall_score: number | null;
  weak_stage_count: number;
  primary_focus_skill: string;
  predicted_bucket: string;
};

export type DashboardRow = RowMetadata & {
  scores: RowScores | null; // null for parse-error rows
};

type AnalyzerJsonLike = {
  predicted_outcome?: { bucket?: string };
  stage_scores?: Array<{ stage?: string; score?: number | null }>;
  primary_training_focus?: { skill?: string };
};

function safeReadJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

function computeScores(json: AnalyzerJsonLike | null): RowScores | null {
  if (!json) return null;
  const stages = json.stage_scores ?? [];
  const numericScores = stages
    .map((s) => s.score)
    .filter((s): s is number => typeof s === "number");
  const overall =
    numericScores.length > 0
      ? Math.round(
          (numericScores.reduce((a, b) => a + b, 0) / numericScores.length) *
            10,
        ) / 10
      : null;
  const weak = numericScores.filter((s) => s < 6).length;
  return {
    overall_score: overall,
    weak_stage_count: weak,
    primary_focus_skill: json.primary_training_focus?.skill ?? "",
    predicted_bucket: json.predicted_outcome?.bucket ?? "",
  };
}

export function listAnalyzedUploads(): DashboardRow[] {
  const root = getProcessedRoot();
  if (!fs.existsSync(root)) return [];

  const skillPath = process.env.SKILL_PATH!;
  const jsonDir = path.join(skillPath, "analyses", "json");

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const rows: DashboardRow[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const uploadId = entry.name;
    const metadataPath = path.join(root, uploadId, "metadata.json");
    const metadata = safeReadJson<RowMetadata>(metadataPath);
    if (!metadata) {
      console.error(
        `[dashboard] Skipping ${uploadId}: metadata.json unreadable`,
      );
      continue;
    }
    if (metadata.status !== "analyzed") continue;

    let scores: RowScores | null = null;
    if (!metadata.json_parse_error) {
      const json = safeReadJson<AnalyzerJsonLike>(
        path.join(jsonDir, `${uploadId}.json`),
      );
      scores = computeScores(json);
    }

    rows.push({ ...metadata, upload_id: uploadId, scores });
  }

  return rows;
}

// --- filtering & sorting ----------------------------------------------------

export type SortKey =
  | "analyzed_desc"
  | "consultation_desc"
  | "score_asc"
  | "score_desc";

export type FilterState = {
  outcomes: string[]; // empty = no filter
  rep: string | null;
  from: string | null; // YYYY-MM-DD
  to: string | null; // YYYY-MM-DD
  sort: SortKey;
  query: string;
};

export function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
): FilterState {
  const outcomesRaw = searchParams.outcome;
  const outcomes = Array.isArray(outcomesRaw)
    ? outcomesRaw
    : outcomesRaw
      ? outcomesRaw.split(",").filter(Boolean)
      : [];

  const rep =
    typeof searchParams.rep === "string" && searchParams.rep.trim()
      ? searchParams.rep.trim()
      : null;

  const from =
    typeof searchParams.from === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(searchParams.from)
      ? searchParams.from
      : null;

  const to =
    typeof searchParams.to === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(searchParams.to)
      ? searchParams.to
      : null;

  const sortRaw =
    typeof searchParams.sort === "string" ? searchParams.sort : "";
  const sort: SortKey =
    sortRaw === "consultation_desc" ||
    sortRaw === "score_asc" ||
    sortRaw === "score_desc"
      ? sortRaw
      : "analyzed_desc";

  const query =
    typeof searchParams.q === "string" ? searchParams.q.trim() : "";

  return { outcomes, rep, from, to, sort, query };
}

export function applyFilters(
  rows: DashboardRow[],
  filters: FilterState,
): DashboardRow[] {
  let out = rows;
  if (filters.outcomes.length > 0) {
    const set = new Set(filters.outcomes);
    out = out.filter((r) => set.has(r.outcome));
  }
  if (filters.rep) {
    out = out.filter((r) => r.rep === filters.rep);
  }
  if (filters.from) {
    out = out.filter((r) => r.consultation_date >= filters.from!);
  }
  if (filters.to) {
    out = out.filter((r) => r.consultation_date <= filters.to!);
  }
  if (filters.query) {
    const q = filters.query.toLowerCase();
    out = out.filter((r) => {
      return (
        r.prospect.toLowerCase().includes(q) ||
        r.rep.toLowerCase().includes(q) ||
        r.gym.toLowerCase().includes(q) ||
        (r.scores?.primary_focus_skill ?? "").toLowerCase().includes(q)
      );
    });
  }

  const sorted = [...out];
  switch (filters.sort) {
    case "consultation_desc":
      sorted.sort((a, b) =>
        b.consultation_date.localeCompare(a.consultation_date),
      );
      break;
    case "score_asc":
      // Parse-error rows (no scores) sort to the bottom.
      sorted.sort((a, b) => {
        const aScore = a.scores?.overall_score;
        const bScore = b.scores?.overall_score;
        if (aScore == null && bScore == null) return 0;
        if (aScore == null) return 1;
        if (bScore == null) return -1;
        return aScore - bScore;
      });
      break;
    case "score_desc":
      sorted.sort((a, b) => {
        const aScore = a.scores?.overall_score;
        const bScore = b.scores?.overall_score;
        if (aScore == null && bScore == null) return 0;
        if (aScore == null) return 1;
        if (bScore == null) return -1;
        return bScore - aScore;
      });
      break;
    case "analyzed_desc":
    default:
      sorted.sort((a, b) =>
        (b.analyzed_at ?? "").localeCompare(a.analyzed_at ?? ""),
      );
      break;
  }
  return sorted;
}
