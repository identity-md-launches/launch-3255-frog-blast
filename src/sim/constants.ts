export const COLS = 15;
export const ROWS = 13;
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const sec = (s: number) => Math.round(s * TICK_RATE);

export const FUSE_TICKS = sec(2.5);
export const BLAST_TICKS = 27; // 0.45 s
export const ROUND_TICKS = sec(120);
export const COUNTDOWN_TICKS = sec(2.4);
export const ROUND_END_TICKS = sec(1.6);
export const WINS_TO_MATCH = 3;

export const START_BOMBS = 1;
export const START_RANGE = 2;
export const MAX_BOMBS = 6;
export const MAX_RANGE = 7;
export const BASE_SPEED = 3.6; // tiles per second
export const SPEED_STEP = 0.45;
export const MAX_SPEED_LEVEL = 4;

export const SCORE_KILL = 100;
export const SCORE_CRATE = 10;
export const SCORE_ROUND = 25;

export const CRATE_DENSITY = 0.72;
export const POWERUP_CHANCE = 0.32;

export enum Tile {
  Floor = 0,
  Wall = 1, // perimeter
  Pillar = 2,
  Crate = 3,
}

export enum Dir {
  None = 0,
  Up = 1,
  Down = 2,
  Left = 3,
  Right = 4,
}

export const DIR_VEC: Record<Dir, [number, number]> = {
  [Dir.None]: [0, 0],
  [Dir.Up]: [0, -1],
  [Dir.Down]: [0, 1],
  [Dir.Left]: [-1, 0],
  [Dir.Right]: [1, 0],
};

export type PowerKind = 'bomb' | 'fire' | 'speed';

export const SPAWNS: ReadonlyArray<[number, number]> = [
  [1, 1],
  [COLS - 2, ROWS - 2],
  [COLS - 2, 1],
  [1, ROWS - 2],
];
