// Display formatters used across the redesigned UI. Pure, client-safe.

export function fmtDate(iso: string): string {
  // Use noon-UTC to dodge timezone-rollover off-by-one on date-only strings.
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtDateLong(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Maps a 1–10 score (or null for unscored) to a band the design CSS knows:
// red ≤ 3, amber ≤ 5, yellow ≤ 7, green > 7. Used for score-pill classes.
export type ScoreBand = "red" | "amber" | "yellow" | "green" | "neutral";

export function scoreBand(score: number | null | undefined): ScoreBand {
  if (score == null) return "neutral";
  if (score <= 3) return "red";
  if (score <= 5) return "amber";
  if (score <= 7) return "yellow";
  return "green";
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

export function bandClass(band: ScoreBand): string {
  return `score-${band}`;
}
