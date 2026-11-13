# Frog Blast design system

Source of truth: `src/style.css` (tokens and components), `src/render/draw.ts` (arena palette and
sprites), `src/render/looks.ts` (frog identities). This file describes what the final source implements.

## Overview

A compact arcade game for desktop keyboards and phones. The arena is the product: every screen gives it
the most space it can, and the chrome around it is a quiet dark-teal frame. Warm orange is reserved for
the one thing to do next (Play solo, Rematch, Next round, the Bomb button) and for danger in the arena.
The menu is one column on phones (arena preview, then actions) and two columns from 900px.

## Colors

CSS custom properties in `src/style.css` `:root`:

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#0b2826` | page background |
| `--surface` | `#0e3533` | HUD bar, mode cards, overlay panels, dialog |
| `--surface-2` | `#144643` | roster cards, icon buttons, secondary button, selected segment |
| `--line` | `#24605b` | 2px inset outlines, table rules, HUD bottom border |
| `--text` | `#f2f6ea` | primary text |
| `--text-dim` | `#b9cfc6` | hints, secondary copy, table headers |
| `--accent` / `--accent-hover` | `#ff8a1f` / `#ffa24a` | primary buttons, Bomb button, low-time timer |
| `--accent-ink` | `#231407` | text on accent |
| `--leaf` | `#8fd06b` | checked radio/checkbox, outline of human players' roster cards |
| `--focus` | `#ffd23f` | focus ring, earned round-win pips, match leader row |
| `--danger` | `#ff6b5a` | "out" marker in the roster |
| `--moss` | `#4f8a3a` | canvas placeholder before the first frame |

Arena palette (`C` in `src/render/draw.ts`): moss floor `#4f8a3a`/`#4a8436` with speck colours, pale stone
pillars `#e0dccb` with `#b8b19b`/`#8e8774` shading, dark mossy perimeter `#2f5a4a`, crates `#b9763b` /
`#81501f` / `#dc9d58`, blasts `#ff7a1a` → `#ffb52e` → `#fff0b3`. Upgrade tiles: bomb `#2f6f86`, fire
`#c2412b`, speed `#7b4fc2`, each with a distinct cream icon so colour is never the only cue.

Frogs (`src/render/looks.ts`): Moss (green, red bandana), Lily (blue, gold crown), Sunny (yellow, pink
flower), Ink (purple, sunglasses).

## Typography

One family: **Nunito** (bundled from `@fontsource/nunito`, latin subset, weights 400, 700, 800), falling
back to `ui-rounded, "Segoe UI", system-ui, sans-serif`. Imported at the top of `src/main.ts`.

| Token | Size | Role |
| --- | --- | --- |
| `--fs-1` | 14px | hints, roster names/stats, table headers, round label |
| `--fs-2` | 16px | body, buttons |
| `--fs-3` | 20px | big buttons, timer, dialog subheads, Bomb label |
| `--fs-4` | 28px | overlay and dialog titles |
| `--fs-5` | 40px | the game title, countdown banner |

Weights: 400 body, 700 labels/buttons, 800 title, timer, overlay headings. Numbers that change (timer,
scores, roster stats) use `font-variant-numeric: tabular-nums`. Headings use `text-wrap: balance`.
Letter-spacing is default except the title (`-0.02em`). No all-caps labels.

## Layout

Spacing scale `--sp-1..6` = 4, 8, 12, 16, 24, 32px. Radii `--r-1` 8px (buttons, cards, arena),
`--r-2` 14px (panels, dialog, preview).

- **Menu** (`.menu`): max width 1100px, 16px padding; at ≥900px two columns (actions 320–400px, preview
  fills the rest) with 32px gaps; under 900px one column with the arena preview first (max 440px wide), so
  at 390px the title, the arena and **Play solo** are all on the first screen.
- **Game** (`.game`): exactly one viewport tall (`flex: none; height: 100dvh`, so content cannot grow it)
  column: HUD, stage, touch controls (solo on touch devices only).
  `fitArena()` in `src/main.ts` sizes the arena canvas to the largest 15:13 rectangle the stage allows
  (ResizeObserver), so it never overflows and never scrolls. The canvas has a fixed 720×624 drawing
  buffer (48px per tile).
- **HUD** (`.hud`): one row on desktop (four roster cards, timer, buttons). At ≤720px the timer and
  buttons sit on top and the roster becomes a 4-column grid of compact cards (portrait + win pips, then
  bombs and range); names move to each card's `aria-label`.
- Touch controls: 156px d-pad on the left, 112px Bomb button on the right, safe-area padding at the bottom.

## Elevation & Depth

Mostly flat: tonal layers (`--bg` → `--surface` → `--surface-2`) plus 2px inset outlines. One shadow:
overlay panels (`0 12px 40px rgba(0,0,0,.45)`) over a translucent scrim. The Bomb button has a solid
lower lip (`0 6px 0 #b85a0a`) that compresses when pressed. In the arena, pillars, crates, bombs and frogs
cast a soft dark-green drop shadow.

## Shapes

8px corners on controls and the arena; 14px on panels; circles for the d-pad, Bomb button and win pips.
Pixel-level detail in the arena uses 3px squares (moss specks, crate nails) to read as crisp illustrated
pixel art at 48px tiles.

## Components

- **Buttons** (`.btn` + `.btn-primary` | `.btn-secondary` | `.btn-ghost`, `.btn-big`): 44px min height
  (52px big). Primary = orange; secondary = surface with outline; ghost = transparent with outline. Hover
  lightens; `:active` nudges 1px; focus shows the yellow `--focus` ring.
- **Icon button** (`.icon-btn`): 44×44, SVG icon, `aria-label`; the mute button uses `aria-pressed` and
  swaps sound waves for a cross.
- **Segmented choice** (`.seg`): native radios inside labels, selected segment gets `--leaf` outline.
- **Roster card** (`.fr`, built in `buildRoster()` in `src/main.ts`): portrait canvas, name ("P1 Moss"),
  win pips (`.pip.on`), bombs and blast range with icons. `.human` adds a leaf outline; `.out` dims the
  card and appends "· out".
- **Overlay** (`.overlay` > `.panel[role=dialog]`): pause, round result, match result. Title, one line of
  text, optional standings table (`.standings`, leader row highlighted), action buttons. Focus moves to the
  first action, Tab is trapped inside, buttons ignore clicks in the first 350ms so a held bomb key cannot
  skip a result.
- **How to play** (`dialog.howto`): native `<dialog>` (Escape closes, focus returns), controls as a
  definition list with `kbd` keys, rules as lists.
- **Touch controls** (`.dpad`, `.bomb-btn`): pointer-captured d-pad that follows the finger between
  directions, separate pointer for the Bomb button; release, cancel and lost capture all stop movement.

## Do's and Don'ts

- Do keep orange for the single primary action per view and for danger; everything else is teal.
- Do size new tiles/sprites on the 48px tile grid in `draw.ts` and give any new contestant both a colour
  and an accessory.
- Do use the `--fs-*` tokens; the scale has five sizes and should not grow past six.
- Don't put text over the arena except the short countdown banner; results go in the overlay panel.
- Don't add borders and shadows to the same surface; use tonal layers or a 2px inset outline.
- Recipe for a new screen: a `.screen` section, content in `.mode`/`.panel` surfaces, actions as `.btn`
  with one `.btn-primary`, hint text in `.hint`, and focus the primary action when it opens.

## Motion

Frog hop bob, squash on bomb drop, pickup pulse, scared eyes when a rival falls, a victory jump, bomb
pulse that speeds up and flashes red in the last quarter of its fuse, short blast grow/shrink, crate
splinters and smoke (capped at 120 particles), and a small screen shake. With `prefers-reduced-motion:
reduce`, particles, shake, hop/bob, bomb pulse and the banner pop are off; state changes stay visible
(fuse length, red flash, flattened frog, overlays).
