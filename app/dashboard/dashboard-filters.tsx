"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { OUTCOME_GROUPS } from "@/lib/outcomes";
import { Search } from "@/lib/icons";

type Props = {
  reps: string[];
  initial: {
    outcomes: string[];
    rep: string | null;
    from: string | null;
    to: string | null;
    sort: string;
    query: string;
  };
};

export default function DashboardFilters({ reps, initial }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [outcomes, setOutcomes] = useState<string[]>(initial.outcomes);
  const [rep, setRep] = useState<string>(initial.rep ?? "");
  const [from, setFrom] = useState<string>(initial.from ?? "");
  const [to, setTo] = useState<string>(initial.to ?? "");
  const [sort, setSort] = useState<string>(initial.sort);
  const [query, setQuery] = useState<string>(initial.query);

  function pushUrl(next: {
    outcomes: string[];
    rep: string;
    from: string;
    to: string;
    sort: string;
    query: string;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.outcomes.length) params.set("outcome", next.outcomes.join(","));
    else params.delete("outcome");
    if (next.rep) params.set("rep", next.rep);
    else params.delete("rep");
    if (next.from) params.set("from", next.from);
    else params.delete("from");
    if (next.to) params.set("to", next.to);
    else params.delete("to");
    if (next.sort && next.sort !== "analyzed_desc") params.set("sort", next.sort);
    else params.delete("sort");
    if (next.query.trim()) params.set("q", next.query.trim());
    else params.delete("q");
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/dashboard?${qs}` : "/dashboard");
    });
  }

  function toggleOutcome(value: string) {
    const next = outcomes.includes(value)
      ? outcomes.filter((v) => v !== value)
      : [...outcomes, value];
    setOutcomes(next);
    pushUrl({ outcomes: next, rep, from, to, sort, query });
  }

  function selectGroup(values: readonly string[]) {
    // Toggle: if every option in this group is already selected, clear them.
    const allOn = values.every((v) => outcomes.includes(v));
    const next = allOn
      ? outcomes.filter((v) => !values.includes(v))
      : Array.from(new Set([...outcomes, ...values]));
    setOutcomes(next);
    pushUrl({ outcomes: next, rep, from, to, sort, query });
  }

  function clearAll() {
    setOutcomes([]);
    setRep("");
    setFrom("");
    setTo("");
    setSort("analyzed_desc");
    setQuery("");
    startTransition(() => router.push("/dashboard"));
  }

  const hasFilters =
    outcomes.length > 0 ||
    rep ||
    from ||
    to ||
    sort !== "analyzed_desc" ||
    query.trim();

  const soldValues = OUTCOME_GROUPS[0].values;
  const notSoldValues = OUTCOME_GROUPS[1].values;
  const allSoldOn = soldValues.every((v) => outcomes.includes(v));
  const allNotSoldOn = notSoldValues.every((v) => outcomes.includes(v));

  function chipStyle(active: boolean, tone?: "sold" | "notsold"): React.CSSProperties {
    if (active) {
      const bg =
        tone === "sold"
          ? "var(--sold-bg)"
          : tone === "notsold"
            ? "var(--notsold-bg)"
            : "var(--primary-50)";
      const fg =
        tone === "sold"
          ? "var(--sold)"
          : tone === "notsold"
            ? "var(--notsold)"
            : "var(--primary)";
      return {
        background: bg,
        color: fg,
      };
    }
    return { background: "transparent", color: "var(--ink-2)" };
  }

  return (
    <div className="card" style={{ padding: 12, marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {/* Outcome chips: ALL + group toggles + group expansions */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              setOutcomes([]);
              pushUrl({ outcomes: [], rep, from, to, sort, query });
            }}
            style={{
              border: 0,
              padding: "5px 10px",
              borderRadius: 7,
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 80ms",
              ...chipStyle(outcomes.length === 0),
            }}
          >
            All
          </button>

          <button
            type="button"
            onClick={() => selectGroup(soldValues)}
            style={{
              border: 0,
              padding: "5px 10px",
              borderRadius: 7,
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              ...chipStyle(allSoldOn, "sold"),
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: "var(--sold)",
                display: "inline-block",
              }}
            />
            SOLD
          </button>

          <div style={{ display: "inline-flex", gap: 4 }}>
            {soldValues.map((v) => {
              const on = outcomes.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggleOutcome(v)}
                  style={{
                    border: on
                      ? "1px solid var(--sold)"
                      : "1px solid var(--border)",
                    padding: "3px 8px",
                    borderRadius: 999,
                    fontSize: 11.5,
                    background: on ? "var(--sold-bg)" : "var(--surface)",
                    color: on ? "var(--sold)" : "var(--ink-3)",
                    cursor: "pointer",
                  }}
                >
                  {v}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => selectGroup(notSoldValues)}
            style={{
              border: 0,
              padding: "5px 10px",
              borderRadius: 7,
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              ...chipStyle(allNotSoldOn, "notsold"),
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: "var(--notsold)",
                display: "inline-block",
              }}
            />
            NOT SOLD
          </button>

          <div style={{ display: "inline-flex", gap: 4 }}>
            {notSoldValues.map((v) => {
              const on = outcomes.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggleOutcome(v)}
                  style={{
                    border: on
                      ? "1px solid var(--notsold)"
                      : "1px solid var(--border)",
                    padding: "3px 8px",
                    borderRadius: 999,
                    fontSize: 11.5,
                    background: on ? "var(--notsold-bg)" : "var(--surface)",
                    color: on ? "var(--notsold)" : "var(--ink-3)",
                    cursor: "pointer",
                  }}
                >
                  {v}
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            width: 1,
            height: 22,
            background: "var(--border)",
            margin: "0 4px",
          }}
        />

        <select
          className="select"
          style={{ height: 30, fontSize: 12.5, width: "auto", minWidth: 140 }}
          value={rep}
          onChange={(e) => {
            const next = e.target.value;
            setRep(next);
            pushUrl({ outcomes, rep: next, from, to, sort, query });
          }}
        >
          <option value="">All reps</option>
          {reps.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <input
          type="date"
          className="input"
          style={{ height: 30, fontSize: 12.5, width: "auto" }}
          value={from}
          onChange={(e) => {
            const next = e.target.value;
            setFrom(next);
            pushUrl({ outcomes, rep, from: next, to, sort, query });
          }}
          aria-label="From date"
        />
        <input
          type="date"
          className="input"
          style={{ height: 30, fontSize: 12.5, width: "auto" }}
          value={to}
          onChange={(e) => {
            const next = e.target.value;
            setTo(next);
            pushUrl({ outcomes, rep, from, to: next, sort, query });
          }}
          aria-label="To date"
        />

        <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--ink-4)",
            }}
          />
          <input
            className="input"
            style={{ height: 30, fontSize: 12.5, paddingLeft: 32 }}
            placeholder="Search prospect, rep, drill focus…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                pushUrl({ outcomes, rep, from, to, sort, query });
              }
            }}
            onBlur={() => pushUrl({ outcomes, rep, from, to, sort, query })}
          />
        </div>

        <select
          className="select"
          style={{ height: 30, fontSize: 12.5, width: "auto" }}
          value={sort}
          onChange={(e) => {
            const next = e.target.value;
            setSort(next);
            pushUrl({ outcomes, rep, from, to, sort: next, query });
          }}
        >
          <option value="analyzed_desc">Most recent</option>
          <option value="consultation_desc">Newest consultation</option>
          <option value="score_asc">Score: low → high</option>
          <option value="score_desc">Score: high → low</option>
        </select>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginLeft: "auto",
          }}
        >
          {pending && (
            <span className="mono faint" style={{ fontSize: 11 }}>
              Updating…
            </span>
          )}
          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="btn btn-ghost btn-sm"
            >
              Clear all
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
