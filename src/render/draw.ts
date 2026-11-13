import { COLS, ROWS, Tile, Dir, FUSE_TICKS, BLAST_TICKS, type PowerKind } from '../sim/constants';
import { idx } from '../sim/arena';
import type { Game, Player } from '../sim/game';
import { LOOKS } from './looks';

export const TS = 48; // canvas pixels per tile
export const CANVAS_W = COLS * TS;
export const CANVAS_H = ROWS * TS;

const C = {
  floor: '#4f8a3a',
  floorAlt: '#4a8436',
  moss1: '#5f9c46',
  moss2: '#3f7430',
  stone: '#e0dccb',
  stoneSide: '#b8b19b',
  stoneDark: '#8e8774',
  stoneHi: '#f6f3e8',
  wall: '#2f5a4a',
  wallTop: '#3d6e5a',
  wallHi: '#4f8670',
  wood: '#b9763b',
  woodDark: '#81501f',
  woodHi: '#dc9d58',
  ink: '#1d2b2a',
  fire1: '#ff7a1a',
  fire2: '#ffb52e',
  fire3: '#fff0b3',
};

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return h;
}

/** Static tiles are painted once per layout into an offscreen canvas. */
export function paintBoard(tiles: Tile[], target?: HTMLCanvasElement): HTMLCanvasElement {
  const cv = target ?? document.createElement('canvas');
  cv.width = CANVAS_W;
  cv.height = CANVAS_H;
  const c = cv.getContext('2d')!;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const t = tiles[idx(x, y)];
      if (t === Tile.Wall) drawWall(c, x, y);
      else {
        drawFloor(c, x, y);
        if (t === Tile.Pillar) drawPillar(c, x, y);
      }
    }
  }
  return cv;
}

export function drawFloor(c: CanvasRenderingContext2D, x: number, y: number) {
  const px = x * TS;
  const py = y * TS;
  c.fillStyle = (x + y) % 2 ? C.floor : C.floorAlt;
  c.fillRect(px, py, TS, TS);
  const h = hash(x, y);
  for (let i = 0; i < 5; i++) {
    const sx = px + ((h >> (i * 5)) % 40) + 3;
    const sy = py + ((h >> (i * 3 + 7)) % 40) + 3;
    c.fillStyle = i % 2 ? C.moss1 : C.moss2;
    c.fillRect(sx, sy, 3, 3);
  }
  if (h % 7 === 0) { // a tiny clover now and then
    c.fillStyle = '#76b356';
    const cx = px + 12 + (h % 22);
    const cy = py + 14 + ((h >> 4) % 20);
    c.fillRect(cx, cy, 3, 3); c.fillRect(cx + 3, cy - 3, 3, 3); c.fillRect(cx + 6, cy, 3, 3); c.fillRect(cx + 3, cy + 3, 3, 3);
  }
}

function drawPillar(c: CanvasRenderingContext2D, x: number, y: number) {
  const px = x * TS;
  const py = y * TS;
  c.fillStyle = 'rgba(16,40,20,0.35)';
  c.fillRect(px + 6, py + 10, TS - 6, TS - 6);
  c.fillStyle = C.stoneDark;
  c.fillRect(px + 3, py + 3, TS - 6, TS - 6);
  c.fillStyle = C.stoneSide;
  c.fillRect(px + 3, py + 3, TS - 6, TS - 12);
  c.fillStyle = C.stone;
  c.fillRect(px + 6, py + 6, TS - 12, TS - 18);
  c.fillStyle = C.stoneHi;
  c.fillRect(px + 6, py + 6, TS - 12, 3);
  c.fillRect(px + 6, py + 6, 3, TS - 18);
  c.fillStyle = C.stoneSide;
  c.fillRect(px + 18, py + 18, 9, 3);
  c.fillRect(px + 27, py + 12, 3, 6);
}

function drawWall(c: CanvasRenderingContext2D, x: number, y: number) {
  const px = x * TS;
  const py = y * TS;
  c.fillStyle = C.wall;
  c.fillRect(px, py, TS, TS);
  const h = hash(x, y);
  c.fillStyle = C.wallTop;
  const off = (y % 2) * 12;
  for (let i = -1; i < 3; i++) c.fillRect(px + i * 24 + off + 2, py + 4, 20, 18), c.fillRect(px + i * 24 + off + 14, py + 26, 20, 18);
  c.fillStyle = C.wallHi;
  c.fillRect(px + (h % 30) + 4, py + 6, 6, 3);
}

function drawCrate(c: CanvasRenderingContext2D, x: number, y: number) {
  const px = x * TS;
  const py = y * TS;
  c.fillStyle = 'rgba(16,40,20,0.35)';
  c.fillRect(px + 6, py + 9, TS - 7, TS - 7);
  c.fillStyle = C.woodDark;
  c.fillRect(px + 4, py + 4, TS - 8, TS - 8);
  c.fillStyle = C.wood;
  c.fillRect(px + 7, py + 7, TS - 14, TS - 14);
  c.fillStyle = C.woodDark;
  for (let i = 1; i < 3; i++) c.fillRect(px + 7, py + 7 + i * 11, TS - 14, 2);
  // diagonal brace
  c.save();
  c.beginPath(); c.rect(px + 7, py + 7, TS - 14, TS - 14); c.clip();
  c.strokeStyle = C.woodDark; c.lineWidth = 5;
  c.beginPath(); c.moveTo(px + 7, py + TS - 7); c.lineTo(px + TS - 7, py + 7); c.stroke();
  c.strokeStyle = C.woodHi; c.lineWidth = 2;
  c.beginPath(); c.moveTo(px + 7, py + TS - 11); c.lineTo(px + TS - 11, py + 7); c.stroke();
  c.restore();
  c.fillStyle = C.woodHi;
  c.fillRect(px + 7, py + 7, TS - 14, 2);
  c.fillStyle = '#5b3613';
  for (const [a, b] of [[9, 9], [TS - 12, 9], [9, TS - 12], [TS - 12, TS - 12]]) c.fillRect(px + a, py + b, 3, 3);
}

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }

export interface ViewState {
  reducedMotion: boolean;
  particles: Particle[];
  shake: number;
  board: HTMLCanvasElement | null;
  boardKey: Tile[] | null;
}

export function spawnBurst(v: ViewState, tx: number, ty: number, kind: 'crate' | 'smoke') {
  if (v.reducedMotion) return;
  const n = kind === 'crate' ? 6 : 4;
  for (let i = 0; i < n && v.particles.length < 120; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = kind === 'crate' ? 1.5 + Math.random() * 2.5 : 0.4 + Math.random() * 0.6;
    v.particles.push({
      x: tx * TS + TS / 2, y: ty * TS + TS / 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 'crate' ? 1.5 : 0.6),
      life: 0, max: kind === 'crate' ? 26 : 34, color: kind === 'crate' ? (i % 2 ? C.wood : C.woodDark) : 'rgba(250,240,220,0.7)',
      size: kind === 'crate' ? 5 : 9,
    });
  }
}

export function drawGame(ctx: CanvasRenderingContext2D, g: Game, v: ViewState, frame: number) {
  if (v.boardKey !== g.tiles || !v.board) {
    v.board = paintBoard(g.tiles, v.board ?? undefined);
    v.boardKey = g.tiles;
  }
  ctx.save();
  if (v.shake > 0 && !v.reducedMotion) {
    ctx.translate((Math.random() - 0.5) * v.shake, (Math.random() - 0.5) * v.shake);
  }
  v.shake = Math.max(0, v.shake - 0.6);
  // Floor & solids are static; crates are redrawn because they change.
  ctx.drawImage(v.board, 0, 0);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const k = idx(x, y);
    if (g.tiles[k] === Tile.Crate) drawCrate(ctx, x, y);
    else if (g.burning.has(k)) {
      const t = (g.tick - g.burning.get(k)!) / BLAST_TICKS;
      ctx.globalAlpha = Math.max(0, 1 - t);
      drawCrate(ctx, x, y);
      ctx.globalAlpha = 1;
    }
  }
  for (const [k, kind] of g.powerups) drawPower(ctx, k % COLS, Math.floor(k / COLS), kind, frame, v.reducedMotion);
  for (const b of g.bombs) drawBomb(ctx, b.x, b.y, b.fuse, frame, v.reducedMotion);
  drawFire(ctx, g);
  // Frogs, back to front.
  const order = [...g.players].sort((a, b) => a.y - b.y);
  for (const p of order) drawFrog(ctx, p.x * TS + TS / 2, p.y * TS + TS / 2, p, g, frame, v.reducedMotion);
  // Particles.
  v.particles = v.particles.filter((pt) => pt.life < pt.max);
  for (const pt of v.particles) {
    pt.life++;
    pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.12;
    ctx.globalAlpha = 1 - pt.life / pt.max;
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawPower(c: CanvasRenderingContext2D, x: number, y: number, kind: PowerKind, frame: number, still: boolean) {
  const cx = x * TS + TS / 2;
  const cy = y * TS + TS / 2 + (still ? 0 : Math.sin(frame / 10 + x) * 2);
  const bg = kind === 'bomb' ? '#2f6f86' : kind === 'fire' ? '#c2412b' : '#7b4fc2';
  c.fillStyle = 'rgba(16,40,20,0.35)';
  roundRect(c, cx - 16, cy - 13, 34, 34, 8); c.fill();
  c.fillStyle = '#fff6df';
  roundRect(c, cx - 18, cy - 18, 36, 36, 8); c.fill();
  c.fillStyle = bg;
  roundRect(c, cx - 15, cy - 15, 30, 30, 6); c.fill();
  c.fillStyle = '#fff6df';
  c.strokeStyle = '#fff6df';
  if (kind === 'bomb') {
    c.beginPath(); c.arc(cx - 1, cy + 2, 8, 0, Math.PI * 2); c.fill();
    c.fillRect(cx + 3, cy - 10, 4, 6);
    c.fillStyle = bg; c.beginPath(); c.arc(cx - 4, cy, 2.5, 0, Math.PI * 2); c.fill();
  } else if (kind === 'fire') {
    c.beginPath();
    c.moveTo(cx, cy - 11); c.quadraticCurveTo(cx + 11, cy, cx + 6, cy + 9); c.lineTo(cx - 6, cy + 9);
    c.quadraticCurveTo(cx - 11, cy, cx - 2, cy - 4); c.quadraticCurveTo(cx - 1, cy - 8, cx, cy - 11); c.fill();
    c.fillStyle = '#ffb52e'; c.beginPath(); c.arc(cx, cy + 4, 4, 0, Math.PI * 2); c.fill();
  } else {
    // speed: double chevron
    c.lineWidth = 4; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const o of [-6, 4]) { c.beginPath(); c.moveTo(cx + o - 3, cy - 8); c.lineTo(cx + o + 4, cy); c.lineTo(cx + o - 3, cy + 8); c.stroke(); }
  }
}

function drawBomb(c: CanvasRenderingContext2D, x: number, y: number, fuse: number, frame: number, still: boolean) {
  const cx = x * TS + TS / 2;
  const cy = y * TS + TS / 2 + 2;
  const left = fuse / FUSE_TICKS; // 1 → 0
  const rate = 4 + (1 - left) * 14;
  const pulse = still ? 0 : Math.sin((frame / 60) * rate) * (1.5 + (1 - left) * 2);
  const r = 14 + pulse;
  c.fillStyle = 'rgba(16,40,20,0.4)';
  c.beginPath(); c.ellipse(cx + 2, cy + 14, 14, 5, 0, 0, Math.PI * 2); c.fill();
  const warn = left < 0.25 && Math.floor(frame / 5) % 2 === 0;
  c.fillStyle = warn ? '#7a1f1f' : '#22252f';
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#4a5063';
  c.beginPath(); c.arc(cx - r * 0.35, cy - r * 0.35, r * 0.32, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#5c616f';
  c.fillRect(cx - 4, cy - r - 4, 8, 6);
  // Fuse shortens as time runs out; the spark rides its tip.
  const len = 4 + 12 * left;
  c.strokeStyle = '#d8c39a'; c.lineWidth = 3; c.lineCap = 'round';
  c.beginPath(); c.moveTo(cx, cy - r - 3);
  const tx = cx + len * 0.7;
  const ty = cy - r - 3 - len * 0.7;
  c.quadraticCurveTo(cx + 2, cy - r - 3 - len * 0.8, tx, ty); c.stroke();
  const flick = still ? 1 : 0.7 + 0.3 * Math.sin(frame * 1.7);
  c.fillStyle = C.fire2;
  c.beginPath(); c.arc(tx, ty, 4.5 * flick + 1, 0, Math.PI * 2); c.fill();
  c.fillStyle = C.fire3;
  c.beginPath(); c.arc(tx, ty, 2, 0, Math.PI * 2); c.fill();
}

function drawFire(c: CanvasRenderingContext2D, g: Game) {
  for (const [k, f] of g.fire) {
    const x = k % COLS;
    const y = Math.floor(k / COLS);
    const age = (g.tick - f.start) / BLAST_TICKS; // 0 → 1
    const grow = age < 0.2 ? age / 0.2 : 1 - Math.max(0, (age - 0.55) / 0.45);
    const w = TS * (0.45 + 0.4 * grow);
    const cx = x * TS + TS / 2;
    const cy = y * TS + TS / 2;
    const L = g.fire.has(k - 1), R = g.fire.has(k + 1), U = g.fire.has(k - COLS), D = g.fire.has(k + COLS);
    for (const [col, s] of [[C.fire1, 1], [C.fire2, 0.68], [C.fire3, 0.34]] as const) {
      c.fillStyle = col;
      const ww = w * s;
      // Arms toward burning neighbours join the cross into one continuous blast.
      if (L || R || (!U && !D)) c.fillRect(L ? cx - TS / 2 : cx - ww / 2, cy - ww / 2, (L ? TS / 2 : ww / 2) + (R ? TS / 2 : ww / 2), ww);
      if (U || D) c.fillRect(cx - ww / 2, U ? cy - TS / 2 : cy - ww / 2, ww, (U ? TS / 2 : ww / 2) + (D ? TS / 2 : ww / 2));
      c.beginPath(); c.arc(cx, cy, ww * 0.62, 0, Math.PI * 2); c.fill();
    }
  }
}

export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Draw one frog. Also used by the HUD/menu to paint portraits (g may be null). */
export function drawFrog(c: CanvasRenderingContext2D, cx: number, cy: number, p: Pick<Player, 'look' | 'facing' | 'moving' | 'alive' | 'outTick' | 'reaction' | 'reactTick'>, g: Game | null, frame: number, still: boolean, scale = 1) {
  const L = LOOKS[p.look];
  const tick = g ? g.tick : frame;
  const since = tick - p.reactTick;
  let dy = 0;
  let sx = 1;
  let sy = 1;
  let alpha = 1;
  if (!still) {
    if (p.moving) dy = -Math.abs(Math.sin(frame / 4)) * 4;
    if (p.reaction === 'bomb' && since < 10) { sx = 1.12; sy = 0.86; }
    if (p.reaction === 'pickup' && since < 18) { sx = sy = 1 + 0.12 * Math.sin((since / 18) * Math.PI); }
    if (p.reaction === 'win' && since < 240) dy = -Math.abs(Math.sin(since / 7)) * 10;
  }
  if (!p.alive && g) {
    const t = Math.min(1, (g.tick - p.outTick) / 40);
    sy = 1 - 0.55 * t;
    sx = 1 + 0.25 * t;
    alpha = 1 - 0.7 * t;
  }
  c.save();
  c.translate(cx, cy + 4);
  c.scale(scale, scale);
  c.globalAlpha = alpha;
  // shadow
  c.fillStyle = 'rgba(16,40,20,0.35)';
  c.beginPath(); c.ellipse(0, 15, 16, 5, 0, 0, Math.PI * 2); c.fill();
  c.translate(0, dy);
  c.scale(sx, sy);
  const back = p.facing === Dir.Up;
  const look = p.facing === Dir.Left ? -2 : p.facing === Dir.Right ? 2 : 0;
  // feet
  c.fillStyle = L.shade;
  c.beginPath(); c.ellipse(-12, 12, 7, 4, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(12, 12, 7, 4, 0, 0, Math.PI * 2); c.fill();
  // body
  c.fillStyle = '#17302a';
  c.beginPath(); c.ellipse(0, 2, 18, 15, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = L.body;
  c.beginPath(); c.ellipse(0, 2, 16, 13, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = L.shade;
  c.beginPath(); c.ellipse(0, 9, 14, 6, 0, 0, Math.PI); c.fill();
  if (!back) {
    c.fillStyle = L.belly;
    c.beginPath(); c.ellipse(0 + look, 6, 9, 7, 0, 0, Math.PI * 2); c.fill();
  } else {
    c.fillStyle = L.shade;
    c.beginPath(); c.arc(-5, 3, 2.5, 0, Math.PI * 2); c.arc(5, 6, 2, 0, Math.PI * 2); c.fill();
  }
  // eyes
  for (const ex of [-8, 8]) {
    c.fillStyle = '#17302a';
    c.beginPath(); c.arc(ex, -9, 7.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = L.body;
    c.beginPath(); c.arc(ex, -9, 6.2, 0, Math.PI * 2); c.fill();
    if (!back) {
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(ex + look * 0.5, -9.5, 4.6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#17302a';
      if (!p.alive) {
        c.lineWidth = 2; c.strokeStyle = '#17302a';
        c.beginPath(); c.moveTo(ex - 3, -12.5); c.lineTo(ex + 3, -6.5); c.moveTo(ex + 3, -12.5); c.lineTo(ex - 3, -6.5); c.stroke();
      } else {
        const big = p.reaction === 'scared' && since < 40 ? 1.2 : 2.4;
        c.beginPath(); c.arc(ex + look, -9.5, big, 0, Math.PI * 2); c.fill();
      }
    }
  }
  // mouth
  if (!back) {
    c.strokeStyle = '#17302a'; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath();
    if (p.reaction === 'win' && since < 240) { c.arc(look, -1, 5, 0.1 * Math.PI, 0.9 * Math.PI); }
    else if (p.reaction === 'scared' && since < 40 && p.alive) { c.ellipse(look, 0, 2.5, 2, 0, 0, Math.PI * 2); }
    else { c.arc(look, -3, 6, 0.2 * Math.PI, 0.8 * Math.PI); }
    c.stroke();
  }
  drawAccessory(c, L.accessory, back, look);
  c.restore();
}

function drawAccessory(c: CanvasRenderingContext2D, a: string, back: boolean, look: number) {
  if (a === 'bandana') {
    c.fillStyle = '#d6332b';
    c.fillRect(-15, -4, 30, 4);
    c.fillStyle = '#a3221c';
    c.beginPath(); c.moveTo(13, -4); c.lineTo(21, -8); c.lineTo(20, 0); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(13, -2); c.lineTo(22, 2); c.lineTo(16, 4); c.closePath(); c.fill();
  } else if (a === 'crown') {
    c.fillStyle = '#ffd23f';
    c.strokeStyle = '#9a6b00'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(-7, -14); c.lineTo(-7, -23); c.lineTo(-3, -18); c.lineTo(0, -25); c.lineTo(3, -18); c.lineTo(7, -23); c.lineTo(7, -14); c.closePath();
    c.fill(); c.stroke();
    c.fillStyle = '#e8473b'; c.beginPath(); c.arc(0, -16.5, 1.8, 0, Math.PI * 2); c.fill();
  } else if (a === 'flower') {
    c.fillStyle = '#ff7eb6';
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      c.beginPath(); c.arc(12 + Math.cos(ang) * 4, -17 + Math.sin(ang) * 4, 3.4, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#fff3a0'; c.beginPath(); c.arc(12, -17, 2.6, 0, Math.PI * 2); c.fill();
  } else if (a === 'shades' && !back) {
    c.fillStyle = '#121418';
    roundRect(c, -14 + look * 0.5, -13, 12, 8, 3); c.fill();
    roundRect(c, 2 + look * 0.5, -13, 12, 8, 3); c.fill();
    c.fillRect(-3 + look * 0.5, -11, 6, 2);
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillRect(-11 + look * 0.5, -12, 3, 2); c.fillRect(5 + look * 0.5, -12, 3, 2);
  } else if (a === 'shades') {
    c.fillStyle = '#121418'; c.fillRect(-15, -10, 30, 2);
  }
}
