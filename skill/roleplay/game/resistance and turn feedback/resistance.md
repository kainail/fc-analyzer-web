# Resistance Rules — Claude Skill

## Overview

Resistance is the numerical representation of how guarded the prospect
is. It starts at a value determined by the prospect's archetype and
difficulty modifiers. It moves up and down based on the rep's moves
each turn. The session ends when resistance reaches 0 (win) or 100
(loss — walkout) or when the turn limit is exceeded (loss — timeout).

This file defines exactly how resistance changes. Every turn, after
the rep responds, you calculate a resistance_delta and return it in
your JSON output. The frontend applies the delta to the current
resistance value.

---

## Starting Resistance by Archetype

| Archetype                  | Starting Resistance |
|----------------------------|---------------------|
| The Busy Professional      | 55                  |
| The Skeptic                | 65                  |
| The Enthusiast             | 35                  |
| The Decision Maker Blocker | 50                  |
| The Price Shopper          | 60                  |
| The Ghost                  | 70                  |

---

## Difficulty Modifier Adjustments

Applied on top of archetype starting resistance before the session begins.

| Modifier                        | Starting Resistance Adjustment |
|---------------------------------|-------------------------------|
| High skepticism                 | +10                           |
| Time pressure                   | +5                            |
| Decision maker objection likely | +8                            |
| Emotionally closed              | +12                           |
| Highly motivated                | -10                           |
| Prior positive experience       | -8                            |
| Referred by friend              | -15                           |

Maximum starting resistance after modifiers: 85.
Minimum starting resistance after modifiers: 20.
Clamp to these values if modifiers push beyond them.

---

## Resistance Delta by Move Quality

### Strong move: -10 to -20

A strong move is one that executes the rubric criteria for the current
drill stage at a 7+ level. It advances the conversation meaningfully,
surfaces new information, or creates genuine emotional leverage.

Award -10 for a clean strong move.
Award -15 for a strong move that also includes a callback to something
the prospect said earlier.
Award -20 for a strong move that surfaces the emotional driver or
achieves a breakthrough moment (label confirmed, consequence frame
lands, missing-piece reframe accepted).

The -20 delta should be rare — reserve it for moments that would score
9+ on the rubric.

### Competent move: -3 to -7

A competent move executes the basics correctly but without depth or
precision. It does not damage the conversation but does not create
significant leverage either.

Award -3 for a technically correct move that is generic.
Award -5 for a competent move that shows awareness of the prospect's
situation without fully leveraging it.
Award -7 for a competent move that almost reaches strong — one element
missing from excellence.

### Weak move: +5 to +10

A weak move misses key rubric criteria, creates a gap the prospect
notices (even if they don't name it), or fails to advance the stage.

Award +5 for a weak move that is inoffensive but unhelpful.
Award +8 for a weak move that reveals the rep is following a script
rather than listening (e.g. asking the next question before
acknowledging the answer to the last one).
Award +10 for a weak move that signals shallow engagement — the
prospect feels unheard.

### Critical move: +15 to +25

A critical move actively damages the call. The prospect's guard goes
up because of something the rep did, not despite their best efforts.

Award +15 for a move that violates a core rubric principle (pitching
before qualifying, stacking questions, projecting a reason for failure).
Award +20 for a move that directly triggers the prospect's objection
pattern (mentioning price before value is built for a Price Shopper,
missing the decision maker preemptively for a Decision Maker Blocker).
Award +25 for a move that would be used as a negative teaching example
— the rep is actively making the situation worse with each word.

---

## Archetype-Specific Resistance Rules

These rules override the base deltas above in specific situations.

### The Busy Professional
- Extended rapport (rep spends more than 2 turns on small talk before
  qualifying): +15 override, regardless of move quality
- Direct, confident transition into qualifying: additional -5 bonus
  on top of base delta

### The Skeptic
- Unsubstantiated claim by rep ("we're the best", "most people see
  results in 2 weeks"): +20 override
- Rep acknowledges uncertainty honestly ("I don't know your exact
  timeline — it depends on..."): additional -5 bonus
- Trust threshold: until the rep has surfaced one concrete yesterday
  AND the prospect has articulated their own pattern, all strong
  moves yield a maximum of -8 (not -10 to -20)
- After trust threshold met: normal delta rules apply

### The Enthusiast
- Surface agreement from the prospect does not count as resistance
  dropping. Resistance only drops when the rep asks a question that
  gets beneath the surface goal.
- If rep attempts a close before emotional driver is surfaced:
  resistance spikes to 65 regardless of current value (the facade drops)
- After emotional driver is surfaced: resistance drops at 1.5x normal
  rate (the enthusiast converts fast once they're genuinely bought in)

### The Decision Maker Blocker
- Rep proactively asks about other decision makers before turn 5:
  resistance drops -20 immediately (rep earned trust)
- Price mentioned before decision maker objection addressed:
  resistance spikes +20 immediately
- If rep explicitly frames the decision as the prospect's to make
  ("you don't need anyone's permission to invest in yourself"):
  resistance drops -15 if said with genuine conviction, +5 if it
  feels like a pressure tactic

### The Price Shopper
- Price mentioned before value is personalized: resistance spikes +25
- Value personalized with a specific callback to prospect's identity:
  resistance drops -20 (one-time event — this is the conversion moment)
- Rep compares favorably to cheaper options without being dismissive
  of them: additional -5 bonus

### The Ghost
- All moves yield 50% of their normal delta until the emotional driver
  is surfaced (wall is up — progress is slow)
- When emotional driver is surfaced: one-time resistance drop of -30,
  regardless of how the rep surfaced it
- After the wall drops: normal delta rules apply at full value
- Rep fills silence after a meaningful Ghost statement: +15 override
  (the Ghost needed that pause — filling it signals the rep isn't
  really listening)

---

## Resistance Clamp Rules

Resistance cannot go below 0 or above 100.
If a delta would push resistance past either boundary, clamp to the
boundary value.

Resistance at 0: session ends in win — do not apply further deltas.
Resistance at 100: session ends in loss (walkout) — do not apply
further deltas.

---

## Turn Limit

The turn limit is derived from the seed's estimated_drill_duration_minutes:
one turn per minute of estimated duration.

Example: estimated_drill_duration_minutes = 8 → turn limit = 8 turns.

If the turn limit is reached before resistance hits 0 or 100:
session ends in loss (timeout). Partial XP is awarded.

The turn counter is tracked by the frontend and passed to you in the
session state each turn. You do not need to count turns yourself —
but you should be aware that as turns increase and resistance has not
moved significantly, the session is drifting toward timeout.

---

## How to Calculate and Return the Delta

After each rep turn, evaluate the move against the rubric criteria for
the drill stage. Then:

1. Classify the move: strong / competent / weak / critical
2. Select the base delta from the ranges above
3. Apply any archetype-specific overrides
4. Return the delta in your JSON output (see output/schema.md)

Be precise. Do not award -15 for a move that is merely competent.
Do not award +20 for a move that is merely weak. The delta is the
most important signal in the game — it must be calibrated carefully
or the resistance mechanic loses meaning.

When in doubt, ask: would this move score 7+ on the rubric? If yes,
it is strong. Would it score 4–6? Competent. Below 4? Weak.
Would it actively set the call back? Critical.
