import { glowSprite, softSprite, ELEMENTS, rgba } from './util.js';

const MAX_PARTICLES = 1800;
const rnd = (a, b) => a + Math.random() * (b - a);

function jagged(x1, y1, x2, y2, disp, depth, out) {
  if (depth === 0) {
    out.push([x2, y2]);
    return;
  }
  const mx = (x1 + x2) / 2 + rnd(-disp, disp);
  const my = (y1 + y2) / 2 + rnd(-disp, disp);
  jagged(x1, y1, mx, my, disp / 2, depth - 1, out);
  jagged(mx, my, x2, y2, disp / 2, depth - 1, out);
}

export function drawBolt(ctx, x1, y1, x2, y2, color, width = 3, disp = 30, alpha = 1) {
  const pts = [[x1, y1]];
  jagged(x1, y1, x2, y2, disp, 5, pts);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [w, a, c] of [[width * 5, 0.12, color], [width * 2.2, 0.45, color], [width * 0.8, 1, '#ffffff']]) {
    ctx.globalAlpha = a * alpha;
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  ctx.restore();
  return pts;
}

export class Effects {
  constructor() {
    this.p = [];
    this.shapes = [];
  }

  clear() {
    this.p.length = 0;
    this.shapes.length = 0;
  }

  add(o) {
    if (this.p.length >= MAX_PARTICLES) this.p.shift();
    o.max = o.life;
    this.p.push(o);
    return o;
  }

  shape(o) {
    o.max = o.life;
    this.shapes.push(o);
    return o;
  }

  update(dt) {
    for (const q of this.p) {
      q.life -= dt;
      const d = Math.pow(q.drag ?? 0.96, dt);
      q.vx *= d;
      q.vy *= d;
      q.vy += (q.g || 0) * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.size += (q.grow || 0) * dt;
      if (q.spin) q.rot = (q.rot || 0) + q.spin * dt;
    }
    this.p = this.p.filter((q) => q.life > 0 && q.size > 0.2);
    for (const s of this.shapes) {
      s.life -= dt;
      if (s.follow) {
        s.x = s.follow.x;
        s.y = s.follow.y;
      }
    }
    this.shapes = this.shapes.filter((s) => s.life > 0);
  }

  // ---- spawners (all coordinates are draw coords: y grows downward) ---------
  flame(x, y, el, o = {}) {
    const E = ELEMENTS[el];
    return this.add({
      kind: 'flame', x, y, vx: o.vx ?? rnd(-0.8, 0.8), vy: o.vy ?? rnd(-2.5, -0.8), life: o.life ?? rnd(16, 30),
      size: o.size ?? rnd(18, 34), grow: o.grow ?? -0.5, drag: 0.95, g: o.g ?? -0.06, E,
    });
  }

  glow(x, y, color, o = {}) {
    return this.add({
      kind: 'glow', x, y, vx: o.vx || 0, vy: o.vy || 0, life: o.life ?? 12, size: o.size ?? 60, grow: o.grow ?? 0,
      drag: o.drag ?? 0.9, g: o.g || 0, sprite: glowSprite(color, o.core ?? 0.18), alpha: o.alpha ?? 1,
    });
  }

  spark(x, y, color, o = {}) {
    const a = o.a ?? rnd(0, Math.PI * 2);
    const sp = o.speed ?? rnd(4, 12);
    return this.add({
      kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: o.life ?? rnd(8, 18), size: o.size ?? rnd(1.5, 3),
      drag: o.drag ?? 0.88, g: o.g ?? 0.25, color, len: o.len ?? 2.2,
    });
  }

  smoke(x, y, color = '#3a3038', o = {}) {
    return this.add({
      kind: 'smoke', x, y, vx: o.vx ?? rnd(-1, 1), vy: o.vy ?? rnd(-1.5, -0.3), life: o.life ?? rnd(25, 45), size: o.size ?? rnd(20, 40),
      grow: o.grow ?? 0.7, drag: 0.94, g: o.g ?? -0.02, sprite: softSprite(color), alpha: o.alpha ?? 0.4,
    });
  }

  ring(x, y, color, o = {}) {
    return this.shape({ kind: 'ring', x, y, color, life: o.life ?? 14, r0: o.r0 ?? 10, r1: o.r1 ?? 80, w: o.w ?? 6, sy: o.sy ?? 1 });
  }

  bolt(x1, y1, x2, y2, color, o = {}) {
    return this.shape({ kind: 'bolt', x: x1, y: y1, x2, y2, color, life: o.life ?? 6, w: o.w ?? 2.5, disp: o.disp ?? 30 });
  }

  // ---- composite effects -------------------------------------------------------
  hitSpark(x, y, dir, kind, element, special) {
    const E = ELEMENTS[element];
    const big = kind === 'heavy' || kind === 'special' || kind === 'super';
    const scale = kind === 'light' ? 0.7 : kind === 'mid' ? 0.9 : kind === 'super' ? 1.6 : 1.2;
    const col = special ? E.main : kind === 'light' ? '#8fd8ff' : kind === 'mid' ? '#ffd66b' : '#ff9a3a';
    this.glow(x, y, col, { size: 150 * scale, life: 9, grow: 6 });
    this.glow(x, y, '#ffffff', { size: 60 * scale, life: 5, core: 0.5 });
    const rays = [];
    const n = big ? 11 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.25, 0.25);
      rays.push({ a, len: rnd(0.6, 1.2) * 70 * scale * (Math.abs(Math.cos(a)) * 0.4 + 0.6), w: rnd(5, 9) * scale });
    }
    this.shape({ kind: 'star', x, y, rays, color: col, life: big ? 10 : 7 });
    this.ring(x, y, col, { r0: 8, r1: 90 * scale, life: big ? 14 : 9, w: big ? 7 : 4 });
    if (big) this.shape({ kind: 'slash', x, y, a: rnd(-0.6, 0.6) + (dir > 0 ? 0 : Math.PI), r: 70 * scale, color: col, life: 9 });
    for (let i = 0; i < (big ? 22 : 12); i++) {
      const a = (dir > 0 ? 0 : Math.PI) + rnd(-1.3, 1.3);
      this.spark(x, y, i % 3 ? col : '#ffffff', { a, speed: rnd(5, 16) * scale, life: rnd(8, 20) });
    }
    if (special) {
      if (element === 'fire') for (let i = 0; i < 16; i++) this.flame(x + rnd(-20, 20), y + rnd(-20, 20), element, { vx: dir * rnd(0, 4), vy: rnd(-4, 0), size: rnd(26, 46) });
      else for (let i = 0; i < 4; i++) {
        const a = rnd(0, Math.PI * 2);
        const r = rnd(50, 110);
        this.bolt(x, y, x + Math.cos(a) * r, y + Math.sin(a) * r, E.main, { life: rnd(5, 9), disp: 24 });
      }
    }
  }

  blockSpark(x, y, dir) {
    this.glow(x, y, '#7fc4ff', { size: 110, life: 8, grow: 3 });
    this.shape({ kind: 'shield', x, y, dir, life: 10, color: '#9fd6ff' });
    for (let i = 0; i < 8; i++) this.spark(x, y, '#cfeaff', { a: (dir > 0 ? Math.PI : 0) + rnd(-1.2, 1.2), speed: rnd(3, 9), life: rnd(6, 12) });
  }

  dust(x, amount = 6, dir = 0, color = '#8a7a70') {
    for (let i = 0; i < amount; i++) {
      this.smoke(x + rnd(-20, 20), rnd(-6, 2), color, { vx: dir * rnd(1, 4) + rnd(-1.5, 1.5), vy: rnd(-1.5, -0.2), size: rnd(18, 34), life: rnd(20, 36), alpha: 0.35 });
    }
  }

  bigImpact(x, y, element) {
    const E = ELEMENTS[element];
    this.glow(x, y, E.main, { size: 420, life: 22, grow: 8 });
    this.glow(x, y, '#ffffff', { size: 180, life: 10, core: 0.5 });
    this.ring(x, y, E.main, { r0: 20, r1: 340, life: 26, w: 14 });
    this.ring(x, y, '#ffffff', { r0: 10, r1: 220, life: 16, w: 6 });
    for (let i = 0; i < 50; i++) this.spark(x, y, i % 2 ? E.spark : '#ffffff', { speed: rnd(6, 22), life: rnd(14, 34), len: 3 });
  }

  // ---- drawing ------------------------------------------------------------------
  draw(ctx) {
    ctx.save();
    for (const q of this.p) {
      if (q.kind !== 'smoke') continue;
      ctx.globalAlpha = q.alpha * Math.min(1, q.life / q.max * 1.6);
      ctx.drawImage(q.sprite, q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const q of this.p) {
      const k = q.life / q.max;
      if (q.kind === 'glow') {
        ctx.globalAlpha = q.alpha * k;
        ctx.drawImage(q.sprite, q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      } else if (q.kind === 'flame') {
        const col = k > 0.7 ? q.E.core : k > 0.4 ? q.E.main : q.E.deep;
        const sp = glowSprite(col, k > 0.7 ? 0.3 : 0.12, 96);
        ctx.globalAlpha = Math.min(1, k * 1.5) * 0.85;
        const s = q.size;
        ctx.drawImage(sp, q.x - s / 2, q.y - s / 2, s, s);
      } else if (q.kind === 'spark') {
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.strokeStyle = q.color;
        ctx.lineWidth = q.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x - q.vx * q.len, q.y - q.vy * q.len);
        ctx.stroke();
      }
    }
    for (const s of this.shapes) this.drawShape(ctx, s);
    ctx.restore();
  }

  drawShape(ctx, s) {
    const k = s.life / s.max;
    const t = 1 - k;
    ctx.globalCompositeOperation = 'lighter';
    if (s.kind === 'ring') {
      const r = s.r0 + (s.r1 - s.r0) * (1 - (1 - t) * (1 - t));
      ctx.globalAlpha = k;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.w * k + 0.5;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, r, r * s.sy, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (s.kind === 'star') {
      const grow = 0.6 + t * 0.7;
      for (const pass of [0, 1]) {
        ctx.globalAlpha = pass ? k : k * 0.7;
        ctx.fillStyle = pass ? '#ffffff' : s.color;
        for (const r of s.rays) {
          const L = r.len * grow * (pass ? 0.55 : 1);
          const w = r.w * k * (pass ? 0.45 : 1);
          const ca = Math.cos(r.a);
          const sa = Math.sin(r.a);
          ctx.beginPath();
          ctx.moveTo(s.x - sa * w, s.y + ca * w);
          ctx.lineTo(s.x + ca * L, s.y + sa * L);
          ctx.lineTo(s.x + sa * w, s.y - ca * w);
          ctx.closePath();
          ctx.fill();
        }
      }
    } else if (s.kind === 'slash') {
      ctx.globalAlpha = k;
      ctx.fillStyle = s.color;
      const r = s.r * (0.8 + t * 0.6);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, s.a - 1.3, s.a + 1.3);
      ctx.arc(s.x - Math.cos(s.a) * r * 0.25, s.y - Math.sin(s.a) * r * 0.25, r * 0.92, s.a + 1.2, s.a - 1.2, true);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = k * 0.9;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * 0.98, s.a - 0.9, s.a + 0.9);
      ctx.arc(s.x - Math.cos(s.a) * r * 0.12, s.y - Math.sin(s.a) * r * 0.12, r * 0.95, s.a + 0.85, s.a - 0.85, true);
      ctx.closePath();
      ctx.fill();
    } else if (s.kind === 'bolt') {
      drawBolt(ctx, s.x, s.y, s.x2, s.y2, s.color, s.w, s.disp, Math.min(1, k * 1.5));
    } else if (s.kind === 'shield') {
      ctx.globalAlpha = k;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 3;
      const r = 40 + t * 18;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const px = s.x - s.dir * 8 + Math.cos(a) * r * 0.55;
        const py = s.y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.fillStyle = rgba(s.color, 0.18 * k);
      ctx.fill();
    }
  }
}
