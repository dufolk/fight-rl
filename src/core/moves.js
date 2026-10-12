import { P, resolve, STANCE as S, CROUCH as C, JUMP as JP } from './pose.js';

const key = (f, base, over = {}, ease) => [f, resolve(P(base, over)), ease];

// Hit fields:
//   from/to  active frames (inclusive)      limb | box  hitbox source
//   dmg, hs (hitstun), bs (blockstun), push, stop (hitstop), chip
//   level: 'mid' | 'low' | 'overhead'        kind: light|mid|heavy|special|super
//   react: 'high' | 'body'                   launch: { vx, vy } -> knockdown
const hit = (o) => ({ id: 0, r: 12, level: 'mid', kind: 'light', react: 'body', push: 5, stop: 7, hs: 14, bs: 10, chip: 0, ...o });

const JAB_EXT = { hx: 6, t: 16, h: -10, fs: 88, fe: 3, bs: 6, be: 136, ffx: 32 };
const KICK_EXT = { hx: -4, hy: 98, t: -18, h: 5, ffx: 8, bh: 98, bk: 5, fs: 10, fe: 100, bs: -30, be: 60 };
const HEAVY_EXT = { hx: 14, hy: 84, t: 24, h: -14, bs: 92, be: 0, fs: -10, fe: 110, ffx: 44, bfx: -36 };
const CRJAB_EXT = { hx: 4, t: 34, fs: 88, fe: 0, bs: 20, be: 125 };
const CRK_EXT = { hy: 50, t: 14, fh: 72, fk: 0, bfx: -36, fs: 50, fe: 90 };
const SWEEP_EXT = { hy: 40, t: 30, h: -10, bh: 80, bk: 2, ffx: 20, fs: -20, fe: 60, bs: 40, be: 30 };
const FB_PUSH = { hx: 10, hy: 86, t: 20, h: -12, fs: 84, fe: 4, bs: 80, be: 10, ffx: 44, bfx: -34 };
const DP_RISE = { hx: 6, hy: 96, t: -8, h: -16, fs: 168, fe: 6, bs: 30, be: 100, fh: 80, fk: 100, bh: -8, bk: 20 };
const GRAB = { hx: 8, t: 16, fs: 80, fe: 20, bs: 70, be: 30, ffx: 36 };
const SUPER_CHARGE = { hx: -6, hy: 76, t: 22, h: 6, fs: -30, fe: 120, bs: -45, be: 110, ffx: 34, bfx: -38 };
const SUPER_RELEASE = { hx: 16, hy: 84, t: 26, h: -14, fs: 118, fe: 6, bs: -50, be: 30, ffx: 52, bfx: -40 };

function tatsuKeys() {
  const spin = P(S, { hy: 102, t: -4, h: -8, fs: 95, fe: 20, bs: -80, be: 20, fh: 92, fk: 4, bh: 15, bk: 95 });
  const keys = [key(0, S), key(6, S, { hy: 80, t: 16, fs: 60, fe: 70, bs: -20, be: 90, fh: 40, fk: 100 }, 'out')];
  let i = 0;
  for (let f = 9; f <= 41; f += 4, i++) keys.push([f, resolve({ ...spin, flip: i % 2 === 1 })]);
  keys.push(key(45, S, { hy: 84, t: 14, fs: 40, fe: 100 }), key(58, S));
  return keys;
}

export const MOVES = {
  jab: {
    total: 16, normal: true,
    keys: [key(0, S), key(2, S, { t: 12, fs: 52, fe: 70 }, 'out'), key(4, S, JAB_EXT, 'out'), key(7, S, JAB_EXT), key(16, S)],
    hits: [hit({ from: 4, to: 6, limb: 'fha', r: 12, dmg: 30, hs: 13, bs: 9, push: 5, stop: 6, react: 'high' })],
    cancel: { from: 4, to: 12, chain: ['jab', 'crJab'] },
  },
  kick: {
    total: 26, normal: true,
    keys: [
      key(0, S), key(4, S, { hy: 96, t: -5, ffx: 12, bh: 60, bk: 100, fs: 20, fe: 120, bs: -10, be: 110 }, 'out'),
      key(7, S, KICK_EXT, 'out'), key(10, S, KICK_EXT), key(16, S, { hy: 94, ffx: 14, bh: 50, bk: 90, t: 0 }), key(26, S),
    ],
    hits: [hit({ from: 7, to: 10, limb: 'bft', r: 15, dmg: 55, hs: 17, bs: 12, push: 7, stop: 8, kind: 'mid' })],
    cancel: { from: 7, to: 14 },
  },
  heavy: {
    total: 34, normal: true,
    keys: [
      key(0, S), key(6, S, { hx: -8, t: -4, fs: 10, fe: 120, bs: -30, be: 100, bfx: -34, ffx: 22 }),
      key(10, S, HEAVY_EXT, 'out'), key(15, S, HEAVY_EXT), key(24, S, { hx: 8, hy: 88, t: 18, bs: 70, be: 40 }), key(34, S),
    ],
    hits: [hit({ from: 10, to: 14, limb: 'bha', r: 16, dmg: 85, hs: 21, bs: 14, push: 9, stop: 11, kind: 'heavy', react: 'high' })],
    cancel: { from: 10, to: 18 },
    update(f, F) {
      if (f >= 7 && f <= 13) F.vx = F.facing * 4;
    },
  },
  crJab: {
    total: 15, normal: true, crouch: true,
    keys: [key(0, C), key(2, C, { fs: 60, fe: 50 }, 'out'), key(4, C, CRJAB_EXT, 'out'), key(7, C, CRJAB_EXT), key(15, C)],
    hits: [hit({ from: 4, to: 6, limb: 'fha', r: 12, dmg: 25, hs: 13, bs: 9, push: 5, stop: 6 })],
    cancel: { from: 4, to: 12, chain: ['crJab', 'jab', 'crKick'] },
  },
  crKick: {
    total: 22, normal: true, crouch: true,
    keys: [key(0, C), key(3, C, { hy: 52, t: 20, fh: 45, fk: 80 }, 'out'), key(6, C, CRK_EXT, 'out'), key(9, C, CRK_EXT), key(22, C)],
    hits: [hit({ from: 6, to: 8, limb: 'fft', r: 13, dmg: 35, hs: 15, bs: 10, push: 5, stop: 7, level: 'low' })],
    cancel: { from: 6, to: 14, chain: ['crKick', 'crJab'] },
  },
  sweep: {
    total: 38, normal: true, crouch: true,
    keys: [
      key(0, C), key(5, C, { hy: 44, t: 35, bh: 20, bk: 100, ffx: 24 }), key(9, C, SWEEP_EXT, 'out'),
      key(14, C, SWEEP_EXT), key(26, C, { hy: 48, bh: 40, bk: 80 }), key(38, C),
    ],
    hits: [hit({ from: 9, to: 13, limb: 'bft', r: 17, dmg: 70, hs: 20, bs: 14, push: 6, stop: 9, level: 'low', kind: 'heavy', launch: { vx: 2.5, vy: 6 } })],
    cancel: { from: 9, to: 14 },
  },
  jJab: {
    total: 24, air: true,
    keys: [key(0, JP), key(3, JP, { fs: 20, fe: 110, t: 10 }, 'out'), key(5, JP, { fs: 52, fe: 2, t: 22, h: -6, bs: -10, be: 80 }, 'out'), key(14, JP, { fs: 52, fe: 2, t: 22, h: -6, bs: -10, be: 80 }), key(24, JP)],
    hits: [hit({ from: 5, to: 13, limb: 'fha', r: 14, dmg: 45, hs: 16, bs: 12, push: 4, stop: 8, level: 'overhead', react: 'high' })],
  },
  jKick: {
    total: 26, air: true,
    keys: [
      key(0, JP), key(3, JP, { fh: 80, fk: 120, bh: 30, bk: 110 }),
      key(6, JP, { fh: 52, fk: 2, bh: 5, bk: 115, t: -6, fs: 70, fe: 60, bs: -20, be: 70 }, 'out'),
      key(16, JP, { fh: 52, fk: 2, bh: 5, bk: 115, t: -6, fs: 70, fe: 60, bs: -20, be: 70 }), key(26, JP),
    ],
    hits: [hit({ from: 6, to: 15, limb: 'fft', r: 16, dmg: 60, hs: 18, bs: 13, push: 5, stop: 9, level: 'overhead', kind: 'mid' })],
  },
  jHeavy: {
    total: 28, air: true,
    keys: [
      key(0, JP), key(4, JP, { fs: 175, fe: 30, bs: 165, be: 30, t: -12, h: -10 }),
      key(7, JP, { fs: 65, fe: 0, bs: 58, be: 6, t: 28, h: 4 }, 'out'), key(13, JP, { fs: 65, fe: 0, bs: 58, be: 6, t: 28, h: 4 }), key(28, JP),
    ],
    hits: [hit({ from: 7, to: 12, limb: 'fha', r: 18, dmg: 80, hs: 20, bs: 14, push: 6, stop: 11, level: 'overhead', kind: 'heavy', react: 'high' })],
  },
  throw: {
    total: 26,
    keys: [key(0, S), key(3, S, GRAB, 'out'), key(8, S, GRAB), key(26, S)],
    hits: [],
    update(f, F, game) {
      if (f === 3) game.tryGrab(F);
    },
  },
  throwHit: {
    total: 44,
    keys: [
      key(0, S, GRAB), key(10, S, { hx: -4, t: -10, h: -10, fs: 150, fe: 20, bs: 140, be: 30, ffx: 30, bfx: -30 }),
      key(18, S, { hx: 12, hy: 80, t: 38, h: 10, fs: 70, fe: 10, bs: 60, be: 20, ffx: 46, bfx: -32 }, 'out'),
      key(30, S, { hx: 12, hy: 80, t: 38, h: 10, fs: 70, fe: 10, bs: 60, be: 20, ffx: 46, bfx: -32 }), key(44, S),
    ],
    hits: [],
    update(f, F, game) {
      if (f < 18) game.holdGrabbed(F, f);
      else if (f === 18) game.releaseGrabbed(F);
    },
  },
  fireball: {
    total: 46, special: true,
    keys: [
      key(0, S), key(8, S, { hx: -8, hy: 88, t: -4, h: -8, fs: -35, fe: 105, bs: -45, be: 100, ffx: 22, bfx: -32 }),
      key(12, S, FB_PUSH, 'out'), key(30, S, FB_PUSH), key(46, S),
    ],
    hits: [],
    update(f, F, game) {
      if (f === 12) {
        const strong = F.strength === 'l';
        game.spawnProjectile(F, {
          type: 'ball', x: F.x + F.facing * 92, y: F.y + 136, vx: F.facing * (strong ? 9 : 6.5), w: 56, h: 44, life: 160, hits: 1,
          hit: hit({ dmg: strong ? 75 : 70, hs: 20, bs: 16, push: 8, stop: 9, chip: 8, kind: 'special' }),
        });
      }
    },
  },
  dragon: {
    total: 999, special: true, air: true, landLag: 18, inv: [0, 8],
    keys: [
      key(0, C, { fs: 20, fe: 130, bs: 10, be: 120 }),
      key(3, S, { ...DP_RISE, fs: 115, fe: 10 }, 'out'), key(8, S, DP_RISE, 'out'), key(18, S, DP_RISE),
      key(30, S, { hx: 0, t: 4, h: -6, fs: 110, fe: 50, bs: 20, be: 100, fh: 40, fk: 70, bh: 5, bk: 50 }),
    ],
    hits: [
      hit({ id: 0, from: 3, to: 5, box: [5, 80, 60, 210], dmg: 60, hs: 20, bs: 16, push: 4, stop: 10, chip: 6, kind: 'special', react: 'high', launch: { vx: 2.2, vy: 11 } }),
      hit({ id: 1, from: 6, to: 14, limb: 'fha', r: 24, dmg: 50, hs: 20, bs: 16, push: 4, stop: 10, chip: 6, kind: 'special', react: 'high', launch: { vx: 3, vy: 13 } }),
    ],
    update(f, F) {
      if (f === 3) {
        const strong = F.strength === 'l';
        F.vy = strong ? 17.5 : 15.5;
        F.vx = F.facing * (strong ? 3.2 : 2.6);
        F.y = 1;
      }
    },
  },
  tatsu: {
    total: 58, special: true, script: true,
    keys: tatsuKeys(),
    hits: [9, 17, 25, 33, 40].map((f, i) => hit({
      id: i, from: f, to: f + 2, box: [-82, 86, 30, 128], dmg: 30, hs: 18, bs: 12, push: i === 4 ? 6 : 3, stop: 7, chip: 4, kind: 'special',
      launch: i === 4 ? { vx: 5, vy: 9 } : undefined,
    })),
    update(f, F) {
      const strong = F.strength === 'l';
      if (f >= 6 && f < 44) {
        F.vx = F.facing * (strong ? 5.2 : 4.2);
        F.y = 44 * Math.sin((Math.PI * (f - 6)) / 38);
      } else {
        F.y = 0;
        F.vx *= 0.6;
      }
    },
  },
  super: {
    total: 92, special: true, superMove: true, cost: 100, inv: [0, 52],
    keys: [key(0, S), key(10, S, SUPER_CHARGE), key(38, S, { ...SUPER_CHARGE, hy: 72, h: 10 }), key(46, S, SUPER_RELEASE, 'out'), key(64, S, SUPER_RELEASE), key(92, S)],
    hits: [],
    update(f, F, game) {
      if (f === 0) game.startSuperFreeze(F, 40);
      if (f === 46) {
        game.spawnProjectile(F, {
          type: 'wave', x: F.x + F.facing * 90, y: F.y + 110, vx: F.facing * 8.5, w: 150, h: 220, life: 80, hits: 5, every: 5,
          hit: hit({ dmg: 50, hs: 24, bs: 14, push: 2, stop: 12, chip: 10, kind: 'super', react: 'high' }),
          finalLaunch: { vx: 7, vy: 12 },
        });
      }
    },
  },
};

export const MOVE_LIST = Object.keys(MOVES);
for (const [name, m] of Object.entries(MOVES)) {
  m.name = name;
  m.lastActive = m.hits.reduce((a, h) => Math.max(a, h.to), 0);
}
