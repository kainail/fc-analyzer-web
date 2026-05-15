// Outcome bucket constants shared between the upload form, the upload
// route's allowed-values check, and the dashboard's filter UI. Source
// of truth — do not duplicate this list elsewhere.

export const OUTCOME_GROUPS: ReadonlyArray<{
  label: string;
  values: ReadonlyArray<string>;
}> = [
  {
    label: "SOLD",
    values: [
      "sold-1x",
      "sold-2x",
      "sold-3x",
      "sold-4x",
      "transformation-challenge",
    ],
  },
  {
    label: "NOT SOLD",
    values: [
      "not-sold-think-about-it",
      "not-sold-too-expensive",
      "not-sold-decision-maker",
      "not-sold-procrastination",
      "not-sold-not-interested",
      "not-sold-commitment",
    ],
  },
];

export const ALL_OUTCOMES: ReadonlyArray<string> = OUTCOME_GROUPS.flatMap(
  (g) => g.values,
);

export const ALLOWED_OUTCOMES = new Set<string>(ALL_OUTCOMES);
