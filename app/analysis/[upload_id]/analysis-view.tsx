"use client";

import { useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  STAGE_LABELS,
  DIMENSION_LABELS,
  stageOrDimensionLabel,
  flagLabel,
} from "@/lib/analysis-display";
import { fmtDate, fmtDateLong, scoreBand, bandClass } from "@/lib/format";
import {
  ArrowL,
  Check,
  ChevronD,
  Doc,
  Flag,
  Play,
  Target,
} from "@/lib/icons";
import RerunButton from "./rerun-button";

export type AnalysisMetadata = {
  upload_id: string;
  rep: string;
  gym: string;
  prospect: string;
  consultation_date: string;
  outcome: string;
  uploaded_at: string;
  status: string;
  analyzed_at?: string;
  json_parse_error?: string;
  recordingType?: string;
  analysis_json_path?: string;
  coaching_path?: string;
};

type PredictedOutcome = {
  bucket: string;
  confidence: string;
  actual_outcome_evident: boolean;
  surface_reasoning: string;
  underlying_cause: string;
  primary_diagnostic_flags_implicated: string[];
};

type StageScore = {
  stage: string;
  score: number | null;
  evidence_quotes: string[];
  what_worked: string;
  what_was_missed: string;
  upstream_consequences: string | null;
  phase?: string;
  applicable?: boolean;
  reason?: string;
};

type CrossCuttingScore = {
  dimension: string;
  score: number;
  evidence_quotes: string[];
  pattern_observed: string;
  highest_leverage_fix: string | null;
};

type DiagnosticFlag = {
  flag: string;
  evidence_quote: string;
  transcript_location: string;
  stage: string;
  downstream_consequences: string[];
};

type TrainingFocus = {
  skill: string;
  stage_or_dimension: string;
  specific_weakness: string;
  evidence_quotes: string[];
  why_this_is_the_priority: string;
  success_criteria: string;
};

type RoleplayScenarioSeed = {
  prospect_profile: {
    demographic: string;
    stated_surface_goal: string;
    actual_emotional_driver: string;
    yesterdays_pattern: string;
    objection_likely: string;
    personality_signals: string;
  };
  stage_to_drill_enum: string;
  drill_scope_description: string;
  drill_focus: string;
  difficulty_modifiers: string[];
  success_definition: string;
  estimated_drill_duration_minutes: number;
};

export type AnalyzerJson = {
  transcript_id: string;
  analyzed_at: string;
  analyzer_version: string;
  predicted_outcome: PredictedOutcome;
  stage_scores: StageScore[];
  cross_cutting_scores: CrossCuttingScore[];
  diagnostic_flags: DiagnosticFlag[];
  primary_training_focus: TrainingFocus;
  secondary_training_focus: TrainingFocus | null;
  roleplay_scenario_seed: RoleplayScenarioSeed | null;
  overall_assessment: string;
};

export type ParseErrorJson = {
  parse_error: string;
  raw_response: string;
};

function isSoldOutcome(outcome: string): boolean {
  return outcome.startsWith("sold-") || outcome === "transformation-challenge";
}

function computeOverallScore(stages: StageScore[]): number | null {
  const numeric = stages
    .map((s) => s.score)
    .filter((s): s is number => typeof s === "number");
  if (numeric.length === 0) return null;
  return numeric.reduce((a, b) => a + b, 0) / numeric.length;
}

function countWeakStages(stages: StageScore[]): number {
  return stages.filter((s) => typeof s.score === "number" && s.score < 6)
    .length;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mono"
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.08em",
        color: "var(--ink-4)",
        textTransform: "uppercase",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function MetaInline({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          opacity: 0.65,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 2,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function ScoreBar({ value }: { value: number | null }) {
  const band = scoreBand(value);
  const pct = value != null ? (value / 10) * 100 : 0;
  const color = `var(--score-${band === "neutral" ? "amber" : band})`;
  return (
    <div
      style={{
        height: 6,
        borderRadius: 999,
        background: "var(--surface-sunken)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: pct + "%",
          background: color,
          borderRadius: 999,
          transition: "width 250ms ease-out",
        }}
      />
    </div>
  );
}

function Collapsible({
  id,
  title,
  subtitle,
  defaultOpen = true,
  icon,
  meta,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      id={id}
      className="card"
      style={{ marginBottom: 14, overflow: "hidden" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          border: 0,
          background: "transparent",
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <ChevronD
          size={14}
          style={{
            color: "var(--ink-4)",
            transform: open ? "rotate(0)" : "rotate(-90deg)",
            transition: "transform 150ms",
          }}
        />
        {icon && <span style={{ color: "var(--primary)" }}>{icon}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
          {subtitle && (
            <div className="muted" style={{ fontSize: 12, marginTop: 1 }}>
              {subtitle}
            </div>
          )}
        </div>
        {meta}
      </button>
      {open && (
        <div style={{ borderTop: "1px solid var(--divider)" }}>{children}</div>
      )}
    </section>
  );
}

function Evidence({ quotes }: { quotes: string[] }) {
  if (!quotes.length) return null;
  return (
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {quotes.map((q, i) => (
        <li
          key={i}
          style={{
            borderLeft: "2px solid var(--border-strong)",
            paddingLeft: 12,
            color: "var(--ink-2)",
            fontSize: 13,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
          }}
        >
          {q}
        </li>
      ))}
    </ul>
  );
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mono"
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.06em",
        color: "var(--ink-4)",
        textTransform: "uppercase",
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

function StageRow({
  entry,
  index,
}: {
  entry: StageScore;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const band = scoreBand(entry.score);
  const label = STAGE_LABELS[entry.stage] ?? entry.stage;

  if (entry.applicable === false) {
    return (
      <div
        style={{
          borderTop: index === 0 ? "none" : "1px solid var(--divider)",
          padding: "12px 20px",
          display: "grid",
          gridTemplateColumns: "32px 1fr 160px 56px 18px",
          alignItems: "center",
          gap: 14,
          opacity: 0.45,
        }}
      >
        <span className="mono faint" style={{ fontSize: 11 }}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 500,
              fontSize: 13.5,
              color: "var(--ink-4)",
            }}
          >
            {label}
          </div>
        </div>
        <span className="mono faint" style={{ fontSize: 12 }}>
          —
        </span>
        <span
          className="chip"
          style={{
            justifySelf: "end",
            fontSize: 10,
            background: "var(--surface-sunken)",
            color: "var(--ink-4)",
            fontWeight: 500,
          }}
        >
          Not recorded
        </span>
        <span />
      </div>
    );
  }

  return (
    <div
      style={{
        borderTop: index === 0 ? "none" : "1px solid var(--divider)",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="stage-row"
        style={{
          width: "100%",
          border: 0,
          background: "transparent",
          padding: "12px 20px",
          display: "grid",
          gridTemplateColumns: "32px 1fr 160px 56px 18px",
          alignItems: "center",
          gap: 14,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span className="mono faint" style={{ fontSize: 11 }}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 13.5 }}>{label}</div>
        </div>
        <ScoreBar value={entry.score} />
        <span
          className={`score-pill ${bandClass(band)}`}
          style={{ justifySelf: "end" }}
        >
          {entry.score != null ? entry.score.toFixed(1) : "—"}
        </span>
        <ChevronD
          size={14}
          style={{
            color: "var(--ink-4)",
            transform: expanded ? "rotate(180deg)" : "rotate(0)",
            transition: "transform 150ms",
          }}
        />
      </button>
      {expanded && (
        <div
          style={{
            padding: "0 20px 16px 66px",
            color: "var(--ink-2)",
            fontSize: 13,
            lineHeight: 1.55,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {entry.evidence_quotes.length > 0 && (
            <div>
              <MiniLabel>Evidence</MiniLabel>
              <Evidence quotes={entry.evidence_quotes} />
            </div>
          )}
          {entry.what_worked && (
            <div>
              <MiniLabel>What worked</MiniLabel>
              <p style={{ margin: 0 }}>{entry.what_worked}</p>
            </div>
          )}
          {entry.what_was_missed && (
            <div>
              <MiniLabel>What was missed</MiniLabel>
              <p style={{ margin: 0 }}>{entry.what_was_missed}</p>
            </div>
          )}
          {entry.upstream_consequences && (
            <div>
              <MiniLabel>Upstream consequences</MiniLabel>
              <p style={{ margin: 0 }}>{entry.upstream_consequences}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DimensionCard({ entry }: { entry: CrossCuttingScore }) {
  const band = scoreBand(entry.score);
  const label = DIMENSION_LABELS[entry.dimension] ?? entry.dimension;
  return (
    <div style={{ padding: "14px 16px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 500,
            color: "var(--ink-2)",
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </span>
        <span className={`score-pill ${bandClass(band)}`}>
          {entry.score.toFixed(1)}
        </span>
      </div>
      <ScoreBar value={entry.score} />
      {entry.highest_leverage_fix && (
        <div
          className="muted"
          style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.5 }}
        >
          {entry.highest_leverage_fix}
        </div>
      )}
    </div>
  );
}

function FlagCard({ entry }: { entry: DiagnosticFlag }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "10px 12px",
        background: "var(--score-amber-bg)",
        color: "var(--score-amber)",
        borderRadius: 8,
        fontSize: 12.5,
        fontWeight: 500,
        maxWidth: "100%",
      }}
      title={entry.evidence_quote}
    >
      <Flag size={13} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ minWidth: 0 }}>
        <div>{flagLabel(entry.flag)}</div>
        <div
          className="mono faint"
          style={{
            fontSize: 10.5,
            marginTop: 2,
            color: "var(--ink-4)",
          }}
        >
          {STAGE_LABELS[entry.stage] ?? entry.stage} ·{" "}
          {entry.transcript_location}
        </div>
      </div>
    </div>
  );
}

function FocusCard({
  tier,
  focus,
}: {
  tier: "primary" | "secondary";
  focus: TrainingFocus | null;
}) {
  const isPrimary = tier === "primary";
  if (!focus) {
    return (
      <div
        className="card card-pad"
        style={{
          borderStyle: "dashed",
          background: "var(--surface)",
        }}
      >
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
          Secondary drill focus
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          No secondary focus — rep is generally strong outside the primary
          weakness.
        </div>
      </div>
    );
  }
  return (
    <div
      className="card card-pad"
      style={{
        borderColor: isPrimary ? "var(--primary-200)" : "var(--border)",
        background: isPrimary ? "var(--primary-tint)" : "var(--surface)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          gap: 8,
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: isPrimary ? "var(--primary)" : "var(--ink-4)",
            textTransform: "uppercase",
          }}
        >
          {tier} drill focus
        </span>
        <span className="chip chip-neutral">
          {stageOrDimensionLabel(focus.stage_or_dimension)}
        </span>
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 500,
          letterSpacing: "-0.005em",
          marginBottom: 8,
          color: "var(--ink)",
          lineHeight: 1.4,
        }}
      >
        {focus.skill}
      </div>
      <div
        className="muted"
        style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 10 }}
      >
        {focus.specific_weakness}
      </div>
      {focus.evidence_quotes.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <MiniLabel>Evidence</MiniLabel>
          <Evidence quotes={focus.evidence_quotes.slice(0, 2)} />
        </div>
      )}
      <div style={{ marginBottom: 8 }}>
        <MiniLabel>Why this is the priority</MiniLabel>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-2)" }}>
          {focus.why_this_is_the_priority}
        </p>
      </div>
      <div>
        <MiniLabel>Success criteria</MiniLabel>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-2)" }}>
          {focus.success_criteria}
        </p>
      </div>
    </div>
  );
}

function RoleplaySeedBody({
  seed,
  uploadId,
}: {
  seed: RoleplayScenarioSeed;
  uploadId: string;
}) {
  const p = seed.prospect_profile;
  const rows: Array<[string, string]> = [
    ["Demographic", p.demographic],
    ["Stated surface goal", p.stated_surface_goal],
    ["Actual emotional driver", p.actual_emotional_driver],
    ["Yesterdays pattern", p.yesterdays_pattern],
    ["Objection likely", p.objection_likely],
    ["Personality signals", p.personality_signals],
  ];
  return (
    <div style={{ padding: "16px 20px 20px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <MiniLabel>Drill target</MiniLabel>
          <div className="chip chip-primary" style={{ marginTop: 4 }}>
            {stageOrDimensionLabel(seed.stage_to_drill_enum)}
          </div>
        </div>
        <div>
          <MiniLabel>Estimated duration</MiniLabel>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            {seed.estimated_drill_duration_minutes} min
          </div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <MiniLabel>Drill scope</MiniLabel>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)" }}>
            {seed.drill_scope_description}
          </p>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <MiniLabel>Drill focus</MiniLabel>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)" }}>
            {seed.drill_focus}
          </p>
        </div>
      </div>

      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--divider)",
          borderRadius: 8,
          padding: "14px 16px",
          marginBottom: 14,
        }}
      >
        <MiniLabel>Prospect profile</MiniLabel>
        <dl style={{ margin: 0, display: "grid", gap: 6 }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
              <span style={{ color: "var(--ink-4)" }}>{k}:</span> {v}
            </div>
          ))}
        </dl>
      </div>

      {seed.difficulty_modifiers.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <MiniLabel>Difficulty modifiers</MiniLabel>
          <ul
            style={{
              paddingLeft: 18,
              margin: 0,
              fontSize: 12.5,
              color: "var(--ink-2)",
            }}
          >
            {seed.difficulty_modifiers.map((m, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <MiniLabel>Success definition</MiniLabel>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-2)" }}>
          {seed.success_definition}
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 14,
          alignItems: "center",
          paddingTop: 14,
          borderTop: "1px solid var(--divider)",
        }}
      >
        <Link
          href={`/roleplay/${encodeURIComponent(uploadId)}`}
          className="btn btn-primary btn-sm"
        >
          <Play size={12} /> Start roleplay
        </Link>
        <button type="button" className="btn btn-secondary btn-sm" disabled>
          <Doc size={13} /> Print drill card
        </button>
      </div>
    </div>
  );
}

function CoachingCard({ markdown }: { markdown: string }) {
  return (
    <div
      className="markdown-body"
      style={{
        background: "rgba(255, 255, 255, 0.10)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(255, 255, 255, 0.18)",
        borderRadius: 12,
        padding: "16px 18px",
        color: "#fff",
        fontSize: 14,
        lineHeight: 1.55,
      }}
    >
      <ReactMarkdown>{markdown}</ReactMarkdown>
    </div>
  );
}

function ParseErrorPanel({
  uploadId,
  parseError,
  rawResponse,
}: {
  uploadId: string;
  parseError: string;
  rawResponse: string;
}) {
  return (
    <div
      style={{
        border: "2px solid var(--score-amber)",
        background: "var(--score-amber-bg)",
        borderRadius: "var(--r-md)",
        padding: 16,
        marginBottom: 18,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--score-amber)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        Output partially unparseable
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: "var(--ink-2)",
          marginBottom: 10,
        }}
      >
        The analyzer ran but the structured JSON payload couldn&rsquo;t be
        parsed. The coaching message below is what came back. Re-run the
        analysis to try again.
      </p>
      <p
        className="mono"
        style={{
          margin: 0,
          marginBottom: 10,
          fontSize: 11,
          color: "var(--ink-3)",
          wordBreak: "break-all",
        }}
      >
        {parseError}
      </p>
      <RerunButton uploadId={uploadId} />
      <details style={{ marginTop: 10, fontSize: 12 }}>
        <summary style={{ cursor: "pointer", color: "var(--ink-3)" }}>
          Show raw analyzer response
        </summary>
        <pre
          style={{
            marginTop: 8,
            padding: 10,
            background: "var(--surface)",
            border: "1px solid var(--score-amber)",
            borderRadius: 6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 380,
            overflow: "auto",
            fontSize: 11.5,
            fontFamily: "var(--font-mono)",
          }}
        >
          {rawResponse}
        </pre>
      </details>
    </div>
  );
}

export default function AnalysisView({
  metadata,
  coaching,
  json,
  parseErrorJson,
}: {
  metadata: AnalysisMetadata;
  coaching: string;
  json: AnalyzerJson | null;
  parseErrorJson: ParseErrorJson | null;
}) {
  const hasParseError = parseErrorJson !== null || !!metadata.json_parse_error;
  const sold = isSoldOutcome(metadata.outcome);

  // No structured JSON → degraded view with coaching markdown only.
  if (hasParseError || !json) {
    return (
      <div className="content">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "var(--ink-3)",
            fontSize: 12.5,
            marginBottom: 14,
          }}
        >
          <Link
            href={`/status/${encodeURIComponent(metadata.upload_id)}`}
            className="btn btn-ghost btn-sm"
            style={{ height: 24, padding: "0 8px", marginLeft: -8 }}
          >
            <ArrowL size={13} /> Status
          </Link>
          <span className="mono" style={{ color: "var(--ink-4)" }}>
            · {metadata.upload_id}
          </span>
        </div>

        <div className="page-head">
          <div>
            <h2>{metadata.prospect}</h2>
            <div className="sub">
              {fmtDateLong(metadata.consultation_date)} · {metadata.rep} ·{" "}
              {metadata.gym}
            </div>
          </div>
        </div>

        {parseErrorJson && (
          <ParseErrorPanel
            uploadId={metadata.upload_id}
            parseError={parseErrorJson.parse_error}
            rawResponse={parseErrorJson.raw_response}
          />
        )}

        <div className="card card-pad">
          <SectionLabel>Coaching message</SectionLabel>
          <div className="markdown-body" style={{ fontSize: 14, lineHeight: 1.6 }}>
            <ReactMarkdown>{coaching}</ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  const overall = computeOverallScore(json.stage_scores);
  const weakStages = countWeakStages(json.stage_scores);
  const predictedSold = isSoldOutcome(json.predicted_outcome.bucket);
  const predictionMatched = predictedSold === sold;
  const overallBand = scoreBand(overall);
  const applicableCount = json.stage_scores.filter(
    (s) => s.applicable !== false,
  ).length;
  const stageSubtitle =
    applicableCount === 9
      ? "All 9 stages scored"
      : `${applicableCount} of 9 stages scored`;
  const recordingLabel =
    metadata.recordingType === "qualify_only"
      ? "Qualify only"
      : metadata.recordingType === "close_only"
        ? "Close only"
        : metadata.recordingType === "split"
          ? "Split"
          : null;

  return (
    <div className="content">
      {/* Sub-nav back */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: "var(--ink-3)",
          fontSize: 12.5,
          marginBottom: 14,
        }}
      >
        <Link
          href="/dashboard"
          className="btn btn-ghost btn-sm"
          style={{ height: 24, padding: "0 8px", marginLeft: -8 }}
        >
          <ArrowL size={13} /> Dashboard
        </Link>
        <span className="mono" style={{ color: "var(--ink-4)" }}>
          · {metadata.upload_id}
        </span>
      </div>

      {/* Hero coaching message */}
      <div
        style={{
          position: "relative",
          background:
            "linear-gradient(140deg, var(--primary-700) 0%, var(--primary) 60%, var(--primary-600) 100%)",
          borderRadius: "var(--r-lg)",
          padding: "28px 32px",
          color: "#fff",
          overflow: "hidden",
          marginBottom: 18,
        }}
      >
        <div className="hero-aurora" />
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.08,
            pointerEvents: "none",
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            maskImage:
              "radial-gradient(ellipse at 80% 30%, #000 0%, transparent 60%)",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 20,
            position: "relative",
            zIndex: 1,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 14,
                opacity: 0.85,
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: 10.5,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  background: "rgba(255,255,255,0.14)",
                  padding: "3px 8px",
                  borderRadius: 4,
                }}
              >
                Coaching headline
              </span>
              <span style={{ fontSize: 12.5 }}>
                {metadata.prospect} · {fmtDateLong(metadata.consultation_date)}
              </span>
            </div>

            <CoachingCard markdown={coaching} />
          </div>

          {/* Big score */}
          <div
            style={{
              flexShrink: 0,
              textAlign: "center",
              background: "rgba(255,255,255,0.1)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 14,
              padding: "16px 22px",
              minWidth: 140,
            }}
          >
            <div
              className="mono"
              style={{
                fontSize: 10.5,
                letterSpacing: "0.1em",
                opacity: 0.8,
                textTransform: "uppercase",
              }}
            >
              Overall
            </div>
            <div
              className="mono"
              style={{
                fontSize: 48,
                fontWeight: 600,
                letterSpacing: "-0.04em",
                lineHeight: 1,
                marginTop: 6,
              }}
            >
              {overall != null ? overall.toFixed(1) : "—"}
              <span
                style={{ fontSize: 18, opacity: 0.55, fontWeight: 500 }}
              >
                /10
              </span>
            </div>
            <div
              style={{
                fontSize: 11.5,
                opacity: 0.85,
                marginTop: 8,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 600,
              }}
            >
              {overallBand === "green"
                ? "Strong"
                : overallBand === "yellow"
                  ? "Solid"
                  : overallBand === "amber"
                    ? "Needs work"
                    : overallBand === "red"
                      ? "Critical"
                      : "—"}
            </div>
          </div>
        </div>

        {/* Meta strip */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 18,
            marginTop: 22,
            paddingTop: 18,
            borderTop: "1px solid rgba(255,255,255,0.15)",
            fontSize: 12.5,
            position: "relative",
            zIndex: 1,
          }}
        >
          <MetaInline label="Rep" value={metadata.rep} />
          <MetaInline label="Gym" value={metadata.gym} />
          <MetaInline
            label="Outcome"
            value={
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(255,255,255,0.14)",
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontWeight: 500,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: sold ? "#7FE3A0" : "rgba(255,255,255,0.8)",
                  }}
                />
                {metadata.outcome}
              </span>
            }
          />
          {recordingLabel && (
            <MetaInline
              label="Recording"
              value={
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    background: "rgba(255,255,255,0.14)",
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontWeight: 500,
                  }}
                >
                  {recordingLabel}
                </span>
              }
            />
          )}
          <MetaInline
            label="Weak stages"
            value={
              weakStages === 0
                ? "None — exemplar"
                : `${weakStages} of ${applicableCount}`
            }
          />
        </div>
      </div>

      {/* Two-column: Assessment + Prediction */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <div className="card card-pad">
          <SectionLabel>Overall assessment</SectionLabel>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: "var(--ink-2)",
              whiteSpace: "pre-wrap",
            }}
          >
            {json.overall_assessment}
          </div>
        </div>

        <div className="card card-pad">
          <SectionLabel>Predicted outcome</SectionLabel>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 6,
            }}
          >
            <div
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                background: predictedSold ? "var(--sold-bg)" : "var(--notsold-bg)",
                color: predictedSold ? "var(--sold)" : "var(--notsold)",
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: "-0.005em",
              }}
            >
              {json.predicted_outcome.bucket}
            </div>
            <div>
              <div
                className="mono"
                style={{ fontSize: 16, fontWeight: 600, lineHeight: 1 }}
              >
                {json.predicted_outcome.confidence}
              </div>
              <div
                className="mono faint"
                style={{
                  fontSize: 10.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                confidence
              </div>
            </div>
          </div>
          <div
            className="muted"
            style={{
              fontSize: 12.5,
              marginTop: 12,
              lineHeight: 1.5,
            }}
          >
            {json.predicted_outcome.surface_reasoning}
          </div>
          <div
            style={{
              marginTop: 12,
              padding: "8px 10px",
              background: predictionMatched
                ? "var(--score-green-bg)"
                : "var(--score-amber-bg)",
              color: predictionMatched
                ? "var(--score-green)"
                : "var(--score-amber)",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {predictionMatched ? (
              <Check size={13} stroke={2.4} />
            ) : (
              <Flag size={13} />
            )}
            {predictionMatched
              ? "Matched actual outcome"
              : "Did not match actual outcome"}
          </div>
        </div>
      </div>

      {/* Training focus cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <FocusCard tier="primary" focus={json.primary_training_focus} />
        <FocusCard tier="secondary" focus={json.secondary_training_focus} />
      </div>

      {/* Stage scores */}
      <Collapsible
        id="stages"
        title="Stage scores"
        subtitle={stageSubtitle}
        defaultOpen={true}
        meta={
          <span className="mono faint" style={{ fontSize: 12 }}>
            {weakStages} weak
          </span>
        }
      >
        <div style={{ padding: "4px 0 4px" }}>
          {json.stage_scores.map((s, i) => (
            <StageRow key={s.stage} entry={s} index={i} />
          ))}
        </div>
      </Collapsible>

      {/* Dimensions */}
      <Collapsible
        id="dimensions"
        title="Cross-cutting dimensions"
        subtitle="Behaviors that show up across every stage"
        defaultOpen={true}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            padding: 6,
          }}
        >
          {json.cross_cutting_scores.map((d, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const totalRows = Math.ceil(json.cross_cutting_scores.length / 3);
            return (
              <div
                key={d.dimension}
                style={{
                  borderRight: col < 2 ? "1px solid var(--divider)" : "none",
                  borderBottom:
                    row < totalRows - 1 ? "1px solid var(--divider)" : "none",
                }}
              >
                <DimensionCard entry={d} />
              </div>
            );
          })}
        </div>
      </Collapsible>

      {/* Diagnostic flags */}
      <section
        id="flags"
        className="card"
        style={{ marginBottom: 14, overflow: "hidden" }}
      >
        <div
          style={{
            padding: "16px 20px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
              Diagnostic flags
            </h3>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              Specific patterns the model surfaced from the transcript.
            </div>
          </div>
          <span className="mono faint" style={{ fontSize: 12 }}>
            {json.diagnostic_flags.length} found
          </span>
        </div>
        {json.diagnostic_flags.length === 0 ? (
          <div
            style={{
              padding: "0 20px 20px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "var(--score-green)",
              fontSize: 13,
            }}
          >
            <Check size={16} stroke={2.4} /> Clean run — no diagnostic flags
            raised.
          </div>
        ) : (
          <div
            style={{
              padding: "0 12px 12px 20px",
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            {json.diagnostic_flags.map((f, i) => (
              <FlagCard key={`${f.flag}-${i}`} entry={f} />
            ))}
          </div>
        )}
      </section>

      {/* Roleplay seed */}
      <Collapsible
        id="roleplay"
        title="Roleplay scenario seed"
        subtitle="Drill script generated from this call's weakest moment"
        defaultOpen={false}
        icon={<Target size={14} />}
        meta={
          json.roleplay_scenario_seed ? (
            <span className="chip chip-primary">
              <span className="dot" />
              Ready to run
            </span>
          ) : (
            <span className="mono faint" style={{ fontSize: 12 }}>
              not generated
            </span>
          )
        }
      >
        {json.roleplay_scenario_seed ? (
          <RoleplaySeedBody
            seed={json.roleplay_scenario_seed}
            uploadId={metadata.upload_id}
          />
        ) : (
          <div
            style={{
              padding: "16px 20px 20px",
              color: "var(--ink-3)",
              fontSize: 13,
            }}
          >
            Transcript was too sparse to construct a meaningful drill scenario.
          </div>
        )}
      </Collapsible>

      {/* Footer */}
      <div
        style={{
          marginTop: 24,
          paddingTop: 18,
          borderTop: "1px solid var(--divider)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "var(--ink-4)",
          fontSize: 12,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <span className="mono">
          Analyzer {json.analyzer_version} ·{" "}
          {metadata.analyzed_at
            ? new Date(metadata.analyzed_at).toLocaleString()
            : fmtDate(metadata.consultation_date)}{" "}
          · {json.transcript_id}
        </span>
      </div>
    </div>
  );
}
