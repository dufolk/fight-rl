export const P1_KEYS = { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], j: ['KeyJ'], k: ['KeyK'], l: ['KeyL'] };
export const P2_KEYS = {
  up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
  j: ['Numpad1', 'Digit1', 'Comma'], k: ['Numpad2', 'Digit2', 'Period'], l: ['Numpad3', 'Digit3', 'Slash'],
};

const GAME_KEYS = new Set([...Object.values(P1_KEYS).flat(), ...Object.values(P2_KEYS).flat(), 'Space', 'Escape', 'Enter', 'F1']);

export class Keyboard {
  constructor() {
    this.down = new Set();
    this.hits = [];
    window.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.hits.push(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  any(codes) {
    return codes.some((c) => this.down.has(c));
  }

  // Drain one-shot key presses for menus.
  takeHits() {
    const h = this.hits;
    this.hits = [];
    return h;
  }

  read(map, pad = null) {
    const l = this.any(map.left) || pad?.left;
    const r = this.any(map.right) || pad?.right;
    const u = this.any(map.up) || pad?.up;
    const d = this.any(map.down) || pad?.down;
    return {
      x: (r ? 1 : 0) - (l ? 1 : 0),
      y: (u ? 1 : 0) - (d ? 1 : 0),
      j: this.any(map.j) || !!pad?.j,
      k: this.any(map.k) || !!pad?.k,
      l: this.any(map.l) || !!pad?.l,
    };
  }
}

export function readGamepad(index) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const p = pads && pads[index];
  if (!p) return null;
  const b = (i) => !!p.buttons[i]?.pressed;
  const ax = p.axes[0] || 0;
  const ay = p.axes[1] || 0;
  return {
    left: ax < -0.5 || b(14), right: ax > 0.5 || b(15), up: ay < -0.5 || b(12), down: ay > 0.5 || b(13),
    j: b(2) || b(0), k: b(3) || b(1), l: b(5) || b(7),
  };
}
