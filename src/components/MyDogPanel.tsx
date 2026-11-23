"use client";

import { useEffect, useState } from "react";
import { AccountSection } from "@/components/AccountSection";
import { DogForm } from "@/components/DogForm";
import { useGame } from "@/components/GameProvider";
import { Button, DogAvatar, PlusIcon, Spinner } from "@/components/ui";
import { BADGES } from "@/lib/badges";
import { clearHiddenZone, deleteDog, friendlyError, getDogCard, sizeLabel, updateDog, type DogCardData } from "@/lib/game";

export function MyDogPanel({ onPickZone, onShowMap }: { onPickZone: () => void; onShowMap: () => void }) {
  const { sb, ready, dogs, activeDog, setActiveDog, zone, refresh, version, bump, openDog } = useGame();
  const [mode, setMode] = useState<"view" | "edit" | "add">("view");

  if (!sb) {
    return (
      <div className="p-4 text-sm text-zinc-600">
        This copy of AlphaDog isn&apos;t connected to the database, so dog profiles are switched off.
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="flex justify-center p-10 text-zinc-400">
        <Spinner />
      </div>
    );
  }

  if (!activeDog || mode === "add") {
    return (
      <div className="space-y-5 p-4">
        {!activeDog && (
          <div className="rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-800 p-5 text-white">
            <p className="text-3xl" aria-hidden="true">
              🐾👑
            </p>
            <h2 className="mt-2 text-xl font-bold">Every walk is a turf war</h2>
            <p className="mt-1 text-sm leading-6 text-emerald-50">
              Tap <strong>Mark</strong> when your dog pees. Each new spot is a point. The dog with the most points on a
              block owns it. Win badges, take the Alpha crown, and woof at the neighbors.
            </p>
          </div>
        )}
        <div>
          <h2 className="mb-3 text-lg font-bold text-zinc-900">{activeDog ? "Add another dog" : "Make your dog's profile"}</h2>
          <DogForm onDone={() => setMode("view")} onCancel={activeDog ? () => setMode("view") : undefined} />
        </div>
        {!activeDog && <AccountSection />}
      </div>
    );
  }

  if (mode === "edit") {
    return (
      <div className="p-4">
        <h2 className="mb-3 text-lg font-bold text-zinc-900">Edit {activeDog.name}</h2>
        <DogForm key={activeDog.id} dog={activeDog} onDone={() => setMode("view")} onCancel={() => setMode("view")} />
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4">
      {(
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4" role="radiogroup" aria-label="Which dog is walking">
          {dogs.map((d) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={d.id === activeDog.id}
              onClick={() => setActiveDog(d.id)}
              className="flex w-16 shrink-0 flex-col items-center gap-1"
            >
              <span className={`rounded-full p-0.5 ${d.id === activeDog.id ? "ring-2 ring-emerald-500" : ""}`}>
                <DogAvatar name={d.name} path={d.photo_path} className="size-12 text-2xl" />
              </span>
              <span className={`w-full truncate text-center text-xs ${d.id === activeDog.id ? "font-semibold text-zinc-900" : "text-zinc-500"}`}>
                {d.name}
              </span>
            </button>
          ))}
          {dogs.length < 4 && (
            <button type="button" onClick={() => setMode("add")} className="flex w-16 shrink-0 flex-col items-center gap-1">
              <span className="flex size-[52px] items-center justify-center rounded-full border-2 border-dashed border-zinc-300 text-zinc-400">
                <PlusIcon className="size-5" />
              </span>
              <span className="text-xs text-zinc-500">Add dog</span>
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-4">
        <DogAvatar name={activeDog.name} path={activeDog.photo_path} className="size-20 text-4xl" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-bold text-zinc-900">{activeDog.name}</h2>
          <p className="truncate text-sm text-zinc-500">
            {sizeLabel(activeDog.size)}
            {activeDog.breed ? ` · ${activeDog.breed}` : ""}
          </p>
          <div className="mt-1 flex gap-3 text-sm font-semibold">
            <button type="button" onClick={() => setMode("edit")} className="text-emerald-700">
              Edit profile
            </button>
            <button type="button" onClick={() => openDog(activeDog.id)} className="text-zinc-500">
              See public card
            </button>
          </div>
        </div>
      </div>

      <Stats key={`${activeDog.id}|${version}`} dogId={activeDog.id} />

      <HiddenZone zone={zone} onPick={onPickZone} onShowMap={onShowMap} onCleared={refresh} />

      <GhostToggle
        name={activeDog.name}
        ghost={activeDog.ghost}
        onChange={async (ghost) => {
          await updateDog(sb, activeDog.id, { ghost });
          await refresh();
          bump();
        }}
      />

      <AccountSection />

      <RemoveDog
        name={activeDog.name}
        onRemove={async () => {
          await deleteDog(sb, activeDog.id);
          await refresh();
          bump();
        }}
      />
    </div>
  );
}

function Stats({ dogId }: { dogId: string }) {
  const { sb } = useGame();
  const [card, setCard] = useState<DogCardData | null>(null);
  useEffect(() => {
    if (!sb) return;
    let alive = true;
    getDogCard(sb, dogId)
      .then((c) => alive && setCard(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sb, dogId]);

  return (
    <>
      <div className="grid grid-cols-4 gap-2 text-center">
        <Stat n={card?.points_today} label="Today" />
        <Stat n={card?.points_week} label="This week" />
        <Stat n={card?.blocks} label="Blocks held" />
        <Stat n={card?.streak} label="Day streak" />
      </div>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Badges</h3>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {BADGES.map((b) => {
            const n = card?.badges[b.key] ?? 0;
            return (
              <li
                key={b.key}
                className={`rounded-2xl p-2.5 text-center ${n ? "bg-amber-50 ring-1 ring-amber-200" : "bg-zinc-50 opacity-60"}`}
                title={b.how}
              >
                <p className={`text-2xl ${n ? "" : "grayscale"}`} aria-hidden="true">
                  {b.icon}
                </p>
                <p className="mt-1 text-xs font-semibold leading-4 text-zinc-900">
                  {b.name}
                  {n > 1 && <span className="text-amber-700"> ×{n}</span>}
                </p>
                <p className="mt-0.5 text-[10px] leading-3 text-zinc-500">{b.how}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

function Stat({ n, label }: { n: number | undefined; label: string }) {
  return (
    <div className="rounded-2xl bg-zinc-50 px-1 py-2.5">
      <p className="text-xl font-bold leading-none text-zinc-900">{n ?? "·"}</p>
      <p className="mt-1 text-[10px] font-medium leading-3 text-zinc-500">{label}</p>
    </div>
  );
}

function HiddenZone({
  zone,
  onPick,
  onShowMap,
  onCleared,
}: {
  zone: string[] | null;
  onPick: () => void;
  onShowMap: () => void;
  onCleared: () => Promise<void>;
}) {
  const { sb } = useGame();
  const [confirming, setConfirming] = useState(false);
  if (!zone) {
    return (
      <section className="rounded-2xl bg-violet-50 p-4 ring-1 ring-violet-200">
        <h3 className="font-semibold text-violet-950">Set your hidden zone</h3>
        <p className="mt-1 text-sm leading-6 text-violet-900">
          Most marks happen near home. Inside your hidden zone your marks still count, but blocks you win there show as
          &quot;Held by a local&quot;, so nobody can see where your dog lives. We never save your home spot.
        </p>
        <Button className="mt-3 bg-violet-600 hover:bg-violet-700" onClick={onPick}>
          Set hidden zone
        </Button>
      </section>
    );
  }
  return (
    <section className="rounded-2xl p-4 ring-1 ring-zinc-200">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-zinc-900">Hidden zone</h3>
        <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-800">On · {zone.length} blocks</span>
      </div>
      <p className="mt-1 text-sm text-zinc-600">
        Blocks you win in the purple dashed area show as &quot;Held by a local&quot; to everyone else.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button kind="secondary" className="h-9" onClick={onShowMap}>
          Show on map
        </Button>
        <Button kind="secondary" className="h-9" onClick={onPick}>
          Move it
        </Button>
        <Button
          kind="danger"
          className="h-9"
          onClick={async () => {
            if (!confirming) return setConfirming(true);
            if (sb) await clearHiddenZone(sb);
            setConfirming(false);
            await onCleared();
          }}
        >
          {confirming ? "Tap again to remove" : "Remove"}
        </Button>
      </div>
    </section>
  );
}

function GhostToggle({ name, ghost, onChange }: { name: string; ghost: boolean; onChange: (ghost: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="flex items-start gap-3 rounded-2xl p-4 ring-1 ring-zinc-200">
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-zinc-900">Ghost mode 👻</h3>
        <p className="mt-1 text-sm text-zinc-600">
          {name} disappears from the turf map, leaderboards and woofs. Marks still earn points and badges that only you
          can see.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={ghost}
        aria-label="Ghost mode"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onChange(!ghost).catch(() => {});
          setBusy(false);
        }}
        className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition ${ghost ? "bg-zinc-800" : "bg-zinc-300"} disabled:opacity-60`}
      >
        <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${ghost ? "left-6" : "left-1"}`} />
      </button>
    </section>
  );
}

function RemoveDog({ name, onRemove }: { name: string; onRemove: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="pb-4 text-center">
      {error && <p className="mb-2 text-sm text-red-700">{error}</p>}
      <button
        type="button"
        onClick={async () => {
          if (!confirming) return setConfirming(true);
          try {
            await onRemove();
          } catch (err) {
            setError(friendlyError(err));
          }
          setConfirming(false);
        }}
        className="text-sm font-semibold text-red-600"
      >
        {confirming ? `Tap again to remove ${name} and all their marks` : `Remove ${name}`}
      </button>
    </div>
  );
}
