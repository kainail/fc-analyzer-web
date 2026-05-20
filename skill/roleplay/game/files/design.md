# FC Roleplay — Game Design Document

## Concept

A turn-based RPG battle system for drilling personal training sales consultations.
The rep plays as a sales consultant facing a prospect character. The prospect has
a Resistance bar (analogous to HP) that depletes as the rep executes strong
technique. The goal is to reduce Resistance to zero — which represents the
prospect reaching a genuine buying decision — before the prospect walks out.

The visual style is Gameboy-era pixel art: 4-color palette per scene, chunky
bitmap fonts, scanline overlay, no gradients. Every element fits within a
160×144 virtual resolution scaled up to fill the screen.

---

## Game Loop

```
Seed loaded
    ↓
Mode select screen (Multiple Choice / Text / Voice)
    ↓
Battle intro (prospect sprite animates in, name plate appears)
    ↓
[TURN LOOP]
  Prospect speaks (dialog box, typewriter effect)
      ↓
  Rep responds (based on mode)
      ↓
  Claude evaluates response
      ↓
  Resistance adjusts + turn feedback floats on screen
      ↓
  Repeat until WIN or LOSE condition
    ↓
Post-battle XP screen
    ↓
Full coaching report
```

---

## Win / Lose Conditions

### Win
- Prospect Resistance reaches 0
- Triggered when the rep successfully completes the stage objective defined
  in the roleplay_scenario_seed's success_definition field
- Victory animation plays, prospect sprite changes to "converted" pose

### Lose — Walkout
- Prospect Resistance reaches MAX (100)
- Prospect sprite plays "leaving" animation
- Dialog: prospect gives their exit line based on their archetype
- Triggers post-battle report with loss framing

### Lose — Time Out
- Rep exceeds the estimated_drill_duration_minutes from the seed (converted
  to turns: roughly 1 turn per minute)
- Prospect sprite plays "impatient" animation
- Dialog: "I actually have to get going..."
- Triggers post-battle report with timeout framing

### Draw — Dead End
- Claude determines the conversation has reached an unrecoverable state
  (rep made 3+ consecutive weak moves, prospect is fully disengaged)
- Claude surfaces this explicitly rather than letting the session limp on
- Triggers post-battle report with dead-end framing

---

## Resistance Mechanics

Resistance starts at 50 (neutral prospect, neither sold nor walking).

### Resistance goes DOWN (good) when:
- Rep asks a strong follow-up question that surfaces new emotional content
- Rep executes a callback to something the prospect said earlier
- Rep holds silence after an ask
- Rep reframes a failure without projecting
- Rep delivers a clean label-and-confirm

### Resistance goes UP (bad) when:
- Rep answers a question that should be a question
- Rep pitches before qualifying
- Rep stacks questions
- Rep fills silence after the ask
- Rep accepts a surface objection without probing
- Rep apologizes for price

### Resistance change per turn
- Strong move: -10 to -20 depending on leverage
- Competent move: -5
- Weak move: +5 to +10
- Damaging move: +15 to +20

### Difficulty modifiers from seed
The seed's difficulty_modifiers field adjusts starting resistance and
the rate of resistance change:
- "High skepticism" → starts at 65
- "Time pressure" → lose condition triggers 20% sooner
- "Decision maker objection likely" → resistance spikes +15 on any price mention
- "Emotionally closed" → strong moves only yield -5 until the emotional why is reached

---

## Turn Structure

Each turn has four phases:

1. **Prospect speaks** — Claude generates the prospect's line in character,
   based on current resistance level and conversation history.
   High resistance → more guarded, shorter answers.
   Low resistance → more open, volunteering information.

2. **Rep responds** — input method depends on mode selected.

3. **Evaluation** — Claude scores the rep's move internally (not shown in full).
   Returns: resistance_delta, turn_feedback (1-2 sentences), floating_label
   (one of: STRONG / COMPETENT / WEAK / CRITICAL).

4. **Feedback display** — floating_label and resistance change animate on screen.
   turn_feedback appears in a small coaching whisper box below the battle field,
   visible for 4 seconds before fading.

---

## Multiple Choice Mode

Claude generates 4 response options for the rep each turn:
- One strong move (correct technique)
- One competent move (acceptable but not optimal)
- One weak move (common mistake)
- One damaging move (clearly wrong)

Options are not labeled — the rep must identify the right move.
After selection, the chosen option is evaluated and resistance adjusts.
Post-battle report reveals which options were which.

---

## Text Mode

Rep types their response freely. No options shown.
Claude evaluates the free text against the rubric for the stage being drilled.
Same resistance mechanics apply.

---

## Voice Mode

Rep records audio. Whisper transcribes it.
Transcription is shown in the dialog box (so the rep can confirm it was
heard correctly before evaluation).
Same evaluation path as text mode after transcription.

---

## Outcome Screens

### Victory
```
★ CONSULTATION COMPLETE ★

[Prospect sprite — converted pose]

[Prospect name] joined at [frequency]x/week

XP GAINED: [amount]
TECHNIQUE BONUS: [amount if strong execution]
STREAK BONUS: [amount if consecutive strong moves]

TOTAL: [XP]
```

### Defeat — Walkout
```
✗ PROSPECT LEFT

[Prospect sprite — leaving pose]

"[Archetype-specific exit line]"

XP GAINED: [partial amount — you still learn from losses]
```

### Post-battle coaching report
Full structured report generated by Claude covering:
- Stage objective: met / partially met / not met
- Strongest moment in the session (with turn reference)
- Weakest moment (with turn reference)
- Primary thing to fix before next drill
- Recommended next drill (same stage harder difficulty, or next stage)

---

## Progression System

See game/progression.md for full XP and leveling details.

## Battle Screen Layout

See game/ui.md for pixel art layout spec.

## Sprites and Animations

See game/sprites.md and game/animations.md for prospect archetypes and
visual state definitions.
