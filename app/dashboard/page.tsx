import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import {
  listAnalyzedUploads,
  parseFilters,
  applyFilters,
  type DashboardRow,
} from "@/lib/dashboard-data";
import { scoreColorClasses } from "@/lib/analysis-display";
import DashboardFilters from "./dashboard-filters";

export const dynamic = "force-dynamic";

function loadReps(): string[] {
  try {
    const p = path.join(process.cwd(), "config", "staff.json");
    const data = JSON.parse(fs.readFileSync(p, "utf8")) as { reps?: string[] };
    return data.reps ?? [];
  } catch {
    return [];
  }
}

function ScorePill({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-semibold bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 tabular-nums">
        —
      </span>
    );
  }
  return (
    <span
      className={
        "inline-flex items-center justify-center px-2 py-0.5 rounded text-sm font-semibold tabular-nums " +
        scoreColorClasses(Math.round(score))
      }
    >
      {score.toFixed(1)}
    </span>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

function Row({ row }: { row: DashboardRow }) {
  const parseError = !!row.json_parse_error;
  const bucketMismatch =
    row.scores &&
    row.scores.predicted_bucket &&
    row.scores.predicted_bucket !== row.outcome;

  return (
    <Link
      href={`/analysis/${encodeURIComponent(row.upload_id)}`}
      className="block border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 sm:p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-sm sm:text-base truncate">
              {row.prospect}
            </h3>
            <span className="text-xs text-zinc-500">with {row.rep}</span>
          </div>
          <div className="text-xs text-zinc-500 mt-0.5 flex flex-wrap gap-x-2 gap-y-1">
            <span>{row.consultation_date}</span>
            <span>·</span>
            <span>{row.gym}</span>
          </div>
        </div>
        <div className="shrink-0">
          {row.scores ? (
            <ScorePill score={row.scores.overall_score} />
          ) : (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
              malformed
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300">
          {row.outcome}
        </span>
        {row.scores?.predicted_bucket && bucketMismatch && (
          <span
            className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
            title="Analyzer predicted a different outcome than the rep recorded"
          >
            predicted: {row.scores.predicted_bucket}
          </span>
        )}
        {row.scores && row.scores.weak_stage_count > 0 && (
          <span className="text-[11px] text-zinc-600 dark:text-zinc-400">
            {row.scores.weak_stage_count} weak stage
            {row.scores.weak_stage_count === 1 ? "" : "s"}
          </span>
        )}
        {parseError && (
          <span className="text-[11px] text-amber-700 dark:text-amber-400">
            Output malformed — re-run available
          </span>
        )}
      </div>

      {row.scores?.primary_focus_skill && (
        <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500 font-medium mr-1.5">
            Drill:
          </span>
          {truncate(row.scores.primary_focus_skill, 80)}
        </div>
      )}

      {row.analyzed_at && (
        <div className="mt-2 text-[11px] text-zinc-500">
          Analyzed {new Date(row.analyzed_at).toLocaleString()}
        </div>
      )}
    </Link>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  if (filtered) {
    return (
      <div className="border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-8 text-center space-y-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No analyses match these filters.
        </p>
        <p className="text-xs text-zinc-500">
          Try clearing some filters above.
        </p>
      </div>
    );
  }
  return (
    <div className="border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-8 text-center space-y-3">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        No analyses yet.
      </p>
      <Link
        href="/"
        className="inline-block px-4 py-2 border rounded-lg text-sm font-medium underline"
      >
        Upload a recording →
      </Link>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const allRows = listAnalyzedUploads();
  const rows = applyFilters(allRows, filters);
  const reps = loadReps();

  return (
    <main className="mx-auto max-w-3xl p-4 space-y-5">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-semibold">Dashboard</h1>
          <Link href="/" className="text-sm underline">
            ← Upload
          </Link>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {allRows.length === 0
            ? "No completed analyses yet."
            : rows.length === allRows.length
              ? `${allRows.length} analysis${allRows.length === 1 ? "" : "es"}`
              : `${rows.length} of ${allRows.length} analyses`}
        </p>
      </header>

      <DashboardFilters
        reps={reps}
        initial={{
          outcomes: filters.outcomes,
          rep: filters.rep,
          from: filters.from,
          to: filters.to,
          sort: filters.sort,
        }}
      />

      <section className="space-y-2">
        {rows.length === 0 ? (
          <EmptyState filtered={allRows.length > 0} />
        ) : (
          rows.map((row) => <Row key={row.upload_id} row={row} />)
        )}
      </section>
    </main>
  );
}
