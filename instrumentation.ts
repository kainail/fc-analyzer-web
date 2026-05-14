// Boot-time hook. Next.js calls register() exactly once when the server
// starts. We use it to log loud warnings for any missing env vars so we
// don't silently fail when a feature first tries to use them.
//
// We log warnings (not errors) so the server still starts — individual
// features will throw their own clear errors when actually invoked.

export function register() {
  const required = [
    { name: "SKILL_PATH", purpose: "FC_Sales_Analyzer location (upload + analyzer)" },
    { name: "ANTHROPIC_API_KEY", purpose: "Anthropic Messages API (analyzer route)" },
    { name: "OPENAI_API_KEY", purpose: "OpenAI Whisper API (transcription)" },
  ];

  const missing = required.filter(({ name }) => !process.env[name]);
  if (missing.length === 0) {
    console.log("[startup] All required env vars are set.");
    return;
  }

  for (const { name, purpose } of missing) {
    console.warn(
      `[startup] WARNING: ${name} is not set (${purpose}). Features depending on it will fail at use time.`,
    );
  }
}
