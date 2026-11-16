"use client";

import { useEffect, useRef, useState } from "react";
import AlphaMap, { type MapStatus, type Mode } from "@/components/AlphaMap";
import { DEFAULT_AREA } from "@/lib/areas";
import { FEATURE_TYPES } from "@/lib/feature-types";

export default function AppShell() {
  const area = DEFAULT_AREA;
  const [mode, setMode] = useState<Mode>("seek");
  const [status, setStatus] = useState<MapStatus>("loading");
  const [outside, setOutside] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [recenterKey, setRecenterKey] = useState(0);

  return (
    <div className="fixed inset-0 overflow-hidden bg-zinc-100">
      <AlphaMap
        area={area}
        mode={mode}
        recenterKey={recenterKey}
        onStatus={setStatus}
        onOutsideArea={setOutside}
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-start justify-between gap-2">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-2xl bg-white/95 py-2 pl-2 pr-3.5 shadow-md ring-1 ring-black/5 backdrop-blur">
            <PawIcon className="size-8 shrink-0" />
            <div className="leading-tight">
              <h1 className="text-[15px] font-bold tracking-tight text-zinc-900">AlphaDog</h1>
              <p className="text-[11px] font-medium text-zinc-500">{area.name} pilot</p>
            </div>
          </div>
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
        <div className="flex justify-center">
          <p className="rounded-full bg-zinc-900/85 px-3 py-1.5 text-center text-xs font-medium text-white shadow-md backdrop-blur">
            {mode === "seek"
              ? "Darker green means dogs most likely go there"
              : "Red marks dog hot spots to steer around"}
          </p>
        </div>
      </header>

      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-10 flex justify-center px-3">
        {status === "loading" && <Toast>Loading dog spots…</Toast>}
        {status === "error" && <Toast>Couldn&apos;t load the dog spots. Check your connection and reload.</Toast>}
        {status === "ready" && outside && (
          <Toast>
            <span>You&apos;re outside the {area.name} pilot area.</span>
            <button
              type="button"
              onClick={() => {
                setOutside(false);
                setRecenterKey((k) => k + 1);
              }}
              className="pointer-events-auto ml-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-900"
            >
              Show {area.name}
            </button>
          </Toast>
        )}
      </div>

      <button
        type="button"
        onClick={() => setInfoOpen(true)}
        className="absolute bottom-[calc(env(safe-area-inset-bottom)+2.1rem)] left-3 z-10 flex h-11 items-center gap-2 rounded-2xl bg-white/95 px-4 text-sm font-semibold text-zinc-800 shadow-md ring-1 ring-black/5 backdrop-blur active:scale-[0.98]"
      >
        <InfoIcon className="size-4 text-emerald-700" />
        How this map works
      </button>

      {infoOpen && <InfoSheet areaName={area.name} onClose={() => setInfoOpen(false)} />}
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const options: { value: Mode; label: string; active: string }[] = [
    { value: "seek", label: "Seek", active: "bg-emerald-600 text-white shadow" },
    { value: "avoid", label: "Avoid", active: "bg-red-600 text-white shadow" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Map mode"
      className="pointer-events-auto flex rounded-2xl bg-white/95 p-1 shadow-md ring-1 ring-black/5 backdrop-blur"
    >
      {options.map((o) => {
        const selected = mode === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={`h-10 rounded-xl px-4 text-sm font-semibold transition-colors ${
              selected ? o.active : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Toast({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex max-w-sm items-center rounded-2xl bg-zinc-900/90 px-4 py-2.5 text-sm text-white shadow-lg backdrop-blur"
    >
      {children}
    </div>
  );
}

function InfoSheet({ areaName, onClose }: { areaName: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="info-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <div className="relative max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 shadow-2xl sm:rounded-3xl sm:pb-5">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-200 sm:hidden" />
        <div className="flex items-start justify-between gap-4">
          <h2 id="info-title" className="text-lg font-bold text-zinc-900">
            How this map works
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="-mr-1 rounded-full px-3 py-1 text-sm font-semibold text-zinc-500 hover:bg-zinc-100"
          >
            Close
          </button>
        </div>

        <div className="mt-3 space-y-3 text-sm leading-6 text-zinc-700">
          <p>
            The heat is our best guess at where dogs stop, built from OpenStreetMap. We look at three
            things: where people live, where they walk (sidewalks, quiet streets, park edges), and the
            spots dogs like to stop at.
          </p>
          <p>
            <strong className="text-emerald-700">Seek</strong> shows the likely spots in green, so you
            can head there when your dog needs a quick stop.{" "}
            <strong className="text-red-700">Avoid</strong> shows the same spots in red, so you can
            steer around other dogs.
          </p>
        </div>

        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Zoom in to see the spots
        </h3>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-zinc-700">
          {Object.values(FEATURE_TYPES).map((t) => (
            <li key={t.key} className="flex items-center gap-2">
              <span className="size-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: t.color }} />
              {t.label}
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
          <strong>Coming next:</strong> tap to report where your dog went, messes left behind, and busy
          spots. Every report makes the map smarter for everyone in {areaName}.
        </div>

        <p className="mt-4 text-xs leading-5 text-zinc-500">
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
      </div>
    </div>
  );
}

function PawIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#065f46" />
      <g fill="#ffffff">
        <path d="M256 236c-52 0-118 70-118 128 0 40 30 58 62 58 24 0 38-12 56-12s32 12 56 12c32 0 62-18 62-58 0-58-66-128-118-128z" />
        <ellipse cx="146" cy="232" rx="40" ry="52" transform="rotate(-24 146 232)" />
        <ellipse cx="214" cy="146" rx="40" ry="56" transform="rotate(-8 214 146)" />
        <ellipse cx="298" cy="146" rx="40" ry="56" transform="rotate(8 298 146)" />
        <ellipse cx="366" cy="232" rx="40" ry="52" transform="rotate(24 366 232)" />
      </g>
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.25v3.25a.75.75 0 0 0 1.5 0V9.75A.75.75 0 0 0 10 9H9Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
