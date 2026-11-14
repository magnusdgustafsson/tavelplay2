import { describe, expect, it } from 'vitest';
import type { Game, Player, Settings, Side } from './types';
import { DEFAULT_SETTINGS } from './types';
import { addGoal, addPlayerDuringGame, createGame, removePlayerDuringGame, undoLastGoal } from './game';
import {
  computeGoalkeeperStats,
  computePlayerStats,
  decisiveGoalIndex,
  isMaxScoreReached,
  isPlayingOnForTwo,
  sortedStandings,
  winsByColor,
} from './stats';
import { bestGoalkeeperIds, calculateAwards, finalDrawRules, mvpScore } from './awards';
import { isPlusMinusFair, pairCounts, randomizeTeams, reconcileTeams, teamSignature } from './teams';

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

  /** Play a whole evening with the randomiser; returns all lineups. */
  const evening = (players: string[], games: number, seed: number) => {
    const rng = seeded(seed);
    const history: { left: string[]; right: string[] }[] = [];
    for (let g = 0; g < games; g++) history.push(randomizeTeams(players, history, rng)!);
    return history;
  };

  it('splits all players, left gets the extra one', () => {
    const r = randomizeTeams(ids.slice(0, 7), [], seeded(1))!;
    expect(r.left).toHaveLength(4);
    expect(r.right).toHaveLength(3);
    expect([...r.left, ...r.right].sort()).toEqual(ids.slice(0, 7).sort());
  });

  it('never repeats a lineup during an evening', () => {
    for (const n of [6, 7, 10, 14]) {
      for (let seed = 1; seed <= 5; seed++) {
        const sigs = evening(ids.concat(['11', '12', '13', '14']).slice(0, n), 8, seed).map((t) => teamSignature(t.left, t.right));
        expect(new Set(sigs).size).toBe(sigs.length);
      }
    }
  });

  it('spreads teammates evenly: 10 players, 9 games → every pair 2–6 times, spread ≤ 3 on average', () => {
    let spreadSum = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const counts = pairCounts(evening(ids, 9, seed));
      const values: number[] = [];
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) values.push(counts.get(ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`) ?? 0);
      expect(Math.min(...values)).toBeGreaterThanOrEqual(2);
      expect(Math.max(...values)).toBeLessThanOrEqual(6);
      spreadSum += Math.max(...values) - Math.min(...values);
    }
    expect(spreadSum / 10).toBeLessThanOrEqual(3);
  });

  it('a late arrival is not forced to catch up with everyone at once', () => {
    const history = evening(ids.slice(0, 9), 4, 2);
    const next = randomizeTeams(ids, history, seeded(5))!;
    expect(next.left.length + next.right.length).toBe(10);
  });

  it('small groups really change teams (7 players)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const games = evening(ids.slice(0, 7), 6, seed);
      for (let g = 1; g < games.length; g++) {
        const prevLeft = new Set(games[g - 1].left);
        const sameSide = games[g].left.filter((id) => prevLeft.has(id)).length + games[g].right.filter((id) => !prevLeft.has(id)).length;
        expect(Math.min(sameSide, 7 - sameSide)).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('new players mid-evening are mixed in', () => {
    const history = evening(ids.slice(0, 8), 3, 4);
    const r = randomizeTeams(ids, history, seeded(9))!;
    expect([...r.left, ...r.right].sort()).toEqual([...ids].sort());
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

describe('win margin two goals', () => {
  const settings = { ...DEFAULT_SETTINGS, maxScoreEnabled: true, maxScore: 3, winByTwoEnabled: true };
  const fresh = () => createGame({ left: ['A'], right: ['B'], leftGkId: null, rightGkId: null }, settings, false);

  it('goes on at max–(max-1) and locks once a team leads by two', () => {
    const g = fresh();
    for (const side of ['left', 'right', 'left', 'right', 'left'] as Side[]) addGoal(g, side, side === 'left' ? 'A' : 'B', null);
    expect(isMaxScoreReached(g)).toBe(false); // 3–2
    expect(isPlayingOnForTwo(g)).toBe(true);
    expect(addGoal(g, 'right', 'B', null)).toBe(true); // 3–3
    expect(addGoal(g, 'left', 'A', null)).toBe(true); // 4–3
    expect(isMaxScoreReached(g)).toBe(false);
    expect(addGoal(g, 'left', 'A', null)).toBe(true); // 5–3
    expect(isMaxScoreReached(g)).toBe(true);
    expect(addGoal(g, 'right', 'B', null)).toBe(false);
    expect(decisiveGoalIndex(g)).toBe(7);
  });

  it('a clear lead at max ends it as usual', () => {
    const g = fresh();
    for (let i = 0; i < 3; i++) addGoal(g, 'left', 'A', null);
    expect(isMaxScoreReached(g)).toBe(true);
  });

  it('does nothing without max score', () => {
    const g = createGame({ left: ['A'], right: ['B'], leftGkId: null, rightGkId: null }, { ...settings, maxScoreEnabled: false }, false);
    expect(g.winByTwo).toBe(false);
    expect(g.maxScore).toBeNull();
  });
});

describe('win by two – cap at 10 goals', () => {
  const settings = { ...DEFAULT_SETTINGS, maxScoreEnabled: true, maxScore: 5, winByTwoEnabled: true };
  it('at 9–9 the next goal wins (10–9) and is decisive', () => {
    const g = createGame({ left: ['A'], right: ['B'], leftGkId: null, rightGkId: null }, settings, false);
    for (let i = 0; i < 9; i++) {
      addGoal(g, 'left', 'A', null);
      addGoal(g, 'right', 'B', null);
    }
    expect(isPlayingOnForTwo(g)).toBe(true); // 9–9
    addGoal(g, 'right', 'B', null); // 9–10
    expect(isMaxScoreReached(g)).toBe(true);
    expect(isPlayingOnForTwo(g)).toBe(false);
    expect(addGoal(g, 'left', 'A', null)).toBe(false);
    expect(decisiveGoalIndex(g)).toBe(18);
  });
  it('still plays on at 9–8', () => {
    const g = createGame({ left: ['A'], right: ['B'], leftGkId: null, rightGkId: null }, settings, false);
    for (let i = 0; i < 8; i++) {
      addGoal(g, 'left', 'A', null);
      addGoal(g, 'right', 'B', null);
    }
    addGoal(g, 'left', 'A', null); // 9–8
    expect(isMaxScoreReached(g)).toBe(false);
  });
});

describe('final game draw', () => {
  const ps = players(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  const all = ps.map((p) => p.id);
  const statsWith = (wins: Record<string, number>) =>
    new Map(ps.map((p) => [p.id, { ...computePlayerStats([p], []).get(p.id)!, gamesWon: wins[p.id] ?? 0 }]));

  it('splits exactly two players tied for most and for fewest wins', () => {
    const s = statsWith({ A: 4, B: 4, C: 3, D: 2, E: 2, F: 2, G: 1, H: 1 });
    expect(finalDrawRules(ps, s, all, true)).toEqual({ crown: ['A', 'B'], pig: ['G', 'H'] });
  });

  it('regular draw when the leader is alone or three or more are tied', () => {
    const s = statsWith({ A: 5, B: 4, C: 1, D: 1, E: 1, F: 2, G: 2, H: 3 });
    expect(finalDrawRules(ps, s, all, true)).toEqual({ crown: null, pig: null });
  });

  it('no pig rule when the pig award is off, and only if both are playing', () => {
    const s = statsWith({ A: 4, B: 4, G: 0, H: 0, C: 2, D: 2, E: 2, F: 2 });
    expect(finalDrawRules(ps, s, all, false).pig).toBeNull();
    expect(finalDrawRules(ps, s, all.filter((id) => id !== 'H'), true).pig).toBeNull();
    expect(finalDrawRules(ps, s, all.filter((id) => id !== 'H'), true).crown).toEqual(['A', 'B']);
  });

  it('the draw always keeps the split pairs on different teams', () => {
    const history = [{ left: ['A', 'B', 'G', 'H'], right: ['C', 'D', 'E', 'F'] }];
    for (let seed = 1; seed <= 30; seed++) {
      const r = randomizeTeams(all, history, seeded(seed), [['A', 'B'], ['G', 'H']])!;
      expect(r.left.includes('A')).not.toBe(r.left.includes('B'));
      expect(r.left.includes('G')).not.toBe(r.left.includes('H'));
    }
  });

  it('also with 18 players (fast search)', () => {
    const big = Array.from({ length: 18 }, (_, i) => `p${i}`);
    for (let seed = 1; seed <= 5; seed++) {
      const r = randomizeTeams(big, [], seeded(seed), [['p0', 'p1'], ['p2', 'p3']])!;
      expect(r.left.includes('p0')).not.toBe(r.left.includes('p1'));
      expect(r.left.includes('p2')).not.toBe(r.left.includes('p3'));
    }
  });
});
