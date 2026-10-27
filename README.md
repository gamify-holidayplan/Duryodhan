# Duryodhan Arcade

A website of small browser games, hosted on Vercel. Pure HTML/JS, no build step.

```
index.html              home page (lists every game)
games.js                the list of games shown on the home page
games/<slug>/index.html one folder per game
```

## Adding a new game

1. Create `games/<slug>/index.html` with the game (keep it self-contained).
   Add a link back home: `<a href="/">← All games</a>`.
2. Add an entry to `games.js`:
   ```js
   { slug: 'my-game', title: 'My Game', description: '...', tags: ['Arcade'], color: ['#123', '#456'], emoji: '🚀' },
   ```
3. Push. Vercel redeploys automatically.

## Games

- **Head Soccer** (`/games/head-soccer/`): 1-player football vs the computer, with falling bombs and selfie faces.
