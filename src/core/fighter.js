import { GRAVITY, MAX_HP, MAX_POWER, POWER_STOCK } from './constants.js';
import { InputBuffer, QCF, QCB, DP, SUPER } from './input.js';
import { MOVES } from './moves.js';
import { statePose } from './anims.js';
import { joints } from './pose.js';

const BLOCKABLE = new Set(['idle', 'walkB', 'crouch', 'block']);
const NO_THROW = new Set(['hit', 'block', 'launch', 'down', 'getup', 'grabbed', 'ko', 'backdash', 'win', 'intro']);

export class Fighter {
  constructor(game, index, char, palette = 0) {
    this.game = game;
    this.index = index;
    this.char = char;
    this.palette = palette;
    this.input = new InputBuffer();
    this.roundsWon = 0;
    this.power = 0;
    this.moveSerial = 0;
    this.reset(0, 1);
  }

  reset(x, facing) {
    Object.assign(this, {
      x, y: 0, vx: 0, vy: 0, prevX: x, facing, hp: MAX_HP,
      state: 'idle', sf: 0, move: null, mf: 0, strength: 'j',
      hitstop: 0, stun: 0, stunMax: 1, invuln: 0,
      contact: false, juggle: 0, airAttacked: false, jumpDir: 0, jumpRun: false, landLag: 0,
      combo: 0, ko: false, hitKind: 'body', crouching: false, guarding: false, bounced: false,
      grabbed: null, lastHitFrame: -999,
    });
    this.hitsDone = new Set();
    this.input.reset();
    this.updatePose();
  }

  get opp() {
    return this.game.fighters[1 - this.index];
  }

  setState(s) {
    if (this.state !== s) {
      this.state = s;
      this.sf = 0;
    }
  }

  isInvuln() {
    if (this.invuln > 0) return true;
    const m = this.move;
    return this.state === 'move' && !!m.inv && this.mf >= m.inv[0] && this.mf <= m.inv[1];
  }

  faceOpponent() {
    const dx = this.opp.x - this.x;
    if (Math.abs(dx) > 1) this.facing = Math.sign(dx);
  }

  updatePose() {
    this.pose = statePose(this);
    this.J = joints(this.pose);
  }

  // ---------------------------------------------------------------------------
  update(raw) {
    this.input.push(raw, this.facing);
    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }
    this.sf++;
    if (this.invuln > 0) this.invuln--;
    switch (this.state) {
      case 'intro':
      case 'win':
        this.vx = 0;
        break;
      case 'idle':
      case 'walkF':
      case 'walkB':
      case 'crouch':
        this.groundControl();
        break;
      case 'dash':
        this.dashControl();
        break;
      case 'backdash':
        this.y = this.sf < 16 ? 18 * Math.sin((Math.PI * this.sf) / 16) : 0;
        this.vx *= 0.92;
        if (this.sf >= 22) this.toNeutral();
        break;
      case 'jumpSquat':
        if (this.sf >= 4) this.doJump();
        break;
      case 'air':
        if (!this.airAttacked) this.tryAirAttack();
        break;
      case 'land':
        this.vx *= 0.6;
        if (this.sf >= this.landLag) this.toNeutral();
        break;
      case 'move':
        this.runMove();
        break;
      case 'hit':
      case 'block':
        this.vx *= 0.82;
        if (this.state === 'block') this.crouching = this.input.cur.ay < 0;
        if (--this.stun <= 0) this.toNeutral();
        break;
      case 'down':
        this.vx *= 0.8;
        if (!this.ko && this.sf >= 34) {
          this.setState('getup');
          this.invuln = 24;
        }
        break;
      case 'getup':
        if (this.sf >= 21) this.toNeutral();
        break;
      case 'ko':
        this.vx *= 0.85;
        break;
    }
    this.physics();
  }

  physics() {
    if (this.state === 'grabbed') return;
    this.x += this.vx;
    const airborne = this.state === 'air' || this.state === 'launch' || (this.state === 'move' && this.move.air && (this.y > 0 || this.vy > 0));
    if (!airborne) return;
    this.vy -= this.state === 'launch' ? GRAVITY * 0.9 : GRAVITY;
    this.y += this.vy;
    if (this.y <= 0) {
      this.y = 0;
      this.onLand();
    }
  }

  onLand() {
    const vy = this.vy;
    this.vy = 0;
    if (this.state === 'launch') {
      if (!this.bounced && vy < -6) {
        this.bounced = true;
        this.vy = 4.5;
        this.y = 0.1;
        this.vx *= 0.5;
        this.game.emit({ type: 'bounce', i: this.index, x: this.x });
        return;
      }
      this.vx *= 0.3;
      this.juggle = 0;
      this.setState(this.ko ? 'ko' : 'down');
      this.game.emit({ type: 'down', i: this.index, x: this.x });
      return;
    }
    const lag = this.state === 'move' ? this.move.landLag || 5 : 3;
    this.vx = 0;
    this.move = null;
    this.landLag = lag;
    this.state = 'land';
    this.sf = 0;
    this.game.emit({ type: 'land', i: this.index, x: this.x, heavy: lag > 6 });
  }

  toNeutral() {
    this.move = null;
    this.state = this.input.cur.ay < 0 ? 'crouch' : 'idle';
    this.sf = 0;
    this.y = 0;
  }

  threatened() {
    const o = this.opp;
    const dist = Math.abs(o.x - this.x);
    if (o.state === 'move' && dist < 280 && o.mf <= o.move.lastActive + 2) return true;
    return this.game.projectiles.some((p) => p.owner !== this.index && Math.abs(p.x - this.x) < 300 && Math.sign(p.vx) === Math.sign(this.x - p.x));
  }

  groundControl() {
    const inp = this.input;
    const d = inp.dir;
    const back = d === 4 || d === 1;
    this.guarding = back && this.threatened();
    if (this.tryAttack()) return;
    if (d >= 7) {
      this.jumpDir = d === 7 ? -1 : d === 9 ? 1 : 0;
      this.jumpRun = false;
      this.setState('jumpSquat');
      this.vx = 0;
      return;
    }
    if (inp.doubleTap(6)) {
      this.setState('dash');
      this.game.emit({ type: 'dash', i: this.index, x: this.x });
      return;
    }
    if (inp.doubleTap(4)) {
      this.setState('backdash');
      this.invuln = 8;
      this.vx = -7.5 * this.facing;
      this.game.emit({ type: 'backdash', i: this.index, x: this.x });
      return;
    }
    if (d <= 3) {
      this.setState('crouch');
      this.vx = 0;
    } else if (d === 6) {
      this.setState('walkF');
      this.vx = this.char.walk * this.facing;
    } else if (d === 4) {
      this.setState('walkB');
      this.vx = this.guarding ? 0 : -this.char.back * this.facing;
    } else {
      this.setState('idle');
      this.vx *= 0.6;
    }
  }

  dashControl() {
    if (this.tryAttack()) return;
    const d = this.input.dir;
    if (d >= 7) {
      this.jumpDir = d === 7 ? -1 : d === 9 ? 1 : 0;
      this.jumpRun = true;
      this.setState('jumpSquat');
      return;
    }
    if (d === 6) this.vx = this.char.run * this.facing;
    else {
      this.setState('idle');
      this.vx = this.char.run * 0.5 * this.facing;
    }
  }

  doJump() {
    this.vy = this.jumpRun ? 15.5 : 17;
    this.vx = this.jumpDir * (this.jumpRun ? 6.4 : 4.1) * this.facing;
    this.y = 0.1;
    this.airAttacked = false;
    this.setState('air');
    this.game.emit({ type: 'jump', i: this.index, x: this.x });
  }

  // ---------------------------------------------------------------------------
  buttons() {
    const inp = this.input;
    return { pj: inp.pressed('j'), pk: inp.pressed('k'), pl: inp.pressed('l') };
  }

  pickSpecial(pj, pk, pl) {
    const inp = this.input;
    if (this.power >= POWER_STOCK) {
      if ((pj || pk) && inp.together('j', 'k')) return ['super', 'l'];
      if (pl && inp.motion(SUPER, 36, 10) >= 0) return ['super', 'l'];
    }
    const s = pl ? 'l' : 'j';
    if (pj || pl) {
      const dp = inp.motion(DP);
      const qcf = inp.motion(QCF);
      if (dp >= 0 && (qcf < 0 || dp <= qcf)) return ['dragon', s];
      if (qcf >= 0 && !this.game.hasProjectile(this.index)) return ['fireball', s];
    }
    if ((pk || pl) && inp.motion(QCB) >= 0) return ['tatsu', pl ? 'l' : 'k'];
    return null;
  }

  pickNormal(pj, pk, pl) {
    const d = this.input.dir;
    if (pl && (d === 6 || d === 4) && this.canThrow()) return ['throw', 'l'];
    if (d <= 3) {
      if (pl) return ['sweep', 'l'];
      if (pk) return ['crKick', 'k'];
      if (pj) return ['crJab', 'j'];
    }
    if (pl) return ['heavy', 'l'];
    if (pk) return ['kick', 'k'];
    if (pj) return ['jab', 'j'];
    return null;
  }

  canThrow() {
    const o = this.opp;
    if (Math.abs(o.x - this.x) > 92 || o.y > 0 || o.isInvuln() || NO_THROW.has(o.state)) return false;
    return !(o.state === 'move' && o.move.air);
  }

  tryAttack() {
    const { pj, pk, pl } = this.buttons();
    if (!pj && !pk && !pl) return false;
    const pick = this.pickSpecial(pj, pk, pl) || this.pickNormal(pj, pk, pl);
    if (!pick) return false;
    this.startMove(pick[0], pick[1]);
    return true;
  }

  tryAirAttack() {
    const { pj, pk, pl } = this.buttons();
    const name = pl ? 'jHeavy' : pk ? 'jKick' : pj ? 'jJab' : null;
    if (!name) return false;
    this.airAttacked = true;
    this.startMove(name, pl ? 'l' : pk ? 'k' : 'j');
    return true;
  }

  startMove(name, strength = 'j') {
    const m = MOVES[name];
    if (!m.air || name === 'dragon') this.faceOpponent();
    this.move = m;
    this.mf = 0;
    this.strength = strength;
    this.state = 'move';
    this.sf = 0;
    this.hitsDone.clear();
    this.contact = false;
    this.guarding = false;
    this.moveSerial++;
    if (m.cost) this.power -= m.cost;
    if (m.special && !m.superMove) this.power = Math.min(MAX_POWER, this.power + 4);
    this.input.consume();
    this.game.emit({ type: 'move', i: this.index, name, special: !!m.special, x: this.x });
    if (m.update) m.update(0, this, this.game);
  }

  runMove() {
    const m = this.move;
    this.mf++;
    const f = this.mf;
    const { pj, pk, pl } = this.buttons();
    if (pj || pk || pl) {
      if (m.cancel && this.contact && f >= m.cancel.from && f <= m.cancel.to) {
        let pick = this.pickSpecial(pj, pk, pl);
        if (!pick && m.cancel.chain) {
          const n = this.pickNormal(pj, pk, pl);
          if (n && m.cancel.chain.includes(n[0])) pick = n;
        }
        if (pick) {
          this.startMove(pick[0], pick[1]);
          return;
        }
      }
      if (m.normal && f <= 3 && this.power >= POWER_STOCK && this.input.together('j', 'k')) {
        this.startMove('super', 'l');
        return;
      }
    }
    if (!m.air && !m.script) this.vx *= 0.75;
    if (m.update) m.update(f, this, this.game);
    if (this.move !== m || this.state !== 'move') return;
    if (f >= m.total) {
      if (m.air) {
        this.move = null;
        this.state = 'air';
        this.sf = 30;
      } else this.toNeutral();
    }
  }
}
