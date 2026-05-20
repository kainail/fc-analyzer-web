# Sprite Definitions

## Overview

Each prospect archetype has a unique 64×64 pixel art sprite sheet.
All sprites use the 4-color palette defined in game/ui.md.
Each archetype gets its own palette variant — same 4-color structure,
different hues — so the player can instantly read the archetype from
the visual alone.

Sprite sheets are organized as horizontal strips. Each frame is 64×64.
Animation is handled by CSS background-position stepping.

---

## Sprite Sheet Structure

```
[idle-1][idle-2][speaking-1][speaking-2][flinch-1][flinch-2][flinch-3]
[hardening-1][hardening-2][leaving-1][leaving-2][leaving-3][converted-1]
[converted-2][converted-3][converted-4]
```

Total frames per archetype: 16
Sheet dimensions: 1024×64 pixels (16 frames × 64px wide)

---

## Archetype 1: The Busy Professional

**Palette**
  #1a1a2e  — darkest (navy)
  #16213e  — dark
  #0f3460  — light (deep blue)
  #e94560  — lightest (red accent — tie, watch)

**Character design**
Button-down shirt, sleeves slightly rolled. Watch on left wrist.
Strong posture. Clean haircut. Slight five o'clock shadow.

**Frame definitions**

idle-1:
  Standing upright, arms crossed. Neutral expression.
  Watch glints on wrist (lightest color pixel).

idle-2:
  Slight weight shift — 2px lower on right side. Arms still crossed.
  Subtle breathing implied by torso pixel shift.

speaking-1:
  Arms uncross slightly. Head tilts 1px right.
  Mouth open: 2px gap in face pixels.

speaking-2:
  Return to near-idle. Mouth closed.
  Head returns to center.

flinch-1:
  Body shifts 3px left. Arms drop slightly. Eyes widen (1px change).

flinch-2:
  Body 1px left. Arms returning. Expression neutral again.

flinch-3:
  Return to idle-1 position. Settled.

hardening-1:
  Arms cross tighter (1px inward). Chin raises 1px.
  Expression firms — eyebrows 1px lower.

hardening-2:
  Hold position. Watch glint disappears (darker pixel).

leaving-1:
  Body rotates — facing 45° away. One arm extends (reaching for bag).

leaving-2:
  Full side profile. Both feet showing movement.

leaving-3:
  Back to viewer. Walking away. Only back of head and shoulders visible.

converted-1:
  Arms uncrossed. Right hand extends forward (handshake).
  Expression: slight upward curve on mouth pixels.

converted-2:
  Handshake position held. Head nods (1px down).

converted-3:
  Head returns. Smile pixels slightly wider.

converted-4:
  Return to near-idle but open posture. Watch glints again.

---

## Archetype 2: The Skeptic

**Palette**
  #2d2d2d  — darkest (charcoal)
  #4a4a4a  — dark (gray)
  #7a7a7a  — light (mid gray)
  #c8c8c8  — lightest (near white — glasses, highlights)

**Character design**
Casual shirt, slightly rumpled. Glasses (2×4px rectangles on face).
Slight slouch. One eyebrow perpetually higher than the other.

**Frame definitions**

idle-1:
  Arms crossed. Glasses glint (lightest pixel on lens).
  Eyebrow raised. Slouched but attentive.

idle-2:
  1px weight shift. Glasses glint shifts 1px.
  Same expression — no change in skepticism.

speaking-1:
  One arm uncrosses — gestures slightly.
  Mouth opens. Eyebrow stays raised.

speaking-2:
  Arm returns. Mouth closes.
  Other eyebrow raises to match (maximum skepticism expression).

flinch-1:
  Glasses shift 1px (head tilts — actually listening).
  Arms loosen slightly. Eyebrows even out momentarily.

flinch-2:
  Arms begin to uncross. Glasses settle.

flinch-3:
  Arms fully uncrossed. Leaning slightly forward. Surprised expression.

hardening-1:
  Arms cross tighter. Both eyebrows lower.
  Glasses pushed up (dismissal gesture in pixels).

hardening-2:
  Full crossed arms. One eyebrow maximally raised. Leans back.

leaving-1:
  Shrug animation — shoulders raise 2px.

leaving-2:
  Shoulders lower. Body turns 45°.

leaving-3:
  Side profile walking away. Glasses visible in profile.

converted-1:
  Arms uncrossed. Glasses pushed up — this time in agreement not dismissal.
  Slight head nod.

converted-2:
  Leaning forward. Elbows on knees position.

converted-3:
  Hand extends — not enthusiastic, but genuine. Firm nod.

converted-4:
  Settled. Open posture. Eyebrows finally even.

---

## Archetype 3: The Enthusiast

**Palette**
  #0d3b00  — darkest (deep green)
  #1a6b00  — dark (forest green)
  #4caf50  — light (bright green)
  #b8f5b0  — lightest (mint — highlights, teeth)

**Character design**
Athletic wear — tank top or fitted tee. Hair up (ponytail) or snapback cap.
Big smile. Energetic stance — weight forward, heels slightly raised.

**Frame definitions**

idle-1:
  Leaning forward, weight on toes. Big smile (lightest pixels for teeth).
  Hands on hips or at sides.

idle-2:
  Slight bounce — 1px up from idle-1. Same smile.

speaking-1:
  Hands come up — talking with hands. Mouth wide open (enthusiasm).

speaking-2:
  Hands lower slightly. Mouth closed — nodding.

flinch-1:
  (Not a negative flinch for this archetype — this is a "wow" reaction)
  Eyes widen. Leans back 2px in surprise.

flinch-2:
  Leans forward again. Processing.

flinch-3:
  Smile returns, slightly more genuine than before.

hardening-1:
  Smile fades to polite neutral. Weight shifts back to heels.
  Hands go to pockets.

hardening-2:
  Fully flat expression. Weight back. Smile gone.
  This represents the facade dropping — be alarmed when this fires.

leaving-1:
  Smile back (it's polite, not real). Hand wave — "I'll call you."

leaving-2:
  Turning away. Still waving.

leaving-3:
  Back to viewer. Bouncy walk — but walking away.

converted-1:
  Jump animation — 3px up from ground.

converted-2:
  Peak of jump. Fist in air (1 pixel).

converted-3:
  Landing. Huge smile.

converted-4:
  Settled. Pointing finger-guns at rep (pixel art version).

---

## Archetype 4: The Decision Maker Blocker

**Palette**
  #2c1810  — darkest (warm brown)
  #5c3d2e  — dark (medium brown)
  #c4956a  — light (warm tan)
  #f5e6d3  — lightest (cream — skin highlights, wedding ring)

**Character design**
Casual but put-together. Visible wedding ring (lightest pixel on left hand).
Friendly face, warm expression. Phone on the table in front of them
(rendered as a small rectangle below the sprite, 8×4px).

**Frame definitions**

idle-1:
  Sitting position implied. Hands visible, ring prominent.
  Friendly expression. Phone visible below.

idle-2:
  Glances down at phone (head tilts 1px down). Ring catches light.

speaking-1:
  Head up, engaged. Hands gesture openly.

speaking-2:
  One hand touches ring (subconscious gesture). Head tilts.

flinch-1:
  Hands open — genuinely considering. Ring hand lowers.
  Warm smile appears.

flinch-2:
  Leaning slightly forward. Phone forgotten.

flinch-3:
  Fully engaged. Phone off screen (scrolled away). Both hands open.

hardening-1:
  Hand moves to phone (thinking about texting spouse).
  Expression becomes uncertain.

hardening-2:
  Phone picked up (held in frame). "I should check with..."

leaving-1:
  Phone to ear (calling spouse, in their mind).

leaving-2:
  Standing. Warm smile — this isn't hostile, just uncertain.

leaving-3:
  Walking away. Looking at phone screen.

converted-1:
  Phone placed face-down on table (not needed anymore).
  Decisive expression.

converted-2:
  Handshake. Ring visible. "She's going to love this."

converted-3:
  Signing gesture (imaginary pen).

converted-4:
  Warm smile. Thumbs up. Phone still face-down.

---

## Archetype 5: The Price Shopper

**Palette**
  #1a0a2e  — darkest (deep purple)
  #2d1b4e  — dark
  #6b4c9a  — light (medium purple)
  #d4b8f0  — lightest (lavender — calculator display, highlights)

**Character design**
Practical, no-frills clothes. Reading glasses (different from Skeptic —
these are for reading prices, not analyzing claims). Small notebook or
phone with calculator app open. Arms cross when numbers come up.

**Frame definitions**

idle-1:
  Calculator/phone held loosely. Neutral expression.
  Reading glasses down (not needed yet).

idle-2:
  Eyes scanning (looking around the gym). Calculator lowered.

speaking-1:
  Calculator raises slightly. "What does this cost?"
  Eyebrows raised — questioning.

speaking-2:
  Calculator lowers. Listening expression.

flinch-1:
  Calculator disappears (pocketed). Actual interest appears.
  Leans forward 1px.

flinch-2:
  Reading glasses off — doesn't need to calculate this.

flinch-3:
  Open posture. Something clicked.

hardening-1:
  Calculator back out. Mental math expression.
  Comparing in their head.

hardening-2:
  Arms cross over calculator. Skeptical squint.

leaving-1:
  Standing. Calculator pocketed but posture closed.

leaving-2:
  Turning. "I'll check some other places."

leaving-3:
  Walking away, already pulling out phone to look up competitors.

converted-1:
  Calculator pocketed for good. Slow nod — the math worked out.

converted-2:
  Handshake. Reading glasses folded and put away.

converted-3:
  Signing gesture. Deliberate.

converted-4:
  Slight smile. Resolve. "Okay. Makes sense."

---

## Archetype 6: The Ghost

**Palette**
  #0a0a1a  — darkest (near black)
  #1a1a3a  — dark (very dark blue)
  #3a3a6a  — light (muted blue-gray)
  #8a8ab0  — lightest (dusty lavender — eyes, subtle highlights)

**Character design**
Quiet clothes — nothing flashy. Looking down or slightly away.
Minimal expression. Eyes are the most expressive element —
the only thing that changes significantly when the wall comes down.

**Frame definitions**

idle-1:
  Looking slightly down and left. Arms loose at sides.
  Minimal expression. Eyes half-open.

idle-2:
  Barely any movement — 1px shift. This archetype barely animates
  until the emotional why surfaces.

speaking-1:
  Short answers — head barely moves. Mouth opens slightly (2px).

speaking-2:
  Returns to idle-1 immediately. Done speaking.

flinch-1:
  Eyes shift to center — making eye contact for the first time.
  Head comes up 1px.

flinch-2:
  Head fully up. Eyes open more (1px taller).
  Something was said that landed.

flinch-3 — THE WALL DROPS:
  Complete posture change. Head fully up. Eyes wide.
  Body leans forward 2px. This frame only triggers on the
  emotional why breakthrough.
  All colors shift to lighter palette values — like light entering
  a dark room. This is the most significant visual moment in the game.

hardening-1:
  Eyes back down. Head drops 1px.

hardening-2:
  Return to idle-1. Wall firmly back.

leaving-1:
  Standing. No expression. Just standing.

leaving-2:
  Side profile. Moving. Still no expression.

leaving-3:
  Back to viewer. Walking away silently.
  [No exit line for this archetype — silence is the exit.]

converted-1 (only reachable after flinch-3):
  Head up. Eyes open. Quiet resolve.
  Small nod — 1px head movement down and back.

converted-2:
  Hand extends. Slow. Deliberate.

converted-3:
  Handshake. Eyes meet. "Okay."

converted-4:
  Return to slight forward lean. But expression different — lighter.
  The change is permanent in this frame.
