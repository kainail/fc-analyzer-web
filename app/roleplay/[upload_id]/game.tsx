"use client";

/**
 * FC Roleplay — single-file client component.
 *
 * State machine:
 *   mode_select → loading → battle → victory|defeat → report
 *
 * mode_select + report screens use the standard fc-analyzer-web dark
 * mode design (cards, .btn, etc). battle/victory/defeat render inside
 * a 160×144 virtual pixel-art canvas scaled to fit the viewport.
 *
 * All session state lives in this component. The handler at
 * /api/roleplay/chat is stateless — every request carries the full
 * history, current resistance, and turn number.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

// ───────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────

export type RoleplaySeed = {
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

type Mode = "multiple_choice" | "text" | "voice";

type GameState =
  | "mode_select"
  | "loading"
  | "battle"
  | "victory"
  | "defeat"
  | "report";

type FloatingLabelKind = "STRONG" | "COMPETENT" | "WEAK" | "CRITICAL";

type Archetype =
  | "The Busy Professional"
  | "The Skeptic"
  | "The Enthusiast"
  | "The Decision Maker Blocker"
  | "The Price Shopper"
  | "The Ghost";

type AnimationState =
  | "idle"
  | "speaking"
  | "flinch"
  | "hardening"
  | "leaving"
  | "converted"
  | "flinch_breakthrough";

type HistoryEntry = {
  role: "prospect" | "rep";
  content: string;
  turn: number;
};

type McOption = { id: string; text: string };

type TurnResponse = {
  turn: number;
  phase: string;
  prospect_line: string;
  resistance_delta: number;
  resistance_after: number;
  floating_label: FloatingLabelKind | null;
  turn_feedback: string | null;
  animation: AnimationState;
  session_state: {
    resistance: number;
    turn: number;
    turn_limit: number;
    outcome: "win" | "loss_walkout" | "loss_timeout" | "draw" | null;
    wall_dropped: boolean;
  };
  multiple_choice_options: McOption[] | null;
};

type SessionStartResponse = {
  session_id: string;
  archetype: Archetype;
  starting_resistance: number;
  turn_limit: number | null;
  prospect_name: string;
  seed: RoleplaySeed;
};

type ReportPayload = {
  session_summary?: {
    outcome?: string;
    mode?: string;
    total_turns?: number;
    final_resistance?: number;
    starting_resistance?: number;
    strong_moves?: number;
    competent_moves?: number;
    weak_moves?: number;
    critical_moves?: number;
    longest_strong_streak?: number;
    xp_earned?: number;
  };
  stage_objective?: {
    stage?: string;
    objective?: string;
    status?: "met" | "partially_met" | "not_met";
    status_reasoning?: string;
  };
  best_moment?: {
    turn?: number;
    rep_said?: string;
    why_it_worked?: string;
    rubric_principle?: string;
  };
  worst_moment?: {
    turn?: number;
    rep_said?: string;
    what_went_wrong?: string;
    what_to_do_instead?: string;
  };
  primary_fix?: {
    skill?: string;
    stage?: string;
    pattern_observed?: string;
    drill_instruction?: string;
    success_looks_like?: string;
  };
  next_drill_recommendation?: {
    recommendation?: "same_stage_harder" | "same_stage_repeat" | "next_stage";
    stage?: string;
    reasoning?: string;
    suggested_archetype?: string;
    suggested_difficulty_modifiers?: string[];
  };
  pattern_note?: string | null;
};

type GameProps = {
  uploadId: string;
  prospectName: string;
  consultationDate: string;
  orgName: string;
  repName: string;
  seed: RoleplaySeed;
};

// ───────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────

const DEFAULT_PALETTE = ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"] as const;
const GHOST_OPEN_PALETTE = ["#0f1a2e", "#1a3a5c", "#4a7ab0", "#b0d4f5"] as const;
const DEFEAT_PALETTE = ["#080c08", "#1a2a18", "#456007", "#5a7008"] as const;

const TYPEWRITER_MS = 40;
const LABEL_FLOAT_MS = 800;
const RES_BAR_TRANSITION_MS = 400;
const TEXT_MAX_LEN = 280;

// ───────────────────────────────────────────────────────────────────
// Pixel sprites (16×16 grid; each char = palette index or '.' = transparent)
// '1' = darkest, '2' = dark, '3' = light, '4' = lightest
// ───────────────────────────────────────────────────────────────────

type SpriteGrid = readonly string[];

const SPRITE_BUSY: SpriteGrid = [
  "................",
  ".....111111.....",
  "....12222221....",
  "...1233333321...",
  "...1234334321...",
  "...1233333321...",
  "....12222221....",
  ".....111111.....",
  "....11222211....",
  "...12222222221..",
  "..122222122221..",
  "..122221122221..",
  "..122221122221..",
  "..122222222221..",
  "..111111111111..",
  "...11.....11....",
];

const SPRITE_SKEPTIC: SpriteGrid = [
  "................",
  "....11111111....",
  "...1222222221...",
  "...1233333321...",
  "..12333333332...",
  "..12331122331...",
  "..12331122331...",
  "...1233333321...",
  "...1223333221...",
  "....12211221....",
  "....11111111....",
  "..122122122122..",
  "..122122122122..",
  "..122122122122..",
  "..222222222222..",
  "..11.......11...",
];

const SPRITE_ENTHUSIAST: SpriteGrid = [
  "................",
  "....11111111....",
  "...1333333331...",
  "..122222222221..",
  "..123333333321..",
  "..123113113321..",
  "..123113113321..",
  "..123333333321..",
  "..123322233321..",
  "...1233333321...",
  "....12333321....",
  "...12333333321..",
  "..1233444433321.",
  "..1233444433321.",
  "..1233222233321.",
  "...111....111...",
];

const SPRITE_BLOCKER: SpriteGrid = [
  "................",
  ".....111111.....",
  "....12222221....",
  "...1233333321...",
  "..12333333321...",
  "..123311113321..",
  "..123322223321..",
  "..123333333321..",
  "...12333321...4.",
  "....11111111....",
  "...12222222221..",
  "..122212222221..",
  "..122212222221..",
  "..122222222221..",
  "..111111111111..",
  "...11.....11....",
];

const SPRITE_PRICE: SpriteGrid = [
  "................",
  "....11111111....",
  "...1222222221...",
  "..12333333321...",
  "..12333113321...",
  "..12333113321...",
  "..12333333321...",
  "...1233333321...",
  "....12211221....",
  "....11111111....",
  "...12222222221..",
  "..1222113222221.",
  "..1222113222221.",
  "..1222333222221.",
  "..1111111111111.",
  "...11.....11....",
];

const SPRITE_GHOST: SpriteGrid = [
  "................",
  ".....111111.....",
  "....11122211....",
  "...112222221....",
  "...1222222221...",
  "...1232222321...",
  "...1233333321...",
  "....12222221....",
  "....11111111....",
  "...122222221....",
  "...122222221....",
  "..12222222221...",
  "..12222222221...",
  "..12222222221...",
  "..11........11..",
  "..11........11..",
];

const SPRITES_IDLE: Record<Archetype, SpriteGrid> = {
  "The Busy Professional": SPRITE_BUSY,
  "The Skeptic": SPRITE_SKEPTIC,
  "The Enthusiast": SPRITE_ENTHUSIAST,
  "The Decision Maker Blocker": SPRITE_BLOCKER,
  "The Price Shopper": SPRITE_PRICE,
  "The Ghost": SPRITE_GHOST,
};

// Speaking variant: mouth row shifted to "open" pattern. Reuses idle
// for everything else — the typewriter timing animates it.
function withSpeakingMouth(grid: SpriteGrid): SpriteGrid {
  const out = grid.slice();
  if (out.length > 9) {
    out[9] = "....12233221....";
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────

function pickPalette(
  archetype: Archetype,
  wallDropped: boolean,
  victoryDarken: boolean,
): readonly string[] {
  if (victoryDarken) return DEFEAT_PALETTE;
  if (archetype === "The Ghost" && wallDropped) return GHOST_OPEN_PALETTE;
  return DEFAULT_PALETTE;
}

function labelColor(kind: FloatingLabelKind | null): string {
  switch (kind) {
    case "STRONG":
      return "#8bac0f";
    case "COMPETENT":
      return "#9bbc0f";
    case "WEAK":
      return "#f0a000";
    case "CRITICAL":
      return "#e03030";
    default:
      return "#9bbc0f";
  }
}

function deltaColor(delta: number): string {
  if (delta < 0) return "#8bac0f";
  if (delta > 0) return "#e03030";
  return "#9bbc0f";
}

function fmtDelta(d: number): string {
  if (d === 0) return "0";
  return d > 0 ? `+${d}` : String(d);
}

function stageLabel(stage: string): string {
  return stage
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function recommendationLabel(rec: string | undefined): string {
  switch (rec) {
    case "same_stage_repeat":
      return "Repeat this stage";
    case "same_stage_harder":
      return "Same stage — harder";
    case "next_stage":
      return "Move to next stage";
    default:
      return "—";
  }
}

function objectiveBadgeColor(status: string | undefined): {
  bg: string;
  fg: string;
} {
  switch (status) {
    case "met":
      return { bg: "var(--score-green-bg)", fg: "var(--score-green)" };
    case "partially_met":
      return { bg: "var(--score-amber-bg)", fg: "var(--score-amber)" };
    case "not_met":
      return { bg: "var(--score-red-bg)", fg: "var(--score-red)" };
    default:
      return { bg: "var(--surface-2)", fg: "var(--ink-3)" };
  }
}

// ───────────────────────────────────────────────────────────────────
// Pixel sprite renderer
// ───────────────────────────────────────────────────────────────────

function PixelSprite({
  grid,
  palette,
  pixel = 4,
}: {
  grid: SpriteGrid;
  palette: readonly string[];
  pixel?: number;
}) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const rects: React.ReactElement[] = [];
  for (let y = 0; y < rows; y++) {
    const row = grid[y];
    for (let x = 0; x < cols; x++) {
      if (!row || x >= row.length) continue;
      const ch = row[x];
      if (ch === "." || ch === " ") continue;
      const idx = ch.charCodeAt(0) - "1".charCodeAt(0);
      if (idx < 0 || idx >= palette.length) continue;
      rects.push(
        <rect
          key={`${x}-${y}`}
          x={x * pixel}
          y={y * pixel}
          width={pixel}
          height={pixel}
          fill={palette[idx]}
        />,
      );
    }
  }
  return (
    <svg
      width={cols * pixel}
      height={rows * pixel}
      viewBox={`0 0 ${cols * pixel} ${rows * pixel}`}
      shapeRendering="crispEdges"
      style={{ display: "block" }}
    >
      {rects}
    </svg>
  );
}

// ───────────────────────────────────────────────────────────────────
// Mode select
// ───────────────────────────────────────────────────────────────────

function ModeSelectView({
  prospectName,
  consultationDate,
  orgName,
  seed,
  onStart,
  starting,
  error,
}: {
  prospectName: string;
  consultationDate: string;
  orgName: string;
  seed: RoleplaySeed;
  onStart: (mode: Mode) => void;
  starting: Mode | null;
  error: string | null;
}) {
  const profile = seed.prospect_profile;
  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 20px 64px" }}>
      <div style={{ marginBottom: 18 }}>
        <Link
          href={`/analysis/${encodeURIComponent("")}`}
          style={{ color: "var(--ink-3)", fontSize: 12 }}
          // The actual back link is patched in by the parent via repName flow;
          // we override below.
        >
          {/* placeholder — replaced below */}
        </Link>
      </div>

      <header style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ink-4)",
            marginBottom: 6,
          }}
        >
          {orgName} · Roleplay drill
        </div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600 }}>
          {prospectName}
        </h1>
        <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4 }}>
          From consultation on {consultationDate}
        </div>
      </header>

      <section
        className="card card-pad"
        style={{ marginBottom: 18, padding: 20 }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 14,
          }}
        >
          <div>
            <MiniLabel>Stage being drilled</MiniLabel>
            <div className="chip chip-primary" style={{ marginTop: 4 }}>
              {stageLabel(seed.stage_to_drill_enum)}
            </div>
          </div>
          <div>
            <MiniLabel>Estimated duration</MiniLabel>
            <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>
              {seed.estimated_drill_duration_minutes} min
            </div>
          </div>
        </div>

        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--divider)",
            borderRadius: 8,
            padding: "14px 16px",
          }}
        >
          <MiniLabel>Prospect profile</MiniLabel>
          <dl style={{ margin: 0, display: "grid", gap: 6 }}>
            {[
              ["Demographic", profile.demographic],
              ["Stated surface goal", profile.stated_surface_goal],
              ["Objection likely", profile.objection_likely],
              ["Personality signals", profile.personality_signals],
            ].map(([k, v]) => (
              <div
                key={k}
                style={{ fontSize: 12.5, color: "var(--ink-2)" }}
              >
                <span style={{ color: "var(--ink-4)" }}>{k}:</span> {v}
              </div>
            ))}
          </dl>
        </div>
      </section>

      <h2 style={{ fontSize: 14, fontWeight: 600, margin: "26px 0 12px" }}>
        Pick a mode
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        {(
          [
            {
              mode: "multiple_choice" as const,
              title: "Multiple choice",
              tier: "BEGINNER",
              body: "Pick from 4 options each turn. Best for learning the rubric.",
            },
            {
              mode: "text" as const,
              title: "Text battle",
              tier: "INTERMEDIATE",
              body: "Type your response freely. Forces you to think, not recognize.",
            },
            {
              mode: "voice" as const,
              title: "Voice battle",
              tier: "ADVANCED",
              body: "Speak your response. Closest to a real call.",
            },
          ]
        ).map((card) => {
          const isStarting = starting === card.mode;
          return (
            <button
              key={card.mode}
              type="button"
              onClick={() => onStart(card.mode)}
              disabled={starting !== null}
              className="card card-pad"
              style={{
                textAlign: "left",
                padding: 18,
                cursor: starting !== null ? "wait" : "pointer",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                transition: "border-color 120ms ease, transform 60ms ease",
                opacity: starting !== null && !isStarting ? 0.55 : 1,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  color: "var(--primary)",
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                {card.tier}
              </div>
              <div
                style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}
              >
                {card.title}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--ink-3)",
                  lineHeight: 1.45,
                }}
              >
                {card.body}
              </div>
              <div
                style={{
                  marginTop: 14,
                  fontSize: 12,
                  color: isStarting ? "var(--primary)" : "var(--ink-4)",
                  fontWeight: 500,
                }}
              >
                {isStarting ? "Starting…" : "Start →"}
              </div>
            </button>
          );
        })}
      </div>

      {error ? (
        <div
          style={{
            marginTop: 16,
            padding: "10px 14px",
            background: "var(--score-red-bg)",
            color: "var(--score-red)",
            border: "1px solid var(--score-red)",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}
    </main>
  );
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--ink-4)",
        fontWeight: 600,
        marginBottom: 2,
      }}
    >
      {children}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Pixel canvas wrapper — handles scale + scanlines
// ───────────────────────────────────────────────────────────────────

function PixelCanvas({
  children,
  bg = "#0f380f",
}: {
  children: React.ReactNode;
  bg?: string;
}) {
  const [scale, setScale] = useState(3);
  useEffect(() => {
    const recompute = () => {
      const w = window.innerWidth;
      const h = window.innerHeight - 32;
      const s = Math.max(
        2,
        Math.min(6, Math.floor(Math.min(w / 160, h / 144))),
      );
      setScale(s);
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        fontFamily: "var(--font-pixel), monospace",
      }}
    >
      <div
        style={{
          width: 160,
          height: 144,
          background: bg,
          position: "relative",
          transform: `scale(${scale})`,
          transformOrigin: "center",
          imageRendering: "pixelated",
          overflow: "hidden",
          color: "#9bbc0f",
        }}
      >
        {children}
        {/* scanline overlay */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            backgroundImage:
              "repeating-linear-gradient(180deg, rgba(0,0,0,0.15) 0, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 2px)",
            mixBlendMode: "multiply",
          }}
        />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Battle view — the 160×144 game screen
// ───────────────────────────────────────────────────────────────────

type DialogMode =
  | { kind: "prospect_speaking"; text: string; charsShown: number; done: boolean }
  | { kind: "rep_input_mc"; options: McOption[] }
  | { kind: "rep_input_text" }
  | { kind: "rep_input_voice" }
  | { kind: "evaluating" }
  | { kind: "coaching"; text: string }
  | { kind: "exit_line"; text: string; charsShown: number; done: boolean };

function ResistanceBar({
  value,
  flash,
}: {
  value: number;
  flash: boolean;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const w = Math.round((pct / 100) * 48);
  let color: string = "#8bac0f";
  if (flash) color = "#9bbc0f";
  else if (pct < 25) color = "#306230";
  return (
    <div
      style={{
        width: 48,
        height: 6,
        background: "#0f380f",
        border: "1px solid #0f380f",
        position: "relative",
      }}
    >
      <div
        style={{
          width: w,
          height: 6,
          background: color,
          transition: `width ${RES_BAR_TRANSITION_MS}ms ease, background-color 200ms ease`,
        }}
      />
    </div>
  );
}

function PixelText({
  children,
  size = 6,
  color = "#9bbc0f",
  style,
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={{
        fontSize: size,
        lineHeight: 1,
        letterSpacing: 0,
        color,
        fontFamily: "var(--font-pixel), monospace",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function FloatingLabelDisplay({
  label,
  delta,
  shake,
  keyId,
}: {
  label: FloatingLabelKind;
  delta: number;
  shake: boolean;
  keyId: number;
}) {
  return (
    <div
      key={keyId}
      className={`fc-float ${shake ? "fc-float-shake" : ""}`}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 28,
        display: "flex",
        justifyContent: "center",
        gap: 4,
        pointerEvents: "none",
      }}
    >
      <PixelText size={8} color={labelColor(label)}>
        {label}
      </PixelText>
      <PixelText size={8} color={deltaColor(delta)}>
        {fmtDelta(delta)}
      </PixelText>
    </div>
  );
}

function ProspectSpriteArea({
  archetype,
  animation,
  palette,
  speakingFrame,
}: {
  archetype: Archetype;
  animation: AnimationState;
  palette: readonly string[];
  speakingFrame: number;
}) {
  const baseGrid = SPRITES_IDLE[archetype] ?? SPRITE_SKEPTIC;
  const grid =
    animation === "speaking" && speakingFrame % 2 === 1
      ? withSpeakingMouth(baseGrid)
      : baseGrid;

  let animClass = "fc-sprite-idle";
  if (animation === "flinch" || animation === "flinch_breakthrough") {
    animClass = "fc-sprite-flinch";
  } else if (animation === "hardening") {
    animClass = "fc-sprite-hardening";
  } else if (animation === "leaving") {
    animClass = "fc-sprite-leaving";
  } else if (animation === "converted") {
    animClass = "fc-sprite-converted";
  }

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 16,
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div className={animClass} style={{ width: 64, height: 64 }}>
        <PixelSprite grid={grid} palette={palette} pixel={4} />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Battle view component
// ───────────────────────────────────────────────────────────────────

function BattleView(props: {
  archetype: Archetype;
  prospectName: string;
  repName: string;
  resistance: number;
  resistanceFlash: boolean;
  confidence: number;
  animation: AnimationState;
  wallDropped: boolean;
  dialog: DialogMode;
  pendingLabel: {
    label: FloatingLabelKind;
    delta: number;
    keyId: number;
  } | null;
  textInputValue: string;
  voicePhase: VoicePhase;
  voiceTranscript: string;
  voiceError: string | null;
  onAdvanceProspect: () => void;
  onAdvanceCoaching: () => void;
  onSelectMc: (opt: McOption) => void;
  onChangeText: (s: string) => void;
  onSubmitText: () => void;
  onVoicePress: () => void;
  onVoiceRelease: () => void;
  onVoiceConfirm: () => void;
  onVoiceRetry: () => void;
}) {
  const palette = pickPalette(props.archetype, props.wallDropped, false);
  const truncatedName = props.prospectName.toUpperCase().slice(0, 12);
  // First name only — the YOU header has to share 160px with the CON
  // bar (~75px), so anything past ~8 chars wraps to a second line.
  const repFirst = props.repName
    .split(/\s+/)[0]
    .toUpperCase()
    .slice(0, 8);
  const speakingFrame = useSpeakingFrame(
    props.dialog.kind === "prospect_speaking" && !props.dialog.done,
  );

  // Canvas now hosts only zones 1-3 (160×96). The dialog box (formerly
  // zone 4) renders as standard HTML below the canvas at readable
  // font sizes — Press Start 2P at 5-6px virtual was unworkable for
  // anything longer than a sentence.
  const [scale, setScale] = useState(3);
  useEffect(() => {
    const recompute = () => {
      const wAvail = window.innerWidth - 32;
      // Reserve ~280px for the HTML dialog box + page padding.
      const hAvail = window.innerHeight - 280;
      const s = Math.max(
        2,
        Math.min(6, Math.floor(Math.min(wAvail / 160, hAvail / 96))),
      );
      setScale(s);
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);

  return (
    <div
      style={{
        // Natural document flow — no position: fixed, no viewport-height
        // cap. The page scrolls when canvas + dialog exceed the viewport
        // so the MC options never get clipped off the bottom.
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: 16,
        gap: 16,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          // Explicit visual size so document flow accounts for the CSS
          // transform: scale() on the inner canvas (transform doesn't
          // affect layout). This keeps the top of the canvas from being
          // clipped and stops surrounding elements from overlapping it.
          width: 160 * scale,
          height: 96 * scale,
          position: "relative",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 160,
            height: 96,
            background: "#0f380f",
            position: "absolute",
            top: 0,
            left: 0,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            imageRendering: "pixelated",
            overflow: "hidden",
            color: "#9bbc0f",
            fontFamily: "var(--font-pixel), monospace",
          }}
        >
          {/* Zone 1: prospect header */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 16,
              padding: "4px 4px 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxSizing: "border-box",
            }}
          >
            <PixelText
              size={6}
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "clip",
                minWidth: 0,
              }}
            >
              {truncatedName}
            </PixelText>
            <div
              style={{
                display: "flex",
                gap: 4,
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <PixelText size={6}>RES</PixelText>
              <ResistanceBar
                value={props.resistance}
                flash={props.resistanceFlash}
              />
            </div>
          </div>

          {/* Zone 2: sprite area + floating label */}
          <ProspectSpriteArea
            archetype={props.archetype}
            animation={props.animation}
            palette={palette}
            speakingFrame={speakingFrame}
          />
          {props.pendingLabel ? (
            <FloatingLabelDisplay
              keyId={props.pendingLabel.keyId}
              label={props.pendingLabel.label}
              delta={props.pendingLabel.delta}
              shake={props.pendingLabel.label === "CRITICAL"}
            />
          ) : null}

          {/* Zone 3: rep header (now flush with the bottom of the canvas) */}
          <div
            style={{
              position: "absolute",
              top: 80,
              left: 0,
              right: 0,
              height: 16,
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxSizing: "border-box",
              borderTop: "1px solid #306230",
            }}
          >
            <PixelText
              size={6}
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "clip",
                minWidth: 0,
              }}
            >
              YOU {repFirst}
            </PixelText>
            <div
              style={{
                display: "flex",
                gap: 4,
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <PixelText size={6}>CON</PixelText>
              <ResistanceBar value={props.confidence} flash={false} />
            </div>
          </div>

          {/* scanline overlay (inside the scaled canvas only) */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              backgroundImage:
                "repeating-linear-gradient(180deg, rgba(0,0,0,0.15) 0, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 2px)",
              mixBlendMode: "multiply",
            }}
          />
        </div>
      </div>

      <HtmlDialogBox
        prospectName={props.prospectName}
        dialog={props.dialog}
        textInputValue={props.textInputValue}
        voicePhase={props.voicePhase}
        voiceTranscript={props.voiceTranscript}
        voiceError={props.voiceError}
        onAdvanceProspect={props.onAdvanceProspect}
        onAdvanceCoaching={props.onAdvanceCoaching}
        onSelectMc={props.onSelectMc}
        onChangeText={props.onChangeText}
        onSubmitText={props.onSubmitText}
        onVoicePress={props.onVoicePress}
        onVoiceRelease={props.onVoiceRelease}
        onVoiceConfirm={props.onVoiceConfirm}
        onVoiceRetry={props.onVoiceRetry}
      />
    </div>
  );
}

type VoicePhase =
  | "idle"
  | "recording"
  | "transcribing"
  | "confirming"
  | "error";

function useSpeakingFrame(active: boolean): number {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setFrame((f) => f + 1), 200);
    return () => clearInterval(id);
  }, [active]);
  return frame;
}

// ───────────────────────────────────────────────────────────────────
// HTML dialog box — renders BELOW the pixel canvas at readable sizes.
// All Press Start 2P, dark-mode styled, no scaling. The pixel canvas
// keeps its retro feel; the dialog gets HTML-native legibility.
// ───────────────────────────────────────────────────────────────────

const DIALOG_BORDER = "#8bac0f";

function HtmlDialogBox(props: {
  prospectName: string;
  dialog: DialogMode;
  textInputValue: string;
  voicePhase: VoicePhase;
  voiceTranscript: string;
  voiceError: string | null;
  onAdvanceProspect: () => void;
  onAdvanceCoaching: () => void;
  onSelectMc: (opt: McOption) => void;
  onChangeText: (s: string) => void;
  onSubmitText: () => void;
  onVoicePress: () => void;
  onVoiceRelease: () => void;
  onVoiceConfirm: () => void;
  onVoiceRetry: () => void;
}) {
  const { dialog } = props;
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 720,
        minHeight: 120,
        background: "var(--surface-2)",
        border: `2px solid ${DIALOG_BORDER}`,
        borderRadius: 6,
        padding: 16,
        boxSizing: "border-box",
        fontFamily: "var(--font-pixel), monospace",
        color: "var(--ink)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          color: "var(--ink-4)",
          marginBottom: 12,
          textTransform: "uppercase",
        }}
      >
        {props.prospectName}
      </div>
      {dialog.kind === "prospect_speaking" || dialog.kind === "exit_line" ? (
        <HtmlProspectLine
          text={dialog.text}
          charsShown={dialog.charsShown}
          done={dialog.done}
          onAdvance={props.onAdvanceProspect}
        />
      ) : null}
      {dialog.kind === "rep_input_mc" ? (
        <HtmlMcOptions
          options={dialog.options}
          onSelect={props.onSelectMc}
        />
      ) : null}
      {dialog.kind === "rep_input_text" ? (
        <HtmlTextInput
          value={props.textInputValue}
          onChange={props.onChangeText}
          onSubmit={props.onSubmitText}
        />
      ) : null}
      {dialog.kind === "rep_input_voice" ? (
        <HtmlVoiceInput
          phase={props.voicePhase}
          transcript={props.voiceTranscript}
          error={props.voiceError}
          onPress={props.onVoicePress}
          onRelease={props.onVoiceRelease}
          onConfirm={props.onVoiceConfirm}
          onRetry={props.onVoiceRetry}
        />
      ) : null}
      {dialog.kind === "evaluating" ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "24px 0",
            fontSize: 12,
            color: "var(--ink-3)",
          }}
        >
          EVALUATING<span className="fc-dots" />
        </div>
      ) : null}
      {dialog.kind === "coaching" ? (
        <HtmlCoachingDialog
          text={dialog.text}
          onAdvance={props.onAdvanceCoaching}
        />
      ) : null}
    </div>
  );
}

function HtmlProspectLine({
  text,
  charsShown,
  done,
  onAdvance,
}: {
  text: string;
  charsShown: number;
  done: boolean;
  onAdvance: () => void;
}) {
  const shown = text.slice(0, charsShown);
  return (
    <div
      onClick={onAdvance}
      style={{
        cursor: done ? "pointer" : "default",
        minHeight: 60,
      }}
    >
      <span
        style={{
          fontSize: 12,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          color: "var(--ink)",
        }}
      >
        {shown}
      </span>
      {done ? (
        <span
          className="fc-blink"
          style={{
            marginLeft: 8,
            color: DIALOG_BORDER,
            fontSize: 12,
          }}
        >
          ▼
        </span>
      ) : null}
    </div>
  );
}

function HtmlMcOptions({
  options,
  onSelect,
}: {
  options: McOption[];
  onSelect: (opt: McOption) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {options.slice(0, 4).map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onSelect(opt)}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            padding: "10px 12px",
            borderRadius: 4,
            textAlign: "left",
            cursor: "pointer",
            color: "var(--ink)",
            fontSize: 11,
            lineHeight: 1.6,
            fontFamily: "var(--font-pixel), monospace",
            transition: "border-color 100ms ease, background 100ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = DIALOG_BORDER;
            e.currentTarget.style.background = "var(--surface-sunken)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-strong)";
            e.currentTarget.style.background = "var(--surface)";
          }}
        >
          {`> ${opt.text}`}
        </button>
      ))}
    </div>
  );
}

function HtmlTextInput({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (s: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div>
      <textarea
        autoFocus
        value={value}
        maxLength={TEXT_MAX_LEN}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder="TYPE YOUR REPLY"
        style={{
          width: "100%",
          minHeight: 64,
          background: "var(--surface)",
          color: "var(--ink)",
          border: "1px solid var(--border-strong)",
          outline: "none",
          resize: "vertical",
          fontFamily: "var(--font-pixel), monospace",
          fontSize: 11,
          lineHeight: 1.6,
          padding: 10,
          borderRadius: 4,
          boxSizing: "border-box",
        }}
      />
      <div
        style={{
          marginTop: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "var(--ink-4)",
            fontFamily: "var(--font-pixel), monospace",
          }}
        >
          {value.length}/{TEXT_MAX_LEN}
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={value.length === 0}
          className="btn btn-primary btn-sm"
          style={{ fontFamily: "var(--font-pixel), monospace" }}
        >
          SEND ►
        </button>
      </div>
    </div>
  );
}

function HtmlVoiceInput({
  phase,
  transcript,
  error,
  onPress,
  onRelease,
  onConfirm,
  onRetry,
}: {
  phase: VoicePhase;
  transcript: string;
  error: string | null;
  onPress: () => void;
  onRelease: () => void;
  onConfirm: () => void;
  onRetry: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: "16px 0",
      }}
    >
      {phase === "idle" ? (
        <button
          type="button"
          onMouseDown={onPress}
          onMouseUp={onRelease}
          onMouseLeave={(e) => {
            if ((e.buttons & 1) !== 0) onRelease();
          }}
          onTouchStart={(e) => {
            e.preventDefault();
            onPress();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            onRelease();
          }}
          className="btn btn-primary btn-lg"
          style={{ fontFamily: "var(--font-pixel), monospace" }}
        >
          HOLD TO SPEAK
        </button>
      ) : null}
      {phase === "recording" ? (
        <span style={{ fontSize: 12, color: "var(--score-red)" }}>
          <span className="fc-blink">●</span> LISTENING
          <span className="fc-dots" />
        </span>
      ) : null}
      {phase === "transcribing" ? (
        <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
          TRANSCRIBING<span className="fc-dots" />
        </span>
      ) : null}
      {phase === "confirming" ? (
        <>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              padding: "10px 12px",
              borderRadius: 4,
              fontSize: 11,
              color: "var(--ink-2)",
              maxWidth: 480,
              lineHeight: 1.6,
            }}
          >
            &ldquo;{transcript}&rdquo;
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              onClick={onConfirm}
              className="btn btn-primary btn-sm"
              style={{ fontFamily: "var(--font-pixel), monospace" }}
            >
              CONFIRM
            </button>
            <button
              type="button"
              onClick={onRetry}
              className="btn btn-secondary btn-sm"
              style={{ fontFamily: "var(--font-pixel), monospace" }}
            >
              RETRY
            </button>
          </div>
        </>
      ) : null}
      {phase === "error" ? (
        <>
          <span style={{ color: "var(--score-red)", fontSize: 11 }}>
            {error ?? "VOICE ERROR"}
          </span>
          <button
            type="button"
            onClick={onRetry}
            className="btn btn-secondary btn-sm"
            style={{ fontFamily: "var(--font-pixel), monospace" }}
          >
            RETRY
          </button>
        </>
      ) : null}
    </div>
  );
}

function HtmlCoachingDialog({
  text,
  onAdvance,
}: {
  text: string;
  onAdvance: () => void;
}) {
  return (
    <div onClick={onAdvance} style={{ cursor: "pointer" }}>
      <div
        style={{
          fontSize: 10,
          color: DIALOG_BORDER,
          marginBottom: 8,
          letterSpacing: "0.12em",
        }}
      >
        COACH:
      </div>
      <span
        style={{
          fontSize: 12,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          color: "var(--ink-2)",
        }}
      >
        {text}
      </span>
      <div
        style={{
          marginTop: 10,
          fontSize: 11,
          color: DIALOG_BORDER,
          letterSpacing: "0.08em",
        }}
      >
        <span className="fc-blink">▼</span> CONTINUE
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Victory / defeat screens
// ───────────────────────────────────────────────────────────────────

function VictoryView({
  archetype,
  xpEarned,
  onContinue,
  loadingReport,
}: {
  archetype: Archetype;
  xpEarned: number | null;
  onContinue: () => void;
  loadingReport: boolean;
}) {
  const [rollingXp, setRollingXp] = useState(0);
  useEffect(() => {
    if (xpEarned == null) return;
    const start = performance.now();
    const dur = 1500;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setRollingXp(Math.round(xpEarned * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [xpEarned]);

  useEffect(() => {
    const handler = (e: KeyboardEvent | MouseEvent | TouchEvent) => {
      e.preventDefault();
      onContinue();
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("click", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("click", handler);
    };
  }, [onContinue]);

  return (
    <PixelCanvas bg="#0f380f">
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <PixelText size={8}>★ CONSULTATION ★</PixelText>
        <PixelText size={8}>COMPLETE</PixelText>
        <div className="fc-sprite-converted" style={{ marginTop: 4 }}>
          <PixelSprite
            grid={SPRITES_IDLE[archetype] ?? SPRITE_SKEPTIC}
            palette={DEFAULT_PALETTE}
            pixel={2}
          />
        </div>
        <PixelText size={6}>XP: {rollingXp}</PixelText>
        <PixelText size={6} color="#306230" style={{ marginTop: 6 }}>
          {loadingReport ? "LOADING REPORT…" : "PRESS ANY KEY"}
        </PixelText>
      </div>
    </PixelCanvas>
  );
}

function DefeatView({
  archetype,
  exitLine,
  xpEarned,
  onContinue,
  loadingReport,
}: {
  archetype: Archetype;
  exitLine: string;
  xpEarned: number | null;
  onContinue: () => void;
  loadingReport: boolean;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent | MouseEvent | TouchEvent) => {
      e.preventDefault();
      onContinue();
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("click", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("click", handler);
    };
  }, [onContinue]);

  return (
    <PixelCanvas bg="#080c08">
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: 6,
        }}
      >
        <PixelText size={8} color="#e03030">
          ✗ PROSPECT LEFT
        </PixelText>
        <div className="fc-sprite-leaving" style={{ marginTop: 4 }}>
          <PixelSprite
            grid={SPRITES_IDLE[archetype] ?? SPRITE_SKEPTIC}
            palette={DEFEAT_PALETTE}
            pixel={2}
          />
        </div>
        <PixelText
          size={6}
          color="#9bbc0f"
          style={{
            whiteSpace: "pre-wrap",
            textAlign: "center",
            maxWidth: 140,
            lineHeight: 1.4,
          }}
        >
          &ldquo;{exitLine}&rdquo;
        </PixelText>
        {xpEarned != null ? (
          <PixelText size={6}>XP: {xpEarned}</PixelText>
        ) : null}
        <PixelText size={6} color="#306230" style={{ marginTop: 6 }}>
          {loadingReport ? "LOADING REPORT…" : "PRESS ANY KEY"}
        </PixelText>
      </div>
    </PixelCanvas>
  );
}

// ───────────────────────────────────────────────────────────────────
// Report view
// ───────────────────────────────────────────────────────────────────

function ReportView({
  report,
  uploadId,
  onPlayAgain,
}: {
  report: ReportPayload;
  uploadId: string;
  onPlayAgain: () => void;
}) {
  const s = report.session_summary ?? {};
  const stage = report.stage_objective ?? {};
  const best = report.best_moment ?? {};
  const worst = report.worst_moment ?? {};
  const fix = report.primary_fix ?? {};
  const next = report.next_drill_recommendation ?? {};
  const badge = objectiveBadgeColor(stage.status);

  const outcomeChip = (() => {
    const o = s.outcome;
    if (o === "win") return { label: "WIN", bg: "var(--sold-bg)", fg: "var(--sold)" };
    if (o === "loss_walkout")
      return { label: "WALKOUT", bg: "var(--score-red-bg)", fg: "var(--score-red)" };
    if (o === "loss_timeout")
      return { label: "TIMEOUT", bg: "var(--score-amber-bg)", fg: "var(--score-amber)" };
    if (o === "draw")
      return { label: "DRAW", bg: "var(--surface-2)", fg: "var(--ink-3)" };
    return { label: "ENDED", bg: "var(--surface-2)", fg: "var(--ink-3)" };
  })();

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 80px" }}>
      <header style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ink-4)",
          }}
        >
          Drill report
        </div>
        <h1 style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 600 }}>
          Session debrief
        </h1>
      </header>

      <section className="card card-pad" style={{ marginBottom: 16, padding: 20 }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 999,
              background: outcomeChip.bg,
              color: outcomeChip.fg,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
            }}
          >
            {outcomeChip.label}
          </span>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {s.mode ?? "—"} · {s.total_turns ?? 0} turns · {s.xp_earned ?? 0} XP
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 10,
          }}
        >
          <StatCell label="Strong" value={s.strong_moves ?? 0} color="var(--score-green)" />
          <StatCell label="Competent" value={s.competent_moves ?? 0} />
          <StatCell label="Weak" value={s.weak_moves ?? 0} color="var(--score-amber)" />
          <StatCell label="Critical" value={s.critical_moves ?? 0} color="var(--score-red)" />
          <StatCell
            label="Best streak"
            value={s.longest_strong_streak ?? 0}
          />
          <StatCell
            label="Final resistance"
            value={s.final_resistance ?? "—"}
          />
        </div>
      </section>

      <section className="card card-pad" style={{ marginBottom: 16, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
            Stage objective
          </h2>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              background: badge.bg,
              color: badge.fg,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {stage.status?.replace("_", " ").toUpperCase() ?? "—"}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 4 }}>
          {stage.stage ? stageLabel(stage.stage) : "—"}
        </div>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ink-2)" }}>
          {stage.objective ?? "—"}
        </p>
        {stage.status_reasoning ? (
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>
            {stage.status_reasoning}
          </p>
        ) : null}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Moment
          title="Best moment"
          accent="var(--score-green)"
          turn={best.turn}
          said={best.rep_said}
          body={best.why_it_worked}
          footer={best.rubric_principle}
        />
        <Moment
          title="Worst moment"
          accent="var(--score-red)"
          turn={worst.turn}
          said={worst.rep_said}
          body={worst.what_went_wrong}
          footer={worst.what_to_do_instead}
        />
      </div>

      <section className="card card-pad" style={{ marginBottom: 16, padding: 20 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
          Primary fix
        </h2>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          {fix.skill ?? "—"}
          {fix.stage ? (
            <span style={{ color: "var(--ink-4)", marginLeft: 8, fontWeight: 400 }}>
              · {stageLabel(fix.stage)}
            </span>
          ) : null}
        </div>
        {fix.pattern_observed ? (
          <p style={{ margin: "6px 0", fontSize: 12.5, color: "var(--ink-2)" }}>
            <strong style={{ color: "var(--ink-3)" }}>Pattern: </strong>
            {fix.pattern_observed}
          </p>
        ) : null}
        {fix.drill_instruction ? (
          <p style={{ margin: "6px 0", fontSize: 12.5, color: "var(--ink-2)" }}>
            <strong style={{ color: "var(--ink-3)" }}>Drill: </strong>
            {fix.drill_instruction}
          </p>
        ) : null}
        {fix.success_looks_like ? (
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-2)" }}>
            <strong style={{ color: "var(--ink-3)" }}>Success: </strong>
            {fix.success_looks_like}
          </p>
        ) : null}
      </section>

      <section className="card card-pad" style={{ marginBottom: 22, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
            Next drill
          </h2>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              background: "var(--primary-50)",
              color: "var(--primary)",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {recommendationLabel(next.recommendation)}
          </span>
        </div>
        {next.reasoning ? (
          <p style={{ margin: "6px 0", fontSize: 12.5, color: "var(--ink-2)" }}>
            {next.reasoning}
          </p>
        ) : null}
        {next.suggested_archetype ? (
          <p style={{ margin: "6px 0", fontSize: 12.5, color: "var(--ink-3)" }}>
            Suggested archetype: <strong>{next.suggested_archetype}</strong>
          </p>
        ) : null}
        {next.suggested_difficulty_modifiers &&
        next.suggested_difficulty_modifiers.length > 0 ? (
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>
            Modifiers:{" "}
            {next.suggested_difficulty_modifiers.join(", ")}
          </p>
        ) : null}
      </section>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onPlayAgain}
        >
          Play again
        </button>
        <Link
          href={`/analysis/${encodeURIComponent(uploadId)}`}
          className="btn btn-secondary"
        >
          Back to analysis
        </Link>
      </div>
    </main>
  );
}

function StatCell({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--divider)",
        borderRadius: 8,
        padding: "8px 10px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-4)",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: color ?? "var(--ink)",
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Moment({
  title,
  accent,
  turn,
  said,
  body,
  footer,
}: {
  title: string;
  accent: string;
  turn: number | undefined;
  said: string | undefined;
  body: string | undefined;
  footer: string | undefined;
}) {
  return (
    <section
      className="card card-pad"
      style={{
        padding: 18,
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{title}</h2>
        <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
          {typeof turn === "number" ? `Turn ${turn}` : "—"}
        </span>
      </div>
      {said ? (
        <p
          style={{
            margin: "6px 0",
            fontSize: 12,
            color: "var(--ink-2)",
            fontStyle: "italic",
            borderLeft: "2px solid var(--divider)",
            paddingLeft: 8,
          }}
        >
          “{said}”
        </p>
      ) : null}
      {body ? (
        <p style={{ margin: "6px 0", fontSize: 12.5, color: "var(--ink-2)" }}>
          {body}
        </p>
      ) : null}
      {footer ? (
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--ink-3)" }}>
          {footer}
        </p>
      ) : null}
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────
// Main game component
// ───────────────────────────────────────────────────────────────────

function exitLineFor(archetype: Archetype | null, outcome: string | null): string {
  if (!archetype) return "I should get going.";
  const map: Record<Archetype, { walkout: string; timeout: string }> = {
    "The Busy Professional": {
      walkout: "I appreciate your time but I've got a 2 o'clock.",
      timeout: "I really do have to run. Send me something via email.",
    },
    "The Skeptic": {
      walkout: "I don't think this is for me. I've tried things like this before.",
      timeout: "I need to do more research before I commit to anything.",
    },
    "The Enthusiast": {
      walkout: "Yeah this is so cool, I just want to think about it.",
      timeout: "This is awesome — I'll definitely come back.",
    },
    "The Decision Maker Blocker": {
      walkout: "I really need to talk to my husband before I do anything.",
      timeout: "Can I bring my wife in sometime this week?",
    },
    "The Price Shopper": {
      walkout: "It's just a lot of money. I can probably do this on my own.",
      timeout: "I'm going to check out a couple other places and compare.",
    },
    "The Ghost": {
      walkout: "Sorry, I don't think now is the right time.",
      timeout: "...",
    },
  };
  if (outcome === "loss_timeout") return map[archetype].timeout;
  return map[archetype].walkout;
}

export default function Game({
  uploadId,
  prospectName,
  consultationDate,
  orgName,
  repName,
  seed,
}: GameProps) {
  const [gameState, setGameState] = useState<GameState>("mode_select");
  const [session, setSession] = useState<SessionStartResponse | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [startingMode, setStartingMode] = useState<Mode | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const [resistance, setResistance] = useState<number>(50);
  const [resistanceFlash, setResistanceFlash] = useState(false);
  const [confidence, setConfidence] = useState<number>(50);
  const [currentTurn, setCurrentTurn] = useState<number>(1);
  const [wallDropped, setWallDropped] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const [animation, setAnimation] = useState<AnimationState>("idle");
  const [dialog, setDialog] = useState<DialogMode>({
    kind: "evaluating",
  });
  const [pendingLabel, setPendingLabel] = useState<
    { label: FloatingLabelKind; delta: number; keyId: number } | null
  >(null);

  // Move tallies for XP/report fallback
  const [moveTallies, setMoveTallies] = useState({
    strong: 0,
    competent: 0,
    weak: 0,
    critical: 0,
    longestStreak: 0,
    currentStreak: 0,
  });
  const [pendingOptions, setPendingOptions] = useState<McOption[] | null>(null);
  const [textInputValue, setTextInputValue] = useState("");

  // Voice mode
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderStreamRef = useRef<MediaStream | null>(null);

  // Phase E ("coaching") used to auto-advance after 4 seconds. It now
  // waits for the user to click — we stash the original advance action
  // here when entering coaching, and the click handler pulls it out.
  const coachingAdvanceRef = useRef<(() => void) | null>(null);

  // Final outcome bookkeeping
  const [outcome, setOutcome] = useState<
    "win" | "loss_walkout" | "loss_timeout" | "draw" | null
  >(null);
  const [exitLine, setExitLine] = useState<string>("");
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [labelKeyCounter, setLabelKeyCounter] = useState(0);

  const archetype: Archetype | null = session?.archetype ?? null;

  // Typewriter — declared first so applyProspectTurn can reference it.
  const typewriterRef = useRef<{ raf: number | null }>({ raf: null });
  const startTypewriter = useCallback(
    (text: string, kind: "prospect_speaking" | "exit_line", onDone: () => void) => {
      if (typewriterRef.current.raf != null) {
        clearTimeout(typewriterRef.current.raf);
      }
      let idx = 0;
      setDialog({ kind, text, charsShown: 0, done: false });
      const tick = () => {
        idx += 1;
        if (idx >= text.length) {
          setDialog({ kind, text, charsShown: text.length, done: true });
          typewriterRef.current.raf = null;
          onDone();
          return;
        }
        setDialog({ kind, text, charsShown: idx, done: false });
        typewriterRef.current.raf = window.setTimeout(
          tick,
          TYPEWRITER_MS,
        ) as unknown as number;
      };
      typewriterRef.current.raf = window.setTimeout(
        tick,
        TYPEWRITER_MS,
      ) as unknown as number;
    },
    [],
  );

  // ── Finalize outcome ──
  const finalizeOutcome = useCallback(
    (
      o: "win" | "loss_walkout" | "loss_timeout" | "draw",
      data: TurnResponse,
    ) => {
      setOutcome(o);
      if (o === "win") {
        setAnimation("converted");
        setGameState("victory");
      } else if (o === "loss_walkout" || o === "loss_timeout") {
        setAnimation("leaving");
        const arch = session?.archetype ?? null;
        const line =
          data.prospect_line || exitLineFor(arch, o);
        setExitLine(line);
        setGameState("defeat");
      } else {
        setAnimation("idle");
        setGameState("defeat");
        setExitLine(data.prospect_line || "");
      }
    },
    [session],
  );

  // ── Apply a prospect turn (from session_open or evaluation response) ──
  const applyProspectTurn = useCallback(
    (data: TurnResponse, currentMode: Mode, isOpen: boolean) => {
      const turnNum = data.turn ?? 1;
      setCurrentTurn(turnNum);
      if (typeof data.resistance_after === "number") {
        setResistance(data.resistance_after);
      }
      if (data.session_state?.wall_dropped) {
        setWallDropped(true);
      }
      setAnimation(data.animation || "speaking");

      // Resistance flash when bar drops
      if (data.resistance_delta < 0) {
        setResistanceFlash(true);
        setTimeout(() => setResistanceFlash(false), 500);
      }

      // Update confidence based on label
      setConfidence((prev) => {
        if (data.floating_label === "STRONG") return Math.min(100, prev + 10);
        if (data.floating_label === "COMPETENT") return Math.min(100, prev + 4);
        if (data.floating_label === "WEAK") return Math.max(0, prev - 8);
        if (data.floating_label === "CRITICAL") return Math.max(0, prev - 15);
        return prev;
      });

      // Tallies + streak (skip on session_open since no rep eval)
      if (!isOpen && data.floating_label) {
        setMoveTallies((t) => {
          const next = { ...t };
          if (data.floating_label === "STRONG") {
            next.strong += 1;
            next.currentStreak += 1;
            if (next.currentStreak > next.longestStreak) {
              next.longestStreak = next.currentStreak;
            }
          } else {
            if (data.floating_label === "COMPETENT") next.competent += 1;
            if (data.floating_label === "WEAK") next.weak += 1;
            if (data.floating_label === "CRITICAL") next.critical += 1;
            next.currentStreak = 0;
          }
          return next;
        });
      }

      // Floating label
      if (data.floating_label) {
        setLabelKeyCounter((k) => k + 1);
        setPendingLabel({
          label: data.floating_label,
          delta: data.resistance_delta,
          keyId: labelKeyCounter + 1,
        });
        setTimeout(() => setPendingLabel(null), LABEL_FLOAT_MS);
      } else {
        setPendingLabel(null);
      }

      // Record prospect turn in history
      setHistory((h) => [
        ...h,
        { role: "prospect", content: data.prospect_line, turn: turnNum },
      ]);
      setPendingOptions(data.multiple_choice_options ?? null);

      // Check outcome before showing coaching whisper
      const outcomeNow = data.session_state?.outcome ?? null;

      const runProspectTypewriter = () => {
        setGameState("battle");
        startTypewriter(data.prospect_line, "prospect_speaking", () => {
          // typewriter done — wait for user advance
        });
      };

      if (!isOpen && data.turn_feedback) {
        setGameState("battle");
        // Stash whatever the timer used to do — handleAdvanceCoaching
        // (wired to the dialog's click handler) pulls it back out when
        // the rep taps to continue.
        coachingAdvanceRef.current = () => {
          if (outcomeNow) {
            finalizeOutcome(outcomeNow, data);
          } else {
            runProspectTypewriter();
          }
        };
        setDialog({ kind: "coaching", text: data.turn_feedback });
      } else if (outcomeNow) {
        finalizeOutcome(outcomeNow, data);
      } else {
        runProspectTypewriter();
      }

      void currentMode;
    },
    [labelKeyCounter, startTypewriter, finalizeOutcome],
  );

  // ── Submit a rep turn ──
  const submitRepTurn = useCallback(
    async (repTurnContent: string) => {
      if (!session || !mode) return;
      setHistory((h) => [
        ...h,
        { role: "rep", content: repTurnContent, turn: currentTurn },
      ]);
      setDialog({ kind: "evaluating" });
      try {
        const res = await fetch("/api/roleplay/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: session.session_id,
            request_type: "turn",
            rep_turn: repTurnContent,
            history: [
              ...history,
              { role: "rep", content: repTurnContent, turn: currentTurn },
            ],
            current_resistance: resistance,
            current_turn: currentTurn,
            wall_dropped: wallDropped,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as TurnResponse;
        applyProspectTurn(data, mode, false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setDialog({ kind: "coaching", text: `ERROR: ${msg}` });
      }
    },
    [
      session,
      mode,
      history,
      currentTurn,
      resistance,
      wallDropped,
      applyProspectTurn,
    ],
  );

  // ── Open session: first turn from Claude (prospect opening line) ──
  const openSession = useCallback(
    async (s: SessionStartResponse, chosenMode: Mode) => {
      try {
        const res = await fetch("/api/roleplay/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: s.session_id,
            request_type: "session_open",
            history: [],
            current_resistance: s.starting_resistance,
            current_turn: 1,
            wall_dropped: false,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as TurnResponse;
        applyProspectTurn(data, chosenMode, true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStartError(msg);
        setGameState("mode_select");
        setStartingMode(null);
      }
    },
    [applyProspectTurn],
  );

  // ── Mode select → start session ──
  const handleStart = useCallback(
    async (chosenMode: Mode) => {
      setStartingMode(chosenMode);
      setStartError(null);
      try {
        const res = await fetch("/api/roleplay/session/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ upload_id: uploadId, mode: chosenMode }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as SessionStartResponse;
        setSession(data);
        setMode(chosenMode);
        setResistance(data.starting_resistance);
        setConfidence(50);
        setCurrentTurn(1);
        setWallDropped(false);
        setHistory([]);
        setMoveTallies({
          strong: 0,
          competent: 0,
          weak: 0,
          critical: 0,
          longestStreak: 0,
          currentStreak: 0,
        });
        setOutcome(null);
        setReport(null);
        setGameState("loading");
        await openSession(data, chosenMode);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStartError(msg);
        setStartingMode(null);
      }
    },
    [uploadId, openSession],
  );

  const advanceProspect = useCallback(() => {
    if (
      dialog.kind === "prospect_speaking" &&
      dialog.done &&
      mode &&
      pendingOptions
    ) {
      if (mode === "multiple_choice") {
        setDialog({ kind: "rep_input_mc", options: pendingOptions });
      } else if (mode === "text") {
        setTextInputValue("");
        setDialog({ kind: "rep_input_text" });
      } else if (mode === "voice") {
        setVoicePhase("idle");
        setVoiceTranscript("");
        setVoiceError(null);
        setDialog({ kind: "rep_input_voice" });
      }
    } else if (dialog.kind === "prospect_speaking" && dialog.done && mode) {
      if (mode === "text") {
        setTextInputValue("");
        setDialog({ kind: "rep_input_text" });
      } else if (mode === "voice") {
        setVoicePhase("idle");
        setDialog({ kind: "rep_input_voice" });
      } else if (mode === "multiple_choice") {
        setDialog({ kind: "evaluating" });
      }
    } else if (
      dialog.kind === "prospect_speaking" &&
      !dialog.done
    ) {
      if (typewriterRef.current.raf != null) {
        clearTimeout(typewriterRef.current.raf);
        typewriterRef.current.raf = null;
      }
      setDialog({
        kind: dialog.kind,
        text: dialog.text,
        charsShown: dialog.text.length,
        done: true,
      });
    }
  }, [dialog, mode, pendingOptions]);

  const onSelectMc = useCallback(
    (opt: McOption) => {
      void submitRepTurn(opt.text);
    },
    [submitRepTurn],
  );

  const onSubmitText = useCallback(() => {
    const t = textInputValue.trim();
    if (t.length === 0) return;
    setTextInputValue("");
    void submitRepTurn(t);
  }, [textInputValue, submitRepTurn]);

  // ── Voice handling ──
  const onVoicePress = useCallback(async () => {
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorderStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recorderChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(recorderChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        recorderStreamRef.current?.getTracks().forEach((t) => t.stop());
        recorderStreamRef.current = null;
        if (blob.size === 0) {
          setVoicePhase("error");
          setVoiceError("NO AUDIO CAPTURED");
          return;
        }
        setVoicePhase("transcribing");
        try {
          const form = new FormData();
          form.append("audio", blob, "recording.webm");
          const res = await fetch("/api/transcribe-voice", {
            method: "POST",
            body: form,
          });
          if (!res.ok) {
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(j.error ?? `HTTP ${res.status}`);
          }
          const j = (await res.json()) as { text: string };
          if (!j.text || j.text.length === 0) {
            setVoicePhase("error");
            setVoiceError("EMPTY TRANSCRIPT");
            return;
          }
          setVoiceTranscript(j.text);
          setVoicePhase("confirming");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setVoicePhase("error");
          setVoiceError(msg.slice(0, 40).toUpperCase());
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setVoicePhase("recording");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setVoicePhase("error");
      setVoiceError(msg.slice(0, 40).toUpperCase());
    }
  }, []);

  const onVoiceRelease = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") {
      r.stop();
    }
    recorderRef.current = null;
  }, []);

  const onVoiceConfirm = useCallback(() => {
    const t = voiceTranscript.trim();
    if (t.length === 0) {
      setVoicePhase("idle");
      return;
    }
    setVoicePhase("idle");
    void submitRepTurn(t);
  }, [voiceTranscript, submitRepTurn]);

  const onVoiceRetry = useCallback(() => {
    setVoiceTranscript("");
    setVoiceError(null);
    setVoicePhase("idle");
  }, []);

  // Phase E click handler — runs whatever applyProspectTurn stashed
  // (next prospect line or outcome finalization) and clears the ref.
  const handleAdvanceCoaching = useCallback(() => {
    const fn = coachingAdvanceRef.current;
    coachingAdvanceRef.current = null;
    fn?.();
  }, []);

  // ── Request final report on victory/defeat continue ──
  const requestReport = useCallback(async () => {
    if (!session || report || reportLoading) return;
    setReportLoading(true);
    try {
      const res = await fetch("/api/roleplay/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session.session_id,
          request_type: "final_report",
          history,
          current_resistance: resistance,
          current_turn: currentTurn,
          wall_dropped: wallDropped,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ReportPayload;
      // Fill in summary fields with locally-tracked values if missing
      const merged: ReportPayload = {
        ...data,
        session_summary: {
          outcome: outcome ?? undefined,
          mode: mode ?? undefined,
          total_turns: currentTurn,
          final_resistance: resistance,
          starting_resistance: session.starting_resistance,
          strong_moves: moveTallies.strong,
          competent_moves: moveTallies.competent,
          weak_moves: moveTallies.weak,
          critical_moves: moveTallies.critical,
          longest_strong_streak: moveTallies.longestStreak,
          xp_earned:
            data.session_summary?.xp_earned ??
            computeXpFallback(outcome, mode, moveTallies),
          ...(data.session_summary ?? {}),
        },
      };
      setReport(merged);
      setGameState("report");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Render a minimal report from local state on failure
      const fallback: ReportPayload = {
        session_summary: {
          outcome: outcome ?? undefined,
          mode: mode ?? undefined,
          total_turns: currentTurn,
          final_resistance: resistance,
          starting_resistance: session.starting_resistance,
          strong_moves: moveTallies.strong,
          competent_moves: moveTallies.competent,
          weak_moves: moveTallies.weak,
          critical_moves: moveTallies.critical,
          longest_strong_streak: moveTallies.longestStreak,
          xp_earned: computeXpFallback(outcome, mode, moveTallies),
        },
        stage_objective: {
          stage: seed.stage_to_drill_enum,
          objective: seed.success_definition,
          status: outcome === "win" ? "met" : "not_met",
          status_reasoning: `Report fetch failed: ${msg}`,
        },
      };
      setReport(fallback);
      setGameState("report");
    } finally {
      setReportLoading(false);
    }
  }, [
    session,
    history,
    resistance,
    currentTurn,
    wallDropped,
    report,
    reportLoading,
    outcome,
    mode,
    moveTallies,
    seed,
  ]);

  const handlePlayAgain = useCallback(() => {
    setGameState("mode_select");
    setSession(null);
    setMode(null);
    setStartingMode(null);
    setReport(null);
    setOutcome(null);
    setExitLine("");
    setHistory([]);
    setPendingLabel(null);
    setPendingOptions(null);
    setResistance(50);
    setConfidence(50);
    setCurrentTurn(1);
    setWallDropped(false);
    setAnimation("idle");
    setMoveTallies({
      strong: 0,
      competent: 0,
      weak: 0,
      critical: 0,
      longestStreak: 0,
      currentStreak: 0,
    });
  }, []);

  // Cleanup typewriter timer
  useEffect(
    () => () => {
      if (typewriterRef.current.raf != null) {
        clearTimeout(typewriterRef.current.raf);
      }
    },
    [],
  );

  // Computed values for render
  const xpEarnedDisplay = useMemo(() => {
    if (!outcome) return null;
    return computeXpFallback(outcome, mode, moveTallies);
  }, [outcome, mode, moveTallies]);

  return (
    <>
      <PixelGlobalStyles />
      {gameState === "mode_select" ? (
        <ModeSelectView
          prospectName={prospectName}
          consultationDate={consultationDate}
          orgName={orgName}
          seed={seed}
          onStart={handleStart}
          starting={startingMode}
          error={startError}
        />
      ) : null}

      {gameState === "loading" ? (
        <PixelCanvas>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <PixelText size={8}>
              CONNECTING<span className="fc-dots" />
            </PixelText>
          </div>
        </PixelCanvas>
      ) : null}

      {gameState === "battle" && archetype ? (
        <BattleView
          archetype={archetype}
          prospectName={prospectName}
          repName={repName}
          resistance={resistance}
          resistanceFlash={resistanceFlash}
          confidence={confidence}
          animation={animation}
          wallDropped={wallDropped}
          dialog={dialog}
          pendingLabel={pendingLabel}
          textInputValue={textInputValue}
          voicePhase={voicePhase}
          voiceTranscript={voiceTranscript}
          voiceError={voiceError}
          onAdvanceProspect={advanceProspect}
          onAdvanceCoaching={handleAdvanceCoaching}
          onSelectMc={onSelectMc}
          onChangeText={setTextInputValue}
          onSubmitText={onSubmitText}
          onVoicePress={onVoicePress}
          onVoiceRelease={onVoiceRelease}
          onVoiceConfirm={onVoiceConfirm}
          onVoiceRetry={onVoiceRetry}
        />
      ) : null}

      {gameState === "victory" && archetype ? (
        <VictoryView
          archetype={archetype}
          xpEarned={xpEarnedDisplay}
          loadingReport={reportLoading}
          onContinue={requestReport}
        />
      ) : null}

      {gameState === "defeat" && archetype ? (
        <DefeatView
          archetype={archetype}
          exitLine={exitLine || exitLineFor(archetype, outcome)}
          xpEarned={xpEarnedDisplay}
          loadingReport={reportLoading}
          onContinue={requestReport}
        />
      ) : null}

      {gameState === "report" && report ? (
        <ReportView
          report={report}
          uploadId={uploadId}
          onPlayAgain={handlePlayAgain}
        />
      ) : null}
    </>
  );
}

// XP fallback (only used when Claude doesn't return one in the report).
// Mirrors animations.md: base + technique + streak, with mode multiplier.
function computeXpFallback(
  outcome: "win" | "loss_walkout" | "loss_timeout" | "draw" | null,
  mode: Mode | null,
  tallies: {
    strong: number;
    competent: number;
    weak: number;
    critical: number;
    longestStreak: number;
  },
): number {
  let base = 60;
  if (outcome === "win") base = 150;
  else if (
    outcome === "loss_walkout" ||
    outcome === "loss_timeout"
  ) base = 90;
  const tech =
    tallies.strong * 10 + tallies.competent * 5 - tallies.critical * 5;
  let streak = 0;
  if (tallies.longestStreak >= 7) streak = 50;
  else if (tallies.longestStreak >= 5) streak = 30;
  else if (tallies.longestStreak >= 3) streak = 15;
  const subtotal = Math.max(0, base + tech + streak);
  const mult = mode === "voice" ? 1.5 : mode === "text" ? 1.2 : 1.0;
  return Math.round(subtotal * mult);
}

// ───────────────────────────────────────────────────────────────────
// Inline keyframe/animation styles
// ───────────────────────────────────────────────────────────────────

function PixelGlobalStyles() {
  return (
    <style jsx global>{`
      @keyframes fc-blink {
        0%,
        49% {
          opacity: 1;
        }
        50%,
        100% {
          opacity: 0;
        }
      }
      .fc-blink {
        animation: fc-blink 1s steps(2, end) infinite;
      }
      @keyframes fc-dots {
        0% {
          content: "";
        }
        33% {
          content: ".";
        }
        66% {
          content: "..";
        }
        100% {
          content: "...";
        }
      }
      .fc-dots::after {
        content: "...";
        animation: fc-dots 900ms steps(4, end) infinite;
      }
      @keyframes fc-sprite-idle-kf {
        0%,
        100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-2px);
        }
      }
      .fc-sprite-idle {
        animation: fc-sprite-idle-kf 1600ms ease-in-out infinite;
      }
      @keyframes fc-sprite-flinch-kf {
        0% {
          transform: translateX(0);
        }
        25% {
          transform: translateX(-3px);
        }
        50% {
          transform: translateX(-3px);
        }
        75% {
          transform: translateX(0);
        }
        100% {
          transform: translateX(0);
        }
      }
      .fc-sprite-flinch {
        animation: fc-sprite-flinch-kf 400ms steps(4, end);
      }
      @keyframes fc-sprite-hardening-kf {
        0% {
          transform: scale(1);
        }
        40% {
          transform: scale(1.04);
        }
        100% {
          transform: scale(1);
        }
      }
      .fc-sprite-hardening {
        animation: fc-sprite-hardening-kf 450ms ease-out;
      }
      @keyframes fc-sprite-leaving-kf {
        0% {
          transform: translateX(0);
          opacity: 1;
        }
        100% {
          transform: translateX(80px);
          opacity: 0.4;
        }
      }
      .fc-sprite-leaving {
        animation: fc-sprite-leaving-kf 1000ms ease-in forwards;
      }
      @keyframes fc-sprite-converted-kf {
        0%,
        100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-3px);
        }
      }
      .fc-sprite-converted {
        animation: fc-sprite-converted-kf 800ms ease-in-out infinite;
      }
      @keyframes fc-float-kf {
        0% {
          transform: translateY(0);
          opacity: 1;
        }
        100% {
          transform: translateY(-24px);
          opacity: 0;
        }
      }
      .fc-float {
        animation: fc-float-kf 800ms ease-out forwards;
      }
      @keyframes fc-float-shake-kf {
        0%,
        100% {
          margin-left: 0;
        }
        20% {
          margin-left: -4px;
        }
        40% {
          margin-left: 4px;
        }
        60% {
          margin-left: -4px;
        }
        80% {
          margin-left: 4px;
        }
      }
      .fc-float-shake {
        animation:
          fc-float-shake-kf 300ms steps(5, end),
          fc-float-kf 800ms ease-out 300ms forwards;
      }
      .fc-mc-row:hover {
        background: #1a4a1a !important;
      }
    `}</style>
  );
}
