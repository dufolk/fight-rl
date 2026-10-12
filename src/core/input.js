// Raw input: { x: -1|0|1 (absolute, +1 = right), y: -1|0|1 (+1 = up), j, k, l: bool }
// Directions inside the buffer are stored in numpad notation relative to facing:
//   7 8 9
//   4 5 6     (6 = toward the opponent)
//   1 2 3
export const NEUTRAL = Object.freeze({ x: 0, y: 0, j: false, k: false, l: false });

export const QCF = /23+6/g; // ↓↘→
export const QCB = /21+4/g; // ↓↙←
export const DP = /[63]5?2+3/g; // →↓↘
export const SUPER = /23+6[53]?23+6/g; // ↓↘→↓↘→

const BUTTONS = ['j', 'k', 'l'];

export class InputBuffer {
  constructor() {
    this.reset();
  }

  reset() {
    this.hist = [];
    this.frame = 0;
    this.press = { j: -999, k: -999, l: -999 };
    this.used = -1;
  }

  push(raw, facing) {
    const x = Math.sign(raw?.x || 0);
    const y = Math.sign(raw?.y || 0);
    const d = 5 + x * facing + 3 * y;
    const prev = this.hist[this.hist.length - 1];
    const e = { d, ax: x, ay: y, j: !!raw?.j, k: !!raw?.k, l: !!raw?.l, f: this.frame };
    for (const b of BUTTONS) if (e[b] && !(prev && prev[b])) this.press[b] = this.frame;
    this.hist.push(e);
    if (this.hist.length > 64) this.hist.shift();
    this.frame++;
  }

  get now() {
    return this.frame - 1;
  }

  get cur() {
    return this.hist[this.hist.length - 1] || { d: 5, ax: 0, ay: 0, j: false, k: false, l: false };
  }

  get dir() {
    return this.cur.d;
  }

  pressed(b, win = 5) {
    const p = this.press[b];
    return p > this.used && this.now - p < win;
  }

  together(a, b, win = 5) {
    return this.pressed(a, win) && this.pressed(b, win) && Math.abs(this.press[a] - this.press[b]) <= 3;
  }

  consume() {
    this.used = this.now;
  }

  runs(window) {
    const dirs = [];
    const starts = [];
    const from = this.now - window;
    let last = -1;
    for (const e of this.hist) {
      if (e.f <= from) continue;
      if (e.d !== last) {
        dirs.push(e.d);
        starts.push(e.f);
        last = e.d;
      }
    }
    return { s: dirs.join(''), starts };
  }

  // Age (frames) since the most recent completion of the motion, or -1.
  motion(re, window = 18, maxAge = 9) {
    const { s, starts } = this.runs(window);
    re.lastIndex = 0;
    let best = -1;
    let m;
    while ((m = re.exec(s))) {
      best = m.index + m[0].length - 1;
      re.lastIndex = m.index + 1;
    }
    if (best < 0) return -1;
    const age = this.now - starts[best];
    return age <= maxAge ? age : -1;
  }

  // Double tap (e.g. 6,5,6) that completes on this exact frame.
  doubleTap(d) {
    const { s, starts } = this.runs(20);
    const n = s.length;
    if (n < 3 || s[n - 1] !== String(d) || starts[n - 1] !== this.now) return false;
    if (s[n - 2] !== '5' || s[n - 3] !== String(d)) return false;
    return starts[n - 1] - starts[n - 2] <= 8 && starts[n - 2] - starts[n - 3] <= 12;
  }
}

// ---- RL action encoding --------------------------------------------------
// action = dirIndex + 9 * buttonMask, dirIndex = numpad - 1, mask bits J=1, K=2, L=4.
export const ACTION_COUNT = 72;

export function decodeAction(a, facing = 1, relative = true) {
  a = Math.max(0, Math.min(ACTION_COUNT - 1, a | 0));
  const num = (a % 9) + 1;
  const mask = Math.floor(a / 9);
  const rx = ((num - 1) % 3) - 1;
  const y = num >= 7 ? 1 : num <= 3 ? -1 : 0;
  return { x: relative ? rx * facing : rx, y, j: !!(mask & 1), k: !!(mask & 2), l: !!(mask & 4) };
}

export function encodeAction(numpad, { j = false, k = false, l = false } = {}) {
  return numpad - 1 + 9 * ((j ? 1 : 0) | (k ? 2 : 0) | (l ? 4 : 0));
}

export const NEUTRAL_ACTION = encodeAction(5);
