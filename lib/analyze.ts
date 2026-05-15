/**
 * Analyzer integration: FC Sales Analyzer skill against a transcript.
 *
 * Cost notes (as of 2026-05-15, Sonnet 4.6):
 *   - Full skill (SKILL.md + methodology + rubric + schema) is ~30-50K
 *     input tokens. With prompt caching, repeat calls within the 5-minute
 *     window drop the cached portion to ~10% of normal input cost.
 *   - Output budget is 16000 tokens — large analyses + coaching message
 *     can exceed 4096 (calibration runs got truncated at the default).
 *   - Per-analysis ballpark: ~$0.15-0.25 cold, ~$0.03-0.05 cache-hit.
 *
 * Write order on success is INTENTIONAL:
 *   1. analyses/json/<id>.json
 *   2. analyses/coaching/<id>.md
 *   3. Move incoming/<id>/ → processed/<id>/
 *   4. ONLY THEN write metadata.json with status="analyzed"
 *
 * This guarantees status="analyzed" never appears unless both output
 * files exist and the folder has been moved. The final metadata write
 * goes to the new processed/<id>/metadata.json location.
 *
 * On API error: status="error_analysis", folder stays in incoming/ for
 * inspection. On malformed analyzer JSON: pipeline does NOT fail — raw
 * output is captured, metadata flagged with json_parse_error, status
 * still moves to "analyzed", folder still moves to processed/.
 *
 * This function never throws. All errors are logged via console.error
 * AND recorded in metadata.json.
 */
import fs from "node:fs";
import path from "node:path";
import { APIError } from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import { loadSkill } from "@/lib/skill-loader";
import {
  resolveUploadDir,
  uploadDir,
  processedDir,
} from "@/lib/upload-id";

const MAX_TOKENS = 16000;

const JSON_START = "===ANALYZER_JSON_START===";
const JSON_END = "===ANALYZER_JSON_END===";
const COACHING_START = "===COACHING_MESSAGE_START===";
const COACHING_END = "===COACHING_MESSAGE_END===";

type Metadata = Record<string, unknown> & {
  upload_id: string;
  status: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function readMetadata(metadataPath: string): Metadata | null {
  try {
    return JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Metadata;
  } catch {
    return null;
  }
}

function writeMetadata(metadataPath: string, metadata: Metadata): void {
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}

function tryWriteErrorMetadata(
  metadataPath: string,
  metadata: Metadata,
  errorMessage: string,
  uploadId: string,
): void {
  metadata.status = "error_analysis";
  metadata.error_message = errorMessage;
  metadata.error_at = nowIso();
  try {
    writeMetadata(metadataPath, metadata);
  } catch (writeErr) {
    console.error(
      `[analyze] Failed to write error metadata for ${uploadId}:`,
      writeErr,
    );
  }
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function analysesPaths(uploadId: string): {
  jsonPath: string;
  coachingPath: string;
} {
  const skillPath = process.env.SKILL_PATH;
  if (!skillPath) {
    throw new Error("SKILL_PATH is not set");
  }
  const jsonDir = path.join(skillPath, "analyses", "json");
  const coachingDir = path.join(skillPath, "analyses", "coaching");
  ensureDir(jsonDir);
  ensureDir(coachingDir);
  return {
    jsonPath: path.join(jsonDir, `${uploadId}.json`),
    coachingPath: path.join(coachingDir, `${uploadId}.md`),
  };
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

  // Coaching fallback: if marker missing, fall back to whole text so a
  // human can still read what came back.
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

export async function analyzeUpload(uploadId: string): Promise<void> {
  const dir = resolveUploadDir(uploadId);
  if (!dir) {
    console.error(
      `[analyze] No upload directory found for ${uploadId} — aborting`,
    );
    return;
  }
  const metadataPath = path.join(dir, "metadata.json");

  const metadata = readMetadata(metadataPath);
  if (!metadata) {
    console.error(
      `[analyze] No metadata.json at ${metadataPath} — aborting analysis for ${uploadId}`,
    );
    return;
  }

  if (metadata.status !== "transcribed") {
    console.warn(
      `[analyze] Skipping ${uploadId}: expected status="transcribed", got "${metadata.status}"`,
    );
    return;
  }

  const transcriptPath = path.join(dir, "transcript.txt");
  let transcript: string;
  try {
    transcript = fs.readFileSync(transcriptPath, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    tryWriteErrorMetadata(
      metadataPath,
      metadata,
      `Failed to read transcript.txt: ${msg}`,
      uploadId,
    );
    return;
  }

  // Move status to "analyzing".
  metadata.status = "analyzing";
  try {
    writeMetadata(metadataPath, metadata);
  } catch (writeErr) {
    console.error(
      `[analyze] Failed to write 'analyzing' status for ${uploadId}:`,
      writeErr,
    );
    return;
  }

  let failingStep = "build system prompt";
  try {
    const systemBlocks = buildSystemPrompt();

    const userMessage = [
      `transcript_id: ${uploadId}`,
      "",
      "TRANSCRIPT:",
      transcript,
    ].join("\n");

    failingStep = "anthropic call";
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemBlocks,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n");

    failingStep = "parse analyzer response";
    const parsed = parseAnalyzerResponse(rawText);

    failingStep = "resolve analyses paths";
    const { jsonPath, coachingPath } = analysesPaths(uploadId);

    let jsonParseError: string | null = null;
    if (parsed.ok) {
      failingStep = "write json file";
      fs.writeFileSync(jsonPath, JSON.stringify(parsed.jsonValue, null, 2));
      failingStep = "write coaching file";
      fs.writeFileSync(coachingPath, parsed.coaching);
    } else {
      jsonParseError = parsed.parseError;
      console.warn(
        `[analyze] ${uploadId}: analyzer output malformed — ${parsed.parseError}`,
      );
      failingStep = "write json parse-error file";
      fs.writeFileSync(
        jsonPath,
        JSON.stringify(
          { parse_error: parsed.parseError, raw_response: parsed.rawText },
          null,
          2,
        ),
      );
      failingStep = "write coaching (raw) file";
      fs.writeFileSync(coachingPath, parsed.coaching);
    }

    failingStep = "move folder to processed";
    const incoming = uploadDir(uploadId);
    const processed = processedDir(uploadId);
    ensureDir(path.dirname(processed));
    if (fs.existsSync(processed)) {
      // Defensive: stale processed entry blocks rename on Windows.
      throw new Error(
        `Destination already exists: ${processed} — refusing to overwrite`,
      );
    }
    fs.renameSync(incoming, processed);

    failingStep = "metadata final write";
    metadata.status = "analyzed";
    metadata.analyzed_at = nowIso();
    if (jsonParseError) {
      metadata.json_parse_error = jsonParseError;
    } else {
      delete metadata.json_parse_error;
    }
    metadata.analysis_json_path = jsonPath;
    metadata.coaching_path = coachingPath;
    const finalMetadataPath = path.join(processed, "metadata.json");
    writeMetadata(finalMetadataPath, metadata);

    // Record API usage for cost tracking. Non-critical — log only.
    console.log(
      `[analyze] ${uploadId} done. usage=${JSON.stringify(response.usage)}`,
    );
  } catch (err) {
    const message =
      err instanceof APIError
        ? `Anthropic API ${err.status ?? "?"}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error(
      `[analyze] Failed at step "${failingStep}" for ${uploadId}:`,
      err,
    );
    // Best-effort: write error to whichever metadata path still exists.
    const stillIncoming = path.join(uploadDir(uploadId), "metadata.json");
    const inProcessed = path.join(processedDir(uploadId), "metadata.json");
    const target = fs.existsSync(stillIncoming)
      ? stillIncoming
      : fs.existsSync(inProcessed)
        ? inProcessed
        : metadataPath;
    tryWriteErrorMetadata(
      target,
      metadata,
      `Failed at ${failingStep}: ${message}`,
      uploadId,
    );
  }
}
