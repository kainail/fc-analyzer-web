# Outcome Buckets

The analyzer predicts the outcome of every consultation it processes. The prediction is itself a coaching signal — when the predicted outcome differs from the actual outcome (when known), that mismatch reveals either a blind spot in the rep's execution or a calibration issue in the rubric.

## Bucket structure

### Sold buckets

Categorized by the training frequency the prospect committed to. Frequency is a proxy for depth of buy-in — a prospect who commits to 4x/week generally has a stronger emotional foundation than one who commits to 1x/week.

- **`sold-1x`** — prospect committed to 1x/week training
- **`sold-2x`** — prospect committed to 2x/week training
- **`sold-3x`** — prospect committed to 3x/week training
- **`sold-4x`** — prospect committed to 4x/week training (the anchor recommendation in most cases)

### Not-sold buckets

Categorized by the apparent reason for the loss. The list below is a starting set — additional buckets will be added as patterns emerge from accumulated calls. When you predict a not-sold outcome and none of the existing buckets fit cleanly, predict the closest fit and note in the reasoning that the categorization is uncertain.

- **`not-sold-think-about-it`** — prospect declined with "I need to think about it" or equivalent
- **`not-sold-too-expensive`** — prospect explicitly cited price as the blocker
- **`not-sold-decision-maker`** — prospect cited a spouse, partner, or other decision-maker
- **`not-sold-procrastination`** — prospect indicated they wanted to start "later," "after the holidays," "next month," etc.
- **`not-sold-not-interested`** — prospect was disengaged or low-interest from early in the call
- **`not-sold-commitment`** — prospect cited concerns about whether they would actually use the membership

### Special bucket: incomplete

- **`incomplete`** — the transcript ended before the close was reached (recording cut off, audio failure, prospect left early, file truncated). The actual outcome is unknown; the analyzer must not infer one. Use this bucket whenever the call's resolution is not present in the input. The distinction between `incomplete` (transcript ended before the close) and `not-sold-think-about-it` (call concluded without commitment) matters for downstream training data quality — `incomplete` outcomes should never be treated as ground truth. See `schema/analyzer-output.md` ("Handling incomplete transcripts") for the full override behavior triggered by this bucket.

## How to predict

When predicting the outcome, use the transcript evidence directly — what the prospect said, what was agreed to, what objections appeared and how they resolved.

### Process

1. **Identify the actual outcome from the transcript.** In most calls, the outcome is explicit — the prospect either signed up for a specific package, or the call ended without a sale. If the outcome is explicit, the prediction is just a categorization, not a guess.

2. **If sold, identify the frequency.** The frequency the prospect committed to determines the sold bucket. If the prospect committed to a package that doesn't map cleanly to 1x/2x/3x/4x (e.g., a custom plan), categorize by closest match and note the deviation.

3. **If not sold, identify the dominant reason.** This is harder. The prospect's surface objection is often a smokescreen. Apply the qualifying-as-leverage thesis: what was the *real* reason this didn't close? A "too expensive" objection in a call where qualifying was shallow is fundamentally a qualifying failure dressed as a price objection. In the prediction, classify by the surface-level reason (since that's what's actionable for the rep), but note in the reasoning what the underlying cause appears to be.

4. **Note your confidence.** If the outcome is clear and the categorization is clean, confidence is `high`. If the call ended ambiguously (e.g., "I'll think about it and call you back"), or the outcome could plausibly fall in two buckets, confidence is `medium` or `low`. State your reasoning.

### When the call ended ambiguously

Some calls don't resolve in the transcript — the prospect leaves with "I'll let you know" or schedules a follow-up call. In these cases:

- If the prospect made a clear soft commitment (will call back tomorrow, wants to bring spouse), categorize as `not-sold-decision-maker` or `not-sold-think-about-it` based on the specific framing
- If the prospect left without any commitment, categorize as `not-sold-think-about-it`
- Mark confidence as `medium` and note the ambiguity in the reasoning

## Surface objection vs. underlying cause

A core analytical move: distinguish between the *surface objection* and the *underlying cause*.

- **Surface objection**: what the prospect actually said. "It's too expensive." "I need to talk to my husband." "I want to think about it."
- **Underlying cause**: what was actually missing in the call that produced the objection. Almost always: a qualifying gap, a missed callback, weak value communication, or an upstream diagnostic flag.

The bucket prediction uses the surface objection because that's what categorizes the call. But the *reasoning* for the prediction should articulate the underlying cause, because that's what the training focus needs to target.

### Example

A prospect declines with "it's too expensive."

- **Bucket**: `not-sold-too-expensive`
- **Reasoning**: "Prospect cited price as the blocker, but the underlying cause appears to be flat value communication during the diagram. Future image was painted generically without callbacks to the prospect's stated identity (their daughter's wedding). Price felt expensive because value was not anchored to the prospect's specific stated identity. Training focus should target value communication and callback discipline, not price objection handling."

## Output requirement

In the JSON output, the outcome prediction includes:

```json
{
  "predicted_outcome": {
    "bucket": "not-sold-too-expensive",
    "confidence": "high",
    "actual_outcome_evident": true,
    "surface_reasoning": "Prospect explicitly cited price during the close",
    "underlying_cause": "Value communication during the diagram was flat; no callbacks to the prospect's stated identity",
    "primary_diagnostic_flags_implicated": ["generic_diagram", "no_callbacks_to_discovery", "feature_dump"]
  }
}
```

The `actual_outcome_evident` field flags whether the outcome was explicit in the transcript or had to be inferred. This matters for downstream processes — explicit outcomes can be used as ground truth; inferred outcomes need human verification before they go into long-term training data.

## Calibration notes

Two things to watch for as the analyzer accumulates predictions:

1. **Sold-frequency calibration.** Predicting 3x vs 4x is sometimes ambiguous when the prospect agreed in language that doesn't map cleanly. Default to the explicit frequency the prospect named.

2. **Not-sold underlying-cause calibration.** Different reps reading the same transcript will sometimes disagree about the underlying cause. The rubric's view: when in doubt, attribute to the upstream-most plausible cause (qualifying gaps over execution gaps, callback discipline over value communication delivery, etc.). This is consistent with the qualifying-as-leverage thesis — most failures trace to the first 15 minutes.
