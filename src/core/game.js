import {
  STAGE_HALF, MAX_SEPARATION, PUSH_HALF, MAX_HP, MAX_POWER, INTRO_FRAMES, JUGGLE_LIMIT, STATES,
} from './constants.js';
import { NEUTRAL } from './input.js';
import { CHARACTERS } from './characters.js';
import { MOVES, MOVE_LIST } from './moves.js';
import { Fighter } from './fighter.js';
import { RNG } from './rng.js';

const LIMB_SEG = { fha: ['fel', 'fha'], bha: ['bel', 'bha'], fft: ['fkn', 'fft'], bft: ['bkn', 'bft'] };
const UNHITTABLE = new Set(['down', 'getup', 'ko', 'grabbed', 'win']);
const BLOCK_STATES = new Set(['idle', 'walkB', 'crouch', 'block']);

const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Game {
  constructor(opts = {}) {
    this.opts = {
      p1: 'kaen', p2: 'raiden', seed: 1, roundsToWin: 2, roundTime: 99,
      skipIntro: false, training: false, ...opts,
    };
    const o = this.opts;
    this.rng = new RNG(o.seed);
    const pal2 = o.p1 === o.p2 ? 1 : 0;
    this.fighters = [new Fighter(this, 0, CHARACTERS[o.p1], 0), new Fighter(this, 1, CHARACTERS[o.p2], pal2)];
    this.events = [];
    this.frame = 0;
    this.newMatch();
  }

  newMatch() {
    this.round = 0;
    this.matchWinner = -1;
    for (const f of this.fighters) {
      f.roundsWon = 0;
      f.power = this.opts.training ? MAX_POWER : 0;
    }
    this.startRound();
  }

  startRound() {
    this.round++;
    const [a, b] = this.fighters;
    a.reset(-190, 1);
    b.reset(190, -1);
    this.projectiles = [];
    this.nextProjId = 1;
    this.timer = this.opts.roundTime * 60;
    this.superFreeze = 0;
    this.superOwner = -1;
    this.roundWinner = -1;
    this.koType = '';
    this.phase = this.opts.skipIntro ? 'fight' : 'intro';
    this.phaseT = 0;
    if (this.phase === 'intro') for (const f of this.fighters) f.state = 'intro';
    this.emit({ type: 'roundStart', round: this.round });
  }

  emit(e) {
    e.frame = this.frame;
    this.events.push(e);
  }

  // inputs: [rawP1, rawP2]; returns events produced during this frame.
  step(inputs = []) {
    this.events = [];
    this.frame++;
    this.phaseT++;
    const fighting = this.phase === 'fight';
    const ins = fighting ? [inputs[0] || NEUTRAL, inputs[1] || NEUTRAL] : [NEUTRAL, NEUTRAL];
    const [a, b] = this.fighters;

    if (this.phase === 'intro' && this.phaseT >= INTRO_FRAMES) {
      this.phase = 'fight';
      this.phaseT = 0;
      for (const f of this.fighters) {
        f.state = 'idle';
        f.sf = 0;
      }
      this.emit({ type: 'fight' });
    }

    a.prevX = a.x;
    b.prevX = b.x;
    if (this.superFreeze > 0) {
      this.superFreeze--;
      for (const f of this.fighters) {
        if (f.index === this.superOwner) f.update(ins[f.index]);
        else f.input.push(ins[f.index], f.facing);
      }
    } else {
      if (fighting && !this.opts.training) this.timer = Math.max(0, this.timer - 1);
      a.update(ins[0]);
      b.update(ins[1]);
      for (const p of this.projectiles) {
        p.x += p.vx;
        p.age++;
        p.life--;
        if (p.cooldown > 0) p.cooldown--;
      }
    }

    this.resolvePush();
    this.updateFacing();
    a.updatePose();
    b.updatePose();
    this.checkHits();
    this.projectiles = this.projectiles.filter((p) => {
      if (p.dead) return false;
      if (p.life <= 0 || Math.abs(p.x) > STAGE_HALF + 120) {
        this.emit({ type: 'projFade', id: p.id, x: p.x, y: p.y, element: p.element });
        return false;
      }
      return true;
    });
    if (this.opts.training) this.trainingRefill();
    this.checkRoundEnd();
    return this.events;
  }

  trainingRefill() {
    for (const f of this.fighters) {
      f.power = MAX_POWER;
      if (this.frame - f.lastHitFrame > 90 && !['hit', 'launch', 'down', 'ko'].includes(f.state)) f.hp = MAX_HP;
      if (f.hp <= 0) f.hp = 1;
    }
  }

  // ---------------------------------------------------------------------------
  resolvePush() {
    const [a, b] = this.fighters;
    const lo = -STAGE_HALF + PUSH_HALF;
    const hi = STAGE_HALF - PUSH_HALF;
    for (const f of this.fighters) {
      const o = f.opp;
      f.x = clamp(f.x, o.prevX - MAX_SEPARATION, o.prevX + MAX_SEPARATION);
    }
    for (let iter = 0; iter < 2; iter++) {
      const lying = (f) => f.state === 'down' || f.state === 'ko' || f.state === 'grabbed';
      if (Math.abs(a.y - b.y) < 110 && !lying(a) && !lying(b)) {
        const dx = b.x - a.x;
        const min = PUSH_HALF * 2;
        if (Math.abs(dx) < min) {
          const s = dx === 0 ? a.facing : Math.sign(dx);
          const push = (min - Math.abs(dx)) / 2;
          a.x -= s * push;
          b.x += s * push;
        }
      }
      for (const f of this.fighters) {
        const c = clamp(f.x, lo, hi);
        if (c !== f.x) {
          f.opp.x += c - f.x;
          f.x = c;
        }
      }
    }
    for (const f of this.fighters) f.x = clamp(f.x, lo, hi);
  }

  updateFacing() {
    for (const f of this.fighters) {
      if (f.y > 0) continue;
      if (['idle', 'walkF', 'walkB', 'crouch', 'land', 'jumpSquat', 'getup', 'intro'].includes(f.state)) f.faceOpponent();
    }
  }

  // ---------------------------------------------------------------------------
  toWorld(f, p) {
    return [f.x + f.facing * p[0], f.y + p[1]];
  }

  rectLocal(f, x0, x1, y0, y1) {
    const ax = f.x + f.facing * x0;
    const bx = f.x + f.facing * x1;
    return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: f.y + y0, y1: f.y + y1 };
  }

  bbox(f, pts, pad) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of pts) {
      const [x, y] = this.toWorld(f, p);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return { x0: x0 - pad, x1: x1 + pad, y0: y0 - pad, y1: y1 + pad };
  }

  hurtboxes(f) {
    if (f.isInvuln() || UNHITTABLE.has(f.state)) return [];
    if (f.state === 'launch' && (f.ko || f.juggle >= JUGGLE_LIMIT)) return [];
    const J = f.J;
    return [
      this.bbox(f, [J.hip, J.chest], 17),
      this.bbox(f, [J.head], 20),
      this.bbox(f, [J.fhp, J.fkn, J.fft, J.bhp, J.bkn, J.bft], 8),
      this.bbox(f, [J.fsh, J.fel, J.fha], 6),
    ];
  }

  hitbox(f, h) {
    if (h.box) return this.rectLocal(f, ...h.box);
    const [pa, pb] = LIMB_SEG[h.limb];
    const a = f.J[pa];
    const b = f.J[pb];
    const m = [a[0] + (b[0] - a[0]) * 0.4, a[1] + (b[1] - a[1]) * 0.4];
    return this.bbox(f, [m, b], h.r);
  }

  projRect(p) {
    return { x0: p.x - p.w / 2, x1: p.x + p.w / 2, y0: p.y - p.h / 2, y1: p.y + p.h / 2 };
  }

  checkHits() {
    const pending = [];
    for (const atk of this.fighters) {
      if (atk.state !== 'move') continue;
      const def = atk.opp;
      const hurts = this.hurtboxes(def);
      if (!hurts.length) continue;
      for (const h of atk.move.hits) {
        if (atk.mf < h.from || atk.mf > h.to || atk.hitsDone.has(h.id)) continue;
        const hb = this.hitbox(atk, h);
        if (hurts.some((r) => overlap(r, hb))) {
          pending.push({ atk, def, h, hb });
          break;
        }
      }
    }
    for (const r of pending) {
      r.atk.hitsDone.add(r.h.id);
      r.atk.contact = true;
      this.applyHit(r.atk, r.def, r.h, r.hb, r.atk.x, false);
    }

    // projectiles
    if (this.superFreeze > 0) return;
    const ps = this.projectiles;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const p = ps[i];
        const q = ps[j];
        if (p.dead || q.dead || p.owner === q.owner || !overlap(this.projRect(p), this.projRect(q))) continue;
        if (p.type === 'wave' && q.type !== 'wave') q.dead = true;
        else if (q.type === 'wave' && p.type !== 'wave') p.dead = true;
        else p.dead = q.dead = true;
        this.emit({ type: 'clash', x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
      }
    }
    for (const p of ps) {
      if (p.dead || p.cooldown > 0) continue;
      const owner = this.fighters[p.owner];
      const def = owner.opp;
      const hurts = this.hurtboxes(def);
      const pr = this.projRect(p);
      if (!hurts.some((r) => overlap(r, pr))) continue;
      p.hits--;
      const h = p.hits <= 0 && p.finalLaunch ? { ...p.hit, launch: p.finalLaunch } : p.hit;
      // A wide wave still overlaps after its center passes the body; a source
      // tied to the center would flip guard and knockback for the later hits.
      const from = Math.sign(p.vx) || owner.facing;
      this.applyHit(owner, def, h, pr, def.x - from * 80, true, p);
      p.cooldown = p.every || 0;
      if (p.hits <= 0) {
        p.dead = true;
        this.emit({ type: 'projHit', id: p.id, x: p.x, y: p.y, element: p.element, ptype: p.type });
      }
    }
  }

  isBlocking(def, level, srcX) {
    if (!BLOCK_STATES.has(def.state) || def.y > 0) return false;
    const e = def.input.cur;
    const away = e.ax !== 0 && Math.sign(e.ax) === -Math.sign(srcX - def.x || -def.facing);
    if (!away) return false;
    const low = e.ay < 0;
    if (level === 'low') return low;
    if (level === 'overhead') return !low;
    return true;
  }

  applyHit(atk, def, h, hb, srcX, isProj, proj) {
    const dir = Math.sign(def.x - srcX) || atk.facing;
    const cx = clamp((hb.x0 + hb.x1) / 2, def.x - 34, def.x + 34);
    const cy = clamp((hb.y0 + hb.y1) / 2, def.y + 25, def.y + 195);
    const element = atk.char.element;
    const blocked = this.isBlocking(def, h.level, srcX);
    const stop = h.stop;

    if (blocked) {
      def.crouching = def.input.cur.ay < 0;
      def.state = 'block';
      def.sf = 0;
      def.move = null;
      def.stun = def.stunMax = h.bs;
      def.vx = dir * h.push;
      if (h.chip) def.hp = Math.max(1, def.hp - h.chip);
      def.hitstop = stop - 2;
      if (!isProj) atk.hitstop = stop - 2;
      atk.power = Math.min(MAX_POWER, atk.power + 3);
      def.power = Math.min(MAX_POWER, def.power + 4);
      this.emit({ type: 'block', x: cx, y: cy, i: def.index, atk: atk.index, kind: h.kind, element, dir });
    } else {
      const comboing = def.state === 'hit' || def.state === 'launch' || def.state === 'grabbed';
      atk.combo = comboing ? atk.combo + 1 : 1;
      const scale = atk.combo <= 2 ? 1 : Math.max(0.4, 1 - (atk.combo - 2) * 0.12);
      const dmg = Math.max(1, Math.round(h.dmg * atk.char.dmg * scale));
      def.hp = Math.max(0, def.hp - dmg);
      def.lastHitFrame = this.frame;
      const wasCrouch = def.y <= 0 && (def.state === 'crouch' || (def.state === 'move' && def.move.crouch) || (def.state === 'block' && def.crouching));
      const airborne = def.y > 0 || def.state === 'launch';
      def.move = null;
      def.guarding = false;
      if (def.hp <= 0) def.ko = true;
      if (h.launch || airborne || def.ko) {
        const L = h.launch || { vx: 3.5, vy: 6.5 };
        def.state = 'launch';
        def.sf = 0;
        def.vx = dir * L.vx * (def.ko ? 1.4 : 1);
        def.vy = def.ko ? Math.max(L.vy, 10) : L.vy;
        def.y = Math.max(def.y, 1);
        def.juggle++;
        def.bounced = false;
      } else {
        def.state = 'hit';
        def.sf = 0;
        def.stun = def.stunMax = h.hs;
        def.crouching = wasCrouch;
        def.hitKind = h.react;
        def.vx = dir * h.push;
      }
      const hs = def.ko ? stop + 10 : stop;
      def.hitstop = hs;
      if (!isProj) atk.hitstop = hs;
      if (!isProj && Math.abs(def.x) >= STAGE_HALF - PUSH_HALF - 2) atk.vx = -dir * h.push * 0.9;
      if (h.kind !== 'super') atk.power = Math.min(MAX_POWER, atk.power + dmg * 0.14);
      def.power = Math.min(MAX_POWER, def.power + dmg * 0.07);
      this.emit({
        type: 'hit', x: cx, y: cy, i: def.index, atk: atk.index, dmg, kind: h.kind, element, dir,
        combo: atk.combo, launch: def.state === 'launch', ko: def.ko, proj: isProj ? proj.type : null, react: h.react,
      });
    }
  }

  // ---------------------------------------------------------------------------
  hasProjectile(i) {
    return this.projectiles.some((p) => p.owner === i && p.type === 'ball');
  }

  spawnProjectile(f, def) {
    const p = { ...def, id: this.nextProjId++, owner: f.index, element: f.char.element, age: 0, cooldown: 0, dead: false };
    this.projectiles.push(p);
    this.emit({ type: 'projSpawn', id: p.id, x: p.x, y: p.y, i: f.index, ptype: p.type, element: p.element });
  }

  startSuperFreeze(f, frames) {
    this.superFreeze = frames;
    this.superOwner = f.index;
    this.emit({ type: 'super', i: f.index, x: f.x, y: f.y });
  }

  tryGrab(f) {
    const o = f.opp;
    if (!f.canThrow()) return;
    o.state = 'grabbed';
    o.sf = 0;
    o.move = null;
    o.vx = o.vy = 0;
    o.facing = -f.facing;
    f.startMove('throwHit', 'l');
    this.emit({ type: 'grab', i: o.index, atk: f.index, x: o.x, y: o.y + 120 });
  }

  holdGrabbed(f, frame) {
    const o = f.opp;
    if (o.state !== 'grabbed') return;
    const hand = f.J.fha;
    o.x = f.x + f.facing * (hand[0] + 18);
    o.y = Math.max(0, hand[1] - 120);
  }

  releaseGrabbed(f) {
    const o = f.opp;
    if (o.state !== 'grabbed') return;
    const dmg = Math.round(110 * f.char.dmg);
    o.hp = Math.max(0, o.hp - dmg);
    o.lastHitFrame = this.frame;
    if (o.hp <= 0) o.ko = true;
    o.state = 'launch';
    o.sf = 0;
    o.vx = f.facing * 6;
    o.vy = 7;
    o.y = Math.max(o.y, 1);
    o.juggle = JUGGLE_LIMIT;
    o.bounced = false;
    o.hitstop = 10;
    f.hitstop = 10;
    f.combo = 1;
    f.power = Math.min(MAX_POWER, f.power + 15);
    this.emit({ type: 'hit', x: o.x, y: o.y + 80, i: o.index, atk: f.index, dmg, kind: 'heavy', element: f.char.element, dir: f.facing, combo: 1, launch: true, ko: o.ko, throw: true });
  }

  // ---------------------------------------------------------------------------
  checkRoundEnd() {
    const [a, b] = this.fighters;
    if (this.phase === 'fight') {
      const timeUp = this.timer <= 0;
      if (a.hp > 0 && b.hp > 0 && !timeUp) return;
      this.phase = 'ko';
      this.phaseT = 0;
      let w = -1;
      if (a.hp <= 0 && b.hp <= 0) w = -1;
      else if (a.hp <= 0) w = 1;
      else if (b.hp <= 0) w = 0;
      else if (a.hp !== b.hp) w = a.hp > b.hp ? 0 : 1;
      this.roundWinner = w;
      if (w >= 0) this.fighters[w].roundsWon++;
      else for (const f of this.fighters) f.roundsWon++;
      this.koType = timeUp && a.hp > 0 && b.hp > 0 ? 'time' : w >= 0 && this.fighters[w].hp === MAX_HP ? 'perfect' : w < 0 ? 'double' : 'ko';
      this.emit({ type: this.koType === 'time' ? 'timeup' : 'ko', winner: w, koType: this.koType });
    } else if (this.phase === 'ko') {
      const w = this.fighters[this.roundWinner];
      if (w && this.phaseT >= 90 && w.state !== 'win' && ['idle', 'walkF', 'walkB', 'crouch', 'land', 'block', 'hit', 'dash'].includes(w.state) && w.y <= 0) {
        w.state = 'win';
        w.sf = 0;
        w.move = null;
        w.vx = 0;
        this.emit({ type: 'win', i: w.index });
      }
      if (this.phaseT >= 230) {
        const champ = this.fighters.find((f) => f.roundsWon >= this.opts.roundsToWin);
        if (champ) {
          this.phase = 'matchOver';
          this.phaseT = 0;
          const both = this.fighters.every((f) => f.roundsWon >= this.opts.roundsToWin);
          this.matchWinner = both ? -1 : champ.index;
          this.emit({ type: 'matchOver', winner: this.matchWinner });
        } else this.startRound();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Flat feature vector from player i's perspective (see rl/README in fight_env.py).
  getObservation(i) {
    const me = this.fighters[i];
    const op = this.fighters[1 - i];
    const o = [];
    const fx = (f) => {
      o.push(f.x / STAGE_HALF, f.y / 200, f.vx / 10, f.vy / 20, f.facing, f.hp / MAX_HP, f.power / MAX_POWER);
      for (const s of STATES) o.push(f.state === s ? 1 : 0);
      for (const m of MOVE_LIST) o.push(f.state === 'move' && f.move.name === m ? 1 : 0);
      const m = f.state === 'move' ? f.move : null;
      o.push(m ? Math.min(1, f.mf / 60) : 0);
      o.push(m && f.mf >= (m.hits[0]?.from ?? 999) && f.mf <= m.lastActive ? 1 : 0);
      o.push(f.stun / 30, f.isInvuln() ? 1 : 0, f.hitstop / 20, Math.min(1, f.combo / 10), f.roundsWon / 2);
    };
    fx(me);
    fx(op);
    o.push((op.x - me.x) / MAX_SEPARATION, (op.y - me.y) / 200);
    const near = (owner) => {
      let best = null;
      for (const p of this.projectiles) if (p.owner === owner && (!best || Math.abs(p.x - me.x) < Math.abs(best.x - me.x))) best = p;
      return best;
    };
    for (const owner of [i, 1 - i]) {
      const p = near(owner);
      o.push(p ? 1 : 0, p ? (p.x - me.x) / MAX_SEPARATION : 0, p ? (p.y - me.y) / 200 : 0, p ? p.vx / 10 : 0, p ? (p.type === 'wave' ? 1 : 0) : 0);
    }
    o.push(this.timer / (this.opts.roundTime * 60), this.superFreeze > 0 ? 1 : 0, this.phase === 'fight' ? 1 : 0);
    return o;
  }

  static get observationSize() {
    return 2 * (7 + STATES.length + MOVE_LIST.length + 7) + 2 + 10 + 3;
  }

  static get moveList() {
    return MOVE_LIST;
  }
}

export { MOVES };
