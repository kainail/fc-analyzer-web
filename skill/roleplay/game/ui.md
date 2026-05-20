# Battle Screen UI Specification

## Visual Style

Gameboy-era pixel art. The entire battle screen renders inside a fixed
160×144 virtual canvas, scaled up with nearest-neighbor interpolation to
fill the browser window without blurring. No anti-aliasing. No gradients.
No shadows. Every element snaps to the pixel grid.

Font: a monospace bitmap font (e.g. Press Start 2P from Google Fonts).
All text renders at 6px or 8px virtual size (12px or 16px after 2x scale).

Scanline overlay: a subtle CSS repeating-gradient simulating Gameboy LCD
scanlines sits on top of the entire canvas at 15% opacity.

Color palette: each prospect archetype gets its own 4-color palette.
Default palette (used as fallback):

  #0f380f  — darkest (backgrounds, outlines)
  #306230  — dark (shading, UI borders)
  #8bac0f  — light (fills, character mid-tones)
  #9bbc0f  — lightest (highlights, text backgrounds)

---

## Screen Layout (160×144 virtual pixels)

```
┌────────────────────────────────────────────────┐  y=0
│  PROSPECT NAMEPLATE          [RESISTANCE BAR]  │  y=0–16
├────────────────────────────────────────────────┤  y=16
│                                                │
│         PROSPECT SPRITE AREA                   │  y=16–80
│              (64×64 sprite, centered)          │
│                                                │
├────────────────────────────────────────────────┤  y=80
│  REP NAMEPLATE               [CONFIDENCE BAR] │  y=80–96
├────────────────────────────────────────────────┤  y=96
│                                                │
│         DIALOG / INPUT BOX                     │  y=96–144
│                                                │
└────────────────────────────────────────────────┘  y=144
```

---

## Zone Breakdown

### Zone 1 — Prospect Header (y: 0–16, full width)

Left side: prospect name in bitmap font, all caps, 6px.
Right side: Resistance bar.

Resistance bar:
- Total width: 48px virtual
- Height: 6px virtual
- Filled portion color: #8bac0f (light green) when resistance < 50
- Filled portion color: #306230 (dark green) when resistance < 25
- Filled portion color: #9bbc0f (bright) when resistance just dropped (flash
  for 500ms)
- Empty portion: #0f380f
- Label: "RES" in 6px font to the left of the bar

---

### Zone 2 — Prospect Sprite Area (y: 16–80, full width)

The prospect sprite is a 64×64 pixel art character centered horizontally
in this zone.

Sprite states (see game/sprites.md for full definitions):
- idle       — default, subtle 2-frame breathing animation
- speaking   — mouth animation, 2 frames alternating
- flinch     — recoil animation when resistance drops (3 frames, 200ms total)
- hardening  — stiffening animation when resistance rises (2 frames)
- leaving    — walking-away animation (lose condition)
- converted  — open posture, win animation (4 frames loop)

Floating feedback labels appear in this zone, above the sprite:
- "STRONG"     — bright green, floats upward and fades over 800ms
- "COMPETENT"  — light green, same animation
- "WEAK"       — amber/yellow, same animation
- "CRITICAL"   — red, shakes horizontally before fading

Resistance delta numbers also float:
- "-15" in bright green when resistance drops
- "+10" in red when resistance rises

---

### Zone 3 — Rep Header (y: 80–96, full width)

Left side: "YOU" label + rep's name (pulled from Clerk session), 6px font.
Right side: Confidence bar.

Confidence bar:
- Represents the rep's momentum — rises with consecutive strong moves,
  drops with consecutive weak moves
- Starts at 50%
- Does not directly affect win/lose; affects XP multiplier at end
- Total width: 48px virtual
- Height: 6px virtual
- Color: #8bac0f, pulses bright on a strong move streak (3+ in a row)
- Label: "CON" in 6px font

---

### Zone 4 — Dialog / Input Box (y: 96–144, full width)

This zone changes based on the current turn phase.

#### Phase A — Prospect Speaking
Standard RPG dialog box. 1px border in darkest color.
Prospect's line renders with a typewriter effect: one character every 40ms.
Small prospect portrait (16×16 sprite) in top-left corner of the box.
"▼" blinking indicator in bottom-right corner when text is complete.

#### Phase B — Rep Input (Multiple Choice Mode)
Four options stacked vertically. Each option is a selectable row:
  ► [Option text here]
"►" cursor moves with arrow keys or mouse hover.
Selected option highlights to lightest palette color.
Press Enter or click to confirm.

#### Phase C — Rep Input (Text Mode)
Plain text input field inside the dialog box.
Blinking cursor (|) at 500ms interval.
"SEND" prompt in bottom-right corner.
Character limit: 280 characters (shown as counter in bottom-left).

#### Phase D — Rep Input (Voice Mode)
Large record button centered in the dialog zone.
Button label: "HOLD TO SPEAK" while inactive.
While recording: "LISTENING..." with a 3-dot pulse animation.
After release: "TRANSCRIBING..." while Whisper processes.
Transcribed text appears in the box for rep to confirm before sending.
"CONFIRM" and "RETRY" options appear below transcription.

#### Phase E — Coaching Whisper
After the rep's move is evaluated, the dialog box briefly shows the
turn_feedback from Claude (1–2 sentences) in a slightly different
style — italic if the font supports it, or with a small "💬 COACH:" prefix.
Visible for 4 seconds, then automatically advances to Phase A (next
prospect turn).

---

## Mode Select Screen (pre-battle)

Shown before the battle begins. Full screen, not the 160×144 canvas.

Layout:
- Top: prospect name + archetype chip + stage being drilled
- Middle: prospect profile summary (demographic, stated goal, emotional driver)
  shown as flavor text — like a Pokédex entry
- Bottom: three mode cards side by side

Mode cards:
  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
  │  MULTIPLE   │  │    TEXT     │  │    VOICE    │
  │   CHOICE    │  │   BATTLE    │  │   BATTLE    │
  │             │  │             │  │             │
  │  Pick from  │  │  Type your  │  │  Speak your │
  │  4 options  │  │  response   │  │  response   │
  │             │  │             │  │             │
  │  BEGINNER   │  │INTERMEDIATE │  │  ADVANCED   │
  └─────────────┘  └─────────────┘  └─────────────┘

Difficulty label below each card. Selecting a card starts the battle.

---

## Victory / Defeat Screens

### Victory Screen
Full screen takeover. Black background.
Center: prospect sprite in converted pose, looping victory animation.
Text (bitmap font, 8px):
  ★ CONSULTATION COMPLETE ★
  [prospect name] — [frequency]x/week
  
XP counter animates up from 0 to final value (rolling number effect).
Breakdown appears line by line after XP finishes:
  BASE XP:        +150
  TECHNIQUE:      +40
  STREAK BONUS:   +25
  TOTAL:          215 XP

Press any key or tap to continue to full coaching report.

### Defeat Screen
Full screen. Darker palette (shift all colors one step darker).
Center: prospect sprite in leaving pose.
Exit line in dialog box, typewriter effect.
Text:
  ✗ PROSPECT LEFT

Partial XP shown (60% of what a win would give — you learn from losses).
Press any key or tap to continue to coaching report.

---

## Coaching Report Screen

Standard web UI (not pixel art canvas). Slides in after battle screens.
Matches fc-analyzer-web dark mode design system.

Sections:
1. Session summary — mode, turns taken, final resistance, outcome
2. Stage objective — met / partially met / not met
3. Best moment — turn number + what the rep did well
4. Worst moment — turn number + what cost the most resistance
5. Primary fix — one specific thing to work on
6. Next drill recommendation — same stage harder, or next stage

"Play Again" button (same seed, reset resistance) and
"New Drill" button (back to analysis page) at the bottom.

---

## Responsive Scaling

The 160×144 virtual canvas scales to fill the viewport while maintaining
aspect ratio. Minimum scale: 2x (320×288). Maximum scale: 6x (960×864).
At typical laptop resolution, 4x (640×576) fits cleanly with room for
the coaching whisper box below.

On mobile: canvas fills width, scales to 2x or 3x. Input box expands
below the canvas rather than overlapping it. Voice mode is the recommended
mode on mobile.

---

## Transition Animations

Battle start:
- Screen wipes in from black (horizontal scanline wipe, 600ms)
- Prospect sprite slides in from right (300ms)
- Name plate and bars fade in (200ms)

Turn transition (prospect → rep input):
- Dialog box border pulses once
- Input zone slides up from below (150ms)

Resistance change:
- Bar fills/drains smoothly over 400ms
- Delta number floats and fades (800ms)
- Flinch or hardening sprite animation plays simultaneously

Battle end:
- Screen flashes white once (100ms) then fades to black (500ms)
- Victory or defeat screen fades in (400ms)
