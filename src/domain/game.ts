// Operations on a game in progress. They mutate the game they are given,
// which works both on plain objects (tests) and on immer drafts (store).
import type { Game, Settings, Side, Teams } from './types';
import { gameScore, isMaxScoreReached } from './stats';

export function newId(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function createGame(teams: Teams, settings: Settings, plusMinus: boolean): Game {
  const joinedAtGoal: Record<string, number> = {};
  for (const id of [...teams.left, ...teams.right]) joinedAtGoal[id] = 0;
  return {
    id: newId('g-'),
    startedAt: Date.now(),
    endedAt: null,
    colors: { left: settings.leftColor, right: settings.rightColor },
    teams: {
      left: [...teams.left],
      right: [...teams.right],
      leftGkId: settings.goalkeepersEnabled ? teams.leftGkId : null,
      rightGkId: settings.goalkeepersEnabled ? teams.rightGkId : null,
    },
    goals: [],
    maxScore: settings.maxScoreEnabled ? settings.maxScore : null,
    plusMinus,
    joinedAtGoal,
    leftAtGoal: {},
    lateJoinerIds: [],
    removed: [],
  };
}

export function addGoal(
  game: Game,
  side: Side,
  scorerId: string,
  assistId: string | null,
): boolean {
  if (isMaxScoreReached(game)) return false;
  if (!game.teams[side].includes(scorerId)) return false;
  const assist = assistId && assistId !== scorerId ? assistId : null;
  game.goals.push({ side, scorerId, assistId: assist, at: Date.now() });
  return true;
}

export function undoLastGoal(game: Game): boolean {
  return game.goals.pop() !== undefined;
}

export type RemoveResult = 'ok' | 'last-player' | 'not-found';

/**
 * Remove a player mid-game. They keep win credit if they stayed through
 * their own team's 2nd goal.
 */
export function removePlayerDuringGame(game: Game, playerId: string): RemoveResult {
  const side: Side | null = game.teams.left.includes(playerId)
    ? 'left'
    : game.teams.right.includes(playerId)
      ? 'right'
      : null;
  if (!side) return 'not-found';
  if (game.teams[side].length <= 1) return 'last-player';

  const ownScore = gameScore(game)[side];
  const leftAtGoal = game.goals.length;
  game.removed = game.removed.filter((r) => r.id !== playerId);
  game.removed.push({ id: playerId, side, winCredit: ownScore >= 2, leftAtGoal });
  game.leftAtGoal[playerId] = leftAtGoal;
  game.teams[side] = game.teams[side].filter((id) => id !== playerId);
  return 'ok';
}

/**
 * Add a player mid-game. If their own team has already scored they get no
 * win credit (shown as LATE).
 */
export function addPlayerDuringGame(game: Game, side: Side, playerId: string): boolean {
  if (game.teams.left.includes(playerId) || game.teams.right.includes(playerId)) return false;
  game.teams[side].push(playerId);
  delete game.leftAtGoal[playerId];
  game.removed = game.removed.filter((r) => r.id !== playerId);
  game.joinedAtGoal[playerId] = game.goals.length;
  game.lateJoinerIds = game.lateJoinerIds.filter((id) => id !== playerId);
  if (gameScore(game)[side] > 0) game.lateJoinerIds.push(playerId);
  return true;
}

/** All player ids that took part in a game (for editing goals in history). */
export function gameParticipants(game: Game): string[] {
  return [
    ...new Set([
      ...game.teams.left,
      ...game.teams.right,
      ...game.removed.map((r) => r.id),
    ]),
  ];
}

export function sideOfParticipant(game: Game, playerId: string): Side | null {
  if (game.teams.left.includes(playerId)) return 'left';
  if (game.teams.right.includes(playerId)) return 'right';
  return game.removed.find((r) => r.id === playerId)?.side ?? null;
}
