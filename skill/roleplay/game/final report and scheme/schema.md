# Output Schema — Claude Skill

## Overview

Every response you return during a roleplay session must be valid JSON
wrapped in sentinel markers. The frontend parses this JSON to update
the game state — resistance bar, floating labels, dialog box, animations.

Malformed JSON or missing fields will break the game. Follow this
schema exactly on every turn.

---

## Sentinel Markers

Every response must begin and end with these markers:

```
===ROLEPLAY_TURN_START===
{ ...json... }
===ROLEPLAY_TURN_END===
```

For the final report:
```
===ROLEPLAY_REPORT_START===
{ ...json... }
===ROLEPLAY_REPORT_END===
```

Do not include any text outside the sentinel markers.
Do not include markdown code fences (``` or ```json).
Do not add commentary, preamble, or explanation.

---

## Turn Response Schema

Returned after every rep turn during the session.

```json
{
  "turn": 3,
  "phase": "prospect_response",
  "prospect_line": "I mean, I've tried the gym before. It just never sticks.",
  "resistance_delta": -8,
  "resistance_after": 47,
  "floating_label": "STRONG",
  "turn_feedback": "Good follow-up — you asked why it didn't stick instead of moving on. That question is what opened this.",
  "animation": "flinch",
  "session_state": {
    "resistance": 47,
    "turn": 3,
    "turn_limit": 8,
    "outcome": null,
    "wall_dropped": false
  },
  "multiple_choice_options": null
}
```

### Field definitions

**turn** (integer)
Current turn number. Starts at 1 on the first prospect line.
Increments by 1 on each rep response.

**phase** (string)
Always "prospect_response" for normal turns.
"session_end_win" when resistance reaches 0.
"session_end_loss_walkout" when resistance reaches 100.
"session_end_loss_timeout" when turn limit is reached.
"session_end_draw" when the conversation reaches a dead end.

**prospect_line** (string)
What the prospect says this turn. Stay in character.
1–4 sentences maximum. Match archetype speech patterns.
On session_end phases: the prospect's final line before the
session closes (exit line for loss, readiness signal for win).

**resistance_delta** (integer)
Positive = resistance went up (bad). Negative = resistance went down (good).
Range: -25 to +25. See prospect/resistance.md for calculation rules.
Must be 0 on the very first turn (session open — no rep move yet).

**resistance_after** (integer)
resistance_before + resistance_delta, clamped to 0–100.
The frontend uses this as the source of truth for the bar display.

**floating_label** (string)
One of: "STRONG" | "COMPETENT" | "WEAK" | "CRITICAL" | null
null on the first turn (no rep move to evaluate yet).

**turn_feedback** (string | null)
1–2 sentences of coaching whisper. See scoring/turn-feedback.md.
null on the first turn.

**animation** (string)
Which prospect animation to trigger this turn.
One of: "idle" | "speaking" | "flinch" | "hardening" | "leaving" | "converted"

Rules:
- resistance_delta <= -10: "flinch"
- resistance_delta >= +10: "hardening"
- resistance_delta between -9 and +9: "speaking"
- session_end win: "converted"
- session_end loss: "leaving"
- Default: "speaking"

Special: The Ghost's wall drop (flinch-3 breakthrough) is signaled by
setting animation to "flinch_breakthrough" — this triggers the palette
shift effect in the frontend.

**session_state** (object)
Current game state after this turn is applied.

  resistance (integer): current resistance value after delta
  turn (integer): current turn number
  turn_limit (integer): maximum turns before timeout
  outcome (string | null): null during session, "win" | "loss_walkout" |
    "loss_timeout" | "draw" when session ends
  wall_dropped (boolean): true only for The Ghost after flinch_breakthrough
    fires — tells the frontend to hold the open palette

**multiple_choice_options** (array | null)
null for text and voice modes.
For multiple choice mode: array of exactly 4 option objects.

```json
"multiple_choice_options": [
  {
    "id": "a",
    "text": "So what made you decide to look into this now?",
    "internal_quality": "strong"
  },
  {
    "id": "b",
    "text": "What are your fitness goals?",
    "internal_quality": "competent"
  },
  {
    "id": "c",
    "text": "How often do you work out currently?",
    "internal_quality": "weak"
  },
  {
    "id": "d",
    "text": "Have you considered that you might just need more motivation?",
    "internal_quality": "critical"
  }
]
```

internal_quality is used only in the final report to reveal which
options were which. It is NOT sent to the frontend during the session
(strip it server-side before sending to the client). The rep must not
see the quality labels while choosing.

Options must be shuffled — do not always put the strong option first.
Options must be realistic — the weak and critical options should be
plausible mistakes a real rep might make, not obviously wrong choices.

---

## Session Open Schema

The very first turn of every session — before the rep has responded —
uses a simplified schema:

```json
{
  "turn": 1,
  "phase": "session_open",
  "prospect_line": "Hey, yeah — I saw the sign outside. I've been thinking about getting a trainer for a while.",
  "resistance_delta": 0,
  "resistance_after": 55,
  "floating_label": null,
  "turn_feedback": null,
  "animation": "speaking",
  "session_state": {
    "resistance": 55,
    "turn": 1,
    "turn_limit": 8,
    "outcome": null,
    "wall_dropped": false
  },
  "multiple_choice_options": [
    { "id": "a", "text": "...", "internal_quality": "strong" },
    { "id": "b", "text": "...", "internal_quality": "competent" },
    { "id": "c", "text": "...", "internal_quality": "weak" },
    { "id": "d", "text": "...", "internal_quality": "critical" }
  ]
}
```

The opening prospect_line should match the prospect's archetype and
the consultation_date context from the seed. It is the prospect's
natural opening — what they say when the rep sits down with them.

For multiple choice mode, the four options on turn 1 are the rep's
possible opening moves. Choose options that differentiate between
reps who open with qualifying versus reps who open with pitching.

---

## Final Report Schema

Returned when the frontend sends a final_report_request.
See scoring/final-report.md for content rules.

```json
{
  "session_summary": {
    "outcome": "win",
    "mode": "text",
    "total_turns": 7,
    "final_resistance": 0,
    "starting_resistance": 55,
    "strong_moves": 4,
    "competent_moves": 2,
    "weak_moves": 1,
    "critical_moves": 0,
    "longest_strong_streak": 3,
    "xp_earned": 215
  },
  "stage_objective": {
    "stage": "asks",
    "objective": "Surface the emotional why through follow-up questioning",
    "status": "met",
    "status_reasoning": "Rep reached the emotional driver on turn 5 after three follow-ups and a clean consequence frame."
  },
  "best_moment": {
    "turn": 4,
    "rep_said": "What happens if a year goes by and nothing changes?",
    "why_it_worked": "Consequence frame delivered at exactly the right moment. The silence after landed and the prospect answered with the real reason.",
    "rubric_principle": "Consequence framing is a Stage 2 requirement for a 7+ score."
  },
  "worst_moment": {
    "turn": 6,
    "rep_said": "So what have you tried before, how long did you stick with it, and why do you think it didn't work?",
    "what_went_wrong": "Three questions stacked in one turn after the prospect had just opened up. She gave a one-word answer and pulled back.",
    "what_to_do_instead": "Ask exactly one question per turn. After an emotional answer, ask about what they just said — not the next item on your list."
  },
  "primary_fix": {
    "skill": "One question at a time",
    "stage": "asks",
    "pattern_observed": "Question stacking appeared twice in this session, both times after a meaningful prospect answer. The rep knows the right questions — they are not yet trusting the process of asking one at a time.",
    "drill_instruction": "In your next session, count your question marks before sending any turn. If there is more than one, cut until there is one. No exceptions.",
    "success_looks_like": "Prospect answers with more than one sentence without being prompted again."
  },
  "next_drill_recommendation": {
    "recommendation": "same_stage_harder",
    "stage": "asks",
    "reasoning": "Stage objective was met but the stacking pattern will undermine Stage 3 if not fixed. Repeat with The Ghost — short answers will make the stacking temptation obvious.",
    "suggested_archetype": "The Ghost",
    "suggested_difficulty_modifiers": ["Emotionally closed", "High skepticism"]
  },
  "pattern_note": null
}
```

---

## Payload Sent to Claude Each Turn

For reference — this is what the frontend sends you on each turn:

```json
{
  "seed": { ...full roleplay_scenario_seed... },
  "archetype": "The Skeptic",
  "mode": "text",
  "starting_resistance": 65,
  "difficulty_modifiers": ["High skepticism"],
  "turn_limit": 8,
  "history": [
    { "role": "prospect", "content": "...", "turn": 1 },
    { "role": "rep", "content": "...", "turn": 1 },
    { "role": "prospect", "content": "...", "turn": 2 },
    { "role": "rep", "content": "...", "turn": 2 }
  ],
  "current_resistance": 52,
  "current_turn": 3,
  "wall_dropped": false,
  "rep_turn": "So when you say it never stuck — what do you think got in the way?",
  "request_type": "turn" | "final_report"
}
```

request_type "turn": process the rep_turn and return a turn response.
request_type "final_report": generate the final report. rep_turn will
be null. history contains the full session.

---

## Validation Rules

Before returning any response, verify:

1. JSON is valid and complete — no trailing commas, no missing braces
2. resistance_after equals previous resistance + resistance_delta,
   clamped to 0–100
3. floating_label matches the resistance_delta direction and magnitude
   (a -20 delta should not have a WEAK label)
4. animation matches the delta rules defined above
5. multiple_choice_options has exactly 4 items in multiple choice mode,
   null in text and voice modes
6. internal_quality values are present on all options but will be
   stripped server-side
7. turn_feedback is 1–2 sentences — count them before returning
8. prospect_line is in character and matches archetype speech patterns

If any validation fails, fix it before returning. A broken JSON
response crashes the game for the rep mid-session.
