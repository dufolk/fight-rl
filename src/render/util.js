export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}

// amt > 0 lightens toward white, amt < 0 darkens toward a cool shadow tone.
export function shade(hex, amt) {
  const c = hexToRgb(hex);
  if (amt >= 0) return rgbToHex(c.map((v) => v + (255 - v) * amt));
  const k = 1 + amt;
  return rgbToHex([c[0] * k, c[1] * k, c[2] * k + (1 - k) * 18]);
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

const spriteCache = new Map();

// Soft radial glow sprite (white-hot core fading to color), cached per color.
export function glowSprite(color, core = 0.18, size = 128) {
  const key = `${color}|${core}|${size}`;
  let c = spriteCache.get(key);
  if (c) return c;
  c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const r = size / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, `rgba(255,255,255,1)`);
  grd.addColorStop(core, rgba(color, 0.95));
  grd.addColorStop(0.45, rgba(color, 0.35));
  grd.addColorStop(1, rgba(color, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  spriteCache.set(key, c);
  return c;
}

export function softSprite(color, size = 96) {
  const key = `soft|${color}|${size}`;
  let c = spriteCache.get(key);
  if (c) return c;
  c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const r = size / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, rgba(color, 0.9));
  grd.addColorStop(0.5, rgba(color, 0.45));
  grd.addColorStop(1, rgba(color, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  spriteCache.set(key, c);
  return c;
}

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export const ELEMENTS = {
  fire: { core: '#fff3c4', main: '#ff8a1e', deep: '#e8300c', dark: '#7a1206', spark: '#ffd36b', trail: '#ff6a1a' },
  thunder: { core: '#f4f0ff', main: '#a57bff', deep: '#5b34ff', dark: '#24106e', spark: '#c9f3ff', trail: '#8f6bff' },
};

// Seeded hash noise for stable procedural decoration.
export function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
