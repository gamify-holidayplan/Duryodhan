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
- **Paper Toss** (`/games/paper-toss/`): swipe a paper ball into the bin, aiming against the fan's wind. One miss ends the streak.
- **Crossy Roads** (`/games/crossy-roads/`): hop across roads, rivers and train tracks. 5 characters: chicken, frog, penguin, robot, fox.
- **Stick Cricket** (`/games/stick-cricket/`): chase a target in 3 overs with 3 wickets. Tap to hit, swipe up to loft, swipe sideways to aim.
- **Neon Ping Pong** (`/games/ping-pong/`): table tennis vs the computer with spin, smashes and sound. Easy / Normal / Pro.
- **8 Ball Pool** (`/games/8-ball-pool/`): solids vs stripes against the computer, with fouls, ball in hand and an aiming guideline.
- **Flappy Wings** (`/games/flappy-wings/`): tap to flap through the gaps between pipes. Gaps get tighter as your score climbs.
