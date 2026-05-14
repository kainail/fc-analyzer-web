import { APIError } from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import { loadSkill } from "@/lib/skill-loader";

export async function POST(request: Request) {
  let body: { transcript_id?: string; transcript?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  const { transcript_id, transcript } = body;
  if (!transcript_id || !transcript) {
    return Response.json(
      { error: "transcript_id and transcript are required" },
      { status: 400 },
    );
  }

  let skill: string;
  try {
    skill = loadSkill();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Skill load failed: ${message}` },
      { status: 500 },
    );
  }

  const systemPrompt = [
    "You are the FC Sales call analyzer. Use the methodology, rubric, and schema below to analyze the sales call transcript that the user provides. Follow the schema in your output.",
    "",
    skill,
  ].join("\n");

  const userMessage = [
    `transcript_id: ${transcript_id}`,
    "",
    "TRANSCRIPT:",
    transcript,
  ].join("\n");

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n");

    return Response.json({ text, usage: response.usage });
  } catch (err) {
    if (err instanceof APIError) {
      const status = err.status ?? 500;
      return Response.json(
        { error: `Anthropic API ${status}: ${err.message}` },
        { status },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Unexpected error: ${message}` },
      { status: 500 },
    );
  }
}
