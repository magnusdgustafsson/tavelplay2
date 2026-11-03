import './c64.css';
import './light.css';
import './arena.css';

export type ThemeId = 'c64' | 'light' | 'arena';

export const THEMES: { id: ThemeId; name: string; description: string; logo: string }[] = [
  { id: 'c64', name: 'C64 Retro', description: 'Pixel font, grey retro look', logo: 'logo.svg' },
  { id: 'light', name: 'Modern Light', description: 'Clean, bright and easy to read', logo: 'logo.svg' },
  { id: 'arena', name: 'Arena', description: 'Scoreboard style with glowing numbers', logo: 'logo-neon.png' },
];

export function themeInfo(id: ThemeId) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
