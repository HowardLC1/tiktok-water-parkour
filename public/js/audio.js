/**
 * Procedural sound effects via Web Audio — no external assets.
 * Every `sfx` name from gifts.config.json maps to a small synth recipe below.
 */
class Synth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.6;
    this.enabled = true;
    this.noiseBuf = null;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 6;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  get ready() { return this.enabled && this.ctx && this.ctx.state === 'running'; }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  // ── primitives ──────────────────────────────────────────
  tone({ type = 'sine', freq = 440, freqEnd = null, dur = 0.2, gain = 0.3, attack = 0.005, release = 0.08, delay = 0, detune = 0, slideCurve = 'exp' }) {
    if (!this.ready) return;
    const c = this.ctx, t0 = c.currentTime + delay;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0); o.detune.value = detune;
    if (freqEnd) {
      if (slideCurve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
      else o.frequency.linearRampToValueAtTime(freqEnd, t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.setValueAtTime(gain, t0 + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  noise({ dur = 0.3, gain = 0.3, filter = 'lowpass', freq = 1000, freqEnd = null, q = 1, attack = 0.005, release = 0.1, delay = 0 }) {
    if (!this.ready) return;
    const c = this.ctx, t0 = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = filter; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.setValueAtTime(gain, t0 + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t0); s.stop(t0 + dur + 0.02);
  }

  vibrato({ type = 'sawtooth', freq = 110, dur = 1.5, gain = 0.25, rate = 5, depth = 8, delay = 0 }) {
    if (!this.ready) return;
    const c = this.ctx, t0 = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const lfo = c.createOscillator(); lfo.frequency.value = rate;
    const lg = c.createGain(); lg.gain.value = depth;
    lfo.connect(lg).connect(o.frequency);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.15);
    g.gain.setValueAtTime(gain, t0 + dur - 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(f).connect(g).connect(this.master);
    o.start(t0); lfo.start(t0); o.stop(t0 + dur + 0.05); lfo.stop(t0 + dur + 0.05);
  }

  // ── catalogue ──────────────────────────────────────────
  sfx(name) {
    if (!this.ready) return;
    const r = this.recipes[name] || this.recipes.generic;
    try { r.call(this); } catch (e) { console.warn('sfx error', name, e); }
  }
}

Synth.prototype.recipes = {
  generic() { this.tone({ freq: 500, freqEnd: 300, dur: 0.15, gain: 0.2 }); },
  jump() { this.tone({ type: 'square', freq: 320, freqEnd: 640, dur: 0.12, gain: 0.08 }); },
  land() { this.noise({ dur: 0.06, gain: 0.08, freq: 500 }); },
  hit() { this.noise({ dur: 0.15, gain: 0.3, freq: 900, freqEnd: 200 }); this.tone({ type: 'triangle', freq: 180, freqEnd: 60, dur: 0.2, gain: 0.3 }); },
  splash() { this.noise({ dur: 0.5, gain: 0.35, filter: 'bandpass', freq: 1200, freqEnd: 300, q: 0.7 }); this.tone({ freq: 300, freqEnd: 80, dur: 0.4, gain: 0.2 }); },
  death() { this.tone({ type: 'sawtooth', freq: 400, freqEnd: 60, dur: 0.9, gain: 0.25 }); this.noise({ dur: 0.8, gain: 0.3, freq: 1500, freqEnd: 150 }); },
  warn() { this.tone({ type: 'square', freq: 880, dur: 0.08, gain: 0.08 }); this.tone({ type: 'square', freq: 880, dur: 0.08, gain: 0.08, delay: 0.12 }); },
  tick() { this.tone({ type: 'square', freq: 1200, dur: 0.03, gain: 0.05 }); },

  water_drop() { this.tone({ freq: 900, freqEnd: 300, dur: 0.18, gain: 0.25 }); this.noise({ dur: 0.12, gain: 0.1, filter: 'bandpass', freq: 2000, q: 2, delay: 0.05 }); },
  coin_up() { this.tone({ type: 'square', freq: 988, dur: 0.09, gain: 0.12 }); this.tone({ type: 'square', freq: 1319, dur: 0.25, gain: 0.12, delay: 0.09 }); },
  freeze_light() { for (let i = 0; i < 5; i++) this.tone({ freq: 1500 + i * 350, dur: 0.25, gain: 0.08, delay: i * 0.06 }); this.noise({ dur: 0.5, gain: 0.08, filter: 'highpass', freq: 4000 }); },
  punch_hit() { this.noise({ dur: 0.18, gain: 0.5, freq: 1200, freqEnd: 150 }); this.tone({ type: 'triangle', freq: 150, freqEnd: 40, dur: 0.28, gain: 0.5 }); },
  ice_freeze() { for (let i = 0; i < 7; i++) this.tone({ freq: 2200 - i * 220, dur: 0.3, gain: 0.07, delay: i * 0.07 }); this.noise({ dur: 1.2, gain: 0.12, filter: 'highpass', freq: 3000, freqEnd: 6000 }); this.tone({ type: 'triangle', freq: 200, freqEnd: 90, dur: 1.0, gain: 0.15 }); },
  whistle_fall() { this.tone({ freq: 2200, freqEnd: 300, dur: 0.9, gain: 0.12 }); },
  siren_alarm() { for (let i = 0; i < 4; i++) { this.tone({ type: 'sawtooth', freq: 600, freqEnd: 900, dur: 0.3, gain: 0.12, delay: i * 0.6, slideCurve: 'lin' }); this.tone({ type: 'sawtooth', freq: 900, freqEnd: 600, dur: 0.3, gain: 0.12, delay: i * 0.6 + 0.3, slideCurve: 'lin' }); } },
  rocket_boost() { this.noise({ dur: 1.6, gain: 0.35, freq: 300, freqEnd: 2500, q: 0.5 }); this.tone({ type: 'sawtooth', freq: 80, freqEnd: 420, dur: 1.4, gain: 0.12 }); },
  rumble_heavy() { this.noise({ dur: 2.5, gain: 0.5, freq: 120, freqEnd: 60, q: 2 }); this.tone({ type: 'triangle', freq: 45, dur: 2.4, gain: 0.4 }); },
  cash_register() { for (let i = 0; i < 3; i++) this.noise({ dur: 0.04, gain: 0.2, filter: 'highpass', freq: 3000, delay: i * 0.07 }); this.tone({ type: 'triangle', freq: 2093, dur: 0.6, gain: 0.15, delay: 0.25 }); this.tone({ type: 'triangle', freq: 2637, dur: 0.6, gain: 0.1, delay: 0.3 }); },
  fanfare_victory() { const n = [523, 659, 784, 1047]; n.forEach((f, i) => this.tone({ type: 'square', freq: f, dur: i === 3 ? 0.7 : 0.16, gain: 0.12, delay: i * 0.15 })); n.forEach((f, i) => this.tone({ type: 'triangle', freq: f / 2, dur: i === 3 ? 0.7 : 0.16, gain: 0.1, delay: i * 0.15 })); },
  tsunami_roar() { this.noise({ dur: 2.2, gain: 0.6, freq: 150, freqEnd: 1800, q: 0.8, attack: 0.3 }); this.tone({ type: 'sawtooth', freq: 50, freqEnd: 30, dur: 2.0, gain: 0.3 }); },
  whale_horn() { this.vibrato({ freq: 70, dur: 2.2, gain: 0.35, rate: 4, depth: 6 }); this.vibrato({ type: 'sine', freq: 140, dur: 2.2, gain: 0.15, rate: 5, depth: 10, delay: 0.1 }); this.noise({ dur: 2.5, gain: 0.2, freq: 400, freqEnd: 120 }); },
  explosion_epic() { this.noise({ dur: 1.4, gain: 0.7, freq: 3000, freqEnd: 80 }); this.tone({ type: 'triangle', freq: 90, freqEnd: 25, dur: 1.2, gain: 0.6 }); this.tone({ type: 'square', freq: 1760, dur: 0.1, gain: 0.1, delay: 0.05 }); },
};

export const audio = new Synth();
