import { describe, expect, it } from 'vitest';
import type { Game, Player, Settings, Side } from './types';
import { DEFAULT_SETTINGS } from './types';
import { addGoal, addPlayerDuringGame, createGame, removePlayerDuringGame, undoLastGoal } from './game';
import {
  computeGoalkeeperStats,
  computePlayerStats,
  decisiveGoalIndex,
  sortedStandings,
  winsByColor,
} from './stats';
import { bestGoalkeeperIds, calculateAwards, mvpScore } from './awards';
import { isPlusMinusFair, randomizeTeams, reconcileTeams, teamSignature } from './teams';

const players = (names: string[]): Player[] => names.map((n) => ({ id: n, name: n, active: true }));

function game(left: string[], right: string[], goals: [Side, string, string?][], settings: Partial<Settings> = {}, plusMinus = false): Game {
  const g = createGame({ left, right, leftGkId: null, rightGkId: null }, { ...DEFAULT_SETTINGS, ...settings }, plusMinus);
  for (const [side, scorer, assist] of goals) addGoal(g, side, scorer, assist ?? null);
  g.endedAt = Date.now();
  return g;
}

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe('decisive goal', () => {
  it('is the first goal giving the winner a lead of 2 that is never caught', () => {
    const g = game(['A'], ['B'], [['left', 'A'], ['left', 'A'], ['right', 'B'], ['left', 'A']]);
    expect(decisiveGoalIndex(g)).toBe(1);
  });
  it('ignores a 2-goal lead that is later caught', () => {
    const g = game(['A'], ['B'], [['left', 'A'], ['left', 'A'], ['right', 'B'], ['right', 'B'], ['left', 'A']]);
    expect(decisiveGoalIndex(g)).toBeNull();
  });
  it('with max score: last goal breaking a tie at max-1', () => {
    const goals: [Side, string][] = [['left', 'A'], ['right', 'B'], ['left', 'A'], ['right', 'B'], ['left', 'A']];
    const g = game(['A'], ['B'], goals, { maxScoreEnabled: true, maxScore: 3 });
    expect(decisiveGoalIndex(g)).toBe(4);
  });
  it('none on a draw', () => {
    expect(decisiveGoalIndex(game(['A'], ['B'], [['left', 'A'], ['right', 'B']]))).toBeNull();
  });
});

describe('player stats', () => {
  it('counts goals, assists, wins, hattricks and points in wins', () => {
    const ps = players(['A', 'B', 'C', 'D']);
    const g1 = game(['A', 'B'], ['C', 'D'], [['left', 'A', 'B'], ['left', 'A'], ['left', 'A', 'B'], ['right', 'C']]);
    const s = computePlayerStats(ps, [g1]);
    expect(s.get('A')).toMatchObject({ goals: 3, assists: 0, points: 3, hattricks: 1, gamesWon: 1, gamesPlayed: 1, pointsInWins: 3, decisiveGoals: 1 });
    expect(s.get('B')).toMatchObject({ assists: 2, points: 2, gamesWon: 1, decisiveAssists: 0 });
    expect(s.get('C')).toMatchObject({ goals: 1, gamesWon: 0, gamesPlayed: 1, pointsInWins: 0 });
  });

  it('a game in progress counts points live but not games played', () => {
    const ps = players(['A', 'B']);
    const g = createGame({ left: ['A'], right: ['B'], leftGkId: null, rightGkId: null }, DEFAULT_SETTINGS, false);
    addGoal(g, 'left', 'A', null);
    const s = computePlayerStats(ps, [], g);
    expect(s.get('A')).toMatchObject({ goals: 1, points: 1, gamesPlayed: 0, gamesWon: 0 });
  });

  it('late joiners get no win; leavers after own 2nd goal keep win credit', () => {
    const ps = players(['A', 'B', 'C', 'D', 'E']);
    const g = createGame({ left: ['A', 'B'], right: ['C', 'D'], leftGkId: null, rightGkId: null }, DEFAULT_SETTINGS, false);
    addGoal(g, 'left', 'A', null);
    addPlayerDuringGame(g, 'left', 'E'); // own team already scored → late
    addGoal(g, 'left', 'A', null);
    expect(removePlayerDuringGame(g, 'B')).toBe('ok'); // after 2nd goal → credit
    addGoal(g, 'left', 'E', null);
    g.endedAt = Date.now();
    const s = computePlayerStats(ps, [g]);
    expect(s.get('A')!.gamesWon).toBe(1);
    expect(s.get('B')).toMatchObject({ gamesWon: 1, gamesPlayed: 1 });
    expect(s.get('E')).toMatchObject({ gamesWon: 0, gamesPlayed: 1, goals: 1 });
  });

  it('a player who leaves before own 2nd goal gets nothing', () => {
    const ps = players(['A', 'B', 'C']);
    const g = createGame({ left: ['A', 'B'], right: ['C'], leftGkId: null, rightGkId: null }, DEFAULT_SETTINGS, false);
    removePlayerDuringGame(g, 'B');
    addGoal(g, 'left', 'A', null);
    g.endedAt = 1;
    expect(computePlayerStats(ps, [g]).get('B')).toMatchObject({ gamesWon: 0, gamesPlayed: 0 });
  });

  it('cannot remove the last player of a team', () => {
    const g = createGame({ left: ['A'], right: ['B'], leftGkId: null, rightGkId: null }, DEFAULT_SETTINGS, false);
    expect(removePlayerDuringGame(g, 'A')).toBe('last-player');
  });

  it('plus/minus follows who was on the pitch', () => {
    const ps = players(['A', 'B', 'C', 'D', 'E']);
    const g = createGame({ left: ['A', 'B'], right: ['C', 'D'], leftGkId: null, rightGkId: null }, DEFAULT_SETTINGS, true);
    addGoal(g, 'left', 'A', null); // A,B +1  C,D -1
    removePlayerDuringGame(g, 'D');
    addPlayerDuringGame(g, 'right', 'E');
    addGoal(g, 'right', 'C', null); // C,E +1  A,B -1
    const s = computePlayerStats(ps, [], g);
    expect(['A', 'B', 'C', 'D', 'E'].map((id) => s.get(id)!.plusMinus)).toEqual([0, 0, 0, -1, 1]);
  });

  it('undo removes the last goal', () => {
    const g = createGame({ left: ['A'], right: ['B'], leftGkId: null, rightGkId: null }, DEFAULT_SETTINGS, false);
    addGoal(g, 'left', 'A', null);
    undoLastGoal(g);
    expect(g.goals).toHaveLength(0);
  });

  it('max score blocks further goals', () => {
    const g = createGame({ left: ['A'], right: ['B'], leftGkId: null, rightGkId: null }, { ...DEFAULT_SETTINGS, maxScoreEnabled: true, maxScore: 1 }, false);
    expect(addGoal(g, 'left', 'A', null)).toBe(true);
    expect(addGoal(g, 'right', 'B', null)).toBe(false);
  });

  it('standings order: wins, points, goals', () => {
    const ps = players(['A', 'B', 'C', 'D']);
    const g1 = game(['A', 'B'], ['C', 'D'], [['right', 'C'], ['right', 'C'], ['left', 'A']]);
    const order = sortedStandings(ps, computePlayerStats(ps, [g1])).map((r) => r.player.id);
    expect(order).toEqual(['C', 'D', 'A', 'B']);
  });

  it('wins by colour follow the colour, not the side', () => {
    const g1 = game(['A'], ['B'], [['left', 'A']]);
    const g2 = game(['A'], ['B'], [['left', 'A']], { leftColor: 'white', rightColor: 'black' });
    const w = winsByColor([g1, g2]);
    expect(w.get('black')).toBe(1);
    expect(w.get('white')).toBe(1);
  });
});

describe('awards', () => {
  const ps = players(['A', 'B', 'C', 'D']);
  const games = [
    game(['A', 'B'], ['C', 'D'], [['left', 'A', 'B'], ['left', 'A'], ['left', 'A']]),
    game(['A', 'C'], ['B', 'D'], [['left', 'C'], ['right', 'B', 'D']]),
    game(['A', 'D'], ['B', 'C'], [['left', 'A'], ['left', 'D']]),
  ];
  const stats = computePlayerStats(ps, games);
  const awards = calculateAwards(ps, stats, games, true);

  it('gives most-X awards, MVP, hattrick and a single pig', () => {
    expect(awards.get('A')).toEqual(expect.arrayContaining(['crown', 'star', 'bullseye', 'mvp', 'hat']));
    expect(awards.get('B')).toContain('assist');
    const pigs = [...awards.values()].filter((a) => a.includes('pig'));
    expect(pigs).toHaveLength(1);
    expect(awards.get('C')).toContain('pig');
  });

  it('best defender needs 3 games and is never the MVP', () => {
    const def = [...awards.entries()].filter(([, a]) => a.includes('best_def'));
    expect(def).toHaveLength(1);
    expect(def[0][0]).not.toBe('A');
  });

  it('pig can be disabled', () => {
    const a = calculateAwards(ps, stats, games, false);
    expect([...a.values()].some((x) => x.includes('pig'))).toBe(false);
  });

  it('MVP score formula', () => {
    expect(mvpScore({ ...stats.get('A')!, points: 2, pointsInWins: 1, decisiveGoals: 1, decisiveAssists: 1 })).toBe(2 + 3 + 2 + 1);
  });

  it('best goalkeeper needs 3 games', () => {
    const gks = [{ id: 'G1', name: 'G1' }, { id: 'G2', name: 'G2' }];
    const withGk = games.map((g) => ({ ...g, teams: { ...g.teams, leftGkId: 'G1', rightGkId: 'G2' } }));
    const gs = computeGoalkeeperStats(gks, withGk);
    expect(gs.get('G1')).toMatchObject({ games: 3, wins: 2, goalsConceded: 1, cleanSheets: 2 });
    expect(bestGoalkeeperIds(gks, gs)).toEqual(['G1']);
    expect(bestGoalkeeperIds(gks, computeGoalkeeperStats(gks, withGk.slice(0, 2)))).toEqual([]);
  });
});

describe('teams', () => {
  const ids = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

  it('splits all players, left gets the extra one', () => {
    const r = randomizeTeams(ids.slice(0, 7), null, [], seeded(1))!;
    expect(r.left).toHaveLength(4);
    expect(r.right).toHaveLength(3);
    expect([...r.left, ...r.right].sort()).toEqual(ids.slice(0, 7).sort());
  });

  it('with 8–11 players, 2 switch side in each direction when possible', () => {
    const prev = { left: ids.slice(0, 5), right: ids.slice(5) };
    for (let seed = 1; seed < 20; seed++) {
      const r = randomizeTeams(ids, prev, [], seeded(seed))!;
      const toLeft = r.left.filter((id) => prev.right.includes(id)).length;
      const toRight = r.right.filter((id) => prev.left.includes(id)).length;
      expect([toLeft, toRight]).toEqual([2, 2]);
    }
  });

  it('records lineups and resets history after 10', () => {
    const r = randomizeTeams(ids, null, [], seeded(3))!;
    expect(r.teamHistory).toEqual([teamSignature(r.left, r.right)]);
    const full = Array.from({ length: 10 }, (_, i) => `x${i}`);
    expect(randomizeTeams(ids, null, full, seeded(3))!.teamHistory).toEqual([]);
  });

  it('reconcile drops inactive players and adds new ones to the smaller team', () => {
    const t = reconcileTeams({ left: ['1', '2'], right: ['3', '4'], leftGkId: null, rightGkId: null }, ['1', '3', '4', '5']);
    expect(t.left).toEqual(['1', '5']);
    expect(t.right).toEqual(['3', '4']);
  });

  it('plus/minus is fair only with 3–5 starters and exactly 2N players', () => {
    expect(isPlusMinusFair(true, 4, 8)).toBe(true);
    expect(isPlusMinusFair(true, 4, 9)).toBe(false);
    expect(isPlusMinusFair(true, 6, 12)).toBe(false);
    expect(isPlusMinusFair(false, 4, 8)).toBe(false);
  });
});
