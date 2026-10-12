import { Game } from './core/game.js';
import { CpuAI } from './core/ai.js';
import { CHARACTERS, CHARACTER_IDS } from './core/characters.js';
import { NEUTRAL, NEUTRAL_ACTION, ACTION_COUNT, decodeAction, encodeAction } from './core/input.js';
import { Renderer, VIEW_W, VIEW_H } from './render/renderer.js';
import { FighterRenderer } from './render/fighterRenderer.js';
import { Effects } from './render/effects.js';
import { bigText, FONT_CN, FONT_EN } from './render/hud.js';
import { ELEMENTS, rgba, clamp } from './render/util.js';
import { Keyboard, P1_KEYS, P2_KEYS, readGamepad } from './keyboard.js';
import { Sfx } from './audio.js';

const canvas = document.getElementById('game');
const audio = new Sfx();
const renderer = new Renderer(canvas, audio);
const kb = new Keyboard();
const params = new URLSearchParams(location.search);
window.addEventListener('resize', () => renderer.resize());
const unlockAudio = () => audio.init();
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);

const MODES = [
  { id: 'cpu', label: '1P  VS  CPU', cn: '单人对战' },
  { id: 'pvp', label: '1P  VS  2P', cn: '双人对战' },
  { id: 'watch', label: 'CPU  VS  CPU', cn: '观战模式' },
  { id: 'training', label: 'TRAINING', cn: '训练模式' },
];

const HELP = [
  ['W / A / S / D', '跳 / 后退(防御) / 蹲 / 前进'],
  ['J  K  L', '拳 / 脚 / 重击'],
  ['→→  ←←', '冲刺 / 后撤步'],
  ['↓↘→ + J/L', '烈焰弹 (飞行道具)'],
  ['→↓↘ + J/L', '升龙拳 (对空无敌)'],
  ['↓↙← + K/L', '旋风脚 (多段)'],
  ['J+K 或 ↓↘→↓↘→+L', '超必杀技 (消耗 1 气)'],
  ['近身 → + L', '投技'],
];

const state = {
  screen: 'title',
  menu: 0,
  level: clamp(parseInt(params.get('level') || '3', 10), 1, 5),
  mode: 'cpu',
  sel: [0, 1],
  locked: [false, false],
  paused: false,
  pauseIdx: 0,
  acc: 0,
  slow: 0,
  dummy: 0,
  t: 0,
};

let game = null;
let controllers = [null, null];
const menuFx = new Effects();
let preview = null;

// ---- controllers ---------------------------------------------------------------
const human = (map, padIndex) => ({ kind: 'human', get: () => kb.read(map, readGamepad(padIndex)) });
const cpu = (level, seed) => {
  const ai = new CpuAI(level, seed);
  return { kind: 'cpu', ai, get: (g, i) => ai.act(g, i) };
};
const dummy = () => ({
  kind: 'dummy',
  get: (g, i) => {
    const me = g.fighters[i];
    if (state.dummy === 1) return { x: -me.facing, y: 0 };
    if (state.dummy === 2) return { x: -me.facing, y: -1 };
    return NEUTRAL;
  },
});

// Policy controller: fn(obs, info) -> action in [0, 72), queried every `skip` frames.
function policyController(fn, skip = 4) {
  let action = NEUTRAL_ACTION;
  let k = 0;
  return {
    kind: 'policy',
    get(g, i) {
      const first = k % skip === 0;
      if (first) {
        const r = fn(g.getObservation(i), { player: i, frame: g.frame, hp: g.fighters.map((f) => f.hp) });
        action = Number.isFinite(r) ? r : NEUTRAL_ACTION;
      }
      k++;
      const raw = decodeAction(action, g.fighters[i].facing, true);
      if (!first) raw.j = raw.k = raw.l = false;
      return raw;
    },
  };
}

// WebSocket agent bridge: sends {type:'obs', ...} and expects {action: n} replies.
function wsController(url, skip = 4) {
  let latest = NEUTRAL_ACTION;
  let ws = null;
  let ready = false;
  try {
    ws = new WebSocket(url);
    ws.onopen = () => {
      ready = true;
      console.log('[FightRL] agent connected', url);
    };
    ws.onmessage = (m) => {
      try {
        const d = JSON.parse(m.data);
        if (Number.isFinite(d.action)) latest = d.action;
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => (ready = false);
  } catch (e) {
    console.warn('[FightRL] websocket failed', e);
  }
  const ctl = policyController((obs, info) => {
    if (ready) ws.send(JSON.stringify({ type: 'obs', obs, ...info }));
    return latest;
  }, skip);
  ctl.kind = 'ws';
  return ctl;
}

// ---- match lifecycle -------------------------------------------------------------
function startMatch(opts = {}) {
  const mode = opts.mode || state.mode;
  state.mode = mode;
  const p1 = opts.p1 || CHARACTER_IDS[state.sel[0]];
  const p2 = opts.p2 || CHARACTER_IDS[state.sel[1]];
  const seed = (Math.random() * 1e9) | 0;
  game = new Game({ p1, p2, seed, training: mode === 'training' });
  const lvl = opts.level || state.level;
  if (mode === 'pvp') controllers = [human(P1_KEYS, 0), human(P2_KEYS, 1)];
  else if (mode === 'watch') controllers = [cpu(Math.min(5, lvl + 1), seed + 1), cpu(lvl, seed + 2)];
  else if (mode === 'training') controllers = [human(P1_KEYS, 0), dummy()];
  else controllers = [human(P1_KEYS, 0), cpu(lvl, seed + 3)];
  const agent = opts.agent || params.get('agent');
  if (agent) {
    const ap = parseInt(params.get('agentPlayer') || '2', 10) - 1;
    controllers[ap] = wsController(agent, parseInt(params.get('skip') || '4', 10));
  }
  renderer.attach(game);
  renderer.debug = params.has('debug') || renderer.debug;
  state.screen = 'fight';
  state.paused = false;
  state.acc = 0;
  state.slow = 0;
}

function onGameEvents(events) {
  for (const e of events) {
    if (e.type === 'roundStart' && !game.opts.skipIntro) {
      const final = game.fighters.every((f) => f.roundsWon === game.opts.roundsToWin - 1) && game.opts.roundsToWin > 1;
      setTimeout(() => audio.say(final ? 'Final round' : `Round ${game.round}`), 150);
    }
    if (e.type === 'fight') audio.say('Fight!');
    if (e.type === 'ko') {
      state.slow = 75;
      audio.say(e.koType === 'double' ? 'Double K O' : 'K O');
    }
    if (e.type === 'timeup') audio.say('Time up');
  }
}

function stepGame() {
  const inputs = controllers.map((c, i) => (c ? c.get(game, i) : NEUTRAL));
  const events = game.step(inputs);
  renderer.onStep(events);
  onGameEvents(events);
}

// ---- screens -------------------------------------------------------------------------
const menuCam = { x: 0, y: 0, zoom: 1 };

function setScreenTransform(ctx) {
  const v = renderer.view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(v.dpr * v.s, 0, 0, v.dpr * v.s, v.dpr * v.ox, v.dpr * v.oy);
}

function drawMenuBackground(ctx, dt) {
  renderer.stage.update(dt);
  menuCam.x = Math.sin(state.t * 0.003) * 300;
  renderer.stage.drawBack(ctx, menuCam);
  renderer.stage.drawFront(ctx, menuCam);
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, 'rgba(6,0,14,0.55)');
  g.addColorStop(1, 'rgba(6,0,14,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawTitle(ctx, dt) {
  drawMenuBackground(ctx, dt);
  for (let i = 0; i < 6; i++) menuFx.flame(VIEW_W / 2 + (Math.random() - 0.5) * 520, 250 + Math.random() * 30, 'fire', { vy: -2 - Math.random() * 3, size: 30 + Math.random() * 50, life: 30 });
  if (Math.random() < 0.15) menuFx.bolt(VIEW_W / 2 + 300 + Math.random() * 100, 80, VIEW_W / 2 + 200 + Math.random() * 200, 280, ELEMENTS.thunder.main, { life: 6 });
  menuFx.update(dt);
  menuFx.draw(ctx);
  const pulse = 1 + Math.sin(state.t * 0.05) * 0.015;
  ctx.save();
  ctx.translate(VIEW_W / 2, 190);
  ctx.scale(pulse, pulse);
  bigText(ctx, '拳 魂', 0, 0, 150, { font: FONT_CN, glow: '#ff5a00', grad: [[0, '#ffffff'], [0.35, '#ffe68a'], [0.6, '#ff8a1e'], [1, '#b0200a']] });
  ctx.restore();
  bigText(ctx, 'FIGHTING  SPIRIT  ·  RL', VIEW_W / 2, 292, 30, { grad: [[0, '#ffffff'], [1, '#c9b6ff']] });

  MODES.forEach((m, i) => {
    const y = 380 + i * 54;
    const sel = state.menu === i;
    if (sel) {
      ctx.save();
      const g = ctx.createLinearGradient(VIEW_W / 2 - 260, 0, VIEW_W / 2 + 260, 0);
      g.addColorStop(0, 'rgba(255,90,0,0)');
      g.addColorStop(0.5, 'rgba(255,110,20,0.55)');
      g.addColorStop(1, 'rgba(255,90,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(VIEW_W / 2 - 260, y - 22, 520, 44);
      ctx.restore();
    }
    bigText(ctx, m.label, VIEW_W / 2 - 40, y, sel ? 34 : 28, sel ? {} : { grad: [[0, '#d8d0e0'], [1, '#8a7a90']] });
    ctx.save();
    ctx.font = `bold ${sel ? 22 : 18}px ${FONT_CN}`;
    ctx.fillStyle = sel ? '#ffe0a0' : '#a090a0';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.cn, VIEW_W / 2 + 140, y + 2);
    ctx.restore();
  });
  const ly = 380 + MODES.length * 54 + 8;
  ctx.save();
  ctx.font = `bold 20px ${FONT_CN}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = state.menu === MODES.length ? '#ffe0a0' : '#b0a0b0';
  ctx.fillText(`CPU 难度  ◀ ${'★'.repeat(state.level)}${'☆'.repeat(5 - state.level)} ▶`, VIEW_W / 2, ly);
  ctx.font = `14px ${FONT_CN}`;
  ctx.fillStyle = 'rgba(230,220,240,0.75)';
  ctx.fillText('W/S 选择 · A/D 调整难度 · J 确认 · M 静音 · F1 判定框', VIEW_W / 2, VIEW_H - 22);
  ctx.restore();
  drawHelp(ctx, 40, 360);
}

function drawHelp(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = 'rgba(10,4,16,0.6)';
  ctx.strokeStyle = 'rgba(255,190,120,0.35)';
  ctx.lineWidth = 1.5;
  ctx.fillRect(x - 12, y - 30, 330, HELP.length * 30 + 42);
  ctx.strokeRect(x - 12, y - 30, 330, HELP.length * 30 + 42);
  ctx.font = `bold 16px ${FONT_CN}`;
  ctx.fillStyle = '#ffcf7a';
  ctx.textBaseline = 'middle';
  ctx.fillText('操作说明', x, y - 10);
  HELP.forEach(([k, v], i) => {
    const yy = y + 20 + i * 30;
    ctx.font = `bold 14px ${FONT_EN}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(k, x, yy);
    ctx.font = `14px ${FONT_CN}`;
    ctx.fillStyle = '#d8c8e0';
    ctx.fillText(v, x + 150, yy);
  });
  ctx.restore();
}

function ensurePreview() {
  const key = `${state.sel[0]}-${state.sel[1]}`;
  if (preview && preview.key === key) return;
  const g = new Game({ p1: CHARACTER_IDS[state.sel[0]], p2: CHARACTER_IDS[state.sel[1]], skipIntro: true });
  preview = { key, game: g, fr: g.fighters.map((f) => new FighterRenderer(f.char, f.palette)) };
}

function drawSelect(ctx, dt) {
  drawMenuBackground(ctx, dt);
  ensurePreview();
  const g = preview.game;
  g.step([NEUTRAL, NEUTRAL]);
  bigText(ctx, 'SELECT  YOUR  FIGHTER', VIEW_W / 2, 60, 46);
  for (let i = 0; i < 2; i++) {
    const f = g.fighters[i];
    const ch = f.char;
    const E = ELEMENTS[ch.element];
    const cx = i === 0 ? 330 : VIEW_W - 330;
    // aura panel
    ctx.save();
    const pg = ctx.createRadialGradient(cx, 420, 20, cx, 420, 300);
    pg.addColorStop(0, rgba(E.main, 0.35));
    pg.addColorStop(1, rgba(E.deep, 0));
    ctx.fillStyle = pg;
    ctx.fillRect(cx - 320, 100, 640, 560);
    ctx.restore();
    if (Math.random() < 0.5) {
      if (ch.element === 'fire') menuFx.flame(cx + (Math.random() - 0.5) * 200, 560, 'fire', { vy: -3 - Math.random() * 3, size: 30 + Math.random() * 30 });
      else if (Math.random() < 0.3) menuFx.bolt(cx + (Math.random() - 0.5) * 260, 120, cx + (Math.random() - 0.5) * 120, 560, E.main, { life: 5 });
    }
    ctx.save();
    ctx.translate(cx, 600);
    ctx.scale(1.35, 1.35);
    const fr = preview.fr[i];
    fr.update(dt);
    fr.draw(ctx, { x: 0, y: 0, facing: i === 0 ? 1 : -1, J: f.J, state: f.state, vx: 0 }, { cloth: true, dt });
    ctx.restore();
    bigText(ctx, ch.name, cx, 128, 60, { grad: [[0, '#ffffff'], [0.5, E.spark], [1, E.main]], glow: E.main });
    ctx.save();
    ctx.font = `bold 24px ${FONT_CN}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${ch.cn} · ${ch.title}`, cx, 180);
    ctx.font = `16px ${FONT_CN}`;
    ctx.fillStyle = '#e0d0e8';
    ctx.fillText(`超必杀：${ch.superName}`, cx, 206);
    const stats = [['速度', ch.walk / 4], ['攻击', ch.dmg], ['冲刺', ch.run / 9]];
    stats.forEach(([n, v], k) => {
      const y = 628 + k * 20;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 14px ${FONT_CN}`;
      ctx.fillText(n, cx - 90, y + 6);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(cx - 80, y - 4, 180, 10);
      ctx.fillStyle = E.main;
      ctx.fillRect(cx - 80, y - 4, 180 * clamp(v, 0, 1), 10);
    });
    ctx.restore();
    const human2 = state.mode === 'pvp';
    const label = i === 0 ? (state.mode === 'watch' ? 'CPU' : '1P') : human2 ? '2P' : 'CPU';
    bigText(ctx, state.locked[i] ? 'READY!' : label, cx, 244, 32, state.locked[i] ? { grad: [[0, '#ffffff'], [1, '#6aff8a']] } : {});
    ctx.save();
    ctx.font = `bold 30px ${FONT_EN}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    if (!state.locked[i]) {
      ctx.fillText('◀', cx - 190, 420);
      ctx.fillText('▶', cx + 190, 420);
    }
    ctx.restore();
  }
  menuFx.update(dt);
  menuFx.draw(ctx);
  ctx.save();
  ctx.font = `15px ${FONT_CN}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(230,220,240,0.8)';
  ctx.fillText(state.mode === 'pvp' ? '1P: A/D 选择 J 确认    2P: ←/→ 选择 1 确认    Esc 返回' : 'A/D 选择 · J 确认 · Esc 返回', VIEW_W / 2, VIEW_H - 18);
  ctx.restore();
}

function drawPause(ctx) {
  ctx.fillStyle = 'rgba(4,0,12,0.7)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  bigText(ctx, 'PAUSE', VIEW_W / 2, 150, 90);
  const items = ['继续游戏', '重新开始', '返回标题'];
  items.forEach((it, i) => {
    const sel = state.pauseIdx === i;
    bigText(ctx, it, VIEW_W / 2, 270 + i * 64, sel ? 40 : 32, { font: FONT_CN, ...(sel ? {} : { grad: [[0, '#d0c8d8'], [1, '#807088']] }) });
  });
  drawHelp(ctx, VIEW_W / 2 - 160, 500);
  if (game.opts.training) {
    ctx.save();
    ctx.font = `16px ${FONT_CN}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe0a0';
    ctx.fillText('训练模式：B 切换木桩行为（站立 / 站防 / 蹲防）', VIEW_W / 2, 470);
    ctx.restore();
  }
}

function drawMatchOver(ctx) {
  const t = game.phaseT;
  if (t < 30) return;
  const a = clamp((t - 30) / 20, 0, 1);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(4,0,12,0.55)';
  ctx.fillRect(0, VIEW_H * 0.3, VIEW_W, VIEW_H * 0.4);
  const w = game.matchWinner;
  const text = w >= 0 ? `${game.fighters[w].char.name}  WINS` : 'DRAW GAME';
  const E = w >= 0 ? ELEMENTS[game.fighters[w].char.element] : ELEMENTS.fire;
  bigText(ctx, text, VIEW_W / 2, VIEW_H * 0.45, 96, { glow: E.main });
  ctx.font = `bold 22px ${FONT_CN}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('J 再战  ·  Esc 返回标题  ·  Enter 重新选人', VIEW_W / 2, VIEW_H * 0.6);
  ctx.restore();
}

function drawTrainingInfo(ctx) {
  if (!game.opts.training) return;
  const names = ['站立', '站防', '蹲防'];
  ctx.save();
  ctx.font = `14px ${FONT_CN}`;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.textAlign = 'center';
  ctx.fillText(`训练模式 · 木桩：${names[state.dummy]} (B 切换) · F1 判定框 · Esc 菜单`, VIEW_W / 2, 120);
  ctx.restore();
}

// ---- input handling per screen ---------------------------------------------------------
function handleKeys() {
  const hits = kb.takeHits();
  for (const code of hits) {
    if (code === 'KeyM') audio.muted = !audio.muted;
    if (code === 'F1') renderer.debug = !renderer.debug;
    if (state.screen === 'title') {
      const n = MODES.length + 1;
      if (code === 'KeyW' || code === 'ArrowUp') {
        state.menu = (state.menu + n - 1) % n;
        audio.ui();
      }
      if (code === 'KeyS' || code === 'ArrowDown') {
        state.menu = (state.menu + 1) % n;
        audio.ui();
      }
      if (code === 'KeyA' || code === 'ArrowLeft' || code === 'KeyD' || code === 'ArrowRight') {
        state.level = clamp(state.level + (code === 'KeyA' || code === 'ArrowLeft' ? -1 : 1), 1, 5);
        audio.ui();
      }
      if ((code === 'KeyJ' || code === 'Enter' || code === 'Space') && state.menu < MODES.length) {
        state.mode = MODES[state.menu].id;
        state.locked = [false, false];
        state.screen = 'select';
        audio.ui(true);
      }
    } else if (state.screen === 'select') {
      const n = CHARACTER_IDS.length;
      const pvp = state.mode === 'pvp';
      if (code === 'Escape') state.screen = 'title';
      if (!state.locked[0]) {
        if (code === 'KeyA') state.sel[0] = (state.sel[0] + n - 1) % n;
        if (code === 'KeyD') state.sel[0] = (state.sel[0] + 1) % n;
        if (code === 'KeyJ' || code === 'Enter') {
          state.locked[0] = true;
          audio.ui(true);
        }
      } else if (!pvp && !state.locked[1]) {
        if (code === 'KeyA') state.sel[1] = (state.sel[1] + n - 1) % n;
        if (code === 'KeyD') state.sel[1] = (state.sel[1] + 1) % n;
        if (code === 'KeyJ' || code === 'Enter') {
          state.locked[1] = true;
          audio.ui(true);
        }
        if (code === 'KeyK') state.locked[0] = false;
      }
      if (pvp && !state.locked[1]) {
        if (code === 'ArrowLeft') state.sel[1] = (state.sel[1] + n - 1) % n;
        if (code === 'ArrowRight') state.sel[1] = (state.sel[1] + 1) % n;
        if (code === 'Digit1' || code === 'Numpad1' || code === 'Comma') {
          state.locked[1] = true;
          audio.ui(true);
        }
      }
      if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(code)) audio.ui();
    } else if (state.screen === 'fight') {
      if (game.phase === 'matchOver' && game.phaseT > 40) {
        if (code === 'KeyJ' || code === 'Space') startMatch();
        if (code === 'Enter') {
          state.locked = [false, false];
          state.screen = 'select';
        }
        if (code === 'Escape') state.screen = 'title';
        continue;
      }
      if (code === 'Escape' || code === 'KeyP') {
        state.paused = !state.paused;
        state.pauseIdx = 0;
        audio.ui();
        continue;
      }
      if (code === 'KeyB' && game.opts.training) state.dummy = (state.dummy + 1) % 3;
      if (state.paused) {
        if (code === 'KeyW' || code === 'ArrowUp') state.pauseIdx = (state.pauseIdx + 2) % 3;
        if (code === 'KeyS' || code === 'ArrowDown') state.pauseIdx = (state.pauseIdx + 1) % 3;
        if (code === 'KeyJ' || code === 'Enter') {
          if (state.pauseIdx === 0) state.paused = false;
          else if (state.pauseIdx === 1) startMatch();
          else state.screen = 'title';
          audio.ui(true);
        }
      }
    }
  }
  if (state.screen === 'select' && state.locked[0] && state.locked[1]) {
    state.locked = [false, false];
    startMatch();
  }
}

// ---- main loop ---------------------------------------------------------------------------
let last = performance.now();
let lastScreen = state.screen;
function frame(now) {
  const dtMs = Math.min(100, now - last);
  last = now;
  const dt = dtMs / (1000 / 60);
  state.t += dt;
  handleKeys();
  if (state.screen !== lastScreen) {
    menuFx.clear();
    lastScreen = state.screen;
  }
  const ctx = renderer.ctx;
  if (state.screen === 'fight') {
    let scale = 1;
    if (state.slow > 0) {
      state.slow -= dt;
      scale = 0.3;
    }
    if (!state.paused) {
      state.acc += dt * scale;
      let n = 0;
      while (state.acc >= 1 && n < 6) {
        stepGame();
        state.acc -= 1;
        n++;
      }
      if (n === 6) state.acc = 0;
    }
    renderer.draw(state.paused ? 0 : dt * scale);
    const v = renderer.view;
    ctx.setTransform(v.dpr * v.s, 0, 0, v.dpr * v.s, v.dpr * v.ox, v.dpr * v.oy);
    drawTrainingInfo(ctx);
    if (game.phase === 'matchOver') drawMatchOver(ctx);
    if (state.paused) drawPause(ctx);
  } else {
    setScreenTransform(ctx);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW_W, VIEW_H);
    ctx.clip();
    if (state.screen === 'title') drawTitle(ctx, dt);
    else drawSelect(ctx, dt);
    ctx.restore();
  }
  requestAnimationFrame(frame);
}

// ---- RL / automation hooks -------------------------------------------------------------
window.FightRL = {
  ACTION_COUNT,
  NEUTRAL_ACTION,
  OBS_SIZE: Game.observationSize,
  MOVES: Game.moveList,
  decodeAction,
  encodeAction,
  get game() {
    return game;
  },
  observe(i = 1) {
    return game ? game.getObservation(i) : null;
  },
  setPolicy(i, fn, skip = 4) {
    controllers[i] = fn ? policyController(fn, skip) : cpu(state.level, 99);
  },
  connect(url, i = 1, skip = 4) {
    controllers[i] = wsController(url, skip);
  },
  startMatch(opts = {}) {
    startMatch(opts);
  },
};

if (params.get('mode')) {
  const id = params.get('mode');
  const p1 = params.get('p1');
  const p2 = params.get('p2');
  if (p1 && CHARACTERS[p1]) state.sel[0] = CHARACTER_IDS.indexOf(p1);
  if (p2 && CHARACTERS[p2]) state.sel[1] = CHARACTER_IDS.indexOf(p2);
  startMatch({ mode: id });
}
requestAnimationFrame(frame);
