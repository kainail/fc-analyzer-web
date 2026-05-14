import OpenAI from "openai";

// Whisper transcription model.
// "whisper-1" is the canonical Whisper API model identifier.
// See https://platform.openai.com/docs/guides/speech-to-text for the
// current model list and feature surface (gpt-4o-transcribe is also
// offered with different trade-offs). Re-check the docs when bumping.
export const WHISPER_MODEL = "whisper-1";

// SDK reads OPENAI_API_KEY from process.env by default.
export const openai = new OpenAI();
