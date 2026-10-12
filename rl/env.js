// Gym-style headless environment around the deterministic core.
//
//   const env = new FightEnv({ opponent: 'cpu', cpuLevel: 3, frameSkip: 4 });
//   let { obs } = env.reset(123);
//   const { obs, reward, terminated, truncated, info } = env.step(action);
//
// Actions are integers in [0, 72): numpad direction (relative to facing) + 9 * buttonMask (J=1, K=2, L=4).
import { Game } from '../src/core/game.js';
import { CpuAI } from '../src/core/ai.js';
import { decodeAction, ACTION_COUNT, NEUTRAL, NEUTRAL_ACTION } from '../src/core/input.js';
import { MAX_HP } from '../src/core/constants.js';

export const DEFAULT_CONFIG = {
  p1: 'kaen',
  p2: 'raiden',
  agentPlayer: 0, // which side the agent controls
  opponent: 'cpu', // 'cpu' | 'agent' (second action supplied to step) | 'idle'
  cpuLevel: 3,
  frameSkip: 4,
  maxSteps: 3000, // in agent steps
  relativeActions: true, // left/right flipped according to facing
  buttonPulse: true, // buttons are pressed only on the first frame of each step
  roundTime: 99,
  rewardDamage: 1.0,
  rewardWin: 1.0,
};

export class FightEnv {
  constructor(config = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
    this.game = null;
  }

  static get actionCount() {
    return ACTION_COUNT;
  }

  static get observationSize() {
    return Game.observationSize;
  }

  spec() {
    return {
      actionCount: ACTION_COUNT, neutralAction: NEUTRAL_ACTION, observationSize: Game.observationSize,
      config: this.cfg, moves: Game.moveList,
    };
  }

  reset(seed = Math.floor(Math.random() * 1e9), config = null) {
    if (config) this.cfg = { ...this.cfg, ...config };
    const c = this.cfg;
    this.seed = seed;
    this.game = new Game({ p1: c.p1, p2: c.p2, seed, roundsToWin: 1, roundTime: c.roundTime, skipIntro: true });
    this.cpu = new CpuAI(c.cpuLevel, seed ^ 0x9e3779b9);
    this.steps = 0;
    const me = c.agentPlayer;
    return { obs: this.game.getObservation(me), obs2: this.game.getObservation(1 - me), info: this.info() };
  }

  toRaw(action, fighter, firstFrame) {
    if (action === null || action === undefined) return NEUTRAL;
    const r = decodeAction(action, fighter.facing, this.cfg.relativeActions);
    if (this.cfg.buttonPulse && !firstFrame) r.j = r.k = r.l = false;
    return r;
  }

  step(action, action2 = null) {
    const c = this.cfg;
    const g = this.game;
    const me = c.agentPlayer;
    const op = 1 - me;
    const hp0 = [g.fighters[0].hp, g.fighters[1].hp];
    let terminated = false;
    const events = [];
    for (let k = 0; k < c.frameSkip; k++) {
      const inputs = [];
      inputs[me] = this.toRaw(action, g.fighters[me], k === 0);
      if (c.opponent === 'cpu') inputs[op] = this.cpu.act(g, op);
      else if (c.opponent === 'agent') inputs[op] = this.toRaw(action2, g.fighters[op], k === 0);
      else inputs[op] = NEUTRAL;
      for (const e of g.step(inputs)) if (e.type === 'hit' || e.type === 'ko' || e.type === 'timeup') events.push(e);
      if (g.phase !== 'fight') {
        terminated = true;
        break;
      }
    }
    this.steps++;
    const dealt = (hp0[op] - g.fighters[op].hp) / MAX_HP;
    const taken = (hp0[me] - g.fighters[me].hp) / MAX_HP;
    let reward = c.rewardDamage * (dealt - taken);
    let reward2 = c.rewardDamage * (taken - dealt);
    if (terminated) {
      const w = g.roundWinner;
      if (w === me) reward += c.rewardWin;
      else if (w === op) reward -= c.rewardWin;
      if (w === op) reward2 += c.rewardWin;
      else if (w === me) reward2 -= c.rewardWin;
    }
    const truncated = !terminated && this.steps >= c.maxSteps;
    return {
      obs: g.getObservation(me), obs2: g.getObservation(op),
      reward, reward2, terminated, truncated, info: { ...this.info(), events },
    };
  }

  info() {
    const g = this.game;
    return {
      frame: g.frame, step: this.steps, phase: g.phase, winner: g.roundWinner, koType: g.koType,
      hp: g.fighters.map((f) => f.hp), power: g.fighters.map((f) => f.power), timer: g.timer,
    };
  }
}
