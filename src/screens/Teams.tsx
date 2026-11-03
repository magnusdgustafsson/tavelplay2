import { useEffect, useRef, useState } from 'react';
import type { Side, TeamColor, Teams as TeamsT } from '../domain/types';
import { teamLabel } from '../domain/types';
import { shuffle } from '../domain/teams';
import { playerName, useStore } from '../state/store';
import { addPlayerMessage } from './Entries';
import { alertDialog, chooseDialog, confirmDialog, showToast } from '../ui/dialogs';
import { useCountdown } from '../ui/common';

const SHUFFLE_MS = 2000;
const START_COUNTDOWN = 60;
const BACK_TO_GAME_COUNTDOWN = 30;

// Nonce 0 = nothing shuffled yet (e.g. after a reload) → no animation.
let lastAnimatedNonce = 0;

/** Shuffle animation: random previews that slow down, then the real teams. */
function useShuffleAnimation(teams: TeamsT | null, nonce: number, cancelKey: number) {
  const [preview, setPreview] = useState<TeamsT | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  // Any manual change to the teams (e.g. rematch) stops the animation.
  const firstCancel = useRef(true);
  useEffect(() => {
    if (firstCancel.current) {
      firstCancel.current = false;
      return;
    }
    clearTimeout(timer.current);
    setPreview(null);
  }, [cancelKey]);
  useEffect(() => {
    if (!teams || nonce === lastAnimatedNonce) return;
    lastAnimatedNonce = nonce;
    const all = [...teams.left, ...teams.right];
    const leftCount = teams.left.length;
    const start = Date.now();
    const frame = () => {
      const elapsed = Date.now() - start;
      if (elapsed >= SHUFFLE_MS) {
        setPreview(null);
        return;
      }
      const s = shuffle(all);
      setPreview({ ...teams, left: s.slice(0, leftCount), right: s.slice(leftCount) });
      const p = elapsed / SHUFFLE_MS;
      timer.current = setTimeout(frame, Math.round(50 + p * p * 320));
    };
    frame();
    return () => {
      clearTimeout(timer.current);
      setPreview(null);
    };
  }, [nonce]);
  return preview;
}

function AddDuringGame({ side, onAdded }: { side: Side; onAdded: () => void }) {
  const players = useStore((s) => s.players);
  const game = useStore((s) => s.currentGame)!;
  const addExisting = useStore((s) => s.addPlayerDuringGame);
  const addNew = useStore((s) => s.addNewPlayerDuringGame);
  const [choice, setChoice] = useState('');
  const [name, setName] = useState('');
  const onTeams = new Set([...game.teams.left, ...game.teams.right]);
  const available = players.filter((p) => !onTeams.has(p.id));

  const submit = () => {
    if (choice === '__new__') {
      const r = addNew(side, name);
      const msg = addPlayerMessage(r);
      if (msg) return showToast(msg);
      if (r !== 'ok') return;
    } else if (choice) {
      addExisting(side, choice);
    } else return;
    setChoice('');
    setName('');
    onAdded();
  };

  return (
    <form
      className="team-extra"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <select className="select" value={choice} onChange={(e) => setChoice(e.target.value)}>
        <option value="">Add player…</option>
        {available.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        <option value="__new__">New player…</option>
      </select>
      {choice === '__new__' && (
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          maxLength={30}
          autoFocus
        />
      )}
      <button className="btn btn-primary btn-small" type="submit" disabled={!choice || (choice === '__new__' && !name.trim())}>
        Add
      </button>
    </form>
  );
}

function TeamCard({
  side,
  color,
  ids,
  gkId,
  inGame,
  editMode,
  addMode,
  removeMode,
  shuffling,
  onAction,
}: {
  side: Side;
  color: TeamColor;
  ids: string[];
  gkId: string | null;
  inGame: boolean;
  editMode: boolean;
  addMode: boolean;
  removeMode: boolean;
  shuffling: boolean;
  onAction: () => void;
}) {
  const players = useStore((s) => s.players);
  const goalkeepers = useStore((s) => s.goalkeepers);
  const settings = useStore((s) => s.settings);
  const starters = useStore((s) => s.starters);
  const game = useStore((s) => s.currentGame);
  const movePlayer = useStore((s) => s.movePlayer);
  const removeFromTeams = useStore((s) => s.removeFromTeams);
  const removeDuringGame = useStore((s) => s.removePlayerDuringGame);
  const setGoalkeeper = useStore((s) => s.setGoalkeeper);

  const showStarters = settings.startingLineupEnabled && starters && !shuffling;
  const late = new Set(inGame && game ? game.lateJoinerIds : []);
  const rows = ids.length + (addMode ? 1 : 0);

  const badge = (id: string) => {
    if (late.has(id)) return <span className="badge badge-late" title="Joined after own team scored – no win credit">LATE</span>;
    if (!showStarters) return null;
    return starters![side].includes(id) ? (
      <span className="badge badge-start">STARTING</span>
    ) : (
      <span className="badge badge-subst">SUBST</span>
    );
  };

  const confirmRemove = async (id: string) => {
    const name = playerName(players, id);
    if (inGame) {
      if (!(await confirmDialog(`Remove ${name} from this game?`, { confirmLabel: 'Remove', danger: true }))) return;
      const r = removeDuringGame(id);
      if (r === 'last-player') await alertDialog('A team needs at least one player.');
    } else {
      if (
        !(await confirmDialog(`${name} will be removed from this game and from team selection.`, {
          title: `Remove ${name}?`,
          confirmLabel: 'Remove',
          danger: true,
        }))
      )
        return;
      removeFromTeams(id);
    }
    onAction();
  };

  const gkEnabled = settings.goalkeepersEnabled && goalkeepers.length > 0;

  return (
    <section className="team-card" data-team={color}>
      <h2>{teamLabel(color)} TEAM</h2>
      <div className="team-list" style={{ ['--rows' as string]: Math.max(rows, 5) }}>
        {ids.map((id) => (
          <div className="team-row" key={id}>
            {badge(id)}
            <span className="name">{playerName(players, id)}</span>
            {editMode && !shuffling && (
              <>
                <button
                  className="btn btn-secondary"
                  aria-label="Move to other team"
                  onClick={() => {
                    movePlayer(id);
                    onAction();
                  }}
                >
                  {side === 'left' ? '→' : '←'}
                </button>
                <button className="btn btn-danger" onClick={() => confirmRemove(id)}>
                  Remove
                </button>
              </>
            )}
            {removeMode && (
              <button className="btn btn-danger" onClick={() => confirmRemove(id)}>
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
      {addMode && <AddDuringGame side={side} onAdded={onAction} />}
      {gkEnabled && !shuffling && (
        <div className="team-extra">
          <span className="gk-label">Goalkeeper:</span>
          {inGame ? (
            <span>{goalkeepers.find((g) => g.id === (side === 'left' ? game?.teams.leftGkId : game?.teams.rightGkId))?.name ?? 'None'}</span>
          ) : (
            <select className="select" value={gkId ?? ''} onChange={(e) => setGoalkeeper(side, e.target.value || null)}>
              <option value="">None</option>
              {goalkeepers.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </section>
  );
}

export function Teams() {
  const screen = useStore((s) => s.screen);
  const inGame = screen === 'game-teams';
  const teams = useStore((s) => s.teams);
  const game = useStore((s) => s.currentGame);
  const settings = useStore((s) => s.settings);
  const previousTeams = useStore((s) => s.previousTeams);
  const shuffleNonce = useStore((s) => s.shuffleNonce);
  const editNonce = useStore((s) => s.teamsEditNonce);
  const { setScreen, startGame, rematch, swapSides, finishSession } = useStore.getState();

  const [editMode, setEditMode] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [removeMode, setRemoveMode] = useState(false);
  const [actionKey, setActionKey] = useState(0);
  const bump = () => setActionKey((k) => k + 1);

  const preview = useShuffleAnimation(inGame ? null : teams, shuffleNonce, editNonce);
  const shuffling = !!preview;

  const startLeft = useCountdown(START_COUNTDOWN, !inGame && !shuffling, `${editNonce}-${actionKey}`, () => {
    if (useStore.getState().screen === 'teams') startGame();
  });
  const backLeft = useCountdown(BACK_TO_GAME_COUNTDOWN, inGame, actionKey, () => {
    if (useStore.getState().screen === 'game-teams') setScreen('game');
  });

  const shown: TeamsT | null = inGame && game ? game.teams : (preview ?? teams);
  const colors = inGame && game ? game.colors : { left: settings.leftColor, right: settings.rightColor };

  if (!shown) return null;

  return (
    <div className="screen">
      <h1 className="title">{inGame ? 'Teams' : 'Team Selection'}</h1>
      <div className={`teams${shuffling ? ' shuffling' : ''}`}>
        {(['left', 'right'] as const).map((side) => (
          <TeamCard
            key={side}
            side={side}
            color={colors[side]}
            ids={shown[side]}
            gkId={side === 'left' ? shown.leftGkId : shown.rightGkId}
            inGame={inGame}
            editMode={editMode}
            addMode={addMode}
            removeMode={removeMode}
            shuffling={shuffling}
            onAction={bump}
          />
        ))}
      </div>
      <div className="footer">
        {inGame ? (
          <>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setAddMode(!addMode);
                setRemoveMode(false);
                bump();
              }}
            >
              {addMode ? 'Done' : 'Add Player'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setRemoveMode(!removeMode);
                setAddMode(false);
                bump();
              }}
            >
              {removeMode ? 'Done' : 'Remove Player'}
            </button>
            <button className="btn btn-primary" onClick={() => setScreen('game')}>
              Back to Game ({backLeft})
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-secondary" disabled={shuffling} onClick={() => setScreen('entries')}>
              Back
            </button>
            {previousTeams && (
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  const choice = await chooseDialog('Change the teams back to the previous lineup?', {
                    title: 'Rematch',
                    choices: [{ label: 'Rematch', value: 'same' }],
                    primary: { label: 'Rematch + Swap Sides', value: 'swap' },
                  });
                  if (choice) rematch(choice === 'swap');
                }}
              >
                Rematch
              </button>
            )}
            <button
              className="btn btn-secondary"
              disabled={shuffling}
              onClick={() => {
                setEditMode(!editMode);
                bump();
              }}
            >
              {editMode ? 'Done Editing' : 'Edit Teams'}
            </button>
            <button className="btn btn-secondary" disabled={shuffling} onClick={swapSides}>
              Swap Sides
            </button>
            <button
              className="btn btn-secondary"
              disabled={shuffling}
              onClick={async () => {
                if (await confirmDialog("Finish the session without playing this game? You'll see today's stats.", { title: 'Finish session', confirmLabel: 'Finish' })) {
                  finishSession();
                }
              }}
            >
              Finish Session
            </button>
            <button
              className="btn btn-primary"
              disabled={shuffling || !teams || teams.left.length === 0 || teams.right.length === 0}
              onClick={startGame}
            >
              Start Game {!shuffling && `(${startLeft})`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
