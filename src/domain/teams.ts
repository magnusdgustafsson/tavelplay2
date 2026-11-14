import type { StartingLineup, Teams } from './types';

export type Rng = () => number;

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A lineup from an earlier game this session: who played on each side. */
export interface PastLineup {
  left: readonly string[];
  right: readonly string[];
}

/** Same signature for (A vs B) and (B vs A). */
export function teamSignature(left: readonly string[], right: readonly string[]): string {
  const a = [...left].sort().join(',');
  const b = [...right].sort().join(',');
  const [first, second] = [a, b].sort();
  return `${first}|${second}`;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** How many games each pair of players has played on the same team. */
export function pairCounts(history: readonly PastLineup[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const game of history) {
    for (const team of [game.left, game.right]) {
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          const k = pairKey(team[i], team[j]);
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
    }
  }
  return counts;
}

/** Up to this many players every possible split is tried; above it we search. */
const EXACT_MAX_PLAYERS = 16;
const RESTARTS = 80;
const EPS = 1e-9;

/**
 * Random teams with as much variation as possible over the whole session.
 *
 * For every pair we compare how many games they have played on the same team
 * with how many they "should" have by now (the games both took part in ×
 * the chance of ending up on the same team). Putting a pair together costs
 * ±(difference)², so pairs that are behind are pulled together and pairs that
 * are ahead are kept apart; being together in the previous game costs a bit
 * extra. The split with the lowest total cost wins – with up to 16 players
 * every possible split is checked, above that a fast search is used – and
 * among equally good splits one is picked at random. A lineup already used
 * this session is never repeated if there is any alternative. The first game
 * of a session is completely random.
 */
export function randomizeTeams(
  playerIds: readonly string[],
  history: readonly PastLineup[],
  rng: Rng = Math.random,
  /** Pairs that must end up on different teams (e.g. for the final game). */
  separate: readonly (readonly [string, string])[] = [],
): { left: string[]; right: string[] } | null {
  const n = playerIds.length;
  if (n < 2) return null;
  const leftSize = Math.ceil(n / 2);
  const together = (leftSize - 1) / (n - 1); // chance two players share a team

  const counts = pairCounts(history);
  const last = history[history.length - 1];
  const lastTogether = last ? pairCounts([last]) : new Map<string, number>();
  const used = new Set(history.map((g) => teamSignature(g.left, g.right)));
  const present = history.map((g) => new Set([...g.left, ...g.right]));

  const w: number[][] = playerIds.map((a) =>
    playerIds.map((b) => {
      if (a === b) return 0;
      const k = pairKey(a, b);
      const both = present.filter((p) => p.has(a) && p.has(b)).length;
      const diff = (counts.get(k) ?? 0) - both * together;
      return Math.sign(diff) * diff * diff + (lastTogether.has(k) ? 1 : 0);
    }),
  );
  // Index pairs that must be split. A huge cost steers the fast search away
  // from them; the final choice below treats them as a hard rule.
  const apart = separate
    .map(([a, b]) => [playerIds.indexOf(a), playerIds.indexOf(b)] as const)
    .filter(([i, j]) => i >= 0 && j >= 0 && i !== j);
  for (const [i, j] of apart) {
    w[i][j] += 1e6;
    w[j][i] += 1e6;
  }

  // Best splits found so far (indices of the left team), preferring new lineups.
  // Rank: 0 = rules kept & new lineup, 1 = rules kept & used lineup,
  // 2/3 = a rule broken (only if impossible otherwise).
  let best: number[][] = [];
  let bestCost = Infinity;
  let bestRank = Infinity;
  const seen = new Set<string>();
  const consider = (left: number[], cost: number) => {
    const inLeft = new Set(left);
    const sig = teamSignature(
      left.map((i) => playerIds[i]),
      playerIds.filter((_, i) => !inLeft.has(i)),
    );
    if (seen.has(sig)) return;
    seen.add(sig);
    const broken = apart.some(([i, j]) => inLeft.has(i) === inLeft.has(j));
    const rank = (broken ? 2 : 0) + (used.has(sig) ? 1 : 0);
    if (rank < bestRank || (rank === bestRank && cost < bestCost - EPS)) {
      best = [left];
      bestCost = cost;
      bestRank = rank;
    } else if (rank === bestRank && Math.abs(cost - bestCost) < EPS) {
      best.push(left);
    }
  };
  const splitCost = (inLeft: boolean[]) => {
    let cost = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (inLeft[i] === inLeft[j]) cost += w[i][j];
    return cost;
  };

  if (n <= EXACT_MAX_PLAYERS) {
    // Try every split. With equal teams, player 0 is always "left" (the mirror
    // image is the same split).
    const sel: number[] = [];
    const inLeft = new Array<boolean>(n).fill(false);
    const walk = (from: number) => {
      if (sel.length === leftSize) {
        consider([...sel], splitCost(inLeft));
        return;
      }
      for (let i = from; i <= n - (leftSize - sel.length); i++) {
        if (n % 2 === 0 && sel.length === 0 && i > 0) break;
        sel.push(i);
        inLeft[i] = true;
        walk(i + 1);
        inLeft[i] = false;
        sel.pop();
      }
    };
    walk(0);
  } else {
    // Random starts + swap one player from each team while it lowers the cost.
    for (let r = 0; r < RESTARTS; r++) {
      const order = shuffle(
        playerIds.map((_, i) => i),
        rng,
      );
      const left = order.slice(0, leftSize);
      const right = order.slice(leftSize);
      for (;;) {
        // Only swaps that strictly lower the cost (otherwise we could loop forever).
        let bestDelta = -EPS;
        let swaps: [number, number][] = [];
        for (let i = 0; i < left.length; i++) {
          for (let j = 0; j < right.length; j++) {
            const a = left[i];
            const b = right[j];
            let delta = 0;
            for (const x of left) if (x !== a) delta += w[b][x] - w[a][x];
            for (const y of right) if (y !== b) delta += w[a][y] - w[b][y];
            if (delta >= -EPS) continue;
            if (delta < bestDelta - EPS) {
              bestDelta = delta;
              swaps = [[i, j]];
            } else if (Math.abs(delta - bestDelta) < EPS) {
              swaps.push([i, j]);
            }
          }
        }
        if (swaps.length === 0) break;
        const [i, j] = swaps[Math.floor(rng() * swaps.length)];
        [left[i], right[j]] = [right[j], left[i]];
      }
      const inLeft = new Array<boolean>(n).fill(false);
      for (const i of left) inLeft[i] = true;
      consider([...left].sort((x, y) => x - y), splitCost(inLeft));
    }
  }

  const pick = new Set(best[Math.floor(rng() * best.length)]);
  let left = playerIds.filter((_, i) => pick.has(i));
  let right = playerIds.filter((_, i) => !pick.has(i));
  // Shuffle the order on screen, and with equal teams which side each plays on.
  left = shuffle(left, rng);
  right = shuffle(right, rng);
  if (left.length === right.length && rng() < 0.5) [left, right] = [right, left];
  return { left, right };
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
