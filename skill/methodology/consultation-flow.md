# Consultation Flow

This file is the structural map of a personal training consultation. Use it to orient yourself in a transcript and to identify which stage you are in when scoring.

A typical PT consultation runs 45–90 minutes and follows the sequence below. Reps will compress, expand, or merge stages, but the underlying sequence holds. Significant deviations from the sequence are themselves diagnostic — for example, a rep who jumps to the workout without exploring yesterdays has skipped a foundational step.

## Stage 1: Pre-frame and opening

**Before the consultation begins.** A confirmation call 24 hours prior. A personalized video message day-of. The prospect has filled out a fitness assessment questionnaire before arriving (or fills it out at the start, while the rep steps out of the room).

**Opening of the call itself.** Rapport built outside the office, casually ("how's your day been"). The rep guides the prospect to sit down and opens with a direct qualifying question — typically "so what made you decide to get a gym membership?" or "why now?"

The opening is short and disciplined. It does not contain product pitching, facility tours, or company history. The rep is moving immediately into qualifying.

## Stage 2: Asks (surfacing the why)

The rep digs past the surface goal until they reach the emotional why. This is not a single question — it is a sequence.

A typical sequence:
- "What made you come in today?"
- "Why now? Why not three months ago?"
- "What does being healthy mean to you?"
- "What happens if nothing changes?"
- "Where do you want to be 12 months from now?"
- "How will your life be different if you hit that goal?"

The rep is not following a script verbatim. They are following the *thread* the prospect gives them, asking follow-ups until the prospect articulates something emotional rather than abstract. "I want to lose weight" is the surface. "I want to feel confident in front of my kids again" is the emotional why. Stop at the first; you have nothing. Reach the second; you have everything.

This is the highest-leverage stage of the entire call. A rep who shortcuts asks loses the foundation for everything that follows.

## Stage 3: Needs (label and confirm)

Once the rep has surfaced the emotional why, they label it back to the prospect as a problem the rep can solve, and they get explicit agreement.

```
"So what I'm hearing is you're here because your energy's been low,
and you want to be more present with your kids — is that right?"
```

The label is in the rep's words, not the prospect's. It frames the prospect's situation as a *solvable problem* (not just a wish). The "is that right?" is non-negotiable — it forces the prospect to verbally commit to the framing the rep will build on.

If the prospect corrects the label ("not exactly, it's more about…"), the rep takes the correction and re-labels until they get a clean yes. This is good. It means the rep is calibrating the framing to the prospect's actual situation rather than projecting onto them.

## Stage 4: Yesterdays (identity contrast)

The exploration of past attempts and failures. This is where identity contrast gets built — the gap between who the prospect is now and who they want to become.

The rep extracts:
- Specific past attempts ("I noticed you've had other memberships before — what didn't work?")
- Duration ("how long did you stick with it?")
- Recency ("how long ago?")
- Why each attempt failed, in the prospect's own words
- A pattern the prospect themselves articulates

The rep then reframes the failures as not the prospect's fault — they were just missing a piece. This positions the rep as that missing piece without saying so directly.

A good yesterdays exploration takes 5–10 minutes and produces material the rep will reference repeatedly throughout the rest of the call. A rushed yesterdays produces vague material that cannot be referenced.

## The diagram (between yesterdays and workout — not a separately scored stage)

After yesterdays, the rep transitions to drawing a 12-month timeframe diagram. This is a delivery vehicle for value communication, not a discovery moment. The rep has gathered the material; the diagram is where they use it.

**Scoring note.** The diagram is a stage *of the call* — something the rep does — but it is **not a separately scored stage in the rubric**. Its underlying skills are evaluated through cross-cutting dimensions instead:

- Storytelling, metaphor, third-party framing, and timeframe construction are scored under the `value_communication` cross-cutting dimension.
- Whether the diagram referenced specific prospect details (the wedding, the daughter, the past failures) is scored under the `callback_discipline` cross-cutting dimension.

Scoring the diagram as its own stage would double-count what these dimensions already capture. When a diagram-rooted diagnostic flag triggers (e.g., `generic_diagram`, `no_callbacks_to_discovery`), assign it to whichever scored stage its consequences MOST disrupted — typically `pre_frame_guarantees` or `close`. See `rubric/diagnostic-flags.md` for the assignment rule.

The nine scored stages are therefore: `pre_frame`, `asks`, `needs`, `yesterdays`, `workout`, `pre_frame_guarantees`, `price_anchor`, `close`, `reinforce`.

The diagram has three labeled phases plus a lifestyle commitment:

- **Months 1–3: Foundation.** The rep ties this to the prospect's specific physical situation (postural imbalances, injury rehab, work capacity). Uses the building-a-house analogy. Focuses on the prospect's specific weak points.
- **Months 4–10: Results.** The rep paints a future image grounded in the prospect's stated identity (their kids, their wedding, their hobby). Stories, not feature lists. Then invokes social proof: "from the hundreds of clients I've worked with, people training 3–4x per week start seeing impressive results around six months in." This pre-loads the high-frequency package recommendation.
- **Months 7–9: Human nature dip.** The rep introduces the statistic ("95% of people lose weight, 6 out of 7 fail to keep it off") and the Netflix accountability metaphor. This pre-handles the consistency objection by letting the prospect themselves articulate that lack of accountability has been the missing piece.
- **1+ year: Lifestyle commitment.** The rep paints two outcomes — maintenance or obsession — wrapping the future image.

The diagram is approximately 10–15 minutes. A rep who delivers it generically (without tying it to the specific prospect) has wasted the stage.

## Stage 5: Workout

The rep takes the prospect onto the gym floor and runs a personalized mini-workout. This is where rapport gets built kinesthetically. The rep makes the workout fun, ties exercises back to the prospect's stated goals and weaknesses, and ideally produces a moment where the prospect surprises themselves (improving an injury, executing a movement they thought they couldn't).

The workout ends with a verbal pre-frame for the close: "this is our last superset. Once we finish, we'll head back to the office and I'll answer any last questions you have, review our workout, and I'd love to show you what we have to offer."

## Stage 6: Pre-frame guarantees

Back in the office, the rep does not sit across from the prospect (collaborative seating, not adversarial). They ask a few transition questions ("how'd that workout feel?" "can you see how this leads to your goals?") and then pre-frame the guarantees *before* showing price.

The guarantees include:
- Fully customized workout programs
- Personalized meal plans with grocery lists
- Monthly body composition scans
- Money-back guarantee if expectations are not met

The rep walks through these with conviction. The point is to load value before price.

## Stage 7: Price anchor

The rep gives a professional recommendation grounded in the qualifying material:

```
"Honestly, based on everything you shared, I'd recommend 4x/week —
that's where we see the biggest transformation in energy, strength, and confidence."
```

Then they show all options, with 4x as the anchor. The recommendation is not arbitrary — it ties back to what the prospect said they wanted. The rep does not recommend 4x if it is genuinely inappropriate for the prospect.

## Stage 8: Close

The rep asks for the sale and then is silent. Two acceptable closing styles:

- **Soft close**: rep leaves the room briefly to make a copy of the workout, returns, says "ready to get started?" and stares.
- **Hard close**: rep stays in the room, says "ready to get started?" and counts in their head while waiting.

Either way, the rep does not speak first after asking for the sale. The 5–8 seconds of silence is uncomfortable for both parties but it is the silence that produces the close. A rep who fills the silence has undermined their own ask.

If the prospect goes for the lowest package (1x), the rep does not settle. They reframe and push for a higher frequency, since 1–2x training is materially less effective than 3–4x for most goals.

## Stage 9: Reinforce

Once the sale is made, the rep:
- Shows excitement
- Signs the prospect up immediately (does not keep chatting, which can lose the sale)
- Collects EFT payment ("would you prefer savings or checking?" not "card or account?")
- Walks through contract policies, reframing any negative ("we have a 50% cancellation fee, but you can pause your payments for up to three months per year — we do this as a commitment to you")
- Ends with a high-five, excitement, and a copy of the workout
- Sends a personalized video thank-you message after the consultation

If the consultation was a no-close, the rep still sends a thank-you message. The relationship continues.

## How to use this map when analyzing

When you read a transcript:

1. Identify which stage each section belongs to. Stages may merge or compress, but the sequence is reliable. Pay attention to skipped stages.
2. Score each stage against the criteria in `rubric/stages.md`.
3. Watch for cross-cutting patterns (label-and-confirm, callbacks, mirroring) using `rubric/cross-cutting-dimensions.md`.
4. Note diagnostic flags as they trigger using `rubric/diagnostic-flags.md`.
5. Use the arc of the call to predict the outcome bucket using `rubric/outcome-buckets.md`.

A skilled consultation moves through these stages with discipline but feels conversational. A poor consultation either rushes the stages (leaving foundations weak) or executes them mechanically (going through motions without depth). The rubric helps you tell which.
