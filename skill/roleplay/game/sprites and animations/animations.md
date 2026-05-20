# Animation Timing & Progression

## Animation Timing Reference

All timings are in milliseconds. The virtual canvas runs at 30fps
(33ms per frame). All durations should be multiples of 33ms where
possible for clean frame alignment.

### Idle Animation
- Cycles between idle-1 and idle-2
- Frame duration: 800ms each
- Total cycle: 1600ms
- Runs continuously during prospect speaking phase and rep input phase
- Exception: The Ghost archetype holds idle-1 for 2400ms before switching
  (barely moves)

### Speaking Animation
- Cycles between speaking-1 and speaking-2 while typewriter text plays
- Frame duration: 200ms each
- Stops on final frame of typewriter effect (mouth closes)
- Returns to idle after ▼ indicator appears

### Flinch Animation (resistance drops)
- Plays once on each resistance drop event
- flinch-1: 100ms
- flinch-2: 100ms
- flinch-3: 200ms (hold before returning to idle)
- Total: 400ms
- Interrupts idle animation; returns to idle after completion
- Special: The Ghost flinch-3 (wall drop) holds for 800ms instead of 200ms
  and triggers a palette shift effect (see below)

### Hardening Animation (resistance rises)
- Plays once on each resistance rise event
- hardening-1: 150ms
- hardening-2: 300ms (hold — sulking)
- Returns to idle after
- Total: 450ms

### Leaving Animation (lose condition — walkout)
- Plays once, does not loop
- leaving-1: 300ms
- leaving-2: 300ms
- leaving-3: 400ms (hold on final frame)
- Screen fades to black after leaving-3 holds for 400ms

### Converted Animation (win condition)
- Loops after first play
- Each frame: 200ms
- Total loop: 800ms
- Plays continuously on victory screen

---

## Floating Label Animations

Floating labels (STRONG / COMPETENT / WEAK / CRITICAL) appear above
the prospect sprite and animate upward while fading.

```
Start position: x=center, y=48 (virtual)
End position:   x=center, y=24 (virtual)
Duration:       800ms
Easing:         ease-out (fast start, slow finish)
Opacity:        1.0 → 0.0 over full duration
```

Resistance delta numbers (e.g. "-15", "+10") float alongside labels:
- Offset 8px right of label
- Same timing and easing
- Color: bright green for negative delta (good), red for positive (bad)

CRITICAL label adds a horizontal shake before float:
- Shake: 3 cycles of ±4px horizontal, 50ms each = 300ms total
- Then float animation begins

---

## Palette Shift Effect (The Ghost — wall drop only)

When The Ghost's flinch-3 triggers (emotional why breakthrough):

1. Current palette fades to black over 200ms
2. New "open" palette fades in over 400ms:
     #0f1a2e → #1a3a5c → #4a7ab0 → #b0d4f5
   (dark navy to sky blue — warmer, more open)
3. Palette holds for remainder of session
4. All subsequent animations use the new palette

This is the only mid-session palette change in the game.
It is a significant visual signal to the rep: something shifted.

---

## Screen Transition Timings

### Battle Start
1. Black screen (pre-load): 200ms
2. Scanline wipe from top: 600ms (CSS animation)
3. Prospect sprite slides in from right: 300ms (translateX)
4. Name plate fades in: 200ms
5. Bars fade in: 200ms
6. First prospect line begins typewriter: 400ms after bars complete
Total intro to first dialog: ~1900ms

### Turn Transition (prospect → input)
1. ▼ indicator blinks 3 times: 600ms total
2. Dialog box content fades out: 150ms
3. Input zone content fades in: 150ms
Total: ~900ms

### Turn Transition (input → evaluation → prospect)
1. Rep's response text appears in dialog box: instant
2. Evaluation pause (Claude processing): variable — show animated dots
3. Floating label + delta appear: immediate on response
4. Flinch or hardening animation: 400–450ms
5. Bar drains/fills: 400ms (overlaps with animation)
6. Coaching whisper slides up: 150ms
7. Whisper visible: 4000ms
8. Whisper fades: 300ms
9. Dialog box clears, prospect next line begins: 200ms after whisper fade

### Battle End — Win
1. Screen flash white: 100ms
2. Fade to black: 500ms
3. Victory screen fades in: 400ms
4. XP counter rolls: 1500ms (ease-out)
5. Breakdown lines appear one by one: 300ms each

### Battle End — Lose (walkout)
1. Leaving animation plays: 1000ms total
2. Exit line appears in dialog box (typewriter): 1500ms
3. Screen fades to black: 800ms (slower — more somber)
4. Defeat screen fades in: 400ms

---

## Progression System

### XP Formula

Base XP per session:
  win:  150 XP
  loss: 90 XP (you still learn from losses)
  draw: 60 XP

Technique bonus (applied per strong/competent move):
  STRONG move:    +10 XP each
  COMPETENT move: +5 XP each
  WEAK move:      0 XP
  CRITICAL move:  -5 XP (but total never goes below 0)

Streak bonus (consecutive strong moves):
  3 in a row:  +15 XP
  5 in a row:  +30 XP
  7+ in a row: +50 XP

Difficulty modifier bonus (from seed):
  Each active difficulty modifier adds 10% to total XP
  (e.g. 2 modifiers = base × 1.2)

Mode bonus:
  Multiple choice: base XP × 1.0
  Text:            base XP × 1.2
  Voice:           base XP × 1.5

### Rep Levels

| Level | Title           | XP Required |
|-------|-----------------|-------------|
| 1     | Green Rep       | 0           |
| 2     | On the Floor    | 200         |
| 3     | Getting Warm    | 500         |
| 4     | Building Trust  | 1,000       |
| 5     | Qualified       | 2,000       |
| 6     | Strong Opener   | 3,500       |
| 7     | Closer          | 5,500       |
| 8     | Clean Closer    | 8,000       |
| 9     | Senior Closer   | 12,000      |
| 10    | Elite           | 18,000      |

Level title appears on the rep header bar in battle (next to "YOU").

### Level Up Screen
Appears between post-battle XP counter and coaching report.
Simple full-screen animation:
  ★ LEVEL UP ★
  [old title] → [new title]
  Stars or pixel fireworks (4-frame loop, 3 cycles)
  Press any key to continue

### Streak Tracking (cross-session)

Win streak: consecutive sessions won (any mode, any archetype).
Tracked in DB on RoleplaySession.

Displayed on mode select screen: "🔥 3 WIN STREAK"
Resets on any loss.

### Gym Leaderboard

Top 5 reps by total XP, visible to all gym members.
Updates after each session.
Displayed on /reps page (manager view) as a sidebar widget.
Column headers: Rank / Rep / Level / Total XP / Win Rate

---

## Audio (optional layer — implement last)

All audio is optional and off by default. Toggle in settings.

Sound effects (8-bit style, generated via Tone.js):
- Dialog text tick: short square wave blip, 40ms, C5
- Strong move: ascending 3-note arpeggio (C-E-G), 150ms
- Weak move: descending 2-note (C-Bb), 200ms
- Critical move: low buzzer, 300ms
- Resistance drop: bright ping, 100ms
- Resistance rise: dull thud, 150ms
- Win fanfare: 8-bit victory jingle, 2s
- Lose: slow descending tone, 1.5s
- Level up: ascending scale + fanfare, 2.5s

Background music: looping 8-bit ambient track (different per archetype).
Volume: 20% by default when enabled.
