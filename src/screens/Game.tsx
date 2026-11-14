import { useCallback, useEffect, useRef, useState } from 'react';
import type { Side } from '../domain/types';
import { teamLabel } from '../domain/types';
import { WIN_BY_TWO_CAP, gameScore, isMaxScoreReached, isPlayingOnForTwo } from '../domain/stats';
import { playerName, useStore } from '../state/store';
import { confirmDialog } from '../ui/dialogs';
import { useWakeLock } from '../ui/common';

/** Auto-save this long after the last tap (scorer or assist). */
const SAVE_DELAY_MS = 3000;
/** How long the "Undo" for a just-saved goal stays visible. */
const UNDO_MS = 10000;

interface SavedGoal {
  text: string;
  /** Number of goals in the game right after saving – undo only if unchanged. */
  goalCount: number;
}

/**
 * Tap the scorer, then (optionally) the assist. The goal saves itself 3 s
 * after the last tap; "No assist – save now" saves at once. With assists
 * turned off, tapping the scorer saves straight away.
 */
function GoalModal({ side, onClose, onSaved }: { side: Side; onClose: () => void; onSaved: (g: SavedGoal) => void }) {
  const game = useStore((s) => s.currentGame)!;
  const players = useStore((s) => s.players);
  const assistsEnabled = useStore((s) => s.settings.assistsEnabled);
  const registerGoal = useStore((s) => s.registerGoal);
  const [scorer, setScorer] = useState<string | null>(null);
  const [assist, setAssist] = useState<string | null>(null);
  const [tapKey, setTapKey] = useState(0); // restarts the save timer

  const ids = game.teams[side];

  const save = (scorerId: string, assistId: string | null) => {
    registerGoal(side, scorerId, assistId);
    const g = useStore.getState().currentGame;
    if (g) {
      const s = gameScore(g);
      const who = playerName(players, scorerId) + (assistId ? ` (${playerName(players, assistId)})` : '');
      onSaved({ text: `${s.left}–${s.right} · ${who}`, goalCount: g.goals.length });
    }
    onClose();
  };

  // Auto-save after the last tap.
  const latest = useRef({ scorer, assist });
  latest.current = { scorer, assist };
  useEffect(() => {
    if (!scorer) return;
    const t = setTimeout(() => save(latest.current.scorer!, latest.current.assist), SAVE_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tapKey, scorer]);

  const tap = (id: string) => {
    if (!scorer) {
      if (!assistsEnabled) return save(id, null);
      setScorer(id);
    } else if (id === scorer) {
      // Tap the scorer again to start over.
      setScorer(null);
      setAssist(null);
    } else {
      setAssist(assist === id ? null : id);
    }
    setTapKey((k) => k + 1);
  };

  const hint = !scorer ? 'Tap the scorer' : assist ? 'Saving…' : 'Tap who made the assist – or wait';

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal goal-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} data-team={game.colors[side]}>
        <h2>{teamLabel(game.colors[side])} TEAM GOAL</h2>
        <p className="goal-hint">{hint}</p>
        <div className={`goal-tiles${ids.length > 9 ? ' dense' : ''}`}>
          {ids.map((id) => {
            const role = id === scorer ? 'goal' : id === assist ? 'assist' : scorer ? 'candidate' : '';
            return (
              <button key={id} type="button" className={`goal-tile ${role}`} onClick={() => tap(id)}>
                {role === 'goal' && <span className="goal-tag">GOAL</span>}
                {role === 'assist' && <span className="goal-tag">ASSIST</span>}
                <span className="goal-tile-name">{playerName(players, id)}</span>
              </button>
            );
          })}
        </div>
        <div className="save-bar" aria-hidden="true">
          {scorer && <div key={tapKey} className="save-bar-fill" style={{ animationDuration: `${SAVE_DELAY_MS}ms` }} />}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          {scorer && !assist && (
            <button className="btn btn-secondary" onClick={() => save(scorer, null)}>
              No assist – save now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** "2–1 · Erik (Johanna)  [Undo]" shown for a while after a goal is saved. */
function UndoToast({ saved, onDone }: { saved: SavedGoal; onDone: () => void }) {
  const undoGoal = useStore((s) => s.undoGoal);
  const goalCount = useStore((s) => s.currentGame?.goals.length ?? -1);
  useEffect(() => {
    const t = setTimeout(onDone, UNDO_MS);
    return () => clearTimeout(t);
  }, [saved, onDone]);
  // Hide if the goal is no longer the latest (undone elsewhere, or a new goal).
  if (goalCount !== saved.goalCount) return null;
  return (
    <div className="toast toast-action" role="status">
      <span>⚽ {saved.text}</span>
      <button
        className="toast-btn"
        onClick={() => {
          undoGoal();
          onDone();
        }}
      >
        Undo
      </button>
    </div>
  );
}

export function Game() {
  const game = useStore((s) => s.currentGame);
  const gameNumber = useStore((s) => s.games.length + 1);
  const { setScreen, undoGoal, endGame, abandonGame } = useStore.getState();
  const [goalSide, setGoalSide] = useState<Side | null>(null);
  const [saved, setSaved] = useState<SavedGoal | null>(null);
  const clearSaved = useCallback(() => setSaved(null), []);
  useWakeLock(true);

  if (!game) return null;
  const score = gameScore(game);
  const locked = isMaxScoreReached(game);
  const zeroZero = game.goals.length === 0;

  return (
    <div className="screen">
      <h1 className="title">{game.final ? 'Final' : `Game ${gameNumber}`}</h1>
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
      {isPlayingOnForTwo(game) && <p className="max-score-note">Win by two – play on! (first to {WIN_BY_TWO_CAP} wins)</p>}
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
      {goalSide && <GoalModal side={goalSide} onClose={() => setGoalSide(null)} onSaved={setSaved} />}
      {saved && !goalSide && <UndoToast saved={saved} onDone={clearSaved} />}
    </div>
  );
}
