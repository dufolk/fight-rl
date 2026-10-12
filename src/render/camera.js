import { STAGE_HALF } from '../core/constants.js';
import { VIEW_W, GROUND_Y } from './stage.js';
import { clamp } from './util.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.shakeAmt = 0;
    this.sx = 0;
    this.sy = 0;
    this.view = { x: 0, y: 0, zoom: 1 };
  }

  snap(game) {
    const [a, b] = game.fighters;
    this.x = (a.x + b.x) / 2;
    this.y = 0;
    this.zoom = 1;
  }

  update(game, dt) {
    const [a, b] = game.fighters;
    let tx = (a.x + b.x) / 2;
    const dist = Math.abs(a.x - b.x);
    let tz = clamp(1.1 - (dist - 260) / 1700, 0.84, 1.1);
    let ty = Math.max(0, Math.max(a.y, b.y) - 70) * 0.45;
    let rate = 0.12;
    if (game.superFreeze > 0) {
      const f = game.fighters[game.superOwner];
      tx = f.x + f.facing * 50;
      tz = 1.34;
      ty = 20;
      rate = 0.2;
    }
    const k = 1 - Math.pow(1 - rate, dt);
    this.zoom += (tz - this.zoom) * k * 0.8;
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    const half = VIEW_W / 2 / this.zoom;
    this.x = clamp(this.x, -STAGE_HALF - 40 + half, STAGE_HALF + 40 - half);
    this.shakeAmt *= Math.pow(0.84, dt);
    if (this.shakeAmt < 0.1) this.shakeAmt = 0;
    this.sx = (Math.random() * 2 - 1) * this.shakeAmt;
    this.sy = (Math.random() * 2 - 1) * this.shakeAmt * 0.7;
    this.view.x = this.x + this.sx;
    this.view.y = this.y + this.sy;
    this.view.zoom = this.zoom;
  }

  shake(a) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }

  apply(ctx) {
    ctx.translate(VIEW_W / 2, GROUND_Y);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.view.x, this.view.y);
  }
}
