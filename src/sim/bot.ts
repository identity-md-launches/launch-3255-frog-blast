import { COLS, ROWS, Tile, Dir, BLAST_TICKS } from './constants';
import { blastTiles, idx, inBounds } from './arena';
import { type Game, type Player, type PlayerInput, type Bomb, bombAt, speedOf, tileOf } from './game';

/**
 * Bots read the same world as humans and answer with the same PlayerInput a
 * keyboard produces, so they obey movement, bomb-capacity and damage rules.
 */
export interface BotBrain {
  path: number[];
  nextThink: number;
  wantBomb: boolean;
}

export const newBrain = (): BotBrain => ({ path: [], nextThink: 0, wantBomb: false });

const NEVER = Number.POSITIVE_INFINITY;
const N4: ReadonlyArray<[number, number, Dir]> = [[0, -1, Dir.Up], [0, 1, Dir.Down], [-1, 0, Dir.Left], [1, 0, Dir.Right]];

/** Ticks from now until each tile is on fire (0 = burning now). Chain reactions included. */
export function dangerMap(g: Game, extra?: Bomb): number[] {
  const danger = new Array<number>(COLS * ROWS).fill(NEVER);
  const bombs = extra ? [...g.bombs, extra] : g.bombs;
  const when = bombs.map((b) => Math.max(0, b.fuse));
  const cover = bombs.map((b) => blastTiles(g.tiles, b.x, b.y, b.range));
  for (const [k] of g.fire) {
    bombs.forEach((b, i) => { if (idx(b.x, b.y) === k) when[i] = 0; });
  }
  let changed = true;
  while (changed) {
    changed = false;
    bombs.forEach((b, i) => {
      bombs.forEach((o, j) => {
        if (i !== j && when[j] > when[i] && cover[i].has(idx(o.x, o.y))) { when[j] = when[i]; changed = true; }
      });
      void b;
    });
  }
  bombs.forEach((_, i) => { for (const k of cover[i]) danger[k] = Math.min(danger[k], when[i]); });
  for (const [k, f] of g.fire) if (f.until > g.tick) danger[k] = 0;
  return danger;
}

/** Remaining ticks a tile stays burning when its fire starts at `start` ticks from now. */
const burnEnd = (g: Game, k: number, start: number) => {
  const f = g.fire.get(k);
  if (start === 0 && f) return f.until - g.tick;
  return start + BLAST_TICKS;
};

interface Reach { dist: Map<number, number>; prev: Map<number, number> }

function reach(g: Game, p: Player, danger: number[], extraBomb?: Bomb): Reach {
  const stepTicks = 60 / speedOf(p);
  const start = idx(tileOf(p.x), tileOf(p.y));
  const dist = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, number>();
  const q = [start];
  while (q.length) {
    const c = q.shift()!;
    const cx = c % COLS;
    const cy = Math.floor(c / COLS);
    const d = dist.get(c)!;
    for (const [dx, dy] of N4) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny)) continue;
      const n = idx(nx, ny);
      if (dist.has(n) || g.tiles[n] !== Tile.Floor) continue;
      if (bombAt(g, nx, ny) || (extraBomb && extraBomb.x === nx && extraBomb.y === ny)) continue;
      const arrive = (d + 1) * stepTicks;
      const dz = danger[n];
      // Would we be inside this tile while it burns?
      if (dz !== NEVER && dz <= arrive + stepTicks && burnEnd(g, n, dz) >= arrive - stepTicks * 0.6) continue;
      dist.set(n, d + 1);
      prev.set(n, c);
      q.push(n);
    }
  }
  return { dist, prev };
}

function pathTo(r: Reach, target: number): number[] {
  const out: number[] = [];
  let c = target;
  while (r.prev.has(c)) { out.unshift(c); c = r.prev.get(c)!; }
  return out;
}

function nearestSafe(r: Reach, danger: number[]): number | null {
  let best: number | null = null;
  let bd = NEVER;
  for (const [k, d] of r.dist) if (danger[k] === NEVER && d < bd) { bd = d; best = k; }
  return best;
}

/** How valuable is a bomb at tile k: crates it would break and opponents in its lines. */
function bombValue(g: Game, p: Player, k: number): number {
  const x = k % COLS;
  const y = Math.floor(k / COLS);
  const cov = blastTiles(g.tiles, x, y, p.range);
  let v = 0;
  for (const t of cov) if (g.tiles[t] === Tile.Crate) v += 1;
  for (const o of g.players) {
    if (o.id === p.id || !o.alive) continue;
    if (cov.has(idx(tileOf(o.x), tileOf(o.y)))) v += 3;
  }
  return v;
}

export function botInput(g: Game, p: Player, brain: BotBrain): PlayerInput {
  const none: PlayerInput = { dir: Dir.None, bomb: false };
  if (g.phase !== 'playing' || !p.alive) { brain.path = []; return none; }
  const easy = g.cfg.difficulty === 'easy';
  const here = idx(tileOf(p.x), tileOf(p.y));
  const danger = dangerMap(g);
  const inDanger = danger[here] !== NEVER;

  const centred = Math.abs(p.x - tileOf(p.x)) < 0.12 && Math.abs(p.y - tileOf(p.y)) < 0.12;
  if (g.tick >= brain.nextThink && (centred || brain.path.length === 0 || inDanger)) {
    brain.nextThink = g.tick + (easy ? 16 : 6) + Math.floor(g.rng() * (easy ? 14 : 5));
    think(g, p, brain, danger, here, inDanger, easy);
  }

  // Drop reached waypoints.
  while (brain.path.length && brain.path[0] === here &&
    Math.abs(p.x - tileOf(p.x)) < 0.1 && Math.abs(p.y - tileOf(p.y)) < 0.1) brain.path.shift();

  let bomb = false;
  if (brain.wantBomb) { bomb = true; brain.wantBomb = false; }
  if (!brain.path.length) {
    // Recentre on the current tile so the next turn is clean.
    return { dir: recentre(p), bomb };
  }
  const n = brain.path[0];
  const nx = n % COLS;
  const ny = Math.floor(n / COLS);
  const hx = tileOf(p.x);
  const hy = tileOf(p.y);
  // Never walk into a tile that is about to burn unless we are fleeing through it.
  if (!inDanger && danger[n] !== NEVER && danger[n] < 40) { brain.path = []; return { dir: recentre(p), bomb }; }
  let dir = Dir.None;
  if (nx > hx) dir = Dir.Right; else if (nx < hx) dir = Dir.Left;
  else if (ny > hy) dir = Dir.Down; else if (ny < hy) dir = Dir.Up;
  else dir = recentre(p);
  return { dir, bomb };
}

function recentre(p: Player): Dir {
  const ox = p.x - tileOf(p.x);
  const oy = p.y - tileOf(p.y);
  if (Math.abs(ox) > 0.05) return ox > 0 ? Dir.Left : Dir.Right;
  if (Math.abs(oy) > 0.05) return oy > 0 ? Dir.Up : Dir.Down;
  return Dir.None;
}

function think(g: Game, p: Player, brain: BotBrain, danger: number[], here: number, inDanger: boolean, easy: boolean) {
  const r = reach(g, p, danger);
  if (inDanger) {
    const safe = nearestSafe(r, danger);
    if (safe !== null) brain.path = pathTo(r, safe);
    else {
      // No fully safe tile: pick the reachable tile that burns last.
      let best = here;
      for (const [k] of r.dist) if (danger[k] > danger[best]) best = k;
      brain.path = pathTo(r, best);
    }
    return;
  }

  const active = g.bombs.filter((b) => b.owner === p.id).length;
  const value = bombValue(g, p, here);
  const urge = easy ? 0.45 : 0.9;
  if (active < p.bombCap && value > 0 && g.rng() < urge) {
    const hx = here % COLS;
    const hy = Math.floor(here / COLS);
    const hypo: Bomb = { id: -1, owner: p.id, x: hx, y: hy, fuse: 150, range: p.range, placedTick: g.tick };
    const d2 = dangerMap(g, hypo);
    const r2 = reach(g, p, d2, hypo);
    const safe = nearestSafe(r2, d2);
    // Easy bots need a comfortable margin, normal bots accept tighter escapes.
    if (safe !== null && r2.dist.get(safe)! <= (easy ? 4 : 6)) {
      brain.wantBomb = true;
      brain.path = pathTo(r2, safe);
      return;
    }
  }

  // Choose a goal among safe reachable tiles.
  let best: number | null = null;
  let bestScore = -NEVER;
  for (const [k, d] of r.dist) {
    if (danger[k] !== NEVER) continue;
    let s = -d * (easy ? 0.6 : 0.45);
    const pu = g.powerups.get(k);
    if (pu) s += easy ? 4 : 7;
    const v = bombValue(g, p, k);
    s += Math.min(v, 4) * (easy ? 1.2 : 1.6);
    // Hunting pressure grows as the round goes on so rounds rarely time out.
    const hunt = (easy ? 0.25 : 0.5) * (1 + g.roundTick / 1800);
    for (const o of g.players) {
      if (o.id === p.id || !o.alive) continue;
      const od = Math.abs(tileOf(o.x) - (k % COLS)) + Math.abs(tileOf(o.y) - Math.floor(k / COLS));
      s += Math.max(0, 9 - od) * hunt * 0.4;
    }
    s += g.rng() * (easy ? 2.5 : 0.8);
    if (s > bestScore) { bestScore = s; best = k; }
  }
  brain.path = best !== null && best !== here ? pathTo(r, best) : [];
}
