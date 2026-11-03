import { useMemo, useRef, useState } from 'react';
import { calculateAwards, bestGoalkeeperIds } from '../domain/awards';
import { compareGoalkeepers, computeGoalkeeperStats, sortedStandings, winsByColor } from '../domain/stats';
import { teamLabel } from '../domain/types';
import type { TeamColor } from '../domain/types';
import { useStore } from '../state/store';
import { confirmDialog, showToast } from '../ui/dialogs';
import { AwardIcon, TeamDot, usePlayerStats, usePlusMinusActive } from '../ui/common';
import { LEGEND } from '../domain/awards';

const awardName = (id: string) =>
  LEGEND.find((l) => l.icon === id)?.name ?? (id.startsWith('hat') ? 'Hattricks' : id === 'best_gk' ? 'Best Goalkeeper' : id);

async function exportPng(el: HTMLElement) {
  const { default: html2canvas } = await import('html2canvas');
  const bg = getComputedStyle(document.body).backgroundColor;
  const canvas = await html2canvas(el, { backgroundColor: bg, scale: 2, logging: false });
  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('export failed');
  const filename = `TavelPlay-Stats-${new Date().toISOString().slice(0, 10)}.png`;
  const file = new File([blob], filename, { type: 'image/png' });
  // On iPad the share sheet lets you save to Photos or send the image directly.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Today's Stats" });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function Stats() {
  const players = useStore((s) => s.players);
  const games = useStore((s) => s.games);
  const goalkeepers = useStore((s) => s.goalkeepers);
  const settings = useStore((s) => s.settings);
  const { resetAll, continueSession } = useStore.getState();
  const stats = usePlayerStats();
  const plusMinus = usePlusMinusActive();
  const [view, setView] = useState<'field' | 'gk'>('field');
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const rows = sortedStandings(players, stats);
  const awards = useMemo(
    () => calculateAwards(players, stats, games, settings.pigAwardEnabled),
    [players, stats, games, settings.pigAwardEnabled],
  );
  const gkStats = useMemo(() => computeGoalkeeperStats(goalkeepers, games), [goalkeepers, games]);
  const bestGk = new Set(bestGoalkeeperIds(goalkeepers, gkStats));
  const hasGk = settings.goalkeepersEnabled && goalkeepers.length > 0;
  const showGk = view === 'gk' && hasGk;
  const gkRows = [...goalkeepers]
    .map((gk) => ({ gk, s: gkStats.get(gk.id)! }))
    .sort((a, b) => compareGoalkeepers(a.s, b.s) || a.gk.name.localeCompare(b.gk.name));

  const wins = winsByColor(games);
  const colorsPlayed = [...new Set(games.flatMap((g) => [g.colors.left, g.colors.right]))] as TeamColor[];
  const rowCount = showGk ? gkRows.length : rows.length;

  return (
    <div className="screen">
      <div ref={exportRef} className="screen" style={{ gap: 16 }}>
        <h1 className="title">{showGk ? "Today's Goalkeepers" : "Today's Stats"}</h1>
        <div className="panel stats-wrap" style={{ ['--rows' as string]: Math.max(rowCount, 6) }}>
          {showGk ? (
            <table className="table stats-table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Goalkeeper</th>
                  <th>Awards</th>
                  <th className="num">GW/GP</th>
                  <th className="num">GA</th>
                  <th className="num">CS</th>
                </tr>
              </thead>
              <tbody>
                {gkRows.map(({ gk, s }, i) => (
                  <tr key={gk.id}>
                    <td className="num">{i + 1}</td>
                    <td className="name-cell">{gk.name}</td>
                    <td className="awards-col">
                      <div className="awards-cell">{bestGk.has(gk.id) && <AwardIcon id="best_gk" title="Best Goalkeeper" />}</div>
                    </td>
                    <td className="num">
                      {s.wins}/{s.games}
                    </td>
                    <td className="num">{s.goalsConceded}</td>
                    <td className="num">{s.cleanSheets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="table stats-table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Player</th>
                  <th>Awards</th>
                  <th className="num">GW/GP</th>
                  <th className="num">Pts</th>
                  <th className="num">G</th>
                  <th className="num">A</th>
                  {plusMinus && <th className="num">+/−</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ player, stats: s }, i) => (
                  <tr key={player.id}>
                    <td className="num">{i + 1}</td>
                    <td className="name-cell">{player.name}</td>
                    <td className="awards-col">
                      <div className="awards-cell">
                        {(awards.get(player.id) ?? []).map((a) => (
                          <AwardIcon key={a} id={a} title={awardName(a)} />
                        ))}
                      </div>
                    </td>
                    <td className="num">
                      {s.gamesWon}/{s.gamesPlayed}
                    </td>
                    <td className="num">{s.points}</td>
                    <td className="num">{s.goals}</td>
                    <td className="num">{s.assists}</td>
                    {plusMinus && <td className="num">{s.plusMinus > 0 ? `+${s.plusMinus}` : s.plusMinus}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {colorsPlayed.length > 0 && (
          <div className="team-wins" aria-label="Wins per team">
            {colorsPlayed.map((c) => (
              <span key={c}>
                <TeamDot color={c} />
                {teamLabel(c)} {wins.get(c) ?? 0}
              </span>
            ))}
            <span className="muted">
              {games.length} game{games.length === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </div>
      <div className="footer">
        <button
          className="btn btn-danger"
          onClick={async () => {
            if (
              await confirmDialog('All players, games and stats from this session will be deleted.', {
                title: 'Reset all data?',
                confirmLabel: 'Reset',
                danger: true,
              })
            )
              resetAll();
          }}
        >
          Reset All Data
        </button>
        <button
          className="btn btn-secondary"
          disabled={exporting}
          onClick={async () => {
            if (!exportRef.current) return;
            setExporting(true);
            try {
              await exportPng(exportRef.current);
            } catch {
              showToast('Export failed – try again');
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? 'Exporting…' : 'Export PNG'}
        </button>
        {hasGk && (
          <button className="btn btn-secondary" onClick={() => setView(showGk ? 'field' : 'gk')}>
            {showGk ? 'View Field Stats' : 'View GK Stats'}
          </button>
        )}
        <button className="btn btn-primary" onClick={continueSession}>
          Continue Session
        </button>
      </div>
    </div>
  );
}
