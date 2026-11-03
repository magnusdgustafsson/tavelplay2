import { useState } from 'react';
import { MAX_PLAYERS } from '../domain/types';
import { activePlayers, useStore } from '../state/store';
import type { AddPlayerResult } from '../state/store';
import { showToast } from '../ui/dialogs';

export function addPlayerMessage(result: AddPlayerResult): string | null {
  if (result === 'duplicate') return 'That player is already added';
  if (result === 'full') return `Maximum ${MAX_PLAYERS} players`;
  return null;
}

export function Entries() {
  const players = useStore((s) => s.players);
  const recurring = useStore((s) => s.recurring);
  const addPlayer = useStore((s) => s.addPlayer);
  const removePlayer = useStore((s) => s.removePlayer);
  const setScreen = useStore((s) => s.setScreen);
  const goToTeamSelection = useStore((s) => s.goToTeamSelection);
  const [name, setName] = useState('');

  const activeCount = activePlayers({ players }).length;
  const activeNames = new Set(players.filter((p) => p.active).map((p) => p.name.toLowerCase()));
  const recurringOptions = [...recurring]
    .filter((r) => !activeNames.has(r.name.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const add = (n: string) => {
    const result = addPlayer(n);
    const msg = addPlayerMessage(result);
    if (msg) showToast(msg);
    return result === 'ok';
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
        {recurring.length > 0 && (
          <div className="form-row">
            <select
              className="select"
              value=""
              onChange={(e) => {
                const r = recurring.find((x) => x.id === e.target.value);
                if (r) add(r.name);
              }}
            >
              <option value="">
                {recurringOptions.length > 0 ? 'Add a recurring player…' : 'All recurring players added'}
              </option>
              {recurringOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={recurringOptions.length === 0}
              onClick={() => recurringOptions.forEach((r) => addPlayer(r.name))}
            >
              Add All
            </button>
          </div>
        )}
        {players.length === 0 ? (
          <p className="empty">Add at least two players to get started.</p>
        ) : (
          <div className="grid-2">
            {players.map((p) => (
              <div key={p.id} className={`list-item${p.active ? '' : ' inactive'}`}>
                <span className="name">
                  {p.name}
                  {!p.active && ' (removed)'}
                </span>
                {p.active ? (
                  <button className="btn btn-secondary btn-small" onClick={() => removePlayer(p.id)}>
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
        )}
      </div>
      <div className="footer">
        <button className="btn btn-secondary" onClick={() => setScreen('settings')}>
          Settings
        </button>
        <button className="btn btn-primary" disabled={activeCount < 2} onClick={goToTeamSelection}>
          Continue
        </button>
      </div>
    </div>
  );
}
