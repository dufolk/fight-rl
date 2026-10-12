// All sound effects are synthesized at runtime with WebAudio (no samples).
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.voice = true;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(comp).connect(ctx.destination);
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  get ok() {
    return this.ctx && !this.muted;
  }

  env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  noise(dur, { type = 'bandpass', f0 = 1200, f1 = f0, q = 1, gain = 0.5, attack = 0.004 } = {}) {
    if (!this.ok) return;
    const c = this.ctx;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = c.createBiquadFilter();
    flt.type = type;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    this.env(g, t, attack, gain, dur);
    src.connect(flt).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  tone(dur, { type = 'sine', f0 = 200, f1 = f0, gain = 0.5, attack = 0.003, delay = 0 } = {}) {
    if (!this.ok) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    this.env(g, t, attack, gain, dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  hit(kind = 'light', ko = false) {
    const big = kind === 'heavy' || kind === 'special' || kind === 'super';
    this.tone(big ? 0.22 : 0.12, { f0: big ? 150 : 220, f1: 45, gain: big ? 0.9 : 0.6 });
    this.noise(big ? 0.18 : 0.09, { f0: big ? 2200 : 3200, f1: 600, q: 0.8, gain: big ? 0.7 : 0.5 });
    if (big) this.noise(0.08, { type: 'highpass', f0: 5000, gain: 0.35 });
    if (ko) {
      this.tone(1.1, { f0: 90, f1: 28, gain: 1 });
      this.noise(0.9, { type: 'lowpass', f0: 1800, f1: 120, gain: 0.8 });
    }
  }

  block() {
    this.noise(0.06, { type: 'highpass', f0: 3500, gain: 0.45 });
    this.tone(0.07, { type: 'square', f0: 1300, f1: 700, gain: 0.12 });
  }

  whoosh(heavy) {
    this.noise(heavy ? 0.22 : 0.12, { f0: 500, f1: heavy ? 2600 : 1800, q: 1.4, gain: heavy ? 0.28 : 0.16, attack: 0.02 });
  }

  element(el) {
    if (el === 'fire') this.noise(0.45, { type: 'lowpass', f0: 1400, f1: 200, gain: 0.5, attack: 0.01 });
    else {
      this.noise(0.25, { type: 'highpass', f0: 2500, f1: 6000, gain: 0.3 });
      this.tone(0.3, { type: 'sawtooth', f0: 900, f1: 80, gain: 0.15 });
    }
  }

  projectile(el, big) {
    this.element(el);
    this.tone(big ? 0.8 : 0.35, { type: 'sawtooth', f0: big ? 120 : 260, f1: big ? 50 : 90, gain: big ? 0.4 : 0.18 });
    if (big) this.noise(0.9, { type: 'lowpass', f0: 2500, f1: 100, gain: 0.7 });
  }

  superStart(el) {
    this.tone(0.6, { type: 'sawtooth', f0: 160, f1: 1400, gain: 0.25 });
    this.tone(0.6, { type: 'square', f0: 80, f1: 700, gain: 0.12 });
    this.noise(0.7, { f0: 300, f1: 5000, gain: 0.35, attack: 0.05 });
    this.element(el);
  }

  ko() {
    this.tone(1.4, { f0: 70, f1: 25, gain: 1 });
  }

  land(heavy = false) {
    this.tone(heavy ? 0.18 : 0.06, { f0: heavy ? 120 : 160, f1: 40, gain: heavy ? 0.6 : 0.2 });
    if (heavy) this.noise(0.15, { type: 'lowpass', f0: 900, f1: 100, gain: 0.4 });
  }

  ui(confirm = false) {
    this.tone(confirm ? 0.18 : 0.06, { type: 'square', f0: confirm ? 660 : 880, f1: confirm ? 1320 : 880, gain: 0.08 });
  }

  say(text) {
    if (this.muted || !this.voice || typeof speechSynthesis === 'undefined') return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.95;
      u.pitch = 0.55;
      u.volume = 0.9;
      speechSynthesis.speak(u);
    } catch {
      /* speech unavailable */
    }
  }
}
