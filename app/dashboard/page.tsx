import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import {
  listAnalyzedUploads,
  parseFilters,
  applyFilters,
  type DashboardRow,
} from "@/lib/dashboard-data";
import { ALL_OUTCOMES } from "@/lib/outcomes";
import { fmtDate, initials, scoreBand, bandClass } from "@/lib/format";
import { ChevronR, Plus, TrendUp } from "@/lib/icons";
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

function isSoldOutcome(outcome: string): boolean {
  return outcome.startsWith("sold-") || outcome === "transformation-challenge";
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub: string;
  tone?: "good" | "warn" | "bad";
}) {
  const color =
    tone === "good"
      ? "var(--score-green)"
      : tone === "warn"
        ? "var(--score-amber)"
        : tone === "bad"
          ? "var(--score-red)"
          : "var(--ink)";
  return (
    <div className="card grad-card card-pad">
      <div style={{ position: "relative", zIndex: 1 }}>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.06em",
            color: "var(--ink-4)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
        <div
          className="mono"
          style={{
            fontSize: 26,
            fontWeight: 600,
            color,
            letterSpacing: "-0.02em",
            marginTop: 4,
          }}
        >
          {value}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 1 }}>
          {sub}
        </div>
      </div>
    </div>
  );
}

function Row({ row }: { row: DashboardRow }) {
  const sold = isSoldOutcome(row.outcome);
  const band = scoreBand(row.scores?.overall_score ?? null);
  const parseError = !!row.json_parse_error;

  return (
    <Link
      href={`/analysis/${encodeURIComponent(row.upload_id)}`}
      className="dash-row"
      style={{
        display: "grid",
        gridTemplateColumns:
          "1.5fr 1.0fr 0.7fr 1.1fr 1.1fr 0.7fr 0.6fr 1.6fr 28px",
        gap: 12,
        padding: "13px 20px",
        borderBottom: "1px solid var(--divider)",
        textAlign: "left",
        alignItems: "center",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: "var(--surface-sunken)",
            display: "grid",
            placeItems: "center",
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            color: "var(--ink-3)",
            flexShrink: 0,
          }}
        >
          {initials(row.prospect)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 500,
              fontSize: 13.5,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {row.prospect}
          </div>
          <div className="mono faint" style={{ fontSize: 11 }}>
            {row.upload_id}
          </div>
        </div>
      </div>

      <div
        style={{
          fontSize: 13,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {row.rep}
      </div>

      <div className="mono" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
        {fmtDate(row.consultation_date)}
      </div>

      <div
        style={{
          fontSize: 12.5,
          color: "var(--ink-2)",
          minWidth: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {row.gym}
      </div>

      <div>
        <span className={`chip ${sold ? "chip-sold" : "chip-notsold"}`}>
          <span className="dot" />
          {row.outcome}
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "center" }}>
        {row.scores?.overall_score != null ? (
          <span className={`score-pill ${bandClass(band)}`}>
            {row.scores.overall_score.toFixed(1)}
          </span>
        ) : parseError ? (
          <span
            className="chip"
            style={{
              background: "var(--score-amber-bg)",
              color: "var(--score-amber)",
            }}
          >
            malformed
          </span>
        ) : (
          <span className="mono faint" style={{ fontSize: 12 }}>
            —
          </span>
        )}
      </div>

      <div style={{ textAlign: "center" }}>
        {row.scores?.weak_stage_count ? (
          <span
            className="mono"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color:
                row.scores.weak_stage_count >= 4
                  ? "var(--score-red)"
                  : row.scores.weak_stage_count >= 2
                    ? "var(--score-amber)"
                    : "var(--ink-2)",
            }}
          >
            {row.scores.weak_stage_count}
          </span>
        ) : (
          <span className="mono faint" style={{ fontSize: 12 }}>
            —
          </span>
        )}
      </div>

      <div
        style={{
          fontSize: 12.5,
          color: "var(--ink-2)",
          minWidth: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={row.scores?.primary_focus_skill ?? ""}
      >
        {row.scores?.primary_focus_skill ?? (
          <span className="faint">—</span>
        )}
      </div>

      <div
        style={{
          color: "var(--ink-4)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <ChevronR size={14} />
      </div>
    </Link>
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

  // Stats computed from the FILTERED set (matches the design behavior).
  const stats = (() => {
    if (!rows.length) return null;
    const sold = rows.filter((r) => isSoldOutcome(r.outcome)).length;
    const numericScores = rows
      .map((r) => r.scores?.overall_score)
      .filter((s): s is number => typeof s === "number");
    const avg =
      numericScores.length > 0
        ? numericScores.reduce((a, b) => a + b, 0) / numericScores.length
        : null;
    const weak = numericScores.filter((s) => s < 6).length;
    return {
      count: rows.length,
      sold,
      soldRate: sold / rows.length,
      avg,
      weak,
    };
  })();

  // Outcome-filter description for the "consultations" stat subtitle
  const outcomeSummary = filters.outcomes.length
    ? filters.outcomes.length === ALL_OUTCOMES.length
      ? "all outcomes"
      : `${filters.outcomes.length} outcome filter${filters.outcomes.length === 1 ? "" : "s"}`
    : filters.from || filters.to
      ? "in date range"
      : "all time";

  return (
    <div className="content wide">
      <div className="page-head">
        <div>
          <h2>Consultations</h2>
          <div className="sub">
            Analyzed recordings — click a row to open the coaching report.
          </div>
        </div>
        <div className="page-head-actions">
          <button type="button" className="btn btn-secondary" disabled>
            <TrendUp size={14} /> Team report
          </button>
          <Link href="/" className="btn btn-primary">
            <Plus size={15} /> New upload
          </Link>
        </div>
      </div>

      {/* Stats row — only when there are rows to summarize */}
      {stats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <Stat
            label="Consultations"
            value={stats.count}
            sub={outcomeSummary}
          />
          <Stat
            label="Close rate"
            value={`${Math.round(stats.soldRate * 100)}%`}
            sub={`${stats.sold} of ${stats.count} sold`}
            tone={stats.soldRate >= 0.5 ? "good" : "warn"}
          />
          <Stat
            label="Avg score"
            value={stats.avg != null ? stats.avg.toFixed(1) : "—"}
            sub="out of 10"
            tone={
              stats.avg != null
                ? stats.avg >= 7
                  ? "good"
                  : stats.avg >= 5
                    ? "warn"
                    : "bad"
                : undefined
            }
          />
          <Stat
            label="Below 6"
            value={stats.weak}
            sub="needs drilling"
            tone={stats.weak === 0 ? "good" : "warn"}
          />
        </div>
      )}

      <DashboardFilters
        reps={reps}
        initial={{
          outcomes: filters.outcomes,
          rep: filters.rep,
          from: filters.from,
          to: filters.to,
          sort: filters.sort,
          query: filters.query,
        }}
      />

      {/* Table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1.5fr 1.0fr 0.7fr 1.1fr 1.1fr 0.7fr 0.6fr 1.6fr 28px",
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
          <div>Prospect</div>
          <div>Rep</div>
          <div>Date</div>
          <div>Gym</div>
          <div>Outcome</div>
          <div style={{ textAlign: "center" }}>Score</div>
          <div style={{ textAlign: "center" }}>Weak</div>
          <div>Drill focus</div>
          <div />
        </div>

        {rows.length === 0 ? (
          allRows.length === 0 ? (
            <div style={{ padding: "60px 20px", textAlign: "center" }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                No analyses yet
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
                Upload a consultation recording to get started.
              </div>
              <Link href="/" className="btn btn-primary btn-sm">
                <Plus size={13} /> New upload
              </Link>
            </div>
          ) : (
            <div style={{ padding: "60px 20px", textAlign: "center" }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                No consultations match these filters
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                Try widening the date range or clearing outcome chips.
              </div>
            </div>
          )
        ) : (
          rows.map((row) => <Row key={row.upload_id} row={row} />)
        )}
      </div>

      <div
        className="muted"
        style={{ fontSize: 12, marginTop: 12, textAlign: "right" }}
      >
        {rows.length} of {allRows.length} consultation
        {allRows.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}
