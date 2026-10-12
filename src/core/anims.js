import { R_, lerp, sample, EASE, STANCE as S, CROUCH, JUMP, GUARD, CGUARD } from './pose.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

const POSES = {
  stance: R_(S, {}),
  crouch: R_(CROUCH, {}),
  guard: R_(GUARD, {}),
  cguard: R_(CGUARD, {}),
  squat: R_(S, { hy: 76, t: 18, h: -14, ffx: 28, bfx: -30, fs: 20, bs: 4 }),
  tuck: R_(JUMP, {}),
  stretch: R_(JUMP, { t: -2, h: -10, fs: 150, fe: 30, bs: 120, be: 40, fh: 20, fk: 30, bh: -12, bk: 20 }),
  fall: R_(JUMP, { fh: 30, fk: 40, bh: -5, bk: 30, fs: 70, fe: 60, bs: 40, be: 70 }),
  hitHigh: R_(S, { hx: -10, t: -24, h: -26, fs: -15, fe: 70, bs: -35, be: 60, ffx: 32, bfx: -36 }),
  hitBody: R_(S, { hx: -4, hy: 84, t: 36, h: 14, fs: 20, fe: 80, bs: 0, be: 70, ffx: 30, bfx: -34 }),
  hitCrouch: R_(CROUCH, { hx: -6, t: 8, h: -26, fs: 10, fe: 70, bs: -10, be: 60 }),
  airHit: R_(JUMP, { t: -30, h: -30, fs: 150, fe: 30, bs: 120, be: 30, fh: 40, fk: 50, bh: 10, bk: 30 }),
  lie: R_(JUMP, { hx: -12, hy: 14, t: 0, h: 6, fs: 120, fe: 20, bs: 100, be: 30, fh: 6, fk: 10, bh: -4, bk: 16, rot: -90 }),
  sit: R_(JUMP, { hx: -6, hy: 26, t: 0, h: -10, fs: 60, fe: 60, bs: 40, be: 80, fh: 85, fk: 110, bh: 70, bk: 130, rot: -40 }),
  backdash: R_(S, { hx: -6, t: -10, h: -12, fs: 20, fe: 100, bs: 0, be: 110, fh: 30, fk: 70, bh: -10, bk: 50 }),
  winKaen: R_(S, { hy: 96, t: -4, h: -15, fs: 176, fe: 5, bs: -10, be: 30, ffx: 30, bfx: -36 }),
  winRaiden: R_(S, { hy: 95, t: -6, h: -16, fs: 62, fe: 150, bs: 52, be: 150, ffx: 28, bfx: -38 }),
};

const GETUP = [[0, POSES.lie], [9, POSES.sit], [15, POSES.crouch], [21, POSES.stance]];

function walkPose(sf, fwd) {
  const ph = sf * (fwd ? 0.17 : -0.15);
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  return R_(S, {
    hy: 92 - Math.abs(s) * 2.5, t: fwd ? 12 : 6,
    ffx: 26 + s * 13, ffy: Math.max(0, c) * 8, bfx: -28 - s * 13, bfy: Math.max(0, -c) * 8,
    fs: 30 + s * 5, bs: 12 - s * 5,
  });
}

function runPose(sf) {
  const ph = sf * 0.34;
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  return R_(S, {
    hx: 6, hy: 86 + Math.abs(c) * 4, t: 32, h: -24,
    fh: 20 + s * 42, fk: 40 + Math.max(0, -c) * 70, bh: 20 - s * 42, bk: 40 + Math.max(0, c) * 70,
    fs: 20 - s * 45, fe: 85, bs: 20 + s * 45, be: 85,
  });
}

export function statePose(f) {
  const sf = f.sf;
  switch (f.state) {
    case 'move':
      return sample(f.move.keys, f.mf);
    case 'intro':
    case 'idle': {
      if (f.guarding) return POSES.guard;
      const b = Math.sin(sf * 0.09 + f.index * 1.7);
      return R_(S, { hy: 92 + b * 1.6, t: 10 - b, fs: 30 + b * 3, bs: 12 + b * 2 });
    }
    case 'walkF':
      return walkPose(sf, true);
    case 'walkB':
      return f.guarding ? POSES.guard : walkPose(sf, false);
    case 'crouch': {
      if (f.guarding) return POSES.cguard;
      const b = Math.sin(sf * 0.09 + f.index);
      return R_(CROUCH, { hy: 50 + b * 1.2, fs: 42 + b * 3 });
    }
    case 'dash':
      return runPose(sf);
    case 'backdash':
      return sf < 14 ? POSES.backdash : lerp(POSES.backdash, POSES.stance, EASE.io(clamp01((sf - 14) / 8)));
    case 'jumpSquat':
      return POSES.squat;
    case 'land':
      return lerp(POSES.squat, POSES.stance, clamp01(sf / Math.max(1, f.landLag)));
    case 'air': {
      if (f.airAttacked) return POSES.fall;
      if (f.jumpDir !== 0) {
        const p = { ...POSES.tuck };
        p.rot = f.jumpDir * 360 * EASE.io(clamp01((sf - 3) / 27));
        return p;
      }
      const k = clamp01(1 - Math.abs(f.vy) / 15);
      return lerp(f.vy > 0 ? POSES.stretch : POSES.fall, POSES.tuck, k);
    }
    case 'hit': {
      const base = f.crouching ? POSES.hitCrouch : f.hitKind === 'high' ? POSES.hitHigh : POSES.hitBody;
      const p = 1 - f.stun / Math.max(1, f.stunMax);
      return lerp(base, f.crouching ? POSES.crouch : POSES.stance, p < 0.55 ? 0 : EASE.io((p - 0.55) / 0.45));
    }
    case 'block': {
      const p = f.crouching ? POSES.cguard : POSES.guard;
      return { ...p, hx: p.hx - 4 * (f.stun / Math.max(1, f.stunMax)) };
    }
    case 'launch': {
      const k = clamp01((8 - f.vy) / 20) * 0.9;
      return lerp(POSES.airHit, POSES.lie, k);
    }
    case 'grabbed':
      return POSES.hitBody;
    case 'down':
    case 'ko':
      return POSES.lie;
    case 'getup':
      return sample(GETUP, sf);
    case 'win': {
      const w = f.char.id === 'raiden' ? POSES.winRaiden : POSES.winKaen;
      const b = Math.sin(sf * 0.08);
      return lerp(POSES.stance, { ...w, hy: w.hy + b }, EASE.out(clamp01(sf / 18)));
    }
    default:
      return POSES.stance;
  }
}
