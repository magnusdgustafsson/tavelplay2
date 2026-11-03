import { useState } from 'react';
import type { Side } from '../domain/types';
import { teamLabel } from '../domain/types';
import { gameScore, isMaxScoreReached, isPlayingOnForTwo } from '../domain/stats';
import { playerName, useStore } from '../state/store';
import { confirmDialog } from '../ui/dialogs';
import { useWakeLock } from '../ui/common';

function GoalModal({ side, onClose }: { side: Side; onClose: () => void }) {
  const game = useStore((s) => s.currentGame)!;
  const players = useStore((s) => s.players);
  const assistsEnabled = useStore((s) => s.settings.assistsEnabled);
  const registerGoal = useStore((s) => s.registerGoal);
  const [scorer, setScorer] = useState<string | null>(null);
  const [assist, setAssist] = useState<string | null>(null);

  const ids = game.teams[side];
  const rows = ids.length + (assistsEnabled ? 1 : 0);
  const valid = !!scorer && (!assistsEnabled || assist !== scorer);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} data-team={game.colors[side]}>
        <h2>Register Goal – {teamLabel(game.colors[side])} TEAM</h2>
        <div className="goal-list" style={{ ['--rows' as string]: rows }}>
          {ids.map((id) => (
            <div className="goal-row" key={id}>
              <span className="name">{playerName(players, id)}</span>
              <button
                className={`btn btn-goal${scorer === id ? ' selected' : ''}`}
                onClick={() => {
                  setScorer(id);
                  if (assist === id) setAssist(null);
                }}
              >
                GOAL
              </button>
              {assistsEnabled && (
                <button
                  className={`btn btn-assist${assist === id ? ' selected' : ''}`}
                  disabled={scorer === id}
                  onClick={() => setAssist(assist === id ? null : id)}
                >
                  ASSIST
                </button>
              )}
            </div>
          ))}
          {assistsEnabled && (
            <div className="goal-row">
              <span className="name">No assist</span>
              <span className="spacer" />
              <button
                className={`btn btn-assist${assist === null && scorer ? ' selected' : ''}`}
                onClick={() => setAssist(null)}
              >
                NONE
              </button>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Back
          </button>
          <button
            className="btn btn-primary"
            disabled={!valid}
            onClick={() => {
              registerGoal(side, scorer!, assist);
              onClose();
            }}
          >
            Register
          </button>
        </div>
      </div>
    </div>
  );
}

export function Game() {
  const game = useStore((s) => s.currentGame);
  const gameNumber = useStore((s) => s.games.length + 1);
  const { setScreen, undoGoal, endGame, abandonGame } = useStore.getState();
  const [goalSide, setGoalSide] = useState<Side | null>(null);
  useWakeLock(true);

  if (!game) return null;
  const score = gameScore(game);
  const locked = isMaxScoreReached(game);
  const zeroZero = game.goals.length === 0;

  return (
    <div className="screen">
      <h1 className="title">Game {gameNumber}</h1>
      <div className="scoreboard">
        <div className="score-team" data-team={game.colors.left}>
          <div className="score-label">{teamLabel(game.colors.left)}</div>
          <div className="score-value" data-testid="score-left">
            {score.left}
          </div>
        </div>
        <div className="score-sep">–</div>
        <div className="score-team" data-team={game.colors.right}>
          <div className="score-label">{teamLabel(game.colors.right)}</div>
          <div className="score-value" data-testid="score-right">
            {score.right}
          </div>
        </div>
      </div>
      {locked && <p className="max-score-note">Max score reached – end the game when you're ready.</p>}
      {isPlayingOnForTwo(game) && <p className="max-score-note">Win by two – play on!</p>}
      <div className="goal-buttons">
        {(['left', 'right'] as const).map((side) => (
          <button
            key={side}
            className="goal-btn"
            data-team={game.colors[side]}
            disabled={locked}
            onClick={() => setGoalSide(side)}
          >
            {teamLabel(game.colors[side])} GOAL
          </button>
        ))}
      </div>
      <div className="footer">
        {zeroZero && (
          <button className="btn btn-secondary" onClick={abandonGame}>
            Back
          </button>
        )}
        <button className="btn btn-secondary" onClick={() => setScreen('game-teams')}>
          View Teams
        </button>
        <button
          className="btn btn-secondary"
          disabled={zeroZero}
          onClick={async () => {
            if (await confirmDialog('Undo the last registered goal?', { confirmLabel: 'Undo' })) undoGoal();
          }}
        >
          Undo Last Goal
        </button>
        <button
          className={`btn ${locked ? 'btn-primary' : 'btn-secondary'}`}
          onClick={async () => {
            if (await confirmDialog(`Final score ${score.left} – ${score.right}.`, { title: 'End this game?', confirmLabel: 'End Game' })) endGame();
          }}
        >
          End Game
        </button>
      </div>
      {goalSide && <GoalModal side={goalSide} onClose={() => setGoalSide(null)} />}
    </div>
  );
}
