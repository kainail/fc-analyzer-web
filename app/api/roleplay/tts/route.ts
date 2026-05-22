/**
 * POST /api/roleplay/tts
 *
 * Server-side proxy to ElevenLabs text-to-speech. Used by the roleplay
 * battle screen to voice the prospect's lines during Phase A. Keeps
 * the API key off the client.
 *
 * Body: { text: string, voiceId: string }
 * Returns: audio/mpeg stream (the synthesized speech)
 *
 * Errors:
 *   400 — bad body
 *   401 — unauthenticated (Clerk)
 *   500 — ELEVENLABS_API_KEY not configured
 *   502 — ElevenLabs API returned an error
 */
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ELEVENLABS_MODEL = "eleven_turbo_v2_5";

type RequestBody = {
  text?: unknown;
  voiceId?: unknown;
};

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ELEVENLABS_API_KEY is not configured" },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.text !== "string" || body.text.length === 0) {
    return Response.json({ error: "text is required" }, { status: 400 });
  }
  if (typeof body.voiceId !== "string" || body.voiceId.length === 0) {
    return Response.json({ error: "voiceId is required" }, { status: 400 });
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(body.voiceId)}/stream`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: body.text,
        model_id: ELEVENLABS_MODEL,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[tts] ElevenLabs fetch failed:", err);
    return Response.json(
      { error: `ElevenLabs request failed: ${msg}` },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const txt = await upstream.text().catch(() => "");
    console.error(
      `[tts] ElevenLabs returned ${upstream.status}: ${txt.slice(0, 400)}`,
    );
    return Response.json(
      { error: `ElevenLabs ${upstream.status}: ${txt.slice(0, 200) || "no body"}` },
      { status: 502 },
    );
  }

  // Stream the MP3 bytes straight through to the client.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
