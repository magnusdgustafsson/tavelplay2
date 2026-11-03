import { useEffect, useMemo, useRef, useState } from 'react';
import type { AwardId } from '../domain/awards';
import type { TeamColor } from '../domain/types';
import { teamLabel } from '../domain/types';
import { computePlayerStats } from '../domain/stats';
import { useStore } from '../state/store';

const BASE = import.meta.env.BASE_URL;

export function asset(path: string) {
  return `${BASE}${path}`;
}

export function AwardIcon({ id, title }: { id: AwardId; title?: string }) {
  return <img className="award" src={asset(`awards/${id}.svg`)} alt={title ?? id} title={title} draggable={false} />;
}

export function TeamDot({ color }: { color: TeamColor }) {
  return <span className="team-dot" data-team={color} aria-hidden="true" />;
}

export function TeamName({ color }: { color: TeamColor }) {
  return <>{teamLabel(color)}</>;
}

/** Live player stats (finished games + the game in progress). */
export function usePlayerStats() {
  const players = useStore((s) => s.players);
  const games = useStore((s) => s.games);
  const currentGame = useStore((s) => s.currentGame);
  return useMemo(() => computePlayerStats(players, games, currentGame), [players, games, currentGame]);
}

export function usePlusMinusActive() {
  const games = useStore((s) => s.games);
  const currentGame = useStore((s) => s.currentGame);
  return games.some((g) => g.plusMinus) || !!currentGame?.plusMinus;
}

/**
 * Countdown that calls onDone after `seconds`. Restarts whenever `resetKey`
 * changes; pass running=false to pause it.
 */
export function useCountdown(seconds: number, running: boolean, resetKey: unknown, onDone: () => void) {
  const [left, setLeft] = useState(seconds);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!running) {
      setLeft(seconds);
      return;
    }
    const end = Date.now() + seconds * 1000;
    setLeft(seconds);
    const t = setInterval(() => {
      const remaining = Math.ceil((end - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(t);
        setLeft(0);
        done.current();
      } else {
        setLeft(remaining);
      }
    }, 250);
    return () => clearInterval(t);
  }, [seconds, running, resetKey]);

  return left;
}

/** Keep the iPad screen awake while `active` (where supported). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        /* not allowed right now – ignore */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) request();
    };
    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
