# Frog Blast: validation and design review

Worker report, not an independent certification. All results below are from this run, on the final source.

## Scope and assumptions

- Product: the whole game (menu, How to play dialog, solo, local versus, pause/round/match overlays,
  touch controls, iframe bridge). Export: `dist/` built by `npm run build` (Vite, `base: './'`).
- No host message schema file was supplied; the bridge uses `{protocol, type, channel[, score]}` exactly as
  worded in the brief (`src/ui/bridge.ts`).
- Sounds are synthesised with Web Audio at run time, so the export has no audio files.
- Hosting/IPFS pinning, CID and ENS name are **not** produced here: the publishing pipeline pins the committed
  `dist/`. No publish command was run, and nothing is claimed as listed or approved.

## Verification (commands and actual results)

| Command | Result |
| --- | --- |
| `npm run typecheck` (tsc --noEmit) | exit 0 |
| `npm test` (Vitest, 15 tests) | 15/15 passed |
| `npm run build` | exit 0; JS 41.6 kB (15.5 kB gzip), CSS 10.5 kB, fonts 6 files |
| `IMD_PLAYWRIGHT=… node tests/e2e/run.mjs` | 18/18 passed (also 18/18 on two earlier consecutive runs) |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | 16/16 checks passed (render, layout, targets, contrast, casing, tracking, eyebrows, type-sizes, type-faces, glyphs, slogans, repetition, copy-budget, chrome, motion, share) |

Unit tests (`tests/unit/sim.test.ts`): layout generation/validation over 300 seeds; capacity and starting
range; step-off-but-not-back bomb occupancy; wall/pillar/crate blocking; 150-tick fuse and 27-tick blast;
first crate breaks and stops the ray; chain reaction keeps each owner's credit; self-elimination scores 0;
simultaneous elimination draw; timeout draw; mirrored player order gives the same result; first to three
plus 25-point round bonus and reset between rounds; upgrade caps; bots escape their own fresh bomb on 20
layouts; six-round bot matches keep rule invariants with under 60% self-eliminations.

Browser tests (`tests/e2e/run.mjs`, Chromium headless shell from Playwright 1.5x, export served at the
gateway-style subpath `http://game.test/ipfs/bafytest/`):

- PASS manifest is exactly the required object (0 ms)
- PASS cover.svg is 1200x630 with matching viewBox (0 ms)
- PASS index.html uses only relative local asset URLs that exist (1 ms)
- PASS standalone loads at a gateway subpath with no errors, no autoplay (86 ms)
- PASS how to play explains controls and bomb danger (152 ms)
- PASS solo: P1 moves with WASD, bombs once per press, bots move (4443 ms)
- PASS pause freezes fuse, blast and round time; resume has no jump (1432 ms)
- PASS focus loss clears held keys and pauses (511 ms)
- PASS restart clears scores, bombs, timers, inputs; one loop only (512 ms)
- PASS first to three wins, results, standings, rematch (8650 ms)
- PASS draws: simultaneous elimination and timeout award no win (2404 ms)
- PASS no console errors, no external requests, no missing files (0 ms)
- PASS local versus: simultaneous WASD and arrows, Space and Enter (3021 ms)
- PASS mobile 390: product and Play solo on the first screen (145 ms)
- PASS mobile: d-pad movement and bomb button together (multitouch), cancel releases (3166 ms)
- PASS iframe sandbox="allow-scripts allow-pointer-lock": runs with storage denied, muted, no autoplay (133 ms)
- PASS bridge: init -> ready with channel; wrong source/protocol/channel ignored; pause/resume (3845 ms)
- PASS bridge: exactly one integer gameover per completed match, none for abandoned (11676 ms)

Viewports exercised: 1440×900 desktop, 390×844 mobile emulation (touch, DPR 2), 1280×900 host page with
the game in `<iframe sandbox="allow-scripts allow-pointer-lock">`. The taste probe also rendered 320, 390
and 1440 wide plus reduced motion.

Not tested: Firefox and Safari/WebKit, physical phones and tablets (touch was emulated with synthetic
pointer events), real speakers/audio output (only the AudioContext state was checked), a screen reader
session, browser-native 200% zoom, and a real Pepe2Pepe host page.

## Better Interface review (six domains)

| Domain | Status | Evidence |
| --- | --- | --- |
| Accessibility | Checked | Native buttons/radios/checkbox/`dialog`; visible `:focus-visible` ring (`--focus`); overlay focus moves to the first action and Tab is trapped (`trapTab`); icon buttons have `aria-label`/`aria-pressed`; round results go to an `aria-live` region; frogs differ by accessory as well as colour; upgrades differ by icon; reduced motion turns off particles, shake, bobbing, bomb pulse and the banner pop; targets ≥44px (probe: targets pass). Not performed: screen reader, native zoom. |
| Layout | Checked | Screenshots at 390 and 1440 (menu, solo, versus, match over, iframe). No horizontal overflow at 320/390/1440 (probe and e2e). Arena fills the stage at 15:13. |
| Writing | Checked | Verb-first actions (Play solo, Next round, Rematch, Quit to menu); controls explained next to modes and in How to play; draw reasons say why no win was awarded; storage note explains settings will not persist. |
| Typography | Checked | One bundled family (Nunito 400/700/800), five sizes (`--fs-1..5`), tabular numbers for timer and scores, balanced headings. |
| Colors | Checked | Tokens in `src/style.css`; the probe's contrast check passed for all DOM text at 320/390/1440. Canvas art (no text) was not contrast-measured. |
| UI | Checked | Consistent button variants, one primary per view, tonal surfaces without border+shadow stacking (probe: chrome pass), restrained motion. |

### Findings and fixes

1. HIGH, Layout: the arena canvas stayed at its 720px buffer size on a 1440×900 screen, then collapsed to
   0×0 when sized with container-query units. Fix: `fitArena()` with a ResizeObserver (src/main.ts:63).
   Recheck: e2e asserts arena ≥700px tall at 1440×900 and ≥360px wide at 390; screenshots confirm.
2. MEDIUM, Layout: at 390px the four roster cards cut off names and the range number. Fix: compact
   mobile card (portrait + pips, then bombs and range; names in `aria-label`) (src/style.css:168).
   Recheck: solo-390 screenshot shows all stats.
3. MEDIUM, Typography: the system font stack fell back to a monospace face in the test browser. Fix:
   bundle Nunito locally (src/main.ts:1). Recheck: screenshots, probe type-faces pass.
4. MEDIUM, Layout: at 390 the arena preview sat below the fold. Fix: preview first on narrow screens
   (src/style.css:58). Recheck: e2e asserts Play solo and the preview are on the first 390×844 screen.
5. HIGH, gameplay: bots (and players) pressing a perpendicular direction exactly between two tiles did not
   move, trapping bots on their own bombs. Fix: corner assist slides toward whichever lane is open
   (src/sim/game.ts:193). Recheck: bot escape test 20/20.
6. MEDIUM, gameplay: a new bomb's fuse ticked on its placement tick (2.48 s). Fix: fuses tick before
   placement (src/sim/game.ts:312). Recheck: fuse test.
7. MEDIUM, scoring: overlapping blasts credited eliminations only to the oldest bomb's owner, so a frog
   caught by its own and a rival's blast gave nobody the point. Fix: fire tiles keep every owner and the
   first non-self owner gets the credit (src/sim/game.ts:358). Recheck: simultaneous-draw test.
8. LOW, layout: arena spawn corners only guaranteed an escape from a bomb on a neighbouring tile. Fix:
   wider L corridor and validation from the spawn tile itself (src/sim/arena.ts:21).

### Remaining limitations

- Bot-versus-bot rounds often time out because bots escape each other well; with a human playing, rounds
  usually end sooner. Normal bots hunt harder as the round goes on.
- Rendered checks were done with headless Chromium only. Physical touch, Safari, Firefox and assistive
  technology are untested.

## Completion

Complete for the stated scope, with the untested items listed above. Hosting (CID/ENS) is outside this
repository's work and was not performed.
