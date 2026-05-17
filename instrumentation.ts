// Boot-time hook. Next.js calls register() exactly once when the server
// starts. We use it to:
//   1. Log loud warnings for any missing env vars so we don't silently
//      fail when a feature first tries to use them.
//   2. Run the startup-recovery sweep that resets stuck transcription
//      rows back to "uploaded" and re-fires their transcription. This
//      mainly catches dev-server-HMR-mid-call scenarios where the
//      process died with no JS error to record the failure.

export async function register() {
  const required = [
    { name: "SKILL_PATH", purpose: "FC_Sales_Analyzer location (upload + analyzer)" },
    { name: "ANTHROPIC_API_KEY", purpose: "Anthropic Messages API (analyzer route)" },
    { name: "OPENAI_API_KEY", purpose: "OpenAI Whisper API (transcription)" },
    { name: "DATABASE_URL", purpose: "Postgres connection (Prisma client)" },
    { name: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", purpose: "Clerk frontend (sign-in / sign-up widgets)" },
    { name: "CLERK_SECRET_KEY", purpose: "Clerk backend (auth() / middleware)" },
    { name: "R2_ENDPOINT", purpose: "Cloudflare R2 S3 endpoint" },
    { name: "R2_BUCKET", purpose: "Cloudflare R2 bucket name" },
    { name: "R2_ACCESS_KEY_ID", purpose: "Cloudflare R2 access key" },
    { name: "R2_SECRET_ACCESS_KEY", purpose: "Cloudflare R2 secret" },
  ];

  const missing = required.filter(({ name }) => !process.env[name]);
  if (missing.length === 0) {
    console.log("[startup] All required env vars are set.");
  } else {
    for (const { name, purpose } of missing) {
      console.warn(
        `[startup] WARNING: ${name} is not set (${purpose}). Features depending on it will fail at use time.`,
      );
    }
  }

  // Recovery sweep is Node-only (uses fs + the OpenAI client). The
  // edge runtime would crash on the import, so guard accordingly.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { runStartupRecovery } = await import("@/lib/startup-recovery");
      await runStartupRecovery();
    } catch (err) {
      console.error("[startup] Recovery sweep threw:", err);
    }
  }
}
