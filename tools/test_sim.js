// Headless sanity checks: CPU vs CPU matches, determinism, env throughput, special-move input parsing.
import { Game } from '../src/core/game.js';
import { CpuAI } from '../src/core/ai.js';
import { FightEnv } from '../rl/env.js';
import { InputBuffer, QCF, DP, QCB } from '../src/core/input.js';

let failures = 0;
const check = (cond, msg) => {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  }
};

// --- input parsing --------------------------------------------------------
function feed(seq) {
  const b = new InputBuffer();
  for (const [x, y, n] of seq) for (let i = 0; i < n; i++) b.push({ x, y }, 1);
  return b;
}
check(feed([[0, -1, 2], [1, -1, 2], [1, 0, 1]]).motion(QCF) >= 0, 'QCF recognised');
check(feed([[1, 0, 2], [0, -1, 2], [1, -1, 1]]).motion(DP) >= 0, 'DP recognised');
check(feed([[0, -1, 2], [-1, -1, 2], [-1, 0, 1]]).motion(QCB) >= 0, 'QCB recognised');
check(feed([[1, 0, 3], [0, 0, 3], [0, -1, 2], [1, -1, 2], [1, 0, 1]]).motion(QCF) === 0, 'walk then QCF -> QCF most recent');

// --- CPU vs CPU matches ------------------------------------------------------
function runMatch(seed, p1, p2) {
  const g = new Game({ seed, p1, p2 });
  const ais = [new CpuAI(4, seed + 1), new CpuAI(3, seed + 2)];
  const moves = {};
  let hits = 0;
  let frames = 0;
  const hashParts = [];
  while (g.phase !== 'matchOver' && frames < 60 * 60 * 8) {
    const ev = g.step([ais[0].act(g, 0), ais[1].act(g, 1)]);
    frames++;
    for (const e of ev) {
      if (e.type === 'move') moves[e.name] = (moves[e.name] || 0) + 1;
      if (e.type === 'hit') hits++;
    }
    for (const f of g.fighters) {
      if (!Number.isFinite(f.x) || !Number.isFinite(f.y) || !Number.isFinite(f.hp)) throw new Error('NaN state at frame ' + frames);
    }
    if (frames % 97 === 0) hashParts.push(g.fighters.map((f) => `${f.x.toFixed(2)},${f.y.toFixed(2)},${f.hp}`).join('|'));
  }
  return { frames, hits, moves, winner: g.matchWinner, rounds: g.round, phase: g.phase, hash: hashParts.join(';') };
}

const t0 = performance.now();
const results = [];
for (let s = 1; s <= 6; s++) results.push(runMatch(s, s % 2 ? 'kaen' : 'raiden', s % 3 ? 'raiden' : 'kaen'));
const dt = performance.now() - t0;
let totalFrames = 0;
const allMoves = {};
for (const r of results) {
  totalFrames += r.frames;
  for (const [k, v] of Object.entries(r.moves)) allMoves[k] = (allMoves[k] || 0) + v;
  console.log(`match: ${r.phase} winner=P${r.winner + 1} rounds=${r.rounds} frames=${r.frames} hits=${r.hits}`);
  check(r.phase === 'matchOver', 'match finished');
  check(r.hits > 10, 'hits landed');
}
console.log('move usage:', allMoves);
console.log(`sim speed: ${Math.round(totalFrames / (dt / 1000))} frames/s`);

const again = runMatch(1, 'raiden', 'raiden');
const again2 = runMatch(1, 'raiden', 'raiden');
check(again.hash === again2.hash, 'deterministic replay');

// --- env --------------------------------------------------------------------
const env = new FightEnv({ frameSkip: 4 });
let { obs } = env.reset(7);
check(obs.length === FightEnv.observationSize, `obs size ${obs.length} == ${FightEnv.observationSize}`);
let steps = 0;
let ret = 0;
const te = performance.now();
for (let ep = 0; ep < 5; ep++) {
  env.reset(ep);
  for (;;) {
    const r = env.step(Math.floor(Math.random() * FightEnv.actionCount));
    steps++;
    ret += r.reward;
    if (r.obs.some((v) => !Number.isFinite(v))) throw new Error('non-finite obs');
    if (r.terminated || r.truncated) break;
  }
}
console.log(`env: ${steps} steps, ${Math.round(steps / ((performance.now() - te) / 1000))} steps/s, avg return ${(ret / 5).toFixed(3)}`);

if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('all checks passed');
