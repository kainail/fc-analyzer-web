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

Turn responses:
  ===ROLEPLAY_TURN_START===
  { ...json... }
  ===ROLEPLAY_TURN_END===

Final report:
  ===ROLEPLAY_REPORT_START===
  { ...json... }
  ===ROLEPLAY_REPORT_END===

Do not include any text outside the sentinel markers.
Do not include markdown code fences.
Do not add commentary, preamble, or explanation.

---

## Turn Response Schema

```json
{
  "turn": 3,
  "phase": "prospect_response",
  "prospect_line": "I mean, I've tried the gym before. It just never sticks.",
  "resistance_delta": -8,
  "resistance_after": 47,
  "floating_label": "STRONG",
  "turn_feedback": "Good follow-up — you asked why it didn't stick instead of moving on.",
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

turn — integer, current turn number, starts at 1
phase — "prospect_response" | "session_end_win" | "session_end_loss_walkout" | "session_end_loss_timeout" | "session_end_draw"
prospect_line — what the prospect says, 1-4 sentences, in character
resistance_delta — integer -25 to +25, 0 on first turn
resistance_after — resistance_before + delta, clamped 0-100
floating_label — "STRONG" | "COMPETENT" | "WEAK" | "CRITICAL" | null
turn_feedback — 1-2 sentences | null on first turn
animation — "idle" | "speaking" | "flinch" | "hardening" | "leaving" | "converted" | "flinch_breakthrough"

Animation rules:
  resistance_delta <= -10: "flinch"
  resistance_delta >= +10: "hardening"
  resistance_delta between -9 and +9: "speaking"
  session end win: "converted"
  session end loss: "leaving"
  Ghost wall drop: "flinch_breakthrough"

session_state fields:
  resistance — current value after delta
  turn — current turn number
  turn_limit — max turns before timeout
  outcome — null during session, "win" | "loss_walkout" | "loss_timeout" | "draw" when ended
  wall_dropped — true only after Ghost flinch_breakthrough

multiple_choice_options — null for text/voice, array of 4 for multiple_choice:
```json
[
  { "id": "a", "text": "...", "internal_quality": "strong" },
  { "id": "b", "text": "...", "internal_quality": "competent" },
  { "id": "c", "text": "...", "internal_quality": "weak" },
  { "id": "d", "text": "...", "internal_quality": "critical" }
]
```
Options must be shuffled. internal_quality is stripped server-side before sending to client.

---

## Session Open Schema

First turn, request_type "session_open":
- resistance_delta: 0
- floating_label: null
- turn_feedback: null
- phase: "session_open"
- Generate prospect opening line matching archetype and seed context

---

## Final Report Schema

```json
{
  "session_summary": { ... },
  "stage_objective": { ... },
  "best_moment": { ... },
  "worst_moment": { ... },
  "primary_fix": { ... },
  "next_drill_recommendation": { ... },
  "pattern_note": null
}
```

See scoring/final-report.md for full field definitions.

---

## Payload Sent to Claude Each Turn

```json
{
  "seed": { ...roleplay_scenario_seed... },
  "archetype": "The Skeptic",
  "mode": "text",
  "starting_resistance": 65,
  "difficulty_modifiers": ["High skepticism"],
  "turn_limit": 8,
  "history": [
    { "role": "prospect", "content": "...", "turn": 1 },
    { "role": "rep", "content": "...", "turn": 1 }
  ],
  "current_resistance": 52,
  "current_turn": 3,
  "wall_dropped": false,
  "rep_turn": "So when you say it never stuck — what do you think got in the way?",
  "request_type": "turn"
}
```

request_type "turn": process rep_turn, return turn response
request_type "final_report": generate final report, rep_turn is null

---

## Validation Rules

Before returning any response verify:
1. JSON is valid and complete
2. resistance_after equals previous resistance + delta, clamped 0-100
3. floating_label matches delta direction and magnitude
4. animation matches delta rules
5. multiple_choice_options has exactly 4 items in multiple_choice mode
6. internal_quality present on all options
7. turn_feedback is 1-2 sentences
8. prospect_line is in character
