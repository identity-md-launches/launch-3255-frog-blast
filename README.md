# Frog Blast

An original browser bomb-arena game: four frogs in a 15×13 garden maze of stone pillars and wooden crates.
Drop bombs, set off chain reactions, collect upgrades, and be the last frog standing. First to three round wins
takes the match.

- **Solo:** you against three bots (Easy or Normal). Keyboard or touch (d-pad + bomb button).
- **Local versus:** two players sharing one keyboard, optionally plus two bots (off by default). No online play.

## Controls

| Who | Move | Bomb |
| --- | --- | --- |
| Player 1 | `W` `A` `S` `D` | `Space` |
| Player 2 (versus) | Arrow keys | `Enter` |
| Solo on a phone/tablet | Left d-pad | Right **Bomb** button |

`P` or `Escape` (or the pause button) pauses. In solo, arrow keys and Enter also drive Player 1.
Holding a bomb key never places extra bombs (key repeat is ignored). Leaving the window or tab pauses
the game and clears held inputs.

## Rules implemented

- Round: 120 s, one life each. Last survivor wins; all remaining frogs out on the same tick, or time-out
  with several survivors, is a draw with no win.
- Start: 1 bomb, blast range 2. Fuse 2.5 s (150 ticks), damaging blast 0.45 s (27 ticks).
- Blasts run in four directions; pillars/walls stop them; the first crate in a ray breaks and stops it;
  a blast reaching a bomb detonates it immediately and that bomb keeps its own owner.
- You can step off a bomb you are standing on, but not back onto it.
- Upgrades hidden in crates: extra bomb (max 6), longer blast (max 7), faster hops (max +4 steps).
  Exposed upgrades burn in later blasts.
- Score: 100 per opponent eliminated, 10 per crate, 25 per round won. Self-elimination scores nothing.
  Each elimination and crate is credited once.
- Simulation runs at a fixed 60 Hz step. Inputs are gathered, then all frogs move, then bombs are placed
  (two frogs claiming one tile on the same tick both fail), then fuses/blasts, then all hits are applied
  together, so update order never decides a winner.

## Install, run, build

Requires Node 20+ (tested with Node 24).

```sh
npm ci              # install exact locked dependencies
npm run dev         # local dev server
npm run build       # typecheck (tsc --noEmit) + production export to dist/
npm run preview     # serve dist/ locally
npm run typecheck   # TypeScript only
npm test            # unit tests (Vitest) for the simulation and bots
npm run test:e2e    # browser tests against dist/ (needs Playwright + Chromium, see below)
```

Browser tests import Playwright from `playwright` or from the path in `IMD_PLAYWRIGHT`, e.g.

```sh
npm install --no-save playwright && npx playwright install chromium
npm run build && npm run test:e2e
```

They serve `dist/` through request routing at `http://game.test/ipfs/bafytest/` (an IPFS-style subpath),
so no server is started. Screenshots go to `test/scratch/e2e-shots/` (not committed).

## Export / hosting

`npm run build` writes a fully static export to `dist/`:

- `index.html` with relative asset URLs (`vite.config.ts` sets `base: './'`), so it works at an IPFS
  gateway subpath, an ENS name or any folder.
- `assets/` hashed JS/CSS and the bundled Nunito font files (SIL Open Font License, from `@fontsource/nunito`).
- `cover.svg` (1200×630), `logo.svg`, `favicon.svg`, `pepe-game.json` (manifest).

There is no backend, no external request, no analytics, no wallet or login. All sounds are synthesised
at run time with Web Audio (no audio files), only after a user gesture. Copy `dist/` to any static host.
Hosting/pinning is done by the publishing pipeline, not by this repository.

## Iframe bridge (`pepe-game/1`)

Implemented in `src/ui/bridge.ts`. Messages are accepted only when `event.source === window.parent` and
`protocol === "pepe-game/1"`.

| Direction | Message |
| --- | --- |
| host → game | `{protocol, type: "init", channel}`: the game stores `channel` and replies `{protocol, type: "ready", channel}` |
| host → game | `{protocol, type: "pause" \| "resume", channel}`: honoured only when `channel` matches; freezes/resumes the entire simulation |
| game → host | `{protocol, type: "gameover", channel, score}`: Player 1's final non-negative integer score, once per completed match (not per round, not for abandoned or restarted matches) |

Replies use `targetOrigin "*"` because a sandboxed frame has an opaque origin. Without `init` the game
runs standalone and posts nothing. A host pause and a player pause are tracked separately, so a host
`resume` does not dismiss a pause the player chose. No host message schema file was supplied with
the task, so these field names follow the brief's wording; adjust `src/ui/bridge.ts` if the host
schema differs.

## Architecture

```
src/
  sim/            pure, deterministic game logic (no DOM)
    constants.ts  tick rate, timings, caps, scoring
    arena.ts      seeded layout generation + playability validation
    game.ts       state, movement/collision, bombs, chain reactions, damage, rounds, match
    bot.ts        danger map (with chain timing), escape search, goal choice
    controllers.ts maps humans/bots to one PlayerInput per player per tick
    rng.ts        seeded PRNG
  render/
    draw.ts       canvas drawing: garden tiles, crates, bombs with fuse, blasts, frogs, particles
    looks.ts      the four frogs (colour + accessory)
  ui/
    input.ts      keyboard (two players, repeat-safe) and multitouch d-pad/bomb
    audio.ts      Web Audio synthesised effects, gesture-gated, mute/volume
    storage.ts    preferences, safe when localStorage throws (opaque-origin iframes)
    bridge.ts     host postMessage protocol
  main.ts         screens, the single requestAnimationFrame loop, fixed-step accumulator, pause, HUD, overlays
  style.css       design tokens and layout (see DESIGN.md)
public/           logo.svg, favicon.svg, cover.svg, pepe-game.json (copied to dist/)
tests/unit/       Vitest simulation tests
tests/e2e/run.mjs Playwright browser tests against dist/
```

The main loop accumulates real time only while unpaused and steps the simulation in fixed 1/60 s ticks
(max 15 per frame). Pausing stops accumulation; resuming resets the clock, so there is no time jump.
Restart builds a fresh game object; listeners and the animation loop are created once at start-up.

Test notes, results and the design review are in [`TESTING.md`](TESTING.md).
Design tokens and components are documented in [`DESIGN.md`](DESIGN.md).
