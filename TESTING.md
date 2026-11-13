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
| `npm test` (Vitest, 17 tests) | 17/17 passed |
| `npm run build` | exit 0; JS 42.1 kB (15.8 kB gzip), CSS 10.5 kB, fonts 6 files |
| `IMD_PLAYWRIGHT=… node tests/e2e/run.mjs` | 20/20 passed (final run; also 20/20 on three runs before it, after the test-timing fix below) |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | 16/16 checks passed (render, layout, targets, contrast, casing, tracking, eyebrows, type-sizes, type-faces, glyphs, slogans, repetition, copy-budget, chrome, motion, share) |

Unit tests (`tests/unit/sim.test.ts`): layout generation/validation over 300 seeds; capacity and starting
range; step-off-but-not-back bomb occupancy; wall/pillar/crate blocking; 150-tick fuse and 27-tick blast;
first crate breaks and stops the ray; chain reaction keeps each owner's credit; self-elimination scores 0;
simultaneous elimination draw; timeout draw; mirrored player order gives the same result; first to three
plus 25-point round bonus and reset between rounds; upgrade caps; bots escape their own fresh bomb on 20
layouts; six-round bot matches keep rule invariants with under 60% self-eliminations; two bombs exploding
on the same tick give the same fire footprint, deaths and round result when their ids are swapped; a later
blast (the victim's own chained bomb) does not erase a rival's still-burning fire, the rival is credited
+100 once, and each blast's contribution expires on its own tick.

Browser tests (`tests/e2e/run.mjs`, Chromium headless shell from Playwright 1.5x, export served at the
gateway-style subpath `http://game.test/ipfs/bafytest/`):

- PASS manifest is exactly the required object (0 ms)
- PASS cover.svg is 1200x630 with matching viewBox (0 ms)
- PASS index.html uses only relative local asset URLs that exist (1 ms)
- PASS standalone loads at a gateway subpath with no errors, no autoplay (86 ms)
- PASS how to play explains controls and bomb danger (152 ms)
- PASS solo: P1 moves with WASD, bombs once per press, bots move (4523 ms)
- PASS pause freezes fuse, blast and round time; resume has no jump (1426 ms)
- PASS focus loss clears held keys and pauses (484 ms)
- PASS restart clears scores, bombs, timers, inputs; one loop only (471 ms)
- PASS first to three wins, results, standings, rematch (8665 ms)
- PASS draws: simultaneous elimination and timeout award no win (2416 ms)
- PASS no console errors, no external requests, no missing files (0 ms)
- PASS local versus: simultaneous WASD and arrows, Space and Enter (2958 ms)
- PASS desktop and mobile: all 13 rows of the arena fit the viewport without scrolling (5732 ms)
- PASS mobile 390: product and Play solo on the first screen (117 ms)
- PASS mobile: d-pad movement and bomb button together (multitouch), cancel releases (3139 ms)
- PASS iframe sandbox="allow-scripts allow-pointer-lock": runs with storage denied, muted, no autoplay (104 ms)
- PASS bridge: init -> ready with channel; wrong source/protocol/channel ignored; pause/resume (3850 ms)
- PASS bridge: exactly one integer gameover per completed match, none for abandoned (11671 ms)
- PASS bridge: a host pause survives Play, Restart match and Next round until a matching resume (5726 ms)

The solo test failed intermittently once this round ("expected 1 bomb, got 0"). Diagnosis: it read the state
before the next 60 Hz tick (tick 159 before and after the key press, the bomb appearing at tick 160). The test
now waits 120 ms while Space is still held, which keeps the auto-repeat assertion meaningful.

Viewports exercised: 1440×900 desktop, the arena-fit test at 1440×900, 1280×720, 900×700, 390×844 and
320×568 (solo and versus), 390×844 mobile emulation (touch, DPR 2), 1280×900 host page with
the game in `<iframe sandbox="allow-scripts allow-pointer-lock">`. The taste probe also rendered 320, 390
and 1440 wide plus reduced motion.

Not tested: Firefox and Safari/WebKit, physical phones and tablets (touch was emulated with synthetic
pointer events), real speakers/audio output (only the AudioContext state was checked), a screen reader
session, browser-native 200% zoom, and a real Pepe2Pepe host page.

## Better Interface review (six domains)

| Domain | Status | Evidence |
| --- | --- | --- |
| Accessibility | Checked | Native buttons/radios/checkbox/`dialog`; visible `:focus-visible` ring (`--focus`); overlay focus moves to the first action and Tab is trapped (`trapTab`); icon buttons have `aria-label`/`aria-pressed`; round results go to an `aria-live` region; frogs differ by accessory as well as colour; upgrades differ by icon; reduced motion turns off particles, shake, bobbing, bomb pulse and the banner pop; targets ≥44px (probe: targets pass). Not performed: screen reader, native zoom. |
| Layout | Checked | Screenshots at 390 and 1440 (menu, solo, versus, match over, iframe). No horizontal overflow at 320/390/1440 (probe and e2e). The whole 15:13 arena fits inside the viewport at five sizes from 320×568 to 1440×900 (e2e, bounding boxes); the 1440 solo screenshot shows all 13 rows and four frogs. |
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

### Revision: findings from an independent review

Each finding was reproduced on the previously committed export or source before changing anything, then
re-measured after the fix.

9. HIGH, Layout: at 1440×900 the game screen grew to 1305px and the arena ended at y=1297, hiding the
   bottom spawns (also 1280×720 → 1167, 900×700 → 829). Cause: `.screen { flex: 1 }` let content grow
   the game section past `100dvh`, and `fitArena` measured the grown stage. Fix: `.game { flex: none }`
   (src/style.css:93). Recheck: arena bottom 892/712/692 px at those sizes; new e2e arena-fit test.
10. HIGH, bridge: Play solo and Restart match called `pauseReasons.clear()`, dropping a valid host pause
   (reproduced: reasons [] and ticks 7→29 with no resume). Fix: lifecycle actions remove only the user
   reason, and `enterPlay()` shows the host pause overlay when the host reason remains (src/main.ts:144,
   src/main.ts:159, src/main.ts:186). Recheck: e2e host-pause test (menu → Play, P → Restart, round
   result → Next round all stay frozen; wrong-channel resume ignored; matching resume runs).
11. HIGH, simulation: a ray stopped at a bomb not yet processed, so swapping two simultaneous bomb ids
   changed the footprint (x=1..5 vs 1..7) and the round winner. Fix: a bomb in the path is queued and the
   ray carries on to its range (src/sim/game.ts:448), so each footprint depends only on the board. This
   matches the bots' danger map, which already treated bombs as transparent. Recheck: unit test with ids
   swapped.
12. HIGH, scoring: a new blast replaced still-burning fire, so a frog walking into a rival's fire while
   dropping a bomb was scored as a self-elimination (rival 0 points). Fix: fire tiles keep a list of hits
   that expire independently; new blasts merge into it (src/sim/game.ts:69, src/sim/game.ts:291,
   src/sim/game.ts:454), and an elimination goes to the owner of the oldest active rival hit
   (src/sim/game.ts:398). Recheck: unit test, out event `by: 0`, P1 +100 once, P1's hit expires at tick 28 and
   P2's at 29.

### Remaining limitations

- Bot-versus-bot rounds often time out because bots escape each other well; with a human playing, rounds
  usually end sooner. Normal bots hunt harder as the round goes on.
- Rendered checks were done with headless Chromium only. Physical touch, Safari, Firefox and assistive
  technology are untested.

## Completion

Complete for the stated scope, with the untested items listed above. Hosting (CID/ENS) is outside this
repository's work and was not performed.
