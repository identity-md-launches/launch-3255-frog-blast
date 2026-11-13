import {
  COLS, ROWS, Tile, Dir, DIR_VEC, PowerKind, SPAWNS, DT,
  FUSE_TICKS, BLAST_TICKS, ROUND_TICKS, COUNTDOWN_TICKS, ROUND_END_TICKS, WINS_TO_MATCH,
  START_BOMBS, START_RANGE, MAX_BOMBS, MAX_RANGE, BASE_SPEED, SPEED_STEP, MAX_SPEED_LEVEL,
  SCORE_KILL, SCORE_CRATE, SCORE_ROUND,
} from './constants';
import { generateArena, idx, inBounds } from './arena';
import { makeRng, type Rng } from './rng';

export type Controller = 'p1' | 'p2' | 'bot';
export type Difficulty = 'easy' | 'normal';

export interface PlayerSetup {
  name: string;
  controller: Controller;
  look: number; // index into the frog palette/accessory table
}

export interface Player {
  id: number;
  name: string;
  controller: Controller;
  look: number;
  x: number; // tile-centre coordinates: tile (i, j) has centre (i, j)
  y: number;
  facing: Dir;
  moving: boolean;
  alive: boolean;
  bombCap: number;
  range: number;
  speedLevel: number;
  passBombs: number[]; // bomb ids this player may still overlap
  score: number;
  roundWins: number;
  kills: number;
  crates: number;
  outTick: number; // tick of elimination, -1 when alive
  reactTick: number; // last tick something happened to this frog (for animation)
  reaction: '' | 'pickup' | 'bomb' | 'win' | 'scared';
}

export interface Bomb {
  id: number;
  owner: number;
  x: number;
  y: number;
  fuse: number; // ticks left
  range: number;
  placedTick: number;
}

/** One bomb's damaging blast on a tile. Each lasts BLAST_TICKS from its own detonation. */
export interface FireHit {
  owner: number;
  bombId: number;
  until: number; // last damaging tick (exclusive)
}

export interface Fire {
  until: number; // latest `until` of the active hits (exclusive)
  start: number; // tick of the most recent blast on this tile (animation)
  owner: number; // owner of the oldest active hit (lowest bomb id)
  owners: number[]; // owners of every active hit, oldest bomb first
  bombId: number; // oldest active hit
  hits: FireHit[]; // every still-damaging blast on this tile, sorted by bomb id
  kind: 'center' | 'h' | 'v' | 'end';
}

function syncFire(f: Fire) {
  f.hits.sort((a, b) => a.bombId - b.bombId);
  f.until = Math.max(...f.hits.map((h) => h.until));
  f.owner = f.hits[0].owner;
  f.bombId = f.hits[0].bombId;
  f.owners = [];
  for (const h of f.hits) if (!f.owners.includes(h.owner)) f.owners.push(h.owner);
}

export interface PlayerInput {
  dir: Dir;
  bomb: boolean; // edge: true only on the tick the button was pressed
}

export type GameEvent =
  | { type: 'place'; x: number; y: number; owner: number }
  | { type: 'explode'; x: number; y: number; count: number }
  | { type: 'crate'; x: number; y: number }
  | { type: 'pickup'; player: number; kind: PowerKind }
  | { type: 'out'; player: number; by: number }
  | { type: 'go' }
  | { type: 'countdown'; n: number }
  | { type: 'roundEnd'; winner: number | null }
  | { type: 'matchEnd'; winner: number };

export type Phase = 'countdown' | 'playing' | 'roundEnd' | 'roundResult' | 'matchOver';

export interface RoundResult {
  round: number;
  winner: number | null; // null = draw
  reason: 'survivor' | 'allOut' | 'timeout';
}

export interface MatchConfig {
  players: PlayerSetup[];
  difficulty: Difficulty;
  seed: number;
}

export interface Game {
  cfg: MatchConfig;
  rng: Rng;
  tiles: Tile[];
  hidden: Map<number, PowerKind>;
  powerups: Map<number, PowerKind>;
  bombs: Bomb[];
  fire: Map<number, Fire>;
  burning: Map<number, number>; // crate tile -> tick it was broken (for animation)
  players: Player[];
  phase: Phase;
  tick: number; // total ticks of the match
  phaseTick: number; // ticks spent in the current phase
  roundTick: number; // ticks of active play this round
  round: number;
  results: RoundResult[];
  matchWinner: number | null;
  nextBombId: number;
  events: GameEvent[];
}

export function createGame(cfg: MatchConfig): Game {
  const rng = makeRng(cfg.seed);
  const players: Player[] = cfg.players.map((p, i) => ({
    id: i, name: p.name, controller: p.controller, look: p.look,
    x: SPAWNS[i][0], y: SPAWNS[i][1], facing: Dir.Down, moving: false, alive: true,
    bombCap: START_BOMBS, range: START_RANGE, speedLevel: 0, passBombs: [],
    score: 0, roundWins: 0, kills: 0, crates: 0, outTick: -1, reactTick: -100, reaction: '',
  }));
  const g: Game = {
    cfg, rng, tiles: [], hidden: new Map(), powerups: new Map(), bombs: [], fire: new Map(),
    burning: new Map(), players, phase: 'countdown', tick: 0, phaseTick: 0, roundTick: 0, round: 0,
    results: [], matchWinner: null, nextBombId: 1, events: [],
  };
  startRound(g);
  return g;
}

export function startRound(g: Game) {
  const arena = generateArena(g.rng);
  g.tiles = arena.tiles;
  g.hidden = arena.hidden;
  g.powerups = new Map();
  g.bombs = [];
  g.fire = new Map();
  g.burning = new Map();
  g.round += 1;
  g.roundTick = 0;
  g.phase = 'countdown';
  g.phaseTick = 0;
  g.players.forEach((p, i) => {
    p.x = SPAWNS[i][0];
    p.y = SPAWNS[i][1];
    p.facing = Dir.Down;
    p.moving = false;
    p.alive = true;
    p.bombCap = START_BOMBS;
    p.range = START_RANGE;
    p.speedLevel = 0;
    p.passBombs = [];
    p.outTick = -1;
    p.reaction = '';
  });
}

export const speedOf = (p: Player) => BASE_SPEED + p.speedLevel * SPEED_STEP;
export const tileOf = (v: number) => Math.round(v);
export const roundSecondsLeft = (g: Game) => Math.max(0, (ROUND_TICKS - g.roundTick) / 60);

export function bombAt(g: Game, x: number, y: number): Bomb | undefined {
  for (const b of g.bombs) if (b.x === x && b.y === y) return b;
  return undefined;
}

/** Can player p enter tile (x, y)? Solid tiles, crates and bombs block, except bombs p is still standing on. */
export function blocked(g: Game, p: Player, x: number, y: number): boolean {
  if (!inBounds(x, y)) return true;
  const t = g.tiles[idx(x, y)];
  if (t !== Tile.Floor) return true;
  const b = bombAt(g, x, y);
  return !!b && !p.passBombs.includes(b.id);
}

const EPS = 1e-6;
const ASSIST = 0.18; // minimum offset at which a frog slides toward the farther open lane

function movePlayer(g: Game, p: Player, dir: Dir) {
  p.moving = false;
  if (dir === Dir.None) return;
  p.facing = dir;
  let step = speedOf(p) * DT;
  const [dx, dy] = DIR_VEC[dir];
  const horizontal = dx !== 0;
  // Axis we travel along (a) and the cross axis (c).
  let a = horizontal ? p.x : p.y;
  let c = horizontal ? p.y : p.x;
  const s = horizontal ? dx : dy;
  let lane = Math.round(c);
  const cellA = Math.round(a);
  const at = (av: number, cv: number) => (horizontal ? blocked(g, p, av, cv) : blocked(g, p, cv, av));

  if (Math.abs(c - lane) > EPS) {
    // Off-lane (between two rows/columns). Corner assist: slide toward the nearest
    // lane whose way ahead is open, or toward the other lane when only that one is.
    const open = (l: number) => !at(cellA + s, l) && !at(cellA, l);
    const other = lane + Math.sign(c - lane);
    if (open(lane)) { /* nearest lane */ }
    else if (Math.abs(c - lane) >= ASSIST && open(other)) lane = other;
    else return;
    const off = c - lane;
    const d = Math.min(step, Math.abs(off));
    c -= Math.sign(off) * d;
    step -= d;
    p.moving = true;
    p.facing = horizontal ? (off > 0 ? Dir.Up : Dir.Down) : (off > 0 ? Dir.Left : Dir.Right);
    if (Math.abs(c - lane) < EPS) { c = lane; p.facing = dir; }
  }
  if (step > EPS && Math.abs(c - Math.round(c)) < EPS) {
    const cell = Math.round(a);
    let na = a + s * step;
    // Past the centre of our cell heading toward the next one: next one must be open.
    if (at(cell + s, lane)) {
      if ((na - cell) * s > 0) na = (a - cell) * s > 0 ? a : cell;
    } else {
      // Entering the next cell: if we move past its centre, the one after must be open too.
      const nextCell = cell + s;
      if ((na - nextCell) * s > 0 && at(nextCell + s, lane)) na = nextCell;
    }
    if (Math.abs(na - a) > EPS) p.moving = true;
    a = na;
  }
  if (horizontal) { p.x = a; p.y = c; } else { p.y = a; p.x = c; }
}

function overlapsTile(p: Player, x: number, y: number) {
  return Math.abs(p.x - x) < 0.999 && Math.abs(p.y - y) < 0.999;
}

function activeBombs(g: Game, owner: number) {
  let n = 0;
  for (const b of g.bombs) if (b.owner === owner) n++;
  return n;
}

/** Advance the match by one fixed tick. `inputs[i]` belongs to player i. */
export function step(g: Game, inputs: PlayerInput[]) {
  g.events = [];
  g.tick++;
  g.phaseTick++;
  switch (g.phase) {
    case 'countdown': {
      const before = Math.ceil((COUNTDOWN_TICKS - g.phaseTick + 1) / 60);
      const after = Math.ceil((COUNTDOWN_TICKS - g.phaseTick) / 60);
      if (after !== before && after > 0) g.events.push({ type: 'countdown', n: after });
      if (g.phaseTick >= COUNTDOWN_TICKS) {
        g.phase = 'playing';
        g.phaseTick = 0;
        g.events.push({ type: 'go' });
      }
      return;
    }
    case 'playing':
      playTick(g, inputs);
      return;
    case 'roundEnd':
      // Effects keep animating briefly; nothing can be scored any more.
      expireFire(g);
      if (g.phaseTick >= ROUND_END_TICKS) {
        g.phase = g.matchWinner !== null ? 'matchOver' : 'roundResult';
        g.phaseTick = 0;
        if (g.matchWinner !== null) g.events.push({ type: 'matchEnd', winner: g.matchWinner });
      }
      return;
    default:
      return; // roundResult / matchOver wait for the UI
  }
}

/** Called by the UI when the player confirms the round result. */
export function nextRound(g: Game) {
  if (g.phase === 'roundResult') startRound(g);
}

function expireFire(g: Game) {
  // Each blast expires on its own schedule; a later blast on the same tile never
  // erases an earlier owner's still-damaging contribution.
  for (const [k, f] of g.fire) {
    const live = f.hits.filter((h) => g.tick < h.until);
    if (!live.length) { g.fire.delete(k); continue; }
    if (live.length !== f.hits.length) { f.hits = live; syncFire(f); }
  }
  for (const [k, t] of g.burning) if (g.tick - t > BLAST_TICKS) g.burning.delete(k);
}

function playTick(g: Game, inputs: PlayerInput[]) {
  g.roundTick++;
  expireFire(g);

  // 1. Movement: every frog moves against the same start-of-tick world. Frogs never
  //    block each other, so the order does not matter.
  for (const p of g.players) {
    if (!p.alive) continue;
    movePlayer(g, p, inputs[p.id]?.dir ?? Dir.None);
  }
  // Drop pass-through rights for bombs a frog has fully stepped off.
  for (const p of g.players) {
    p.passBombs = p.passBombs.filter((id) => {
      const b = g.bombs.find((bb) => bb.id === id);
      return !!b && overlapsTile(p, b.x, b.y);
    });
  }

  // 2. Pick-ups.
  for (const p of g.players) {
    if (!p.alive) continue;
    const k = idx(tileOf(p.x), tileOf(p.y));
    const kind = g.powerups.get(k);
    if (!kind) continue;
    g.powerups.delete(k);
    if (kind === 'bomb') p.bombCap = Math.min(MAX_BOMBS, p.bombCap + 1);
    if (kind === 'fire') p.range = Math.min(MAX_RANGE, p.range + 1);
    if (kind === 'speed') p.speedLevel = Math.min(MAX_SPEED_LEVEL, p.speedLevel + 1);
    p.reaction = 'pickup';
    p.reactTick = g.tick;
    g.events.push({ type: 'pickup', player: p.id, kind });
  }

  // 3. Fuses tick for bombs already on the board (a new bomb gets its full 2.5 s).
  for (const b of g.bombs) b.fuse--;

  // 4. Bomb placement. Requests are gathered first; two frogs asking for the same
  //    tile on the same tick both fail so update order cannot pick a winner.
  const requests = new Map<number, Player[]>();
  for (const p of g.players) {
    if (!p.alive || !inputs[p.id]?.bomb) continue;
    const tx = tileOf(p.x);
    const ty = tileOf(p.y);
    if (bombAt(g, tx, ty) || activeBombs(g, p.id) >= p.bombCap) continue;
    const k = idx(tx, ty);
    requests.set(k, [...(requests.get(k) ?? []), p]);
  }
  for (const [k, ps] of requests) {
    if (ps.length !== 1) continue;
    const p = ps[0];
    const b: Bomb = {
      id: g.nextBombId++, owner: p.id, x: k % COLS, y: Math.floor(k / COLS),
      fuse: FUSE_TICKS, range: p.range, placedTick: g.tick,
    };
    g.bombs.push(b);
    for (const q of g.players) if (q.alive && overlapsTile(q, b.x, b.y)) q.passBombs.push(b.id);
    p.reaction = 'bomb';
    p.reactTick = g.tick;
    g.events.push({ type: 'place', x: b.x, y: b.y, owner: p.id });
  }

  // 5. Detonations and chain reactions.
  const triggered = g.bombs.filter((b) => b.fuse <= 0 || g.fire.has(idx(b.x, b.y)));
  if (triggered.length) detonate(g, triggered);

  // 6. Damage: everyone standing in fire this tick is eliminated together.
  const out: { p: Player; f: Fire }[] = [];
  for (const p of g.players) {
    if (!p.alive) continue;
    const f = g.fire.get(idx(tileOf(p.x), tileOf(p.y)));
    if (f) out.push({ p, f });
  }
  for (const { p, f } of out) {
    p.alive = false;
    p.outTick = g.tick;
    p.passBombs = [];
    g.events.push({ type: 'out', player: p.id, by: killerOf(f, p.id) ?? p.id });
  }
  for (const { p, f } of out) {
    // Credit one opponent per elimination (owner of the oldest active opposing blast);
    // a frog caught only by its own blast earns nothing.
    const killer = killerOf(f, p.id);
    if (killer !== undefined) {
      g.players[killer].score += SCORE_KILL;
      g.players[killer].kills++;
    }
  }
  for (const p of g.players) if (p.alive && out.length && p.reaction !== 'pickup') { p.reaction = 'scared'; p.reactTick = g.tick; }

  // 7. Round end.
  const alive = g.players.filter((p) => p.alive);
  if (alive.length <= 1) endRound(g, alive.length === 1 ? alive[0].id : null, alive.length === 1 ? 'survivor' : 'allOut');
  else if (g.roundTick >= ROUND_TICKS) endRound(g, null, 'timeout');
}

/** Opponent credited for an elimination: every hit left on the tile is still active. */
function killerOf(f: Fire, victim: number): number | undefined {
  return f.hits.find((h) => h.owner !== victim)?.owner;
}

/**
 * Explode a set of bombs and everything they set off this tick. Rays are traced
 * against the crate layout at the start of the tick, so a crate always stops the
 * ray that reaches it first, and a crate hit by several rays breaks once and is
 * credited to one owner (the oldest bomb, deterministically). A bomb in a ray's
 * path is set off but does not stop the ray, so every bomb's footprint depends
 * only on the board, never on the order the chain is processed in.
 */
function detonate(g: Game, initial: Bomb[]) {
  const queue = [...initial].sort((a, b) => a.id - b.id);
  const done = new Set<number>();
  const crateOwner = new Map<number, Bomb>();
  const newFire = new Map<number, { hits: FireHit[]; kind: Fire['kind'] }>();
  const until = g.tick + BLAST_TICKS;
  const putFire = (k: number, b: Bomb, kind: Fire['kind']) => {
    const prev = newFire.get(k);
    const hit = { owner: b.owner, bombId: b.id, until };
    if (prev) {
      prev.hits.push(hit);
      if (prev.kind !== kind) prev.kind = 'center';
      return;
    }
    newFire.set(k, { hits: [hit], kind });
  };
  while (queue.length) {
    queue.sort((a, b) => a.id - b.id);
    const b = queue.shift()!;
    if (done.has(b.id)) continue;
    done.add(b.id);
    putFire(idx(b.x, b.y), b, 'center');
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let r = 1; r <= b.range; r++) {
        const x = b.x + dx * r;
        const y = b.y + dy * r;
        if (!inBounds(x, y)) break;
        const k = idx(x, y);
        const t = g.tiles[k];
        if (t === Tile.Wall || t === Tile.Pillar) break;
        if (t === Tile.Crate) {
          const prev = crateOwner.get(k);
          if (!prev || prev.id > b.id) crateOwner.set(k, b);
          putFire(k, b, 'end');
          break;
        }
        putFire(k, b, r === b.range ? 'end' : dx ? 'h' : 'v');
        const other = bombAt(g, x, y);
        if (other && !done.has(other.id)) queue.push(other); // chain: keeps its own owner; the ray carries on
        g.powerups.delete(k); // exposed upgrades burn
      }
    }
  }
  g.bombs = g.bombs.filter((b) => !done.has(b.id));
  // Merge with fire still burning from earlier ticks instead of replacing it.
  for (const [k, n] of newFire) {
    const prev = g.fire.get(k);
    if (prev) {
      prev.hits.push(...n.hits);
      prev.start = g.tick;
      if (prev.kind !== n.kind) prev.kind = 'center';
      syncFire(prev);
    } else {
      const f: Fire = { until, start: g.tick, owner: 0, owners: [], bombId: 0, hits: n.hits, kind: n.kind };
      syncFire(f);
      g.fire.set(k, f);
    }
  }
  for (const [k, b] of crateOwner) {
    g.tiles[k] = Tile.Floor;
    g.burning.set(k, g.tick);
    g.players[b.owner].score += SCORE_CRATE;
    g.players[b.owner].crates++;
    const kind = g.hidden.get(k);
    if (kind) { g.hidden.delete(k); g.powerups.set(k, kind); }
    g.events.push({ type: 'crate', x: k % COLS, y: Math.floor(k / COLS) });
  }
  const first = initial[0];
  g.events.push({ type: 'explode', x: first.x, y: first.y, count: done.size });
}

function endRound(g: Game, winner: number | null, reason: RoundResult['reason']) {
  g.results.push({ round: g.round, winner, reason });
  if (winner !== null) {
    const w = g.players[winner];
    w.roundWins++;
    w.score += SCORE_ROUND;
    w.reaction = 'win';
    w.reactTick = g.tick;
    if (w.roundWins >= WINS_TO_MATCH) g.matchWinner = winner;
  }
  g.phase = 'roundEnd';
  g.phaseTick = 0;
  g.events.push({ type: 'roundEnd', winner });
}

export { ROWS, COLS };
