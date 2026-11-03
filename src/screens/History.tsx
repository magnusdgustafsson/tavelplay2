import { useState } from 'react';
import type { Game, Goal, Side } from '../domain/types';
import { teamLabel } from '../domain/types';
import { gameScore } from '../domain/stats';
import { gameParticipants, sideOfParticipant } from '../domain/game';
import { playerName, useStore } from '../state/store';
import { confirmDialog, showToast } from '../ui/dialogs';
import { TeamDot } from '../ui/common';
import { GoalTimeline } from './Summary';

function GameEditor({ game, onDone }: { game: Game; onDone: () => void }) {
  const players = useStore((s) => s.players);
  const updateGameGoals = useStore((s) => s.updateGameGoals);
  const [goals, setGoals] = useState<Goal[]>(() => game.goals.map((g) => ({ ...g })));
  const participants = gameParticipants(game);
  const score = gameScore({ goals });

  const patch = (i: number, p: Partial<Goal>) =>
    setGoals((gs) => gs.map((g, j) => (j === i ? { ...g, ...p } : g)));

  const options = (ids: string[]) =>
    ids.map((id) => (
      <option key={id} value={id}>
        {playerName(players, id)}
      </option>
    ));

  const sideIds = (side: Side) => participants.filter((id) => sideOfParticipant(game, id) === side);

  return (
    <div className="list">
      <div className="game-card-score">
        New score: <TeamDot color={game.colors.left} /> {score.left} – {score.right} <TeamDot color={game.colors.right} />
      </div>
      {goals.map((goal, i) => (
        <div className="edit-goal-row" key={i}>
          <strong>Goal {i + 1}</strong>
          <select
            className="select"
            value={goal.side}
            onChange={(e) => {
              const side = e.target.value as Side;
              const ids = sideIds(side);
              patch(i, {
                side,
                scorerId: ids.includes(goal.scorerId) ? goal.scorerId : ids[0],
                assistId: goal.assistId && ids.includes(goal.assistId) ? goal.assistId : null,
              });
            }}
          >
            <option value="left">{teamLabel(game.colors.left)}</option>
            <option value="right">{teamLabel(game.colors.right)}</option>
          </select>
          <select className="select" value={goal.scorerId} onChange={(e) => patch(i, { scorerId: e.target.value })}>
            {options(sideIds(goal.side))}
          </select>
          <select
            className="select"
            value={goal.assistId ?? ''}
            onChange={(e) => patch(i, { assistId: e.target.value || null })}
          >
            <option value="">No assist</option>
            {options(sideIds(goal.side).filter((id) => id !== goal.scorerId))}
          </select>
          <button
            className="btn btn-danger btn-small"
            aria-label={`Delete goal ${i + 1}`}
            onClick={() => setGoals((gs) => gs.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <div className="row-actions" style={{ justifyContent: 'space-between' }}>
        <button
          className="btn btn-secondary btn-small"
          onClick={() => {
            const ids = sideIds('left');
            if (ids.length === 0) return;
            setGoals((gs) => [...gs, { side: 'left', scorerId: ids[0], assistId: null, at: Date.now() }]);
          }}
        >
          + Add goal
        </button>
        <div className="row-actions">
          <button className="btn btn-secondary btn-small" onClick={onDone}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-small"
            onClick={() => {
              updateGameGoals(game.id, goals.map((g) => ({ ...g, assistId: g.assistId === g.scorerId ? null : g.assistId })));
              showToast('Game updated – stats recalculated');
              onDone();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function History() {
  const games = useStore((s) => s.games);
  const deleteGame = useStore((s) => s.deleteGame);
  const setScreen = useStore((s) => s.setScreen);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="screen">
      <h1 className="title">Games Played</h1>
      <div className="screen-body">
        {games.length === 0 && <p className="empty">No games played yet.</p>}
        {games
          .map((game, index) => ({ game, number: index + 1 }))
          .reverse()
          .map(({ game, number }) => {
            const score = gameScore(game);
            return (
              <div className="panel game-card" key={game.id}>
                <div className="game-card-head">
                  <span className="game-card-title">Game {number}</span>
                  <span className="game-card-score">
                    <TeamDot color={game.colors.left} />
                    {teamLabel(game.colors.left)} {score.left} – {score.right} {teamLabel(game.colors.right)}
                    <TeamDot color={game.colors.right} />
                  </span>
                </div>
                {editing === game.id ? (
                  <GameEditor game={game} onDone={() => setEditing(null)} />
                ) : (
                  <>
                    <GoalTimeline game={game} />
                    <div className="row-actions">
                      <button className="btn btn-secondary btn-small" onClick={() => setEditing(game.id)}>
                        Edit
                      </button>
                      <button
                        className="btn btn-danger btn-small"
                        onClick={async () => {
                          if (
                            await confirmDialog('The game is deleted permanently and all stats are recalculated.', {
                              title: `Delete game ${number}?`,
                              confirmLabel: 'Delete',
                              danger: true,
                            })
                          ) {
                            deleteGame(game.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
      </div>
      <div className="footer">
        <button className="btn btn-secondary" onClick={() => setScreen(games.length > 0 ? 'summary' : 'entries')}>
          Back
        </button>
      </div>
    </div>
  );
}
