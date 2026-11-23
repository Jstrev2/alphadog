"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getHiddenZone, listMyDogs, type Dog } from "@/lib/game";
import { getSupabase } from "@/lib/supabase";

export type Account = { id: string; isAnonymous: boolean; email: string | null };

type Game = {
  sb: SupabaseClient | null;
  /** null until the first visit that saves something (a dog, a mark, a report) */
  account: Account | null;
  /** true once we've checked for a saved session */
  ready: boolean;
  dogs: Dog[];
  activeDog: Dog | null;
  setActiveDog: (id: string) => void;
  /** Turf blocks in the hidden zone, or null if none is set */
  zone: string[] | null;
  refresh: () => Promise<void>;
  /** Bumps after a mark so turf, stats and leaderboards reload */
  version: number;
  bump: () => void;
  /** Opens any dog's card */
  openDog: (id: string) => void;
};

const GameContext = createContext<Game | null>(null);

export function useGame(): Game {
  const g = useContext(GameContext);
  if (!g) throw new Error("useGame needs a GameProvider");
  return g;
}

const ACTIVE_KEY = "alphadog.activeDog";

export function GameProvider({ children, openDog }: { children: ReactNode; openDog: (id: string) => void }) {
  const sb = getSupabase();
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(!sb);
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [zone, setZone] = useState<string[] | null>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(
    async (signedIn: boolean) => {
      if (!sb || !signedIn) {
        setDogs([]);
        setZone(null);
        return;
      }
      const [d, z] = await Promise.all([listMyDogs(sb).catch(() => []), getHiddenZone(sb).catch(() => null)]);
      setDogs(d);
      setZone(z);
    },
    [sb],
  );

  useEffect(() => {
    if (!sb) return;
    let alive = true;
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      const user = session?.user ?? null;
      setAccount(user ? { id: user.id, isAnonymous: Boolean(user.is_anonymous), email: user.email ?? null } : null);
      // Supabase asks us not to call it from inside this callback directly.
      setTimeout(() => {
        if (!alive) return;
        load(Boolean(user)).finally(() => alive && setReady(true));
      }, 0);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [sb, load]);

  // Remember which dog is walking. Falls back to the first dog.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(ACTIVE_KEY);
    if (saved) setTimeout(() => setActiveId(saved), 0);
  }, []);
  const setActiveDog = useCallback((id: string) => {
    setActiveId(id);
    window.localStorage.setItem(ACTIVE_KEY, id);
  }, []);
  const activeDog = dogs.find((d) => d.id === activeId) ?? dogs[0] ?? null;

  const refresh = useCallback(async () => {
    const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
    await load(Boolean(data.session));
  }, [sb, load]);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const value = useMemo<Game>(
    () => ({ sb, account, ready, dogs, activeDog, setActiveDog, zone, refresh, version, bump, openDog }),
    [sb, account, ready, dogs, activeDog, setActiveDog, zone, refresh, version, bump, openDog],
  );
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
