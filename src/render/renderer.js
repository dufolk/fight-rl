import { Stage, VIEW_W, VIEW_H, GROUND_Y } from './stage.js';
import { Camera } from './camera.js';
import { Effects, drawBolt } from './effects.js';
import { FighterRenderer } from './fighterRenderer.js';
import { HUD, bigText, FONT_CN, FONT_EN } from './hud.js';
import { glowSprite, ELEMENTS, rgba, clamp } from './util.js';
import { MAX_POWER } from '../core/constants.js';

const SHAKE = { light: 2.5, mid: 4.5, heavy: 8, special: 8, super: 11 };
const rnd = (a, b) => a + Math.random() * (b - a);

export class Renderer {
  constructor(canvas, audio = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = audio;
    this.stage = new Stage();
    this.camera = new Camera();
    this.fx = new Effects();
    this.game = null;
    this.debug = false;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.time = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const s = Math.min(w / VIEW_W, h / VIEW_H);
    this.view = { dpr, s, ox: (w - VIEW_W * s) / 2, oy: (h - VIEW_H * s) / 2 };
  }

  attach(game) {
    this.game = game;
    this.fr = game.fighters.map((f) => new FighterRenderer(f.char, f.palette));
    this.hud = new HUD(this.fr);
    this.camera.snap(game);
    this.fx.clear();
    this.burn = [0, 0];
    this.hitFlash = [0, 0];
    this.superCut = null;
  }

  // ---- simulation step hooks --------------------------------------------------
  onStep(events) {
    const g = this.game;
    const a = this.audio;
    for (const e of events) {
      this.hud.onEvent(e);
      switch (e.type) {
        case 'hit': {
          const special = e.kind === 'special' || e.kind === 'super';
          this.fx.hitSpark(e.x, -e.y, e.dir, e.kind, e.element, special);
          this.camera.shake(SHAKE[e.kind] || 4);
          this.hitFlash[e.i] = 5;
          this.stage.excite = Math.min(1.2, this.stage.excite + 0.08 + e.combo * 0.05);
          if (special) this.burn[e.i] = Math.max(this.burn[e.i], e.kind === 'super' ? 50 : 30);
          if (e.ko) {
            this.fx.bigImpact(e.x, -e.y, e.element);
            this.flash = 0.9;
            this.flashColor = '#ffffff';
            this.camera.shake(22);
            this.stage.excite = 1.4;
          }
          a?.hit(e.kind, e.ko);
          break;
        }
        case 'block':
          this.fx.blockSpark(e.x, -e.y, e.dir);
          this.camera.shake(2);
          a?.block();
          break;
        case 'projSpawn': {
          const E = ELEMENTS[e.element];
          this.fx.glow(e.x, -e.y, E.main, { size: e.ptype === 'wave' ? 500 : 200, life: 12, grow: 6 });
          this.fx.ring(e.x, -e.y, E.main, { r0: 10, r1: e.ptype === 'wave' ? 260 : 110, life: 14, w: 6 });
          if (e.ptype === 'wave') {
            this.camera.shake(14);
            this.flash = 0.5;
            this.flashColor = E.main;
          }
          a?.projectile(e.element, e.ptype === 'wave');
          break;
        }
        case 'projHit':
        case 'projFade':
        case 'clash': {
          const el = e.element || 'fire';
          const E = ELEMENTS[el];
          this.fx.glow(e.x, -e.y, E.main, { size: 220, life: 14, grow: 5 });
          this.fx.ring(e.x, -e.y, E.spark, { r0: 10, r1: 120, life: 12, w: 5 });
          for (let i = 0; i < 18; i++) this.fx.spark(e.x, -e.y, E.spark, { speed: rnd(3, 10) });
          if (el === 'fire') for (let i = 0; i < 10; i++) this.fx.flame(e.x + rnd(-20, 20), -e.y + rnd(-20, 20), el, { vx: rnd(-3, 3), vy: rnd(-4, 1) });
          if (e.type === 'clash') {
            this.camera.shake(6);
            a?.hit('heavy');
          }
          break;
        }
        case 'super': {
          this.superCut = { i: e.i, t: 0 };
          this.flash = 0.6;
          this.flashColor = ELEMENTS[g.fighters[e.i].char.element].main;
          a?.superStart(g.fighters[e.i].char.element);
          break;
        }
        case 'land':
          if (e.heavy) this.fx.dust(e.x, 5);
          a?.land();
          break;
        case 'down':
          this.fx.dust(e.x, 10, 0);
          this.camera.shake(6);
          a?.land(true);
          break;
        case 'bounce':
          this.fx.dust(e.x, 12, 0);
          this.camera.shake(9);
          this.fx.ring(e.x, 0, '#ffd8a0', { r0: 10, r1: 160, sy: 0.18, life: 16, w: 5 });
          a?.land(true);
          break;
        case 'dash':
        case 'backdash':
          this.fx.dust(e.x, 4, e.type === 'dash' ? -g.fighters[e.i].facing : g.fighters[e.i].facing);
          a?.whoosh(false);
          break;
        case 'jump':
          this.fx.dust(e.x, 3);
          break;
        case 'move':
          if (e.name !== 'throwHit') a?.whoosh(e.special);
          if (e.name === 'dragon' || e.name === 'tatsu') a?.element(g.fighters[e.i].char.element);
          break;
        case 'grab':
          this.fx.glow(e.x, -e.y, '#ffffff', { size: 90, life: 6 });
          a?.block();
          break;
        case 'ko':
        case 'timeup':
          a?.ko();
          break;
        case 'roundStart':
          this.fx.clear();
          this.camera.snap(g);
          break;
        case 'fight':
          this.flash = 0.35;
          this.flashColor = '#ffffff';
          break;
      }
    }
    for (let i = 0; i < 2; i++) {
      const f = g.fighters[i];
      this.fr[i].tick(f);
      this.emitContinuous(f, i);
    }
    for (const p of g.projectiles) this.emitProjectile(p);
  }

  emitContinuous(f, i) {
    const el = f.char.element;
    const E = ELEMENTS[el];
    const W = (p) => [f.x + f.facing * p[0], -(f.y + p[1])];
    const m = f.state === 'move' ? f.move : null;
    const fire = el === 'fire';
    if (m && m.name === 'dragon' && f.mf >= 2 && f.mf < 22) {
      const h = W(f.J.fha);
      const e = W(f.J.fel);
      for (let k = 0; k < (fire ? 5 : 2); k++) {
        const t = Math.random();
        const x = e[0] + (h[0] - e[0]) * t;
        const y = e[1] + (h[1] - e[1]) * t;
        if (fire) this.fx.flame(x + rnd(-8, 8), y + rnd(-8, 8), el, { vx: rnd(-1, 1), vy: rnd(-3, 0), size: rnd(26, 48) });
        else this.fx.glow(x, y, E.main, { size: rnd(30, 60), life: 8 });
      }
      if (!fire && f.game.frame % 2 === 0) this.fx.bolt(h[0], h[1], h[0] + rnd(-60, 60), h[1] + rnd(10, 90), E.main, { life: 4 });
    }
    if (m && m.name === 'tatsu' && f.mf > 6 && f.mf < 44) {
      const c = W([0, 70]);
      const a = f.game.frame * 0.9;
      for (let k = 0; k < 2; k++) {
        const aa = a + k * Math.PI;
        const x = c[0] + Math.cos(aa) * 80;
        const y = c[1] + Math.sin(aa) * 18;
        if (fire) this.fx.flame(x, y, el, { vx: -Math.sin(aa) * 3, vy: rnd(-2, 0), size: rnd(20, 34), life: 16 });
        else this.fx.glow(x, y, E.main, { size: 40, life: 10 });
      }
      if (f.game.frame % 3 === 0) this.fx.ring(c[0], c[1], E.spark, { r0: 40, r1: 100, sy: 0.25, life: 8, w: 3 });
    }
    if (m && m.name === 'super' && f.mf < 50) {
      for (let k = 0; k < 4; k++) {
        const x = f.x + rnd(-45, 45);
        const y = -(f.y + rnd(0, 40));
        if (fire) this.fx.flame(x, y, el, { vy: rnd(-7, -3), size: rnd(30, 60), life: rnd(18, 30) });
        else this.fx.glow(x, y, E.main, { vy: rnd(-6, -2), size: rnd(30, 60), life: 18 });
      }
      if (!fire && f.game.frame % 2 === 0) this.fx.bolt(f.x + rnd(-60, 60), -260, f.x + rnd(-30, 30), 0, E.main, { life: 5, w: 3 });
      if (f.mf % 6 === 0) this.fx.ring(f.x, 0, E.main, { r0: 30, r1: 180, sy: 0.2, life: 14, w: 5 });
    }
    if (m && m.name === 'fireball' && f.mf >= 6 && f.mf <= 12) {
      const h = W(f.J.fha);
      this.fx.glow(h[0], h[1], E.main, { size: 30 + f.mf * 6, life: 4 });
    }
    if (this.burn[i] > 0) {
      this.burn[i]--;
      if (this.burn[i] % 2 === 0) {
        const p = W(f.J.chest);
        if (fire) this.fx.flame(p[0] + rnd(-25, 25), p[1] + rnd(-30, 40), el, { vy: rnd(-3, -1), size: rnd(18, 34) });
        else if (this.burn[i] % 4 === 0) this.fx.bolt(p[0] + rnd(-30, 30), p[1] + rnd(-40, 20), p[0] + rnd(-40, 40), p[1] + rnd(-40, 60), E.main, { life: 4, w: 1.8, disp: 14 });
      }
    }
    if (f.power >= MAX_POWER && f.game.frame % 5 === 0 && f.state !== 'ko') {
      const x = f.x + rnd(-30, 30);
      const y = -(f.y + rnd(10, 160));
      this.fx.glow(x, y, E.main, { vy: -1.2, size: rnd(14, 26), life: 22, alpha: 0.7 });
    }
    if (f.state === 'win' && fire && f.game.frame % 2 === 0) {
      const h = W(f.J.fha);
      this.fx.flame(h[0] + rnd(-6, 6), h[1], el, { vy: rnd(-4, -2), size: rnd(20, 36) });
    }
    if (f.state === 'win' && !fire && f.game.frame % 9 === 0) {
      const c = W(f.J.chest);
      this.fx.bolt(c[0] + rnd(-40, 40), c[1] - 120, c[0] + rnd(-20, 20), c[1] + rnd(-20, 40), E.main, { life: 5 });
    }
  }

  emitProjectile(p) {
    const E = ELEMENTS[p.element];
    const fire = p.element === 'fire';
    const y = -p.y;
    if (p.type === 'ball') {
      for (let k = 0; k < (fire ? 4 : 2); k++) {
        if (fire) this.fx.flame(p.x + rnd(-14, 14), y + rnd(-14, 14), p.element, { vx: -p.vx * 0.5 + rnd(-1, 1), vy: rnd(-1.5, 0.5), size: rnd(28, 50), life: rnd(12, 22) });
        else this.fx.glow(p.x + rnd(-10, 10), y + rnd(-10, 10), E.main, { vx: -p.vx * 0.4, size: rnd(20, 40), life: 12 });
      }
    } else {
      for (let k = 0; k < (fire ? 10 : 4); k++) {
        const x = p.x + rnd(-p.w / 2, p.w / 2);
        const yy = y + rnd(-p.h / 2, p.h / 2);
        if (fire) this.fx.flame(x, yy, p.element, { vx: p.vx * 0.3, vy: rnd(-6, -2), size: rnd(40, 80), life: rnd(16, 28) });
        else this.fx.glow(x, yy, E.main, { vy: rnd(-3, 0), size: rnd(30, 70), life: 14 });
      }
      if (!fire) this.fx.bolt(p.x + rnd(-p.w / 2, p.w / 2), -320, p.x + rnd(-p.w / 2, p.w / 2), 0, E.main, { life: 4, w: 4, disp: 40 });
    }
  }

  // ---- drawing --------------------------------------------------------------------
  drawProjectiles(ctx) {
    const t = this.time;
    for (const p of this.game.projectiles) {
      const E = ELEMENTS[p.element];
      const y = -p.y;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (p.type === 'ball') {
        const s = 150 + Math.sin(t * 0.6) * 12;
        ctx.drawImage(glowSprite(E.main, 0.15), p.x - s / 2, y - s / 2, s, s);
        ctx.drawImage(glowSprite(E.core, 0.4), p.x - 32, y - 32, 64, 64);
        ctx.strokeStyle = E.spark;
        ctx.lineWidth = 3;
        for (let k = 0; k < 3; k++) {
          const a = t * 0.35 * Math.sign(p.vx) + (k * Math.PI * 2) / 3;
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.ellipse(p.x, y, 30, 22, 0, a, a + 1.6);
          ctx.stroke();
        }
        if (p.element === 'thunder') {
          for (let k = 0; k < 3; k++) {
            const a = Math.random() * Math.PI * 2;
            drawBolt(ctx, p.x, y, p.x + Math.cos(a) * 46, y + Math.sin(a) * 46, E.main, 1.6, 12);
          }
        }
      } else {
        const g = ctx.createLinearGradient(p.x - p.w / 2, 0, p.x + p.w / 2, 0);
        g.addColorStop(0, rgba(E.deep, 0));
        g.addColorStop(0.5, rgba(E.main, 0.55));
        g.addColorStop(1, rgba(E.deep, 0));
        ctx.fillStyle = g;
        ctx.fillRect(p.x - p.w / 2, y - p.h / 2 - 40, p.w, p.h + 40);
        ctx.drawImage(glowSprite(E.main, 0.12), p.x - 200, y - 220, 400, 440);
        ctx.drawImage(glowSprite(E.core, 0.4), p.x - 60, y - 90, 120, 180);
      }
      ctx.restore();
    }
  }

  fighterView(f) {
    return { x: f.x + (f.hitstop > 0 && (f.state === 'hit' || f.state === 'launch' || f.state === 'block') ? Math.sin(this.time * 3.7) * 3 : 0), y: f.y, facing: f.facing, J: f.J, state: f.state, vx: f.vx };
  }

  glowFor(f) {
    if (f.state !== 'move' || !f.move.special) return 0;
    return 0.9;
  }

  drawFighters(ctx, dt) {
    const g = this.game;
    const order = [0, 1];
    const a = g.fighters[0];
    const b = g.fighters[1];
    const pri = (f) => (f.state === 'move' ? 2 : f.state === 'hit' || f.state === 'launch' ? 0 : 1);
    if (pri(a) > pri(b) || (g.superFreeze > 0 && g.superOwner === 0)) order.reverse();
    if (g.superFreeze > 0 && g.superOwner === 1) order.splice(0, 2, 0, 1);

    // floor reflections
    ctx.save();
    ctx.scale(1, -0.45);
    ctx.globalAlpha = 0.14;
    for (const i of order) this.fr[i].draw(ctx, this.fighterView(g.fighters[i]), {});
    ctx.restore();

    // shadows
    for (const f of g.fighters) {
      const k = clamp(1 - f.y / 400, 0.3, 1);
      const sg = ctx.createRadialGradient(f.x, 0, 4, f.x, 0, 70 * k);
      sg.addColorStop(0, 'rgba(10,0,10,0.55)');
      sg.addColorStop(1, 'rgba(10,0,10,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.ellipse(f.x, 2, 70 * k, 14 * k, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const i of order) {
      const f = g.fighters[i];
      const r = this.fr[i];
      r.drawAfterimages(ctx);
      const v = this.fighterView(f);
      r.draw(ctx, v, { cloth: true, dt, glow: this.glowFor(f) });
      if (this.hitFlash[i] > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(0.8, this.hitFlash[i] / 5);
        r.draw(ctx, v, { flat: '#ffffff', noCloth: true });
        ctx.restore();
        this.hitFlash[i] = Math.max(0, this.hitFlash[i] - dt);
      }
      r.drawTrail(ctx);
    }
  }

  drawDebug(ctx) {
    const g = this.game;
    const rect = (r, c) => {
      ctx.strokeStyle = c;
      ctx.fillStyle = c.replace('1)', '0.15)');
      ctx.fillRect(r.x0, -r.y1, r.x1 - r.x0, r.y1 - r.y0);
      ctx.strokeRect(r.x0, -r.y1, r.x1 - r.x0, r.y1 - r.y0);
    };
    ctx.save();
    ctx.lineWidth = 1.5;
    for (const f of g.fighters) {
      for (const r of g.hurtboxes(f)) rect(r, 'rgba(60,255,120,1)');
      if (f.state === 'move') for (const h of f.move.hits) if (f.mf >= h.from && f.mf <= h.to) rect(g.hitbox(f, h), 'rgba(255,40,40,1)');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(f.x - 1, -6, 2, 12);
    }
    for (const p of g.projectiles) rect(g.projRect(p), 'rgba(255,200,40,1)');
    ctx.restore();
  }

  drawSuperCut(ctx, dt) {
    const sc = this.superCut;
    if (!sc) return;
    sc.t += dt;
    const T = 42;
    if (sc.t > T) {
      this.superCut = null;
      return;
    }
    const f = this.game.fighters[sc.i];
    const E = ELEMENTS[f.char.element];
    const inK = clamp(sc.t / 8, 0, 1);
    const outK = clamp((T - sc.t) / 8, 0, 1);
    const left = f.facing > 0;
    ctx.save();
    ctx.globalAlpha = outK;
    const cy = VIEW_H * 0.5;
    const hh = 110 * inK;
    ctx.beginPath();
    ctx.moveTo(0, cy - hh + 40);
    ctx.lineTo(VIEW_W, cy - hh - 40);
    ctx.lineTo(VIEW_W, cy + hh - 40);
    ctx.lineTo(0, cy + hh + 40);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, cy - hh, 0, cy + hh);
    g.addColorStop(0, rgba(E.deep, 0.95));
    g.addColorStop(0.5, rgba(E.dark, 0.95));
    g.addColorStop(1, rgba(E.deep, 0.95));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 24; k++) {
      const yy = cy - 120 + ((k * 37) % 240);
      const xx = ((sc.t * 60 * (left ? 1 : -1) + k * 211) % (VIEW_W + 400)) - 200;
      ctx.fillStyle = rgba(E.spark, 0.25);
      ctx.fillRect(left ? xx : VIEW_W - xx, yy, 220, 2);
    }
    const px = left ? 260 - (1 - inK) * 300 + sc.t * 1.5 : VIEW_W - 260 + (1 - inK) * 300 - sc.t * 1.5;
    ctx.globalCompositeOperation = 'source-over';
    this.fr[sc.i].drawPortrait(ctx, px, cy + 20, 6.2, !left);
    ctx.restore();
    const tx = left ? VIEW_W - 360 + (1 - inK) * 200 : 360 - (1 - inK) * 200;
    bigText(ctx, f.char.superName, tx, cy - 14, 76, { font: FONT_CN, grad: [[0, '#ffffff'], [0.5, E.spark], [1, E.main]], glow: E.main });
    bigText(ctx, 'SUPER  SPECIAL', tx, cy + 50, 28, { font: FONT_EN, grad: [[0, '#ffffff'], [1, E.spark]] });
    ctx.restore();
  }

  draw(dt) {
    const ctx = this.ctx;
    const g = this.game;
    const v = this.view;
    this.time += dt;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(v.dpr * v.s, 0, 0, v.dpr * v.s, v.dpr * v.ox, v.dpr * v.oy);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW_W, VIEW_H);
    ctx.clip();

    this.stage.update(dt);
    this.camera.update(g, dt);
    this.fx.update(dt);
    this.hud.update(g, dt);
    for (const r of this.fr) r.update(dt);

    this.stage.drawBack(ctx, this.camera.view);
    if (g.superFreeze > 0 || this.superCut) {
      ctx.fillStyle = `rgba(4,0,16,${0.62 * clamp(g.superFreeze / 10, 0, 1)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    ctx.save();
    this.camera.apply(ctx);
    this.drawFighters(ctx, dt);
    this.drawProjectiles(ctx);
    this.fx.draw(ctx);
    if (this.debug) this.drawDebug(ctx);
    ctx.restore();
    this.stage.drawFront(ctx, this.camera.view);
    this.drawSuperCut(ctx, dt);
    if (this.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.flash;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
      this.flash = Math.max(0, this.flash - 0.06 * dt);
    }
    this.hud.draw(ctx, g);
    ctx.restore();
  }
}

export { VIEW_W, VIEW_H, GROUND_Y };
