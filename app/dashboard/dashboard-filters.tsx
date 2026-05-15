"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { OUTCOME_GROUPS } from "@/lib/outcomes";

type Props = {
  reps: string[];
  initial: {
    outcomes: string[];
    rep: string | null;
    from: string | null;
    to: string | null;
    sort: string;
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

  function pushUrl(next: {
    outcomes: string[];
    rep: string;
    from: string;
    to: string;
    sort: string;
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
    pushUrl({ outcomes: next, rep, from, to, sort });
  }

  function onRepChange(value: string) {
    setRep(value);
    pushUrl({ outcomes, rep: value, from, to, sort });
  }

  function onFromChange(value: string) {
    setFrom(value);
    pushUrl({ outcomes, rep, from: value, to, sort });
  }

  function onToChange(value: string) {
    setTo(value);
    pushUrl({ outcomes, rep, from, to: value, sort });
  }

  function onSortChange(value: string) {
    setSort(value);
    pushUrl({ outcomes, rep, from, to, sort: value });
  }

  function clearAll() {
    setOutcomes([]);
    setRep("");
    setFrom("");
    setTo("");
    setSort("analyzed_desc");
    startTransition(() => router.push("/dashboard"));
  }

  const hasFilters =
    outcomes.length > 0 || rep || from || to || sort !== "analyzed_desc";

  const inputCls =
    "block w-full text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5";
  const labelCls = "text-xs uppercase tracking-wide text-zinc-500 font-medium";

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Filters</h2>
        <div className="flex items-center gap-3">
          {pending && (
            <span className="text-xs text-zinc-500">Updating…</span>
          )}
          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs underline text-zinc-600 dark:text-zinc-400"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      <div>
        <div className={labelCls + " mb-2"}>Outcome</div>
        <div className="space-y-2">
          {OUTCOME_GROUPS.map((g) => (
            <div key={g.label}>
              <div className="text-[11px] text-zinc-500 font-mono mb-1">
                {g.label}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.values.map((v) => {
                  const active = outcomes.includes(v);
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => toggleOutcome(v)}
                      className={
                        "text-xs px-2 py-1 rounded-full border " +
                        (active
                          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                          : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900")
                      }
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="rep-filter">
            Rep
          </label>
          <select
            id="rep-filter"
            className={inputCls + " mt-1"}
            value={rep}
            onChange={(e) => onRepChange(e.target.value)}
          >
            <option value="">All reps</option>
            {reps.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="sort-filter">
            Sort
          </label>
          <select
            id="sort-filter"
            className={inputCls + " mt-1"}
            value={sort}
            onChange={(e) => onSortChange(e.target.value)}
          >
            <option value="analyzed_desc">Newest analyzed first</option>
            <option value="consultation_desc">Newest consultation first</option>
            <option value="score_asc">Lowest score first</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="from-filter">
            Consultation date from
          </label>
          <input
            id="from-filter"
            type="date"
            className={inputCls + " mt-1"}
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="to-filter">
            to
          </label>
          <input
            id="to-filter"
            type="date"
            className={inputCls + " mt-1"}
            value={to}
            onChange={(e) => onToChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
