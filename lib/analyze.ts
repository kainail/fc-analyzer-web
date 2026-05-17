/**
 * Analyzer integration: FC Sales Analyzer skill against a transcript.
 *
 * Now Postgres + R2 backed. Reads the transcript from R2 via the
 * Transcript row's textR2Key, runs the Claude call (unchanged), and
 * writes analysis.json + coaching.md back to R2. An Analysis row in
 * Postgres records the R2 keys plus denormalized fields the
 * dashboard needs (overallScore, weakStageCount, primaryTrainingFocus,
 * predictedOutcome, predictedConfidence, analyzerVersion, jsonParseError).
 *
 * Cost notes (Sonnet 4.6):
 *   - Full skill (SKILL.md + methodology + rubric + schema) is ~30-50K
 *     input tokens. With prompt caching, repeat calls within the 5-min
 *     window drop the cached portion to ~10% of normal input cost.
 *   - Output budget is 16000 tokens — large analyses + coaching message
 *     can exceed 4096 (calibration runs got truncated at the default).
 *   - Per-analysis ballpark: ~$0.15-0.25 cold, ~$0.03-0.05 cache-hit.
 *
 * On API failure: Upload.status="error_analysis", errorMessage, errorAt.
 * On malformed analyzer JSON: pipeline does NOT fail — the raw output
 * is written to coaching.md, the analysis.json file is a parse-error
 * envelope, the Analysis row's jsonParseError is set, and the Upload
 * row's status still moves to "analyzed". The viewer surfaces the
 * malformed state and offers a re-run.
 *
 * This function never throws. SKILL_PATH is still required for
 * loadSkill() — the skill files (SKILL.md + methodology/ + rubric/
 * + schema/) live on disk because they're checked into the repo as
 * source-controlled assets, not per-tenant content.
 */
import { APIError } from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import { loadSkill } from "@/lib/skill-loader";
import { prisma } from "@/lib/db";
import {
  downloadFromR2,
  uploadToR2,
  analysisJsonKey,
  coachingKey,
} from "@/lib/r2";

const MAX_TOKENS = 16000;

const JSON_START = "===ANALYZER_JSON_START===";
const JSON_END = "===ANALYZER_JSON_END===";
const COACHING_START = "===COACHING_MESSAGE_START===";
const COACHING_END = "===COACHING_MESSAGE_END===";

// Pulled from the skill's SKILL.md "Calibration status" header. The
// skill bumps this when the rubric meaningfully changes; we capture
// it on each Analysis row for filterability across versions.
const ANALYZER_VERSION = "1.0.0";

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

type ParseResult =
  | {
      ok: true;
      jsonText: string;
      jsonValue: unknown;
      coaching: string;
    }
  | {
      ok: false;
      parseError: string;
      coaching: string;
      rawText: string;
    };

function parseAnalyzerResponse(text: string): ParseResult {
  const jsonRaw = extractBetween(text, JSON_START, JSON_END);
  const coachingRaw = extractBetween(text, COACHING_START, COACHING_END);

  // Coaching fallback: if marker missing, fall back to whole text so
  // a human can still read what came back.
  const coaching = coachingRaw ?? text;

  if (jsonRaw === null) {
    return {
      ok: false,
      parseError: `Missing JSON markers (${JSON_START} / ${JSON_END}) in analyzer response`,
      coaching,
      rawText: text,
    };
  }

  // Strip optional surrounding ``` fences if the model wrapped it.
  let cleaned = jsonRaw;
  const fenced = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) cleaned = fenced[1].trim();

  try {
    const value = JSON.parse(cleaned);
    return {
      ok: true,
      jsonText: cleaned,
      jsonValue: value,
      coaching,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      parseError: `JSON.parse failed: ${msg}`,
      coaching,
      rawText: text,
    };
  }
}

function buildSystemPrompt(): Array<{
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}> {
  const skill = loadSkill();
  const preface = [
    "You are the FC Sales call analyzer. Use the methodology, rubric, and schema below to analyze the sales call transcript that the user provides.",
    "",
    "OUTPUT FORMAT — STRICT.",
    "",
    "Emit exactly two blocks, in this order, with these exact sentinel markers on their own lines:",
    "",
    JSON_START,
    "<a single JSON object matching schema/analyzer-output.md — no surrounding prose, no code fences>",
    JSON_END,
    COACHING_START,
    "<the coaching message in the format defined by schema/coaching-message.md>",
    COACHING_END,
    "",
    "Do not output anything before, between, or after these blocks. Do not wrap the JSON block in markdown fences.",
  ].join("\n");

  return [
    { type: "text", text: preface },
    { type: "text", text: skill, cache_control: { type: "ephemeral" } },
  ];
}

async function writeUploadError(
  uploadId: string,
  message: string,
): Promise<void> {
  try {
    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        status: "error_analysis",
        errorMessage: message,
        errorAt: new Date(),
      },
    });
  } catch (writeErr) {
    console.error(
      `[analyze] ${uploadId}: Failed to write error status to Postgres:`,
      writeErr,
    );
  }
}

// Pull the dashboard-facing summary fields out of the parsed analyzer
// JSON. Defensive — every accessor is optional because the schema
// occasionally evolves and we don't want one missing field to wipe
// the whole row.
function summarizeAnalyzerJson(json: unknown): {
  overallScore: number | null;
  weakStageCount: number | null;
  primaryTrainingFocus: string | null;
  predictedOutcome: string | null;
  predictedConfidence: string | null;
} {
  const j = (json ?? {}) as Record<string, unknown>;
  const stages = Array.isArray(j.stage_scores)
    ? (j.stage_scores as Array<{ score?: number | null }>)
    : [];
  const numeric = stages
    .map((s) => s?.score)
    .filter((s): s is number => typeof s === "number");
  const overall =
    numeric.length > 0
      ? Math.round((numeric.reduce((a, b) => a + b, 0) / numeric.length) * 10) /
        10
      : null;
  const weak = numeric.filter((s) => s < 6).length;

  const focus = (j.primary_training_focus ?? null) as
    | { skill?: string }
    | null;
  const predicted = (j.predicted_outcome ?? null) as
    | { bucket?: string; confidence?: string }
    | null;

  return {
    overallScore: overall,
    weakStageCount: numeric.length > 0 ? weak : null,
    primaryTrainingFocus: focus?.skill ?? null,
    predictedOutcome: predicted?.bucket ?? null,
    predictedConfidence: predicted?.confidence ?? null,
  };
}

export async function analyzeUpload(uploadId: string): Promise<void> {
  console.log(`[analyze] ${uploadId}: starting`);

  let failingStep = "load upload + transcript";
  try {
    const upload = await prisma.upload.findUnique({
      where: { id: uploadId },
      include: { org: true, transcript: true },
    });
    if (!upload) {
      console.error(`[analyze] ${uploadId}: no Upload row — aborting`);
      return;
    }
    if (!upload.transcript) {
      console.error(`[analyze] ${uploadId}: no Transcript row — aborting`);
      return;
    }
    if (upload.status !== "transcribed") {
      console.warn(
        `[analyze] ${uploadId}: expected status="transcribed", got "${upload.status}" — skipping`,
      );
      return;
    }

    failingStep = "download transcript from R2";
    const transcriptBytes = await downloadFromR2(upload.transcript.textR2Key);
    const transcript = transcriptBytes.toString("utf8");

    failingStep = "status analyzing";
    await prisma.upload.update({
      where: { id: uploadId },
      data: { status: "analyzing" },
    });

    failingStep = "build system prompt";
    const systemBlocks = buildSystemPrompt();

    const userMessage = [
      `transcript_id: ${uploadId}`,
      "",
      "TRANSCRIPT:",
      transcript,
    ].join("\n");

    failingStep = "anthropic call";
    console.log(`[analyze] ${uploadId}: calling Claude`);
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemBlocks,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n");
    console.log(
      `[analyze] ${uploadId}: Claude returned ${rawText.length} chars`,
    );

    failingStep = "parse analyzer response";
    const parsed = parseAnalyzerResponse(rawText);

    const jsonKey = analysisJsonKey(upload.org.slug, uploadId);
    const coachKey = coachingKey(upload.org.slug, uploadId);

    let jsonParseError: string | null = null;
    let jsonValueForSummary: unknown = null;

    if (parsed.ok) {
      failingStep = "upload analysis.json to R2";
      await uploadToR2(
        jsonKey,
        Buffer.from(JSON.stringify(parsed.jsonValue, null, 2), "utf8"),
        "application/json",
      );
      failingStep = "upload coaching.md to R2";
      await uploadToR2(
        coachKey,
        Buffer.from(parsed.coaching, "utf8"),
        "text/markdown",
      );
      jsonValueForSummary = parsed.jsonValue;
    } else {
      jsonParseError = parsed.parseError;
      console.warn(
        `[analyze] ${uploadId}: analyzer output malformed — ${parsed.parseError}`,
      );
      failingStep = "upload analysis.json parse-error envelope to R2";
      await uploadToR2(
        jsonKey,
        Buffer.from(
          JSON.stringify(
            { parse_error: parsed.parseError, raw_response: parsed.rawText },
            null,
            2,
          ),
          "utf8",
        ),
        "application/json",
      );
      failingStep = "upload coaching (raw) to R2";
      await uploadToR2(
        coachKey,
        Buffer.from(parsed.coaching, "utf8"),
        "text/markdown",
      );
    }

    failingStep = "persist Analysis row";
    const summary = summarizeAnalyzerJson(jsonValueForSummary);
    const now = new Date();
    await prisma.analysis.upsert({
      where: { uploadId },
      create: {
        uploadId,
        orgId: upload.orgId,
        jsonR2Key: jsonKey,
        coachingR2Key: coachKey,
        analyzerVersion: ANALYZER_VERSION,
        overallScore: summary.overallScore ?? undefined,
        weakStageCount: summary.weakStageCount ?? undefined,
        primaryTrainingFocus: summary.primaryTrainingFocus ?? undefined,
        predictedOutcome: summary.predictedOutcome ?? undefined,
        predictedConfidence: summary.predictedConfidence ?? undefined,
        jsonParseError: jsonParseError ?? undefined,
        analyzedAt: now,
      },
      update: {
        jsonR2Key: jsonKey,
        coachingR2Key: coachKey,
        analyzerVersion: ANALYZER_VERSION,
        overallScore: summary.overallScore,
        weakStageCount: summary.weakStageCount,
        primaryTrainingFocus: summary.primaryTrainingFocus,
        predictedOutcome: summary.predictedOutcome,
        predictedConfidence: summary.predictedConfidence,
        jsonParseError: jsonParseError,
        analyzedAt: now,
      },
    });

    failingStep = "status analyzed";
    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        status: "analyzed",
        errorMessage: null,
        errorAt: null,
      },
    });

    console.log(
      `[analyze] ${uploadId}: done — status=analyzed${jsonParseError ? " (jsonParseError set)" : ""}, usage=${JSON.stringify(response.usage)}`,
    );
  } catch (err) {
    const message =
      err instanceof APIError
        ? `Anthropic API ${err.status ?? "?"}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error(
      `[analyze] ${uploadId}: UNCAUGHT at step "${failingStep}":`,
      err,
    );
    await writeUploadError(
      uploadId,
      `Failed at ${failingStep}: ${message}`,
    );
  }
}
