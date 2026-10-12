import { MAX_HP, MAX_POWER, POWER_STOCK, INTRO_FRAMES } from '../core/constants.js';
import { makeCanvas, clamp, ELEMENTS, rgba } from './util.js';
import { VIEW_W, VIEW_H } from './stage.js';

export const FONT_EN = '"Arial Black", "Impact", "Segoe UI Black", sans-serif';
export const FONT_CN = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';

const BAR_W = 470;
const BAR_H = 24;
const BAR_Y = 34;
const SKEW = 14;

const easeOutBack = (t) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

export function bigText(ctx, text, x, y, size, opts = {}) {
  ctx.save();
  ctx.font = `italic 900 ${size}px ${opts.font || FONT_EN}`;
  ctx.textAlign = opts.align || 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  for (const [o, c] of opts.grad || [[0, '#ffffff'], [0.45, '#fff2a8'], [0.55, '#ffb21e'], [1, '#d4400c']]) g.addColorStop(o, c);
  if (opts.glow) {
    ctx.shadowColor = opts.glow;
    ctx.shadowBlur = size * 0.35;
  }
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = opts.stroke || '#1a0610';
  ctx.strokeText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.lineWidth = size * 0.05;
  ctx.strokeStyle = opts.inner || '#fff6d8';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = g;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export class HUD {
  constructor(renderers) {
    this.renderers = renderers;
    this.disp = [MAX_HP, MAX_HP];
    this.lag = [MAX_HP, MAX_HP];
    this.lagHold = [0, 0];
    this.combo = [{ n: 0, t: 0, pop: 0 }, { n: 0, t: 0, pop: 0 }];
    this.portraits = renderers.map((r, i) => {
      const c = makeCanvas(96, 96);
      const g = c.getContext('2d');
      r.drawPortrait(g, 50, 56, 2.2, i === 1);
      return c;
    });
    this.time = 0;
  }

  reset() {
    this.disp = [MAX_HP, MAX_HP];
    this.lag = [MAX_HP, MAX_HP];
    this.combo.forEach((c) => (c.t = 0));
  }

  onEvent(e) {
    if (e.type === 'hit') {
      this.lagHold[e.i] = 40;
      if (e.combo >= 2) {
        const c = this.combo[e.atk];
        c.n = e.combo;
        c.t = 100;
        c.pop = 1;
      }
    }
    if (e.type === 'roundStart') this.reset();
  }

  update(game, dt) {
    this.time += dt;
    for (let i = 0; i < 2; i++) {
      const hp = game.fighters[i].hp;
      this.disp[i] += (hp - this.disp[i]) * Math.min(1, 0.45 * dt);
      if (hp > this.lag[i]) this.lag[i] = hp;
      if (this.lagHold[i] > 0) this.lagHold[i] -= dt;
      else this.lag[i] += (hp - this.lag[i]) * Math.min(1, 0.06 * dt);
      const c = this.combo[i];
      c.t -= dt;
      c.pop = Math.max(0, c.pop - 0.12 * dt);
    }
  }

  bar(ctx, i, game) {
    const f = game.fighters[i];
    const left = i === 0;
    const x0 = left ? VIEW_W / 2 - 68 - BAR_W : VIEW_W / 2 + 68;
    const dirSkew = left ? SKEW : -SKEW;
    const shape = (fx0, fx1) => {
      ctx.beginPath();
      if (left) {
        ctx.moveTo(fx0 + SKEW, BAR_Y);
        ctx.lineTo(fx1 + SKEW, BAR_Y);
        ctx.lineTo(fx1, BAR_Y + BAR_H);
        ctx.lineTo(fx0, BAR_Y + BAR_H);
      } else {
        ctx.moveTo(fx0, BAR_Y);
        ctx.lineTo(fx1, BAR_Y);
        ctx.lineTo(fx1 + SKEW, BAR_Y + BAR_H);
        ctx.lineTo(fx0 + SKEW, BAR_Y + BAR_H);
      }
      ctx.closePath();
    };
    // frame
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 10;
    shape(x0 - 5, x0 + BAR_W + 5);
    ctx.fillStyle = '#100810';
    ctx.fill();
    ctx.restore();
    const fg = ctx.createLinearGradient(0, BAR_Y - 4, 0, BAR_Y + BAR_H + 4);
    fg.addColorStop(0, '#fff4c8');
    fg.addColorStop(0.5, '#b0884a');
    fg.addColorStop(1, '#5a3a1a');
    ctx.lineWidth = 3;
    ctx.strokeStyle = fg;
    shape(x0 - 4, x0 + BAR_W + 4);
    ctx.stroke();
    shape(x0, x0 + BAR_W);
    ctx.fillStyle = '#3a0a12';
    ctx.fill();

    const span = (v) => (BAR_W * clamp(v, 0, MAX_HP)) / MAX_HP;
    const seg = (v) => (left ? [x0, x0 + span(v)] : [x0 + BAR_W - span(v), x0 + BAR_W]);
    // lag (damage) bar
    const [l0, l1] = seg(this.lag[i]);
    shape(l0, l1);
    ctx.fillStyle = Math.floor(this.time / 4) % 2 ? '#ffffff' : '#ff4a3a';
    ctx.fill();
    // main bar
    const ratio = this.disp[i] / MAX_HP;
    const [m0, m1] = seg(this.disp[i]);
    shape(m0, m1);
    const g = ctx.createLinearGradient(0, BAR_Y, 0, BAR_Y + BAR_H);
    const danger = ratio < 0.25 && Math.floor(this.time / 10) % 2 === 0;
    if (danger) {
      g.addColorStop(0, '#ffd0c0');
      g.addColorStop(0.5, '#ff3a2a');
      g.addColorStop(1, '#a01010');
    } else {
      g.addColorStop(0, '#fffbd0');
      g.addColorStop(0.45, '#ffe04a');
      g.addColorStop(0.55, '#ffb21a');
      g.addColorStop(1, '#e06a0a');
    }
    ctx.fillStyle = g;
    ctx.fill();
    // gloss + ticks
    ctx.save();
    shape(x0, x0 + BAR_W);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x0 - 20, BAR_Y, BAR_W + 40, BAR_H * 0.38);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    for (let k = 1; k < 10; k++) {
      const x = x0 + (BAR_W * k) / 10;
      ctx.beginPath();
      ctx.moveTo(x + dirSkew * 0.5 + (left ? SKEW / 2 : SKEW / 2), BAR_Y);
      ctx.lineTo(x + (left ? 0 : SKEW), BAR_Y + BAR_H);
      ctx.stroke();
    }
    ctx.restore();

    // portrait
    const px = left ? 50 : VIEW_W - 50;
    ctx.save();
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const xx = px + Math.cos(a) * 42;
      const yy = 52 + Math.sin(a) * 42;
      if (k === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.closePath();
    const pg = ctx.createLinearGradient(0, 10, 0, 94);
    const E = ELEMENTS[f.char.element];
    pg.addColorStop(0, E.deep);
    pg.addColorStop(1, '#12060e');
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = fg;
    ctx.stroke();
    ctx.clip();
    ctx.drawImage(this.portraits[i], px - 48, 4);
    ctx.restore();

    // name
    ctx.save();
    ctx.font = `italic 900 22px ${FONT_EN}`;
    ctx.textAlign = left ? 'left' : 'right';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#12060e';
    const nx = left ? x0 + 8 : x0 + BAR_W - 8;
    const name = `${f.char.name}`;
    ctx.strokeText(name, nx, BAR_Y + BAR_H + 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, nx, BAR_Y + BAR_H + 6);
    const w = ctx.measureText(name).width;
    ctx.font = `bold 18px ${FONT_CN}`;
    const cx = left ? nx + w + 10 : nx - w - 10;
    ctx.strokeText(f.char.cn, cx, BAR_Y + BAR_H + 9);
    ctx.fillStyle = E.spark;
    ctx.fillText(f.char.cn, cx, BAR_Y + BAR_H + 9);
    ctx.restore();

    // round markers
    for (let k = 0; k < game.opts.roundsToWin; k++) {
      const mx = left ? VIEW_W / 2 - 84 - k * 24 : VIEW_W / 2 + 84 + k * 24;
      const my = BAR_Y + BAR_H + 20;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = k < f.roundsWon ? '#ffcc33' : '#2a1a22';
      ctx.strokeStyle = '#fff2c0';
      ctx.lineWidth = 2;
      ctx.fillRect(-7, -7, 14, 14);
      ctx.strokeRect(-7, -7, 14, 14);
      ctx.restore();
    }
  }

  timer(ctx, game) {
    const cx = VIEW_W / 2;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - 52, 18);
    ctx.lineTo(cx + 52, 18);
    ctx.lineTo(cx + 62, 52);
    ctx.lineTo(cx + 44, 92);
    ctx.lineTo(cx - 44, 92);
    ctx.lineTo(cx - 62, 52);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 18, 0, 92);
    g.addColorStop(0, '#3a1a2a');
    g.addColorStop(1, '#0c0410');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    const fg = ctx.createLinearGradient(0, 18, 0, 92);
    fg.addColorStop(0, '#fff4c8');
    fg.addColorStop(1, '#8a5a2a');
    ctx.strokeStyle = fg;
    ctx.stroke();
    ctx.restore();
    const secs = game.opts.training ? '∞' : String(Math.ceil(game.timer / 60)).padStart(2, '0');
    const low = !game.opts.training && game.timer < 600;
    bigText(ctx, secs, cx, 56, 52, low ? { grad: [[0, '#ffffff'], [0.5, '#ff7a6a'], [1, '#b0100a']] } : {});
  }

  power(ctx, i, game) {
    const f = game.fighters[i];
    const left = i === 0;
    const W = 300;
    const H = 14;
    const y = VIEW_H - 40;
    const x0 = left ? 92 : VIEW_W - 92 - W;
    const stocks = Math.floor(f.power / POWER_STOCK);
    const part = (f.power % POWER_STOCK) / POWER_STOCK;
    const full = f.power >= MAX_POWER;
    const E = ELEMENTS[f.char.element];
    ctx.save();
    ctx.fillStyle = 'rgba(10,4,12,0.85)';
    ctx.strokeStyle = '#c8a060';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 - 4, y - 4);
    ctx.lineTo(x0 + W + 10, y - 4);
    ctx.lineTo(x0 + W + 4, y + H + 4);
    ctx.lineTo(x0 - 10, y + H + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const fillW = full ? W : W * part;
    const fx = left ? x0 : x0 + W - fillW;
    const g = ctx.createLinearGradient(0, y, 0, y + H);
    g.addColorStop(0, full ? '#ffffff' : E.spark);
    g.addColorStop(0.5, E.main);
    g.addColorStop(1, E.deep);
    ctx.fillStyle = g;
    ctx.fillRect(fx, y, fillW, H);
    if (stocks > 0) {
      const sweep = ((this.time * 6) % (W + 120)) - 60;
      const sg = ctx.createLinearGradient(x0 + sweep - 40, 0, x0 + sweep + 40, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, 'rgba(255,255,255,0.55)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(fx, y, fillW, H);
    }
    ctx.restore();
    const sx = left ? x0 - 40 : x0 + W + 40;
    bigText(ctx, String(stocks), sx, y + 6, 40, { grad: [[0, '#ffffff'], [0.5, E.spark], [1, E.deep]], glow: stocks ? E.main : null });
    ctx.save();
    ctx.font = `italic 900 13px ${FONT_EN}`;
    ctx.textAlign = left ? 'left' : 'right';
    ctx.fillStyle = full ? (Math.floor(this.time / 6) % 2 ? '#ffffff' : E.spark) : '#e8d8c0';
    ctx.fillText(full ? 'MAXIMUM' : 'POWER', left ? x0 : x0 + W, y - 9);
    ctx.restore();
  }

  comboText(ctx, i) {
    const c = this.combo[i];
    if (c.t <= 0 || c.n < 2) return;
    const left = i === 0;
    const a = clamp(c.t / 20, 0, 1);
    const x = left ? 150 : VIEW_W - 150;
    ctx.save();
    ctx.globalAlpha = a;
    const s = 1 + c.pop * 0.5;
    ctx.translate(x, 250);
    ctx.scale(s, s);
    bigText(ctx, String(c.n), 0, 0, 78, { grad: [[0, '#ffffff'], [0.5, '#ffe36a'], [1, '#ff6a00']] });
    bigText(ctx, 'HITS', 0, 50, 30, { grad: [[0, '#ffffff'], [1, '#ffb030']] });
    ctx.restore();
  }

  announcer(ctx, game) {
    const ph = game.phase;
    const t = game.phaseT;
    const cy = VIEW_H * 0.42;
    const show = (text, t0, dur, size, opts = {}) => {
      const k = t - t0;
      if (k < 0 || k > dur) return;
      const inT = clamp(k / 12, 0, 1);
      const outT = clamp((dur - k) / 10, 0, 1);
      ctx.save();
      ctx.globalAlpha = outT;
      ctx.translate(VIEW_W / 2, cy);
      const s = (0.2 + 0.8 * easeOutBack(inT)) * (1 + (1 - outT) * 0.4);
      ctx.scale(s, s);
      if (opts.band) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(-VIEW_W, -size * 0.75, VIEW_W * 2, size * 1.5);
      }
      bigText(ctx, text, 0, 0, size, opts);
      ctx.restore();
    };
    if (ph === 'intro') {
      const final = game.fighters.every((f) => f.roundsWon === game.opts.roundsToWin - 1) && game.opts.roundsToWin > 1;
      show(final ? 'FINAL ROUND' : `ROUND ${game.round}`, 8, 66, 100, { band: true });
      show('FIGHT!', 80, INTRO_FRAMES - 80 + 30, 150, { glow: '#ff6a00' });
    } else if (ph === 'fight' && t < 30) {
      const tt = t + INTRO_FRAMES;
      const k = tt - 80;
      const dur = INTRO_FRAMES - 80 + 30;
      if (k <= dur && !game.opts.skipIntro) {
        ctx.save();
        ctx.globalAlpha = clamp((dur - k) / 10, 0, 1);
        ctx.translate(VIEW_W / 2, cy);
        const s = 1 + (1 - clamp((dur - k) / 10, 0, 1)) * 0.4;
        ctx.scale(s, s);
        bigText(ctx, 'FIGHT!', 0, 0, 150, { glow: '#ff6a00' });
        ctx.restore();
      }
    } else if (ph === 'ko') {
      const kt = game.koType;
      if (kt === 'time') show('TIME UP', 0, 110, 120, { band: true });
      else if (kt === 'double') show('DOUBLE K.O.', 0, 110, 120, { glow: '#ff2a00' });
      else show('K.O.', 0, 110, 190, { glow: '#ff2a00', grad: [[0, '#ffffff'], [0.4, '#ffd0a0'], [0.6, '#ff3a1a'], [1, '#8a0000']] });
      if (kt === 'perfect') show('PERFECT', 60, 60, 80, {});
      const w = game.roundWinner;
      show(w >= 0 ? `${game.fighters[w].char.name} WINS` : 'DRAW', 120, 105, 84, { band: true });
    }
  }

  draw(ctx, game) {
    this.bar(ctx, 0, game);
    this.bar(ctx, 1, game);
    this.timer(ctx, game);
    this.power(ctx, 0, game);
    this.power(ctx, 1, game);
    this.comboText(ctx, 0);
    this.comboText(ctx, 1);
    this.announcer(ctx, game);
  }
}

export { rgba };
