import type { Game } from '../domain/types';
import { teamLabel } from '../domain/types';
import { decisiveGoalIndex, gameScore } from '../domain/stats';
import { playerName, useStore } from '../state/store';
import { confirmDialog } from '../ui/dialogs';
import { TeamDot } from '../ui/common';

export function GoalTimeline({ game }: { game: Game }) {
  const players = useStore((s) => s.players);
  const decisive = decisiveGoalIndex(game);
  if (game.goals.length === 0) return <p className="empty">No goals scored in this game.</p>;
  const running = { left: 0, right: 0 };
  return (
    <div className="timeline">
      {game.goals.map((goal, i) => {
        running[goal.side]++;
        return (
          <div key={i} className={`timeline-item${i === decisive ? ' decisive' : ''}`}>
            <span className="timeline-score">
              {running.left}–{running.right}
            </span>
            <TeamDot color={game.colors[goal.side]} />
            <span>
              <strong>{playerName(players, goal.scorerId)}</strong>
              {i === decisive && ' ⚡'}
              {goal.assistId && <span className="muted"> (assist: {playerName(players, goal.assistId)})</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Summary() {
  const games = useStore((s) => s.games);
  const { setScreen, goToTeamSelection, finishSession } = useStore.getState();
  const game = games[games.length - 1];
  if (!game) return null;
  const score = gameScore(game);

  return (
    <div className="screen">
      <h1 className="title">Game {games.length} Summary</h1>
      <div className="screen-body">
        <div className="final-score">
          {(['left', 'right'] as const).map((side, i) => (
            <div key={side} style={{ display: 'contents' }}>
              {i === 1 && <div className="score-sep">–</div>}
              <div className="score-team" data-team={game.colors[side]}>
                <div className="score-label">{teamLabel(game.colors[side])}</div>
                <div className="score-value">{score[side]}</div>
              </div>
            </div>
          ))}
        </div>
        <GoalTimeline game={game} />
      </div>
      <div className="footer">
        <button
          className="btn btn-secondary"
          onClick={async () => {
            if (await confirmDialog("You'll see today's final stats.", { title: 'Finish session?', confirmLabel: 'Finish' })) finishSession();
          }}
        >
          Finish Session
        </button>
        <button className="btn btn-secondary" onClick={() => setScreen('history')}>
          View/Edit Games
        </button>
        <button className="btn btn-primary" onClick={goToTeamSelection}>
          Next Game
        </button>
      </div>
    </div>
  );
}
