"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import AlphaMap, { TURF_COLORS, type MapApi, type MapStatus, type View } from "@/components/AlphaMap";
import { BlockSheet } from "@/components/BlockSheet";
import { DogCard } from "@/components/DogCard";
import { GameProvider, useGame } from "@/components/GameProvider";
import { InfoSheet, ReportSheet } from "@/components/InfoSheets";
import { LeadersPanel } from "@/components/LeadersPanel";
import { MyDogPanel } from "@/components/MyDogPanel";
import {
  Button,
  DogAvatar,
  FlagIcon,
  HeartIcon,
  InfoIcon,
  MapIcon,
  PawGlyph,
  PawIcon,
  PinIcon,
  Sheet,
  Spinner,
  Toast,
  TrophyIcon,
  useIsDesktop,
} from "@/components/ui";
import { woofsSeenKey, WoofsPanel } from "@/components/WoofsPanel";
import { DEFAULT_AREA, isInArea } from "@/lib/areas";
import type { AreaData } from "@/lib/feature-types";
import {
  friendlyError,
  getBoard,
  getMyWoofs,
  getTurfChanges,
  saveHiddenZone,
  submitMark,
  undoMark,
  type BoardTile,
  type TurfChange,
} from "@/lib/game";
import { makeHiddenZone, tileAddress, tileCenter } from "@/lib/grid";
import { deleteReport, REPORT_KINDS, submitReport, type ReportKind } from "@/lib/reports";

type Tab = "map" | "leaders" | "woofs" | "dog";
type Notice = { lines: string[]; undoMark?: string; undoReport?: string } | null;
type ZonePick = { step: "place" } | { step: "confirm"; home: [number, number]; tiles: string[] } | null;

const NUDGE_KEY = "alphadog.zoneNudgeDismissed";

export default function AppShell() {
  const [cardDog, setCardDog] = useState<string | null>(null);
  const openDog = useCallback((id: string) => setCardDog(id), []);
  return (
    <GameProvider openDog={openDog}>
      <Shell cardDog={cardDog} closeCard={() => setCardDog(null)} />
    </GameProvider>
  );
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("no-geolocation"));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 });
  });
}

function locationError(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err && typeof (err as GeolocationPositionError).code === "number") {
    return (err as GeolocationPositionError).code === 1
      ? "Marks need your location. Allow location access for AlphaDog and try again."
      : "Couldn't find your location. Try again in a moment.";
  }
  if (err instanceof Error && err.message === "no-geolocation") return "This device can't share its location, so it can't mark.";
  return null;
}

function Shell({ cardDog, closeCard }: { cardDog: string | null; closeCard: () => void }) {
  const game = useGame();
  const { sb, activeDog, zone, version, bump, account } = game;
  const area = DEFAULT_AREA;
  const isDesktop = useIsDesktop();

  const [tab, setTab] = useState<Tab>("map");
  const [view, setView] = useState<View>("turf");
  const [status, setStatus] = useState<MapStatus>("loading");
  const [areaData, setAreaData] = useState<AreaData | null>(null);
  const [outside, setOutside] = useState(false);
  const [recenterKey, setRecenterKey] = useState(0);
  const [board, setBoard] = useState<BoardTile[]>([]);
  const [selectedTile, setSelectedTile] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [marking, setMarking] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [zonePick, setZonePick] = useState<ZonePick>(null);
  const [changes, setChanges] = useState<TurfChange[] | null>(null);
  const [unread, setUnread] = useState(0);
  const mapApi = useRef<MapApi | null>(null);
  const onApi = useCallback((api: MapApi | null) => {
    mapApi.current = api;
  }, []);

  const label = useCallback((tile: string) => areaData?.tiles?.[tile] ?? tileAddress(tile), [areaData]);

  // ---- Turf board: on load, after marks, every 5 minutes, and when the app comes back ----
  useEffect(() => {
    if (!sb) return;
    let alive = true;
    const load = () =>
      getBoard(sb)
        .then((b) => alive && setBoard(b))
        .catch(() => {});
    load();
    const timer = setInterval(load, 5 * 60_000);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sb, version, account?.id]);

  // ---- While you were out ----
  const activeDogId = activeDog?.id;
  useEffect(() => {
    if (!sb || !activeDogId) return;
    const key = `alphadog.lastVisit.${activeDogId}`;
    const since = window.localStorage.getItem(key);
    const now = new Date().toISOString();
    if (!since) {
      window.localStorage.setItem(key, now);
      return;
    }
    let alive = true;
    getTurfChanges(sb, activeDogId, since)
      .then((c) => {
        window.localStorage.setItem(key, now);
        if (alive && c.length) setChanges(c);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sb, activeDogId]);

  // ---- Unread woofs ----
  const checkWoofs = useCallback(() => {
    if (!sb || !activeDogId) return;
    const seen = new Date(window.localStorage.getItem(woofsSeenKey(activeDogId)) ?? 0).getTime();
    getMyWoofs(sb, activeDogId)
      .then((rows) => setUnread(rows.filter((r) => new Date(r.woofed_at).getTime() > seen).length))
      .catch(() => {});
  }, [sb, activeDogId]);
  useEffect(() => {
    checkWoofs();
    const timer = setInterval(checkWoofs, 2 * 60_000);
    return () => clearInterval(timer);
  }, [checkWoofs, version]);
  const clearUnread = useCallback(() => setUnread(0), []);
  const unreadWoofs = activeDog ? unread : 0;

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), notice.undoMark || notice.undoReport ? 9000 : 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const goCreateDog = useCallback(() => {
    closeCard();
    setSelectedTile(null);
    setTab("dog");
  }, [closeCard]);

  // ---- Marking ----
  const doMark = async () => {
    setNudge(false);
    if (!sb || !activeDog) return;
    setMarking(true);
    setNotice(null);
    try {
      const pos = await getPosition();
      const { longitude: lon, latitude: lat, accuracy } = pos.coords;
      if (!isInArea(area, lon, lat)) {
        setOutside(true);
        setNotice({ lines: [`Marks only count inside the ${area.name} pilot area for now.`] });
        return;
      }
      if (accuracy > 100) {
        setNotice({ lines: ["Your location isn't precise enough yet. Step outside or wait a few seconds."] });
        return;
      }
      const res = await submitMark(sb, activeDog.id, lon, lat, accuracy);
      mapApi.current?.flyTo(lon, lat, 17);
      const lines = [
        res.fresh
          ? `+1 point on ${label(res.tile)}!`
          : `${activeDog.name} already marked this spot today. New spots earn points.`,
      ];
      if (res.first_in_tile) lines.push("🧭 Nomad! First dog ever to mark this block.");
      if (res.near === "hydrant" && res.fresh) lines.push("🔥 Fire Dog! That's a hydrant.");
      if (res.near === "post" && res.fresh) lines.push("💪 Tuff Stuff! Pole claimed.");
      if (res.near === "dog_park") lines.push("🌳 Park Life!");
      setNotice({ lines, undoMark: res.id });
      bump();
      mapApi.current?.refreshReports();
    } catch (err) {
      setNotice({ lines: [locationError(err) ?? friendlyError(err)] });
    } finally {
      setMarking(false);
    }
  };

  const mark = () => {
    setSelectedTile(null);
    if (!activeDog) {
      goCreateDog();
      setNotice({ lines: ["Make your dog's profile first, then go mark some turf."] });
      return;
    }
    if (!zone && !window.localStorage.getItem(NUDGE_KEY)) {
      setNudge(true);
      return;
    }
    doMark();
  };

  const undo = async (n: NonNullable<Notice>) => {
    if (!sb) return;
    setNotice(null);
    try {
      if (n.undoMark) await undoMark(sb, n.undoMark);
      if (n.undoReport) await deleteReport(sb, n.undoReport);
      setNotice({ lines: [n.undoMark ? "Mark removed." : "Report removed."] });
      bump();
      mapApi.current?.refreshReports();
    } catch (err) {
      setNotice({ lines: [friendlyError(err)] });
    }
  };

  // ---- Reports (poop, messes, busy spots, missing map spots) ----
  const startReport = async () => {
    setSelectedTile(null);
    setNotice(null);
    setReporting(true);
    setLocating(true);
    const found = (await mapApi.current?.locate()) ?? false;
    setLocating(false);
    if (!found) setNotice({ lines: ["Couldn't find your location. Drag the map to put the pin on the spot."] });
  };

  const pickKind = async (kind: ReportKind) => {
    const api = mapApi.current;
    if (!sb || !api) return;
    setSaving(true);
    try {
      const { id, total } = await submitReport(sb, kind, api.getCenter());
      setReporting(false);
      setNotice({
        lines: [`Thanks! ${REPORT_KINDS[kind].short} saved. That's ${total} report${total === 1 ? "" : "s"} from you.`],
        undoReport: id,
      });
      api.refreshReports();
    } catch (err) {
      setNotice({ lines: [friendlyError(err)] });
    } finally {
      setSaving(false);
    }
  };

  // ---- Hidden zone picker. The home spot stays in memory only. ----
  const startZonePick = useCallback(() => {
    if (!isDesktop) setTab("map");
    setView("turf");
    setSelectedTile(null);
    setNudge(false);
    setZonePick({ step: "place" });
    mapApi.current?.locate();
  }, [isDesktop]);

  const placeZone = () => {
    const api = mapApi.current;
    if (!api) return;
    const [lon, lat] = api.getCenter();
    setZonePick({ step: "confirm", home: [lon, lat], tiles: makeHiddenZone(lon, lat) });
  };

  const saveZone = async () => {
    if (!sb || zonePick?.step !== "confirm") return;
    setSaving(true);
    try {
      await saveHiddenZone(sb, zonePick.tiles);
      await game.refresh();
      bump();
      setZonePick(null);
      setNotice({ lines: ["Hidden zone saved. Blocks you win inside it show as \"Held by a local\"."] });
    } catch (err) {
      setNotice({ lines: [friendlyError(err)] });
    } finally {
      setSaving(false);
    }
  };

  const showZoneOnMap = useCallback(() => {
    if (!zone?.length) return;
    if (!isDesktop) setTab("map");
    setView("turf");
    const centers = zone.map(tileCenter);
    const lon = centers.reduce((s, c) => s + c[0], 0) / centers.length;
    const lat = centers.reduce((s, c) => s + c[1], 0) / centers.length;
    mapApi.current?.flyTo(lon, lat, 15.5);
  }, [zone, isDesktop]);

  const onTileClick = useCallback(
    (tile: string | null) => {
      if (zonePick || reporting) return;
      setSelectedTile(tile);
    },
    [zonePick, reporting],
  );

  const mapZone = zonePick?.step === "confirm" ? zonePick.tiles : zonePick ? null : view === "turf" ? zone : null;
  const placing = reporting || zonePick?.step === "place";
  const busyOverlay = reporting || zonePick !== null;
  const sidebarTab: Exclude<Tab, "map"> = tab === "map" ? "leaders" : tab;

  const panel = (t: Exclude<Tab, "map">) =>
    t === "woofs" ? (
      <WoofsPanel onCreateDog={goCreateDog} onSeen={clearUnread} />
    ) : t === "dog" ? (
      <MyDogPanel onPickZone={startZonePick} onShowMap={showZoneOnMap} />
    ) : (
      <LeadersPanel />
    );

  return (
    <div className="fixed inset-0 flex bg-zinc-100">
      {isDesktop && (
        <aside className="flex w-[420px] shrink-0 flex-col border-r border-zinc-200 bg-white">
          <div className="flex items-center gap-3 px-4 pb-3 pt-4">
            <PawIcon className="size-10 shrink-0" />
            <div className="min-w-0 flex-1 leading-tight">
              <h1 className="text-lg font-bold tracking-tight text-zinc-900">AlphaDog</h1>
              <p className="text-xs font-medium text-zinc-500">{area.name} pilot</p>
            </div>
            <button
              type="button"
              aria-label="How AlphaDog works"
              onClick={() => setInfoOpen(true)}
              className="flex size-10 items-center justify-center rounded-xl hover:bg-zinc-100"
            >
              <InfoIcon className="size-5 text-emerald-700" />
            </button>
          </div>
          <nav className="flex gap-1 border-b border-zinc-200 px-3" aria-label="Sections">
            {(
              [
                ["leaders", "Leaders", 0],
                ["woofs", "Woofs", unreadWoofs],
                ["dog", activeDog?.name ?? "My dog", 0],
              ] as const
            ).map(([id, text, badge]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-current={sidebarTab === id}
                className={`relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold ${
                  sidebarTab === id ? "border-emerald-600 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {id === "dog" && activeDog && <DogAvatar name={activeDog.name} path={activeDog.photo_path} className="size-5 text-[10px]" />}
                <span className="max-w-32 truncate">{text}</span>
                {badge > 0 && <Badge n={badge} />}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto">{panel(sidebarTab)}</div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="relative min-h-0 flex-1 overflow-hidden">
          <AlphaMap
            area={area}
            view={view}
            board={board}
            zone={mapZone}
            selectedTile={selectedTile}
            recenterKey={recenterKey}
            onStatus={setStatus}
            onData={setAreaData}
            onOutsideArea={setOutside}
            onTileClick={onTileClick}
            onApi={onApi}
          />

          <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="flex items-start justify-between gap-2">
              {!isDesktop ? (
                <button
                  type="button"
                  onClick={() => setInfoOpen(true)}
                  className="pointer-events-auto flex items-center gap-2.5 rounded-2xl bg-white/95 py-2 pl-2 pr-3.5 text-left shadow-md ring-1 ring-black/5 backdrop-blur"
                >
                  <PawIcon className="size-8 shrink-0" />
                  <span className="leading-tight">
                    <span className="block text-[15px] font-bold tracking-tight text-zinc-900">AlphaDog</span>
                    <span className="block text-[11px] font-medium text-zinc-500">{area.name}</span>
                  </span>
                </button>
              ) : (
                <span />
              )}
              <ViewToggle view={view} onChange={(v) => !zonePick && setView(v)} />
            </div>

            <div className="flex flex-col items-center gap-2">
              <Hint view={view} reporting={reporting} zonePick={zonePick} />
              {status === "loading" && <Toast>Loading the map…</Toast>}
              {status === "error" && <Toast>Couldn&apos;t load the map. Check your connection and reload.</Toast>}
              {status === "ready" && outside && !busyOverlay && (
                <Toast>
                  <span>You&apos;re outside the {area.name} pilot area.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setOutside(false);
                      setRecenterKey((k) => k + 1);
                    }}
                    className="ml-2 shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-900"
                  >
                    Show {area.name}
                  </button>
                </Toast>
              )}
              {notice && (
                <Toast>
                  <span className="space-y-0.5">
                    {notice.lines.map((l) => (
                      <span key={l} className="block">
                        {l}
                      </span>
                    ))}
                  </span>
                  {(notice.undoMark || notice.undoReport) && (
                    <button
                      type="button"
                      onClick={() => undo(notice)}
                      className="ml-3 shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-900"
                    >
                      Undo
                    </button>
                  )}
                </Toast>
              )}
              {changes && !busyOverlay && <ChangesCard changes={changes} label={label} onClose={() => setChanges(null)} />}
            </div>
          </header>

          {placing && (
            <>
              <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/35" />
              <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full">
                <PinIcon className="h-12 w-9 drop-shadow-lg" color={zonePick ? "#7c3aed" : "#059669"} />
              </div>
            </>
          )}

          {!busyOverlay && (
            <>
              <div className="absolute bottom-5 left-3 z-10 flex flex-col gap-2">
                <RoundButton label="Report a mess, busy spot or missing hydrant" onClick={startReport} hidden={!sb || status !== "ready"}>
                  <FlagIcon className="size-5 text-zinc-700" />
                </RoundButton>
                {!isDesktop && (
                  <RoundButton label="How AlphaDog works" onClick={() => setInfoOpen(true)}>
                    <InfoIcon className="size-5 text-emerald-700" />
                  </RoundButton>
                )}
              </div>
              {sb && status === "ready" && (
                <button
                  type="button"
                  onClick={mark}
                  disabled={marking}
                  className="absolute bottom-5 left-1/2 z-10 flex h-16 -translate-x-1/2 items-center gap-2.5 rounded-full bg-emerald-600 pl-5 pr-7 text-lg font-extrabold text-white shadow-xl shadow-emerald-900/30 ring-4 ring-white/80 transition hover:bg-emerald-700 active:scale-[0.97] disabled:opacity-80"
                >
                  {marking ? <Spinner className="size-6" /> : <PawGlyph className="size-7" />}
                  {marking ? "Finding you…" : "Mark"}
                </button>
              )}
            </>
          )}

          {zonePick && (
            <div className="absolute inset-x-0 bottom-0 z-30 flex justify-center lg:bottom-6">
              <div className="w-full rounded-t-3xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl ring-1 ring-black/5 lg:max-w-md lg:rounded-3xl lg:pb-4">
                {zonePick.step === "place" ? (
                  <>
                    <h2 className="font-bold text-zinc-900">Where&apos;s home?</h2>
                    <p className="mt-1 text-sm text-zinc-600">
                      Drag the map so the purple pin sits on your home. We use it once to draw your zone, then forget it.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button kind="secondary" onClick={() => setZonePick(null)} className="flex-1">
                        Cancel
                      </Button>
                      <Button kind="secondary" onClick={() => mapApi.current?.locate()} className="flex-1">
                        My location
                      </Button>
                      <Button onClick={placeZone} className="flex-1 bg-violet-600 hover:bg-violet-700">
                        Next
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="font-bold text-zinc-900">Your hidden zone</h2>
                    <p className="mt-1 text-sm text-zinc-600">
                      Home is somewhere in the purple blocks, and nobody can tell which. Only these blocks are saved.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button kind="secondary" onClick={() => setZonePick({ step: "place" })} className="flex-1">
                        Back
                      </Button>
                      <Button
                        kind="secondary"
                        onClick={() => zonePick.step === "confirm" && setZonePick({ ...zonePick, tiles: makeHiddenZone(...zonePick.home) })}
                        className="flex-1"
                      >
                        Shuffle
                      </Button>
                      <Button onClick={saveZone} disabled={saving} className="flex-1 bg-violet-600 hover:bg-violet-700">
                        {saving ? <Spinner className="size-4" /> : "Save zone"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {reporting && <ReportSheet saving={saving} locating={locating} onPick={pickKind} onCancel={() => setReporting(false)} />}

          {selectedTile && !busyOverlay && (
            <BlockSheet key={selectedTile} tile={selectedTile} label={areaData?.tiles?.[selectedTile]} onClose={() => setSelectedTile(null)} onCreateDog={goCreateDog} />
          )}

          {nudge && (
            <Sheet onClose={() => setNudge(false)} label="Set your hidden zone first" modal>
              <h2 className="text-lg font-bold text-zinc-900">Set your hidden zone first?</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Most marks happen near home. With a hidden zone, blocks {activeDog?.name} wins near home show as
                &quot;Held by a local&quot;, so nobody can see where you live. Your marks there still count.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Button onClick={startZonePick} className="bg-violet-600 hover:bg-violet-700">
                  Set hidden zone
                </Button>
                <Button
                  kind="ghost"
                  onClick={() => {
                    window.localStorage.setItem(NUDGE_KEY, "1");
                    doMark();
                  }}
                >
                  Mark without one
                </Button>
              </div>
            </Sheet>
          )}

          {!isDesktop && tab !== "map" && (
            <div className="absolute inset-0 z-20 overflow-y-auto bg-white pt-[env(safe-area-inset-top)]">{panel(tab)}</div>
          )}

          {infoOpen && <InfoSheet areaName={area.name} onClose={() => setInfoOpen(false)} />}
          {cardDog && <DogCard key={cardDog} dogId={cardDog} onClose={closeCard} onCreateDog={goCreateDog} />}
        </main>

        {!isDesktop && (
          <nav
            className="z-40 grid grid-cols-4 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)]"
            aria-label="Sections"
          >
            <NavButton active={tab === "map"} onClick={() => setTab("map")} label="Map" icon={<MapIcon className="size-6" />} />
            <NavButton active={tab === "leaders"} onClick={() => setTab("leaders")} label="Leaders" icon={<TrophyIcon className="size-6" />} />
            <NavButton
              active={tab === "woofs"}
              onClick={() => setTab("woofs")}
              label="Woofs"
              icon={<HeartIcon className="size-6" />}
              badge={unreadWoofs}
            />
            <NavButton
              active={tab === "dog"}
              onClick={() => setTab("dog")}
              label={activeDog?.name ?? "My dog"}
              icon={
                activeDog ? (
                  <DogAvatar name={activeDog.name} path={activeDog.photo_path} className="size-6 text-xs" />
                ) : (
                  <PawGlyph className="size-6" />
                )
              }
            />
          </nav>
        )}
      </div>
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const options: { value: View; label: string; active: string }[] = [
    { value: "turf", label: "Turf", active: "bg-zinc-900 text-white shadow" },
    { value: "seek", label: "Seek", active: "bg-emerald-600 text-white shadow" },
    { value: "avoid", label: "Avoid", active: "bg-red-600 text-white shadow" },
  ];
  return (
    <div role="radiogroup" aria-label="Map view" className="pointer-events-auto flex rounded-2xl bg-white/95 p-1 shadow-md ring-1 ring-black/5 backdrop-blur">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={view === o.value}
          onClick={() => onChange(o.value)}
          className={`h-10 rounded-xl px-3.5 text-sm font-semibold transition-colors ${view === o.value ? o.active : "text-zinc-600 hover:bg-zinc-100"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Hint({ view, reporting, zonePick }: { view: View; reporting: boolean; zonePick: ZonePick }) {
  const pill = "rounded-full bg-zinc-900/85 px-3 py-1.5 text-center text-xs font-medium text-white shadow-md backdrop-blur";
  if (zonePick) return <p className={pill}>{zonePick.step === "place" ? "Put the purple pin on your home" : "Purple blocks are your hidden zone"}</p>;
  if (reporting) return <p className={pill}>Drag the map so the pin sits on the spot</p>;
  if (view === "turf") {
    return (
      <p className={`${pill} flex items-center gap-2.5`}>
        <Dot color={TURF_COLORS.mine} /> You
        <Dot color={TURF_COLORS.taken} /> Rivals
        <Dot color={TURF_COLORS.local} /> Locals
        <span className="text-white/60">·</span> Tap a block
      </p>
    );
  }
  return <p className={pill}>{view === "seek" ? "Darker green means dogs most likely go there" : "Red marks dog hot spots to steer around"}</p>;
}

function Dot({ color }: { color: string }) {
  return <span className="-mr-1 inline-block size-2.5 rounded-full ring-1 ring-white/60" style={{ background: color }} />;
}

function ChangesCard({ changes, label, onClose }: { changes: TurfChange[]; label: (t: string) => string; onClose: () => void }) {
  const lines = changes.map((c) =>
    c.change === "won"
      ? `👑 You took ${label(c.tile)}`
      : c.change === "lost"
        ? `😤 ${c.by_name ?? "A local dog"} took ${label(c.tile)}`
        : `🍂 ${label(c.tile)} faded. Mark it to win it back.`,
  );
  return (
    <div className="pointer-events-auto w-full max-w-sm rounded-2xl bg-white p-3.5 shadow-lg ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-900">While you were out</h2>
        <button type="button" onClick={onClose} className="rounded-full px-2 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">
          Close
        </button>
      </div>
      <ul className="mt-1.5 space-y-1 text-sm text-zinc-700">
        {lines.slice(0, 4).map((l, i) => (
          <li key={i}>{l}</li>
        ))}
        {lines.length > 4 && <li className="text-zinc-500">and {lines.length - 4} more</li>}
      </ul>
    </div>
  );
}

function RoundButton({ label, onClick, children, hidden }: { label: string; onClick: () => void; children: ReactNode; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-2xl bg-white/95 shadow-md ring-1 ring-black/5 backdrop-blur active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

function NavButton({
  active,
  onClick,
  label,
  icon,
  badge = 0,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ReactNode;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active}
      className={`relative flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-semibold ${active ? "text-emerald-700" : "text-zinc-500"}`}
    >
      <span className="relative">
        {icon}
        {badge > 0 && (
          <span className="absolute -right-2.5 -top-1.5">
            <Badge n={badge} />
          </span>
        )}
      </span>
      <span className="max-w-full truncate px-1">{label}</span>
    </button>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
      {n > 9 ? "9+" : n}
    </span>
  );
}
