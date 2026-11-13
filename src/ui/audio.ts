/**
 * All sounds are synthesised with Web Audio at run time (no audio files, nothing
 * fetched). The AudioContext is only created inside a user gesture, so nothing
 * can autoplay; muted state is honoured before any node is created.
 */
type Sfx = 'place' | 'boom' | 'crate' | 'pickup' | 'out' | 'tick' | 'go' | 'win' | 'draw' | 'click' | 'match';

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;
  volume = 0.7;

  /** Call from a pointerdown/keydown handler. */
  unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch { return; }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.6;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  get state() { return this.ctx ? this.ctx.state : 'none'; }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) { if (m) void this.ctx.suspend().catch(() => {}); else void this.ctx.resume().catch(() => {}); }
  }
  setVolume(v: number) { this.volume = v; if (this.master) this.master.gain.value = v; }
  suspend() { if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && !this.muted) void this.ctx.resume().catch(() => {}); }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, freq: number, gain: number) {
    const c = this.ctx!;
    const t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(120, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master!);
    s.start(t);
    s.stop(t + dur);
  }

  play(s: Sfx) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    switch (s) {
      case 'place': this.tone(320, 0.09, 'triangle', 0.25, 180); break;
      case 'boom': this.burst(0.5, 1800, 0.55); this.tone(90, 0.35, 'sine', 0.35, 40); break;
      case 'crate': this.burst(0.12, 3200, 0.12); break;
      case 'pickup': [660, 880, 1100].forEach((f, i) => this.tone(f, 0.09, 'square', 0.08, undefined, i * 0.06)); break;
      case 'out': this.tone(520, 0.4, 'sawtooth', 0.12, 110); break;
      case 'tick': this.tone(740, 0.07, 'square', 0.08); break;
      case 'go': this.tone(990, 0.18, 'square', 0.1); break;
      case 'win': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.18, undefined, i * 0.1)); break;
      case 'draw': [392, 330].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.15, undefined, i * 0.16)); break;
      case 'match': [523, 659, 784, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.18, undefined, i * 0.12)); break;
      case 'click': this.tone(600, 0.04, 'triangle', 0.08); break;
    }
  }
}
