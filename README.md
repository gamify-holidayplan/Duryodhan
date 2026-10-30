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
- **Hold'em Poker** (`/games/texas-holdem/`): no-limit Texas Hold'em vs 5 bots. 4 stake levels, buy-ins, blinds, side pots, saved bankroll with a daily bonus.
- **Poker Night Live** (`/games/poker-live/`): multiplayer Texas Hold'em with friends over a share link, with live video and voice at each seat. Needs the game server below.
- **Aura Farm Defense** (`/games/aura-farm/`): lane defense. Plant Aura Blooms, Drip Shooters, Frost Fits, Rizz Rocks and Mog Mines to stop waves of aura-draining NPCs.

## Poker Night Live server

Multiplayer poker can't be a static page: the dealer has to live somewhere nobody can peek at the deck.
It runs on Cloudflare (free plan) as a Worker with one Durable Object per table:

```
shared/poker-engine.js   rules, hand ranking, side pots (used by the server and the page)
server/poker/            Cloudflare Worker + Durable Object (the dealer), and tests
games/poker-live/        the page players open
```

- Live server: `https://poker-live.dixshant4.workers.dev` (set as `API` in `games/poker-live/index.html`).
- Deploy after changing `server/` or `shared/`: `cd server/poker && npm install && npx wrangler deploy`
  (needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment).
- Tests: `node server/poker/test/engine.test.mjs` (rules fuzz test), and with `npx wrangler dev` running,
  `BASE=http://127.0.0.1:8787 node server/poker/test/table.test.mjs` (bots play a full table).
- Try the page against a local server: `/games/poker-live/?api=http://127.0.0.1:8787`.

**Video.** By default phones send video to each other directly (peer-to-peer), with the server only passing
the connection messages along. That's free and works on most Wi-Fi and 4G, but some mobile networks block direct
connections. For sturdier video, create a free [LiveKit Cloud](https://cloud.livekit.io) project and, in the
Cloudflare dashboard under Workers & Pages → `poker-live` → Settings → Variables and Secrets, add:

| Name | Value |
|---|---|
| `LIVEKIT_URL` | the project's `wss://….livekit.cloud` URL |
| `LIVEKIT_API_KEY` | API key from LiveKit → Settings → API Keys |
| `LIVEKIT_API_SECRET` | the matching API secret (add it as a Secret) |

New tables then use LiveKit automatically; if it can't connect, the page falls back to peer-to-peer.

**Video between phones on mobile data** needs a relay (TURN) server, because carriers block direct connections.
Create one in the Cloudflare dashboard under Realtime → TURN Server, then add its two values to the `poker-live`
Worker as secrets: `TURN_KEY_ID` and `TURN_KEY_API_TOKEN`. The server then hands every player short-lived relay
credentials, and connections that can't go direct are relayed automatically (free up to Cloudflare's monthly allowance).
