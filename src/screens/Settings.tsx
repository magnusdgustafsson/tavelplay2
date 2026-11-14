import { useState } from 'react';
import type { ReactNode } from 'react';
import { TEAM_COLORS, teamLabel } from '../domain/types';
import type { TeamColor } from '../domain/types';
import { useStore } from '../state/store';
import { THEMES } from '../themes';
import { WIN_BY_TWO_CAP } from '../domain/stats';
import { confirmDialog } from '../ui/dialogs';

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
  children,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`setting${disabled ? ' disabled' : ''}`}>
      <label className="setting-row">
        <span className="setting-label">
          {label}
          {hint && <div className="setting-hint">{hint}</div>}
        </span>
        <input
          type="checkbox"
          className="switch"
          checked={checked && !disabled}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
      {checked && children}
    </div>
  );
}

function NameList({
  items,
  onAdd,
  onRemove,
  placeholder,
}: {
  items: { id: string; name: string }[];
  onAdd: (name: string) => boolean;
  onRemove: (id: string) => void;
  placeholder: string;
}) {
  const [name, setName] = useState('');
  return (
    <>
      <form
        className="form-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (onAdd(name)) setName('');
        }}
      >
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          maxLength={30}
          autoComplete="off"
        />
        <button className="btn btn-primary" type="submit" disabled={!name.trim()}>
          Add
        </button>
      </form>
      {items.length > 0 && (
        <div className="grid-2">
          {[...items]
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
            .map((item) => (
              <div className="list-item" key={item.id} style={{ minHeight: 52 }}>
                <span className="name">{item.name}</span>
                <button className="btn btn-secondary btn-small" onClick={() => onRemove(item.id)}>
                  Remove
                </button>
              </div>
            ))}
        </div>
      )}
    </>
  );
}

function ColorPicker({
  label,
  value,
  other,
  onChange,
}: {
  label: string;
  value: TeamColor;
  other: TeamColor;
  onChange: (c: TeamColor) => void;
}) {
  return (
    <div className="setting-row" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
      <span className="setting-label">
        {label}: {teamLabel(value)} TEAM
      </span>
      <div className="color-chips">
        {TEAM_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            data-team={c}
            className={`color-chip${c === value ? ' selected' : ''}`}
            disabled={c === other}
            title={`${teamLabel(c)} TEAM`}
            aria-label={`${teamLabel(c)} team`}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
    </div>
  );
}

export function Settings() {
  const s = useStore((st) => st.settings);
  const theme = useStore((st) => st.theme);
  const goalkeepers = useStore((st) => st.goalkeepers);
  const recurring = useStore((st) => st.recurring);
  const update = useStore((st) => st.updateSettings);
  const setTheme = useStore((st) => st.setTheme);
  const setScreen = useStore((st) => st.setScreen);
  const addGoalkeeper = useStore((st) => st.addGoalkeeper);
  const removeGoalkeeper = useStore((st) => st.removeGoalkeeper);
  const addRecurring = useStore((st) => st.addRecurring);
  const removeRecurring = useStore((st) => st.removeRecurring);
  const resetAll = useStore((st) => st.resetAll);

  return (
    <div className="screen">
      <h1 className="title">Settings</h1>
      <div className="screen-body">
        <div className="settings">
          <div className="setting">
            <h3>Theme</h3>
            <div className="theme-options">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`theme-option${t.id === theme ? ' selected' : ''}`}
                  onClick={() => setTheme(t.id)}
                >
                  <span className={`theme-preview theme-preview-${t.id}`}>
                    <span>3</span>
                    <span>–</span>
                    <span>2</span>
                  </span>
                  <span className="theme-option-name">{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          <Toggle label="Assists" checked={s.assistsEnabled} onChange={(v) => update({ assistsEnabled: v })} />

          <Toggle
            label="Max score"
            hint="Goal buttons lock when a team reaches the max score"
            checked={s.maxScoreEnabled}
            onChange={(v) => update({ maxScoreEnabled: v })}
          >
            <div className="setting-row">
              <span>Goals to win</span>
              <select
                className="select"
                value={s.maxScore}
                onChange={(e) => update({ maxScore: Number(e.target.value) })}
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </Toggle>

          <Toggle
            label="Win margin two goals"
            hint={
              !s.maxScoreEnabled
                ? 'Turn on Max score to use this'
                : s.maxScore >= WIN_BY_TWO_CAP
                  ? `No effect with max score ${WIN_BY_TWO_CAP} – first to ${WIN_BY_TWO_CAP} always wins`
                  : `At ${s.maxScore}–${s.maxScore - 1} play on until a team leads by two – or reaches ${WIN_BY_TWO_CAP} goals`
            }
            checked={s.winByTwoEnabled}
            disabled={!s.maxScoreEnabled}
            onChange={(v) => update({ winByTwoEnabled: v })}
          />

          <Toggle
            label="Pig award"
            hint="Given to the player with the fewest wins"
            checked={s.pigAwardEnabled}
            onChange={(v) => update({ pigAwardEnabled: v })}
          />

          <Toggle
            label="Random teams"
            hint="Shuffle new teams before every game"
            checked={s.randomTeamsEnabled}
            onChange={(v) => update({ randomTeamsEnabled: v })}
          />

          <Toggle
            label="Goalkeepers"
            hint="Dedicated goalkeepers with their own stats"
            checked={s.goalkeepersEnabled}
            onChange={(v) => update({ goalkeepersEnabled: v })}
          >
            <NameList
              items={goalkeepers}
              onAdd={addGoalkeeper}
              onRemove={removeGoalkeeper}
              placeholder="Goalkeeper name"
            />
          </Toggle>

          <div className="setting">
            <h3>Recurring players</h3>
            <span className="setting-hint">Saved between sessions – quick to add on the Player Entries screen.</span>
            <NameList items={recurring} onAdd={addRecurring} onRemove={removeRecurring} placeholder="Player name" />
          </div>

          <div className="setting">
            <h3>Team colours</h3>
            <ColorPicker
              label="Left side"
              value={s.leftColor}
              other={s.rightColor}
              onChange={(c) => update({ leftColor: c })}
            />
            <ColorPicker
              label="Right side"
              value={s.rightColor}
              other={s.leftColor}
              onChange={(c) => update({ rightColor: c })}
            />
          </div>
        </div>
      </div>
      <div className="footer">
        <button className="btn btn-secondary" onClick={() => setScreen('entries')}>
          Back
        </button>
        <button
          className="btn btn-danger"
          onClick={async () => {
            if (
              await confirmDialog('All players, games and stats from this session will be deleted.', {
                title: 'Reset all data?',
                confirmLabel: 'Reset',
                danger: true,
              })
            ) {
              resetAll();
            }
          }}
        >
          Reset All Data
        </button>
      </div>
    </div>
  );
}
