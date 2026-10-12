// Skeleton + pose math shared by the simulation (hit/hurt boxes) and the renderer.
// Local space: x points toward facing, y points up, origin = fighter base on the ground.
// Limb angles are in degrees measured from "straight down", positive = rotated forward.
//   arms:  fs/bs = upper arm, fe/be = elbow flex (forearm = upper + elbow)
//   legs:  fh/bh = thigh,     fk/bk = knee bend  (shin = thigh - knee)
// Legs may instead be given foot targets (ffx, ffy / bfx, bfy) solved with 2-bone IK.
export const B = { thigh: 50, shin: 50, spine: 58, neck: 12, headR: 16, upper: 34, fore: 32, hipOff: 5, shOff: 4 };

const R = Math.PI / 180;
const FIELDS = ['hx', 'hy', 't', 'h', 'fs', 'fe', 'bs', 'be', 'fh', 'fk', 'bh', 'bk', 'rot'];
const POINTS = ['hip', 'chest', 'head', 'sh', 'fsh', 'bsh', 'fel', 'fha', 'bel', 'bha', 'fhp', 'bhp', 'fkn', 'fft', 'bkn', 'bft', 'ftoe', 'btoe'];

export const dir = (a) => [Math.sin(a * R), -Math.cos(a * R)];

function ik(hx, hy, fx, fy) {
  const L1 = B.thigh;
  const L2 = B.shin;
  const dx = fx - hx;
  const dy = fy - hy;
  const d = Math.min(Math.max(Math.hypot(dx, dy), 12), L1 + L2 - 0.01);
  const a0 = Math.atan2(dx, -dy);
  const alpha = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
  const inner = Math.acos((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2));
  return [(a0 + alpha) / R, (Math.PI - inner) / R];
}

export function P(base, over = {}) {
  const p = { ...base, ...over };
  if ('fh' in over || 'fk' in over) {
    delete p.ffx;
    delete p.ffy;
    p.fh ??= 0;
    p.fk ??= 0;
  } else if ('ffx' in over || 'ffy' in over) {
    delete p.fh;
    delete p.fk;
    p.ffx ??= 0;
    p.ffy ??= 0;
  }
  if ('bh' in over || 'bk' in over) {
    delete p.bfx;
    delete p.bfy;
    p.bh ??= 0;
    p.bk ??= 0;
  } else if ('bfx' in over || 'bfy' in over) {
    delete p.bh;
    delete p.bk;
    p.bfx ??= 0;
    p.bfy ??= 0;
  }
  return p;
}

export function resolve(p) {
  const o = {
    hx: p.hx ?? 0, hy: p.hy ?? 92, t: p.t ?? 0, h: p.h ?? 0,
    fs: p.fs ?? 0, fe: p.fe ?? 0, bs: p.bs ?? 0, be: p.be ?? 0,
    fh: 0, fk: 0, bh: 0, bk: 0, rot: p.rot ?? 0, flip: !!p.flip,
  };
  const t = o.t * R;
  const px = Math.cos(t) * B.hipOff;
  const py = -Math.sin(t) * B.hipOff;
  if (p.ffx !== undefined) [o.fh, o.fk] = ik(o.hx + px, o.hy + py, p.ffx, p.ffy ?? 0);
  else [o.fh, o.fk] = [p.fh ?? 0, p.fk ?? 0];
  if (p.bfx !== undefined) [o.bh, o.bk] = ik(o.hx - px, o.hy - py, p.bfx, p.bfy ?? 0);
  else [o.bh, o.bk] = [p.bh ?? 0, p.bk ?? 0];
  return o;
}

export const R_ = (base, over) => resolve(P(base, over));

export function lerp(a, b, t) {
  const o = { flip: t < 0.5 ? a.flip : b.flip };
  for (const f of FIELDS) o[f] = a[f] + (b[f] - a[f]) * t;
  return o;
}

export const EASE = {
  lin: (t) => t,
  io: (t) => t * t * (3 - 2 * t),
  out: (t) => 1 - (1 - t) * (1 - t) * (1 - t),
  in: (t) => t * t,
};

// keys: [[frame, resolvedPose, ease?], ...] sorted by frame
export function sample(keys, f) {
  if (f <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (f >= last[0]) return last[1];
  let i = 0;
  while (keys[i + 1][0] <= f) i++;
  const [f0, a] = keys[i];
  const [f1, b, e] = keys[i + 1];
  return lerp(a, b, EASE[e || 'io']((f - f0) / (f1 - f0)));
}

export function joints(o) {
  const t = o.t * R;
  const ux = Math.sin(t);
  const uy = Math.cos(t);
  const px = uy;
  const py = -ux;
  const hip = [o.hx, o.hy];
  const chest = [hip[0] + ux * B.spine, hip[1] + uy * B.spine];
  const hd = B.neck + B.headR;
  const ht = t + o.h * 0.25 * R;
  const head = [chest[0] + Math.sin(ht) * hd, chest[1] + Math.cos(ht) * hd];
  const sh = [hip[0] + ux * (B.spine - 5), hip[1] + uy * (B.spine - 5)];
  const fsh = [sh[0] + px * B.shOff, sh[1] + py * B.shOff];
  const bsh = [sh[0] - px * B.shOff, sh[1] - py * B.shOff];
  const fhp = [hip[0] + px * B.hipOff, hip[1] + py * B.hipOff];
  const bhp = [hip[0] - px * B.hipOff, hip[1] - py * B.hipOff];
  const chain = (o0, a1, l1, a2, l2) => {
    const d1 = dir(a1);
    const m = [o0[0] + d1[0] * l1, o0[1] + d1[1] * l1];
    const d2 = dir(a2);
    return [m, [m[0] + d2[0] * l2, m[1] + d2[1] * l2]];
  };
  const [fel, fha] = chain(fsh, o.fs, B.upper, o.fs + o.fe, B.fore);
  const [bel, bha] = chain(bsh, o.bs, B.upper, o.bs + o.be, B.fore);
  const fShin = o.fh - o.fk;
  const bShin = o.bh - o.bk;
  const [fkn, fft] = chain(fhp, o.fh, B.thigh, fShin, B.shin);
  const [bkn, bft] = chain(bhp, o.bh, B.thigh, bShin, B.shin);
  const toe = (foot, shinA) => {
    const k = Math.min(Math.max(foot[1] / 12, 0), 1);
    const d = dir(90 + (shinA) * k);
    return [foot[0] + d[0] * 15, foot[1] + d[1] * 15];
  };
  const J = {
    hip, chest, head, sh, fsh, bsh, fel, fha, bel, bha, fhp, bhp, fkn, fft, bkn, bft,
    ftoe: toe(fft, fShin), btoe: toe(bft, bShin),
    headAng: o.t + o.h, flip: o.flip,
  };
  if (o.rot) {
    const a = -o.rot * R;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const [cx, cy] = hip;
    for (const k of POINTS) {
      if (k === 'hip') continue;
      const p = J[k];
      const x = p[0] - cx;
      const y = p[1] - cy;
      J[k] = [cx + x * c - y * s, cy + x * s + y * c];
    }
    J.headAng += o.rot;
  }
  if (o.flip) {
    const cx = hip[0];
    for (const k of POINTS) J[k] = [2 * cx - J[k][0], J[k][1]];
  }
  return J;
}

// ---- base poses -------------------------------------------------------------
export const STANCE = { hx: 0, hy: 92, t: 10, h: -6, fs: 30, fe: 110, bs: 12, be: 128, ffx: 26, ffy: 0, bfx: -28, bfy: 0 };
export const GUARD = P(STANCE, { hx: -4, t: 0, h: -12, fs: 44, fe: 120, bs: 32, be: 124, ffx: 22, bfx: -32 });
export const CROUCH = { hx: 2, hy: 50, t: 32, h: -20, fs: 42, fe: 100, bs: 22, be: 120, ffx: 32, ffy: 0, bfx: -28, bfy: 0 };
export const CGUARD = P(CROUCH, { hx: -4, t: 18, fs: 52, fe: 118, bs: 38, be: 120 });
export const JUMP = { hx: 0, hy: 100, t: 6, h: -4, fs: 40, fe: 100, bs: 20, be: 115, fh: 75, fk: 110, bh: 35, bk: 105 };
