import type { Game, Goalkeeper, Player } from './types';
import type { GoalkeeperStats, PlayerStats } from './stats';
import { compareGoalkeepers, gameScore, goalsAgainstPerGame, winnerOf } from './stats';

export type AwardId =
  | 'crown'
  | 'star'
  | 'bullseye'
  | 'assist'
  | 'pig'
  | 'best_def'
  | 'mvp'
  | 'hat'
  | `hat_${2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | 'best_gk';

export const LEGEND: { icon: AwardId; name: string }[] = [
  { icon: 'crown', name: 'Most Wins' },
  { icon: 'star', name: 'Most Points' },
  { icon: 'bullseye', name: 'Most Goals' },
  { icon: 'assist', name: 'Most Assists' },
  { icon: 'best_def', name: 'Best Defender' },
  { icon: 'mvp', name: 'MVP' },
  { icon: 'hat', name: 'Hattrick' },
  { icon: 'pig', name: 'Pig' },
];

export const LEGEND_GK: { icon: AwardId; name: string }[] = [
  { icon: 'best_gk', name: 'Best Goalkeeper' },
];

interface Entry {
  id: string;
  s: PlayerStats;
}

/** MVP = Points + 3×(Points in wins) + 2×Decisive goals + 1×Decisive assists */
export function mvpScore(s: PlayerStats): number {
  return s.points + 3 * s.pointsInWins + 2 * s.decisiveGoals + s.decisiveAssists;
}

/** Single MVP. Ties: decisive goals → wins → points → goals → assists → id. */
export function mvpWinner(entries: readonly Entry[]): string | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort(
    (a, b) =>
      mvpScore(b.s) - mvpScore(a.s) ||
      b.s.decisiveGoals - a.s.decisiveGoals ||
      b.s.gamesWon - a.s.gamesWon ||
      b.s.points - a.s.points ||
      b.s.goals - a.s.goals ||
      b.s.assists - a.s.assists ||
      a.id.localeCompare(b.id),
  );
  if (mvpScore(sorted[0].s) <= 0) return null;
  return sorted[0].id;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * Defensive score per player: average over games of
 * clamp((G - goalsAgainst) / G, -0.5, 1) + 0.15 for a win, where G is the
 * game's max score (or 5), minus 0.05 × min(points per game, 3).
 */
export function bestDefenderScores(
  entries: readonly Entry[],
  games: readonly Game[],
): Map<string, number> {
  const perGame = new Map<string, number[]>();
  for (const e of entries) perGame.set(e.id, []);
  for (const game of games) {
    const score = gameScore(game);
    const winner = winnerOf(score);
    const g = game.maxScore ?? 5;
    for (const side of ['left', 'right'] as const) {
      const against = side === 'left' ? score.right : score.left;
      const value = clamp((g - against) / g, -0.5, 1) + (winner === side ? 0.15 : 0);
      for (const id of game.teams[side]) perGame.get(id)?.push(value);
    }
  }
  const result = new Map<string, number>();
  for (const e of entries) {
    const values = perGame.get(e.id)!;
    if (values.length === 0) continue;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const ppg = e.s.gamesPlayed > 0 ? e.s.points / e.s.gamesPlayed : 0;
    result.set(e.id, avg - 0.05 * Math.min(ppg, 3));
  }
  return result;
}

/** Best defender: at least 3 games, not the MVP, single winner. */
export function bestDefenderWinner(
  entries: readonly Entry[],
  games: readonly Game[],
  mvpId: string | null,
): string | null {
  const scores = bestDefenderScores(entries, games);
  const eligible = entries
    .filter((e) => e.s.gamesPlayed >= 3 && e.id !== mvpId && scores.has(e.id))
    .sort((a, b) => scores.get(b.id)! - scores.get(a.id)! || a.id.localeCompare(b.id));
  return eligible[0]?.id ?? null;
}

/** Pig: one player among those with fewest wins; ties → fewest points, goals, assists, MVP score. */
export function pigWinner(entries: readonly Entry[]): string | null {
  if (entries.length === 0) return null;
  const minWins = Math.min(...entries.map((e) => e.s.gamesWon));
  const sorted = entries
    .filter((e) => e.s.gamesWon === minWins)
    .sort(
      (a, b) =>
        a.s.points - b.s.points ||
        a.s.goals - b.s.goals ||
        a.s.assists - b.s.assists ||
        mvpScore(a.s) - mvpScore(b.s),
    );
  return sorted[0]?.id ?? null;
}

export function hattrickAward(count: number): AwardId | null {
  if (count <= 0) return null;
  if (count === 1) return 'hat';
  return `hat_${Math.min(count, 9)}` as AwardId;
}

export function calculateAwards(
  players: readonly Player[],
  stats: Map<string, PlayerStats>,
  games: readonly Game[],
  pigEnabled: boolean,
): Map<string, AwardId[]> {
  const awards = new Map<string, AwardId[]>();
  const entries: Entry[] = players.map((p) => ({ id: p.id, s: stats.get(p.id)! }));
  for (const e of entries) awards.set(e.id, []);
  if (entries.length === 0) return awards;

  const most = (key: keyof PlayerStats, award: AwardId) => {
    const max = Math.max(...entries.map((e) => e.s[key]));
    if (max <= 0) return;
    for (const e of entries) if (e.s[key] === max) awards.get(e.id)!.push(award);
  };
  most('gamesWon', 'crown');
  most('points', 'star');
  most('goals', 'bullseye');
  most('assists', 'assist');

  if (pigEnabled && games.length > 0) {
    const pig = pigWinner(entries);
    if (pig) awards.get(pig)!.push('pig');
  }

  const mvp = mvpWinner(entries);
  const def = bestDefenderWinner(entries, games, mvp);
  if (def) awards.get(def)!.push('best_def');
  if (mvp) awards.get(mvp)!.push('mvp');

  for (const e of entries) {
    const hat = hattrickAward(e.s.hattricks);
    if (hat) awards.get(e.id)!.push(hat);
  }
  return awards;
}

/** Best goalkeeper(s): at least 3 games; ties share the award. */
export function bestGoalkeeperIds(
  goalkeepers: readonly Goalkeeper[],
  stats: Map<string, GoalkeeperStats>,
): string[] {
  const eligible = goalkeepers
    .map((gk) => ({ id: gk.id, s: stats.get(gk.id)! }))
    .filter((e) => e.s.games >= 3)
    .sort((a, b) => compareGoalkeepers(a.s, b.s));
  const best = eligible[0];
  if (!best) return [];
  return eligible
    .filter(
      (e) =>
        e.s.wins === best.s.wins &&
        goalsAgainstPerGame(e.s) === goalsAgainstPerGame(best.s) &&
        e.s.cleanSheets === best.s.cleanSheets,
    )
    .map((e) => e.id);
}

export interface FinalDraw {
  /** Exactly two players share the most wins → put on different teams. */
  crown: [string, string] | null;
  /** Exactly two players share the fewest wins → put on different teams. */
  pig: [string, string] | null;
}

/**
 * Who has to be split up in the final game. Like the awards, it looks at all
 * players of the session; a rule only applies when exactly two players are
 * tied and both are playing the final. Otherwise the draw is the usual one.
 */
export function finalDrawRules(
  players: readonly Player[],
  stats: Map<string, PlayerStats>,
  playingIds: readonly string[],
  pigEnabled: boolean,
): FinalDraw {
  const playing = new Set(playingIds);
  const wins = players.map((p) => ({ id: p.id, w: stats.get(p.id)?.gamesWon ?? 0 }));
  const tiedPair = (target: number): [string, string] | null => {
    const tied = wins.filter((x) => x.w === target).map((x) => x.id);
    return tied.length === 2 && tied.every((id) => playing.has(id)) ? [tied[0], tied[1]] : null;
  };
  if (wins.length === 0) return { crown: null, pig: null };
  const max = Math.max(...wins.map((x) => x.w));
  const min = Math.min(...wins.map((x) => x.w));
  return {
    crown: max > 0 ? tiedPair(max) : null,
    pig: pigEnabled && min !== max ? tiedPair(min) : null,
  };
}
