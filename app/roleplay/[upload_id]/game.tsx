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

const TYPEWRITER_MS = 40;
const LABEL_FLOAT_MS = 800;
const RES_BAR_TRANSITION_MS = 400;
const TEXT_MAX_LEN = 280;

// Max seconds we'll record before auto-stopping the MediaRecorder.
// Whisper-1 charges per second; the analyzer-side route also enforces
// a 25 MB cap so a runaway recording can't escape this limit anyway.
const VOICE_MAX_RECORD_MS = 60_000;

// localStorage key for the mute toggle, so the rep's preference
// survives page refreshes.
const MUTE_STORAGE_KEY = "roleplay_muted";

// ElevenLabs voice IDs per archetype. Placeholders for now — replace
// with real voice IDs from the ElevenLabs voice library. Keys are
// snake_case derived from the archetype name.
const ARCHETYPE_VOICE_IDS: Record<string, string> = {
  busy_professional: "bfGb7JTLUnZebZRiFYyq",
  skeptic: "T5cu6IU92Krx4mh43osx",
  enthusiast: "hod33eJyEU4TLqiYFttr",
  decision_maker_blocker: "jhjua7BeakSijhQFhAX5",
  price_shopper: "uA0L9FxeLpzlG615Ueay",
  ghost: "mqyRCI8OeJTogXjYUGZ5",
};

function archetypeVoiceKey(archetype: string): string {
  return archetype
    .toLowerCase()
    .replace(/^the\s+/, "")
    .trim()
    .replace(/\s+/g, "_");
}

// ───────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────

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
// Prospect sprite — illustrated SVG portraits per archetype.
// viewBox: 0 0 340 420. Animation classes (fc-sprite-idle / flinch /
// hardening / leaving / converted) live on the root <svg> so the
// existing CSS keyframes still drive movement.
// ───────────────────────────────────────────────────────────────────

function archetypeSpriteKey(archetype: string): string {
  return archetype
    .toLowerCase()
    .replace(/^the\s+/, "")
    .trim()
    .replace(/\s+/g, "_");
}

function BusyProfessionalBody() {
  return (
    <g>
      <circle cx={170} cy={260} r={180} fill="#1e2937" opacity={0.5} />
      <rect x={119} y={229} width={102} height={89} rx={6} fill="#1f2937" />
      <polygon points="119,229 145,229 163,190 119,181" fill="#111827" />
      <polygon points="221,229 197,229 179,190 221,181" fill="#111827" />
      <rect x={156} y={229} width={28} height={50} rx={2} fill="#f8fafc" />
      <polygon
        points="163,230 177,230 173,278 170,284 167,278"
        fill="#dc2626"
      />
      <rect x={100} y={254} width={9} height={6} rx={2} fill="#f59e0b" />
      <rect x={102} y={256} width={5} height={3} rx={1} fill="#1f2937" />
      <rect x={100} y={249} width={28} height={14} rx={7} fill="#1f2937" />
      <ellipse cx={107} cy={256} rx={8} ry={7} fill="#d4a882" />
      <rect x={212} y={230} width={16} height={45} rx={8} fill="#1f2937" />
      <ellipse cx={220} cy={276} rx={7} ry={6} fill="#d4a882" />
      <rect x={215} y={268} width={11} height={16} rx={2} fill="#111827" />
      <rect
        x={216}
        y={270}
        width={9}
        height={12}
        rx={1}
        fill="#3b82f6"
        opacity={0.7}
      />
      <rect x={158} y={204} width={24} height={30} rx={4} fill="#d4a882" />
      <ellipse cx={170} cy={161} rx={38} ry={36} fill="#d4a882" />
      <ellipse cx={170} cy={132} rx={38} ry={15} fill="#2d1b0e" />
      <rect x={132} y={132} width={76} height={14} fill="#2d1b0e" />
      <rect x={132} y={140} width={8} height={16} rx={3} fill="#2d1b0e" />
      <rect x={200} y={140} width={8} height={16} rx={3} fill="#2d1b0e" />
      <line
        x1={147}
        y1={132}
        x2={147}
        y2={152}
        stroke="#1a0f08"
        strokeWidth={1.5}
      />
      <ellipse cx={132} cy={163} rx={6} ry={8} fill="#d4a882" />
      <ellipse cx={208} cy={163} rx={6} ry={8} fill="#d4a882" />
      <ellipse cx={155} cy={158} rx={6} ry={4} fill="#1a1008" />
      <ellipse cx={185} cy={158} rx={6} ry={4} fill="#1a1008" />
      <ellipse cx={156} cy={157} rx={2.5} ry={2} fill="#78350f" />
      <ellipse cx={186} cy={157} rx={2.5} ry={2} fill="#78350f" />
      <circle cx={158} cy={156} r={1} fill="#ffffff" opacity={0.8} />
      <circle cx={188} cy={156} r={1} fill="#ffffff" opacity={0.8} />
      <path
        d="M147 149 Q155 145 163 148"
        fill="none"
        stroke="#2d1b0e"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path
        d="M177 148 Q185 145 193 148"
        fill="none"
        stroke="#2d1b0e"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path
        d="M166 165 Q164 174 160 176 Q170 179 180 176 Q176 174 174 165"
        fill="none"
        stroke="#b8785a"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d="M160 188 Q165 185 170 186 Q175 185 180 188"
        fill="none"
        stroke="#b8785a"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <rect x={131} y={311} width={31} height={26} rx={6} fill="#1f2937" />
      <rect x={178} y={311} width={31} height={26} rx={6} fill="#1f2937" />
      <rect x={125} y={329} width={40} height={9} rx={5} fill="#111827" />
      <rect x={172} y={329} width={40} height={9} rx={5} fill="#111827" />
    </g>
  );
}

function SkepticBody() {
  return (
    <g>
      <circle cx={170} cy={260} r={180} fill="#1e3a8a" opacity={0.3} />
      <rect x={120} y={230} width={100} height={88} rx={6} fill="#1e293b" />
      <polygon points="120,230 146,230 163,192 120,182" fill="#0f172a" />
      <polygon points="220,230 194,230 177,192 220,182" fill="#0f172a" />
      <rect x={154} y={230} width={32} height={48} rx={2} fill="#f1f5f9" />
      <polygon
        points="163,231 177,231 173,276 170,284 167,276"
        fill="#7f1d1d"
      />
      <rect x={166} y={248} width={7} height={5} rx={1} fill="#991b1b" />
      <rect x={100} y={250} width={28} height={14} rx={7} fill="#1e293b" />
      <rect x={115} y={242} width={78} height={16} rx={7} fill="#1e293b" />
      <ellipse cx={193} cy={250} rx={9} ry={7} fill="#c9956a" />
      <ellipse cx={118} cy={257} rx={7} ry={6} fill="#c9956a" />
      <rect x={159} y={206} width={22} height={28} rx={4} fill="#c9956a" />
      <rect x={136} y={130} width={68} height={82} rx={10} fill="#c9956a" />
      <rect x={136} y={130} width={68} height={16} rx={9} fill="#1e1008" />
      <rect x={136} y={138} width={11} height={14} fill="#1e1008" />
      <rect x={193} y={138} width={11} height={14} fill="#1e1008" />
      <ellipse cx={136} cy={172} rx={6} ry={8} fill="#c9956a" />
      <ellipse cx={204} cy={172} rx={6} ry={8} fill="#c9956a" />
      <rect
        x={140}
        y={158}
        width={24}
        height={16}
        rx={4}
        fill="none"
        stroke="#1e1008"
        strokeWidth={3}
      />
      <rect
        x={176}
        y={158}
        width={24}
        height={16}
        rx={4}
        fill="none"
        stroke="#1e1008"
        strokeWidth={3}
      />
      <line
        x1={164}
        y1={166}
        x2={176}
        y2={166}
        stroke="#1e1008"
        strokeWidth={2.5}
      />
      <line
        x1={140}
        y1={166}
        x2={136}
        y2={165}
        stroke="#1e1008"
        strokeWidth={2}
      />
      <line
        x1={200}
        y1={166}
        x2={204}
        y2={165}
        stroke="#1e1008"
        strokeWidth={2}
      />
      <rect
        x={140}
        y={158}
        width={24}
        height={16}
        rx={4}
        fill="#334155"
        opacity={0.35}
      />
      <rect
        x={176}
        y={158}
        width={24}
        height={16}
        rx={4}
        fill="#334155"
        opacity={0.35}
      />
      <ellipse cx={152} cy={166} rx={5} ry={4} fill="#1e1008" />
      <ellipse cx={188} cy={166} rx={5} ry={4} fill="#1e1008" />
      <ellipse cx={153} cy={165} rx={2} ry={2} fill="#475569" />
      <ellipse cx={189} cy={165} rx={2} ry={2} fill="#475569" />
      <circle cx={155} cy={164} r={1} fill="#ffffff" opacity={0.7} />
      <circle cx={191} cy={164} r={1} fill="#ffffff" opacity={0.7} />
      <path
        d="M141 153 Q152 147 163 151"
        fill="none"
        stroke="#1e1008"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path
        d="M177 156 Q188 154 199 156"
        fill="none"
        stroke="#1e1008"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path
        d="M166 174 Q164 183 160 185 Q170 188 180 185 Q176 183 174 174"
        fill="none"
        stroke="#a0724f"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d="M158 200 Q164 197 170 198 Q176 197 182 200"
        fill="none"
        stroke="#a0724f"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <rect x={130} y={312} width={30} height={26} rx={5} fill="#1e293b" />
      <rect x={178} y={312} width={30} height={26} rx={5} fill="#1e293b" />
      <rect x={124} y={330} width={40} height={9} rx={5} fill="#0f172a" />
      <rect x={172} y={330} width={40} height={9} rx={5} fill="#0f172a" />
    </g>
  );
}

function EnthusiastBody() {
  return (
    <g>
      <circle cx={170} cy={260} r={180} fill="#0d9488" opacity={0.25} />
      <rect x={121} y={225} width={98} height={90} rx={6} fill="#0d9488" />
      <rect
        x={121}
        y={235}
        width={10}
        height={75}
        rx={3}
        fill="#0f766e"
        opacity={0.6}
      />
      <rect
        x={209}
        y={235}
        width={10}
        height={75}
        rx={3}
        fill="#0f766e"
        opacity={0.6}
      />
      <path d="M155,225 Q170,238 185,225" fill="#0f766e" />
      <circle cx={152} cy={258} r={7} fill="#14b8a6" opacity={0.4} />
      <circle cx={152} cy={258} r={4} fill="#2dd4bf" opacity={0.5} />
      <rect x={100} y={228} width={28} height={15} rx={7} fill="#0d9488" />
      <ellipse cx={104} cy={235} rx={9} ry={7} fill="#e8c49a" />
      <rect x={212} y={228} width={28} height={15} rx={7} fill="#0d9488" />
      <ellipse cx={236} cy={235} rx={9} ry={7} fill="#e8c49a" />
      <rect x={158} y={197} width={24} height={33} rx={4} fill="#e8c49a" />
      <ellipse cx={170} cy={158} rx={38} ry={36} fill="#e8c49a" />
      <ellipse cx={170} cy={129} rx={38} ry={17} fill="#92400e" />
      <rect x={132} y={129} width={76} height={15} fill="#92400e" />
      <rect x={132} y={138} width={7} height={15} rx={3} fill="#92400e" />
      <rect x={201} y={138} width={7} height={15} rx={3} fill="#92400e" />
      <ellipse cx={210} cy={133} rx={11} ry={5} fill="#92400e" />
      <ellipse cx={222} cy={137} rx={7} ry={4} fill="#78350f" />
      <ellipse
        cx={155}
        cy={133}
        rx={15}
        ry={5}
        fill="#b45309"
        opacity={0.5}
      />
      <ellipse cx={132} cy={160} rx={6} ry={8} fill="#e8c49a" />
      <ellipse cx={208} cy={160} rx={6} ry={8} fill="#e8c49a" />
      <circle cx={155} cy={156} r={7} fill="#1a1008" />
      <circle cx={185} cy={156} r={7} fill="#1a1008" />
      <circle cx={156} cy={154} r={3} fill="#d97706" />
      <circle cx={186} cy={154} r={3} fill="#d97706" />
      <circle cx={158} cy={152} r={1.5} fill="#ffffff" opacity={0.9} />
      <circle cx={188} cy={152} r={1.5} fill="#ffffff" opacity={0.9} />
      <path
        d="M148 151 Q155 147 162 151"
        fill="none"
        stroke="#1a1008"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d="M178 151 Q185 147 192 151"
        fill="none"
        stroke="#1a1008"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d="M146 143 Q155 137 164 140"
        fill="none"
        stroke="#92400e"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path
        d="M176 140 Q185 137 194 143"
        fill="none"
        stroke="#92400e"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path
        d="M166 164 Q164 173 160 175 Q170 178 180 175 Q176 173 174 164"
        fill="none"
        stroke="#c4845a"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d="M155 184 Q163 194 170 196 Q177 194 185 184"
        fill="none"
        stroke="#c4845a"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path
        d="M157 187 Q170 195 183 187 Q177 192 170 193 Q163 192 157 187"
        fill="#f8fafc"
        opacity={0.9}
      />
      <ellipse cx={143} cy={170} rx={8} ry={5} fill="#f87171" opacity={0.25} />
      <ellipse cx={197} cy={170} rx={8} ry={5} fill="#f87171" opacity={0.25} />
      <rect x={131} y={308} width={31} height={27} rx={6} fill="#0f766e" />
      <rect x={178} y={308} width={31} height={27} rx={6} fill="#0f766e" />
      <rect x={124} y={326} width={41} height={9} rx={5} fill="#f8fafc" />
      <rect x={171} y={326} width={41} height={9} rx={5} fill="#f8fafc" />
      <rect
        x={126}
        y={327}
        width={19}
        height={4}
        rx={2}
        fill="#0d9488"
        opacity={0.5}
      />
      <rect
        x={173}
        y={327}
        width={19}
        height={4}
        rx={2}
        fill="#0d9488"
        opacity={0.5}
      />
    </g>
  );
}

function DecisionMakerBlockerBody() {
  return (
    <g>
      <circle cx={170} cy={260} r={180} fill="#7c3aed" opacity={0.25} />
      <rect x={120} y={230} width={28} height={88} rx={6} fill="#6d28d9" />
      <rect x={192} y={230} width={28} height={88} rx={6} fill="#6d28d9" />
      <rect x={148} y={230} width={44} height={88} rx={3} fill="#7c3aed" />
      <rect x={154} y={230} width={32} height={50} rx={2} fill="#fde68a" />
      <path d="M152,230 Q170,248 188,230" fill="#5b21b6" />
      <ellipse cx={170} cy={168} rx={44} ry={22} fill="#1e293b" opacity={0.4} />
      <rect x={100} y={246} width={28} height={15} rx={7} fill="#6d28d9" />
      <ellipse cx={105} cy={253} rx={8} ry={7} fill="#c4956a" />
      <circle
        cx={101}
        cy={258}
        r={3}
        fill="none"
        stroke="#f59e0b"
        strokeWidth={2}
      />
      <circle cx={101} cy={258} r={1} fill="#fbbf24" />
      <rect x={212} y={232} width={17} height={44} rx={8} fill="#6d28d9" />
      <ellipse cx={220} cy={277} rx={7} ry={6} fill="#c4956a" />
      <rect x={215} y={266} width={11} height={18} rx={3} fill="#111827" />
      <rect
        x={216}
        y={268}
        width={9}
        height={14}
        rx={2}
        fill="#8b5cf6"
        opacity={0.8}
      />
      <rect x={158} y={204} width={24} height={30} rx={4} fill="#c4956a" />
      <ellipse cx={170} cy={162} rx={38} ry={36} fill="#c4956a" />
      <ellipse cx={170} cy={132} rx={38} ry={17} fill="#6b3a1f" />
      <rect x={132} y={132} width={76} height={15} fill="#6b3a1f" />
      <rect x={132} y={144} width={11} height={38} rx={5} fill="#6b3a1f" />
      <rect x={197} y={144} width={11} height={38} rx={5} fill="#6b3a1f" />
      <ellipse
        cx={156}
        cy={137}
        rx={14}
        ry={5}
        fill="#92400e"
        opacity={0.5}
      />
      <line
        x1={170}
        y1={132}
        x2={170}
        y2={150}
        stroke="#4a2510"
        strokeWidth={1.5}
      />
      <circle cx={135} cy={168} r={3} fill="#f59e0b" />
      <circle cx={135} cy={177} r={2} fill="#fbbf24" />
      <circle cx={205} cy={168} r={3} fill="#f59e0b" />
      <circle cx={205} cy={177} r={2} fill="#fbbf24" />
      <ellipse cx={155} cy={162} rx={6} ry={4} fill="#1a1008" />
      <ellipse cx={185} cy={162} rx={6} ry={4} fill="#1a1008" />
      <ellipse cx={156} cy={161} rx={2.5} ry={2} fill="#92400e" />
      <ellipse cx={186} cy={161} rx={2.5} ry={2} fill="#92400e" />
      <circle cx={158} cy={160} r={1} fill="#ffffff" opacity={0.8} />
      <circle cx={188} cy={160} r={1} fill="#ffffff" opacity={0.8} />
      <path
        d="M149 158 Q155 154 161 158"
        fill="none"
        stroke="#1a1008"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d="M179 158 Q185 154 191 158"
        fill="none"
        stroke="#1a1008"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d="M147 152 Q155 147 163 150"
        fill="none"
        stroke="#6b3a1f"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path
        d="M177 150 Q185 147 193 152"
        fill="none"
        stroke="#6b3a1f"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path
        d="M166 169 Q164 178 160 180 Q170 184 180 180 Q176 178 174 169"
        fill="none"
        stroke="#a06040"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d="M159 192 Q165 196 170 194 Q175 196 181 192"
        fill="none"
        stroke="#a06040"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <rect x={131} y={311} width={30} height={27} rx={6} fill="#6d28d9" />
      <rect x={179} y={311} width={30} height={27} rx={6} fill="#6d28d9" />
      <rect x={125} y={330} width={40} height={9} rx={5} fill="#4c1d95" />
      <rect x={173} y={330} width={40} height={9} rx={5} fill="#4c1d95" />
    </g>
  );
}

function PriceShopperBody() {
  return (
    <g>
      <circle cx={170} cy={260} r={180} fill="#d97706" opacity={0.2} />
      <rect x={119} y={228} width={102} height={90} rx={6} fill="#d97706" />
      <rect x={147} y={272} width={46} height={25} rx={4} fill="#b45309" />
      <rect
        x={119}
        y={240}
        width={10}
        height={72}
        rx={3}
        fill="#b45309"
        opacity={0.6}
      />
      <rect
        x={211}
        y={240}
        width={10}
        height={72}
        rx={3}
        fill="#b45309"
        opacity={0.6}
      />
      <line
        x1={162}
        y1={234}
        x2={159}
        y2={273}
        stroke="#92400e"
        strokeWidth={1.5}
      />
      <line
        x1={178}
        y1={234}
        x2={181}
        y2={273}
        stroke="#92400e"
        strokeWidth={1.5}
      />
      <rect x={214} y={228} width={18} height={50} rx={9} fill="#d97706" />
      <ellipse cx={223} cy={279} rx={8} ry={7} fill="#e8c49a" />
      <rect x={216} y={236} width={14} height={24} rx={3} fill="#111827" />
      <rect
        x={217}
        y={238}
        width={12}
        height={20}
        rx={2}
        fill="#1e3a8a"
        opacity={0.8}
      />
      <rect
        x={218}
        y={241}
        width={9}
        height={2}
        rx={1}
        fill="#34d399"
        opacity={0.9}
      />
      <rect
        x={218}
        y={246}
        width={7}
        height={2}
        rx={1}
        fill="#f87171"
        opacity={0.9}
      />
      <rect
        x={218}
        y={251}
        width={8}
        height={2}
        rx={1}
        fill="#fbbf24"
        opacity={0.9}
      />
      <rect
        x={218}
        y={256}
        width={6}
        height={2}
        rx={1}
        fill="#34d399"
        opacity={0.9}
      />
      <rect x={108} y={244} width={20} height={35} rx={8} fill="#d97706" />
      <rect x={158} y={200} width={24} height={32} rx={4} fill="#e8c49a" />
      <ellipse cx={170} cy={160} rx={38} ry={36} fill="#e8c49a" />
      <ellipse cx={170} cy={130} rx={38} ry={17} fill="#1e1008" />
      <rect x={132} y={130} width={76} height={15} fill="#1e1008" />
      <rect x={132} y={140} width={8} height={17} rx={3} fill="#1e1008" />
      <rect x={200} y={140} width={8} height={17} rx={3} fill="#1e1008" />
      <ellipse
        cx={149}
        cy={132}
        rx={7}
        ry={4}
        fill="#1e1008"
        transform="rotate(-15,149,132)"
      />
      <ellipse
        cx={190}
        cy={132}
        rx={6}
        ry={4}
        fill="#1e1008"
        transform="rotate(10,190,132)"
      />
      <ellipse cx={170} cy={128} rx={5} ry={6} fill="#1e1008" />
      <ellipse cx={132} cy={162} rx={6} ry={8} fill="#e8c49a" />
      <ellipse cx={208} cy={162} rx={6} ry={8} fill="#e8c49a" />
      <ellipse cx={155} cy={158} rx={6} ry={4} fill="#1a1008" />
      <ellipse cx={185} cy={158} rx={6} ry={4} fill="#1a1008" />
      <ellipse cx={156} cy={157} rx={2.5} ry={2} fill="#78350f" />
      <ellipse cx={186} cy={157} rx={2.5} ry={2} fill="#78350f" />
      <circle cx={158} cy={156} r={1} fill="#ffffff" opacity={0.8} />
      <circle cx={188} cy={156} r={1} fill="#ffffff" opacity={0.8} />
      <path
        d="M147 149 Q155 145 163 148"
        fill="none"
        stroke="#1e1008"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path
        d="M177 146 Q185 141 193 145"
        fill="none"
        stroke="#1e1008"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path
        d="M166 166 Q164 174 160 176 Q170 179 180 176 Q176 174 174 166"
        fill="none"
        stroke="#c4845a"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d="M158 186 Q164 183 170 184 Q178 186 182 190"
        fill="none"
        stroke="#c4845a"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <rect x={131} y={311} width={31} height={26} rx={6} fill="#92400e" />
      <rect x={178} y={311} width={31} height={26} rx={6} fill="#92400e" />
      <rect x={124} y={328} width={41} height={9} rx={5} fill="#e5e7eb" />
      <rect x={171} y={328} width={41} height={9} rx={5} fill="#e5e7eb" />
      <rect
        x={126}
        y={329}
        width={19}
        height={4}
        rx={2}
        fill="#d97706"
        opacity={0.6}
      />
      <rect
        x={173}
        y={329}
        width={19}
        height={4}
        rx={2}
        fill="#d97706"
        opacity={0.6}
      />
    </g>
  );
}

function GhostBody() {
  // Ghost gets className hooks (ghost-skin / ghost-dark / ghost-mid)
  // so the .ghost-breakthrough CSS class on the root <svg> can repaint
  // it in the open-wall blue palette when the Ghost's emotional wall
  // finally comes down.
  return (
    <g>
      <circle cx={170} cy={260} r={180} fill="#0f172a" opacity={0.9} />
      <rect
        x={20}
        y={60}
        width={4}
        height={300}
        rx={2}
        fill="#1e293b"
        opacity={0.6}
      />
      <rect
        x={316}
        y={60}
        width={4}
        height={300}
        rx={2}
        fill="#1e293b"
        opacity={0.6}
      />
      <ellipse
        cx={170}
        cy={172}
        rx={45}
        ry={43}
        fill="none"
        stroke="#3b82f6"
        strokeWidth={1.5}
        opacity={0.15}
      />
      <rect
        className="ghost-dark"
        x={122}
        y={238}
        width={96}
        height={82}
        rx={6}
        fill="#1e293b"
      />
      <line
        x1={140}
        y1={252}
        x2={140}
        y2={314}
        stroke="#334155"
        strokeWidth={1}
        opacity={0.5}
      />
      <line
        x1={150}
        y1={252}
        x2={150}
        y2={314}
        stroke="#334155"
        strokeWidth={1}
        opacity={0.5}
      />
      <line
        x1={190}
        y1={252}
        x2={190}
        y2={314}
        stroke="#334155"
        strokeWidth={1}
        opacity={0.5}
      />
      <line
        x1={200}
        y1={252}
        x2={200}
        y2={314}
        stroke="#334155"
        strokeWidth={1}
        opacity={0.5}
      />
      <ellipse
        className="ghost-dark"
        cx={170}
        cy={178}
        rx={44}
        ry={24}
        fill="#1e293b"
        opacity={0.7}
      />
      <rect
        className="ghost-dark"
        x={105}
        y={254}
        width={24}
        height={14}
        rx={7}
        fill="#1e293b"
      />
      <ellipse
        className="ghost-skin"
        cx={111}
        cy={261}
        rx={7}
        ry={6}
        fill="#b0bec5"
        opacity={0.8}
      />
      <rect
        className="ghost-dark"
        x={211}
        y={254}
        width={24}
        height={14}
        rx={7}
        fill="#1e293b"
      />
      <ellipse
        className="ghost-skin"
        cx={229}
        cy={261}
        rx={7}
        ry={6}
        fill="#b0bec5"
        opacity={0.8}
      />
      <rect
        className="ghost-skin"
        x={159}
        y={210}
        width={22}
        height={32}
        rx={4}
        fill="#b0bec5"
        opacity={0.7}
      />
      <ellipse
        className="ghost-skin"
        cx={170}
        cy={172}
        rx={37}
        ry={36}
        fill="#b0bec5"
        opacity={0.85}
      />
      <ellipse
        className="ghost-dark"
        cx={170}
        cy={142}
        rx={37}
        ry={17}
        fill="#374151"
      />
      <rect
        className="ghost-dark"
        x={133}
        y={142}
        width={74}
        height={14}
        fill="#374151"
      />
      <rect
        className="ghost-dark"
        x={133}
        y={150}
        width={9}
        height={24}
        rx={3}
        fill="#374151"
      />
      <rect
        className="ghost-dark"
        x={198}
        y={150}
        width={9}
        height={24}
        rx={3}
        fill="#374151"
      />
      <rect
        className="ghost-dark"
        x={149}
        y={142}
        width={4}
        height={24}
        rx={2}
        fill="#374151"
        opacity={0.8}
      />
      <rect
        className="ghost-dark"
        x={157}
        y={142}
        width={3}
        height={19}
        rx={2}
        fill="#374151"
        opacity={0.6}
      />
      <rect
        className="ghost-dark"
        x={181}
        y={142}
        width={4}
        height={21}
        rx={2}
        fill="#374151"
        opacity={0.7}
      />
      <ellipse
        className="ghost-skin"
        cx={133}
        cy={173}
        rx={5}
        ry={8}
        fill="#b0bec5"
        opacity={0.7}
      />
      <ellipse
        className="ghost-skin"
        cx={207}
        cy={173}
        rx={5}
        ry={8}
        fill="#b0bec5"
        opacity={0.7}
      />
      <ellipse
        className="ghost-mid"
        cx={154}
        cy={177}
        rx={5}
        ry={3}
        fill="#374151"
      />
      <ellipse
        className="ghost-mid"
        cx={186}
        cy={177}
        rx={5}
        ry={3}
        fill="#374151"
      />
      <ellipse
        className="ghost-mid"
        cx={155}
        cy={178}
        rx={2}
        ry={1.5}
        fill="#4b5563"
      />
      <ellipse
        className="ghost-mid"
        cx={187}
        cy={178}
        rx={2}
        ry={1.5}
        fill="#4b5563"
      />
      <path
        className="ghost-skin"
        d="M149 175 Q154 172 159 175"
        fill="#b0bec5"
        opacity={0.85}
      />
      <path
        className="ghost-skin"
        d="M181 175 Q186 172 191 175"
        fill="#b0bec5"
        opacity={0.85}
      />
      <path
        d="M148 169 Q154 167 160 169"
        fill="none"
        stroke="#374151"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path
        d="M180 169 Q186 167 192 169"
        fill="none"
        stroke="#374151"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path
        d="M166 182 Q164 190 160 192 Q170 195 180 192 Q176 190 174 182"
        fill="none"
        stroke="#8da0b0"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d="M160 202 Q165 200 170 201 Q175 200 180 202"
        fill="none"
        stroke="#8da0b0"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <rect
        className="ghost-dark"
        x={133}
        y={314}
        width={29}
        height={26}
        rx={6}
        fill="#1e293b"
        transform="rotate(3,148,327)"
      />
      <rect
        className="ghost-dark"
        x={178}
        y={314}
        width={29}
        height={26}
        rx={6}
        fill="#1e293b"
        transform="rotate(-2,192,327)"
      />
      <rect x={127} y={331} width={38} height={8} rx={5} fill="#111827" />
      <rect x={171} y={331} width={38} height={8} rx={5} fill="#111827" />
    </g>
  );
}

function ProspectSprite({
  archetype,
  animation,
  wallDropped,
}: {
  archetype: string;
  animation: AnimationState;
  wallDropped?: boolean;
}) {
  const key = archetypeSpriteKey(archetype);

  let body: React.ReactElement;
  switch (key) {
    case "busy_professional":
      body = <BusyProfessionalBody />;
      break;
    case "skeptic":
      body = <SkepticBody />;
      break;
    case "enthusiast":
      body = <EnthusiastBody />;
      break;
    case "decision_maker_blocker":
      body = <DecisionMakerBlockerBody />;
      break;
    case "price_shopper":
      body = <PriceShopperBody />;
      break;
    case "ghost":
      body = <GhostBody />;
      break;
    default:
      body = <SkepticBody />;
  }

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

  const ghostBreakthrough =
    key === "ghost" &&
    (animation === "flinch_breakthrough" || wallDropped === true);

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 340 420"
      preserveAspectRatio="xMidYMid meet"
      className={`${animClass}${ghostBreakthrough ? " ghost-breakthrough" : ""}`}
      style={{ display: "block" }}
    >
      {body}
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
  let color: string = "#6366f1";
  if (flash) color = "#818cf8";
  else if (pct < 25) color = "#4338ca";
  return (
    <div
      style={{
        width: 48,
        height: 6,
        background: "#1f2937",
        border: "1px solid #1f2937",
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
  wallDropped,
}: {
  archetype: Archetype;
  animation: AnimationState;
  wallDropped: boolean;
}) {
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
      <div style={{ width: 64, height: 64 }}>
        <ProspectSprite
          archetype={archetype}
          animation={animation}
          wallDropped={wallDropped}
        />
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
  lastProspectLine: string;
  isMuted: boolean;
  onToggleMute: () => void;
  onAdvanceProspect: () => void;
  onAdvanceCoaching: () => void;
  onSelectMc: (opt: McOption) => void;
  onChangeText: (s: string) => void;
  onSubmitText: () => void;
  onVoiceStart: () => void;
  onVoiceStop: () => void;
  onVoiceSend: () => void;
  onVoiceRerecord: () => void;
}) {
  const truncatedName = props.prospectName.toUpperCase().slice(0, 12);
  // First name only — the YOU header has to share 160px with the CON
  // bar (~75px), so anything past ~8 chars wraps to a second line.
  const repFirst = props.repName
    .split(/\s+/)[0]
    .toUpperCase()
    .slice(0, 8);

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
            background: "#0d1117",
            position: "absolute",
            top: 0,
            left: 0,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            imageRendering: "pixelated",
            overflow: "hidden",
            color: "#e2e8f0",
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
              color="#e2e8f0"
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
              <PixelText size={6} color="#e2e8f0">
                RES
              </PixelText>
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
            wallDropped={props.wallDropped}
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
              borderTop: "1px solid #1f2937",
            }}
          >
            <PixelText
              size={6}
              color="#e2e8f0"
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
              <PixelText size={6} color="#e2e8f0">
                CON
              </PixelText>
              <ResistanceBar value={props.confidence} flash={false} />
            </div>
          </div>

        </div>

        {/* Mute toggle — overlay outside the scaled canvas, top-right of
            the canvas area. Sibling of the canvas so it isn't affected
            by the canvas's transform: scale(). */}
        <button
          type="button"
          onClick={props.onToggleMute}
          aria-label={props.isMuted ? "Unmute prospect voice" : "Mute prospect voice"}
          title={props.isMuted ? "Unmute prospect voice" : "Mute prospect voice"}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 36,
            height: 36,
            background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            borderRadius: 6,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            color: "var(--ink)",
            padding: 0,
          }}
        >
          {props.isMuted ? "🔇" : "🔊"}
        </button>
      </div>

      <HtmlDialogBox
        prospectName={props.prospectName}
        lastProspectLine={props.lastProspectLine}
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
        onVoiceStart={props.onVoiceStart}
        onVoiceStop={props.onVoiceStop}
        onVoiceSend={props.onVoiceSend}
        onVoiceRerecord={props.onVoiceRerecord}
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

// ───────────────────────────────────────────────────────────────────
// HTML dialog box — renders BELOW the pixel canvas at readable sizes.
// All Press Start 2P, dark-mode styled, no scaling. The pixel canvas
// keeps its retro feel; the dialog gets HTML-native legibility.
// ───────────────────────────────────────────────────────────────────

const DIALOG_BORDER = "#6366f1";

function HtmlDialogBox(props: {
  prospectName: string;
  lastProspectLine: string;
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
  onVoiceStart: () => void;
  onVoiceStop: () => void;
  onVoiceSend: () => void;
  onVoiceRerecord: () => void;
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
          prospectName={props.prospectName}
          prospectLine={props.lastProspectLine}
        />
      ) : null}
      {dialog.kind === "rep_input_voice" ? (
        <HtmlVoiceInput
          phase={props.voicePhase}
          transcript={props.voiceTranscript}
          error={props.voiceError}
          onStart={props.onVoiceStart}
          onStop={props.onVoiceStop}
          onSend={props.onVoiceSend}
          onRerecord={props.onVoiceRerecord}
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
  prospectName,
  prospectLine,
}: {
  value: string;
  onChange: (s: string) => void;
  onSubmit: () => void;
  prospectName: string;
  prospectLine: string;
}) {
  return (
    <div>
      {prospectLine ? (
        <div
          style={{
            marginBottom: 12,
            paddingBottom: 12,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              color: "var(--ink-4)",
              marginBottom: 6,
              textTransform: "uppercase",
              fontFamily: "var(--font-pixel), monospace",
            }}
          >
            {prospectName} said
          </div>
          <span
            style={{
              fontSize: 12,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: "var(--ink-3)",
              fontFamily: "var(--font-pixel), monospace",
            }}
          >
            {prospectLine}
          </span>
        </div>
      ) : null}
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
  onStart,
  onStop,
  onSend,
  onRerecord,
}: {
  phase: VoicePhase;
  transcript: string;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
  onSend: () => void;
  onRerecord: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        padding: "16px 0",
      }}
    >
      {phase === "idle" ? (
        <button
          type="button"
          onClick={onStart}
          className="btn btn-primary btn-lg"
          style={{
            fontFamily: "var(--font-pixel), monospace",
            background: "#306230",
            border: "1px solid #8bac0f",
            color: "#9bbc0f",
            boxShadow: "none",
          }}
        >
          TAP TO SPEAK
        </button>
      ) : null}

      {phase === "recording" ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontFamily: "var(--font-pixel), monospace",
              fontSize: 12,
              color: "var(--score-red)",
            }}
          >
            <span
              className="fc-pulse"
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: "var(--score-red)",
                display: "inline-block",
              }}
            />
            RECORDING
          </div>

          <div
            aria-hidden
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 4,
              height: 32,
            }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="fc-wave-bar"
                style={{
                  width: 5,
                  background: "#8bac0f",
                  borderRadius: 2,
                  animationDelay: `${i * 90}ms`,
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={onStop}
            style={{
              fontFamily: "var(--font-pixel), monospace",
              background: "#8bac0f",
              border: "2px solid #306230",
              color: "#0f380f",
              padding: "10px 20px",
              borderRadius: 6,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            TAP TO STOP
          </button>
        </>
      ) : null}

      {phase === "transcribing" ? (
        <span
          style={{
            fontSize: 12,
            color: "var(--ink-2)",
            fontFamily: "var(--font-pixel), monospace",
          }}
        >
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
              width: "100%",
              lineHeight: 1.6,
              fontFamily: "var(--font-pixel), monospace",
              wordBreak: "break-word",
            }}
          >
            &ldquo;{transcript}&rdquo;
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              onClick={onSend}
              className="btn btn-primary btn-sm"
              style={{ fontFamily: "var(--font-pixel), monospace" }}
            >
              SEND ►
            </button>
            <button
              type="button"
              onClick={onRerecord}
              className="btn btn-secondary btn-sm"
              style={{ fontFamily: "var(--font-pixel), monospace" }}
            >
              RE-RECORD
            </button>
          </div>
        </>
      ) : null}

      {phase === "error" ? (
        <>
          <span
            style={{
              color: "var(--score-red)",
              fontSize: 11,
              fontFamily: "var(--font-pixel), monospace",
              maxWidth: 480,
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            {error ?? "VOICE ERROR"}
          </span>
          <button
            type="button"
            onClick={onRerecord}
            className="btn btn-secondary btn-sm"
            style={{ fontFamily: "var(--font-pixel), monospace" }}
          >
            TRY AGAIN
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
        <div style={{ marginTop: 4, width: 56, height: 70 }}>
          <ProspectSprite archetype={archetype} animation="converted" />
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
        <div style={{ marginTop: 4, width: 56, height: 70, opacity: 0.6 }}>
          <ProspectSprite archetype={archetype} animation="leaving" />
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
  // MediaRecorder + Whisper round-trip. We track the recorder, its
  // captured chunks, the live mic stream (so we can release it on
  // stop), and a max-duration auto-stop timer.
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const voiceAutoStopRef = useRef<number | null>(null);

  // Phase E ("coaching") used to auto-advance after 4 seconds. It now
  // waits for the user to click — we stash the original advance action
  // here when entering coaching, and the click handler pulls it out.
  const coachingAdvanceRef = useRef<(() => void) | null>(null);

  // ElevenLabs TTS playback for Phase A prospect lines. audioRef holds
  // the currently-playing <audio> instance so we can stop it if the
  // rep clicks through early. audioUrlRef holds the blob: URL so we
  // can revoke it after playback ends.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // The session/start response and the openSession→applyProspectTurn
  // chain that triggers Phase A both run inside the same async handler
  // tick. React hasn't committed setSession() by the time the first
  // typewriter fires, so session?.archetype reads as null and TTS gets
  // skipped on the opening turn. Stashing the archetype in a ref means
  // it's available synchronously the moment session/start returns.
  const archetypeRef = useRef<Archetype | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  // isMutedRef mirrors isMuted but is updated synchronously in the
  // toggle handler so playProspectTts (which reads it on every call)
  // never sees a stale value mid-flight.
  const isMutedRef = useRef(false);
  // The text of the prospect line currently on screen. Set whenever a
  // new line begins typing; cleared on session reset / outcome. Used
  // by the unmute handler to replay the current line when the rep
  // un-mutes mid-turn.
  const currentProspectLineRef = useRef<string | null>(null);
  // Forward ref to playProspectTts so toggleMuted can call the latest
  // memoized version without depending on its identity (avoids
  // re-creating toggleMuted whenever playProspectTts changes).
  const playProspectTtsRef = useRef<
    | ((text: string) => Promise<{ play: () => void; durationMs: number } | null>)
    | null
  >(null);
  // The current dialog phase, mirrored to a ref so toggleMuted can
  // decide whether the prospect line is still on-screen without
  // closing over dialog state.
  const dialogKindRef = useRef<DialogMode["kind"] | null>(null);
  // Hydrate the mute preference from localStorage after mount. We
  // can't read it synchronously during render because that would
  // mismatch the server-rendered HTML — so the post-mount setState is
  // the hydration pattern React explicitly allows here.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MUTE_STORAGE_KEY);
      console.log(`[tts] mute hydrate: stored="${stored}"`);
      const muted = stored === "1";
      isMutedRef.current = muted;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (muted) setIsMuted(true);
    } catch {
      // localStorage unavailable (private mode, etc.) — ignore.
    }
  }, []);

  // Autoplay unlock — browsers block <audio>.play() until the user
  // interacts with the document. We register a one-shot listener on
  // window for the first click/touch/key event, play a silent WAV to
  // satisfy the gesture requirement, and then let subsequent automatic
  // playProspectTts() calls go through. This runs once per page load.
  useEffect(() => {
    let unlocked = false;
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      try {
        const silent = new Audio(
          "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
        );
        silent.volume = 0;
        void silent.play().catch(() => {
          /* even silent play can be blocked early; that's fine */
        });
        console.log("[tts] audio unlock fired on first user gesture");
      } catch (err) {
        console.warn("[tts] audio unlock threw:", err);
      }
      window.removeEventListener("click", unlock, true);
      window.removeEventListener("touchend", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
    window.addEventListener("click", unlock, true);
    window.addEventListener("touchend", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("click", unlock, true);
      window.removeEventListener("touchend", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, []);
  const toggleMuted = useCallback(() => {
    const next = !isMutedRef.current;
    isMutedRef.current = next;
    setIsMuted(next);
    try {
      window.localStorage.setItem(MUTE_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // best-effort
    }
    if (next) {
      // Muting — kill any audio in flight.
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    } else {
      // Unmuting — if a prospect line is still on screen (Phase A
      // typewriter or Phase E coaching whisper), replay it now so the
      // rep hears the line they just un-muted to listen to.
      const line = currentProspectLineRef.current;
      const phase = dialogKindRef.current;
      const inProspectPhase =
        phase === "prospect_speaking" ||
        phase === "exit_line" ||
        phase === "coaching";
      if (line && inProspectPhase) {
        const playFn = playProspectTtsRef.current;
        if (playFn) {
          console.log("[tts] unmute mid-turn — replaying current line");
          void playFn(line).then((ready) => {
            ready?.play();
          });
        }
      }
    }
  }, []);

  const stopProspectTts = useCallback(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {
        // ignore
      }
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  // Two-stage: fetch the audio + load its metadata so the caller knows
  // the duration before deciding the typewriter's per-character delay.
  // The returned `play` closure starts actual playback when the caller
  // is ready to also start the typewriter (so audio and text line up).
  // Returns null when TTS is skipped (muted, no archetype, no voice id)
  // or when any step fails — caller falls back to fixed typewriter ms.
  const playProspectTts = useCallback(
    async (
      text: string,
    ): Promise<{ play: () => void; durationMs: number } | null> => {
      const archetype = archetypeRef.current;
      const muted = isMutedRef.current;
      console.log(
        `[tts] playProspectTts called: muted=${muted} archetype="${archetype ?? "null"}" textLen=${text.length}`,
      );
      if (muted) {
        console.log("[tts] skipped — muted");
        return null;
      }
      if (!archetype) {
        console.warn("[tts] skipped — archetypeRef.current is null");
        return null;
      }
      const voiceId = ARCHETYPE_VOICE_IDS[archetypeVoiceKey(archetype)];
      if (!voiceId || voiceId === "PLACEHOLDER") {
        console.log(
          `[tts] skipped — no voiceId for archetypeKey="${archetypeVoiceKey(archetype)}"`,
        );
        return null;
      }
      // Stop anything still playing from the previous turn before
      // kicking off a new fetch.
      stopProspectTts();
      try {
        console.log(
          `[tts] fetching /api/roleplay/tts voiceId=${voiceId.slice(0, 8)}…`,
        );
        const res = await fetch("/api/roleplay/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voiceId }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.warn(
            `[tts] /api/roleplay/tts returned ${res.status}: ${errText.slice(0, 200)}`,
          );
          return null;
        }
        const blob = await res.blob();
        console.log(
          `[tts] blob received: type="${blob.type}" size=${blob.size} bytes`,
        );
        if (blob.size === 0) {
          console.warn("[tts] empty blob — aborting playback");
          return null;
        }
        if (isMutedRef.current) {
          console.log("[tts] muted while fetching — discarding blob");
          return null;
        }
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => {
          if (audioRef.current === audio) audioRef.current = null;
          if (audioUrlRef.current === url) {
            URL.revokeObjectURL(url);
            audioUrlRef.current = null;
          }
        };
        audio.onerror = () => {
          console.warn("[tts] audio element errored", audio.error);
          if (audioRef.current === audio) audioRef.current = null;
          if (audioUrlRef.current === url) {
            URL.revokeObjectURL(url);
            audioUrlRef.current = null;
          }
        };
        audioRef.current = audio;
        audioUrlRef.current = url;

        // Wait for metadata so audio.duration is reliable. Some browsers
        // need .load() called explicitly; setting src already triggers
        // it but calling load() doesn't hurt.
        const durationMs = await new Promise<number>((resolve) => {
          const fallback = window.setTimeout(() => {
            console.warn("[tts] loadedmetadata timed out at 4000ms");
            resolve(0);
          }, 4000);
          audio.onloadedmetadata = () => {
            window.clearTimeout(fallback);
            const d = audio.duration;
            if (Number.isFinite(d) && d > 0) {
              console.log(`[tts] metadata loaded: duration=${d.toFixed(2)}s`);
              resolve(d * 1000);
            } else {
              console.warn(`[tts] metadata loaded but duration=${d}`);
              resolve(0);
            }
          };
          // Defensive: some MP3s never fire loadedmetadata but DO fire
          // canplaythrough with a known duration.
          audio.oncanplaythrough = () => {
            if (audioRef.current !== audio) return;
            const d = audio.duration;
            if (Number.isFinite(d) && d > 0) {
              window.clearTimeout(fallback);
              resolve(d * 1000);
            }
          };
        });

        return {
          durationMs,
          play: () => {
            // If the rep muted between metadata-load and play, bail.
            if (isMutedRef.current || audioRef.current !== audio) return;
            audio.play().then(
              () => console.log("[tts] audio.play() started"),
              (err) => {
                console.warn("[tts] audio.play() rejected:", err);
              },
            );
          },
        };
      } catch (err) {
        console.warn("[tts] fetch failed:", err);
        return null;
      }
    },
    [stopProspectTts],
  );

  // Keep the forward ref pointing at the latest playProspectTts so
  // toggleMuted can fire it on unmute without depending on its identity.
  useEffect(() => {
    playProspectTtsRef.current = playProspectTts;
  }, [playProspectTts]);

  // Mirror the dialog phase so the unmute handler can decide whether
  // a replay is appropriate without closing over dialog state.
  useEffect(() => {
    dialogKindRef.current = dialog.kind;
  }, [dialog]);

  // Stop any audio on unmount so we don't leak handles or play after
  // the component is gone.
  useEffect(() => stopProspectTts, [stopProspectTts]);

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
  // delayMs is the per-character interval; callers compute it from
  // audio duration when TTS is active, or pass TYPEWRITER_MS otherwise.
  const typewriterRef = useRef<{ raf: number | null }>({ raf: null });
  const startTypewriter = useCallback(
    (
      text: string,
      kind: "prospect_speaking" | "exit_line",
      delayMs: number,
      onDone: () => void,
    ) => {
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
          delayMs,
        ) as unknown as number;
      };
      typewriterRef.current.raf = window.setTimeout(
        tick,
        delayMs,
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

      const runProspectTypewriter = async () => {
        setGameState("battle");
        // Reset the dialog box immediately so the rep isn't staring at
        // the prior coaching/evaluating text while we wait for the audio
        // fetch + metadata load.
        setDialog({
          kind: "prospect_speaking",
          text: data.prospect_line,
          charsShown: 0,
          done: false,
        });
        // Stash the line so the mute toggle can replay it if the rep
        // un-mutes while it's still on screen.
        currentProspectLineRef.current = data.prospect_line;

        let delayMs = TYPEWRITER_MS;
        let ready: { play: () => void; durationMs: number } | null = null;

        if (archetypeRef.current) {
          console.log("Phase A triggered, calling TTS");
          ready = await playProspectTts(data.prospect_line);
          if (
            ready &&
            ready.durationMs > 0 &&
            data.prospect_line.length > 0
          ) {
            const perChar = ready.durationMs / data.prospect_line.length;
            // Clamp so jittery duration estimates can't make the
            // typewriter unreadably fast or slow.
            delayMs = Math.max(20, Math.min(120, perChar));
            console.log(
              `[tts] sync: durationMs=${ready.durationMs.toFixed(0)} chars=${data.prospect_line.length} delayMs=${delayMs.toFixed(1)}`,
            );
          }
        } else {
          console.warn(
            "Phase A triggered but archetypeRef is null — TTS skipped",
          );
        }

        // Fire audio + typewriter at the same moment so the spoken
        // line tracks the on-screen text.
        ready?.play();
        startTypewriter(
          data.prospect_line,
          "prospect_speaking",
          delayMs,
          () => {
            // typewriter done — wait for user advance
          },
        );
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
            void runProspectTypewriter();
          }
        };
        setDialog({ kind: "coaching", text: data.turn_feedback });
      } else if (outcomeNow) {
        finalizeOutcome(outcomeNow, data);
      } else {
        void runProspectTypewriter();
      }

      void currentMode;
    },
    [labelKeyCounter, startTypewriter, finalizeOutcome, playProspectTts],
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
        // Stash archetype synchronously alongside setSession so TTS
        // has it the moment Phase A fires — without waiting for React
        // to commit the session state update.
        archetypeRef.current = data.archetype;
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
      // Click after typewriter finished — stop the audio (the rep is
      // moving past Phase A) and open the input phase.
      stopProspectTts();
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
      stopProspectTts();
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
      // Click during typewriter — skip to end. Per spec, also kill the
      // audio (the rep is choosing to read ahead rather than listen).
      stopProspectTts();
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
  }, [dialog, mode, pendingOptions, stopProspectTts]);

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

  // ── Voice handling (MediaRecorder → /api/transcribe-voice/Whisper) ──
  const clearVoiceAutoStop = useCallback(() => {
    if (voiceAutoStopRef.current != null) {
      window.clearTimeout(voiceAutoStopRef.current);
      voiceAutoStopRef.current = null;
    }
  }, []);

  const releaseMic = useCallback(() => {
    recorderStreamRef.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
    recorderStreamRef.current = null;
  }, []);

  const onVoiceStart = useCallback(async () => {
    console.log("[voice] onVoiceStart");
    setVoiceError(null);
    setVoiceTranscript("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("[voice] mic stream acquired");
      recorderStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recorderChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        console.log("[voice] recorder.onstop fired");
        clearVoiceAutoStop();
        const mime = recorder.mimeType || "audio/webm";
        const blob = new Blob(recorderChunksRef.current, { type: mime });
        recorderChunksRef.current = [];
        releaseMic();

        if (blob.size === 0) {
          console.warn("[voice] empty blob — no audio captured");
          setVoiceError("NO AUDIO CAPTURED — TRY AGAIN");
          setVoicePhase("error");
          return;
        }

        console.log(
          `[voice] transcribing blob: size=${blob.size} type="${mime}"`,
        );
        setVoicePhase("transcribing");
        try {
          const form = new FormData();
          // Match the file extension to the actual mime so /api/transcribe-voice
          // hands Whisper something it can decode.
          const ext = mime.includes("ogg")
            ? "ogg"
            : mime.includes("mp4") || mime.includes("mp4a")
              ? "mp4"
              : mime.includes("wav")
                ? "wav"
                : "webm";
          form.append("audio", blob, `recording.${ext}`);
          const res = await fetch("/api/transcribe-voice", {
            method: "POST",
            body: form,
          });
          if (!res.ok) {
            const j = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            throw new Error(j.error ?? `HTTP ${res.status}`);
          }
          const j = (await res.json()) as { text?: string };
          const text = (j.text ?? "").trim();
          if (text.length === 0) {
            console.warn("[voice] empty transcript from /api/transcribe-voice");
            setVoiceError("EMPTY TRANSCRIPT — TRY AGAIN");
            setVoicePhase("error");
            return;
          }
          console.log(
            `[voice] transcript received (${text.length} chars): ${JSON.stringify(text.slice(0, 80))}…`,
          );
          setVoiceTranscript(text);
          setVoicePhase("confirming");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn("[voice] transcription failed:", err);
          setVoiceError(msg.slice(0, 80).toUpperCase());
          setVoicePhase("error");
        }
      };

      recorder.onerror = (e) => {
        console.warn("[voice] recorder.onerror fired:", e);
      };

      console.log("[voice] recorder.start() called");
      recorder.start();
      recorderRef.current = recorder;
      setVoicePhase("recording");

      // Auto-stop after VOICE_MAX_RECORD_MS so a forgotten tab can't
      // sit recording forever.
      voiceAutoStopRef.current = window.setTimeout(() => {
        console.log("[voice] auto-stop timer fired");
        const r = recorderRef.current;
        if (r && r.state !== "inactive") {
          try {
            r.stop();
          } catch (err) {
            console.warn("[voice] auto-stop r.stop() threw:", err);
          }
        }
      }, VOICE_MAX_RECORD_MS) as unknown as number;
    } catch (err) {
      // getUserMedia rejected — typically NotAllowedError (permission
      // denied) or NotFoundError (no mic device).
      console.warn("[voice] getUserMedia failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      const friendly = /denied|not.allowed/i.test(msg)
        ? "MIC ACCESS DENIED"
        : /found|capture/i.test(msg)
          ? "NO MICROPHONE FOUND"
          : msg.slice(0, 80).toUpperCase();
      setVoiceError(friendly);
      setVoicePhase("error");
      releaseMic();
    }
  }, [clearVoiceAutoStop, releaseMic]);

  const onVoiceStop = useCallback(() => {
    console.log("[voice] onVoiceStop");
    clearVoiceAutoStop();
    const r = recorderRef.current;
    if (r && r.state !== "inactive") {
      try {
        r.stop();
      } catch (err) {
        console.warn("[voice] r.stop() threw:", err);
      }
    }
    recorderRef.current = null;
  }, [clearVoiceAutoStop]);

  const onVoiceSend = useCallback(() => {
    const t = voiceTranscript.trim();
    if (t.length === 0) {
      setVoicePhase("idle");
      return;
    }
    setVoicePhase("idle");
    void submitRepTurn(t);
  }, [voiceTranscript, submitRepTurn]);

  const onVoiceRerecord = useCallback(() => {
    console.log("[voice] onVoiceRerecord");
    setVoiceTranscript("");
    setVoiceError(null);
    setVoicePhase("idle");
  }, []);

  // Make sure mic + timers are cleaned up if the user navigates away
  // mid-recording.
  useEffect(
    () => () => {
      clearVoiceAutoStop();
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      releaseMic();
    },
    [clearVoiceAutoStop, releaseMic],
  );

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
    archetypeRef.current = null;
    currentProspectLineRef.current = null;
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

  // Most recent prospect utterance — used by text mode (Phase C) to
  // keep the prospect's line visible above the textarea while the rep
  // is composing a reply.
  const lastProspectLine = useMemo(() => {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "prospect") return history[i].content;
    }
    return "";
  }, [history]);

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
          lastProspectLine={lastProspectLine}
          isMuted={isMuted}
          onToggleMute={toggleMuted}
          onAdvanceProspect={advanceProspect}
          onAdvanceCoaching={handleAdvanceCoaching}
          onSelectMc={onSelectMc}
          onChangeText={setTextInputValue}
          onSubmitText={onSubmitText}
          onVoiceStart={onVoiceStart}
          onVoiceStop={onVoiceStop}
          onVoiceSend={onVoiceSend}
          onVoiceRerecord={onVoiceRerecord}
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
      @keyframes fc-pulse-kf {
        0%,
        100% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.05);
          opacity: 0.7;
        }
      }
      .fc-pulse {
        animation: fc-pulse-kf 1s ease-in-out infinite;
      }
      @keyframes fc-wave-kf {
        0%,
        100% {
          height: 6px;
        }
        50% {
          height: 28px;
        }
      }
      .fc-wave-bar {
        height: 6px;
        animation: fc-wave-kf 700ms ease-in-out infinite;
      }
      .ghost-breakthrough .ghost-skin {
        fill: #b0d4f5 !important;
      }
      .ghost-breakthrough .ghost-dark {
        fill: #1a3a5c !important;
      }
      .ghost-breakthrough .ghost-mid {
        fill: #4a7ab0 !important;
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
