import { Dir } from './constants';
import type { Game, PlayerInput } from './game';
import { botInput, newBrain, type BotBrain } from './bot';

/** Collects one PlayerInput per player per tick from humans and bots. */
export class Controllers {
  private brains = new Map<number, BotBrain>();
  constructor(g: Game) {
    for (const p of g.players) if (p.controller === 'bot') this.brains.set(p.id, newBrain());
  }
  inputs(g: Game, human: { p1: PlayerInput; p2: PlayerInput }): PlayerInput[] {
    return g.players.map((p) => {
      if (p.controller === 'p1') return human.p1;
      if (p.controller === 'p2') return human.p2;
      return botInput(g, p, this.brains.get(p.id)!);
    });
  }
  reset() { for (const k of this.brains.keys()) this.brains.set(k, newBrain()); }
}

export const idleInput = (): PlayerInput => ({ dir: Dir.None, bomb: false });
