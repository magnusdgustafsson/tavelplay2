import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type {
  Game,
  Goal,
  Goalkeeper,
  Player,
  RecurringPlayer,
  Settings,
  Side,
  Teams,
} from '../domain/types';
import { DEFAULT_SETTINGS, MAX_PLAYERS } from '../domain/types';
import {
  addGoal,
  addPlayerDuringGame as addToGame,
  createGame,
  newId,
  removePlayerDuringGame as removeFromGame,
  undoLastGoal,
} from '../domain/game';
import type { RemoveResult } from '../domain/game';
import { isPlusMinusFair, randomizeTeams, reconcileTeams } from '../domain/teams';
import type { PastLineup } from '../domain/teams';
import { finalDrawRules } from '../domain/awards';
import type { FinalDraw } from '../domain/awards';
import { computePlayerStats } from '../domain/stats';
import type { ThemeId } from '../themes';

export type Screen =
  | 'entries'
  | 'settings'
  | 'teams'
  | 'game'
  | 'game-teams'
  | 'summary'
  | 'history'
  | 'stats';

export type AddPlayerResult = 'ok' | 'empty' | 'duplicate' | 'full';

interface Data {
  players: Player[];
  goalkeepers: Goalkeeper[];
  recurring: RecurringPlayer[];
  games: Game[];
  currentGame: Game | null;
  teams: Teams | null;
  previousTeams: Teams | null;
  settings: Settings;
  theme: ThemeId;
  screen: Screen;
  /** Bumped when teams are freshly randomised → UI plays the shuffle animation. */
  shuffleNonce: number;
  /** Set while the next game is the final: who the draw had to split up. */
  finalDraw: FinalDraw | null;
  /** Bumped on every manual team edit → UI restarts the start-game countdown. */
  teamsEditNonce: number;
}

interface Actions {
  setScreen(screen: Screen): void;
  setTheme(theme: ThemeId): void;
  updateSettings(patch: Partial<Settings>): void;

  addPlayer(name: string): AddPlayerResult;
  removePlayer(id: string): void;
  addGoalkeeper(name: string): boolean;
  removeGoalkeeper(id: string): void;
  addRecurring(name: string): boolean;
  removeRecurring(id: string): void;

  /** final = draw the final game (split tied crown / pig contenders). */
  goToTeamSelection(final?: boolean): void;
  /** Previous lineup again, optionally with the teams changing ends. */
  rematch(swap?: boolean): void;
  /** From the game summary: same teams, swapped ends, straight to team selection. */
  rematchSwapFromSummary(): void;
  swapSides(): void;
  movePlayer(id: string): void;
  removeFromTeams(id: string): void;
  setGoalkeeper(side: Side, gkId: string | null): void;

  startGame(): void;
  abandonGame(): void;
  registerGoal(side: Side, scorerId: string, assistId: string | null): void;
  undoGoal(): void;
  endGame(): void;
  addPlayerDuringGame(side: Side, playerId: string): void;
  addNewPlayerDuringGame(side: Side, name: string): AddPlayerResult;
  removePlayerDuringGame(id: string): RemoveResult;

  finishSession(): void;
  continueSession(): void;
  deleteGame(id: string): void;
  updateGameGoals(id: string, goals: Goal[]): void;
  resetAll(): void;
}

export type Store = Data & Actions;

const initialData = (): Omit<Data, 'recurring' | 'theme' | 'settings'> => ({
  players: [],
  goalkeepers: [],
  games: [],
  currentGame: null,
  teams: null,
  previousTeams: null,
  screen: 'entries',
  shuffleNonce: 0,
  finalDraw: null,
  teamsEditNonce: 0,
});

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const activePlayers = (s: Pick<Data, 'players'>) => s.players.filter((p) => p.active);

/** Who played together in each game this session (incl. players who left mid-game). */
export function sessionLineups(games: readonly Game[]): PastLineup[] {
  return games.map((g) => ({
    left: [...g.teams.left, ...g.removed.filter((r) => r.side === 'left').map((r) => r.id)],
    right: [...g.teams.right, ...g.removed.filter((r) => r.side === 'right').map((r) => r.id)],
  }));
}

export const useStore = create<Store>()(
  persist(
    immer((set, get) => {
      /** Shared by addPlayer / addNewPlayerDuringGame. */
      const addPlayerDraft = (s: Data, name: string): { result: AddPlayerResult; id?: string } => {
        const trimmed = name.trim();
        if (!trimmed) return { result: 'empty' };
        const existing = s.players.find((p) => sameName(p.name, trimmed));
        if (existing) {
          if (existing.active) return { result: 'duplicate', id: existing.id };
          if (activePlayers(s).length >= MAX_PLAYERS) return { result: 'full' };
          existing.active = true;
          return { result: 'ok', id: existing.id };
        }
        if (activePlayers(s).length >= MAX_PLAYERS) return { result: 'full' };
        const id = newId('p-');
        s.players.unshift({ id, name: trimmed, active: true });
        return { result: 'ok', id };
      };

      /** Players and colours change ends; goalkeepers stay in their goal. */
      const swapDraft = (s: Data) => {
        if (!s.teams) return;
        [s.teams.left, s.teams.right] = [s.teams.right, s.teams.left];
        [s.settings.leftColor, s.settings.rightColor] = [s.settings.rightColor, s.settings.leftColor];
      };

      /** A rematch keeps each team in the colour it had in the last game. */
      const restoreLastGameColors = (s: Data) => {
        const last = s.games[s.games.length - 1];
        if (!last) return;
        s.settings.leftColor = last.colors.left;
        s.settings.rightColor = last.colors.right;
      };

      const hasPlayed = (s: Data, id: string) =>
        [...s.games, ...(s.currentGame ? [s.currentGame] : [])].some(
          (g) =>
            g.teams.left.includes(id) ||
            g.teams.right.includes(id) ||
            g.removed.some((r) => r.id === id),
        );

      return {
        ...initialData(),
        recurring: [],
        settings: { ...DEFAULT_SETTINGS },
        theme: 'c64',

        setScreen: (screen) =>
          set((s) => {
            s.screen = screen;
            // Going back to Player Entries cancels a planned final.
            if (screen === 'entries') s.finalDraw = null;
          }),
        setTheme: (theme) => set({ theme }),
        updateSettings: (patch) =>
          set((s) => {
            Object.assign(s.settings, patch);
          }),

        addPlayer: (name) => {
          let result: AddPlayerResult = 'empty';
          set((s) => {
            result = addPlayerDraft(s, name).result;
          });
          return result;
        },
        removePlayer: (id) =>
          set((s) => {
            if (hasPlayed(s, id)) {
              const p = s.players.find((x) => x.id === id);
              if (p) p.active = false;
            } else {
              s.players = s.players.filter((x) => x.id !== id);
            }
          }),
        addGoalkeeper: (name) => {
          const trimmed = name.trim();
          if (!trimmed || get().goalkeepers.some((g) => sameName(g.name, trimmed))) return false;
          set((s) => {
            s.goalkeepers.push({ id: newId('gk-'), name: trimmed });
          });
          return true;
        },
        removeGoalkeeper: (id) =>
          set((s) => {
            s.goalkeepers = s.goalkeepers.filter((g) => g.id !== id);
            if (s.teams) {
              if (s.teams.leftGkId === id) s.teams.leftGkId = null;
              if (s.teams.rightGkId === id) s.teams.rightGkId = null;
            }
          }),
        addRecurring: (name) => {
          const trimmed = name.trim();
          if (!trimmed || get().recurring.some((r) => sameName(r.name, trimmed))) return false;
          set((s) => {
            s.recurring.push({ id: newId('rp-'), name: trimmed });
          });
          return true;
        },
        removeRecurring: (id) =>
          set((s) => {
            s.recurring = s.recurring.filter((r) => r.id !== id);
          }),

        goToTeamSelection: (final = false) =>
          set((s) => {
            const active = activePlayers(s).map((p) => p.id);
            if (active.length < 2) {
              s.screen = 'entries';
              return;
            }
            const gk = {
              leftGkId: s.teams?.leftGkId ?? null,
              rightGkId: s.teams?.rightGkId ?? null,
            };
            if (s.teams) s.previousTeams = JSON.parse(JSON.stringify(s.teams));
            s.finalDraw = final
              ? finalDrawRules(s.players, computePlayerStats(s.players, s.games), active, s.settings.pigAwardEnabled)
              : null;
            if (final || s.settings.randomTeamsEnabled || !s.teams) {
              const fd = s.finalDraw;
              const separate = fd ? [fd.crown, fd.pig].filter((p): p is [string, string] => !!p) : [];
              const r = randomizeTeams(active, sessionLineups(s.games), Math.random, separate)!;
              s.teams = { left: r.left, right: r.right, ...gk };
              s.shuffleNonce++;
            } else {
              s.teams = reconcileTeams(s.teams, active);
            }
            s.screen = 'teams';
          }),
        rematch: (swap = false) =>
          set((s) => {
            if (!s.previousTeams) return;
            s.teams = reconcileTeams(
              JSON.parse(JSON.stringify(s.previousTeams)),
              activePlayers(s).map((p) => p.id),
            );
            restoreLastGameColors(s);
            if (swap) swapDraft(s);
            s.teamsEditNonce++;
          }),
        rematchSwapFromSummary: () =>
          set((s) => {
            const active = activePlayers(s).map((p) => p.id);
            if (!s.teams || active.length < 2) return;
            s.previousTeams = JSON.parse(JSON.stringify(s.teams));
            s.teams = reconcileTeams(s.teams, active);
            restoreLastGameColors(s);
            swapDraft(s);
            s.teamsEditNonce++;
            s.screen = 'teams';
          }),
        swapSides: () =>
          set((s) => {
            if (!s.teams) return;
            swapDraft(s);
            s.teamsEditNonce++;
          }),
        movePlayer: (id) =>
          set((s) => {
            if (!s.teams) return;
            const from: Side = s.teams.left.includes(id) ? 'left' : 'right';
            const to: Side = from === 'left' ? 'right' : 'left';
            s.teams[from] = s.teams[from].filter((x) => x !== id);
            s.teams[to].push(id);
            s.teamsEditNonce++;
          }),
        removeFromTeams: (id) => {
          get().removePlayer(id);
          set((s) => {
            if (!s.teams) return;
            s.teams.left = s.teams.left.filter((x) => x !== id);
            s.teams.right = s.teams.right.filter((x) => x !== id);
            s.teamsEditNonce++;
          });
        },
        setGoalkeeper: (side, gkId) =>
          set((s) => {
            if (!s.teams) return;
            if (side === 'left') s.teams.leftGkId = gkId;
            else s.teams.rightGkId = gkId;
          }),

        startGame: () =>
          set((s) => {
            if (!s.teams || s.teams.left.length === 0 || s.teams.right.length === 0) return;
            const plusMinus = isPlusMinusFair(s.teams.left.length, s.teams.right.length, activePlayers(s).length);
            s.currentGame = createGame(s.teams, s.settings, plusMinus);
            if (s.finalDraw) s.currentGame.final = true;
            s.screen = 'game';
          }),
        abandonGame: () =>
          set((s) => {
            if (!s.currentGame || s.currentGame.goals.length > 0) return;
            s.teams = {
              left: [...s.currentGame.teams.left],
              right: [...s.currentGame.teams.right],
              leftGkId: s.teams?.leftGkId ?? null,
              rightGkId: s.teams?.rightGkId ?? null,
            };
            s.currentGame = null;
            s.screen = 'teams';
            s.teamsEditNonce++;
          }),
        registerGoal: (side, scorerId, assistId) =>
          set((s) => {
            if (!s.currentGame) return;
            addGoal(s.currentGame, side, scorerId, s.settings.assistsEnabled ? assistId : null);
          }),
        undoGoal: () =>
          set((s) => {
            if (s.currentGame) undoLastGoal(s.currentGame);
          }),
        endGame: () =>
          set((s) => {
            const g = s.currentGame;
            if (!g) return;
            g.endedAt = Date.now();
            s.games.push(g);
            // Mid-game changes carry over to the next team selection.
            s.teams = {
              left: [...g.teams.left],
              right: [...g.teams.right],
              leftGkId: s.teams?.leftGkId ?? null,
              rightGkId: s.teams?.rightGkId ?? null,
            };
            s.currentGame = null;
            // After the final: straight to today's stats and awards.
            s.screen = g.final ? 'stats' : 'summary';
            s.finalDraw = null;
          }),
        addPlayerDuringGame: (side, playerId) =>
          set((s) => {
            if (!s.currentGame) return;
            const p = s.players.find((x) => x.id === playerId);
            if (!p) return;
            p.active = true;
            addToGame(s.currentGame, side, playerId);
          }),
        addNewPlayerDuringGame: (side, name) => {
          let result: AddPlayerResult = 'empty';
          set((s) => {
            if (!s.currentGame) return;
            const r = addPlayerDraft(s, name);
            result = r.result;
            if (r.id && (r.result === 'ok' || r.result === 'duplicate')) {
              const added = addToGame(s.currentGame, side, r.id);
              if (added) result = 'ok';
            }
          });
          return result;
        },
        removePlayerDuringGame: (id) => {
          let result: RemoveResult = 'not-found';
          set((s) => {
            if (!s.currentGame) return;
            result = removeFromGame(s.currentGame, id);
          });
          return result;
        },

        finishSession: () => set({ screen: 'stats' }),
        continueSession: () => get().goToTeamSelection(false),
        deleteGame: (id) =>
          set((s) => {
            s.games = s.games.filter((g) => g.id !== id);
          }),
        updateGameGoals: (id, goals) =>
          set((s) => {
            const g = s.games.find((x) => x.id === id);
            if (g) g.goals = goals;
          }),
        resetAll: () =>
          set((s) => {
            Object.assign(s, initialData());
            s.settings.goalkeepersEnabled = false;
            s.settings.leftColor = DEFAULT_SETTINGS.leftColor;
            s.settings.rightColor = DEFAULT_SETTINGS.rightColor;
          }),
      };
    }),
    {
      name: 'tavelplay2',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        // Functions are dropped automatically; transient nonces need not persist.
        const { shuffleNonce: _a, teamsEditNonce: _b, ...rest } = s;
        void _a;
        void _b;
        return rest;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Data>;
        const merged = { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings } };
        // Resume sensibly after a reload.
        if (merged.screen === 'game-teams') merged.screen = 'game';
        if (merged.screen === 'game' && !merged.currentGame) {
          merged.screen = 'entries';
        }
        if (merged.screen === 'summary' && merged.games.length === 0) merged.screen = 'entries';
        if (merged.screen === 'teams' && !merged.teams) merged.screen = 'entries';
        return merged;
      },
    },
  ),
);

export function playerName(players: readonly Player[], id: string | null): string {
  if (!id) return '';
  return players.find((p) => p.id === id)?.name ?? 'Unknown';
}
