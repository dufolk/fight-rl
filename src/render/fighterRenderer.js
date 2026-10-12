import { clamp, shade, rgba, glowSprite, ELEMENTS } from './util.js';

const OUTLINE = '#140c12';
const LIGHT = [-0.55, -0.83];
const D2R = Math.PI / 180;
const KEYS = ['hip', 'chest', 'head', 'fsh', 'bsh', 'fel', 'fha', 'bel', 'bha', 'fhp', 'bhp', 'fkn', 'fft', 'bkn', 'bft', 'ftoe', 'btoe'];

const SKULL = [[-15, 2], [-12, 12], [-3, 17], [8, 14.5], [14, 8], [16, 1.5], [18.5, -3], [15.5, -5.5], [15.5, -9], [12, -13.5], [4, -15.5], [-5, -12.5], [-12, -7]];

function tone(c) {
  return { hi: shade(c, 0.38), base: c, sh: shade(c, -0.4), bhi: shade(c, 0.06), bbase: shade(c, -0.24), bsh: shade(c, -0.52) };
}

function capsulePath(ctx, a, b, r1, r2) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 0.001;
  const ang = Math.atan2(dy, dx);
  const phi = Math.asin(clamp((r1 - r2) / L, -0.95, 0.95));
  ctx.beginPath();
  ctx.arc(b[0], b[1], r2, ang - Math.PI / 2 + phi, ang + Math.PI / 2 - phi);
  ctx.arc(a[0], a[1], r1, ang + Math.PI / 2 - phi, ang + (3 * Math.PI) / 2 + phi);
  ctx.closePath();
}

function smoothClosed(ctx, pts) {
  const n = pts.length;
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  ctx.beginPath();
  const m0 = mid(pts[n - 1], pts[0]);
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % n]);
    ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  ctx.closePath();
}

class Chain {
  constructor(n, seg, w0, w1) {
    this.n = n;
    this.seg = seg;
    this.w0 = w0;
    this.w1 = w1;
    this.pts = null;
  }
  step(anchor, dt, wind) {
    if (!this.pts || Math.hypot(this.pts[0].x - anchor[0], this.pts[0].y - anchor[1]) > 150) {
      this.pts = Array.from({ length: this.n }, (_, i) => ({ x: anchor[0], y: anchor[1] + i * this.seg, px: anchor[0], py: anchor[1] + i * this.seg }));
    }
    const p = this.pts;
    p[0].x = anchor[0];
    p[0].y = anchor[1];
    const k = Math.min(dt, 2);
    for (let i = 1; i < p.length; i++) {
      const q = p[i];
      const vx = (q.x - q.px) * 0.9;
      const vy = (q.y - q.py) * 0.9;
      q.px = q.x;
      q.py = q.y;
      q.x += vx + wind * k * (0.4 + i * 0.12);
      q.y += vy + 0.42 * k;
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < p.length; i++) {
        const a = p[i - 1];
        const b = p[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const diff = (d - this.seg) / d;
        if (i === 1) {
          b.x -= dx * diff;
          b.y -= dy * diff;
        } else {
          a.x += dx * diff * 0.5;
          a.y += dy * diff * 0.5;
          b.x -= dx * diff * 0.5;
          b.y -= dy * diff * 0.5;
        }
      }
      p[0].x = anchor[0];
      p[0].y = anchor[1];
    }
  }
  draw(ctx, color, hi, flat) {
    const p = this.pts;
    if (!p) return;
    const n = p.length;
    for (const pass of flat ? [1] : [0, 1]) {
      for (let i = 1; i < n; i++) {
        const w = this.w0 + (this.w1 - this.w0) * (i / (n - 1));
        ctx.lineWidth = pass === 0 ? w + 3 : w;
        ctx.strokeStyle = pass === 0 ? OUTLINE : flat || (i % 2 ? color : hi);
        ctx.beginPath();
        ctx.moveTo(p[i - 1].x, p[i - 1].y);
        ctx.lineTo(p[i].x, p[i].y);
        ctx.stroke();
      }
    }
  }
}

export class FighterRenderer {
  constructor(char, palIdx = 0) {
    this.char = char;
    this.pal = char.palettes[palIdx];
    this.el = ELEMENTS[char.element];
    this.t = {};
    for (const k of ['skin', 'hair', 'jacket', 'shirt', 'pants', 'belt', 'band', 'glove', 'shoe']) this.t[k] = tone(this.pal[k]);
    this.tails = [new Chain(8, 7, 5, 2.5), new Chain(7, 7, 4.5, 2)];
    this.belt = [new Chain(5, 6, 4, 2.5), new Chain(4, 6, 4, 2.5)];
    this.after = [];
    this.trail = [];
    this.anchors = null;
    this.time = 0;
  }

  // ---- per game-step bookkeeping (afterimages, weapon trails) ----------------
  tick(f) {
    const m = f.state === 'move' ? f.move : null;
    const ghost = f.state === 'dash' || f.state === 'backdash' || (m && (m.name === 'dragon' || m.name === 'tatsu' || (m.name === 'super' && f.mf > 40)));
    if (ghost && f.game.frame % 3 === 0 && f.hitstop === 0) {
      this.after.push({ x: f.x, y: f.y, facing: f.facing, J: f.J, life: 12, max: 12, special: !!m });
      if (this.after.length > 5) this.after.shift();
    }
    let tip = null;
    if (m && m.hits.length) {
      for (const h of m.hits) {
        if (f.mf >= h.from - 2 && f.mf <= h.to + 1) {
          tip = h.limb || (m.name === 'tatsu' ? 'fft' : 'fha');
          this.trailR = h.r || 16;
          this.trailSpecial = !!m.special;
          break;
        }
      }
    }
    if (tip) {
      const p = f.J[tip];
      this.trail.push([f.x + f.facing * p[0], -(f.y + p[1])]);
      if (this.trail.length > 7) this.trail.shift();
    } else if (this.trail.length) this.trail.shift();
  }

  update(dt) {
    this.time += dt;
    for (const a of this.after) a.life -= dt;
    this.after = this.after.filter((a) => a.life > 0);
  }

  // ---- drawing ----------------------------------------------------------------
  // Shapes drawn inside group() share one merged outline (stroke all, then fill all).
  group(ctx, flat, fn) {
    this.G = [];
    fn();
    const G = this.G;
    this.G = null;
    if (!flat) {
      ctx.save();
      ctx.lineWidth = 4.2;
      ctx.strokeStyle = OUTLINE;
      for (const s of G) {
        s.build();
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const s of G) {
      s.build();
      if (!flat) ctx.fillStyle = s.fill;
      ctx.fill();
    }
  }

  limb(ctx, a, b, r1, r2, tn, back, flat) {
    if (this.G) {
      this.G.push({ build: () => capsulePath(ctx, a, b, r1, r2), fill: flat ? null : this.limbFill(ctx, a, b, r1, r2, tn, back) });
      return;
    }
    capsulePath(ctx, a, b, r1, r2);
    if (flat) {
      ctx.fill();
      return;
    }
    ctx.fillStyle = this.limbFill(ctx, a, b, r1, r2, tn, back);
    ctx.fill();
    ctx.stroke();
  }

  limbFill(ctx, a, b, r1, r2, tn, back) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    let nx = -dy / L;
    let ny = dx / L;
    if (nx * LIGHT[0] + ny * LIGHT[1] < 0) {
      nx = -nx;
      ny = -ny;
    }
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const r = (r1 + r2) / 2;
    const g = ctx.createLinearGradient(mx + nx * r, my + ny * r, mx - nx * r, my - ny * r);
    const hi = back ? tn.bhi : tn.hi;
    const base = back ? tn.bbase : tn.base;
    const sh = back ? tn.bsh : tn.sh;
    g.addColorStop(0, hi);
    g.addColorStop(0.22, hi);
    g.addColorStop(0.36, base);
    g.addColorStop(0.7, base);
    g.addColorStop(0.88, sh);
    g.addColorStop(1, sh);
    return g;
  }

  blob(ctx, c, r, tn, back, flat) {
    const build = () => {
      ctx.beginPath();
      ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
    };
    let g = null;
    if (!flat) {
      g = ctx.createRadialGradient(c[0] - r * 0.4, c[1] - r * 0.45, r * 0.1, c[0], c[1], r);
      g.addColorStop(0, back ? tn.bhi : tn.hi);
      g.addColorStop(0.55, back ? tn.bbase : tn.base);
      g.addColorStop(1, back ? tn.bsh : tn.sh);
    }
    if (this.G) {
      this.G.push({ build, fill: g });
      return;
    }
    build();
    if (flat) {
      ctx.fill();
      return;
    }
    ctx.fillStyle = g;
    ctx.fill();
    ctx.stroke();
  }

  fill(ctx, tn, flat, back = false, ax, ay, bx, by) {
    if (flat) {
      ctx.fill();
      return;
    }
    if (ax !== undefined) {
      const g = ctx.createLinearGradient(ax, ay, bx, by);
      g.addColorStop(0, back ? tn.bhi : tn.hi);
      g.addColorStop(0.35, back ? tn.bbase : tn.base);
      g.addColorStop(0.75, back ? tn.bbase : tn.base);
      g.addColorStop(1, back ? tn.bsh : tn.sh);
      ctx.fillStyle = g;
    } else ctx.fillStyle = back ? tn.bbase : tn.base;
    ctx.fill();
    ctx.stroke();
  }

  drawArm(ctx, sh, el, ha, back, flat, glow) {
    const t = this.t;
    const dx = ha[0] - el[0];
    const dy = ha[1] - el[1];
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L;
    const uy = dy / L;
    const fore = [el[0] + ux * L * 0.42, el[1] + uy * L * 0.42];
    if (this.pal.sleeve === 'short') {
      this.group(ctx, flat, () => {
        this.limb(ctx, el, fore, 8.6, 8.2, t.skin, back, flat);
        this.limb(ctx, fore, ha, 8.2, 6.4, t.skin, back, flat);
      });
      this.limb(ctx, sh, el, 12.5, 10, t.jacket, back, flat);
    } else {
      this.group(ctx, flat, () => {
        this.limb(ctx, sh, el, 10.5, 8.2, t.skin, back, flat);
        this.blob(ctx, [sh[0] + (el[0] - sh[0]) * 0.22, sh[1] + (el[1] - sh[1]) * 0.22], 10, t.skin, back, flat);
        this.limb(ctx, el, fore, 8.6, 8.3, t.skin, back, flat);
        this.limb(ctx, fore, ha, 8.3, 6.4, t.skin, back, flat);
      });
    }
    if (this.pal.sleeve !== 'short') {
      const w0 = [ha[0] - ux * 9, ha[1] - uy * 9];
      this.limb(ctx, w0, [ha[0] - ux * 2, ha[1] - uy * 2], 7.2, 7, t.glove, back, flat);
    }
    const fist = [ha[0] + ux * 3.5, ha[1] + uy * 3.5];
    this.blob(ctx, fist, 9.8, t.glove, back, flat);
    if (!flat) {
      ctx.save();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = back ? t.glove.bsh : t.glove.sh;
      ctx.beginPath();
      ctx.arc(fist[0], fist[1], 5.5, Math.atan2(uy, ux) - 1.1, Math.atan2(uy, ux) + 1.1);
      ctx.stroke();
      ctx.restore();
      if (glow > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = glow;
        const s = glowSprite(this.el.main);
        const sz = 70 + Math.sin(this.time * 0.9) * 8;
        ctx.drawImage(s, fist[0] - sz / 2, fist[1] - sz / 2, sz, sz);
        ctx.restore();
      }
    }
  }

  drawLeg(ctx, hp, kn, ft, toe, back, flat) {
    const t = this.t;
    const gi = this.char.id === 'kaen';
    const calf = [kn[0] + (ft[0] - kn[0]) * 0.35, kn[1] + (ft[1] - kn[1]) * 0.35];
    this.group(ctx, flat, () => {
      this.limb(ctx, calf, ft, gi ? 12.8 : 11.2, gi ? 12.6 : 9, t.pants, back, flat);
      this.limb(ctx, kn, calf, 12, gi ? 12.8 : 11.2, t.pants, back, flat);
      this.limb(ctx, hp, kn, gi ? 17 : 15.5, 12.2, t.pants, back, flat);
    });
    if (!flat && gi) {
      ctx.save();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = back ? t.pants.bsh : t.pants.sh;
      const m = [hp[0] + (kn[0] - hp[0]) * 0.55, hp[1] + (kn[1] - hp[1]) * 0.55];
      ctx.beginPath();
      ctx.moveTo(m[0] - 6, m[1] - 3);
      ctx.quadraticCurveTo(m[0], m[1] + 4, m[0] + 7, m[1] + 1);
      ctx.stroke();
      ctx.restore();
    }
    const dx = toe[0] - ft[0];
    const dy = toe[1] - ft[1];
    const L = Math.hypot(dx, dy) || 1;
    const heel = [ft[0] - (dx / L) * 4, ft[1] - (dy / L) * 4];
    this.limb(ctx, heel, toe, 7.2, 5.2, t.shoe, back, flat);
  }

  drawTorso(ctx, J, W, flip, flat) {
    const t = this.t;
    const hx = J.hip[0];
    const hy = J.hip[1];
    let ux = J.chest[0] - hx;
    let uy = J.chest[1] - hy;
    const ul = Math.hypot(ux, uy) || 1;
    ux /= ul;
    uy /= ul;
    const sg = flip ? -1 : 1;
    const nx = uy * sg;
    const ny = -ux * sg;
    const L = (a, b) => W([hx + ux * a + nx * b, hy + uy * a + ny * b]);
    const pts = [L(-2, 17), L(22, 15), L(42, 23), L(56, 18), L(63, 2), L(58, -20), L(40, -21), L(20, -16), L(-2, -17)];

    smoothClosed(ctx, pts);
    const fa = L(30, 22);
    const fb = L(30, -20);
    this.fill(ctx, t.jacket, flat, false, fa[0], fa[1], fb[0], fb[1]);
    if (flat) return L;

    if (this.char.id === 'kaen') {
      ctx.beginPath();
      const s = [L(2, 16.5), L(22, 15), L(42, 22.6), L(55, 17), L(50, 7), L(28, 7), L(4, 9)];
      ctx.moveTo(...s[0]);
      for (let i = 1; i < s.length; i++) ctx.lineTo(...s[i]);
      ctx.closePath();
      this.fill(ctx, t.shirt, false, false, ...L(30, 20), ...L(30, 6));
      ctx.save();
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = t.jacket.hi;
      ctx.beginPath();
      ctx.moveTo(...L(58, 12));
      ctx.quadraticCurveTo(...L(50, 3), ...L(36, 7));
      ctx.stroke();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = t.jacket.sh;
      ctx.beginPath();
      ctx.moveTo(...L(40, -12));
      ctx.quadraticCurveTo(...L(26, -6), ...L(10, -10));
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = t.jacket.sh;
      ctx.beginPath();
      ctx.moveTo(...L(44, 21));
      ctx.quadraticCurveTo(...L(36, 10), ...L(38, 2));
      ctx.moveTo(...L(28, 14));
      ctx.lineTo(...L(28, 4));
      ctx.moveTo(...L(18, 13));
      ctx.lineTo(...L(18, 4));
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = this.pal.accent;
      ctx.lineWidth = 2.6;
      ctx.shadowColor = this.pal.accent;
      ctx.beginPath();
      ctx.moveTo(...L(50, 12));
      ctx.lineTo(...L(40, 4));
      ctx.lineTo(...L(41, 11));
      ctx.lineTo(...L(30, 3));
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = t.jacket.hi;
      ctx.beginPath();
      ctx.moveTo(...L(54, 14));
      ctx.lineTo(...L(8, 12));
      ctx.stroke();
      ctx.restore();
    }
    // belt
    ctx.beginPath();
    const b = [L(6, 17), L(7, -16.5), L(-3, -16.5), L(-3, 17)];
    ctx.moveTo(...b[0]);
    for (let i = 1; i < 4; i++) ctx.lineTo(...b[i]);
    ctx.closePath();
    this.fill(ctx, t.belt, false, false, ...L(2, 18), ...L(2, -18));
    ctx.beginPath();
    const kc = L(2, 17.5);
    ctx.arc(kc[0], kc[1], 4.2, 0, Math.PI * 2);
    this.fill(ctx, t.belt, false);
    this.anchors = { ...(this.anchors || {}), belt: kc };
    return L;
  }

  drawHead(ctx, J, W, v, flat) {
    const t = this.t;
    const hc = J.head;
    const a = J.headAng * D2R;
    const fwd = [Math.cos(a), -Math.sin(a)];
    const up = [Math.sin(a), Math.cos(a)];
    if (J.flip) {
      fwd[0] = -fwd[0];
      up[0] = -up[0];
    }
    const H = (u, w) => W([hc[0] + fwd[0] * u + up[0] * w, hc[1] + fwd[1] * u + up[1] * w]);

    // neck
    this.limb(ctx, W([J.chest[0], J.chest[1]]), H(-3, -9), 7.5, 7, t.skin, false, flat);

    // headband tails anchor
    const knot = H(-15.5, 10.5);
    this.anchors = { ...(this.anchors || {}), band: knot };

    // skull
    smoothClosed(ctx, SKULL.map(([u, w]) => H(u, w)));
    const g0 = H(10, 10);
    const g1 = H(-12, -12);
    this.fill(ctx, t.skin, flat, false, g0[0], g0[1], g1[0], g1[1]);

    if (!flat) {
      // ear
      ctx.beginPath();
      const ear = H(-2.5, -1);
      ctx.ellipse(ear[0], ear[1], 3.4, 4.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = t.skin.sh;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.lineWidth = 2.4;
      // eye + brow + mouth
      const hurt = v.state === 'hit' || v.state === 'launch' || v.state === 'ko' || v.state === 'down';
      const e0 = H(7, 3);
      const e1 = H(14.2, 2.2);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(...e0);
      ctx.quadraticCurveTo(...H(10.5, 4.8), ...e1);
      ctx.quadraticCurveTo(...H(11, -0.6), ...e0);
      ctx.fill();
      if (hurt) {
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = '#18121a';
        ctx.beginPath();
        ctx.moveTo(...H(8, 3.4));
        ctx.lineTo(...H(13, 1));
        ctx.moveTo(...H(8, 0.8));
        ctx.lineTo(...H(13, 3.2));
        ctx.stroke();
      } else {
        const iris = H(12, 2);
        ctx.fillStyle = this.pal.accent;
        ctx.beginPath();
        ctx.arc(iris[0], iris[1], 2.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#120a10';
        ctx.beginPath();
        ctx.arc(iris[0], iris[1], 1.1, 0, Math.PI * 2);
        ctx.fill();
        const hl = H(12.6, 2.9);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(hl[0], hl[1], 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.lineWidth = 1.9;
      ctx.strokeStyle = '#120a10';
      ctx.beginPath();
      ctx.moveTo(...H(6.5, 3.4));
      ctx.quadraticCurveTo(...H(10.5, 5.2), ...H(14.8, 2.4));
      ctx.stroke();
      ctx.lineWidth = 2.8;
      ctx.strokeStyle = this.pal.hair === '#e9edf6' ? '#8a90b0' : '#17101a';
      ctx.beginPath();
      ctx.moveTo(...H(5, hurt ? 8 : 6.6));
      ctx.quadraticCurveTo(...H(10, hurt ? 8.4 : 7.6), ...H(15, hurt ? 6.8 : 4.6));
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = shade(this.pal.skin, -0.35);
      ctx.beginPath();
      ctx.moveTo(...H(17.8, -2.6));
      ctx.lineTo(...H(16, -4.6));
      ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = shade(this.pal.skin, -0.5);
      ctx.beginPath();
      ctx.moveTo(...H(11.5, -9.2));
      ctx.lineTo(...H(15, hurt ? -10.5 : -8.7));
      ctx.stroke();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = OUTLINE;
    }

    // hair
    const hair = this.char.hair;
    const sway = Math.sin(this.time * 0.15) * 1.2 - clamp((v.vx || 0) * v.facing, -8, 8) * 0.25;
    const hp = hair.map(([u, w], i) => (i % 2 === 1 ? H(u + sway * (u < 0 ? 1 : 0.3), w + Math.cos(this.time * 0.13 + i) * 0.6) : H(u, w)));
    hp.push(H(-6, -1), H(4, 7));
    ctx.beginPath();
    ctx.moveTo(...hp[0]);
    for (let i = 1; i < hp.length; i++) ctx.lineTo(...hp[i]);
    ctx.closePath();
    const hg0 = H(4, 20);
    const hg1 = H(-20, -6);
    this.fill(ctx, t.hair, flat, false, hg0[0], hg0[1], hg1[0], hg1[1]);
    // bangs
    ctx.beginPath();
    ctx.moveTo(...H(13, 12));
    ctx.lineTo(...H(18.5, 3.5));
    ctx.lineTo(...H(9, 9));
    ctx.lineTo(...H(11, 0.5));
    ctx.lineTo(...H(5, 9));
    ctx.closePath();
    this.fill(ctx, t.hair, flat);

    // headband
    ctx.beginPath();
    const hb = [H(15.2, 8.2), H(14.2, 12.8), H(-15.5, 13.5), H(-16, 8)];
    ctx.moveTo(...hb[0]);
    for (let i = 1; i < 4; i++) ctx.lineTo(...hb[i]);
    ctx.closePath();
    this.fill(ctx, t.band, flat, false, ...H(0, 14), ...H(0, 7));
    ctx.beginPath();
    ctx.arc(knot[0], knot[1], 3.6, 0, Math.PI * 2);
    this.fill(ctx, t.band, flat);
  }

  // v: { x, y, facing, J, state, vx }
  draw(ctx, v, opts = {}) {
    const flat = opts.flat || null;
    const s = v.facing;
    const W = (p) => [v.x + s * p[0], -(v.y + p[1])];
    const J = v.J;
    const P = {};
    for (const k of KEYS) P[k] = W(J[k]);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = OUTLINE;
    if (flat) ctx.fillStyle = flat;
    const glow = opts.glow || 0;

    if (opts.cloth && this.anchors) {
      const wind = -s * 0.1 + Math.sin(this.time * 0.05) * 0.12 - (v.vx || 0) * 0.04;
      if (this.anchors.band) {
        this.tails[0].step(this.anchors.band, opts.dt, wind - s * 0.12);
        this.tails[1].step([this.anchors.band[0], this.anchors.band[1] + 2], opts.dt, wind - s * 0.05);
      }
      if (this.anchors.belt) {
        this.belt[0].step(this.anchors.belt, opts.dt, wind * 0.5);
        this.belt[1].step([this.anchors.belt[0] + s * 2, this.anchors.belt[1]], opts.dt, wind * 0.3);
      }
    }

    this.drawArm(ctx, P.bsh, P.bel, P.bha, true, flat, glow * 0.6);
    this.drawLeg(ctx, P.bhp, P.bkn, P.bft, P.btoe, true, flat);
    if (!opts.noCloth) {
      for (const c of this.belt) c.draw(ctx, this.t.belt.base, this.t.belt.hi, flat);
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = OUTLINE;
    }
    this.drawTorso(ctx, J, W, J.flip, flat);
    this.drawLeg(ctx, P.fhp, P.fkn, P.fft, P.ftoe, false, flat);
    if (!opts.noCloth) {
      for (const c of this.tails) c.draw(ctx, this.t.band.base, this.t.band.sh, flat);
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = OUTLINE;
    }
    this.drawHead(ctx, J, W, v, flat);
    this.drawArm(ctx, P.fsh, P.fel, P.fha, false, flat, glow);
    ctx.restore();
  }

  drawAfterimages(ctx) {
    if (!this.after.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const a of this.after) {
      const k = a.life / a.max;
      ctx.globalAlpha = k * k * 0.3;
      this.draw(ctx, { x: a.x, y: a.y, facing: a.facing, J: a.J, state: 'move', vx: 0 }, { flat: a.special ? this.el.main : this.pal.accent, noCloth: true });
    }
    ctx.restore();
  }

  drawTrail(ctx) {
    const p = this.trail;
    if (p.length < 2) return;
    const color = this.trailSpecial ? this.el.main : '#dfe8ff';
    const r = (this.trailR || 14) * 1.1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1];
      const b = p[i];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const L = Math.hypot(dx, dy);
      if (L < 0.5) continue;
      const nx = -dy / L;
      const ny = dx / L;
      const w0 = (r * (i - 1)) / p.length;
      const w1 = (r * i) / p.length;
      ctx.fillStyle = rgba(color, 0.08 + (0.42 * i) / p.length);
      ctx.beginPath();
      ctx.moveTo(a[0] + nx * w0, a[1] + ny * w0);
      ctx.lineTo(b[0] + nx * w1, b[1] + ny * w1);
      ctx.lineTo(b[0] - nx * w1 * 0.25, b[1] - ny * w1 * 0.25);
      ctx.lineTo(a[0] - nx * w0 * 0.25, a[1] - ny * w0 * 0.25);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawPortrait(ctx, cx, cy, scale, mirror = false) {
    const J = { head: [0, 0], chest: [-6, -30], headAng: -4, flip: false };
    const W = (p) => [p[0], -p[1]];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(mirror ? -scale : scale, scale);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = OUTLINE;
    const saved = this.anchors;
    this.drawHead(ctx, J, W, { state: 'idle', vx: 0, facing: 1 }, null);
    this.anchors = saved;
    ctx.restore();
  }
}
