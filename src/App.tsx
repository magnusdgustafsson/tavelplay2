import { useEffect } from 'react';
import { useStore } from './state/store';
import { Sidebar } from './ui/Sidebar';
import { DialogHost } from './ui/dialogs';
import { Entries } from './screens/Entries';
import { Settings } from './screens/Settings';
import { Teams } from './screens/Teams';
import { Game } from './screens/Game';
import { Summary } from './screens/Summary';
import { History } from './screens/History';
import { Stats } from './screens/Stats';

export function App() {
  const screen = useStore((s) => s.screen);
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]') ?? document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }));
    meta.setAttribute('content', getComputedStyle(document.body).backgroundColor);
  }, [theme]);

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        {screen === 'entries' && <Entries />}
        {screen === 'settings' && <Settings />}
        {(screen === 'teams' || screen === 'game-teams') && <Teams />}
        {screen === 'game' && <Game />}
        {screen === 'summary' && <Summary />}
        {screen === 'history' && <History />}
        {screen === 'stats' && <Stats />}
      </main>
      <DialogHost />
    </div>
  );
}
