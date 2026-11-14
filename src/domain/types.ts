// Core data model for TavelPlay 2.
// All statistics are *derived* from the game list (see stats.ts) – nothing is
// stored as a running counter, so editing or deleting a game can never leave
// the standings out of sync.

export type Side = 'left' | 'right';

export const TEAM_COLORS = [
  'black',
  'white',
  'blue',
  'red',
  'yellow',
  'green',
  'orange',
  'purple',
] as const;
export type TeamColor = (typeof TEAM_COLORS)[number];

export interface Player {
  id: string;
  name: string;
  /** false = removed from the session but kept because they have played games */
  active: boolean;
}

export interface Goalkeeper {
  id: string;
  name: string;
}

export interface RecurringPlayer {
  id: string;
  name: string;
}

export interface Goal {
  side: Side;
  scorerId: string;
  assistId: string | null;
  at: number;
}

/** Player ids per side plus dedicated goalkeepers. */
export interface Teams {
  left: string[];
  right: string[];
  leftGkId: string | null;
  rightGkId: string | null;
}

export interface RemovedPlayer {
  id: string;
  side: Side;
  /** Stayed through own team's 2nd goal → gets win credit if the team wins. */
  winCredit: boolean;
  /** Number of goals in the game when they left. */
  leftAtGoal: number;
}

export interface Game {
  id: string;
  startedAt: number;
  endedAt: number | null;
  colors: { left: TeamColor; right: TeamColor };
  /** Rosters (final rosters once the game has ended). */
  teams: Teams;
  goals: Goal[];
  /** Max score that applied to this game, or null if unlimited. */
  maxScore: number | null;
  /** With a max score: the winner must also lead by two goals. */
  winByTwo?: boolean;
  /** The final game of the session. */
  final?: boolean;
  plusMinus: boolean;
  /** playerId → goal index when they joined (0 = from the start). */
  joinedAtGoal: Record<string, number>;
  /** playerId → goal index when they left. */
  leftAtGoal: Record<string, number>;
  /** Joined after their own team had scored → no win credit. */
  lateJoinerIds: string[];
  removed: RemovedPlayer[];
}

export interface Settings {
  assistsEnabled: boolean;
  maxScoreEnabled: boolean;
  maxScore: number;
  winByTwoEnabled: boolean;
  pigAwardEnabled: boolean;
  randomTeamsEnabled: boolean;
  goalkeepersEnabled: boolean;
  leftColor: TeamColor;
  rightColor: TeamColor;
}

export const DEFAULT_SETTINGS: Settings = {
  assistsEnabled: true,
  maxScoreEnabled: false,
  maxScore: 5,
  winByTwoEnabled: false,
  pigAwardEnabled: true,
  randomTeamsEnabled: true,
  goalkeepersEnabled: false,
  leftColor: 'black',
  rightColor: 'white',
};

export const MAX_PLAYERS = 20;

export function otherSide(side: Side): Side {
  return side === 'left' ? 'right' : 'left';
}

export function teamLabel(color: TeamColor): string {
  return color.toUpperCase();
}
