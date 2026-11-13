import { describe, it, expect } from 'vitest';
import { emptyGame, setCrate, run, place, park, still } from './helpers';
import { step, createGame, nextRound, bombAt, type PlayerInput } from '../../src/sim/game';
import { Dir, Tile, FUSE_TICKS, BLAST_TICKS, ROUND_TICKS, COUNTDOWN_TICKS, SPAWNS } from '../../src/sim/constants';
import { generateArena, validateArena, idx, spawnClearTiles } from '../../src/sim/arena';
import { makeRng } from '../../src/sim/rng';
import { Controllers } from '../../src/sim/controllers';

const bombIn = (who: number, n: number): PlayerInput[] =>
  [0, 1, 2, 3].map((i) => (i === who ? { dir: Dir.None, bomb: true } : still)).slice(0, n);

describe('arena', () => {
  it('generates valid layouts with clear spawns for many seeds', () => {
    const rng = makeRng(123);
    const clear = spawnClearTiles();
    for (let i = 0; i < 300; i++) {
      const a = generateArena(rng);
      expect(validateArena(a.tiles)).toBe(true);
      for (const k of clear) expect(a.tiles[k]).toBe(Tile.Floor);
      expect(a.tiles[idx(0, 0)]).toBe(Tile.Wall);
      expect(a.tiles[idx(2, 2)]).toBe(Tile.Pillar);
      expect(a.tiles.filter((t) => t === Tile.Crate).length).toBeGreaterThan(40);
    }
  });
});

describe('bombs and movement', () => {
  it('starts with one bomb and range two; capacity limits active bombs', () => {
    const g = emptyGame();
    park(g, 1, 2, 3);
    place(g, 0, 5, 5);
    expect(g.players[0].bombCap).toBe(1);
    expect(g.players[0].range).toBe(2);
    step(g, bombIn(0, 4));
    expect(g.bombs.length).toBe(1);
    place(g, 0, 7, 5);
    step(g, bombIn(0, 4));
    expect(g.bombs.length).toBe(1);
  });

  it('lets a frog step off its bomb but not walk back onto it', () => {
    const g = emptyGame();
    park(g, 1, 2, 3);
    place(g, 0, 5, 5);
    step(g, bombIn(0, 4));
    const right: PlayerInput[] = [{ dir: Dir.Right, bomb: false }, still, still, still];
    const left: PlayerInput[] = [{ dir: Dir.Left, bomb: false }, still, still, still];
    run(g, 20, () => right);
    expect(g.players[0].x).toBeGreaterThanOrEqual(6);
    expect(g.players[0].passBombs.length).toBe(0);
    run(g, 30, () => left);
    expect(g.players[0].x).toBe(6); // stopped at its own tile centre, bomb blocks
  });

  it('walls, pillars and crates block movement', () => {
    const g = emptyGame();
    park(g, 1, 2, 3);
    place(g, 0, 1, 1);
    run(g, 40, () => [{ dir: Dir.Up, bomb: false }, still, still, still]);
    expect(g.players[0].y).toBe(1);
    setCrate(g, 2, 1);
    run(g, 40, () => [{ dir: Dir.Right, bomb: false }, still, still, still]);
    expect(g.players[0].x).toBe(1);
    place(g, 0, 1, 3);
    run(g, 40, () => [{ dir: Dir.Right, bomb: false }, still, still, still]);
    expect(g.players[0].x).toBeGreaterThan(2); // row 3 is open past column 2
  });

  it('fuse is 2.5 s and the blast damages for 0.45 s', () => {
    const g = emptyGame();
    park(g, 1, 2, 3);
    place(g, 0, 5, 5);
    step(g, bombIn(0, 4));
    place(g, 0, 9, 9);
    run(g, FUSE_TICKS - 1);
    expect(g.bombs.length).toBe(1);
    run(g, 1);
    expect(g.bombs.length).toBe(0);
    expect(g.fire.has(idx(5, 5))).toBe(true);
    run(g, BLAST_TICKS - 1);
    expect(g.fire.has(idx(5, 5))).toBe(true);
    run(g, 1);
    expect(g.fire.has(idx(5, 5))).toBe(false);
  });

  it('pillars stop rays; the first crate breaks and stops its ray', () => {
    const g = emptyGame();
    park(g, 1, 2, 3);
    g.players[0].range = 4;
    place(g, 0, 5, 5);
    setCrate(g, 7, 5);
    setCrate(g, 8, 5);
    step(g, bombIn(0, 4));
    place(g, 0, 9, 9);
    run(g, FUSE_TICKS);
    expect(g.tiles[idx(7, 5)]).toBe(Tile.Floor);
    expect(g.tiles[idx(8, 5)]).toBe(Tile.Crate);
    expect(g.fire.has(idx(8, 5))).toBe(false);
    // Column 6 at row 6 is a pillar: the downward ray from (5,5) passes (5,6),(5,7)... but (6,6) never burns.
    expect(g.fire.has(idx(6, 6))).toBe(false);
    expect(g.players[0].score).toBe(10);
    expect(g.players[0].crates).toBe(1);
  });

  it('chain reactions detonate immediately and keep each bomb owner', () => {
    const g = emptyGame();
    park(g, 2, 3);
    place(g, 0, 3, 5);
    place(g, 1, 5, 5);
    step(g, [{ dir: Dir.None, bomb: true }, still, still, still]);
    run(g, 60);
    step(g, [still, { dir: Dir.None, bomb: true }, still, still]);
    // P2's bomb at (5,5) is placed 61 ticks later; P1's blast reaches it.
    place(g, 0, 1, 11); place(g, 1, 13, 1);
    setCrate(g, 7, 5);
    // A frog standing in P2's ray only.
    place(g, 3, 5, 7);
    run(g, FUSE_TICKS - 61);
    expect(g.bombs.length).toBe(0);
    expect(g.tiles[idx(7, 5)]).toBe(Tile.Floor);
    expect(g.players[1].score).toBe(10 + 100); // crate from P2's bomb + elimination
    expect(g.players[3].alive).toBe(false);
    expect(g.players[0].score).toBe(0);
  });

  it('self-elimination scores nothing', () => {
    const g = emptyGame();
    park(g, 1, 2, 3);
    place(g, 0, 5, 5);
    step(g, bombIn(0, 4));
    run(g, FUSE_TICKS);
    expect(g.players[0].alive).toBe(false);
    expect(g.players[0].score).toBe(0);
  });
});

describe('simultaneous blasts and ownership', () => {
  // Two bombs on one row detonate on the same tick; only their ids differ.
  const chainOutcome = (swap: boolean) => {
    const g = emptyGame(['p1', 'p2']);
    place(g, 0, 7, 3);
    place(g, 1, 13, 11);
    g.bombs = [
      { id: swap ? 2 : 1, owner: 0, x: 1, y: 3, fuse: 1, range: 6, placedTick: 0 },
      { id: swap ? 1 : 2, owner: 1, x: 3, y: 3, fuse: 1, range: 2, placedTick: 0 },
    ];
    g.nextBombId = 3;
    step(g, [still, still]);
    const row: number[] = [];
    for (let x = 0; x < 15; x++) if (g.fire.has(idx(x, 3))) row.push(x);
    return { row, p1: g.players[0].alive, results: g.results.map((r) => r.winner) };
  };

  it('blast footprint and round outcome do not depend on bomb id order', () => {
    const a = chainOutcome(false);
    expect(a).toEqual(chainOutcome(true));
    // A bomb in the path is set off but the ray keeps its full range.
    expect(a.row).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(a.p1).toBe(false);
  });

  it('a later blast does not erase an earlier opponent blast still burning on the tile', () => {
    const g = emptyGame(['p1', 'p2', 'bot', 'bot']);
    park(g, 0, 2, 3);
    place(g, 1, 3, 3.51);
    g.bombs = [{ id: 1, owner: 0, x: 1, y: 3, fuse: 1, range: 3, placedTick: 0 }];
    g.nextBombId = 2;
    step(g, [still, still, still, still]);
    expect(g.fire.get(idx(3, 3))?.owners).toEqual([0]);
    expect(g.players[1].alive).toBe(true);
    // P2 walks into P1's fire while dropping a bomb that chains at once.
    step(g, [still, { dir: Dir.Up, bomb: true }, still, still]);
    expect(g.players[1].alive).toBe(false);
    expect(g.fire.get(idx(3, 3))?.owners).toEqual([0, 1]);
    expect(g.events).toContainEqual({ type: 'out', player: 1, by: 0 });
    expect(g.players[0].kills).toBe(1);
    expect(g.players[0].score).toBe(100);
    expect(g.players[1].score).toBe(0);
    // P1's contribution expires on its own schedule; P2's later one keeps burning.
    const f = g.fire.get(idx(3, 3))!;
    run(g, f.hits[0].until - g.tick);
    expect(g.fire.get(idx(3, 3))?.owners).toEqual([1]);
    run(g, 1);
    expect(g.fire.has(idx(3, 3))).toBe(false);
  });
});

describe('rounds and match', () => {
  it('simultaneous elimination of the last two is a draw with no win', () => {
    const g = emptyGame(['p1', 'p2']);
    place(g, 0, 5, 5);
    place(g, 1, 7, 5);
    step(g, [{ dir: Dir.None, bomb: true }, { dir: Dir.None, bomb: true }]);
    run(g, FUSE_TICKS);
    expect(g.players.every((p) => !p.alive)).toBe(true);
    expect(g.results.at(-1)).toEqual({ round: 1, winner: null, reason: 'allOut' });
    expect(g.players.every((p) => p.roundWins === 0)).toBe(true);
    // Both still earn the opponent elimination, but nobody gets round points.
    expect(g.players[0].score).toBe(100);
    expect(g.players[1].score).toBe(100);
  });

  it('timeout with several survivors is a draw', () => {
    const g = emptyGame(['p1', 'p2']);
    run(g, ROUND_TICKS);
    expect(g.phase).toBe('roundEnd');
    expect(g.results.at(-1)!.reason).toBe('timeout');
    expect(g.results.at(-1)!.winner).toBe(null);
  });

  it('player order does not decide outcomes (mirror test)', () => {
    for (const order of [[0, 1], [1, 0]]) {
      const g = emptyGame(['p1', 'p2']);
      place(g, order[0], 5, 5);
      place(g, order[1], 7, 5);
      const inp: PlayerInput[] = [{ dir: Dir.None, bomb: true }, { dir: Dir.None, bomb: true }];
      step(g, inp);
      run(g, FUSE_TICKS);
      expect(g.results.at(-1)!.winner).toBe(null);
    }
  });

  it('first to three wins the match; scores add 25 per round won', () => {
    const g = createGame({ seed: 3, difficulty: 'normal', players: [
      { name: 'A', controller: 'p1', look: 0 }, { name: 'B', controller: 'p2', look: 1 }] });
    for (let r = 0; r < 3; r++) {
      run(g, COUNTDOWN_TICKS);
      expect(g.phase).toBe('playing');
      g.players[1].alive = false; // B falls (e.g. fell to own bomb)
      run(g, 1);
      expect(g.phase).toBe('roundEnd');
      run(g, 200);
      if (r < 2) { expect(g.phase).toBe('roundResult'); nextRound(g); }
    }
    expect(g.phase).toBe('matchOver');
    expect(g.matchWinner).toBe(0);
    expect(g.players[0].roundWins).toBe(3);
    expect(g.players[0].score).toBe(75);
    // Players reset to spawns between rounds.
    expect([g.players[1].x, g.players[1].y]).toEqual(SPAWNS[1]);
  });

  it('upgrades raise capacity, range and speed up to their caps', () => {
    const g = emptyGame();
    park(g, 1, 2, 3);
    place(g, 0, 5, 5);
    for (let i = 0; i < 10; i++) {
      g.powerups.set(idx(5, 5), (['bomb', 'fire', 'speed'] as const)[i % 3]);
      run(g, 1);
    }
    expect(g.players[0].bombCap).toBe(5);
    expect(g.players[0].range).toBe(5);
    expect(g.players[0].speedLevel).toBe(3);
    for (let i = 0; i < 30; i++) { g.powerups.set(idx(5, 5), (['bomb', 'fire', 'speed'] as const)[i % 3]); run(g, 1); }
    expect(g.players[0].bombCap).toBe(6);
    expect(g.players[0].range).toBe(7);
    expect(g.players[0].speedLevel).toBe(4);
  });
});

describe('bots', () => {
  it('play six-round bot matches without breaking rules, rarely blowing themselves up', { timeout: 240_000 }, () => {
    for (const difficulty of ['easy', 'normal'] as const) {
      for (let seed = 1; seed <= 2; seed++) {
        const g = createGame({ seed, difficulty, players: [0, 1, 2, 3].map((i) => ({ name: `B${i}`, controller: 'bot' as const, look: i })) });
        const c = new Controllers(g);
        let selfOuts = 0;
        let outs = 0;
        while (g.results.length < 6 && g.phase !== 'matchOver') {
          if (g.phase === 'roundResult') { nextRound(g); c.reset(); }
          step(g, c.inputs(g, { p1: still, p2: still }));
          for (const e of g.events) if (e.type === 'out') { outs++; if (e.by === e.player) selfOuts++; }
          for (const p of g.players) {
            expect(g.bombs.filter((bb) => bb.owner === p.id).length).toBeLessThanOrEqual(p.bombCap);
            if (p.alive) expect(g.tiles[idx(Math.round(p.x), Math.round(p.y))]).toBe(Tile.Floor);
          }
        }
        expect(g.results.length).toBeGreaterThanOrEqual(3);
        // Round wins always equal the number of decided rounds.
        expect(g.players.reduce((n, p) => n + p.roundWins, 0)).toBe(g.results.filter((r) => r.winner !== null).length);
        expect(outs).toBeGreaterThan(0);
        expect(selfOuts / Math.max(1, outs)).toBeLessThan(0.6);
      }
    }
  });

  it('a bot standing on a fresh bomb escapes it', () => {
    let escaped = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const g = emptyGame(['bot', 'p2'], seed);
      g.tiles = generateArena(makeRng(seed)).tiles;
      place(g, 1, 13, 11);
      const c = new Controllers(g);
      g.bombs.push({ id: 99, owner: 0, x: 1, y: 1, fuse: FUSE_TICKS, range: 2, placedTick: 0 });
      g.players[0].passBombs.push(99);
      for (let t = 0; t < FUSE_TICKS + 5; t++) step(g, c.inputs(g, { p1: still, p2: still }));
      if (g.players[0].alive) escaped++;
      expect(bombAt(g, 1, 1)).toBeUndefined();
    }
    expect(escaped).toBe(20);
  });
});
