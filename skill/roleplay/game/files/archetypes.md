# Prospect Archetypes

Each prospect the rep faces maps to one of six archetypes. The archetype
is derived from the roleplay_scenario_seed's prospect_profile fields at
session start. It determines the prospect's speech patterns, resistance
behavior, sprite style, and exit lines.

---

## Archetype 1: The Busy Professional

**Profile signals**
- demographic contains: "professional", "executive", "manager", "doctor",
  "lawyer", "engineer"
- personality_signals contains: "time pressure", "efficient", "direct"

**Speech pattern**
Short sentences. Gets to the point. Asks "how long will this take?" early.
Responds well to structured, confident communication. Loses patience with
rambling or weak transitions.

**Resistance behavior**
- Starts at 55 (slightly guarded — time is money)
- Drops quickly when rep is direct and confident
- Spikes +15 if rep wastes time with extended rapport
- Drops -15 on a strong consequence frame ("what happens if nothing changes?")

**Sprite style**
Business casual. Button-down shirt. Arms crossed at high resistance,
leaning forward at low resistance.

**Exit line (walkout)**
"I appreciate your time but I've got a 2 o'clock. Let me think about it."

**Exit line (timeout)**
"I really do have to run. Send me something via email."

**Converted pose**
Handshake extended, slight smile.

---

## Archetype 2: The Skeptic

**Profile signals**
- personality_signals contains: "skeptical", "analytical", "data-driven",
  "been burned before", "tried before"
- objection_likely contains: "too expensive", "does this actually work"

**Speech pattern**
Asks "why" a lot. Challenges rep's claims. Wants specifics, not generalities.
Responds to evidence and honesty. Does not respond to enthusiasm or pressure.

**Resistance behavior**
- Starts at 65 (high guard — they've heard this pitch before)
- Drops slowly; each strong move only yields -8 until trust is established
- Trust established when: rep surfaces a concrete yesterday AND the prospect
  articulates their own pattern. After that, resistance drops at normal rate.
- Spikes +20 if rep makes any unsubstantiated claim ("our trainers are the best")

**Sprite style**
Casual clothes, glasses. Arms crossed. Eyebrow raised at high resistance.
Leans back in chair. At low resistance, glasses pushed up, open posture.

**Exit line (walkout)**
"I don't think this is for me. I've tried things like this before."

**Exit line (timeout)**
"Look, I need to do more research before I commit to anything."

**Converted pose**
Nodding, uncrossed arms, slight forward lean.

---

## Archetype 3: The Enthusiast

**Profile signals**
- personality_signals contains: "excited", "motivated", "ready to go",
  "positive energy"
- stated_surface_goal contains: "get fit", "lose weight", "feel better"

**Speech pattern**
Upbeat, agreeable, lots of "yeah totally" and "that makes sense." Danger:
their enthusiasm masks a shallow commitment. They agree with everything but
won't actually sign unless the rep builds genuine emotional depth beneath
the surface energy.

**Resistance behavior**
- Starts at 35 (low guard — they want to be sold)
- Does not drop below 10 until the rep reaches the actual emotional why
  (the surface goal is not enough — "I want to feel better" won't close this)
- If rep skips yesterdays and goes straight to close, resistance spikes
  to 60 (enthusiasm was a facade; they weren't actually ready)
- Drops to 0 when emotional why is surfaced AND confirmed

**Sprite style**
Athletic wear, ponytail or snapback. Big smile at start. At high resistance
(if rep failed to go deep), smile fades to polite blankness.

**Exit line (walkout)**
"Yeah this is so cool, I just want to think about it a little more."

**Exit line (timeout)**
"This is awesome, I'll definitely come back — I just need to check my schedule."

**Converted pose**
Fist pump or thumbs up. High energy.

---

## Archetype 4: The Decision Maker Blocker

**Profile signals**
- objection_likely contains: "spouse", "partner", "husband", "wife",
  "need to talk to"
- personality_signals contains: "cautious", "family-oriented"

**Speech pattern**
Warm but deferential. Keeps referencing someone else ("my husband would
want to know...", "I'd have to check with my wife"). Not resistant to the
idea — resistant to committing without the other person.

**Resistance behavior**
- Starts at 50
- Resistance spikes +20 the moment any price is mentioned before the
  decision maker objection is preemptively addressed
- Drops -20 if rep proactively addresses the decision maker early
  ("Is there anyone else who'd want to weigh in on this?")
- Can be closed solo if rep builds strong enough identity contrast
  and frames the decision as theirs to make

**Sprite style**
Casual, friendly. Wedding ring visible. Phone on the table. Glances at phone
at high resistance (thinking about texting spouse).

**Exit line (walkout)**
"I really need to talk to my husband before I do anything like this."

**Exit line (timeout)**
"Can I bring my wife in sometime this week? I think she'd want to see this."

**Converted pose**
Relaxed smile, hands open. "She's going to love this."

---

## Archetype 5: The Price Shopper

**Profile signals**
- objection_likely contains: "too expensive", "price", "cost", "cheaper"
- personality_signals contains: "budget-conscious", "comparing options"

**Speech pattern**
Asks about price early. Compares to Planet Fitness or doing it themselves.
Not hostile — just transactional. Responds when value is made concrete and
personal. Does not respond to generic value statements.

**Resistance behavior**
- Starts at 60
- Resistance spikes +25 if price is shown before value is built
- Drops -20 when a specific callback ties value to their stated identity
  ("you mentioned your daughter's wedding — what's that worth to you?")
- Does not close on price alone; requires identity anchor

**Sprite style**
Practical clothes. Mental calculator expression. Crosses arms when price
comes up. Opens up when personal value is made concrete.

**Exit line (walkout)**
"It's just a lot of money. I can probably do this on my own."

**Exit line (timeout)**
"I'm going to check out a couple other places and compare."

**Converted pose**
Nodding slowly, calculator expression replaced with resolve.
"Okay. Let's do it."

---

## Archetype 6: The Ghost

**Profile signals**
- personality_signals contains: "quiet", "introverted", "hard to read",
  "low engagement"
- actual_emotional_driver contains deeply personal content (loss, illness,
  relationship, identity)

**Speech pattern**
Short answers. Doesn't volunteer information. Not hostile — just private.
The real why is buried deep and the rep has to earn it through patience
and follow-up. When the why finally surfaces, it's significant.

**Resistance behavior**
- Starts at 70 (high wall — not because they're skeptical, but because
  they're private)
- Each follow-up question only yields -5 until the emotional why surfaces
- When the why surfaces: single drop of -30 (the wall comes down at once)
- Rep cannot close without surfacing the why; all close attempts before
  that fail and spike resistance +10

**Sprite style**
Quiet, closed posture. Looking down or away. Minimal expression.
When the why surfaces, head comes up, eye contact. Completely different
energy.

**Exit line (walkout)**
"Sorry, I don't think now is the right time."

**Exit line (timeout)**
[Says nothing. Stands up. Nods politely. Leaves.]

**Converted pose**
Quiet resolve. Not flashy. "Okay." Handshake.

---

## Archetype mapping from seed

At session start, the system reads the prospect_profile from the
roleplay_scenario_seed and maps to an archetype using this priority order:

1. Check objection_likely → maps to Price Shopper or Decision Maker Blocker
2. Check personality_signals → maps to Skeptic, Enthusiast, Ghost, or
   Busy Professional
3. If ambiguous, default to The Skeptic (safest for drilling technique)

The archetype determines:
- Starting resistance value
- Resistance delta modifiers
- Speech pattern instructions passed to Claude
- Sprite and animation set loaded in the UI
- Exit lines used on loss screens
