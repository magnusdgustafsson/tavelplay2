import type { Game, Goalkeeper, Player, Side } from './types';
import { otherSide } from './types';

export interface Score {
  left: number;
  right: number;
}

export function gameScore(game: Pick<Game, 'goals'>): Score {
  let left = 0;
  let right = 0;
  for (const g of game.goals) {
    if (g.side === 'left') left++;
    else right++;
  }
  return { left, right };
}

export function winnerOf(score: Score): Side | null {
  if (score.left > score.right) return 'left';
  if (score.right > score.left) return 'right';
  return null;
}

export function isMaxScoreReached(game: Game): boolean {
  if (game.maxScore === null) return false;
  const s = gameScore(game);
  const reached = s.left >= game.maxScore || s.right >= game.maxScore;
  if (!game.winByTwo) return reached;
  return reached && Math.abs(s.left - s.right) >= 2;
}

/** Max score reached but nobody leads by two yet → keep playing. */
export function isPlayingOnForTwo(game: Game): boolean {
  if (game.maxScore === null || !game.winByTwo) return false;
  const s = gameScore(game);
  return (s.left >= game.maxScore || s.right >= game.maxScore) && Math.abs(s.left - s.right) < 2;
}

/**
 * Index of the decisive goal, or null.
 * 1. With max score: a final goal that breaks a (max-1)–(max-1) tie.
 * 2. Otherwise: the first goal that gives the eventual winner a 2-goal lead
 *    that the loser never catches up with afterwards.
 */
export function decisiveGoalIndex(game: Pick<Game, 'goals' | 'maxScore' | 'winByTwo'>): number | null {
  const goals = game.goals;
  if (goals.length === 0) return null;
  const final = gameScore(game);
  const winner = winnerOf(final);
  if (!winner) return null;
  const loser = otherSide(winner);

  if (game.maxScore !== null && !game.winByTwo) {
    if (final[winner] === game.maxScore && final[loser] === game.maxScore - 1) {
      return goals.length - 1;
    }
  }

  const running: Score = { left: 0, right: 0 };
  for (let i = 0; i < goals.length; i++) {
    running[goals[i].side]++;
    if (running[winner] - running[loser] < 2) continue;
    const future = { ...running };
    let held = true;
    for (let j = i + 1; j < goals.length; j++) {
      future[goals[j].side]++;
      if (future[loser] >= future[winner]) {
        held = false;
        break;
      }
    }
    if (held) return i;
  }
  return null;
}

/** Was this player on the pitch for goal number `goalIndex` (0-based)? */
export function wasOnTeamForGoal(game: Game, playerId: string, goalIndex: number): boolean {
  const joined = game.joinedAtGoal[playerId] ?? 0;
  if (joined > goalIndex) return false;
  const left = game.leftAtGoal[playerId];
  if (left !== undefined && left <= goalIndex) return false;
  return true;
}

/** Everyone who counts for plus/minus for one side at a given goal. */
export function plusMinusPlayers(game: Game, side: Side, goalIndex: number): string[] {
  const ids = new Set<string>();
  for (const id of game.teams[side]) {
    if (wasOnTeamForGoal(game, id, goalIndex)) ids.add(id);
  }
  for (const rp of game.removed) {
    if (rp.side === side && wasOnTeamForGoal(game, rp.id, goalIndex)) ids.add(rp.id);
  }
  return [...ids];
}

export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  points: number;
  goals: number;
  assists: number;
  hattricks: number;
  pointsInWins: number;
  decisiveGoals: number;
  decisiveAssists: number;
  plusMinus: number;
}

export interface GoalkeeperStats {
  games: number;
  wins: number;
  goalsConceded: number;
  cleanSheets: number;
}

function emptyPlayerStats(): PlayerStats {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    points: 0,
    goals: 0,
    assists: 0,
    hattricks: 0,
    pointsInWins: 0,
    decisiveGoals: 0,
    decisiveAssists: 0,
    plusMinus: 0,
  };
}

/** Players credited with a win (if their side wins). */
export function winCreditIds(game: Game, side: Side): string[] {
  const late = new Set(game.lateJoinerIds);
  const ids = new Set(game.teams[side].filter((id) => !late.has(id)));
  for (const rp of game.removed) {
    if (rp.side === side && rp.winCredit && !late.has(rp.id)) ids.add(rp.id);
  }
  return [...ids];
}

/** Players credited with a game played. */
export function gamePlayedIds(game: Game, side: Side): string[] {
  const ids = new Set(game.teams[side]);
  for (const rp of game.removed) {
    if (rp.side === side && rp.winCredit) ids.add(rp.id);
  }
  return [...ids];
}

/**
 * Derive all player stats from the finished games. A game in progress adds
 * its goals, assists, points, hattricks and plus/minus live, but games
 * played / won and decisive goals only count once it has ended.
 */
export function computePlayerStats(
  players: readonly Player[],
  games: readonly Game[],
  currentGame: Game | null = null,
): Map<string, PlayerStats> {
  const stats = new Map<string, PlayerStats>();
  for (const p of players) stats.set(p.id, emptyPlayerStats());
  const get = (id: string | null) => (id ? stats.get(id) : undefined);

  const all = currentGame ? [...games, currentGame] : [...games];
  for (const game of all) {
    const finished = game !== currentGame;
    const pointsInGame = new Map<string, number>();
    const goalsInGame = new Map<string, number>();
    const addPoint = (id: string) => pointsInGame.set(id, (pointsInGame.get(id) ?? 0) + 1);

    game.goals.forEach((goal, i) => {
      const scorer = get(goal.scorerId);
      if (scorer) {
        scorer.goals++;
        scorer.points++;
        addPoint(goal.scorerId);
      }
      goalsInGame.set(goal.scorerId, (goalsInGame.get(goal.scorerId) ?? 0) + 1);
      const assister = get(goal.assistId);
      if (assister && goal.assistId) {
        assister.assists++;
        assister.points++;
        addPoint(goal.assistId);
      }
      if (game.plusMinus) {
        for (const id of plusMinusPlayers(game, goal.side, i)) {
          const s = get(id);
          if (s) s.plusMinus++;
        }
        for (const id of plusMinusPlayers(game, otherSide(goal.side), i)) {
          const s = get(id);
          if (s) s.plusMinus--;
        }
      }
    });

    for (const [id, count] of goalsInGame) {
      const s = get(id);
      if (s && count >= 3) s.hattricks++;
    }

    if (!finished) continue;

    for (const side of ['left', 'right'] as const) {
      for (const id of gamePlayedIds(game, side)) {
        const s = get(id);
        if (s) s.gamesPlayed++;
      }
    }

    const winner = winnerOf(gameScore(game));
    if (winner) {
      for (const id of winCreditIds(game, winner)) {
        const s = get(id);
        if (!s) continue;
        s.gamesWon++;
        s.pointsInWins += pointsInGame.get(id) ?? 0;
      }
    }

    const di = decisiveGoalIndex(game);
    if (di !== null) {
      const goal = game.goals[di];
      const scorer = get(goal.scorerId);
      if (scorer) scorer.decisiveGoals++;
      const assister = get(goal.assistId);
      if (assister) assister.decisiveAssists++;
    }
  }
  return stats;
}

export function computeGoalkeeperStats(
  goalkeepers: readonly Goalkeeper[],
  games: readonly Game[],
): Map<string, GoalkeeperStats> {
  const stats = new Map<string, GoalkeeperStats>();
  for (const gk of goalkeepers) {
    stats.set(gk.id, { games: 0, wins: 0, goalsConceded: 0, cleanSheets: 0 });
  }
  for (const game of games) {
    const score = gameScore(game);
    const winner = winnerOf(score);
    for (const side of ['left', 'right'] as const) {
      const gkId = side === 'left' ? game.teams.leftGkId : game.teams.rightGkId;
      const s = gkId ? stats.get(gkId) : undefined;
      if (!s) continue;
      const conceded = score[otherSide(side)];
      s.games++;
      s.goalsConceded += conceded;
      if (conceded === 0) s.cleanSheets++;
      if (winner === side) s.wins++;
    }
  }
  return stats;
}

/** Standings order: games won → points → goals (all descending). */
export function compareStandings(a: PlayerStats, b: PlayerStats): number {
  if (a.gamesWon !== b.gamesWon) return b.gamesWon - a.gamesWon;
  if (a.points !== b.points) return b.points - a.points;
  return b.goals - a.goals;
}

export function sortedStandings(
  players: readonly Player[],
  stats: Map<string, PlayerStats>,
): { player: Player; stats: PlayerStats }[] {
  return players
    .map((player) => ({ player, stats: stats.get(player.id)! }))
    .sort((a, b) => compareStandings(a.stats, b.stats));
}

export function goalsAgainstPerGame(s: GoalkeeperStats): number {
  return s.games > 0 ? s.goalsConceded / s.games : Number.POSITIVE_INFINITY;
}

/** Goalkeeper order: wins → fewest goals against per game → clean sheets. */
export function compareGoalkeepers(a: GoalkeeperStats, b: GoalkeeperStats): number {
  if (a.wins !== b.wins) return b.wins - a.wins;
  const ga = goalsAgainstPerGame(a);
  const gb = goalsAgainstPerGame(b);
  if (ga !== gb) return ga - gb;
  return b.cleanSheets - a.cleanSheets;
}

/** Wins per team colour across the session. */
export function winsByColor(games: readonly Game[]): Map<string, number> {
  const wins = new Map<string, number>();
  for (const game of games) {
    const w = winnerOf(gameScore(game));
    if (!w) continue;
    const color = game.colors[w];
    wins.set(color, (wins.get(color) ?? 0) + 1);
  }
  return wins;
}
