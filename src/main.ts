import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import './style.css';
import { DT, Dir, ROUND_TICKS, MAX_SPEED_LEVEL } from './sim/constants';
import { createGame, step, nextRound, roundSecondsLeft, type Game, type PlayerSetup, type Difficulty } from './sim/game';
import { Controllers, idleInput } from './sim/controllers';
import { drawGame, drawFrog, spawnBurst, type ViewState } from './render/draw';
import { LOOKS } from './render/looks';
import { Input, bindTouch } from './ui/input';
import { Sound } from './ui/audio';
import { Bridge } from './ui/bridge';
import { loadPrefs, savePrefs, storageAvailable } from './ui/storage';

type Mode = { kind: 'solo'; difficulty: Difficulty } | { kind: 'versus'; bots: boolean };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const els = {
  menu: $('menu'), game: $('game'), arena: $<HTMLCanvasElement>('arena'), preview: $<HTMLCanvasElement>('preview'),
  roster: $<HTMLOListElement>('roster'), timer: $('timer'), roundLabel: $('round-label'), banner: $('banner'),
  overlay: $('overlay'), ovTitle: $('ov-title'), ovText: $('ov-text'), ovActions: $('ov-actions'),
  standings: $<HTMLTableElement>('standings'), live: $('live'), howto: $<HTMLDialogElement>('howto'),
  mute: $<HTMLButtonElement>('btn-mute'), pause: $<HTMLButtonElement>('btn-pause'), menuSound: $<HTMLButtonElement>('menu-sound'),
  volume: $<HTMLInputElement>('volume'), versusBots: $<HTMLInputElement>('versus-bots'), storageNote: $('storage-note'),
  dpad: $('dpad'), bombBtn: $('bomb-btn'),
};

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const prefs = loadPrefs();
const canStore = storageAvailable();
els.storageNote.hidden = canStore;
const persist = () => { if (canStore) savePrefs(prefs); };

const sound = new Sound();
sound.muted = prefs.muted;
sound.volume = prefs.volume;
const input = new Input();
const pauseReasons = new Set<'user' | 'host'>();
const bridge = new Bridge({
  pause: () => setPaused('host', true),
  resume: () => setPaused('host', false),
});

let game: Game | null = null;
let controllers: Controllers | null = null;
let mode: Mode = { kind: 'solo', difficulty: prefs.difficulty };
let screen: 'menu' | 'game' = 'menu';
let acc = 0;
let last = performance.now();
let frame = 0;
let reportedFor: Game | null = null;
let reports = 0;
let loops = 0;
let overlayKind: '' | 'pause' | 'round' | 'match' = '';
let overlayShownAt = 0;
let lastPhase = '';
const view: ViewState = { reducedMotion: reducedMotionQuery.matches, particles: [], shake: 0, board: null, boardKey: null };
reducedMotionQuery.addEventListener?.('change', () => { view.reducedMotion = reducedMotionQuery.matches; });
const ctx = els.arena.getContext('2d')!;

// Fit the arena to the stage: as large as possible, 15:13, never overflowing.
const stage = $('stage');
function fitArena() {
  const cs = getComputedStyle(stage);
  const w = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (w <= 0 || h <= 0) return;
  const size = Math.floor(Math.min(w, (h * 15) / 13));
  els.arena.style.width = `${size}px`;
  els.arena.style.height = `${Math.floor((size * 13) / 15)}px`;
}
new ResizeObserver(fitArena).observe(stage);

// ---------- audio unlock: only inside a user gesture ----------
const unlock = () => sound.unlock();
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });

// ---------- preferences UI ----------
function syncSoundUi() {
  els.menuSound.textContent = sound.muted ? 'Sound off' : 'Sound on';
  els.menuSound.setAttribute('aria-pressed', String(!sound.muted));
  els.mute.setAttribute('aria-pressed', String(sound.muted));
  els.mute.setAttribute('aria-label', sound.muted ? 'Unmute sound' : 'Mute sound');
  els.volume.value = String(Math.round(sound.volume * 100));
}
function toggleMute() {
  sound.setMuted(!sound.muted);
  prefs.muted = sound.muted;
  persist();
  if (!sound.muted) { sound.unlock(); sound.play('click'); }
  syncSoundUi();
}
els.menuSound.addEventListener('click', toggleMute);
els.mute.addEventListener('click', () => { toggleMute(); els.arena.focus({ preventScroll: true }); });
els.volume.addEventListener('input', () => {
  sound.setVolume(Number(els.volume.value) / 100);
  prefs.volume = sound.volume;
  persist();
});
for (const r of document.querySelectorAll<HTMLInputElement>('input[name="difficulty"]')) {
  r.checked = r.value === prefs.difficulty;
  r.addEventListener('change', () => { if (r.checked) { prefs.difficulty = r.value as Difficulty; persist(); } });
}
els.versusBots.checked = prefs.versusBots;
els.versusBots.addEventListener('change', () => { prefs.versusBots = els.versusBots.checked; persist(); });
syncSoundUi();

$('play-solo').addEventListener('click', () => startMatch({ kind: 'solo', difficulty: prefs.difficulty }));
$('play-versus').addEventListener('click', () => startMatch({ kind: 'versus', bots: prefs.versusBots }));
$('open-howto').addEventListener('click', () => els.howto.showModal());
els.pause.addEventListener('click', () => togglePause());

// ---------- touch ----------
const touchQuery = window.matchMedia('(pointer: coarse)');
let sawTouch = touchQuery.matches;
window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && !sawTouch) { sawTouch = true; syncTouch(); } }, { capture: true });
const releaseTouch = bindTouch(els.dpad, els.bombBtn, input);
function syncTouch() { els.game.classList.toggle('show-touch', sawTouch && mode.kind === 'solo'); }

// ---------- match lifecycle ----------
function playersFor(m: Mode): PlayerSetup[] {
  const p = (look: number, controller: PlayerSetup['controller']): PlayerSetup => ({ name: LOOKS[look].name, controller, look });
  if (m.kind === 'solo') return [p(0, 'p1'), p(1, 'bot'), p(2, 'bot'), p(3, 'bot')];
  return m.bots ? [p(0, 'p1'), p(1, 'p2'), p(2, 'bot'), p(3, 'bot')] : [p(0, 'p1'), p(1, 'p2')];
}

function randomSeed() {
  const fixed = new URLSearchParams(location.search).get('seed');
  if (fixed && /^\d+$/.test(fixed)) return Number(fixed);
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

function startMatch(m: Mode) {
  mode = m;
  game = createGame({ players: playersFor(m), difficulty: m.kind === 'solo' ? m.difficulty : 'normal', seed: randomSeed() });
  controllers = new Controllers(game);
  input.clear();
  releaseTouch();
  input.solo = m.kind === 'solo';
  pauseReasons.clear();
  view.particles = [];
  view.shake = 0;
  view.boardKey = null;
  acc = 0;
  lastPhase = '';
  hideOverlay();
  showScreen('game');
  buildRoster();
  syncTouch();
  fitArena();
  input.active = true;
  els.arena.focus({ preventScroll: true });
  sound.resume();
}

function showScreen(s: 'menu' | 'game') {
  screen = s;
  els.menu.hidden = s !== 'menu';
  els.game.hidden = s !== 'game';
  document.body.classList.toggle('playing', s === 'game');
  if (s === 'menu') { input.active = false; input.clear(); drawPreview(); }
}

function quitToMenu() {
  game = null;
  controllers = null;
  pauseReasons.clear();
  hideOverlay();
  showScreen('menu');
  $('play-solo').focus();
}

// ---------- pause ----------
const isPaused = () => pauseReasons.size > 0;
const pausable = () => !!game && screen === 'game' && (game.phase === 'countdown' || game.phase === 'playing' || game.phase === 'roundEnd');

function setPaused(reason: 'user' | 'host', on: boolean) {
  if (on) {
    if (!pausable() && !(overlayKind === 'pause')) {
      // Nothing is running: still honour a host pause so the next round cannot start unseen.
      if (reason === 'host') pauseReasons.add('host');
      return;
    }
    pauseReasons.add(reason);
    input.clear();
    releaseTouch();
    sound.suspend();
    if (overlayKind === '' || overlayKind === 'pause') showPause();
  } else {
    pauseReasons.delete(reason);
    if (!isPaused()) {
      last = performance.now(); // no elapsed-time jump on resume
      acc = 0;
      sound.resume();
      if (overlayKind === 'pause') { hideOverlay(); input.active = true; els.arena.focus({ preventScroll: true }); }
    } else if (overlayKind === 'pause') showPause();
  }
}

function togglePause() {
  if (pauseReasons.has('user')) setPaused('user', false);
  else setPaused('user', true);
}

function showPause() {
  const host = pauseReasons.has('host') && !pauseReasons.has('user');
  showOverlay('pause', 'Paused', host ? 'The host page paused the game. It resumes when the host allows.' : 'Everything is frozen: bombs, bots and the clock. Press P or Escape to continue.', host ? [] : [
    { label: 'Resume', primary: true, run: () => setPaused('user', false) },
    { label: 'Restart match', run: () => startMatch(mode) },
    { label: 'Quit to menu', run: quitToMenu },
  ], false);
}

window.addEventListener('keydown', (e) => {
  if (screen !== 'game') return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (overlayKind === '' || overlayKind === 'pause') {
      e.preventDefault();
      if (!e.repeat) togglePause();
    }
    return;
  }
  if (e.key === 'Tab' && overlayKind) trapTab(e);
});

function onFocusLost() {
  input.clear();
  releaseTouch();
  if (screen === 'game' && pausable() && !isPaused()) setPaused('user', true);
}
window.addEventListener('blur', onFocusLost);
document.addEventListener('visibilitychange', () => { if (document.hidden) onFocusLost(); });

// ---------- overlays ----------
interface Action { label: string; primary?: boolean; run: () => void }

function showOverlay(kind: typeof overlayKind, title: string, text: string, actions: Action[], table: boolean) {
  overlayKind = kind;
  overlayShownAt = performance.now();
  input.active = false;
  els.ovTitle.textContent = title;
  els.ovText.textContent = text;
  els.ovActions.replaceChildren(...actions.map((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${a.primary ? 'btn-primary' : 'btn-ghost'}`;
    b.textContent = a.label;
    b.addEventListener('click', () => {
      // A bomb key held as the round ended must not skip this screen.
      if (performance.now() - overlayShownAt < 350) return;
      a.run();
    });
    return b;
  }));
  els.standings.hidden = !table;
  if (table && game) fillStandings(game);
  els.overlay.hidden = false;
  const first = els.ovActions.querySelector<HTMLButtonElement>('button');
  (first ?? els.overlay.querySelector<HTMLElement>('.panel'))?.focus({ preventScroll: true });
}

function hideOverlay() {
  overlayKind = '';
  els.overlay.hidden = true;
}

function trapTab(e: KeyboardEvent) {
  const f = [...els.ovActions.querySelectorAll<HTMLButtonElement>('button')];
  if (!f.length) { e.preventDefault(); return; }
  const i = f.indexOf(document.activeElement as HTMLButtonElement);
  e.preventDefault();
  f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
}

function fillStandings(g: Game) {
  const body = els.standings.tBodies[0];
  const rows = [...g.players].sort((a, b) => b.roundWins - a.roundWins || b.score - a.score);
  const top = rows[0];
  body.replaceChildren(...rows.map((p) => {
    const tr = document.createElement('tr');
    if (p === top && (p.roundWins > 0 || p.score > 0)) tr.className = 'lead';
    const who = p.controller === 'bot' ? 'bot' : p.controller === 'p1' ? 'Player 1' : 'Player 2';
    for (const v of [`${p.name} (${who})`, String(p.roundWins), String(p.score)]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.append(td);
    }
    return tr;
  }));
}

function onPhaseChange(g: Game) {
  if (g.phase === 'roundResult' || g.phase === 'matchOver') {
    const r = g.results.at(-1)!;
    const w = r.winner !== null ? g.players[r.winner] : null;
    if (g.phase === 'matchOver') {
      const champ = g.players[g.matchWinner!];
      if (reportedFor !== g) { reportedFor = g; reports++; bridge.gameOver(g.players[0].score); }
      sound.play('match');
      const p1 = g.players[0];
      showOverlay('match', `${champ.name} wins the match`, `${champ.name} reached three round wins. Player 1 finished with ${p1.score} points.`, [
        { label: 'Rematch', primary: true, run: () => startMatch(mode) },
        { label: 'Main menu', run: quitToMenu },
      ], true);
      els.live.textContent = `${champ.name} wins the match.`;
    } else {
      const title = w ? `${w.name} wins round ${r.round}` : `Round ${r.round} is a draw`;
      const text = w ? `${w.name} was the last frog standing. +25 points.`
        : r.reason === 'timeout' ? 'Time ran out with more than one frog standing. Nobody gets the win.'
          : 'The last frogs went out together. Nobody gets the win.';
      showOverlay('round', title, text, [
        { label: 'Next round', primary: true, run: () => { nextRound(g); controllers?.reset(); input.clear(); hideOverlay(); input.active = true; els.arena.focus({ preventScroll: true }); } },
        { label: 'Quit to menu', run: quitToMenu },
      ], true);
      els.live.textContent = title;
    }
  }
}

// ---------- HUD ----------
interface RosterRow { li: HTMLLIElement; pips: HTMLElement[]; bombs: HTMLElement; range: HTMLElement; speed: HTMLElement; key: string }
let roster: RosterRow[] = [];
const ICON_BOMB = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><circle cx="5.5" cy="7" r="4.2" fill="currentColor"/><rect x="7" y="1" width="2" height="3" fill="currentColor"/></svg>';
const ICON_FIRE = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M6 .5C8.5 3 10.5 5 10 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 1.5.6 2.2 1.3 2.4C5 4 5.3 2.2 6 .5z" fill="currentColor"/></svg>';

function buildRoster() {
  if (!game) return;
  els.roster.classList.toggle('two', game.players.length === 2);
  roster = game.players.map((p) => {
    const li = document.createElement('li');
    li.className = p.controller === 'bot' ? 'fr' : 'fr human';
    const cv = document.createElement('canvas');
    cv.width = 72; cv.height = 72;
    const c = cv.getContext('2d')!;
    c.scale(1.5, 1.5);
    drawFrog(c, 24, 24, { ...p, alive: true, moving: false, facing: Dir.Down, reaction: '' }, null, 0, true, 0.95);
    const who = p.controller === 'bot' ? 'Bot' : p.controller === 'p1' ? 'P1' : 'P2';
    const name = document.createElement('div');
    name.className = 'fr-name';
    name.textContent = `${who} ${p.name}`;
    name.title = `${p.name}, ${LOOKS[p.look].accessoryLabel}`;
    const stats = document.createElement('div');
    stats.className = 'fr-stats';
    const pipsEl = document.createElement('span');
    pipsEl.className = 'pips';
    const pips = [0, 1, 2].map(() => { const s = document.createElement('span'); s.className = 'pip'; pipsEl.append(s); return s; });
    const bombs = document.createElement('span');
    const range = document.createElement('span');
    const speed = document.createElement('span');
    stats.append(pipsEl, bombs, range);
    li.append(cv, name, stats);
    els.roster.append(li);
    return { li, pips, bombs, range, speed, key: '' };
  });
  els.roster.replaceChildren(...roster.map((r) => r.li));
}

function updateHud(g: Game) {
  g.players.forEach((p, i) => {
    const r = roster[i];
    const key = `${p.alive}|${p.roundWins}|${p.bombCap}|${p.range}|${p.speedLevel}`;
    if (key === r.key) return;
    r.key = key;
    r.li.classList.toggle('out', !p.alive);
    r.pips.forEach((pip, k) => pip.classList.toggle('on', k < p.roundWins));
    r.bombs.innerHTML = `${ICON_BOMB} <b>${p.bombCap}</b>`;
    r.range.innerHTML = `${ICON_FIRE} <b>${p.range}</b>`;
    r.li.setAttribute('aria-label', `${p.name}: ${p.alive ? 'in' : 'out'}, ${p.roundWins} round wins, ${p.bombCap} bombs, blast ${p.range}, speed ${p.speedLevel} of ${MAX_SPEED_LEVEL}`);
  });
  const s = Math.ceil(roundSecondsLeft(g));
  const t = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  if (els.timer.textContent !== t) els.timer.textContent = t;
  els.timer.classList.toggle('low', g.roundTick > ROUND_TICKS - 60 * 15);
  const rl = `Round ${g.round}`;
  if (els.roundLabel.textContent !== rl) els.roundLabel.textContent = rl;
}

function banner(text: string) {
  els.banner.textContent = text;
  els.banner.classList.remove('pop');
  if (!view.reducedMotion) { void els.banner.offsetWidth; els.banner.classList.add('pop'); }
}

// ---------- simulation tick ----------
function tick() {
  if (!game || !controllers) return;
  const g = game;
  const human = g.phase === 'playing' && input.active ? input.read() : (input.read(), { p1: idleInput(), p2: idleInput() });
  step(g, controllers.inputs(g, human));
  for (const e of g.events) {
    switch (e.type) {
      case 'place': sound.play('place'); break;
      case 'explode': sound.play('boom'); view.shake = Math.min(6, 3 + e.count); spawnBurst(view, e.x, e.y, 'smoke'); break;
      case 'crate': sound.play('crate'); spawnBurst(view, e.x, e.y, 'crate'); break;
      case 'pickup': sound.play('pickup'); break;
      case 'out': sound.play('out'); break;
      case 'countdown': sound.play('tick'); banner(String(e.n)); break;
      case 'go': sound.play('go'); banner('Go!'); setTimeout(() => { if (els.banner.textContent === 'Go!') els.banner.textContent = ''; }, 700); break;
      case 'roundEnd': {
        sound.play(e.winner === null ? 'draw' : 'win');
        banner(e.winner === null ? 'Draw' : `${g.players[e.winner].name} wins!`);
        break;
      }
      default: break;
    }
  }
  if (g.phase !== lastPhase) {
    lastPhase = g.phase;
    if (g.phase === 'countdown') els.banner.textContent = '';
    onPhaseChange(g);
  }
}

// ---------- the one animation loop ----------
function loop(now: number) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;
  if (!game || screen !== 'game') return;
  if (!isPaused()) {
    acc += dt;
    let n = 0;
    while (acc >= DT && n < 15) { tick(); acc -= DT; n++; }
    if (n === 15) acc = 0;
    frame++;
  }
  if (game) {
    drawGame(ctx, game, view, frame);
    updateHud(game);
  }
}
loops++;
requestAnimationFrame((t) => { last = t; loop(t); });

// ---------- menu preview ----------
function drawPreview() {
  const g = createGame({ seed: 20261113, difficulty: 'normal', players: [0, 1, 2, 3].map((i) => ({ name: LOOKS[i].name, controller: 'bot' as const, look: i })) });
  g.phase = 'playing';
  g.players[0].x = 2; g.players[0].facing = Dir.Right;
  g.players[1].y = 10;
  g.bombs.push({ id: 1, owner: 0, x: 1, y: 1, fuse: 90, range: 2, placedTick: 0 });
  g.powerups.set(3 + 15 * 3, 'fire');
  drawGame(els.preview.getContext('2d')!, g, { reducedMotion: true, particles: [], shake: 0, board: null, boardKey: null }, 0);
}
drawPreview();

// ---------- test hooks (only with ?e2e in the URL) ----------
if (new URLSearchParams(location.search).has('e2e')) {
  (window as unknown as Record<string, unknown>).__frogBlast = {
    state: () => game && {
      screen, phase: game.phase, paused: isPaused(), reasons: [...pauseReasons], tick: game.tick, roundTick: game.roundTick,
      round: game.round, overlay: overlayKind, reports, loops, held: input.heldCount(), audio: sound.state, muted: sound.muted,
      bombs: game.bombs.map((b) => ({ ...b })), fire: game.fire.size, crates: game.tiles.filter((t) => t === 3).length,
      players: game.players.map((p) => ({ name: p.name, controller: p.controller, x: p.x, y: p.y, alive: p.alive, score: p.score, roundWins: p.roundWins, bombCap: p.bombCap, range: p.range })),
      results: game.results,
    },
    menuState: () => ({ screen, reports, loops, audio: sound.state, muted: sound.muted, storage: canStore }),
    /** Advance the simulation synchronously (ignored while paused, like the real loop). */
    run: (n: number) => { for (let i = 0; i < n && game && !isPaused(); i++) tick(); },
    /** Knock out everyone except `id` so match flow can be tested quickly. */
    eliminateAllBut: (id: number) => { game?.players.forEach((p) => { if (p.id !== id) p.alive = false; }); },
    place: (id: number, x: number, y: number) => { if (game) { game.players[id].x = x; game.players[id].y = y; } },
    clearCrates: () => { if (game) { game.tiles = game.tiles.map((t) => (t === 3 ? 0 : t)); view.boardKey = null; } },
  };
}
