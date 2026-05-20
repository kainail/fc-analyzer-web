/**
 * POST /api/roleplay/chat
 *
 * Stateless per-turn endpoint for roleplay sessions. The frontend
 * owns all session state — it passes the full session_id + history
 * + current resistance + turn counter on every request. This handler
 * loads the roleplay skill from disk, hydrates the scenario seed from
 * the upload's Analysis JSON in R2, calls Claude, parses the
 * sentinel-wrapped JSON, persists the turn (or final report) to
 * Postgres / R2, and returns the parsed payload to the client.
 *
 * request_type:
 *   "session_open"  — first turn, no rep_turn, prospect opens
 *   "turn"          — rep move in flight, evaluate + respond
 *   "final_report"  — session over, drop character, return report
 *
 * Auth: Clerk session must match session.repUserId or have membership
 * in session.orgId. Cross-org probes return 404 (not 403) so we don't
 * leak session existence.
 */
import fs from "node:fs";
import { auth } from "@clerk/nextjs/server";
import { APIError } from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import { prisma } from "@/lib/db";
import { downloadFromR2, uploadToR2 } from "@/lib/r2";
import { resolveSkillPath } from "@/lib/skill-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4000;

const TURN_START = "===ROLEPLAY_TURN_START===";
const TURN_END = "===ROLEPLAY_TURN_END===";
const REPORT_START = "===ROLEPLAY_REPORT_START===";
const REPORT_END = "===ROLEPLAY_REPORT_END===";

// Order matters — SKILL.md preamble first, then prospect/, scoring/,
// output/, then the shared stage rubric so resistance scoring can
// reference rubric stage scores. Matches the load order documented
// in skill/roleplay/SKILL.md.
const ROLEPLAY_SKILL_FILES = [
  "SKILL.md",
  "prospect/behavior.md",
  "prospect/resistance.md",
  "scoring/turn-feedback.md",
  "scoring/final-report.md",
  "output/schema.md",
] as const;

type HistoryEntry = {
  role: "prospect" | "rep";
  content: string;
  turn: number;
};

type RequestBody = {
  session_id?: unknown;
  request_type?: unknown;
  rep_turn?: unknown;
  history?: unknown;
  current_resistance?: unknown;
  current_turn?: unknown;
  wall_dropped?: unknown;
};

type RequestType = "session_open" | "turn" | "final_report";

function loadRoleplaySkill(): string {
  // Both files use the same SKILL_PATH-as-skill-root convention as
  // lib/skill-loader: per-file lookup that tries SKILL_PATH first and
  // falls back to the bundled skill/ copy. This lets the analyzer
  // skill be iterated outside the repo (SKILL_PATH points there) while
  // roleplay assets stay in the bundle without forcing the override
  // dir to carry both.
  const sections: string[] = [];

  for (const rel of ROLEPLAY_SKILL_FILES) {
    const full = resolveSkillPath(`roleplay/${rel}`);
    sections.push(`# roleplay/${rel}\n\n${fs.readFileSync(full, "utf8")}`);
  }

  const stagesPath = resolveSkillPath("rubric/stages.md");
  sections.push(`# rubric/stages.md\n\n${fs.readFileSync(stagesPath, "utf8")}`);

  return sections.join("\n\n---\n\n");
}

function extractBetween(
  text: string,
  start: string,
  end: string,
): string | null {
  const s = text.indexOf(start);
  if (s < 0) return null;
  const e = text.indexOf(end, s + start.length);
  if (e < 0) return null;
  return text.slice(s + start.length, e).trim();
}

function parseSentinelJson(raw: string): unknown {
  // Defensive: strip ``` fences if the model wrapped the JSON despite
  // schema.md saying not to.
  let cleaned = raw;
  const fenced = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) cleaned = fenced[1].trim();
  return JSON.parse(cleaned);
}

// internal_quality is the rubric grade attached to each MC option.
// It must never reach the client — otherwise the rep can read the
// optimal answer off the wire. Strip in-place before returning.
function stripInternalQuality(parsed: unknown): unknown {
  if (parsed && typeof parsed === "object" && "multiple_choice_options" in parsed) {
    const obj = parsed as Record<string, unknown>;
    const options = obj.multiple_choice_options;
    if (Array.isArray(options)) {
      obj.multiple_choice_options = options.map((opt) => {
        if (!opt || typeof opt !== "object") return opt;
        const next: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(opt as Record<string, unknown>)) {
          if (k !== "internal_quality") next[k] = v;
        }
        return next;
      });
    }
  }
  return parsed;
}

function validateRequestBody(body: RequestBody): {
  session_id: string;
  request_type: RequestType;
  rep_turn: string | null;
  history: HistoryEntry[];
  current_resistance: number | null;
  current_turn: number | null;
  wall_dropped: boolean;
} | { error: string } {
  if (typeof body.session_id !== "string" || body.session_id.length === 0) {
    return { error: "session_id is required" };
  }
  if (
    body.request_type !== "session_open" &&
    body.request_type !== "turn" &&
    body.request_type !== "final_report"
  ) {
    return { error: "request_type must be session_open, turn, or final_report" };
  }

  const repTurn =
    typeof body.rep_turn === "string" && body.rep_turn.length > 0
      ? body.rep_turn
      : null;

  const history: HistoryEntry[] = Array.isArray(body.history)
    ? (body.history as unknown[]).flatMap((h) => {
        if (
          h &&
          typeof h === "object" &&
          "role" in h &&
          "content" in h &&
          "turn" in h
        ) {
          const e = h as Record<string, unknown>;
          if (
            (e.role === "prospect" || e.role === "rep") &&
            typeof e.content === "string" &&
            typeof e.turn === "number"
          ) {
            return [{ role: e.role, content: e.content, turn: e.turn }];
          }
        }
        return [];
      })
    : [];

  return {
    session_id: body.session_id,
    request_type: body.request_type,
    rep_turn: repTurn,
    history,
    current_resistance:
      typeof body.current_resistance === "number" ? body.current_resistance : null,
    current_turn: typeof body.current_turn === "number" ? body.current_turn : null,
    wall_dropped: body.wall_dropped === true,
  };
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let rawBody: RequestBody;
  try {
    rawBody = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validated = validateRequestBody(rawBody);
  if ("error" in validated) {
    return Response.json({ error: validated.error }, { status: 400 });
  }

  const {
    session_id,
    request_type,
    rep_turn,
    history,
    current_resistance,
    current_turn,
    wall_dropped,
  } = validated;

  const session = await prisma.roleplaySession.findUnique({
    where: { id: session_id },
    include: {
      upload: {
        include: {
          analysis: true,
          org: true,
        },
      },
    },
  });

  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  // Tenant scoping. Owner of the session OR any member of the session's
  // org may interact. Cross-org probes get 404, not 403.
  if (session.repUserId !== userId) {
    const member = await prisma.membership.findFirst({
      where: { userId, orgId: session.orgId },
      select: { id: true },
    });
    if (!member) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }
  }

  if (session.outcome !== null && session.outcome !== undefined) {
    return Response.json(
      { error: "Session already ended" },
      { status: 409 },
    );
  }

  if (!session.upload.analysis) {
    return Response.json(
      { error: "Analysis not found for upload" },
      { status: 404 },
    );
  }

  // Hydrate the scenario seed from the analysis JSON in R2. We re-read
  // on every turn because the handler is stateless; in practice the
  // analysis bytes are small and R2 reads are cheap.
  let seed: unknown;
  try {
    const buf = await downloadFromR2(session.upload.analysis.jsonR2Key);
    const parsed = JSON.parse(buf.toString("utf8")) as unknown;
    seed =
      parsed && typeof parsed === "object" && "roleplay_scenario_seed" in parsed
        ? (parsed as { roleplay_scenario_seed: unknown }).roleplay_scenario_seed
        : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[roleplay-chat] ${session_id}: seed load failed:`, err);
    return Response.json(
      { error: `Failed to load scenario seed: ${msg}` },
      { status: 502 },
    );
  }

  if (seed == null) {
    return Response.json(
      { error: "No roleplay seed in this analysis" },
      { status: 404 },
    );
  }

  const seedObj = seed as Record<string, unknown>;
  const difficultyModifiers = Array.isArray(seedObj.difficulty_modifiers)
    ? (seedObj.difficulty_modifiers as unknown[])
    : [];
  const turnLimit =
    typeof seedObj.estimated_drill_duration_minutes === "number"
      ? seedObj.estimated_drill_duration_minutes
      : null;

  let skillText: string;
  try {
    skillText = loadRoleplaySkill();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[roleplay-chat] ${session_id}: skill load failed:`, err);
    return Response.json({ error: msg }, { status: 500 });
  }

  const systemBlocks: Array<{
    type: "text";
    text: string;
    cache_control?: { type: "ephemeral" };
  }> = [
    {
      type: "text",
      text:
        "You are the FC Roleplay skill. Follow the skill files below to play the prospect, evaluate the rep's moves, and (when request_type is final_report) generate the post-session coaching report. Return only the sentinel-wrapped JSON specified in output/schema.md. No prose outside the markers, no markdown fences inside them.",
    },
    {
      type: "text",
      text: skillText,
      cache_control: { type: "ephemeral" },
    },
  ];

  const userPayload = {
    seed,
    archetype: session.archetype,
    mode: session.mode,
    starting_resistance: session.startingResistance,
    difficulty_modifiers: difficultyModifiers,
    turn_limit: turnLimit,
    history,
    current_resistance: current_resistance ?? session.startingResistance,
    current_turn: current_turn ?? 1,
    wall_dropped,
    rep_turn: request_type === "turn" ? rep_turn : null,
    request_type,
  };

  let rawText: string;
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemBlocks,
      messages: [{ role: "user", content: JSON.stringify(userPayload) }],
    });
    rawText = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n");
  } catch (err) {
    const message =
      err instanceof APIError
        ? `Anthropic API ${err.status ?? "?"}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error(`[roleplay-chat] ${session_id}: anthropic call failed:`, err);
    return Response.json({ error: message }, { status: 502 });
  }

  if (request_type === "final_report") {
    const reportRaw = extractBetween(rawText, REPORT_START, REPORT_END);
    if (reportRaw === null) {
      console.warn(
        `[roleplay-chat] ${session_id}: missing report sentinels in response`,
      );
      return Response.json(
        { error: "Claude response malformed" },
        { status: 502 },
      );
    }

    let report: unknown;
    try {
      report = parseSentinelJson(reportRaw);
    } catch (err) {
      console.warn(
        `[roleplay-chat] ${session_id}: report JSON parse failed:`,
        err,
      );
      return Response.json(
        { error: "Claude response JSON invalid" },
        { status: 502 },
      );
    }

    const reportKey = `roleplay/${session.upload.org.slug}/${session.id}/report.json`;
    try {
      await uploadToR2(
        reportKey,
        Buffer.from(JSON.stringify(report, null, 2), "utf8"),
        "application/json",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[roleplay-chat] ${session_id}: report R2 upload failed:`,
        err,
      );
      return Response.json(
        { error: `Failed to persist report: ${msg}` },
        { status: 502 },
      );
    }

    const r = report as Record<string, unknown>;
    const summary = (r.session_summary ?? {}) as Record<string, unknown>;
    const stageObj = (r.stage_objective ?? {}) as Record<string, unknown>;

    await prisma.roleplaySession.update({
      where: { id: session.id },
      data: {
        reportR2Key: reportKey,
        outcome:
          typeof summary.outcome === "string" ? summary.outcome : undefined,
        totalTurns:
          typeof summary.total_turns === "number"
            ? summary.total_turns
            : undefined,
        strongMoves:
          typeof summary.strong_moves === "number"
            ? summary.strong_moves
            : undefined,
        competentMoves:
          typeof summary.competent_moves === "number"
            ? summary.competent_moves
            : undefined,
        weakMoves:
          typeof summary.weak_moves === "number" ? summary.weak_moves : undefined,
        criticalMoves:
          typeof summary.critical_moves === "number"
            ? summary.critical_moves
            : undefined,
        xpEarned:
          typeof summary.xp_earned === "number" ? summary.xp_earned : undefined,
        stageObjectiveMet:
          typeof stageObj.status === "string" ? stageObj.status : undefined,
        finalResistance:
          typeof summary.final_resistance === "number"
            ? summary.final_resistance
            : undefined,
      },
    });

    return Response.json(report, { status: 200 });
  }

  // session_open or turn → parse the turn envelope
  const turnRaw = extractBetween(rawText, TURN_START, TURN_END);
  if (turnRaw === null) {
    console.warn(
      `[roleplay-chat] ${session_id}: missing turn sentinels in response`,
    );
    return Response.json(
      { error: "Claude response malformed" },
      { status: 502 },
    );
  }

  let parsed: unknown;
  try {
    parsed = parseSentinelJson(turnRaw);
  } catch (err) {
    console.warn(
      `[roleplay-chat] ${session_id}: turn JSON parse failed:`,
      err,
    );
    return Response.json(
      { error: "Claude response JSON invalid" },
      { status: 502 },
    );
  }

  const p = parsed as Record<string, unknown>;
  const turnNumber =
    typeof p.turn === "number" ? p.turn : current_turn ?? 1;

  // Persist the rep's move (if any) and the prospect's response. Both
  // rows carry the same turn number — the role field distinguishes them.
  if (rep_turn) {
    await prisma.roleplayTurn.create({
      data: {
        sessionId: session.id,
        turnNumber,
        role: "rep",
        content: rep_turn,
      },
    });
  }

  await prisma.roleplayTurn.create({
    data: {
      sessionId: session.id,
      turnNumber,
      role: "prospect",
      content: typeof p.prospect_line === "string" ? p.prospect_line : "",
      floatingLabel:
        typeof p.floating_label === "string" ? p.floating_label : null,
      resistanceDelta:
        typeof p.resistance_delta === "number" ? p.resistance_delta : null,
      resistanceAfter:
        typeof p.resistance_after === "number" ? p.resistance_after : null,
      turnFeedback:
        typeof p.turn_feedback === "string" ? p.turn_feedback : null,
    },
  });

  // If the model signaled session end inline (win at resistance 0,
  // walkout at 100, timeout), promote the outcome to the session row so
  // the next request returns 409 and the client can branch to report.
  const sessionState =
    p.session_state && typeof p.session_state === "object"
      ? (p.session_state as Record<string, unknown>)
      : null;
  const outcomeFromState =
    sessionState && typeof sessionState.outcome === "string"
      ? sessionState.outcome
      : null;
  if (outcomeFromState) {
    await prisma.roleplaySession.update({
      where: { id: session.id },
      data: { outcome: outcomeFromState },
    });
  }

  return Response.json(stripInternalQuality(parsed), { status: 200 });
}
