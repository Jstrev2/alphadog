"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/components/GameProvider";
import { Button, clockTime, DogAvatar, Sheet, SheetHeader, Spinner } from "@/components/ui";
import { TURF_COLORS } from "@/components/AlphaMap";
import { getTileDetail, sizeLabel, type TileDetail } from "@/lib/game";
import { tileAddress } from "@/lib/grid";

/** What you see when you tap a turf block. Mount with key={tile}. */
export function BlockSheet({
  tile,
  label,
  onClose,
  onCreateDog,
}: {
  tile: string;
  label: string | undefined;
  onClose: () => void;
  onCreateDog: () => void;
}) {
  const { sb, activeDog, version, openDog, zone } = useGame();
  const [detail, setDetail] = useState<TileDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!sb) return;
    let alive = true;
    getTileDetail(sb, tile, activeDog?.id ?? null)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [sb, tile, activeDog?.id, version]);

  const inZone = zone?.includes(tile) ?? false;
  const title = label ?? tileAddress(tile);

  return (
    <Sheet onClose={onClose} label={`Block ${title}`}>
      <SheetHeader title={title} sub={label ? `${tileAddress(tile)} block` : "Turf block"} onClose={onClose} />

      {!detail && !failed && (
        <div className="flex justify-center py-6 text-zinc-400">
          <Spinner />
        </div>
      )}
      {failed && <p className="py-4 text-sm text-zinc-600">Couldn&apos;t load this block. Check your connection.</p>}

      {detail && (
        <div className="mt-3 space-y-3">
          <Holder detail={detail} onOpen={openDog} />

          {activeDog ? (
            <Progress detail={detail} dogName={activeDog.name} ghost={activeDog.ghost} />
          ) : (
            <div className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900">
              <p>Make a profile for your dog to start claiming blocks.</p>
              <Button className="mt-2 w-full" onClick={onCreateDog}>
                Add your dog
              </Button>
            </div>
          )}

          {inZone && (
            <p className="rounded-2xl bg-violet-50 p-3 text-xs leading-5 text-violet-900">
              <strong>In your hidden zone.</strong> When your dog holds this block, everyone else sees it as
              &quot;Held by a local&quot; with no name or photo.
            </p>
          )}

          <p className="text-[11px] leading-4 text-zinc-500">
            Turf as of {clockTime(detail.as_of)}. It updates every hour. A block goes to the dog that marked the most
            different spots on it in the last 7 days, each spot once a day.
          </p>
        </div>
      )}
    </Sheet>
  );
}

function Holder({ detail, onOpen }: { detail: TileDetail; onOpen: (id: string) => void }) {
  if (detail.state === "open") {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 p-3 text-sm text-zinc-600">
        Nobody holds this block yet. Mark it to claim it.
      </div>
    );
  }
  if (detail.state === "local" || !detail.holder) {
    return (
      <div className="flex items-center gap-3 rounded-2xl p-3 ring-1 ring-zinc-200">
        <div className="flex size-12 items-center justify-center rounded-full text-lg font-bold text-white" style={{ background: TURF_COLORS.local }}>
          ?
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-zinc-900">Held by a local</p>
          <p className="text-xs text-zinc-500">A dog that lives nearby. We keep its name private.</p>
        </div>
        <Points n={detail.leader_points} />
      </div>
    );
  }
  const h = detail.holder;
  return (
    <button
      type="button"
      onClick={() => onOpen(h.id)}
      className="flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 ring-zinc-200 hover:bg-zinc-50"
    >
      <DogAvatar name={h.name} path={h.photo_path} className="size-12" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: detail.state === "mine" ? "#047857" : "#c2410c" }}>
          {detail.state === "mine" ? "Your turf" : "Held by"}
        </p>
        <p className="truncate font-semibold text-zinc-900">{h.name}</p>
        <p className="truncate text-xs text-zinc-500">
          {sizeLabel(h.size)}
          {h.breed ? ` · ${h.breed}` : ""}
        </p>
      </div>
      <Points n={detail.leader_points} />
    </button>
  );
}

function Points({ n }: { n: number }) {
  return (
    <div className="text-right">
      <p className="text-xl font-bold leading-none text-zinc-900">{n}</p>
      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">points</p>
    </div>
  );
}

function Progress({ detail, dogName, ghost }: { detail: TileDetail; dogName: string; ghost: boolean }) {
  if (ghost) {
    return (
      <p className="rounded-2xl bg-zinc-100 p-3 text-sm text-zinc-700">
        {dogName} is in ghost mode, so marks don&apos;t count toward turf. Turn it off in My dog to compete.
      </p>
    );
  }
  const mine = detail.my_points;
  const lead = detail.leader_points;
  let line: string;
  if (detail.state === "mine") line = "Keep marking new spots here so nobody can take it.";
  else if (mine > lead) line = "You're ahead. This block flips to you at the top of the hour.";
  else {
    const need = lead - mine + 1;
    line = `Mark ${need} more spot${need === 1 ? "" : "s"} here this week to take it.`;
  }
  return (
    <div className="rounded-2xl bg-zinc-50 p-3">
      <p className="text-sm text-zinc-800">
        <strong>{dogName}:</strong> {mine} point{mine === 1 ? "" : "s"} here this week
      </p>
      <p className="mt-0.5 text-sm text-zinc-600">{line}</p>
    </div>
  );
}
