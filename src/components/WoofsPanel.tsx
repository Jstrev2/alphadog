"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/components/GameProvider";
import { Button, DogAvatar, Spinner, timeAgo } from "@/components/ui";
import { friendlyError, getMyWoofs, sendWoof, sizeLabel, type WoofRow } from "@/lib/game";

export const woofsSeenKey = (dogId: string) => `alphadog.woofsSeen.${dogId}`;

export function WoofsPanel({ onCreateDog, onSeen }: { onCreateDog: () => void; onSeen: () => void }) {
  const { sb, activeDog, version, openDog } = useGame();
  const [result, setResult] = useState<{ key: string; rows: WoofRow[] | null }>({ key: "", rows: null });
  const [sending, setSending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const key = `${activeDog?.id}|${version}`;

  useEffect(() => {
    if (!sb || !activeDog) return;
    let alive = true;
    getMyWoofs(sb, activeDog.id)
      .then((rows) => {
        if (!alive) return;
        setResult({ key, rows });
        window.localStorage.setItem(woofsSeenKey(activeDog.id), new Date().toISOString());
        onSeen();
      })
      .catch(() => alive && setResult({ key, rows: [] }));
    return () => {
      alive = false;
    };
  }, [sb, activeDog, key, onSeen]);

  if (!activeDog) {
    return (
      <div className="space-y-3 p-4">
        <h2 className="text-xl font-bold text-zinc-900">Woofs</h2>
        <p className="text-sm text-zinc-600">
          Tap any dog on the leaderboard or a block to see its card, then hit Woof. When two dogs woof at each
          other, they&apos;re pack.
        </p>
        <Button onClick={onCreateDog}>Add your dog</Button>
      </div>
    );
  }

  const rows = result.key === key ? result.rows : null;
  const pack = rows?.filter((r) => r.pack) ?? [];
  const waiting = rows?.filter((r) => !r.pack) ?? [];

  const woofBack = async (r: WoofRow) => {
    if (!sb) return;
    setSending(r.dog_id);
    setMessage(null);
    try {
      await sendWoof(sb, activeDog.id, r.dog_id);
      setResult((prev) => ({
        ...prev,
        rows: prev.rows?.map((x) => (x.dog_id === r.dog_id ? { ...x, pack: true } : x)) ?? null,
      }));
      setMessage(`You and ${r.name} are pack now.`);
    } catch (err) {
      setMessage(friendlyError(err));
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h2 className="text-xl font-bold text-zinc-900">Woofs for {activeDog.name}</h2>
        <p className="text-sm text-zinc-500">Woof back to make it pack.</p>
      </div>
      {message && <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}

      {!rows && (
        <div className="flex justify-center py-10 text-zinc-400">
          <Spinner />
        </div>
      )}
      {rows && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600">
          No woofs yet. Claim some blocks and climb the leaderboard so other dogs notice {activeDog.name}.
        </div>
      )}

      {waiting.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Woofed at you</h3>
          <ul className="space-y-2">
            {waiting.map((r) => (
              <li key={r.dog_id} className="flex items-center gap-3 rounded-2xl p-2 ring-1 ring-zinc-200">
                <button type="button" onClick={() => openDog(r.dog_id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <DogAvatar name={r.name} path={r.photo_path} className="size-12 text-2xl" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-zinc-900">{r.name}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {sizeLabel(r.size)} · {timeAgo(r.woofed_at)}
                    </p>
                  </div>
                </button>
                <Button onClick={() => woofBack(r)} disabled={sending === r.dog_id} className="h-10 shrink-0">
                  {sending === r.dog_id ? <Spinner className="size-4" /> : "Woof back"}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pack.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Your pack</h3>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {pack.map((r) => (
              <li key={r.dog_id}>
                <button type="button" onClick={() => openDog(r.dog_id)} className="w-full text-center">
                  <DogAvatar name={r.name} path={r.photo_path} className="aspect-square w-full text-4xl" rounded="rounded-2xl" />
                  <p className="mt-1 truncate text-sm font-semibold text-zinc-900">{r.name}</p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
