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
