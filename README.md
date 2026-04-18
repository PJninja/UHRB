# Unspeakable Horrors Race Betting (UHRB)

UHRM is a small Web game where you bet on the outcome of a race between unspeakable monstrosities.

## Tech Stack

The project is two separate Node.js applications — a Svelte SPA (client) and a Fastify API server — that communicate via WebSocket and REST.

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
| **nanoid** | ^5.0.0 | Generates unique IDs for races and sessions |
| **seedrandom** | ^3.0.5 | Seeded pseudo-random number generator — makes monster generation and race outcomes deterministic and reproducible from a seed string |
| **pino** | ^8.18.0 | Structured JSON logger; used via a shared instance in `src/utils/logger.js`; service files create child loggers with a `module` label |
| **pino-pretty** | ^10.3.0 | Development-only log formatter — converts Pino's JSON output to human-readable, colour-coded lines; disabled in production |

## Core Loop
- Players get a starting balance of 100 candies
- They can bet on one monster (out of 4-6) to win the upcoming race.
- Races occur every 30-300 seconds.
- Players can inspect each monster, the time between races being limited makes inspecting important.
- Some Monsters are less likely to win but have higher payouts, while others are more consistent but pay less.

## Monsters
Monsters are procedurally generated with a bio and traits. They may persist across races sometimes,
but in general they are generated on the fly.
Each bio and appearance is assigned a letter (A, C, G, T). Name and location are not assigned letters but are generated from a pool of names and locations.
The total combination of letters is what makes up the monsters traits based on the Trait Table.

### BIO
- Unique Name from two randomized names (Sometimes only one)
- Location Found (e.g. "The Depths of the Abyss", "The Forgotten City", "Cleveland")
- Brief Description (1-2 sentences)
- Blurb about them (e.g. "They have been disqualified from races in other dimensions")
- Racing Style (e.g. "Crawls" or "Slithers")
    
### APPEARANCE
- Body Type (e.g. "Humanoid", "Quadruped", "Amorphous")
- Distinctive Features (e.g. "Glowing Eyes", "Tentacles", "Spikes")
- Height (0-300 meters)
- Weight (0-1000 tons)
- Temperment (e.g. "Aggressive", "Calm", "Chaos-Incarnate")
    
### TRAITS
- Speed (1-10) - Number of A's a Monster has
- Endurance (1-10) - Number of C's a Monster has
- Madness (1-10) - Number of G's a Monster has
- Unpredictability (1-10) - Number of T's a Monster has
- Luck (1-10) - The more letter variations a Monster has, the higher
- Value (1-100) - Hidden from user, randomized, 50 means the Monster is fairly priced.
50 Value means their payout in fairly proportional to the sum of their stats. 100 Value means their payout is 3x what it should be, 0 Value means their payout is 0.33x what it should be.

## Visuals
- Simple, mix of Animal Crossing and Eldritch Horror vibes
- Animal Crossing shapes and design but on a dark color palette with Cthonic symbols and motifs

## Pages
- Home Page - This is where the next race timer is, where you can place bets, and see all the monsters running in that race.
- Bio - Clicking on a monster from the Home Page takes you to their Bio Page, where you can see all of their traits and stats.
- Race Page - This is where you can watch the race, see progress bars for each monster as well as "live" commentary.
- Results Page - This is where you see the results, how the race went, and your winnings or losses.
- History Page - This is where you can see the history of your races, bets, and outcomes. As well as stats like most candy earned in 1 bet and most candy lost in 1 bet.

## Stretch Goals
- Leaderboard - A leaderboard of the top 10 players with the most candy.
- Monster Visuals - Adding simple visuals for each monster based on their traits.
- Friend System - Allowing players to add friends and bet on the same races.
- More Monster Traits - Adding more traits to make the monsters more unique and interesting.