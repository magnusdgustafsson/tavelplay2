import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/oswald/latin-500.css';
import '@fontsource/oswald/latin-600.css';
import '@fontsource/oswald/latin-700.css';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/orbitron/latin-900.css';
import './styles/base.css';
import './themes';
import { App } from './App';
import { useStore } from './state/store';

// Apply the saved theme before the first paint to avoid a flash.
document.documentElement.dataset.theme = useStore.getState().theme;

// New versions install in the background and apply on the next launch.
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
