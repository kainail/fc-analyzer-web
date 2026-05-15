import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  STAGE_LABELS,
  DIMENSION_LABELS,
  stageOrDimensionLabel,
  flagLabel,
  scoreColorClasses,
  confidenceColorClasses,
} from "@/lib/analysis-display";
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

function ScoreChip({ score }: { score: number | null }) {
  const label = score === null ? "—" : `${score}/10`;
  return (
    <span
      className={
        "inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-semibold tabular-nums " +
        scoreColorClasses(score)
      }
    >
      {label}
    </span>
  );
}

function Section({
  id,
  title,
  children,
  defaultOpen = true,
  preview,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  preview?: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="border border-zinc-200 dark:border-zinc-800 rounded-lg"
    >
      <details open={defaultOpen} className="group">
        <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-base sm:text-lg font-semibold">{title}</h2>
            {preview && (
              <span className="text-xs text-zinc-500 truncate hidden sm:inline">
                {preview}
              </span>
            )}
          </div>
          <span className="text-zinc-400 text-sm select-none group-open:rotate-90 transition-transform">
            ›
          </span>
        </summary>
        <div className="px-4 pb-4 pt-1 space-y-4">{children}</div>
      </details>
    </section>
  );
}

function Evidence({ quotes }: { quotes: string[] }) {
  if (!quotes.length) return null;
  return (
    <ul className="space-y-2 text-sm">
      {quotes.map((q, i) => (
        <li
          key={i}
          className="border-l-2 border-zinc-300 dark:border-zinc-700 pl-3 text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap"
        >
          {q}
        </li>
      ))}
    </ul>
  );
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wide text-zinc-500 font-medium">
      {children}
    </div>
  );
}

function CoachingCard({ markdown }: { markdown: string }) {
  // Hand-styled instead of @tailwindcss/typography. The coaching format
  // is short: emoji-prefixed section labels + paragraphs, occasionally
  // bold/italic. These child selectors cover that surface.
  return (
    <div
      className={[
        "rounded-lg border-2 border-zinc-300 dark:border-zinc-700",
        "bg-zinc-50 dark:bg-zinc-900/40 p-4 sm:p-5 text-[15px] leading-relaxed",
        "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
        "[&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1:first-child]:mt-0",
        "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2:first-child]:mt-0",
        "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1",
        "[&_strong]:font-semibold",
        "[&_em]:italic",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2",
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2",
        "[&_li]:my-0.5",
        "[&_code]:font-mono [&_code]:text-sm [&_code]:bg-zinc-100 dark:[&_code]:bg-zinc-900 [&_code]:px-1 [&_code]:rounded",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-zinc-300 dark:[&_blockquote]:border-zinc-700 [&_blockquote]:pl-3 [&_blockquote]:text-zinc-600 dark:[&_blockquote]:text-zinc-400",
      ].join(" ")}
    >
      <ReactMarkdown>{markdown}</ReactMarkdown>
    </div>
  );
}

function PageHeader({ metadata }: { metadata: AnalysisMetadata }) {
  return (
    <header className="space-y-2">
      <Link
        href={`/status/${encodeURIComponent(metadata.upload_id)}`}
        className="text-sm underline"
      >
        ← Status page
      </Link>
      <h1 className="text-2xl sm:text-3xl font-semibold">Call analysis</h1>
      <div className="text-sm text-zinc-600 dark:text-zinc-400 flex flex-wrap gap-x-3 gap-y-1">
        <span>
          <strong>{metadata.prospect}</strong> with {metadata.rep}
        </span>
        <span>·</span>
        <span>{metadata.gym}</span>
        <span>·</span>
        <span>{metadata.consultation_date}</span>
        <span>·</span>
        <span className="font-mono text-xs">{metadata.outcome}</span>
      </div>
      {metadata.analyzed_at && (
        <div className="text-xs text-zinc-500">
          Analyzed {new Date(metadata.analyzed_at).toLocaleString()}
        </div>
      )}
    </header>
  );
}

function JumpNav() {
  const items: Array<{ href: string; label: string }> = [
    { href: "#coaching", label: "Coaching" },
    { href: "#overall", label: "Overall" },
    { href: "#outcome", label: "Outcome" },
    { href: "#focus", label: "Training focus" },
    { href: "#stages", label: "Stages" },
    { href: "#dimensions", label: "Dimensions" },
    { href: "#flags", label: "Flags" },
    { href: "#roleplay", label: "Roleplay seed" },
  ];
  return (
    <nav
      aria-label="Section jump links"
      className="sticky top-0 z-10 -mx-4 sm:mx-0 px-4 py-2 bg-white/90 dark:bg-zinc-950/90 backdrop-blur border-b border-zinc-200 dark:border-zinc-800"
    >
      <ul className="flex gap-2 overflow-x-auto text-xs">
        {items.map((it) => (
          <li key={it.href} className="shrink-0">
            <a
              href={it.href}
              className="inline-block px-2.5 py-1 rounded-full border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
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
    <div className="rounded-lg border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/40 p-4 space-y-3">
      <div>
        <div className="text-xs uppercase tracking-wide text-amber-800 dark:text-amber-300 font-semibold">
          Output partially unparseable
        </div>
        <p className="text-sm text-amber-900 dark:text-amber-100 mt-1">
          The analyzer ran but the structured JSON payload couldn&rsquo;t be
          parsed. The coaching message below is what came back. Re-run the
          analysis to try again — this usually resolves a one-off output
          formatting issue.
        </p>
        <p className="text-xs text-amber-800 dark:text-amber-300 mt-2 font-mono break-all">
          {parseError}
        </p>
      </div>
      <RerunButton uploadId={uploadId} />
      <details className="text-xs">
        <summary className="cursor-pointer underline">
          Show raw analyzer response
        </summary>
        <pre className="mt-2 p-2 bg-white dark:bg-zinc-900 rounded border border-amber-300 dark:border-amber-800 whitespace-pre-wrap break-words max-h-96 overflow-auto">
          {rawResponse}
        </pre>
      </details>
    </div>
  );
}

function StageCard({ entry }: { entry: StageScore }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-sm sm:text-base">
          {STAGE_LABELS[entry.stage] ?? entry.stage}
        </h3>
        <ScoreChip score={entry.score} />
      </div>
      <Evidence quotes={entry.evidence_quotes} />
      {entry.what_worked && (
        <div>
          <MiniLabel>What worked</MiniLabel>
          <p className="text-sm">{entry.what_worked}</p>
        </div>
      )}
      {entry.what_was_missed && (
        <div>
          <MiniLabel>What was missed</MiniLabel>
          <p className="text-sm">{entry.what_was_missed}</p>
        </div>
      )}
      {entry.upstream_consequences && (
        <div>
          <MiniLabel>Upstream consequences</MiniLabel>
          <p className="text-sm">{entry.upstream_consequences}</p>
        </div>
      )}
    </div>
  );
}

function DimensionCard({ entry }: { entry: CrossCuttingScore }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-sm sm:text-base">
          {DIMENSION_LABELS[entry.dimension] ?? entry.dimension}
        </h3>
        <ScoreChip score={entry.score} />
      </div>
      <Evidence quotes={entry.evidence_quotes} />
      {entry.pattern_observed && (
        <div>
          <MiniLabel>Pattern observed</MiniLabel>
          <p className="text-sm">{entry.pattern_observed}</p>
        </div>
      )}
      {entry.highest_leverage_fix && (
        <div>
          <MiniLabel>Highest leverage fix</MiniLabel>
          <p className="text-sm">{entry.highest_leverage_fix}</p>
        </div>
      )}
    </div>
  );
}

function FlagCard({ entry }: { entry: DiagnosticFlag }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-sm sm:text-base">
          {flagLabel(entry.flag)}
        </h3>
        <div className="text-xs text-zinc-500 font-mono">
          {STAGE_LABELS[entry.stage] ?? entry.stage} · {entry.transcript_location}
        </div>
      </div>
      <Evidence quotes={[entry.evidence_quote]} />
      {entry.downstream_consequences.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <MiniLabel>Caused →</MiniLabel>
          {entry.downstream_consequences.map((d) => (
            <span
              key={d}
              className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-mono"
            >
              {flagLabel(d)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TrainingFocusCard({
  title,
  focus,
}: {
  title: string;
  focus: TrainingFocus;
}) {
  return (
    <div className="border-2 border-zinc-300 dark:border-zinc-700 rounded-lg p-4 space-y-3">
      <div>
        <div className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">
          {title}
        </div>
        <h3 className="text-lg font-semibold mt-1">{focus.skill}</h3>
        <div className="text-xs text-zinc-500 font-mono mt-0.5">
          targets: {stageOrDimensionLabel(focus.stage_or_dimension)}
        </div>
      </div>
      <div>
        <MiniLabel>Specific weakness</MiniLabel>
        <p className="text-sm">{focus.specific_weakness}</p>
      </div>
      <Evidence quotes={focus.evidence_quotes} />
      <div>
        <MiniLabel>Why this is the priority</MiniLabel>
        <p className="text-sm">{focus.why_this_is_the_priority}</p>
      </div>
      <div>
        <MiniLabel>Success criteria</MiniLabel>
        <p className="text-sm">{focus.success_criteria}</p>
      </div>
    </div>
  );
}

function PredictedOutcomeCard({ outcome }: { outcome: PredictedOutcome }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900">
          {outcome.bucket}
        </span>
        <span
          className={
            "text-xs px-2 py-0.5 rounded uppercase tracking-wide " +
            confidenceColorClasses(outcome.confidence)
          }
        >
          {outcome.confidence} confidence
        </span>
        <span className="text-xs text-zinc-500">
          {outcome.actual_outcome_evident
            ? "outcome explicit in transcript"
            : "outcome inferred"}
        </span>
      </div>
      <div>
        <MiniLabel>Surface reasoning</MiniLabel>
        <p className="text-sm">{outcome.surface_reasoning}</p>
      </div>
      <div>
        <MiniLabel>Underlying cause</MiniLabel>
        <p className="text-sm">{outcome.underlying_cause}</p>
      </div>
      {outcome.primary_diagnostic_flags_implicated.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <MiniLabel>Implicated flags</MiniLabel>
          {outcome.primary_diagnostic_flags_implicated.map((f) => (
            <span
              key={f}
              className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-mono"
            >
              {flagLabel(f)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RoleplaySeedCard({ seed }: { seed: RoleplayScenarioSeed }) {
  const p = seed.prospect_profile;
  const profileRows: Array<[string, string]> = [
    ["Demographic", p.demographic],
    ["Stated surface goal", p.stated_surface_goal],
    ["Actual emotional driver", p.actual_emotional_driver],
    ["Yesterdays pattern", p.yesterdays_pattern],
    ["Objection likely", p.objection_likely],
    ["Personality signals", p.personality_signals],
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900">
          {stageOrDimensionLabel(seed.stage_to_drill_enum)}
        </span>
        <span className="text-zinc-500">
          · ~{seed.estimated_drill_duration_minutes} min
        </span>
      </div>
      <div>
        <MiniLabel>Drill scope</MiniLabel>
        <p className="text-sm">{seed.drill_scope_description}</p>
      </div>
      <div>
        <MiniLabel>Drill focus</MiniLabel>
        <p className="text-sm">{seed.drill_focus}</p>
      </div>
      <div>
        <MiniLabel>Prospect profile</MiniLabel>
        <dl className="grid grid-cols-1 gap-2 mt-1">
          {profileRows.map(([k, v]) => (
            <div key={k} className="text-sm">
              <span className="text-zinc-500">{k}:</span> {v}
            </div>
          ))}
        </dl>
      </div>
      {seed.difficulty_modifiers.length > 0 && (
        <div>
          <MiniLabel>Difficulty modifiers</MiniLabel>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {seed.difficulty_modifiers.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <MiniLabel>Success definition</MiniLabel>
        <p className="text-sm">{seed.success_definition}</p>
      </div>
    </div>
  );
}

function StagePreview({ stages }: { stages: StageScore[] }) {
  const lows = stages.filter((s) => s.score !== null && s.score <= 5).length;
  const nulls = stages.filter((s) => s.score === null).length;
  if (lows === 0 && nulls === 0) return <>all stages 6+</>;
  const parts: string[] = [];
  if (lows) parts.push(`${lows} below 6`);
  if (nulls) parts.push(`${nulls} not reached`);
  return <>{parts.join(" · ")}</>;
}

function DimensionPreview({ dims }: { dims: CrossCuttingScore[] }) {
  const lows = dims.filter((d) => d.score <= 5).length;
  if (lows === 0) return <>all dimensions 6+</>;
  return <>{lows} below 6</>;
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

  return (
    <main className="mx-auto max-w-3xl p-4 space-y-5">
      <PageHeader metadata={metadata} />

      {hasParseError && parseErrorJson && (
        <ParseErrorPanel
          uploadId={metadata.upload_id}
          parseError={parseErrorJson.parse_error}
          rawResponse={parseErrorJson.raw_response}
        />
      )}

      {!hasParseError && <JumpNav />}

      <section id="coaching" className="space-y-2">
        <h2 className="text-base font-semibold sm:hidden">Coaching message</h2>
        <CoachingCard markdown={coaching} />
      </section>

      {!hasParseError && json && (
        <>
          <Section id="overall" title="Overall assessment">
            <p className="text-sm whitespace-pre-wrap">
              {json.overall_assessment}
            </p>
          </Section>

          <Section id="outcome" title="Predicted outcome">
            <PredictedOutcomeCard outcome={json.predicted_outcome} />
          </Section>

          <Section id="focus" title="Training focus">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <TrainingFocusCard
                title="Primary"
                focus={json.primary_training_focus}
              />
              {json.secondary_training_focus ? (
                <TrainingFocusCard
                  title="Secondary"
                  focus={json.secondary_training_focus}
                />
              ) : (
                <div className="border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-4 text-sm text-zinc-500">
                  No secondary focus — rep is generally strong outside the
                  primary weakness.
                </div>
              )}
            </div>
          </Section>

          <Section
            id="stages"
            title="Stage scores"
            preview={<StagePreview stages={json.stage_scores} />}
          >
            <div className="space-y-3">
              {json.stage_scores.map((s) => (
                <StageCard key={s.stage} entry={s} />
              ))}
            </div>
          </Section>

          <Section
            id="dimensions"
            title="Cross-cutting dimensions"
            preview={<DimensionPreview dims={json.cross_cutting_scores} />}
          >
            <div className="space-y-3">
              {json.cross_cutting_scores.map((d) => (
                <DimensionCard key={d.dimension} entry={d} />
              ))}
            </div>
          </Section>

          <Section
            id="flags"
            title="Diagnostic flags"
            preview={
              <>
                {json.diagnostic_flags.length} flag
                {json.diagnostic_flags.length === 1 ? "" : "s"}
              </>
            }
          >
            {json.diagnostic_flags.length === 0 ? (
              <p className="text-sm text-zinc-500">No diagnostic flags triggered.</p>
            ) : (
              <div className="space-y-3">
                {json.diagnostic_flags.map((f, i) => (
                  <FlagCard key={`${f.flag}-${i}`} entry={f} />
                ))}
              </div>
            )}
          </Section>

          <Section id="roleplay" title="Roleplay scenario seed" defaultOpen={false}>
            {json.roleplay_scenario_seed ? (
              <RoleplaySeedCard seed={json.roleplay_scenario_seed} />
            ) : (
              <p className="text-sm text-zinc-500">
                No roleplay seed — transcript was too sparse to construct a
                meaningful drill scenario.
              </p>
            )}
          </Section>

          <div className="text-xs text-zinc-500 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            Analyzer version {json.analyzer_version} ·{" "}
            <span className="font-mono">{json.transcript_id}</span>
          </div>
        </>
      )}
    </main>
  );
}
