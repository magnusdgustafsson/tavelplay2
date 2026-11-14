# TavelPlay 2

A Progressive Web App for tracking floorball games: scores, goal scorers,
assists, awards and the day's standings. Built for iPad in landscape and
works offline once opened.

## Features

- Players per session (max 20); recurring players are checked in with one
  tap in a grid (Select all / Clear), guests are typed in
- Random teams that remember every pair during the evening, so everyone
  plays with everyone about equally often (no lineup is repeated), a
  stick-throwing team draw animation, 60 s auto-start, edit teams, swap
  sides, rematch
- Final game (offered after 4 games): two players tied for most wins, and
  two tied for fewest wins, are put on different teams so there is a single
  winner and a clear pig; afterwards the app goes straight to the stats
- Dedicated goalkeepers, max score (optionally win by two, capped at 10),
  assists on/off
- Fast goal registration: tap the scorer, then the assist – it saves
  itself after 3 s (undo for 10 s); add or remove
  players during a game (late joiners get no win credit; leavers keep it
  if they stayed through their team's 2nd goal)
- Automatic plus/minus whenever it is fair: equal teams of 3–5 players
  and nobody on the bench (6, 8 or 10 players)
- Decisive goals ⚡, hattricks 🎩, MVP, best defender, best goalkeeper,
  most wins/points/goals/assists and the pig award
- Game history with editing and deleting – all stats are recalculated
- Today's stats exported as a PNG image (share sheet on iPad)
- Three themes: **C64 Retro**, **Modern Light** and **Arena**
- The current game survives a reload and the screen is kept awake during
  a game

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # unit tests for the game rules and stats
npm run build    # production build in dist/
```

The code is split into:

- `src/domain` – pure game rules: teams, stats, awards (fully tested)
- `src/state` – the app store (zustand), saved to localStorage
- `src/screens`, `src/ui` – React components
- `src/themes` – one CSS file per theme; each theme is a set of CSS
  variables, so adding a theme means adding one file and one entry in
  `src/themes/index.ts`

## Deploy

Vercel detects the Vite project automatically (build `npm run build`,
output `dist`). Every push to `main` deploys a new version; the app
updates itself the next time it is opened.
