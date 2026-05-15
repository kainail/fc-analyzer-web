// Display-name and presentation helpers for analyzer JSON. The
// underlying enums are kept as-is in the JSON (downstream systems
// depend on them); only the human-facing labels are prettified here.

export const STAGE_LABELS: Record<string, string> = {
  pre_frame: "Pre-frame",
  asks: "Asks",
  needs: "Needs",
  yesterdays: "Yesterdays",
  workout: "Workout",
  pre_frame_guarantees: "Pre-frame guarantees",
  price_anchor: "Price anchor",
  close: "Close",
  reinforce: "Reinforce",
};

export const DIMENSION_LABELS: Record<string, string> = {
  qualifying_depth: "Qualifying depth",
  identity_contrast: "Identity contrast",
  label_and_confirm: "Label and confirm",
  mirroring_adaptation: "Mirroring & adaptation",
  callback_discipline: "Callback discipline",
  value_communication: "Value communication",
  conviction_tone: "Conviction & tone",
  momentum_preservation: "Momentum preservation",
  one_question_at_a_time: "One question at a time",
};

export function stageOrDimensionLabel(key: string): string {
  return STAGE_LABELS[key] ?? DIMENSION_LABELS[key] ?? key;
}

// Diagnostic flag names are free-form lowercase-with-underscores. We
// don't have a closed enum here, so just titlecase the underscores.
export function flagLabel(flag: string): string {
  return flag
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// Score color buckets used by chips and small score pills.
// null = not reached (incomplete transcript)
export function scoreColorClasses(score: number | null): string {
  if (score === null) {
    return "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  }
  if (score <= 3) {
    return "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200";
  }
  if (score <= 5) {
    return "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200";
  }
  if (score <= 7) {
    return "bg-yellow-100 text-yellow-900 dark:bg-yellow-950/60 dark:text-yellow-200";
  }
  return "bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200";
}

export function confidenceColorClasses(confidence: string): string {
  switch (confidence) {
    case "high":
      return "bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200";
    case "medium":
      return "bg-yellow-100 text-yellow-900 dark:bg-yellow-950/60 dark:text-yellow-200";
    case "low":
      return "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
  }
}
