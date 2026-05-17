/**
 * Server-only data layer for /dashboard.
 *
 * listAnalyzedUploads(orgId, filters) — single Prisma query joining
 * Upload to its Analysis, filtered/sorted server-side. Returns the
 * same DashboardRow shape the existing dashboard page already
 * renders (rep + gym + prospect + consultation_date + outcome +
 * status + analyzed_at + json_parse_error + scores{...}).
 *
 * Rep display names are resolved via Clerk in a single batched
 * lookup over the unique repUserIds in the result set, so an N-row
 * dashboard hits the Clerk API exactly once (not N times). Gym is
 * the Organization name.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

export type RowMetadata = {
  upload_id: string;
  rep: string;
  gym: string;
  prospect: string;
  consultation_date: string;
  outcome: string;
  status: string;
  analyzed_at?: string;
  json_parse_error?: string;
};

export type RowScores = {
  overall_score: number | null;
  weak_stage_count: number;
  primary_focus_skill: string;
  predicted_bucket: string;
};

export type DashboardRow = RowMetadata & {
  scores: RowScores | null; // null for parse-error rows
};

// --- filtering & sorting ----------------------------------------------------

export type SortKey =
  | "analyzed_desc"
  | "consultation_desc"
  | "score_asc"
  | "score_desc";

export type FilterState = {
  outcomes: string[];
  rep: string | null; // repUserId (Clerk id) — dropdown values come from Membership lookups
  from: string | null; // YYYY-MM-DD
  to: string | null; // YYYY-MM-DD
  sort: SortKey;
  query: string;
};

export function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
): FilterState {
  const outcomesRaw = searchParams.outcome;
  const outcomes = Array.isArray(outcomesRaw)
    ? outcomesRaw
    : outcomesRaw
      ? outcomesRaw.split(",").filter(Boolean)
      : [];

  const rep =
    typeof searchParams.rep === "string" && searchParams.rep.trim()
      ? searchParams.rep.trim()
      : null;

  const from =
    typeof searchParams.from === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(searchParams.from)
      ? searchParams.from
      : null;

  const to =
    typeof searchParams.to === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(searchParams.to)
      ? searchParams.to
      : null;

  const sortRaw =
    typeof searchParams.sort === "string" ? searchParams.sort : "";
  const sort: SortKey =
    sortRaw === "consultation_desc" ||
    sortRaw === "score_asc" ||
    sortRaw === "score_desc"
      ? sortRaw
      : "analyzed_desc";

  const query =
    typeof searchParams.q === "string" ? searchParams.q.trim() : "";

  return { outcomes, rep, from, to, sort, query };
}

type ClerkUserMin = {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  emailAddresses: { emailAddress: string }[];
  id: string;
};

function repDisplayName(u: ClerkUserMin): string {
  const first = (u.firstName ?? "").trim();
  const last = (u.lastName ?? "").trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  if (u.username?.trim()) return u.username.trim();
  const email = u.emailAddresses[0]?.emailAddress;
  return email ?? u.id;
}

async function batchLookupRepNames(
  repUserIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (repUserIds.length === 0) return out;
  try {
    const client = await clerkClient();
    const res = await client.users.getUserList({ userId: repUserIds });
    for (const u of res.data) {
      out.set(
        u.id,
        repDisplayName({
          firstName: u.firstName,
          lastName: u.lastName,
          username: u.username,
          emailAddresses: u.emailAddresses.map((e) => ({
            emailAddress: e.emailAddress,
          })),
          id: u.id,
        }),
      );
    }
  } catch (err) {
    console.error("[dashboard-data] Clerk batch lookup failed:", err);
  }
  // Any id Clerk didn't return falls back to the raw id at render
  // time (callers use map.get(id) ?? id).
  return out;
}

/**
 * Returns DashboardRows for the given orgId, with filters and sort
 * applied at the Postgres layer (so the result set is already small
 * by the time we batch-lookup Clerk users for rep names).
 *
 * `query` is applied in-memory after Clerk resolution because it
 * needs to match against the rep DISPLAY name (which lives in Clerk),
 * not the repUserId. The other filters are pushed to the DB.
 */
export async function listAnalyzedUploads(
  orgId: string,
  filters: FilterState,
): Promise<DashboardRow[]> {
  // Build the Prisma where clause. status="analyzed" is the only
  // status with a corresponding Analysis row; other statuses are
  // skipped from the dashboard.
  const where: Prisma.UploadWhereInput = {
    orgId,
    status: "analyzed",
  };
  if (filters.outcomes.length > 0) {
    where.outcome = { in: filters.outcomes };
  }
  if (filters.rep) {
    where.repUserId = filters.rep;
  }
  if (filters.from || filters.to) {
    const range: { gte?: Date; lte?: Date } = {};
    if (filters.from) range.gte = new Date(`${filters.from}T00:00:00Z`);
    if (filters.to) range.lte = new Date(`${filters.to}T23:59:59.999Z`);
    where.consultationDate = range;
  }

  // Sort. score_* sorts on Analysis.overallScore — rows with null
  // overallScore (parse-error rows) sort to the bottom regardless of
  // direction.
  let orderBy: Prisma.UploadOrderByWithRelationInput[];
  switch (filters.sort) {
    case "consultation_desc":
      orderBy = [{ consultationDate: "desc" }, { id: "desc" }];
      break;
    case "score_asc":
      orderBy = [
        { analysis: { overallScore: { sort: "asc", nulls: "last" } } },
        { id: "desc" },
      ];
      break;
    case "score_desc":
      orderBy = [
        { analysis: { overallScore: { sort: "desc", nulls: "last" } } },
        { id: "desc" },
      ];
      break;
    case "analyzed_desc":
    default:
      orderBy = [
        { analysis: { analyzedAt: { sort: "desc", nulls: "last" } } },
        { id: "desc" },
      ];
      break;
  }

  const rows = await prisma.upload.findMany({
    where,
    orderBy,
    include: {
      org: true,
      analysis: true,
    },
  });

  // Batch Clerk lookup over unique reps. Single API call regardless
  // of how many rows the dashboard renders.
  const uniqueReps = Array.from(new Set(rows.map((r) => r.repUserId)));
  const repNames = await batchLookupRepNames(uniqueReps);

  const out: DashboardRow[] = rows.map((row) => {
    const a = row.analysis;
    return {
      upload_id: row.id,
      rep: repNames.get(row.repUserId) ?? row.repUserId,
      gym: row.org.name,
      prospect: row.prospectName,
      consultation_date: row.consultationDate.toISOString().slice(0, 10),
      outcome: row.outcome,
      status: row.status,
      analyzed_at: a?.analyzedAt?.toISOString(),
      json_parse_error: a?.jsonParseError ?? undefined,
      scores: a && !a.jsonParseError
        ? {
            overall_score: a.overallScore ?? null,
            weak_stage_count: a.weakStageCount ?? 0,
            primary_focus_skill: a.primaryTrainingFocus ?? "",
            predicted_bucket: a.predictedOutcome ?? "",
          }
        : null,
    };
  });

  if (filters.query) {
    const q = filters.query.toLowerCase();
    return out.filter((r) => {
      return (
        r.prospect.toLowerCase().includes(q) ||
        r.rep.toLowerCase().includes(q) ||
        r.gym.toLowerCase().includes(q) ||
        (r.scores?.primary_focus_skill ?? "").toLowerCase().includes(q)
      );
    });
  }
  return out;
}

/**
 * Helper for the dashboard page: resolves the caller's orgId via
 * Clerk auth + Postgres membership. Returns null if the caller is
 * unauthenticated or has no memberships — the dashboard page treats
 * either as "show empty state, no rows to display".
 */
export async function resolveCallerOrgId(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const m = await prisma.membership.findFirst({
    where: { userId },
    select: { orgId: true },
  });
  return m?.orgId ?? null;
}

/**
 * Returns the list of rep dropdown options for the org: every
 * Membership in the org, resolved to a display name via batched
 * Clerk lookup. Sorted alphabetically.
 */
export async function listOrgReps(
  orgId: string,
): Promise<Array<{ userId: string; name: string }>> {
  const memberships = await prisma.membership.findMany({
    where: { orgId },
    select: { userId: true },
  });
  const ids = memberships.map((m) => m.userId);
  const names = await batchLookupRepNames(ids);
  const list = ids.map((id) => ({
    userId: id,
    name: names.get(id) ?? id,
  }));
  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}
