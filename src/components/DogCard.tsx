"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/components/GameProvider";
import { DogAvatar, Sheet, Spinner } from "@/components/ui";
import { BADGES } from "@/lib/badges";
import { friendlyError, getDogCard, sendWoof, sizeLabel, type DogCardData } from "@/lib/game";

/** Any dog's public card, dating-app style, with a Woof button. Mount with key={dogId}. */
export function DogCard({ dogId, onClose, onCreateDog }: { dogId: string; onClose: () => void; onCreateDog: () => void }) {
  const { sb, activeDog, version } = useGame();
  const [card, setCard] = useState<DogCardData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "gone" | "error">("loading");
  const [woof, setWoof] = useState<"idle" | "sending" | "woofed" | "pack">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!sb) return;
    let alive = true;
    getDogCard(sb, dogId)
      .then((c) => {
        if (!alive) return;
        setCard(c);
        setState(c ? "ready" : "gone");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [sb, dogId, version]);

  const doWoof = async () => {
    if (!sb || !activeDog) return;
    setWoof("sending");
    setMessage(null);
    try {
      const result = await sendWoof(sb, activeDog.id, dogId);
      setWoof(result);
    } catch (err) {
      setWoof("idle");
      setMessage(friendlyError(err));
    }
  };

  const woofed = woof === "woofed" || woof === "pack" || card?.i_woofed;
  const earned = card ? BADGES.filter((b) => card.badges[b.key]) : [];

  return (
    <Sheet onClose={onClose} label={card ? `${card.name}'s card` : "Dog card"} modal>
      {state === "loading" && (
        <div className="flex justify-center py-16 text-zinc-400">
          <Spinner />
        </div>
      )}
      {(state === "gone" || state === "error") && (
        <div className="py-10 text-center text-sm text-zinc-600">
          {state === "gone" ? "This dog isn't on the map right now." : "Couldn't load this dog. Check your connection."}
          <button type="button" onClick={onClose} className="mt-3 block w-full font-semibold text-emerald-700">
            Close
          </button>
        </div>
      )}
      {card && state === "ready" && (
        <div>
          <div className="relative overflow-hidden rounded-2xl">
            <DogAvatar name={card.name} path={card.photo_path} className="aspect-[4/5] max-h-[46dvh] w-full text-8xl" rounded="rounded-2xl" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-4 pt-16 text-white">
              <h2 className="text-2xl font-bold leading-tight">{card.name}</h2>
              <p className="text-sm text-white/85">
                {sizeLabel(card.size)}
                {card.breed ? ` · ${card.breed}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 rounded-full bg-black/45 px-3 py-1 text-sm font-semibold text-white backdrop-blur"
            >
              Close
            </button>
            {!card.mine && (
              <div className="absolute bottom-4 right-4">
                {activeDog ? (
                  <button
                    type="button"
                    onClick={doWoof}
                    disabled={woofed || woof === "sending"}
                    className={`flex size-20 flex-col items-center justify-center rounded-full text-lg font-extrabold shadow-xl ring-4 transition active:scale-95 ${
                      woofed ? "bg-white text-emerald-700 ring-emerald-400" : "bg-emerald-500 text-white ring-white/70 hover:bg-emerald-600"
                    }`}
                  >
                    {woof === "sending" ? <Spinner /> : woofed ? "Woofed" : "Woof"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onCreateDog}
                    className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-lg"
                  >
                    Add your dog to woof
                  </button>
                )}
              </div>
            )}
          </div>

          {(woof === "pack" || message) && (
            <p className={`mt-3 rounded-2xl p-3 text-sm ${woof === "pack" ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>
              {woof === "pack" ? `You're pack! ${card.name} woofed at ${activeDog?.name} too.` : message}
            </p>
          )}
          {woof === "woofed" && (
            <p className="mt-3 rounded-2xl bg-zinc-50 p-3 text-sm text-zinc-700">
              Woof sent. If {card.name} woofs back, you&apos;re pack.
            </p>
          )}

          {card.bio && <p className="mt-3 text-[15px] leading-6 text-zinc-800">{card.bio}</p>}

          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            <Stat n={card.points_week} label="Points this week" />
            <Stat n={card.blocks} label="Blocks held" />
            <Stat n={card.streak} label="Day streak" />
            <Stat n={card.woofs} label="Woofs" />
          </div>

          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">Badges</h3>
          {earned.length === 0 ? (
            <p className="mt-1 text-sm text-zinc-500">No badges yet.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {earned.map((b) => (
                <span key={b.key} className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
                  <span aria-hidden="true">{b.icon}</span>
                  {b.name}
                  {card.badges[b.key] > 1 && <span className="text-amber-700">×{card.badges[b.key]}</span>}
                </span>
              ))}
            </div>
          )}

          <p className="mt-4 text-xs text-zinc-500">
            On AlphaDog since {new Date(card.since).toLocaleDateString([], { month: "long", year: "numeric" })}
          </p>
        </div>
      )}
    </Sheet>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-2xl bg-zinc-50 px-1 py-2.5">
      <p className="text-xl font-bold leading-none text-zinc-900">{n}</p>
      <p className="mt-1 text-[10px] font-medium leading-3 text-zinc-500">{label}</p>
    </div>
  );
}
