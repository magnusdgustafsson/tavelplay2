import type { StartingLineup, Teams } from './types';

export type Rng = () => number;

const MAX_SHUFFLE_ATTEMPTS = 50;
const TARGET_CANDIDATES = 12;
const TEAM_HISTORY_LIMIT = 10;

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Same signature for (A vs B) and (B vs A). */
export function teamSignature(left: readonly string[], right: readonly string[]): string {
  const a = [...left].sort().join(',');
  const b = [...right].sort().join(',');
  const [first, second] = [a, b].sort();
  return `${first}|${second}`;
}

/** How many players should ideally switch side in each direction. */
function targetSwitchesPerDirection(playerCount: number): number | null {
  if (playerCount >= 8 && playerCount <= 11) return 2;
  if (playerCount >= 12) return 3;
  return null;
}

interface Candidate {
  left: string[];
  right: string[];
  signature: string;
  penalty: number;
  totalSwitches: number;
}

export interface RandomizeResult {
  left: string[];
  right: string[];
  teamHistory: string[];
}

/**
 * Random teams that mix things up compared with the previous game:
 * - 8–11 players: aim for exactly 2 players switching side in each direction
 * - 12+ players: aim for 3 in each direction
 * - fewer: maximise the number of switches
 * Lineups used in the last games (teamHistory) are avoided when possible.
 */
export function randomizeTeams(
  playerIds: readonly string[],
  previous: { left: readonly string[]; right: readonly string[] } | null,
  teamHistory: readonly string[],
  rng: Rng = Math.random,
): RandomizeResult | null {
  if (playerIds.length < 2) return null;

  const target = targetSwitchesPerDirection(playerIds.length);
  const prevLeft = previous ? new Set(previous.left) : null;
  const prevRight = previous ? new Set(previous.right) : null;
  const targeted = !!previous && target !== null;

  const seen = new Set<string>();
  const candidates: Candidate[] = [];

  const finish = (c: Candidate): RandomizeResult => {
    let history = [...teamHistory, c.signature];
    if (history.length > TEAM_HISTORY_LIMIT) history = [];
    return { left: c.left, right: c.right, teamHistory: history };
  };

  for (let attempt = 0; attempt < MAX_SHUFFLE_ATTEMPTS; attempt++) {
    const shuffled = shuffle(playerIds, rng);
    const mid = Math.ceil(shuffled.length / 2);
    const left = shuffled.slice(0, mid);
    const right = shuffled.slice(mid);
    const signature = teamSignature(left, right);
    if (seen.has(signature)) continue;
    seen.add(signature);

    let toLeft = 0;
    let toRight = 0;
    if (prevLeft && prevRight) {
      toLeft = left.filter((id) => prevRight.has(id)).length;
      toRight = right.filter((id) => prevLeft.has(id)).length;
    }
    const totalSwitches = toLeft + toRight;
    // Targeted mode: distance from target. Otherwise: more switches is better.
    const penalty = targeted
      ? Math.abs(toLeft - target!) + Math.abs(toRight - target!)
      : -totalSwitches;

    const candidate = { left, right, signature, penalty, totalSwitches };
    if (targeted && penalty === 0 && !teamHistory.includes(signature)) {
      return finish(candidate);
    }
    candidates.push(candidate);
    if (seen.size >= TARGET_CANDIDATES) break;
  }

  const fresh = candidates.filter((c) => !teamHistory.includes(c.signature));
  const pool = fresh.length > 0 ? fresh : candidates;

  let best: Candidate[] = [];
  for (const c of pool) {
    const b = best[0];
    if (
      !b ||
      c.penalty < b.penalty ||
      (c.penalty === b.penalty && c.totalSwitches > b.totalSwitches)
    ) {
      best = [c];
    } else if (c.penalty === b.penalty && c.totalSwitches === b.totalSwitches) {
      best.push(c);
    }
  }
  return finish(best[Math.floor(rng() * best.length)]);
}

/**
 * Keep the current teams (random teams off): drop players that are no longer
 * active and put newly added players on the smaller team.
 */
export function reconcileTeams(teams: Teams, activeIds: readonly string[]): Teams {
  const active = new Set(activeIds);
  const left = teams.left.filter((id) => active.has(id));
  const right = teams.right.filter((id) => active.has(id));
  const onTeam = new Set([...left, ...right]);
  for (const id of activeIds) {
    if (onTeam.has(id)) continue;
    (left.length <= right.length ? left : right).push(id);
  }
  return { ...teams, left, right };
}

/** Starting players = first N of each (already shuffled) team. */
export function pickStarters(teams: Teams, count: number): StartingLineup {
  return {
    left: teams.left.slice(0, Math.min(count, teams.left.length)),
    right: teams.right.slice(0, Math.min(count, teams.right.length)),
  };
}

/** Plus/minus is only fair with full starting lineups of 3–5 and no subs. */
export function isPlusMinusFair(
  startingLineupEnabled: boolean,
  startingLineupCount: number,
  activePlayerCount: number,
): boolean {
  if (!startingLineupEnabled) return false;
  if (startingLineupCount < 3 || startingLineupCount > 5) return false;
  return activePlayerCount === 2 * startingLineupCount;
}
