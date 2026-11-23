"use client";

import { useRef, useEffect } from "react";
import { TURF_COLORS } from "@/components/AlphaMap";
import { Sheet, SheetHeader, useEscape } from "@/components/ui";
import { BADGES } from "@/lib/badges";
import { FEATURE_TYPES } from "@/lib/feature-types";
import { REPORT_GROUPS, REPORT_KINDS, type ReportKind } from "@/lib/reports";

/** Pee is a Mark now, so the report sheet covers everything else. */
const REPORT_SHEET_KINDS = (Object.keys(REPORT_KINDS) as ReportKind[]).filter((k) => k !== "pee");

export function ReportSheet({
  saving,
  locating,
  onPick,
  onCancel,
}: {
  saving: boolean;
  locating: boolean;
  onPick: (kind: ReportKind) => void;
  onCancel: () => void;
}) {
  useEscape(onCancel);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 lg:bottom-6 lg:flex lg:justify-center" role="dialog" aria-labelledby="report-title">
      <div className="pointer-events-auto w-full rounded-t-3xl bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-2xl ring-1 ring-black/5 lg:max-w-md lg:rounded-3xl lg:pb-4">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-zinc-200 lg:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="report-title" className="text-base font-bold text-zinc-900">
              What&apos;s here?
            </h2>
            <p className="text-xs text-zinc-500">
              {locating ? "Finding your location…" : saving ? "Saving…" : "Drag the map to the spot, then tap what you saw."}
            </p>
          </div>
          <button type="button" onClick={onCancel} className="-mr-1 rounded-full px-3 py-1 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">
            Cancel
          </button>
        </div>

        {REPORT_GROUPS.map((g) => {
          const kinds = REPORT_SHEET_KINDS.filter((k) => REPORT_KINDS[k].group === g.id);
          if (kinds.length === 0) return null;
          return (
            <div key={g.id} className="mt-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{g.title}</h3>
              <div className={`mt-1.5 grid gap-2 ${kinds.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                {kinds.map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={saving || locating}
                    onClick={() => onPick(k)}
                    className="flex h-12 items-center gap-2 rounded-xl border border-zinc-200 px-2.5 text-left text-[13px] font-semibold leading-tight text-zinc-800 hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-50"
                  >
                    <span className="size-3 shrink-0 rounded-full" style={{ background: REPORT_KINDS[k].color }} />
                    {REPORT_KINDS[k].short}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        <p className="mt-3 text-[11px] leading-4 text-zinc-500">
          Reports are anonymous. Poop only shows blended into the heat once a few people report the same spot.
        </p>
      </div>
    </div>
  );
}

export function InfoSheet({ areaName, onClose }: { areaName: string; onClose: () => void }) {
  const closeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    closeRef.current?.querySelector("button")?.focus();
  }, []);

  return (
    <Sheet onClose={onClose} label="How AlphaDog works" modal>
      <div ref={closeRef}>
        <SheetHeader title="How AlphaDog works" sub={`${areaName} pilot`} onClose={onClose} />
      </div>

      <div className="mt-3 space-y-3 text-sm leading-6 text-zinc-700">
        <p>
          <strong>Mark your turf.</strong> When your dog pees, tap <strong>Mark</strong>. Every different spot your
          dog marks is a point, once per spot per day. Marks use your phone&apos;s location, so you have to actually be
          there.
        </p>
        <p>
          <strong>Own the block.</strong> The map is split into blocks centered on street corners. Whoever has the most
          points on a block over the last 7 days holds it. The turf map updates every hour.
        </p>
        <ul className="space-y-1">
          <Legend color={TURF_COLORS.mine} text="Your turf" />
          <Legend color={TURF_COLORS.taken} text="Another dog's turf. Tap it to see who." />
          <Legend color={TURF_COLORS.local} text="Held by a local. Its name stays private." />
          <Legend color="#7c3aed" text="Your hidden zone (only you see this)" dashed />
        </ul>
        <p>
          <strong>Hidden zone.</strong> Blocks you win near home show as &quot;Held by a local&quot;, so nobody can see
          where your dog lives. We only save the blocks, never your home spot. <strong>Ghost mode</strong> hides your
          dog from everything public.
        </p>
        <p>
          <strong>Alpha of the Day, Week and Month</strong> goes to the dog with the most points, overall and by size.
        </p>
      </div>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">Badges</h3>
      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-zinc-700">
        {BADGES.map((b) => (
          <li key={b.key} className="flex gap-2">
            <span aria-hidden="true">{b.icon}</span>
            <span>
              <strong className="font-semibold text-zinc-900">{b.name}:</strong> {b.how.toLowerCase()}
            </span>
          </li>
        ))}
      </ul>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">Seek and Avoid</h3>
      <p className="mt-1 text-sm leading-6 text-zinc-700">
        The heat shows where dogs most likely go, built from OpenStreetMap and from marks once 3 or more dogs use a
        spot. <strong className="text-emerald-700">Seek</strong> shows it in green so your dog can go fast.{" "}
        <strong className="text-red-700">Avoid</strong> shows it in red so you can steer around other dogs.
      </p>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">Zoom in to see the spots</h3>
      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-zinc-700">
        {Object.values(FEATURE_TYPES).map((t) => (
          <li key={t.key} className="flex items-center gap-2">
            <span className="size-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: t.color }} />
            {t.label}
          </li>
        ))}
      </ul>

      <p className="mt-5 text-xs leading-5 text-zinc-500">
        Map data ©{" "}
        <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap contributors
        </a>
        . Base map by{" "}
        <a className="underline" href="https://openfreemap.org" target="_blank" rel="noreferrer">
          OpenFreeMap
        </a>
        .
      </p>
    </Sheet>
  );
}

function Legend({ color, text, dashed }: { color: string; text: string; dashed?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className="size-4 shrink-0 rounded"
        style={dashed ? { border: `2px dashed ${color}`, background: `${color}22` } : { background: color, opacity: 0.7 }}
      />
      {text}
    </li>
  );
}
