import { COLS, ROWS, Tile, SPAWNS, CRATE_DENSITY, POWERUP_CHANCE, PowerKind } from './constants';
import type { Rng } from './rng';

export const idx = (x: number, y: number) => y * COLS + x;
export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS;

export interface Arena {
  tiles: Tile[];
  hidden: Map<number, PowerKind>; // power-ups waiting under crates
}

/** Tiles kept free around each corner spawn: the spawn plus an L-shaped escape corridor. */
export function spawnClearTiles(): Set<number> {
  const s = new Set<number>();
  for (const [sx, sy] of SPAWNS) {
    const dx = sx === 1 ? 1 : -1;
    const dy = sy === 1 ? 1 : -1;
    s.add(idx(sx, sy));
    s.add(idx(sx + dx, sy));
    s.add(idx(sx, sy + dy));
    // Escape corridor: two tiles down the column and one step round the corner, so a
    // bomb dropped on the spawn tile itself can always be outrun.
    s.add(idx(sx, sy + 2 * dy));
    s.add(idx(sx + dx, sy + 2 * dy));
  }
  return s;
}

export function baseTile(x: number, y: number): Tile {
  if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) return Tile.Wall;
  if (x % 2 === 0 && y % 2 === 0) return Tile.Pillar;
  return Tile.Floor;
}

export function generateArena(rng: Rng): Arena {
  for (let attempt = 0; attempt < 50; attempt++) {
    const arena = tryGenerate(rng);
    if (validateArena(arena.tiles)) return arena;
  }
  // Fallback that always validates: crates on every tile outside the spawn corridors.
  const clear = spawnClearTiles();
  const tiles: Tile[] = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const t = baseTile(x, y);
      tiles.push(t === Tile.Floor && !clear.has(idx(x, y)) ? Tile.Crate : t);
    }
  }
  return { tiles, hidden: new Map() };
}

function tryGenerate(rng: Rng): Arena {
  const clear = spawnClearTiles();
  const tiles: Tile[] = [];
  const hidden = new Map<number, PowerKind>();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      let t = baseTile(x, y);
      if (t === Tile.Floor && !clear.has(idx(x, y)) && rng() < CRATE_DENSITY) {
        t = Tile.Crate;
        if (rng() < POWERUP_CHANCE) {
          const r = rng();
          hidden.set(idx(x, y), r < 0.38 ? 'bomb' : r < 0.76 ? 'fire' : 'speed');
        }
      }
      tiles.push(t);
    }
  }
  return { tiles, hidden };
}

/**
 * A layout is playable when:
 *  - every spawn tile and its corridor are floor,
 *  - a bomb dropped on a spawn tile leaves a reachable tile outside its blast
 *    (range 2), so the opening move is always survivable,
 *  - every non-solid tile is connected once crates are removed (no sealed rooms),
 *  - spawns are separated by at least one crate or wall (no open line of sight
 *    between corners at round start).
 */
export function validateArena(tiles: Tile[]): boolean {
  const open = (i: number) => tiles[i] === Tile.Floor;
  for (const [sx, sy] of SPAWNS) {
    if (!open(idx(sx, sy))) return false;
    const pocket = flood(tiles, sx, sy, (t) => t === Tile.Floor);
    if (pocket.size < 5) return false;
    const blast = blastTiles(tiles, sx, sy, 2);
    let escapable = false;
    for (const p of pocket) if (!blast.has(p)) escapable = true;
    if (!escapable) return false;
    // Separated: no other spawn inside this pocket.
    for (const [ox, oy] of SPAWNS) if ((ox !== sx || oy !== sy) && pocket.has(idx(ox, oy))) return false;
  }
  const all = flood(tiles, SPAWNS[0][0], SPAWNS[0][1], (t) => t === Tile.Floor || t === Tile.Crate);
  let walkable = 0;
  for (const t of tiles) if (t === Tile.Floor || t === Tile.Crate) walkable++;
  return all.size === walkable;
}

export function flood(tiles: Tile[], sx: number, sy: number, pass: (t: Tile) => boolean): Set<number> {
  const seen = new Set<number>([idx(sx, sy)]);
  const q: number[] = [idx(sx, sy)];
  while (q.length) {
    const c = q.shift()!;
    const x = c % COLS;
    const y = Math.floor(c / COLS);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const n = idx(nx, ny);
      if (seen.has(n) || !pass(tiles[n])) continue;
      seen.add(n);
      q.push(n);
    }
  }
  return seen;
}

/** Tiles covered by a blast against a static tile map (crates stop a ray and are included). */
export function blastTiles(tiles: Tile[], bx: number, by: number, range: number): Set<number> {
  const out = new Set<number>([idx(bx, by)]);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let r = 1; r <= range; r++) {
      const x = bx + dx * r;
      const y = by + dy * r;
      if (!inBounds(x, y)) break;
      const t = tiles[idx(x, y)];
      if (t === Tile.Wall || t === Tile.Pillar) break;
      out.add(idx(x, y));
      if (t === Tile.Crate) break;
    }
  }
  return out;
}
