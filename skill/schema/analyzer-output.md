# Analyzer Output Schema

This file specifies the JSON payload the analyzer produces. The schema is strict — downstream systems (especially the roleplay training app) parse it programmatically and depend on exact field names, types, and structure.

## Design principles

A few principles to keep in mind when constructing the output:

**Every score must be evidence-grounded.** No bare numbers. Every score has at least one transcript citation that justifies it. Scores without evidence are not consumable by the training system because the roleplay app cannot generate a meaningful drill from a number alone.

**The training focus is a single thing, not a list.** The analyzer picks the highest-leverage skill to drill next, with one secondary backup. Dumping eight weaknesses on the roleplay app is unhelpful — it has to choose anyway, and the analyzer is better positioned to choose than a downstream system. One primary, one secondary, full stop.

**The roleplay scenario seed must be specific enough to generate a drill.** The downstream app uses this to construct a practice session. Vague seeds produce vague drills. Specific seeds produce drills that target the actual weakness.

**Confidence is part of the data.** When the analyzer is uncertain, that uncertainty propagates. The training system can decide whether to act on a low-confidence analysis (e.g., by asking a human to verify) or treat it as ground truth.

## Top-level structure

```json
{
  "transcript_id": "string",
  "analyzed_at": "ISO 8601 datetime",
  "analyzer_version": "string (semver)",
  "predicted_outcome": { ... },
  "stage_scores": [ ... ],
  "cross_cutting_scores": [ ... ],
  "diagnostic_flags": [ ... ],
  "primary_training_focus": { ... },
  "secondary_training_focus": { ... },
  "roleplay_scenario_seed": { ... },
  "overall_assessment": "string (under 300 words)"
}
```

## Field-by-field specification

### `transcript_id` (required, string)

The unique identifier for the transcript being analyzed. The downstream system uses this to link the analysis to the source transcript.

**Derivation rule.** `transcript_id` is derived from the input transcript's filename with the file extension stripped. The naming convention is `YYYY-MM-DD-salesperson-outcome` — e.g., the file `2026-01-15-jsmith-sold-2x.md` produces `transcript_id: "2026-01-15-jsmith-sold-2x"`.

The analyzer must not invent or modify this value. It takes the id directly from the input filename. If the transcript is provided without a filename (e.g., pasted text), the caller must supply the id in metadata; if neither filename nor metadata id is provided, the analyzer should surface this as an error rather than fabricating one.

### `analyzed_at` (required, ISO 8601 datetime)

Timestamp when the analysis was produced. Used for tracking and for resolving conflicts if the same transcript is re-analyzed later.

### `analyzer_version` (required, string)

Semantic version of the rubric used. Format: `major.minor.patch`. The rubric will evolve over time, and accumulated analyses need to be filterable by which version produced them. Start at `1.0.0` and increment as the rubric changes.

### `predicted_outcome` (required, object)

In most calls the outcome is explicit in the transcript and this field is a categorization, not a prediction. The field name `predicted_outcome` is retained because downstream systems already parse it. True prediction (inferring a likely outcome) is the fallback used only when the outcome is not evident in the transcript — for example, when the call ended ambiguously without an explicit commit-or-decline. For transcripts that ended *before* the close was reached at all, use the `incomplete` bucket (see "Handling incomplete transcripts" below) rather than guessing.

```json
{
  "bucket": "sold-3x",
  "confidence": "high",
  "actual_outcome_evident": true,
  "surface_reasoning": "Prospect signed up for 3x training package after the close",
  "underlying_cause": "Strong qualifying enabled clean close; rep recommended 4x but prospect anchored at 3x due to financial pacing",
  "primary_diagnostic_flags_implicated": []
}
```

Field details:
- `bucket`: one of the buckets defined in `rubric/outcome-buckets.md`
- `confidence`: `high`, `medium`, or `low`
- `actual_outcome_evident`: boolean — true if the outcome was explicit in the transcript, false if inferred
- `surface_reasoning`: brief description of what happened
- `underlying_cause`: the deeper analysis of why the outcome was what it was; for sold calls, this is often "strong qualifying enabled the close"; for not-sold, it traces back to the upstream gap
- `primary_diagnostic_flags_implicated`: array of flag names from `rubric/diagnostic-flags.md` that contributed to this outcome (empty array if none)

### `stage_scores` (required, array)

One object per stage. Stages must appear in the order defined in `methodology/consultation-flow.md`. All nine stages must be present (1: pre-frame, 2: asks, 3: needs, 4: yesterdays, 5: workout, 6: pre-frame guarantees, 7: price anchor, 8: close, 9: reinforce). Distinguish between two cases where a stage doesn't get a normal score:

- **Stage skipped within a complete call.** The call reached this point in the sequence but the rep skipped over the stage (e.g., went from yesterdays straight to the workout without any deliberate transition, or omitted pre-frame guarantees and showed price first). Score this `1` and note the skip explicitly in `what_was_missed`.
- **Stage not reached in an incomplete transcript.** The transcript ended before this stage was reached (e.g., recording cut off during the workout, so pre-frame guarantees, price anchor, close, and reinforce were never reached). Score this `null` and note in `what_was_missed` that the stage was not reached. See "Handling incomplete transcripts" below.

```json
{
  "stage": "asks",
  "score": 6,
  "evidence_quotes": [
    "REP: 'So what made you come in today?' / PROSPECT: 'I want to lose weight.' / REP: 'Awesome, let's get you set up...'",
    "Approximately 4:32 in the transcript"
  ],
  "what_worked": "Rep opened with the right qualifying question and got a direct answer from the prospect.",
  "what_was_missed": "Rep accepted 'I want to lose weight' without any follow-up. No 'why now,' no consequence question, no exploration of the emotional driver beneath the surface goal.",
  "upstream_consequences": "This shallow asks stage propagated through the entire call. Yesterdays was vague because the rep had no emotional anchor to dig into. The diagram landed generically because the future image had nothing specific to attach to."
}
```

Field details:
- `stage`: one of `pre_frame`, `asks`, `needs`, `yesterdays`, `workout`, `pre_frame_guarantees`, `price_anchor`, `close`, `reinforce`
- `score`: integer 1–10, or `null` for stages not reached in an incomplete transcript (see "Handling incomplete transcripts" below)
- `evidence_quotes`: array of strings, at least one required; direct transcript quotes preferred, with timestamps where possible
- `what_worked`: string; what the rep did well at this stage; populate even for low scores ("the rep at least asked the question, even if shallowly")
- `what_was_missed`: string; specific element the rep failed to execute; required for scores below 7
- `upstream_consequences`: string or null; how this stage's quality shaped what happened later in the call; required for stages 2 (asks), 3 (needs), and 4 (yesterdays); optional for other stages

### `cross_cutting_scores` (required, array)

One object per cross-cutting dimension. All nine dimensions must be present.

```json
{
  "dimension": "callback_discipline",
  "score": 4,
  "evidence_quotes": [
    "Rep gathered yesterdays material around 8:15 (prospect's history of starting and stopping diets) but never referenced it during the diagram, the pre-frame guarantees, or the close.",
    "Diagram delivered with generic future imagery — no mention of the prospect's stated identity (her daughter's wedding in May)."
  ],
  "pattern_observed": "Discovery treated as a checklist rather than ammunition. Rep collected information correctly but treated it as a discrete stage rather than as material to weave through the rest of the call.",
  "highest_leverage_fix": "After yesterdays, identify 2-3 specific details (a past attempt, an emotional driver, a stated identity) and explicitly callback to each at least once during the diagram, the guarantees, and any objection handling. The drill should focus on building the habit of reaching back for material rather than producing it generically."
}
```

Field details:
- `dimension`: one of `qualifying_depth`, `identity_contrast`, `label_and_confirm`, `mirroring_adaptation`, `callback_discipline`, `value_communication`, `conviction_tone`, `momentum_preservation`, `one_question_at_a_time`
- `score`: integer 1–10
- `evidence_quotes`: array of strings, at least one required
- `pattern_observed`: string; description of the pattern across the call
- `highest_leverage_fix`: string or null; for scores 6 and below, the specific thing that would change this dimension's score most; null for scores 7 and above

### `diagnostic_flags` (required, array)

Only flags that triggered. Empty array if no flags triggered.

```json
{
  "flag": "surface_goal_only",
  "evidence_quote": "REP: 'So what's your goal?' / PROSPECT: 'I want to lose weight.' / REP: 'Awesome, let's get into the workout.'",
  "transcript_location": "Approximately 3:45",
  "stage": "asks",
  "downstream_consequences": ["vague_yesterdays", "generic_diagram", "feature_dump"]
}
```

Field details:
- `flag`: name from `rubric/diagnostic-flags.md`
- `evidence_quote`: direct transcript quote
- `transcript_location`: timestamp or section reference
- `stage`: which stage this flag originated in
- `downstream_consequences`: array of other flag names that this flag plausibly caused; empty if none or if causation is unclear

### `primary_training_focus` (required, object)

The single highest-leverage skill for the rep to drill. This is the most important output of the analysis.

```json
{
  "skill": "Digging past surface goals to the emotional why",
  "stage_or_dimension": "asks",
  "specific_weakness": "Rep accepts first-layer goals ('I want to lose weight') without follow-up questions. No consequence questions asked. No emotional driver surfaced.",
  "evidence_quotes": [
    "Direct quote 1",
    "Direct quote 2"
  ],
  "why_this_is_the_priority": "This is the upstream cause for most of the call's other failures. Fixing this shifts callback discipline, value communication, and the price reveal automatically because they will all have stronger material to work with.",
  "success_criteria": "In the next consultation, rep asks at least 3 follow-up questions after the surface goal, including at least one consequence question. Reaches an emotional why (something tied to identity, relationships, or specific events) before transitioning to needs."
}
```

Field details:
- `skill`: short, named description of the skill being drilled
- `stage_or_dimension`: the scored stage OR cross-cutting dimension this training focus targets. Valid values are exactly one of:
  - One of the 9 scored stage names: `pre_frame`, `asks`, `needs`, `yesterdays`, `workout`, `pre_frame_guarantees`, `price_anchor`, `close`, `reinforce`
  - One of the 9 cross-cutting dimension names: `qualifying_depth`, `identity_contrast`, `label_and_confirm`, `mirroring_adaptation`, `callback_discipline`, `value_communication`, `conviction_tone`, `momentum_preservation`, `one_question_at_a_time`

  When the leverage point is a cross-cutting skill that manifests across multiple stages (e.g., `callback_discipline` shows up in the diagram, the pre-frame guarantees, and the close), prefer the dimension name over picking one stage arbitrarily. Use a stage name only when the failure is genuinely localized to that one stage (e.g., a hedging price reveal is a `price_anchor` weakness, not a `conviction_tone` weakness, if conviction was strong elsewhere in the call).
- `specific_weakness`: detailed description of the rep's specific failure mode
- `evidence_quotes`: at least two transcript quotes that exemplify the weakness
- `why_this_is_the_priority`: the analyzer's reasoning for choosing this as primary; should reference upstream/downstream causality where relevant
- `success_criteria`: measurable definition of "fixed" — what the rep will do in their next consultation if the drill works

### `secondary_training_focus` (required, object or null)

The second-highest-leverage skill. Same schema as primary. Often a downstream consequence of the primary, in which case the primary alone may collapse it.

The same `stage_or_dimension` rules apply (see `primary_training_focus` above): valid values are exactly one of the 9 scored stage names or one of the 9 cross-cutting dimension names, with the dimension name preferred when the skill spans multiple stages.

If the rep is generally strong and there is no obvious second weakness, set `secondary_training_focus` to null.

### `roleplay_scenario_seed` (required, object or null)

The structured input the roleplay training app uses to generate a practice session. May be `null` for incomplete transcripts where too little of the call was captured to identify a meaningful primary training focus (see "Handling incomplete transcripts" below).

```json
{
  "prospect_profile": {
    "demographic": "Female, late 30s, working mother, mild past gym experience",
    "stated_surface_goal": "Lose weight",
    "actual_emotional_driver": "Feeling distant from her teenage daughter; wants to be a model of consistency",
    "yesterdays_pattern": "Three past gym memberships, each abandoned within 2-3 months; cites lack of accountability",
    "objection_likely": "Price",
    "personality_signals": "Warm but slightly guarded; opens up when validated"
  },
  "stage_to_drill_enum": "asks",
  "drill_scope_description": "Asks stage — surfacing the emotional why through follow-up questions and consequence framing",
  "drill_focus": "Digging past 'I want to lose weight' to reach the emotional why through follow-up questions and consequence framing",
  "difficulty_modifiers": [
    "Prospect gives surface-level answers and requires multiple follow-ups",
    "Prospect deflects emotional questions on the first attempt"
  ],
  "success_definition": "Rep reaches an emotional driver (identity, relationships, fear) within 4 follow-up questions, asks at least one consequence question, and labels the situation back with explicit confirmation before transitioning to yesterdays.",
  "estimated_drill_duration_minutes": 10
}
```

Field details:
- `prospect_profile`: object describing the simulated prospect; should be specific enough that the roleplay app can construct a believable persona
  - `demographic`: rough demographic description
  - `stated_surface_goal`: what the simulated prospect will say first
  - `actual_emotional_driver`: what the rep needs to dig to find
  - `yesterdays_pattern`: past attempts and pattern of failure
  - `objection_likely`: what objection (if any) will surface if the rep doesn't qualify well
  - `personality_signals`: how the prospect will present (warmth, guardedness, etc.)
- `stage_to_drill_enum`: must be exactly one of the 18 valid values (9 scored stage names or 9 cross-cutting dimension names — see `primary_training_focus.stage_or_dimension` above for the full list). Must match `primary_training_focus.stage_or_dimension` exactly so the roleplay app can route the drill to the right scenario template.
- `drill_scope_description`: free-text describing the scope of the drill, including any cross-stage span (e.g., "callback discipline across the diagram, pre-frame guarantees, and price anchor"). This is what the roleplay app uses to generate context for the drill. Unconstrained string — not validated against the enum.
- `drill_focus`: short description of what the rep is practicing
- `difficulty_modifiers`: array of conditions that make the drill harder; chosen based on the rep's specific weakness
- `success_definition`: measurable criterion for "passed the drill"
- `estimated_drill_duration_minutes`: rough estimate of how long the drill will take

### `overall_assessment` (required, string)

A short narrative — under 300 words — that summarizes the call's quality and the analyzer's overall judgment. This is for human readers (the coach, the rep's manager) and provides context the structured fields cannot.

The assessment should:
- Open with a one-sentence verdict (e.g., "A competent call that closed at 2x but left a 4x outcome on the table due to weak callbacks")
- Identify the call's strongest moment
- Identify the call's weakest moment
- Connect the weakness to the recommended training focus
- Avoid jargon; this is meant to be read

## Handling incomplete transcripts

Some transcripts end before the close is reached — the recording cut off, audio failed, the prospect left early, or the input file was truncated. When this happens, the analyzer cannot score what it cannot observe and must signal this honestly rather than fabricating output.

Apply the following overrides:

- `predicted_outcome.bucket`: `"incomplete"`
- `predicted_outcome.confidence`: `"low"`
- `predicted_outcome.actual_outcome_evident`: `false`
- `predicted_outcome.surface_reasoning`: state explicitly that the transcript was incomplete and identify the last stage reached (e.g., `"Transcript ended during the workout stage; pre-frame guarantees, price anchor, close, and reinforce were never reached."`)
- `predicted_outcome.underlying_cause`: may describe what the analyzer observed in the captured portion, but should not speculate about how the call would have ended
- `stage_scores`: include all nine stage entries as usual. For stages that were reached, score normally. For stages that were **not reached**, set `score: null` and note in `what_was_missed` that the stage was not reached.
- `roleplay_scenario_seed`: set to `null` if too little of the call was captured to identify a meaningful primary training focus. If enough was captured to identify a clear weakness (e.g., the transcript ended after a shallow yesterdays section), the seed may still be generated against the available material.
- `primary_training_focus` and `secondary_training_focus`: may still be populated when the captured portion is enough to identify a clear weakness; otherwise set `secondary_training_focus` to `null` and limit `primary_training_focus` to a stage or dimension that was actually observable.

The `incomplete` bucket is defined in `rubric/outcome-buckets.md`. Use it whenever the transcript does not contain the actual outcome — do not infer or guess an outcome for incomplete transcripts. The distinction between `incomplete` (transcript ended before the close) and `not-sold-think-about-it` (call concluded but without commitment) matters for downstream training data quality.

## Validation rules

Before returning the JSON, the analyzer must validate:

1. All required fields are present
2. All scores are integers between 1 and 10, except for stage scores that are `null` (valid only for stages not reached in incomplete transcripts — see "Handling incomplete transcripts")
3. All evidence_quotes arrays contain at least one entry
4. The primary_training_focus targets one of the cross-cutting dimensions or stages defined in the rubric
5. `roleplay_scenario_seed.stage_to_drill_enum` must match `primary_training_focus.stage_or_dimension` exactly. The `drill_scope_description` is free-text and not validated against the enum.
6. All diagnostic_flags entries reference flag names defined in `rubric/diagnostic-flags.md`
7. The predicted_outcome.bucket matches one of the buckets defined in `rubric/outcome-buckets.md`

If any validation fails, fix the output rather than returning invalid JSON. The downstream system will reject malformed output.

## Example output (abbreviated)

A full example, abbreviated for length:

```json
{
  "transcript_id": "2026-01-15-jsmith-sold-2x",
  "analyzed_at": "2026-01-16T14:23:00Z",
  "analyzer_version": "1.0.0",
  "predicted_outcome": {
    "bucket": "sold-2x",
    "confidence": "high",
    "actual_outcome_evident": true,
    "surface_reasoning": "Prospect signed up for 2x training despite rep recommending 4x",
    "underlying_cause": "Qualifying was solid but value communication during the diagram was flat - no callbacks to the prospect's stated identity",
    "primary_diagnostic_flags_implicated": ["no_callbacks_to_discovery", "generic_diagram"]
  },
  "stage_scores": [ ... ],
  "cross_cutting_scores": [ ... ],
  "diagnostic_flags": [ ... ],
  "primary_training_focus": {
    "skill": "Callback discipline during value communication",
    "stage_or_dimension": "callback_discipline",
    "specific_weakness": "Rep gathered solid qualifying material but did not reference it during the diagram or pre-frame guarantees. The future image was painted in generic terms.",
    "evidence_quotes": [...],
    "why_this_is_the_priority": "Qualifying was strong (7-8 across asks, needs, yesterdays). The leverage point now is using the material that was gathered. Fixing this would likely shift outcomes from 2x to 3x or 4x.",
    "success_criteria": "In the next consultation, rep references at least 2 specific details from yesterdays during the diagram, and ties the future image to a specific identity statement the prospect made."
  },
  "secondary_training_focus": null,
  "roleplay_scenario_seed": { ... },
  "overall_assessment": "A solid consultation that closed at 2x but had a 4x outcome on the table. The rep qualified well..."
}
```
