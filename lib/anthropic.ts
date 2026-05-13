import Anthropic from "@anthropic-ai/sdk";

// Sonnet 4.6 model identifier.
// Verified 2026-05-13 against https://docs.claude.com/en/docs/about-claude/models/overview
// On the 4.6 generation, both the "Claude API ID" and "Claude API alias"
// columns are claude-sonnet-4-6 — a dateless pinned snapshot, not an
// evergreen pointer. Re-check the docs page when bumping model versions.
// To swap models for testing, change this constant (e.g. claude-opus-4-7,
// claude-haiku-4-5).
export const MODEL = "claude-sonnet-4-6";

// SDK reads ANTHROPIC_API_KEY from process.env by default.
export const anthropic = new Anthropic();
