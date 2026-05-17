# Coaching Message Format

The coaching message is the human-readable output the rep actually reads. It is delivered via Slack DM (or equivalent channel) immediately after the analysis completes.

## Design principles

**Short.** Under 200 words. Reps will not read more. If they do read more, they will not remember more.

**Specific.** Every claim is grounded in a transcript moment. No vague encouragement. No generic critique.

**Actionable.** The rep should finish reading and know exactly what to drill next, why, and what success looks like.

**Honest.** If the rep was bad, say so. If they were good, say that. The point is to make them better, not to manage their feelings. Reps stop trusting feedback that is uniformly positive — flattery is a trust-killer.

**Coach tone, not consultant tone.** A coach who has watched the game film and is helping someone get better. Direct, warm, specific. Not a corporate evaluation.

## Required structure

The message has three components, in this order:

### 1. The win (one specific thing the rep did well)

Open with a genuine win. This is not flattery — it is the actual best moment in the call, with the exact quote.

```
Strong moment: when [prospect name] said [paraphrase], you came back with
"[exact quote]" — that landed and you could hear them open up.
```

The win must be specific. "You built good rapport" is not a win. "When she said her daughter's wedding was in May, your callback to that during the future image was the moment her energy shifted" is a win.

If the rep was genuinely weak across the entire call and there is no real win to highlight, do not invent one. Instead, open with: "Tough one — let's talk about it." Then go directly to the weakness. False positives damage trust faster than honest critique.

### 2. The weakness (one specific moment where the call broke down)

The single highest-leverage failure, with the exact moment.

```
Where it broke down: at [timestamp/section], [prospect] said [their words].
You moved past it without [specific thing — digging, labeling, etc].
That's where the [downstream consequence] started.
```

Two principles:
- **Pick one weakness, not three.** The primary training focus from the structured analysis. Multiple weaknesses overwhelm and dilute focus.
- **Trace the consequence.** Help the rep see the chain — this missed moment caused this downstream problem. The chain is what makes the feedback feel diagnostic rather than punitive.

### 3. The drill (the practice action, with success criteria)

The specific thing the rep practices next, why, and what done-right looks like.

```
This week, drill: [skill]. The version that needs work: [specific failure mode].
Done right: [what success looks like in the next call].
```

The drill should be small enough to actually practice (one skill, one pattern), specific enough to recognize when it's improved, and connected to the weakness above.

## Optional component: score summary

After the three required components, include a brief score summary so the rep can see the full picture without leaving the message:

```
Scores at a glance:
Asks 4 / Needs 6 / Yesterdays 5 / Diagram (callbacks) 3
Qualifying depth 4 / Callback discipline 3 / Value communication 5
```

Show only the lowest-scoring stages and dimensions (under 6). Do not list everything — the message becomes a wall of numbers and the rep skims past the actionable parts.

## What not to do

A few patterns that consistently fail:

**Do not list everything that was wrong.** If the rep had eight weaknesses, picking one is the analyzer's job. The message picks the one with the most leverage.

**Do not soften the critique with hedging.** "Maybe it could have been a little better if perhaps you considered…" reads as condescending. Direct: "You moved past her vulnerability without acknowledging it. That broke the trust thread."

**Do not use jargon from the rubric.** The rep does not read SKILL.md. They don't know what `callback_discipline` means as a dimension name. Translate: "you didn't reference what she told you earlier."

**Do not include the full JSON structure.** That is for downstream systems. The rep gets the human message.

**Do not apologize for the feedback.** "I know this is harsh, but…" undercuts the message. Just say it.

**Do not end with motivational filler.** "You've got this!" does not earn its place. End with the drill — the rep finishes reading and knows what to do next.

## Format for delivery

When delivered via Slack, the format uses Block Kit for visual structure but the underlying content follows the rules above. A typical Slack message:

```
🎯 Consultation review: [prospect name] - [outcome]

✅ Strong moment
[Specific win with exact quote]

⚠️ Where it broke down
[Specific weakness with transcript moment and downstream consequence]

🔄 Drill this week
[Skill, specific failure mode, success criteria]

📊 Lowest scores
[1-3 stage/dimension scores below 6, with one-line note each]

[Buttons: "View full analysis" / "Schedule role-play"]
```

The buttons connect to the structured analysis (full JSON view) and the roleplay app (which receives the scenario seed).

## Example coaching messages

### Example 1: Sold-2x, callback weakness

```
🎯 Consultation review: Sarah M. — sold 2x/week

✅ Strong moment
At minute 12, Sarah opened up about her daughter's wedding in May. You let
her finish, then said "that's a real timeline — let's make this real for you."
Her energy visibly shifted there.

⚠️ Where it broke down
During the diagram (around 38:00), you delivered the results phase generically.
Sarah's wedding never came back. Her daughter never came back. The future
image you painted could have been for anyone. That's where the 4x became 2x —
she didn't feel implicated in the outcome you were describing.

🔄 Drill this week
Callback discipline during the diagram. After yesterdays, pick 2-3 specific
details you can callback to. Say them out loud during the results phase.
Done right: in the next consult, the future image is unrepeatable — it works
only for that specific person.

📊 Lowest scores
Callback discipline 3 / Value communication 5 / Identity contrast 4
```

### Example 2: Not-sold-think-about-it, qualifying weakness

```
🎯 Consultation review: Mike R. — not sold (think about it)

✅ Strong moment
Your close was clean — direct ask, you held the silence. That part is muscle.

⚠️ Where it broke down
First five minutes. Mike said "I want to get in shape" and you moved straight
to the workout. No "why now," no consequence question, no exploration of
what's actually driving him to be there. Everything that followed was built
on a goal you never confirmed mattered to him. The "think about it" was him
telling you he didn't have a strong enough reason to act today.

🔄 Drill this week
Asks depth. The skill: when the prospect says a surface goal, ask three more
questions before you accept it. At least one of them should be "what happens
if nothing changes?" Done right: in the next consult, you reach an emotional
driver — something tied to his kids, his fear, his identity — before you
move to the workout.

📊 Lowest scores
Asks 3 / Qualifying depth 4 / Identity contrast 3
```

### Example 3: Sold-4x, strong call

```
🎯 Consultation review: Jen K. — sold 4x/week

✅ Strong moment
The label-and-confirm at minute 8 was textbook. You said "so what I'm hearing
is you want to feel like yourself again before your son's graduation in June —
is that right?" She said yes. Everything after that was building on solid ground.

⚠️ Where it broke down
Honestly, very little. The one thing: at minute 52, after she agreed, you
re-explained the meal plan feature one more time. That was unnecessary — the
sale was made. Watch for the impulse to keep selling after the yes.

🔄 Drill this week
Momentum preservation. Once you get the yes, move to logistics within the next
sentence. No new features, no re-explanations. Done right: the time from
"yes" to "would you prefer savings or checking?" is under 30 seconds.

📊 Lowest scores
Momentum preservation 6 (otherwise mostly 7-8 across the board)
```

## When the rep is consistently strong

If a rep scores 7+ across most dimensions and there is no obvious primary weakness, the message can be brief:

```
🎯 Consultation review: [name] — [outcome]

Solid call. The label-and-confirm at minute 11 was strong, and you held
the silence at the close. Nothing major to drill — keep doing what you're doing.

One thing to keep an eye on: [minor note, if anything stands out].
```

Do not invent weaknesses to give the rep something to work on. If there isn't a meaningful one, say so. This is part of why honest feedback gets trusted — it tells the rep when they're genuinely doing well.
