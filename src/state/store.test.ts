import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';

function playOneGame() {
  const s = useStore.getState();
  for (const n of ['A', 'B', 'C', 'D', 'E', 'F']) s.addPlayer(n);
  useStore.getState().goToTeamSelection();
  useStore.getState().startGame();
  const g = useStore.getState().currentGame!;
  useStore.getState().registerGoal('left', g.teams.left[0], null);
  useStore.getState().endGame();
  return useStore.getState().games[0];
}

describe('rematch + swap', () => {
  beforeEach(() => useStore.getState().resetAll());

  it('from the summary: same teams, ends and colours swapped, no shuffle', () => {
    const game = playOneGame();
    const nonce = useStore.getState().shuffleNonce;
    useStore.getState().rematchSwapFromSummary();
    const s = useStore.getState();
    expect(s.screen).toBe('teams');
    expect(s.shuffleNonce).toBe(nonce);
    expect(s.teams!.left).toEqual(game.teams.right);
    expect(s.teams!.right).toEqual(game.teams.left);
    expect(s.settings.leftColor).toBe(game.colors.right);
    expect(s.settings.rightColor).toBe(game.colors.left);
  });

  it('on team selection: restores the last lineup, optionally swapped', () => {
    const game = playOneGame();
    useStore.getState().goToTeamSelection(); // reshuffles
    useStore.getState().rematch(true);
    let s = useStore.getState();
    expect(s.teams!.left).toEqual(game.teams.right);
    expect(s.settings.leftColor).toBe(game.colors.right);
    useStore.getState().rematch(false);
    s = useStore.getState();
    expect(s.teams!.left).toEqual(game.teams.left);
    expect(s.settings.leftColor).toBe(game.colors.left);
  });
});

describe('final game', () => {
  beforeEach(() => useStore.getState().resetAll());

  it('is drawn on request, marked as final and ends on the stats screen', () => {
    playOneGame();
    useStore.getState().goToTeamSelection(true);
    expect(useStore.getState().finalDraw).not.toBeNull();
    useStore.getState().startGame();
    expect(useStore.getState().currentGame!.final).toBe(true);
    useStore.getState().endGame();
    const s = useStore.getState();
    expect(s.screen).toBe('stats');
    expect(s.games[s.games.length - 1].final).toBe(true);
    expect(s.finalDraw).toBeNull();
  });

  it('going back to Player Entries cancels the final', () => {
    playOneGame();
    useStore.getState().goToTeamSelection(true);
    useStore.getState().setScreen('entries');
    expect(useStore.getState().finalDraw).toBeNull();
    useStore.getState().goToTeamSelection();
    useStore.getState().startGame();
    expect(useStore.getState().currentGame!.final).toBeUndefined();
  });
});

describe('automatic plus/minus', () => {
  beforeEach(() => useStore.getState().resetAll());
  const start = (names: string[]) => {
    for (const n of names) useStore.getState().addPlayer(n);
    useStore.getState().goToTeamSelection();
    useStore.getState().startGame();
    return useStore.getState().currentGame!;
  };
  it('is on with 10 players (5 vs 5)', () => {
    expect(start(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']).plusMinus).toBe(true);
  });
  it('is off with 9 or 12 players', () => {
    expect(start(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']).plusMinus).toBe(false);
    useStore.getState().resetAll();
    expect(start(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']).plusMinus).toBe(false);
  });
});
