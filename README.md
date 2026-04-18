# Unspeakable Horrors Race Betting (UHRB)

UHRB is a browser-based game where you bet candies on the outcome of a race between procedurally generated unspeakable monstrosities.

## Tech Stack

The project is two separate Node.js applications — a Svelte 5 SPA (client) and a Fastify API server — that communicate via WebSocket and REST.

### Client (`/` — root)

| Dependency | Version | How it's used |
|---|---|---|
| **Svelte** | ^5.0.0 | UI framework — reactive components, stores, SPA routing |
| **Vite** | ^5.0.0 | Dev server and production bundler |
| **@sveltejs/vite-plugin-svelte** | ^4.0.0 | Vite plugin that compiles `.svelte` files |
| **svelte-spa-router** | ^4.0.1 | Hash-based client-side routing (`/#/`, `/#/bio/:id`, etc.) |

### Server (`/server`)

| Dependency | Version | How it's used |
|---|---|---|
| **Fastify** | ^4.26.0 | HTTP server framework — REST routes, request lifecycle, built-in Pino integration |
| **@fastify/websocket** | ^10.0.0 | WebSocket support; real-time `race:update` push events to all connected clients |
| **@fastify/cors** | ^9.0.0 | Cross-Origin Resource Sharing — allows the Vite dev server (`localhost:5173`) to call the API (`localhost:3000`) |
| **@fastify/rate-limit** | ^9.1.0 | Global and per-route request rate limiting to prevent abuse |
| **nanoid** | ^5.0.0 | Generates unique IDs for races and sessions |
| **seedrandom** | ^3.0.5 | Seeded pseudo-random number generator — makes monster generation and race outcomes deterministic and reproducible from a seed string |
| **pino** | ^8.18.0 | Structured JSON logger; used via a shared instance in `src/utils/logger.js`; service files create child loggers with a `module` label |
| **pino-pretty** | ^10.3.0 | Development-only log formatter — converts Pino's JSON output to human-readable, colour-coded lines; disabled in production |

## Setup

### Prerequisites

- Node.js 18+
- npm

### Install dependencies

```bash
# Client (root)
npm install

# Server
cd server && npm install
```

### Environment variables

**Client** — create `.env` in the root directory:
```
VITE_API_URL=http://localhost:3000/api
```

**Server** — create `.env` in `/server`:
```
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
SESSION_TTL_MS=86400000
LOG_LEVEL=info
```

## Running the App

Both servers must be running simultaneously.

```bash
# Terminal 1 — API server (from /server)
npm run dev

# Terminal 2 — Vite dev server (from root)
npm run dev
```

- Client: http://localhost:5173
- API: http://localhost:3000

## Build

```bash
# Build the client for production (from root)
npm run build

# Preview the production build locally
npm run preview

# Run the server in production mode (from /server)
npm start
```

The production build outputs to `/dist`. Serve it with any static file host and point `VITE_API_URL` at your deployed API server.

## Deployment

### Frontend — Netlify

The client is configured for Netlify via `netlify.toml` (build command, publish directory, SPA fallback redirect).

**Steps:**

1. Push the repo to GitHub.
2. In Netlify, create a new site from the repo — build settings are picked up automatically from `netlify.toml`.
3. In **Site settings → Environment variables**, add:
   ```
   VITE_API_URL=https://your-api-server.example.com/api
   ```
4. Deploy. Netlify runs `npm run build` and serves `/dist`.

### Backend — external host required

Netlify Functions do not support WebSockets, so the Fastify server must be hosted separately. Good options: [Railway](https://railway.app), [Render](https://render.com), [Fly.io](https://fly.io).

Regardless of host, set these environment variables on the server:

```
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
CORS_ORIGIN=https://your-netlify-site.netlify.app
SESSION_TTL_MS=86400000
LOG_LEVEL=info
```

Set `CORS_ORIGIN` to your Netlify site URL so the browser can reach the API. Then update `VITE_API_URL` in Netlify to point at the deployed server before triggering a redeploy.

## Core Loop

- Players get a starting balance of 100 candies.
- They can bet on one monster (out of 4–6) to win the upcoming race.
- Races occur every 30–300 seconds.
- Players can inspect each monster's bio before betting; the limited time window makes scouting meaningful.
- Some monsters are less likely to win but pay out more; others are more consistent but pay less.

## HORRORS

Horrors are procedurally generated with a bio and traits. They may persist across races occasionally, but are generally generated fresh each race.

Each bio and appearance entry is assigned a letter (A, C, G, T). Name and location are cosmetic only — no letter assignment. The total letter combination across all selected entries determines the monster's stats via the Trait Table below.

### Bio

- Unique name from two randomized name parts (sometimes one)
- Location found (e.g. "The Depths of the Abyss", "The Forgotten City", "Cleveland")
- Brief description (1–2 sentences)
- Blurb (e.g. "They have been disqualified from races in other dimensions")
- Racing style (e.g. "Crawls" or "Slithers")

### Appearance

- Body type (e.g. "Humanoid", "Quadruped", "Amorphous")
- Distinctive features (e.g. "Glowing Eyes", "Tentacles", "Spikes")
- Height (0–300 meters)
- Weight (0–1000 tons)
- Temperament (e.g. "Aggressive", "Calm", "Chaos-Incarnate")

### Traits

Stat numbers are never displayed to players — only inferred through prose, visual effects, and cryptic scholar hints.

| Trait | Letter | Effect |
|---|---|---|
| **Speed** | A | Controls surge frequency in the race |
| **Endurance** | C | Controls consistency across the race |
| **Madness** | G | Controls unpredictability |
| **Strength** | T | Controls burst amplitude |
| **Luck** | — | Higher when the monster has more letter variety |
| **Value** | — | Hidden; skews payout relative to true odds (50 = fair, 100 = 3× overpay, 0 = 0.33× underpay) |

## Pages

- **Home** — race timer, monster roster, and betting panel.
- **Bio** — full monster dossier with prose stats and betting slip.
- **Race** — live race animation with progress bars.
- **Results** — outcome, race summary, and payout.
- **History** — past bets log with aggregate stats (most earned, most lost, etc.).

## Visual Style

Dark eldritch aesthetic — Warhammer 40K-style gothic fonts layered over an ancient scroll palette. Deep blacks, decayed parchment tones, and glowing accent colours.

## Stretch Goals

- **Leaderboard** — top 10 players by candy count.
- **Monster visuals** — procedurally styled illustrations based on traits.
- **Friend system** — add friends and bet on the same races together.
- **More traits** — expand the trait system for greater monster variety.
