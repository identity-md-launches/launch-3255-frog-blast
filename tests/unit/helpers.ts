import { createGame, step, type Game, type PlayerInput, type Controller } from '../../src/sim/game';
import { baseTile, idx } from '../../src/sim/arena';
import { COLS, ROWS, Dir, Tile } from '../../src/sim/constants';

export const still: PlayerInput = { dir: Dir.None, bomb: false };

/** A game already in the playing phase on an empty (crate-free) arena. */
export function emptyGame(ctrls: Controller[] = ['p1', 'p2', 'bot', 'bot'], seed = 7): Game {
  const g = createGame({
    seed, difficulty: 'normal',
    players: ctrls.map((c, i) => ({ name: `F${i}`, controller: c, look: i })),
  });
  g.tiles = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) g.tiles.push(baseTile(x, y));
  g.hidden.clear();
  g.phase = 'playing';
  g.phaseTick = 0;
  return g;
}

export function setCrate(g: Game, x: number, y: number) { g.tiles[idx(x, y)] = Tile.Crate; }

export function run(g: Game, ticks: number, inputs: (t: number) => PlayerInput[] = () => g.players.map(() => still)) {
  for (let t = 0; t < ticks; t++) step(g, inputs(t));
}

export function place(g: Game, who: number, x: number, y: number) {
  g.players[who].x = x;
  g.players[who].y = y;
}

/** Move frogs that are not under test into far, harmless spots (still alive). */
export function park(g: Game, ...who: number[]) {
  const spots: [number, number][] = [[13, 11], [13, 1], [1, 11], [7, 11]];
  who.forEach((w, i) => place(g, w, spots[i][0], spots[i][1]));
}
