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

---

## Resistance Delta by Move Quality

### Strong move: -10 to -20
Award -10 for a clean strong move.
Award -15 for a strong move that includes a callback.
Award -20 for a breakthrough moment (emotional driver surfaced,
label confirmed, consequence frame lands).
The -20 delta should be rare.

### Competent move: -3 to -7
Award -3 for a technically correct but generic move.
Award -5 for a competent move with some situational awareness.
Award -7 for a move that almost reaches strong.

### Weak move: +5 to +10
Award +5 for a weak but inoffensive move.
Award +8 for a move that reveals script-following over listening.
Award +10 for a move that signals shallow engagement.

### Critical move: +15 to +25
Award +15 for violating a core rubric principle.
Award +20 for directly triggering the prospect's objection pattern.
Award +25 for a move that actively makes the situation worse.

---

## Archetype-Specific Resistance Rules

### The Busy Professional
- Extended rapport beyond 2 turns: +15 override
- Direct confident transition into qualifying: additional -5 bonus

### The Skeptic
- Unsubstantiated claim: +20 override
- Rep acknowledges uncertainty honestly: additional -5 bonus
- Trust threshold: until one concrete yesterday is surfaced AND
  prospect articulates their own pattern, all strong moves yield
  maximum -8. After threshold: normal rules apply.

### The Enthusiast
- Surface agreement does not count as resistance dropping
- Close attempt before emotional driver surfaced: resistance spikes to 65
- After emotional driver surfaced: resistance drops at 1.5x normal rate

### The Decision Maker Blocker
- Rep asks about decision makers before turn 5: -20 immediately
- Price mentioned before decision maker addressed: +20 immediately
- Rep frames decision as prospect's to make (genuine): -15

### The Price Shopper
- Price mentioned before value personalized: +25
- Value personalized with specific identity callback: -20 (one-time)
- Rep compares favorably to cheaper options without dismissing: -5 bonus

### The Ghost
- All moves yield 50% of normal delta until emotional driver surfaced
- Emotional driver surfaced: one-time -30 regardless of how surfaced
- After wall drops: normal delta rules at full value
- Rep fills silence after meaningful Ghost statement: +15 override

---

## Resistance Clamp Rules

Resistance cannot go below 0 or above 100.
Resistance at 0: session ends in win.
Resistance at 100: session ends in loss (walkout).

---

## Turn Limit

Turn limit = seed's estimated_drill_duration_minutes (1 turn per minute).
If turn limit reached before 0 or 100: session ends in loss (timeout).

---

## How to Calculate and Return the Delta

1. Classify the move: strong / competent / weak / critical
2. Select base delta from ranges above
3. Apply archetype-specific overrides
4. Return delta in JSON output per output/schema.md

When in doubt: would this move score 7+ on the rubric? Strong.
4-6? Competent. Below 4? Weak. Sets the call back? Critical.
