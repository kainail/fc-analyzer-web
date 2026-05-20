/**
 * POST /api/roleplay/session/start
 *
 * Creates a RoleplaySession from an analyzed upload and returns the
 * session_id along with the bootstrapping payload the client needs
 * to open the battle screen. Called when the rep hits Start on the
 * mode-select view.
 *
 * Archetype is inferred from the seed's prospect_profile signals
 * using a fixed priority order (see chooseArchetype). Starting
 * resistance is the archetype baseline plus difficulty modifier
 * adjustments, clamped 20-85.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { downloadFromR2 } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mode = "multiple_choice" | "text" | "voice";

type Archetype =
  | "The Busy Professional"
  | "The Skeptic"
  | "The Enthusiast"
  | "The Decision Maker Blocker"
  | "The Price Shopper"
  | "The Ghost";

const STARTING_RESISTANCE: Record<Archetype, number> = {
  "The Busy Professional": 55,
  "The Skeptic": 65,
  "The Enthusiast": 35,
  "The Decision Maker Blocker": 50,
  "The Price Shopper": 60,
  "The Ghost": 70,
};

const DIFFICULTY_ADJUSTMENTS: Record<string, number> = {
  "High skepticism": 10,
  "Time pressure": 5,
  "Decision maker objection likely": 8,
  "Emotionally closed": 12,
  "Highly motivated": -10,
  "Prior positive experience": -8,
  "Referred by friend": -15,
};

const MIN_STARTING_RESISTANCE = 20;
const MAX_STARTING_RESISTANCE = 85;

type RequestBody = {
  upload_id?: unknown;
  mode?: unknown;
};

// Coerce arbitrary signal shapes to a single searchable lowercase
// string. The seed schema specifies these as strings, but in practice
// the analyzer has been known to emit arrays — handle both.
function signalsToString(value: unknown): string {
  if (typeof value === "string") return value.toLowerCase();
  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === "string")
      .join(" ")
      .toLowerCase();
  }
  return "";
}

function containsAny(haystack: string, needles: readonly string[]): boolean {
  for (const n of needles) {
    if (haystack.includes(n)) return true;
  }
  return false;
}

function chooseArchetype(prospectProfile: unknown): Archetype {
  const profile =
    prospectProfile && typeof prospectProfile === "object"
      ? (prospectProfile as Record<string, unknown>)
      : {};

  const objection = signalsToString(profile.objection_likely);
  const personality = signalsToString(profile.personality_signals);

  if (containsAny(objection, ["spouse", "partner", "husband", "wife"])) {
    return "The Decision Maker Blocker";
  }
  if (containsAny(objection, ["expensive", "price", "cost", "cheap"])) {
    return "The Price Shopper";
  }
  if (containsAny(personality, ["skeptical", "analytical", "burned"])) {
    return "The Skeptic";
  }
  if (containsAny(personality, ["excited", "motivated", "positive"])) {
    return "The Enthusiast";
  }
  if (containsAny(personality, ["quiet", "introverted", "hard to read"])) {
    return "The Ghost";
  }
  if (
    containsAny(personality, ["professional", "executive", "time pressure"])
  ) {
    return "The Busy Professional";
  }
  return "The Skeptic";
}

function computeStartingResistance(
  archetype: Archetype,
  modifiers: unknown,
): number {
  let r = STARTING_RESISTANCE[archetype];
  if (Array.isArray(modifiers)) {
    for (const m of modifiers) {
      if (typeof m === "string" && m in DIFFICULTY_ADJUSTMENTS) {
        r += DIFFICULTY_ADJUSTMENTS[m];
      }
    }
  }
  if (r < MIN_STARTING_RESISTANCE) return MIN_STARTING_RESISTANCE;
  if (r > MAX_STARTING_RESISTANCE) return MAX_STARTING_RESISTANCE;
  return r;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.upload_id !== "string" || body.upload_id.length === 0) {
    return Response.json({ error: "upload_id is required" }, { status: 400 });
  }
  if (
    body.mode !== "multiple_choice" &&
    body.mode !== "text" &&
    body.mode !== "voice"
  ) {
    return Response.json(
      { error: "mode must be multiple_choice, text, or voice" },
      { status: 400 },
    );
  }
  const uploadId: string = body.upload_id;
  const mode: Mode = body.mode;

  // Tenant scoping. Caller must belong to an org that owns this upload.
  // Cross-org probes return 404 to avoid leaking upload existence.
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { orgId: true },
  });
  if (memberships.length === 0) {
    return Response.json({ error: "Upload not found" }, { status: 404 });
  }

  const upload = await prisma.upload.findFirst({
    where: {
      id: uploadId,
      orgId: { in: memberships.map((m) => m.orgId) },
    },
    include: { analysis: true, org: true },
  });
  if (!upload) {
    return Response.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.status !== "analyzed") {
    return Response.json(
      { error: "Analysis not complete", status: upload.status },
      { status: 409 },
    );
  }

  if (!upload.analysis) {
    return Response.json({ error: "Analysis not found" }, { status: 404 });
  }

  let parsed: unknown;
  try {
    const buf = await downloadFromR2(upload.analysis.jsonR2Key);
    parsed = JSON.parse(buf.toString("utf8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[roleplay-start] ${uploadId}: failed to load analysis JSON:`,
      err,
    );
    return Response.json(
      { error: `Failed to load analysis: ${msg}` },
      { status: 502 },
    );
  }

  const seed =
    parsed && typeof parsed === "object" && "roleplay_scenario_seed" in parsed
      ? (parsed as { roleplay_scenario_seed: unknown }).roleplay_scenario_seed
      : null;

  if (seed == null) {
    return Response.json({ error: "No roleplay seed" }, { status: 404 });
  }

  const seedObj = seed as Record<string, unknown>;
  const prospectProfile = seedObj.prospect_profile;
  const difficultyModifiers = seedObj.difficulty_modifiers;
  const turnLimit =
    typeof seedObj.estimated_drill_duration_minutes === "number"
      ? seedObj.estimated_drill_duration_minutes
      : null;

  const archetype = chooseArchetype(prospectProfile);
  const startingResistance = computeStartingResistance(
    archetype,
    difficultyModifiers,
  );

  const session = await prisma.roleplaySession.create({
    data: {
      uploadId: upload.id,
      orgId: upload.orgId,
      repUserId: userId,
      mode,
      archetype,
      startingResistance,
    },
  });

  return Response.json(
    {
      session_id: session.id,
      archetype,
      starting_resistance: startingResistance,
      turn_limit: turnLimit,
      prospect_name: upload.prospectName,
      seed,
    },
    { status: 200 },
  );
}
