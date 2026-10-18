/**
 * Sound effects, made in code with the Web Audio API: no sound files, nothing to download,
 * no licences, works offline (and in a future iPad app).
 *
 * Every sound is built from two ingredients: noise (filtered → whoosh, boom, rain, wind,
 * fire) and simple tones (chirps, chimes, ticks). Loud repeated sounds (explosions) are
 * rate-limited so a big battle doesn't get too noisy.
 *
 * iPad Safari only allows sound after the player touches the screen, so the audio engine
 * starts on the first tap. Sounds may be silent when the iPad is muted.
 */
import { readSetting, writeSetting } from '../utils/settings';

type Name =
  | 'launch' | 'boom' | 'bigBoom' | 'chirp' | 'pop' | 'tick' | 'win' | 'peace' | 'sting' | 'fill'
  | 'rumble' | 'wind' | 'rain' | 'wave' | 'fire' | 'whistle' | 'blizzard' | 'sand' | 'heat';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<string, number>();
  enabled = readSetting('soundOn', true);
  volume = readSetting('soundVolume', 0.7);

  constructor() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.start();
      if (this.ctx?.state === 'running') {
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
      }
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    writeSetting('soundOn', v);
    if (v) this.play('tick');
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    writeSetting('soundVolume', this.volume);
    if (this.master) this.master.gain.value = this.volume * 0.8;
  }

  private start() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume * 0.8;
        // A gentle limiter so many explosions at once don't distort.
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 6;
        this.master.connect(comp).connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 2;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null; // no sound available: the game works silently
    }
  }

  /** Play a sound effect (does nothing if sound is off or not available). */
  play(name: Name, strength = 1) {
    if (!this.enabled || this.volume <= 0) return;
    this.start();
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const gap: Partial<Record<Name, number>> = { boom: 70, launch: 90, chirp: 120, pop: 80, tick: 30 };
    const now = performance.now();
    if ((now - (this.last.get(name) ?? -1e9)) < (gap[name] ?? 0)) return;
    this.last.set(name, now);
    try {
      this.make(ctx, name, ctx.currentTime, strength);
    } catch {
      /* ignore: a sound effect must never break the game */
    }
  }

  // ------------------------------------------------------------ building blocks

  private env(ctx: AudioContext, t: number, peak: number, attack: number, hold: number, release: number) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.setValueAtTime(Math.max(0.0002, peak), t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    g.connect(this.master!);
    return g;
  }

  /** Filtered noise. `f0 → f1` sweeps the filter frequency. */
  private noiseHit(
    ctx: AudioContext, t: number, o: { type: BiquadFilterType; f0: number; f1?: number; q?: number; peak: number; attack: number; hold?: number; release: number },
  ) {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type;
    f.Q.value = o.q ?? 0.8;
    f.frequency.setValueAtTime(o.f0, t);
    const dur = o.attack + (o.hold ?? 0) + o.release;
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    const g = this.env(ctx, t, o.peak, o.attack, o.hold ?? 0, o.release);
    src.connect(f).connect(g);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private tone(ctx: AudioContext, t: number, o: { type: OscillatorType; f0: number; f1?: number; peak: number; attack: number; hold?: number; release: number }) {
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.f0, t);
    const dur = o.attack + (o.hold ?? 0) + o.release;
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    osc.connect(this.env(ctx, t, o.peak, o.attack, o.hold ?? 0, o.release));
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private make(ctx: AudioContext, name: Name, t: number, k: number) {
    switch (name) {
      case 'launch':
        this.noiseHit(ctx, t, { type: 'bandpass', f0: 700, f1: 2600, q: 2, peak: 0.12, attack: 0.03, release: 0.35 });
        break;
      case 'boom':
        this.noiseHit(ctx, t, { type: 'lowpass', f0: 1400 * Math.min(1.5, k), f1: 120, peak: 0.45 * Math.min(1.4, k), attack: 0.005, release: 0.55 });
        this.tone(ctx, t, { type: 'sine', f0: 110, f1: 40, peak: 0.4 * Math.min(1.4, k), attack: 0.005, release: 0.35 });
        break;
      case 'bigBoom':
        this.noiseHit(ctx, t, { type: 'lowpass', f0: 2200, f1: 80, peak: 0.8, attack: 0.005, hold: 0.1, release: 1.6 });
        this.tone(ctx, t, { type: 'sine', f0: 90, f1: 30, peak: 0.7, attack: 0.005, hold: 0.1, release: 1.1 });
        break;
      case 'chirp':
        for (let i = 0; i < 3; i++) {
          const s = t + i * 0.11 + Math.random() * 0.03;
          const f = 2300 + Math.random() * 600;
          this.tone(ctx, s, { type: 'sine', f0: f, f1: f * 1.35, peak: 0.08, attack: 0.01, release: 0.08 });
        }
        break;
      case 'pop':
        this.noiseHit(ctx, t, { type: 'highpass', f0: 1500, peak: 0.25, attack: 0.002, release: 0.12 });
        for (let i = 0; i < 6; i++) {
          this.noiseHit(ctx, t + 0.15 + Math.random() * 0.6, { type: 'highpass', f0: 3000, peak: 0.06, attack: 0.002, release: 0.04 });
        }
        break;
      case 'tick':
        this.tone(ctx, t, { type: 'square', f0: 1800, peak: 0.05, attack: 0.001, release: 0.03 });
        break;
      case 'fill':
        this.noiseHit(ctx, t, { type: 'bandpass', f0: 400, f1: 1600, q: 1.5, peak: 0.2, attack: 0.02, release: 0.3 });
        this.tone(ctx, t, { type: 'sine', f0: 440, f1: 880, peak: 0.1, attack: 0.01, release: 0.25 });
        break;
      case 'win': // ta-da: three rising notes
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          this.tone(ctx, t + i * 0.11, { type: 'triangle', f0: f, peak: 0.16, attack: 0.01, hold: i === 3 ? 0.2 : 0.04, release: 0.3 }),
        );
        break;
      case 'peace': // soft chime
        [659.25, 987.77, 1318.5].forEach((f, i) => this.tone(ctx, t + i * 0.18, { type: 'sine', f0: f, peak: 0.12, attack: 0.02, release: 0.9 }));
        break;
      case 'sting': // uh-oh: falling notes for disasters
        [392, 329.63, 261.63].forEach((f, i) => this.tone(ctx, t + i * 0.16, { type: 'triangle', f0: f, peak: 0.13, attack: 0.01, hold: 0.05, release: 0.3 }));
        break;
      case 'rumble':
        this.noiseHit(ctx, t, { type: 'lowpass', f0: 180, f1: 90, q: 1, peak: 0.6, attack: 0.15, hold: 1.2, release: 0.8 });
        this.tone(ctx, t, { type: 'sine', f0: 45, f1: 32, peak: 0.35, attack: 0.15, hold: 1.2, release: 0.6 });
        break;
      case 'wind':
        this.noiseHit(ctx, t, { type: 'bandpass', f0: 300, f1: 1100, q: 3, peak: 0.3, attack: 0.6, hold: 1.6, release: 1.0 });
        this.noiseHit(ctx, t + 0.4, { type: 'bandpass', f0: 900, f1: 400, q: 4, peak: 0.15, attack: 0.5, hold: 1.2, release: 0.8 });
        break;
      case 'blizzard':
        this.noiseHit(ctx, t, { type: 'bandpass', f0: 1200, f1: 2200, q: 2, peak: 0.22, attack: 0.5, hold: 2, release: 0.8 });
        break;
      case 'sand':
        this.noiseHit(ctx, t, { type: 'bandpass', f0: 600, f1: 1400, q: 1, peak: 0.25, attack: 0.5, hold: 2, release: 0.8 });
        break;
      case 'rain':
        this.noiseHit(ctx, t, { type: 'highpass', f0: 2500, peak: 0.18, attack: 0.4, hold: 2.2, release: 0.8 });
        this.noiseHit(ctx, t, { type: 'lowpass', f0: 500, peak: 0.12, attack: 0.6, hold: 1.8, release: 0.8 });
        break;
      case 'wave':
        this.noiseHit(ctx, t, { type: 'lowpass', f0: 300, f1: 1800, q: 1, peak: 0.55, attack: 0.9, hold: 0.2, release: 1.3 });
        break;
      case 'fire':
        this.noiseHit(ctx, t, { type: 'lowpass', f0: 700, peak: 0.2, attack: 0.3, hold: 2.4, release: 0.6 });
        for (let i = 0; i < 26; i++) {
          this.noiseHit(ctx, t + Math.random() * 3, { type: 'highpass', f0: 2000 + Math.random() * 3000, peak: 0.05 + Math.random() * 0.06, attack: 0.001, release: 0.02 });
        }
        break;
      case 'heat':
        this.tone(ctx, t, { type: 'sine', f0: 220, f1: 200, peak: 0.06, attack: 0.8, hold: 1.6, release: 1 });
        this.noiseHit(ctx, t, { type: 'bandpass', f0: 500, q: 0.7, peak: 0.12, attack: 0.8, hold: 1.6, release: 1 });
        break;
      case 'whistle':
        this.tone(ctx, t, { type: 'sine', f0: 1900, f1: 250, peak: 0.12, attack: 0.05, release: 0.9 });
        this.noiseHit(ctx, t, { type: 'bandpass', f0: 3000, f1: 400, q: 2, peak: 0.15, attack: 0.1, release: 0.85 });
        break;
    }
  }
}

export const sound = new SoundEngine();

/** The background sound for each disaster (plays when it starts). */
export const DISASTER_SOUND: Record<string, Name[]> = {
  earthquake: ['rumble'],
  volcano: ['rumble', 'bigBoom'],
  tsunami: ['wave'],
  hurricane: ['wind', 'rain'],
  tornado: ['wind'],
  flood: ['rain'],
  wildfire: ['fire'],
  drought: ['heat'],
  blizzard: ['blizzard'],
  sandstorm: ['sand'],
  meteor: ['whistle'],
};
