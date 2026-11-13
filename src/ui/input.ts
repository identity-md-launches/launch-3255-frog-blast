import { Dir } from '../sim/constants';
import type { PlayerInput } from '../sim/game';

type Slot = 'p1' | 'p2';
const KEYMAP: Record<string, [Slot, Dir | 'bomb']> = {
  KeyW: ['p1', Dir.Up], KeyS: ['p1', Dir.Down], KeyA: ['p1', Dir.Left], KeyD: ['p1', Dir.Right], Space: ['p1', 'bomb'],
  ArrowUp: ['p2', Dir.Up], ArrowDown: ['p2', Dir.Down], ArrowLeft: ['p2', Dir.Left], ArrowRight: ['p2', Dir.Right],
  Enter: ['p2', 'bomb'], NumpadEnter: ['p2', 'bomb'],
};

/**
 * Held directions are a stack per player so the most recent key wins and
 * releasing it falls back to the one still held. Bomb presses are latched on
 * keydown (ignoring auto-repeat) and consumed by exactly one simulation tick.
 */
export class Input {
  private held: Record<Slot, Dir[]> = { p1: [], p2: [] };
  private bombLatch: Record<Slot, boolean> = { p1: false, p2: false };
  private bombDown = new Set<string>();
  private touchDir = Dir.None;
  /** In solo the arrow keys and Enter also drive Player 1. */
  solo = true;
  active = false; // true while the arena has control (no overlay open)

  constructor(target: Window = window) {
    target.addEventListener('keydown', this.onDown, { passive: false });
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
  }

  isGameKey(code: string) { return code in KEYMAP; }

  private slot(s: Slot): Slot { return this.solo ? 'p1' : s; }

  private onDown = (e: KeyboardEvent) => {
    const m = KEYMAP[e.code];
    if (!m || !this.active) return;
    e.preventDefault(); // stop page scrolling and button activation during play
    const s = this.slot(m[0]);
    if (m[1] === 'bomb') {
      if (!e.repeat && !this.bombDown.has(e.code)) this.bombLatch[s] = true;
      this.bombDown.add(e.code);
      return;
    }
    const st = this.held[s];
    const d = m[1];
    const i = st.indexOf(d);
    if (i >= 0) st.splice(i, 1);
    st.push(d);
  };

  private onUp = (e: KeyboardEvent) => {
    const m = KEYMAP[e.code];
    if (!m) return;
    const s = this.slot(m[0]);
    if (m[1] === 'bomb') { this.bombDown.delete(e.code); return; }
    const st = this.held[s];
    const i = st.indexOf(m[1]);
    if (i >= 0) st.splice(i, 1);
  };

  setTouchDir(d: Dir) { this.touchDir = d; }
  touchBomb() { if (this.active) this.bombLatch.p1 = true; }

  /** Forget everything held: focus loss, pause, restart. */
  clear = () => {
    this.held.p1 = [];
    this.held.p2 = [];
    this.bombLatch.p1 = this.bombLatch.p2 = false;
    this.bombDown.clear();
    this.touchDir = Dir.None;
  };

  /** Snapshot for one tick; bomb latches are consumed. */
  read(): { p1: PlayerInput; p2: PlayerInput } {
    const p1Dir = this.touchDir !== Dir.None ? this.touchDir : (this.held.p1.at(-1) ?? Dir.None);
    const out = {
      p1: { dir: p1Dir, bomb: this.bombLatch.p1 },
      p2: { dir: this.held.p2.at(-1) ?? Dir.None, bomb: this.bombLatch.p2 },
    };
    this.bombLatch.p1 = this.bombLatch.p2 = false;
    return out;
  }

  heldCount() { return this.held.p1.length + this.held.p2.length + this.bombDown.size + (this.touchDir ? 1 : 0); }
}

/** Left d-pad (one pointer, slide between directions) and right bomb button (another pointer). */
export function bindTouch(pad: HTMLElement, bomb: HTMLElement, input: Input) {
  let padPointer: number | null = null;
  const dirFrom = (e: PointerEvent): Dir => {
    const r = pad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < r.width * 0.12) return Dir.None;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Dir.Right : Dir.Left) : (dy > 0 ? Dir.Down : Dir.Up);
  };
  const show = (d: Dir) => { pad.dataset.dir = ['', 'up', 'down', 'left', 'right'][d]; };
  const release = (e: PointerEvent) => {
    if (e.pointerId !== padPointer) return;
    padPointer = null;
    input.setTouchDir(Dir.None);
    show(Dir.None);
  };
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    padPointer = e.pointerId;
    try { pad.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    const d = dirFrom(e);
    input.setTouchDir(d);
    show(d);
  });
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId !== padPointer) return;
    const d = dirFrom(e);
    input.setTouchDir(d);
    show(d);
  });
  pad.addEventListener('pointerup', release);
  pad.addEventListener('pointercancel', release);
  pad.addEventListener('lostpointercapture', release);
  bomb.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    bomb.classList.add('is-down');
    input.touchBomb();
  });
  const up = () => bomb.classList.remove('is-down');
  bomb.addEventListener('pointerup', up);
  bomb.addEventListener('pointercancel', up);
  bomb.addEventListener('pointerleave', up);
  for (const el of [pad, bomb]) el.addEventListener('contextmenu', (e) => e.preventDefault());
  return () => { padPointer = null; input.setTouchDir(Dir.None); show(Dir.None); up(); };
}
