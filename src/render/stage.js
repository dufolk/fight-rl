import { makeCanvas, glowSprite, softSprite, hash, rgba } from './util.js';

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const GROUND_Y = 622;
export const HOR = -168; // horizon relative to ground line

const SUN_COL = '#ffcf7a';

function ridge(g, w, h, base, amp, seed, color, step = 6) {
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += step) {
    const y =
      base -
      amp * (0.55 * Math.sin(x * 0.0021 + seed) + 0.3 * Math.sin(x * 0.0053 + seed * 2.1) + 0.15 * Math.sin(x * 0.013 + seed * 3.7)) -
      amp * 0.25 * hash(Math.floor(x / 40) + seed * 100);
    g.lineTo(x, y);
  }
  g.lineTo(w, h);
  g.closePath();
  g.fillStyle = color;
  g.fill();
}

function roof(g, cx, y, w, h, color, rim) {
  g.beginPath();
  g.moveTo(cx - w / 2 - 14, y + 4);
  g.quadraticCurveTo(cx - w / 2 + 6, y + h * 0.15, cx - w * 0.28, y - h * 0.65);
  g.lineTo(cx + w * 0.28, y - h * 0.65);
  g.quadraticCurveTo(cx + w / 2 - 6, y + h * 0.15, cx + w / 2 + 14, y + 4);
  g.closePath();
  g.fillStyle = color;
  g.fill();
  g.strokeStyle = rim;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx - w / 2 - 14, y + 4);
  g.quadraticCurveTo(cx - w / 2 + 6, y + h * 0.15, cx - w * 0.28, y - h * 0.65);
  g.lineTo(cx + w * 0.28, y - h * 0.65);
  g.stroke();
}

function pagoda(g, cx, base, tiers, w0, color, rim, win, seed) {
  let y = base;
  let w = w0;
  for (let i = 0; i < tiers; i++) {
    const th = 44 - i * 3;
    g.fillStyle = color;
    g.fillRect(cx - w * 0.36, y - th, w * 0.72, th);
    for (let k = 0; k < 3; k++) {
      if (hash(seed + i * 7 + k) > 0.45) {
        g.fillStyle = win;
        g.globalAlpha = 0.5 + hash(seed + i + k * 3) * 0.5;
        g.fillRect(cx - w * 0.24 + k * w * 0.18, y - th + 12, w * 0.08, th * 0.45);
        g.globalAlpha = 1;
      }
    }
    roof(g, cx, y - th, w, 26, color, rim);
    y -= th + 18;
    w *= 0.82;
  }
  g.fillStyle = color;
  g.fillRect(cx - 2, y - 30, 4, 34);
  g.beginPath();
  g.arc(cx, y - 32, 5, 0, Math.PI * 2);
  g.fill();
}

export class Stage {
  constructor() {
    this.excite = 0;
    this.time = 0;
    this.build();
    this.crowd = Array.from({ length: 64 }, (_, i) => ({
      x: -1500 + i * 47 + hash(i) * 20,
      h: 46 + hash(i + 9) * 18,
      w: 15 + hash(i + 3) * 6,
      ph: hash(i + 5) * 10,
      sp: 0.08 + hash(i + 2) * 0.06,
      col: ['#2a1630', '#331a33', '#24142b', '#3a1d30'][i % 4],
      arms: hash(i + 11) > 0.45,
      row: i % 2,
    }));
    this.motes = Array.from({ length: 70 }, (_, i) => ({ x: hash(i * 3) * 2600 - 1300, y: hash(i * 5) * 700, s: 1 + hash(i * 7) * 2.5, sp: 0.3 + hash(i) * 0.8, ph: hash(i * 11) * 6 }));
  }

  build() {
    // sky
    const sky = (this.sky = makeCanvas(VIEW_W, VIEW_H));
    let g = sky.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, VIEW_H);
    gr.addColorStop(0, '#0f0a2a');
    gr.addColorStop(0.28, '#341a50');
    gr.addColorStop(0.47, '#8c2c5c');
    gr.addColorStop(0.58, '#e5604c');
    gr.addColorStop(0.65, '#ffad5c');
    gr.addColorStop(1, '#ffd38c');
    g.fillStyle = gr;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    for (let i = 0; i < 140; i++) {
      const y = hash(i * 2.3) * 260;
      g.globalAlpha = (1 - y / 260) * (0.3 + hash(i) * 0.7);
      g.fillStyle = '#ffffff';
      g.fillRect(hash(i * 7.1) * VIEW_W, y, 1.5, 1.5);
    }
    g.globalAlpha = 1;

    // clouds (parallax strip)
    const cl = (this.clouds = makeCanvas(3000, 260));
    g = cl.getContext('2d');
    for (let i = 0; i < 26; i++) {
      const x = hash(i * 13) * 3000;
      const y = 40 + hash(i * 17) * 180;
      const w = 160 + hash(i * 3) * 380;
      const h = 8 + hash(i * 5) * 16;
      const cg = g.createLinearGradient(0, y - h, 0, y + h);
      cg.addColorStop(0, rgba('#ffc890', 0.55));
      cg.addColorStop(1, rgba('#7a2a5a', 0.45));
      g.fillStyle = cg;
      g.beginPath();
      g.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
      g.fill();
    }

    // mountains
    const mt = (this.mountains = makeCanvas(3000, 320));
    g = mt.getContext('2d');
    ridge(g, 3000, 320, 200, 120, 1.3, '#9a4466');
    const haze = g.createLinearGradient(0, 80, 0, 320);
    haze.addColorStop(0, 'rgba(255,170,120,0)');
    haze.addColorStop(1, 'rgba(255,150,110,0.35)');
    g.fillStyle = haze;
    g.fillRect(0, 0, 3000, 320);
    ridge(g, 3000, 320, 260, 90, 4.1, '#5a2350');

    // city / pagodas
    const city = (this.city = makeCanvas(3600, 420));
    g = city.getContext('2d');
    const base = 420;
    for (let i = 0; i < 40; i++) {
      const x = hash(i * 31) * 3600;
      const w = 60 + hash(i * 7) * 90;
      const h = 40 + hash(i * 5) * 70;
      g.fillStyle = '#2b1236';
      g.fillRect(x - w / 2, base - h, w, h);
      roof(g, x, base - h, w + 10, 20, '#2b1236', 'rgba(255,140,90,0.45)');
    }
    const pg = [[300, 5, 150], [1150, 7, 190], [2050, 4, 140], [2900, 6, 170], [3400, 3, 120]];
    for (const [x, tiers, w] of pg) pagoda(g, x, base, tiers, w, '#24102f', 'rgba(255,150,90,0.6)', '#ffb04a', x);
    const ch = g.createLinearGradient(0, 0, 0, base);
    ch.addColorStop(0, 'rgba(255,120,90,0)');
    ch.addColorStop(1, 'rgba(255,120,90,0.18)');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = ch;
    g.fillRect(0, 0, 3600, base);
    g.globalCompositeOperation = 'source-over';

    // palace wall
    const wall = (this.wall = makeCanvas(4000, 150));
    g = wall.getContext('2d');
    const wg = g.createLinearGradient(0, 40, 0, 150);
    wg.addColorStop(0, '#6a1820');
    wg.addColorStop(1, '#2a0a12');
    g.fillStyle = wg;
    g.fillRect(0, 44, 4000, 106);
    for (let x = 60; x < 4000; x += 180) {
      const pgd = g.createLinearGradient(x - 9, 0, x + 9, 0);
      pgd.addColorStop(0, '#3a0a10');
      pgd.addColorStop(0.4, '#9a2a26');
      pgd.addColorStop(1, '#2a060c');
      g.fillStyle = pgd;
      g.fillRect(x - 9, 44, 18, 106);
    }
    g.fillStyle = '#1a0c18';
    g.beginPath();
    g.moveTo(0, 50);
    g.lineTo(0, 30);
    g.quadraticCurveTo(2000, 18, 4000, 30);
    g.lineTo(4000, 50);
    g.closePath();
    g.fill();
    for (let x = 0; x < 4000; x += 12) {
      g.fillStyle = x % 24 ? '#2a1622' : '#3a2030';
      g.fillRect(x, 32, 8, 18);
    }
    g.strokeStyle = 'rgba(255,170,100,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 30);
    g.quadraticCurveTo(2000, 18, 4000, 30);
    g.stroke();

    // vignette
    const v = (this.vignette = makeCanvas(VIEW_W, VIEW_H));
    g = v.getContext('2d');
    const vg = g.createRadialGradient(VIEW_W / 2, VIEW_H * 0.55, VIEW_H * 0.35, VIEW_W / 2, VIEW_H * 0.55, VIEW_W * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(10,0,20,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  update(dt) {
    this.time += dt;
    this.excite = Math.max(0, this.excite - 0.004 * dt);
  }

  layer(ctx, cam, p, fn) {
    const zl = 1 + (cam.zoom - 1) * p;
    ctx.save();
    ctx.translate(VIEW_W / 2, GROUND_Y);
    ctx.scale(zl, zl);
    ctx.translate(-cam.x * p, cam.y * p);
    fn(ctx);
    ctx.restore();
  }

  drawBack(ctx, cam) {
    const t = this.time;
    ctx.drawImage(this.sky, 0, 0);

    // sun + rays
    const sx = VIEW_W / 2 - cam.x * 0.04;
    const sy = GROUND_Y + HOR - 70 + cam.y * 0.05;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.9;
    const gs = glowSprite('#ff9a50', 0.12, 256);
    ctx.drawImage(gs, sx - 420, sy - 420, 840, 840);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#ffd9a0';
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.28 + Math.sin(t * 0.004 + i) * 0.05;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a - 0.05) * 900, sy + Math.sin(a - 0.05) * 900);
      ctx.lineTo(sx + Math.cos(a + 0.05) * 900, sy + Math.sin(a + 0.05) * 900);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 96);
    sg.addColorStop(0, '#fffbe8');
    sg.addColorStop(0.6, SUN_COL);
    sg.addColorStop(1, '#ff8a4a');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sx, sy, 92, 0, Math.PI * 2);
    ctx.fill();

    this.layer(ctx, cam, 0.06, (g) => {
      const off = (t * 0.15) % 3000;
      g.globalAlpha = 0.9;
      g.drawImage(this.clouds, -1500 - off, HOR - 470);
      g.drawImage(this.clouds, 1500 - off, HOR - 470);
      g.globalAlpha = 1;
    });
    this.layer(ctx, cam, 0.12, (g) => g.drawImage(this.mountains, -1500, HOR - 300));
    this.layer(ctx, cam, 0.3, (g) => g.drawImage(this.city, -1800, HOR - 395));
    this.layer(ctx, cam, 0.55, (g) => {
      g.drawImage(this.wall, -2000, HOR - 140);
      this.drawCrowd(g);
    });
    this.layer(ctx, cam, 1, (g) => this.drawFloor(g, cam));
  }

  drawCrowd(g) {
    const t = this.time;
    const ex = Math.min(1, this.excite);
    for (const c of this.crowd) {
      const bob = Math.abs(Math.sin(t * c.sp * (1 + ex * 1.5) + c.ph)) * (2 + ex * 9);
      const y0 = HOR + 2 - c.row * 6;
      const x = c.x;
      const top = y0 - c.h - bob;
      g.fillStyle = c.row ? '#1c0c1e' : c.col;
      g.beginPath();
      g.moveTo(x - c.w, y0);
      g.lineTo(x - c.w * 0.8, top + 16);
      g.quadraticCurveTo(x, top + 8, x + c.w * 0.8, top + 16);
      g.lineTo(x + c.w, y0);
      g.closePath();
      g.fill();
      g.beginPath();
      g.arc(x, top + 4, 8, 0, Math.PI * 2);
      g.fill();
      if (c.arms && ex > 0.25) {
        g.strokeStyle = g.fillStyle;
        g.lineWidth = 5;
        g.lineCap = 'round';
        const wave = Math.sin(t * 0.3 + c.ph) * 6;
        g.beginPath();
        g.moveTo(x - c.w * 0.7, top + 18);
        g.lineTo(x - c.w - 4 + wave, top - 10);
        g.moveTo(x + c.w * 0.7, top + 18);
        g.lineTo(x + c.w + 4 - wave, top - 10);
        g.stroke();
      }
      g.strokeStyle = 'rgba(255,150,90,0.35)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, top + 4, 8, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
  }

  drawFloor(g, cam) {
    const bottom = (VIEW_H - GROUND_Y) / cam.zoom + 40;
    const left = cam.x - 1400;
    const right = cam.x + 1400;
    const fg = g.createLinearGradient(0, HOR, 0, bottom);
    fg.addColorStop(0, '#6a3436');
    fg.addColorStop(0.18, '#3c1e26');
    fg.addColorStop(0.7, '#22121a');
    fg.addColorStop(1, '#140a10');
    g.fillStyle = fg;
    g.fillRect(left, HOR, right - left, bottom - HOR);

    // sun reflection on polished stone
    g.save();
    g.globalCompositeOperation = 'lighter';
    const rx = cam.x - cam.x * 0.04;
    const rg = g.createLinearGradient(0, HOR, 0, bottom);
    rg.addColorStop(0, 'rgba(255,170,90,0.55)');
    rg.addColorStop(0.5, 'rgba(255,120,70,0.12)');
    rg.addColorStop(1, 'rgba(255,120,70,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.moveTo(rx - 60, HOR);
    g.lineTo(rx + 60, HOR);
    g.lineTo(rx + 260, bottom);
    g.lineTo(rx - 260, bottom);
    g.closePath();
    g.fill();
    g.restore();

    // tile seams converging to the vanishing point
    const vp = cam.x;
    const s = (y) => (y - HOR) / -HOR;
    g.strokeStyle = 'rgba(255,190,150,0.10)';
    g.lineWidth = 1.5;
    g.beginPath();
    const step = 110;
    const x0 = Math.floor((cam.x - 2600) / step) * step;
    for (let X = x0; X < cam.x + 2600; X += step) {
      g.moveTo(vp + (X - vp) * s(HOR + 2), HOR + 2);
      g.lineTo(vp + (X - vp) * s(bottom), bottom);
    }
    for (const k of [0.08, 0.17, 0.28, 0.42, 0.6, 0.8, 1.03, 1.3, 1.62]) {
      const y = HOR + k * -HOR;
      g.moveTo(left, y);
      g.lineTo(right, y);
    }
    g.stroke();

    // floor emblem
    g.save();
    g.translate(0, -26);
    g.scale(1, 0.13);
    g.strokeStyle = 'rgba(255,190,110,0.32)';
    g.lineWidth = 6;
    for (const r of [330, 300, 160]) {
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.lineWidth = 4;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * 170, Math.sin(a) * 170);
      g.lineTo(Math.cos(a) * 290, Math.sin(a) * 290);
      g.stroke();
    }
    g.restore();
    // horizon haze
    const hz = g.createLinearGradient(0, HOR - 20, 0, HOR + 40);
    hz.addColorStop(0, 'rgba(255,160,110,0)');
    hz.addColorStop(0.5, 'rgba(255,160,110,0.25)');
    hz.addColorStop(1, 'rgba(255,160,110,0)');
    g.fillStyle = hz;
    g.fillRect(left, HOR - 20, right - left, 60);
  }

  drawFront(ctx, cam) {
    const t = this.time;
    // drifting embers / petals
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sp = glowSprite('#ff9a50', 0.2, 32);
    for (const m of this.motes) {
      const x = ((((m.x - cam.x * 0.9 + Math.sin(t * 0.01 + m.ph) * 40) % 2600) + 2600) % 2600) - 660;
      const y = (((m.y - t * m.sp) % 720) + 720) % 720;
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 0.05 + m.ph);
      const s = m.s * 6;
      ctx.drawImage(sp, x - s / 2, y - s / 2, s, s);
    }
    ctx.restore();

    // foreground lantern strings
    this.layer(ctx, cam, 1.25, (g) => {
      const top = -GROUND_Y / cam.zoom - 20;
      for (let span = -3; span <= 3; span++) {
        const x0 = span * 520 - 260;
        const x1 = x0 + 520;
        g.strokeStyle = '#140a10';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x0, top + 30);
        g.quadraticCurveTo((x0 + x1) / 2, top + 120, x1, top + 30);
        g.stroke();
        for (let k = 1; k <= 3; k++) {
          const u = k / 4;
          const lx = x0 + (x1 - x0) * u;
          const ly = top + 30 + 2 * u * (1 - u) * 90 + 6;
          const sw = Math.sin(t * 0.04 + span * 1.3 + k) * 0.12;
          this.lantern(g, lx, ly, sw);
        }
      }
    });
    ctx.drawImage(this.vignette, 0, 0);
  }

  lantern(g, x, y, sw) {
    g.save();
    g.translate(x, y);
    g.rotate(sw);
    g.strokeStyle = '#140a10';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(0, 10);
    g.stroke();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.55;
    const s = glowSprite('#ff5a2a', 0.15, 128);
    g.drawImage(s, -70, -40, 140, 140);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const lg = g.createRadialGradient(-6, 22, 3, 0, 30, 24);
    lg.addColorStop(0, '#ffd27a');
    lg.addColorStop(0.5, '#e8302a');
    lg.addColorStop(1, '#6a0a10');
    g.fillStyle = lg;
    g.beginPath();
    g.ellipse(0, 30, 19, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a1410';
    g.fillRect(-10, 6, 20, 5);
    g.fillRect(-10, 50, 20, 5);
    g.strokeStyle = 'rgba(80,10,10,0.6)';
    g.lineWidth = 1.2;
    for (const dx of [-10, 0, 10]) {
      g.beginPath();
      g.ellipse(0, 30, Math.abs(dx) + 2, 22, 0, -Math.PI / 2, Math.PI / 2, dx < 0);
      g.stroke();
    }
    g.strokeStyle = '#ffb03a';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, 55);
    g.lineTo(0, 70);
    g.stroke();
    g.restore();
  }
}
