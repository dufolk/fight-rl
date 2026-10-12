import { RNG } from './rng.js';
import { NEUTRAL } from './input.js';
import { POWER_STOCK } from './constants.js';

const ACTIONABLE = new Set(['idle', 'walkF', 'walkB', 'crouch', 'dash', 'land']);

// Sequences are lists of [numpad, frames, buttons?], numpad relative to facing.
const SEQ = {
  fireball: (b = 'j') => [[2, 2], [3, 2], [6, 1, b], [5, 1]],
  dragon: (b = 'j') => [[6, 2], [2, 2], [3, 1, b], [5, 1]],
  tatsu: (b = 'k') => [[2, 2], [1, 2], [4, 1, b], [5, 1]],
  super: () => [[5, 1, 'jk'], [5, 1]],
  tap: (d, b) => [[d, 1, b], [d, 1]],
  hold: (d, n) => [[d, n]],
  dash: (n) => [[6, 1], [5, 2], [6, n]],
  backdash: () => [[4, 1], [5, 2], [4, 2]],
};

const COMBOS = {
  jabTatsu: () => [[5, 1, 'j'], [5, 3], [5, 1, 'j'], [5, 2], [2, 2], [1, 2], [4, 1, 'k'], [5, 1]],
  lowFireball: () => [[2, 1, 'k'], [2, 5], [2, 1, 'k'], [2, 3], [3, 2], [6, 1, 'j'], [5, 1]],
  heavyDragon: () => [[5, 1, 'l'], [5, 8], [6, 2], [2, 2], [3, 1, 'l'], [5, 1]],
  heavySuper: () => [[5, 1, 'l'], [5, 9], [5, 1, 'jk'], [5, 1]],
  sweep: () => [[2, 1, 'l'], [2, 3]],
  throw: () => [[6, 1, 'l'], [6, 1]],
};

export class CpuAI {
  constructor(level = 3, seed = 4242) {
    this.level = Math.max(1, Math.min(5, level));
    this.rng = new RNG(seed);
    this.reset();
  }

  reset() {
    this.queue = [];
    this.wait = 0;
    this.idleDir = 5;
    this.threatId = null;
    this.guardRoll = false;
    this.react = 0;
    this.aaRolled = false;
  }

  push(seq) {
    for (const [d, n, b] of seq) for (let i = 0; i < n; i++) this.queue.push([d, i === 0 ? b : undefined]);
  }

  raw(me, d, b = '') {
    const rx = ((d - 1) % 3) - 1;
    const y = d >= 7 ? 1 : d <= 3 ? -1 : 0;
    return { x: rx * me.facing, y, j: b.includes('j'), k: b.includes('k'), l: b.includes('l') };
  }

  chance(table) {
    return this.rng.next() < table[this.level];
  }

  threat(game, me, op, dist) {
    if (op.state === 'move' && op.move.hits.length && op.mf <= op.move.lastActive && dist < 250) {
      const hs = op.move.hits;
      return { id: `m${op.moveSerial}`, low: hs.some((h) => h.level === 'low'), high: hs.some((h) => h.level === 'overhead') };
    }
    for (const p of game.projectiles) {
      if (p.owner === me.index) continue;
      const dx = me.x - p.x;
      if (Math.sign(dx) === Math.sign(p.vx) && Math.abs(dx) < 280) return { id: `p${p.id}`, low: false, high: false, proj: true };
    }
    if ((op.state === 'air' || (op.state === 'move' && op.move.air)) && dist < 240 && Math.sign(op.vx) === Math.sign(me.x - op.x)) {
      return { id: `j${op.moveSerial}:${Math.floor(game.frame / 60)}`, low: false, high: true, air: true };
    }
    return null;
  }

  act(game, idx) {
    const me = game.fighters[idx];
    const op = game.fighters[1 - idx];
    if (game.phase !== 'fight') {
      this.queue.length = 0;
      return NEUTRAL;
    }
    const dist = Math.abs(op.x - me.x);
    const canAct = ACTIONABLE.has(me.state);

    if (me.state === 'air' && !me.airAttacked && me.vy < 3 && dist < 160 && op.y < 60) {
      return this.raw(me, 5, this.rng.next() < 0.6 ? 'k' : 'l');
    }
    // defense (interrupts queued movement, not committed attacks)
    const th = this.threat(game, me, op, dist);
    if (th) {
      if (th.id !== this.threatId) {
        this.threatId = th.id;
        this.guardRoll = this.chance([0, 0.3, 0.5, 0.72, 0.86, 0.95]);
        this.react = Math.max(0, 7 - this.level - (th.proj ? 4 : 0));
        if (th.proj && dist > 200 && canAct && this.chance([0, 0.05, 0.15, 0.25, 0.3, 0.35])) {
          this.queue.length = 0;
          this.push([[9, 6]]);
          this.guardRoll = false;
        }
      }
      if (this.guardRoll && (canAct || me.state === 'block')) {
        if (this.react > 0) this.react--;
        else {
          this.queue.length = 0;
          return this.raw(me, th.high ? 4 : th.low || this.rng.next() < 0.3 ? 1 : 4);
        }
      }
    }

    if (this.queue.length) {
      const [d, b] = this.queue.shift();
      return this.raw(me, d, b || '');
    }

    // anti-air
    const opAir = op.state === 'air' || (op.state === 'move' && op.move.air);
    if (!opAir) this.aaRolled = false;
    else if (!this.aaRolled && canAct && op.y > 30 && dist < 210) {
      this.aaRolled = true;
      if (this.chance([0, 0.1, 0.25, 0.45, 0.65, 0.85])) {
        this.push(SEQ.dragon(this.rng.next() < 0.5 ? 'j' : 'l'));
        const [d, b] = this.queue.shift();
        return this.raw(me, d, b || '');
      }
    }

    // punish recovery
    const recovering = op.state === 'move' && op.move.hits.length && op.mf > op.move.lastActive + 1 && op.move.total - op.mf > 6;
    if (canAct && recovering && dist < 150 && this.punishSerial !== op.moveSerial) {
      this.punishSerial = op.moveSerial;
      if (this.chance([0, 0.2, 0.4, 0.6, 0.75, 0.9])) {
        const left = op.move.total - op.mf;
        if (me.power >= POWER_STOCK && left > 14 && this.rng.next() < 0.5) this.push(COMBOS.heavySuper());
        else if (dist < 95) this.push(COMBOS.jabTatsu());
        else if (left > 12) this.push(COMBOS.heavyDragon());
        else this.push(COMBOS.lowFireball());
      }
    }
    if (this.queue.length) {
      // fallthrough to queue below
    } else if (this.wait > 0) {
      this.wait--;
      return this.raw(me, this.idleDir);
    } else if (canAct) {
      this.decide(game, me, op, dist);
    }
    if (this.queue.length) {
      const [d, b] = this.queue.shift();
      return this.raw(me, d, b || '');
    }
    return this.raw(me, this.idleDir);
  }

  decide(game, me, op, dist) {
    const r = this.rng;
    const pick = (opts) => {
      let total = 0;
      for (const o of opts) total += o[0];
      let x = r.next() * total;
      for (const o of opts) if ((x -= o[0]) <= 0) return o[1]();
      return opts[opts.length - 1][1]();
    };
    const canFireball = !game.hasProjectile(me.index);
    const gauge = me.power >= POWER_STOCK;
    const opDown = op.state === 'down' || op.state === 'getup';
    this.idleDir = r.next() < 0.35 ? 4 : 5;

    if (dist > 420) {
      pick([
        [canFireball ? 3 : 0, () => this.push(SEQ.fireball(r.next() < 0.5 ? 'j' : 'l'))],
        [3, () => this.push(SEQ.dash(r.int(10, 22)))],
        [3, () => this.push(SEQ.hold(6, r.int(12, 30)))],
        [1, () => this.push(SEQ.hold(9, 4))],
      ]);
    } else if (dist > 200) {
      pick([
        [canFireball ? 2.5 : 0, () => this.push(SEQ.fireball(r.next() < 0.5 ? 'j' : 'l'))],
        [3, () => this.push(SEQ.hold(6, r.int(8, 20)))],
        [opDown ? 0 : 1.6, () => this.push(SEQ.hold(9, 4))],
        [1.5, () => this.push(SEQ.dash(r.int(6, 12)))],
        [dist < 260 ? 1.2 : 0, () => this.push(SEQ.tatsu(r.next() < 0.5 ? 'k' : 'l'))],
        [1, () => this.push(SEQ.hold(4, r.int(6, 14)))],
      ]);
    } else if (dist > 105) {
      pick([
        [2, () => this.push(SEQ.tap(5, 'k'))],
        [2, () => this.push(COMBOS.lowFireball())],
        [1.4, () => this.push(COMBOS.sweep())],
        [gauge && !opDown ? 0.7 : 0, () => this.push(SEQ.super())],
        [2.5, () => this.push(SEQ.hold(6, r.int(5, 12)))],
        [1, () => this.push(SEQ.hold(9, 4))],
        [1, () => this.push(SEQ.hold(4, r.int(8, 16)))],
        [2, () => (this.wait = r.int(6, 18))],
      ]);
    } else {
      pick([
        [2.2, () => this.push(COMBOS.jabTatsu())],
        [2, () => this.push(COMBOS.lowFireball())],
        [2, () => this.push(COMBOS.heavyDragon())],
        [opDown ? 0 : 1.6, () => this.push(COMBOS.throw())],
        [gauge ? 1.6 : 0, () => this.push(COMBOS.heavySuper())],
        [1.2, () => this.push(COMBOS.sweep())],
        [0.8, () => this.push(SEQ.backdash())],
        [1.5, () => (this.wait = r.int(4, 14))],
      ]);
    }
    if (!this.queue.length && this.wait === 0) this.wait = r.int(2, 8);
    this.wait += Math.max(0, r.int(0, 10 - this.level * 2));
  }
}
