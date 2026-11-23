"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/components/GameProvider";
import { DogAvatar, Segmented, Spinner } from "@/components/ui";
import { getLeaderboard, SIZES, sizeLabel, type DogSize, type LeaderRow, type Period } from "@/lib/game";

const PERIOD_NAMES: Record<Period, string> = { day: "Day", week: "Week", month: "Month" };

export function LeadersPanel() {
  const { sb, version, openDog, dogs } = useGame();
  const [period, setPeriod] = useState<Period>("week");
  const [size, setSize] = useState<DogSize | null>(null);
  const [result, setResult] = useState<{ key: string; rows: LeaderRow[] | null }>({ key: "", rows: null });
  const key = `${period}|${size}|${version}`;

  useEffect(() => {
    if (!sb) return;
    let alive = true;
    getLeaderboard(sb, period, size)
      .then((rows) => alive && setResult({ key, rows }))
      .catch(() => alive && setResult({ key, rows: [] }));
    return () => {
      alive = false;
    };
  }, [sb, period, size, key]);

  const rows = result.key === key ? result.rows : null;
  const mine = new Set(dogs.map((d) => d.id));
  const alpha = rows?.[0];

  return (
    <div className="space-y-4 p-4 pt-5">
      <div>
        <h2 className="text-xl font-bold text-zinc-900">Leaderboard</h2>
        <p className="text-sm text-zinc-500">One point for each different spot your dog marks, once a day.</p>
      </div>

      <Segmented
        label="Time period"
        value={period}
        onChange={setPeriod}
        options={(Object.keys(PERIOD_NAMES) as Period[]).map((p) => ({ value: p, label: PERIOD_NAMES[p] }))}
      />
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Dog size">
        {[{ id: null, label: "All sizes" }, ...SIZES].map((s) => {
          const selected = size === s.id;
          return (
            <button
              key={s.label}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setSize(s.id as DogSize | null)}
              className={`h-8 shrink-0 rounded-full px-3.5 text-sm font-semibold ${
                selected ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {!rows && (
        <div className="flex justify-center py-10 text-zinc-400">
          <Spinner />
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="rounded-3xl bg-gradient-to-b from-amber-50 to-white p-6 text-center ring-1 ring-amber-200/70">
          <p className="text-5xl" aria-hidden="true">
            👑
          </p>
          <p className="mt-2 text-lg font-bold text-zinc-900">The crown is up for grabs</p>
          <p className="mt-1 text-sm text-zinc-600">
            No marks yet this {PERIOD_NAMES[period].toLowerCase()}
            {size ? ` from ${sizeLabel(size).toLowerCase()} dogs` : ""}. The first dog out there is the Alpha.
          </p>
        </div>
      )}

      {alpha && (
        <button
          type="button"
          onClick={() => openDog(alpha.dog_id)}
          className="flex w-full items-center gap-4 rounded-3xl bg-gradient-to-br from-amber-300 via-amber-200 to-yellow-100 p-4 text-left shadow-sm ring-1 ring-amber-300/60"
        >
          <div className="relative">
            <DogAvatar name={alpha.name} path={alpha.photo_path} className="size-20 text-4xl" />
            <span className="absolute -right-1 -top-3 text-3xl" aria-hidden="true">
              👑
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-900/80">
              Alpha of the {PERIOD_NAMES[period]}
              {size ? ` · ${sizeLabel(size)}` : ""}
            </p>
            <p className="truncate text-2xl font-extrabold text-zinc-900">{alpha.name}</p>
            <p className="text-sm text-zinc-700">
              {alpha.points} points · {alpha.blocks} block{alpha.blocks === 1 ? "" : "s"}
            </p>
          </div>
        </button>
      )}

      {rows && rows.length > 1 && (
        <ol className="divide-y divide-zinc-100 overflow-hidden rounded-2xl ring-1 ring-zinc-200">
          {rows.slice(1).map((r) => (
            <li key={r.dog_id}>
              <button
                type="button"
                onClick={() => openDog(r.dog_id)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 ${mine.has(r.dog_id) ? "bg-emerald-50/60" : ""}`}
              >
                <span className="w-6 text-center text-sm font-bold text-zinc-500">{r.rank}</span>
                <DogAvatar name={r.name} path={r.photo_path} className="size-10 text-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-zinc-900">
                    {r.name}
                    {mine.has(r.dog_id) && <span className="ml-1.5 text-xs font-semibold text-emerald-700">You</span>}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {sizeLabel(r.size)}
                    {r.breed ? ` · ${r.breed}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-zinc-900">{r.points}</p>
                  <p className="text-[10px] text-zinc-500">
                    {r.blocks} block{r.blocks === 1 ? "" : "s"}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
