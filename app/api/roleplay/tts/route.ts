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
  console.log(
    `[tts] ELEVENLABS_API_KEY ${apiKey ? `present (len=${apiKey.length})` : "MISSING"}`,
  );
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

  console.log(
    `[tts] forwarding to ElevenLabs voiceId=${body.voiceId.slice(0, 8)}… textLen=${body.text.length}`,
  );

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

  // Buffer the full payload before responding so we can set
  // Content-Length and log the size. Streaming through Next's edge
  // proxy occasionally trips up Audio element decoders that want a
  // known length up front.
  const audioBuf = Buffer.from(await upstream.arrayBuffer());
  console.log(`[tts] ElevenLabs returned ${audioBuf.byteLength} bytes`);

  return new Response(audioBuf, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(audioBuf.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
