import { useState } from 'react';
import type { Player } from '../domain/types';
import { MAX_PLAYERS } from '../domain/types';
import { activePlayers, useStore } from '../state/store';
import type { AddPlayerResult } from '../state/store';
import { confirmDialog, showToast } from '../ui/dialogs';

export function addPlayerMessage(result: AddPlayerResult): string | null {
  if (result === 'duplicate') return 'That player is already added';
  if (result === 'full') return `Maximum ${MAX_PLAYERS} players`;
  return null;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export function Entries() {
  const players = useStore((s) => s.players);
  const recurring = useStore((s) => s.recurring);
  const games = useStore((s) => s.games);
  const addPlayer = useStore((s) => s.addPlayer);
  const removePlayer = useStore((s) => s.removePlayer);
  const setScreen = useStore((s) => s.setScreen);
  const goToTeamSelection = useStore((s) => s.goToTeamSelection);
  const [name, setName] = useState('');

  const activeCount = activePlayers({ players }).length;
  const sortedRecurring = [...recurring].sort(byName);
  const sessionPlayer = (n: string) => players.find((p) => sameName(p.name, n));
  const isHere = (n: string) => !!sessionPlayer(n)?.active;
  const isRecurring = (n: string) => recurring.some((r) => sameName(r.name, n));
  const guests = players.filter((p) => !isRecurring(p.name));
  const gamesPlayed = (p: Player) =>
    games.filter(
      (g) => g.teams.left.includes(p.id) || g.teams.right.includes(p.id) || g.removed.some((r) => r.id === p.id),
    ).length;

  const add = (n: string) => {
    const msg = addPlayerMessage(addPlayer(n));
    if (msg) showToast(msg);
    return !msg;
  };

  /** Remove from tonight – asks first if the player has already played. */
  const remove = async (p: Player) => {
    const played = gamesPlayed(p);
    if (
      played > 0 &&
      !(await confirmDialog(`${p.name} has played ${played} game${played === 1 ? '' : 's'} tonight. Their stats are kept.`, {
        title: `Remove ${p.name} from tonight?`,
        confirmLabel: 'Remove',
        danger: true,
      }))
    )
      return;
    removePlayer(p.id);
  };

  const toggle = (n: string) => {
    const p = sessionPlayer(n);
    if (p?.active) void remove(p);
    else add(n);
  };

  const selectAll = () => {
    for (const r of sortedRecurring) {
      if (isHere(r.name)) continue;
      if (useStore.getState().addPlayer(r.name) === 'full') {
        showToast(`Maximum ${MAX_PLAYERS} players`);
        break;
      }
    }
  };

  const clearAll = async () => {
    const selected = sortedRecurring.map((r) => sessionPlayer(r.name)).filter((p): p is Player => !!p?.active);
    if (selected.length === 0) return;
    const havePlayed = selected.filter((p) => gamesPlayed(p) > 0);
    if (
      havePlayed.length > 0 &&
      !(await confirmDialog(`${havePlayed.length} of them have already played tonight. Their stats are kept.`, {
        title: `Remove all ${selected.length} recurring players from tonight?`,
        confirmLabel: 'Clear',
        danger: true,
      }))
    )
      return;
    for (const p of selected) removePlayer(p.id);
  };

  return (
    <div className="screen">
      <h1 className="title">Player Entries{players.length > 0 ? ` (${activeCount})` : ''}</h1>
      <div className="screen-body">
        <form
          className="form-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (add(name)) setName('');
          }}
        >
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter player name"
            maxLength={30}
            autoComplete="off"
            enterKeyHint="done"
          />
          <button className="btn btn-primary" type="submit" disabled={!name.trim()}>
            Add Player
          </button>
        </form>

        {recurring.length > 0 ? (
          <div className="panel checkin">
            <div className="checkin-head">
              <h3>Recurring players – tap who's here</h3>
              <div className="row-actions">
                <button className="btn btn-secondary btn-small" onClick={selectAll}>
                  Select all
                </button>
                <button className="btn btn-secondary btn-small" onClick={clearAll}>
                  Clear
                </button>
              </div>
            </div>
            <div className={`checkin-grid${recurring.length > 20 ? ' dense' : ''}`}>
              {sortedRecurring.map((r) => {
                const on = isHere(r.name);
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`chip${on ? ' on' : ''}`}
                    aria-pressed={on}
                    onClick={() => toggle(r.name)}
                  >
                    {on && <span className="chip-check">✓</span>}
                    <span className="chip-name">{r.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="muted" style={{ textAlign: 'center' }}>
            Tip: add your regulars under Settings → Recurring players to check them in with one tap.
          </p>
        )}

        {guests.length > 0 && (
          <div className="list">
            {recurring.length > 0 && <div className="section-label">Guests tonight</div>}
            <div className="grid-2">
              {guests.map((p) => (
                <div key={p.id} className={`list-item${p.active ? '' : ' inactive'}`}>
                  <span className="name">
                    {p.name}
                    {!p.active && ' (removed)'}
                  </span>
                  {p.active ? (
                    <button className="btn btn-secondary btn-small" onClick={() => remove(p)}>
                      Remove
                    </button>
                  ) : (
                    <button className="btn btn-secondary btn-small" onClick={() => add(p.name)}>
                      Add back
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {players.length === 0 && recurring.length === 0 && <p className="empty">Add at least two players to get started.</p>}
      </div>
      <div className="footer">
        <button className="btn btn-secondary" onClick={() => setScreen('settings')}>
          Settings
        </button>
        <span className="player-count">
          {activeCount} player{activeCount === 1 ? '' : 's'}
        </span>
        <button className="btn btn-primary" disabled={activeCount < 2} onClick={() => goToTeamSelection()}>
          Continue
        </button>
      </div>
    </div>
  );
}
