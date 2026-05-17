# Diagnostic Flags

Diagnostic flags are specific, high-signal events that frequently determine whether a call closed and at what frequency. Each flag is binary — it either triggered or it didn't — but the *consequences* of a flag's presence or absence ripple through the entire call.

When analyzing a transcript, evaluate each flag below and include in the output payload only the flags that triggered (i.e., the failures or notable absences). Do not include flags that did not trigger.

## Flag categories

Flags are organized by where they typically originate. A flag in an earlier category often causes downstream problems — note these causal chains in your analysis.

---

## Qualifying flags

### `missed_why_now`
**Triggers when:** rep did not ask "why now?" or any equivalent question about the timing of the prospect's interest.
**Consequence:** the rep is selling against an unanchored timeline. Without "why now," there is no urgency baseline. The price will feel arbitrary because the prospect's own urgency was never surfaced.
**Evidence to cite:** the moment the rep moved past the surface goal without asking about timing.

### `surface_goal_only`
**Triggers when:** rep accepted a surface-level goal ("I want to lose weight," "I want to get in shape") without digging for the emotional why beneath it.
**Consequence:** all subsequent value communication is built on an emotionally neutral foundation. Future images will land flat because they are tied to the surface goal, not to the identity-level driver.
**Evidence to cite:** the exact exchange where the rep accepted the surface goal and moved on.

**Co-triggering note (`missed_why_now` and `surface_goal_only`).** These two flags are related but distinct and may co-trigger on the same call.

- `missed_why_now` triggers when the rep never asked any timing question (why now, what changed, what made today the day).
- `surface_goal_only` triggers when the rep accepted the surface goal without any digging whatsoever — no follow-ups on emotional content, no consequence questions, no exploration of identity beneath the goal.

A call where the rep asked "why now?" but accepted the answer without follow-up would trigger `surface_goal_only` but not `missed_why_now`. A call where the rep never asked timing but did dig into the emotional why through other questions would trigger `missed_why_now` but not `surface_goal_only`. Both firing on the same call is allowed and indicates a particularly shallow asks stage. When both fire, treat `surface_goal_only` as the upstream-most diagnostic anchor for the primary training focus — timing is one specific dimension of digging, and "no digging at all" is the broader failure.

### `no_consequence_question`
**Triggers when:** rep asked status and outcome questions but never asked a consequence question ("what happens if nothing changes?").
**Consequence:** urgency was not surfaced from the prospect's own articulation. The rep will need to manufacture urgency later — typically badly.
**Evidence to cite:** the section of asks; note the absence.

### `question_stacking`
**Triggers when:** rep asked multiple questions in a single turn at any point during qualifying.
**Consequence:** answers go shallow. The prospect picks the easiest question to answer and skips the others. The rep loses depth without noticing.
**Evidence to cite:** specific moments of stacking.

### `vague_yesterdays`
**Triggers when:** rep explored past attempts but did not extract specific programs, durations, or reasons for failure.
**Consequence:** identity contrast cannot be built. The diagram will land generically. Later objections about "I'll just do it on my own" cannot be pre-handled because the yesterdays material is too vague to draw on.
**Evidence to cite:** the yesterdays section; note where the rep accepted abstraction.

---

## Discipline flags

### `missing_label_confirm`
**Triggers when:** rep did not deliver a clean label-and-confirm at the needs stage, or labeled without explicit confirmation.
**Consequence:** the rep is building the rest of the call on an assumption the prospect never verbally agreed to. Later, the prospect may object on grounds the rep thought were already settled.
**Evidence to cite:** the transition from asks to yesterdays; note the absence of explicit confirmation.

### `no_callbacks_to_discovery`
**Triggers when:** the rep collected qualifying material but did not reference it during the diagram, the pre-frame guarantees, the close, or any objection handling.
**Consequence:** discovery becomes ritual rather than ammunition. The diagram lands generically. Value communication is flat. The prospect does not feel heard at the moments it would matter most.
**Evidence to cite:** specific later moments where a callback was warranted but absent.
**Stage assignment:** assign this flag to whichever scored stage its consequences MOST disrupted — typically `pre_frame_guarantees` (where callbacks to specific prospect details should have surfaced and didn't), occasionally `close` (when the missing callbacks would have anchored the recommendation or held the prospect at higher frequency).

### `generic_diagram`
**Triggers when:** the diagram (12-month timeframe) was delivered without specific references to the prospect's stated identity, goals, or yesterdays.
**Consequence:** the diagram becomes a feature pitch rather than a personalized future image. Social proof and metaphors do not land because the prospect has no reason to feel implicated.
**Evidence to cite:** the diagram section; note where the rep used "you" generically rather than referencing specific details.
**Stage assignment:** the diagram is not itself a scored stage (see `methodology/consultation-flow.md`). Assign this flag to whichever scored stage its consequences MOST disrupted — typically `pre_frame_guarantees` (where callbacks to the prospect's specifics should have surfaced and didn't, because the diagram had already failed to use the material) or `close` (where the unanchored recommendation lands). Default to `pre_frame_guarantees` unless the disruption is concentrated specifically at the close. The same rule applies to other diagram-rooted flags such as `no_callbacks_to_discovery`, `no_metaphors_or_stories`, and `no_social_proof`.

---

## Communication flags

### `feature_dump`
**Triggers when:** rep listed product features ("we have customized workouts, meal plans, biometric scans") without anchoring them to the prospect's stated needs.
**Consequence:** value communication is flat. The prospect evaluates features intellectually but not emotionally. Price feels expensive relative to a feature list.
**Evidence to cite:** specific moments where features were listed without callbacks.

### `no_metaphors_or_stories`
**Triggers when:** the diagram or value communication phases passed without any metaphors, analogies, or specific stories.
**Consequence:** abstract concepts (consistency, accountability, foundation) remain abstract. The Netflix accountability metaphor, the building-a-house analogy, the Disneyland exhaustion — these are the moves that make fitness concepts tangible. Their absence flattens the entire value communication.
**Evidence to cite:** the diagram section; note the absence.
**Stage assignment:** assign this flag to whichever scored stage its consequences MOST disrupted — typically `pre_frame_guarantees` (where the missing metaphors would have made the value loading land emotionally), occasionally `close` (when the price reveal feels flat because no metaphor preceded it).

### `no_social_proof`
**Triggers when:** rep did not invoke third-party authority ("most clients training 3-4x see results around six months") at any point during the diagram or value communication.
**Consequence:** the rep is making claims about results based on their own authority alone. The high-frequency package recommendation (4x) lacks the social proof that makes it land.
**Evidence to cite:** the moment around the results phase or the price anchor.
**Stage assignment:** assign this flag to whichever scored stage its consequences MOST disrupted — typically `price_anchor` (where missing social proof leaves the 4x recommendation unanchored at the moment of decision), occasionally `pre_frame_guarantees` (when the absence of social proof flattens the value loading before price is shown).

---

## Conviction and pacing flags

### `hedging_at_price_reveal`
**Triggers when:** rep used hedging language during the price reveal ("I think," "kind of," "this might seem like a lot").
**Consequence:** signals weak conviction at the highest-stakes moment of the call. The prospect picks up on hedging and matches it with their own hesitation.
**Evidence to cite:** the exact phrasing of the price reveal.

### `silence_broken_after_close`
**Triggers when:** rep asked for the sale and then immediately filled the silence with more pitch, justification, or new options.
**Consequence:** the rep undermined their own ask. The 5–8 seconds of uncomfortable silence is what produces the close. Filling it gives the prospect an exit.
**Evidence to cite:** the moment immediately after "ready to get started?" or equivalent.

### `apologetic_close`
**Triggers when:** rep apologized for the price, the contract, or the ask itself during the close or reinforce stage.
**Consequence:** the rep signaled that the price is high. The prospect, who may have been about to agree, now has permission to balk.
**Evidence to cite:** specific apologetic phrasings.

---

## Momentum flags

### `momentum_killed_after_yes`
**Triggers when:** rep, after the prospect indicated agreement, continued to pitch, introduced new variables, or reopened considerations the prospect had moved past.
**Consequence:** one of the most reliable ways to lose a sale that was already won. The prospect's commitment is fresh and fragile. Additional information often surfaces second thoughts.
**Evidence to cite:** the exchange immediately after the prospect's agreement.

### `settled_for_low_package`
**Triggers when:** prospect chose 1x or 2x training and rep did not attempt to reframe and push for higher frequency.
**Consequence:** the rep accepted a suboptimal outcome for both the prospect (1-2x is materially less effective than 3-4x) and the gym. Often signals weak qualifying earlier — if qualifying had been deeper, the prospect would already see why higher frequency mattered.
**Evidence to cite:** the moment the prospect chose the package and the rep accepted.

### `no_anchor_at_4x`
**Triggers when:** rep did not explicitly recommend 4x as the anchor (or an equivalent high-frequency option), and 4x was appropriate for this prospect.
**Consequence:** the prospect is shopping among options without an anchor, which means they default to the cheapest. This is a price-anchoring failure.
**Evidence to cite:** the price anchor section; note what was recommended instead.
**Appropriateness criteria:** 4x is appropriate **by default** for most prospects. Assume "appropriate" unless transcript evidence makes one of the exceptions below explicitly applicable:

- **Time constraint.** Prospect explicitly states a schedule that makes 4x impossible (e.g., works two jobs, travels three weeks per month, has childcare obligations that fix their gym window).
- **Mobility or recovery limitation.** Prospect has stated mobility or recovery limitations that warrant lower frequency (e.g., post-surgery, chronic injury requiring spaced sessions, doctor-recommended cap).
- **Real budget ceiling.** Prospect's stated budget makes 4x genuinely impossible. **Note:** this is rare. Most price objections reflect value-communication gaps rather than real budget ceilings. Do not treat a generic "it's expensive" as a budget constraint — look for an explicit, specific budget statement (e.g., "I have $X per month and that's the ceiling").

If none of these apply in transcript evidence, default to "appropriate" and assess whether the flag fires based on what the rep actually recommended.

---

## Adaptation flags

### `style_mismatch_with_prospect`
**Triggers when:** rep ran their default style without adapting to the prospect's pace, energy, or emotional state — for example, delivering high-energy storytelling to a guarded analytical prospect, or staying clinical with a warm social prospect.
**Consequence:** the prospect feels unread. Trust does not build. Even good qualifying questions land flat because the delivery does not match.
**Evidence to cite:** specific moments where the prospect's signals diverged from the rep's approach.

### `ignored_emotional_disclosure`
**Triggers when:** the prospect surfaced something vulnerable or emotional and the rep moved past it without acknowledgment or validation.
**Consequence:** trust damage that is hard to repair. The prospect retreats. Subsequent qualifying gets shallower because they no longer feel safe disclosing.
**Evidence to cite:** the emotional disclosure and the rep's response.

---

## Causal chain analysis

When multiple flags trigger, they often form a causal chain. For example:

- `surface_goal_only` → `vague_yesterdays` → `generic_diagram` → `feature_dump` → `hedging_at_price_reveal`

This chain represents a call where shallow qualifying caused everything downstream. The training focus should target the upstream cause (surface_goal_only), not the downstream symptoms.

When you identify a chain like this in your analysis, the primary training focus should target the *earliest* meaningful flag in the chain. Fixing the upstream issue collapses the downstream issues automatically.

## Output requirement

In the JSON output, include only flags that triggered:

```json
{
  "diagnostic_flags": [
    {
      "flag": "surface_goal_only",
      "evidence_quote": "Direct quote from transcript",
      "transcript_location": "Approximate timestamp or section",
      "stage": "asks",
      "downstream_consequences": ["vague_yesterdays", "generic_diagram"]
    }
  ]
}
```

The `downstream_consequences` field is optional — populate it when you can clearly trace how this flag caused other flags later in the call. This causal mapping is one of the analyzer's highest-value outputs because it tells the rep where the actual leverage is.
