import { LEGEND, LEGEND_GK } from '../domain/awards';
import { sortedStandings } from '../domain/stats';
import { useStore } from '../state/store';
import { themeInfo } from '../themes';
import { AwardIcon, asset, usePlayerStats, usePlusMinusActive } from './common';

export function Sidebar() {
  const screen = useStore((s) => s.screen);
  const theme = useStore((s) => s.theme);
  const players = useStore((s) => s.players);
  const gkEnabled = useStore((s) => s.settings.goalkeepersEnabled);
  const stats = usePlayerStats();
  const plusMinus = usePlusMinusActive();
  const showLegend = screen === 'stats';

  return (
    <aside className="sidebar">
      <h2>{showLegend ? 'Legend' : 'Standings'}</h2>
      <div className="sidebar-content">
        {showLegend ? (
          <div className="legend">
            {[...LEGEND, ...(gkEnabled ? LEGEND_GK : [])].map((l) => (
              <div className="legend-item" key={l.icon}>
                <AwardIcon id={l.icon} title={l.name} />
                <span>{l.name}</span>
              </div>
            ))}
          </div>
        ) : players.length === 0 ? (
          <p className="empty">No players yet</p>
        ) : (
          <table className="table standings" style={{ ['--rows' as string]: Math.max(players.length, 8) }}>
            <thead>
              <tr>
                <th>Player</th>
                <th className="num">GW/GP</th>
                <th className="num">Pts</th>
                <th className="num">G</th>
                <th className="num">A</th>
                {plusMinus && <th className="num">+/−</th>}
              </tr>
            </thead>
            <tbody>
              {sortedStandings(players, stats).map(({ player, stats: s }) => (
                <tr key={player.id} style={player.active ? undefined : { opacity: 0.55 }}>
                  <td className="name-cell">
                    <span className="name-wrap">
                    <span className="n">{player.name}</span>
                    {s.hattricks > 0 && (
                      <span className="hats" title={`${s.hattricks} hattrick${s.hattricks > 1 ? 's' : ''}`}>
                        {s.hattricks > 2 ? `🎩×${s.hattricks}` : '🎩'.repeat(s.hattricks)}
                      </span>
                    )}
                    </span>
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
      <div className="sidebar-logo">
        <img src={asset(themeInfo(theme).logo)} alt="TavelPlay" draggable={false} />
      </div>
    </aside>
  );
}
