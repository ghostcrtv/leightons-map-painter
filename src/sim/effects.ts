/**
 * Simulation effects: missiles, explosions, smoke, doves, fireworks and natural disasters,
 * drawn on a see-through canvas on top of the map.
 *
 * Everything is anchored to WORLD points (so effects stay on the right country while the
 * map moves) plus a small offset in screen pixels (so a puff of smoke is the same size on
 * screen at any zoom). Only simple shapes and soft "sprites" (pre-drawn blurry dots) are
 * used, because they are fast on an iPad. No canvas `filter` (unsupported in older Safari).
 *
 * The loop only runs while something is on screen, and slows to ~30 fps when the only
 * thing left is the smoke rising from weakened countries.
 */
import type { Rand } from './random';
import { cryptoRand } from './random';

export type W = [number, number];

export interface FxHost {
  toScreen(x: number, y: number): [number, number];
  toWorld(sx: number, sy: number): [number, number];
  /** 1 = whole world, 2 = zoomed in 2×… */
  zoom(): number;
  /** Move the map a little (earthquakes). (0, 0) puts it back. */
  shake(dx: number, dy: number): void;
}

type Kind = 'puff' | 'glow' | 'dot' | 'confetti' | 'dove' | 'streak' | 'flake';

interface P {
  wx: number;
  wy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ay: number;
  drag: number;
  age: number;
  life: number;
  size: number;
  size1: number;
  color: string;
  alpha: number;
  kind: Kind;
  rot: number;
  vr: number;
  /** Fade in over this part of the life (0–1). */
  fadeIn: number;
  delay: number;
}

export interface Scene {
  /** Return false when finished. dt in seconds. */
  update(dt: number, fx: Effects): boolean;
  draw?(ctx: CanvasRenderingContext2D, fx: Effects): void;
}

const MAX_PARTICLES = 1400;

export class Effects {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  width = 0;
  height = 0;
  private particles: P[] = [];
  private scenes: Scene[] = [];
  private smolder: { x: number; y: number; amount: number; acc: number }[] = [];
  private sprites = new Map<string, HTMLCanvasElement>();
  private raf = 0;
  private last = 0;
  private lastDraw = 0;
  private shakeAmount = 0;
  private shaken = false;
  readonly rand: Rand = cryptoRand;

  constructor(
    private canvas: HTMLCanvasElement,
    readonly host: FxHost,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, Math.round(r.width));
    this.height = Math.max(1, Math.round(r.height));
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.kick();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.host.shake(0, 0);
  }

  /** True while a battle or disaster is playing. */
  get busy() {
    return this.scenes.length > 0;
  }

  add(scene: Scene) {
    this.scenes.push(scene);
    this.kick();
  }

  /** Weakened countries: smoke keeps rising from these points (amount 0–1). */
  setSmolder(points: { x: number; y: number; amount: number }[]) {
    this.smolder = points.map((p) => ({ ...p, acc: this.rand() }));
    this.kick();
  }

  /** Shake the map this frame (call every frame while it should shake). */
  shake(px: number) {
    this.shakeAmount = Math.max(this.shakeAmount, px);
  }

  // ------------------------------------------------------------ helpers for scenes

  screen(w: W): [number, number] {
    return this.host.toScreen(w[0], w[1]);
  }

  /** A world point `dx, dy` screen pixels away from `w`. */
  offset(w: W, dx: number, dy: number): W {
    const [sx, sy] = this.screen(w);
    return this.host.toWorld(sx + dx, sy + dy);
  }

  between(a: number, b: number) {
    return a + (b - a) * this.rand();
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.min(list.length - 1, Math.floor(this.rand() * list.length))];
  }

  /** Add a particle at world point `w` (plus a pixel offset). */
  spawn(w: W, o: Partial<P> & { kind: Kind; life: number; size: number; color: string }) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({
      wx: w[0],
      wy: w[1],
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      ay: 0,
      drag: 0,
      age: 0,
      size1: o.size,
      alpha: 1,
      rot: 0,
      vr: 0,
      fadeIn: 0.12,
      delay: 0,
      ...o,
    });
    this.kick();
  }

  puff(w: W, color: string, size: number, size1: number, life: number, o: Partial<P> = {}) {
    this.spawn(w, { kind: 'puff', color, size, size1, life, ...o });
  }

  /** A fiery explosion. `k` scales its size. */
  explosion(w: W, k = 1) {
    const r = this.rand;
    this.spawn(w, { kind: 'glow', color: '#fff3b0', size: 8 * k, size1: 70 * k, life: 0.35, alpha: 0.95, fadeIn: 0.05 });
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2;
      const s = this.between(20, 70) * k;
      this.spawn(w, {
        kind: 'glow', color: this.pick(['#ff9800', '#ff5722', '#ffc107']),
        size: 10 * k, size1: this.between(22, 36) * k, life: this.between(0.35, 0.6),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 2, fadeIn: 0.05,
      });
    }
    for (let i = 0; i < 12; i++) {
      const a = r() * Math.PI * 2;
      const s = this.between(110, 260) * k;
      this.spawn(w, {
        kind: 'dot', color: this.pick(['#ffe082', '#ffca28', '#ff7043']),
        size: this.between(1.8, 3) * k, size1: 0.5, life: this.between(0.35, 0.65),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60 * k, ay: 320, drag: 1.5, fadeIn: 0,
      });
    }
    for (let i = 0; i < 4; i++) {
      this.puff(w, this.pick(['#3d3d3d', '#4a4a4a', '#575757']), 10 * k, this.between(34, 52) * k, this.between(1.4, 2.2), {
        x: this.between(-10, 10) * k, y: this.between(-8, 4) * k,
        vx: this.between(-14, 14), vy: this.between(-30, -12), alpha: 0.75, delay: 0.08, fadeIn: 0.2,
      });
    }
    this.add(new Ring(w, 4 * k, 46 * k, 0.4, 'rgba(255,255,255,0.85)', 3));
  }

  /** Firework burst in the given colours. */
  firework(w: W, colors: string[], k = 1) {
    this.spawn(w, { kind: 'glow', color: '#ffffff', size: 6, size1: 50 * k, life: 0.3, fadeIn: 0 });
    const n = 46;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rand() * 0.1;
      const s = this.between(120, 210) * k;
      this.spawn(w, {
        kind: 'glow', color: this.pick(colors), size: 7 * k, size1: 2, life: this.between(0.9, 1.3),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, ay: 90, drag: 1.6, fadeIn: 0,
      });
    }
  }

  confetti(w: W, colors: string[], n = 34) {
    for (let i = 0; i < n; i++) {
      this.spawn(w, {
        kind: 'confetti', color: this.pick(colors), size: this.between(4, 7), life: this.between(1.3, 1.9),
        vx: this.between(-170, 170), vy: this.between(-360, -170), ay: 430, drag: 1.2,
        rot: this.rand() * 6, vr: this.between(-12, 12), fadeIn: 0,
      });
    }
  }

  doves(w: W, n = 8) {
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      this.spawn(w, {
        kind: 'dove', color: '#ffffff', size: this.between(1.5, 2.2), life: this.between(2.4, 3.0),
        x: this.between(-30, 30), y: this.between(-10, 10),
        vx: dir * this.between(30, 90), vy: this.between(-110, -60), rot: this.rand() * 6,
        fadeIn: 0.1, delay: i * 0.09,
      });
    }
    for (let i = 0; i < 18; i++) {
      const a = this.rand() * Math.PI * 2;
      this.spawn(w, {
        kind: 'glow', color: '#ffffff', size: 5, size1: 1, life: this.between(0.6, 1.1),
        vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, drag: 1.5, fadeIn: 0,
      });
    }
    this.add(new Ring(w, 6, 90, 0.8, 'rgba(255,255,255,0.7)', 2.5));
  }

  // ------------------------------------------------------------ the loop

  private kick() {
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private frame = (now: number) => {
    this.raf = 0;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const onlySmoke = this.scenes.length === 0 && this.particles.every((p) => p.kind === 'puff' || p.kind === 'glow');
    if (onlySmoke && this.particles.length === 0 && this.smolder.length === 0) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (this.shaken) {
        this.host.shake(0, 0);
        this.shaken = false;
      }
      return; // nothing to do: stop until something is added
    }
    this.raf = requestAnimationFrame(this.frame);
    // Only smoke from weakened countries: 30 fps is plenty (saves battery).
    const stepDt = onlySmoke ? (now - this.lastDraw) / 1000 : dt;
    if (onlySmoke && now - this.lastDraw < 32) return;
    this.lastDraw = now;
    this.step(Math.min(0.1, stepDt));
    this.draw();
  };

  private step(dt: number) {
    this.shakeAmount = 0;
    // Scenes may start new scenes while updating (a missile's explosion ring…): keep those too.
    const running = this.scenes;
    this.scenes = [];
    const kept = running.filter((sc) => sc.update(dt, this));
    this.scenes = kept.concat(this.scenes);
    if (this.shakeAmount > 0.3) {
      const a = this.shakeAmount;
      this.host.shake((this.rand() - 0.5) * 2 * a, (this.rand() - 0.5) * 2 * a);
      this.shaken = true;
    } else if (this.shaken) {
      this.host.shake(0, 0);
      this.shaken = false;
    }
    this.emitSmolder(dt);
    const ps = this.particles;
    for (const p of ps) {
      if (p.delay > 0) {
        p.delay -= dt;
        continue;
      }
      p.age += dt;
      const f = Math.exp(-p.drag * dt);
      p.vx *= f;
      p.vy = p.vy * f + p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.particles = ps.filter((p) => p.age < p.life);
  }

  private emitSmolder(dt: number) {
    if (!this.smolder.length) return;
    const z = this.host.zoom();
    const k = Math.max(0.6, Math.min(1.7, 0.65 + Math.log2(Math.max(1, z)) * 0.22));
    for (const s of this.smolder) {
      const [sx, sy] = this.host.toScreen(s.x, s.y);
      if (sx < -40 || sy < -60 || sx > this.width + 40 || sy > this.height + 20) continue;
      s.acc += dt * (1.8 + s.amount * 8);
      while (s.acc >= 1) {
        s.acc -= 1;
        const w: W = [s.x, s.y];
        this.puff(w, this.pick(['#3f3f3f', '#545454', '#2f2f2f']), 5 * k, this.between(22, 36) * k, this.between(2.6, 3.6), {
          x: this.between(-5, 5) * k, vx: this.between(5, 16), vy: this.between(-20, -12) * k, alpha: 0.65 + s.amount * 0.35, fadeIn: 0.2,
        });
        if (this.rand() < 0.45) {
          this.spawn(w, {
            kind: 'glow', color: this.pick(['#ff6d00', '#ff9100', '#ffab40']), size: 3.5 * k, size1: 1, life: this.between(0.5, 0.9),
            x: this.between(-5, 5) * k, vy: this.between(-14, -6), alpha: 0.85, fadeIn: 0.2,
          });
        }
      }
    }
  }

  private draw() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const s of this.scenes) if (s.draw && (s as { behind?: boolean }).behind) s.draw(ctx, this);
    for (const p of this.particles) {
      if (p.delay > 0) continue;
      const [ax, ay] = this.host.toScreen(p.wx, p.wy);
      const x = ax + p.x;
      const y = ay + p.y;
      const t = p.age / p.life;
      const size = p.size + (p.size1 - p.size) * t;
      const fade = t < p.fadeIn ? t / p.fadeIn : 1 - (t - p.fadeIn) / (1 - p.fadeIn);
      const alpha = Math.max(0, Math.min(1, p.alpha * fade));
      if (alpha <= 0.01 || x < -120 || y < -120 || x > this.width + 120 || y > this.height + 120) continue;
      ctx.globalAlpha = alpha;
      switch (p.kind) {
        case 'puff':
          ctx.drawImage(this.sprite(p.color), x - size, y - size, size * 2, size * 2);
          break;
        case 'glow':
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(this.sprite(p.color), x - size, y - size, size * 2, size * 2);
          ctx.globalCompositeOperation = 'source-over';
          break;
        case 'dot':
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(0.3, size), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'flake':
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(x + Math.sin(p.age * 4 + p.rot) * 6, y, size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'streak': {
          const len = size;
          const sp = Math.hypot(p.vx, p.vy) || 1;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - (p.vx / sp) * len, y - (p.vy / sp) * len);
          ctx.stroke();
          break;
        }
        case 'confetti':
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.rot);
          ctx.scale(1, Math.cos(p.rot * 1.7));
          ctx.fillStyle = p.color;
          ctx.fillRect(-size / 2, -size / 4, size, size / 2);
          ctx.restore();
          break;
        case 'dove':
          drawDove(ctx, x, y, size, p.age * 15 + p.rot, p.vx < 0);
          break;
      }
    }
    ctx.globalAlpha = 1;
    for (const s of this.scenes) if (s.draw && !(s as { behind?: boolean }).behind) s.draw(ctx, this);
  }

  /** A soft round blob of colour (cached). */
  sprite(color: string): HTMLCanvasElement {
    let c = this.sprites.get(color);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, color);
      grad.addColorStop(0.45, withAlpha(color, 0.65));
      grad.addColorStop(1, withAlpha(color, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      this.sprites.set(color, c);
    }
    return c;
  }
}

function withAlpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawDove(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, phase: number, flip: boolean) {
  const flap = Math.sin(phase);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -s : s, s);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(40,60,90,0.55)';
  ctx.lineWidth = 0.8;
  // far wing
  ctx.beginPath();
  ctx.moveTo(-1, -1);
  ctx.quadraticCurveTo(-2, -6 - flap * 5, 4, -10 * flap - 1);
  ctx.quadraticCurveTo(3, -3, 3, -1);
  ctx.closePath();
  ctx.fillStyle = '#e6eef7';
  ctx.fill();
  ctx.stroke();
  // body + tail
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 3.2, 0, 0, Math.PI * 2);
  ctx.moveTo(-6, 0);
  ctx.lineTo(-11, -3);
  ctx.lineTo(-11, 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // head + beak
  ctx.beginPath();
  ctx.arc(6.5, -1.8, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffa726';
  ctx.beginPath();
  ctx.moveTo(8.8, -2.2);
  ctx.lineTo(11.2, -1.4);
  ctx.lineTo(8.8, -0.8);
  ctx.fill();
  // near wing
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(-2, -0.5);
  ctx.quadraticCurveTo(-4, -7 - flap * 6, 2, -12 * flap - 2);
  ctx.quadraticCurveTo(4, -4, 3, -0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ================================================================ scenes

/** Expanding ring (shock waves, ripples). */
export class Ring implements Scene {
  private t = 0;
  constructor(
    private w: W,
    private r0: number,
    private r1: number,
    private life: number,
    private color: string,
    private width: number,
    private delay = 0,
  ) {}
  update(dt: number) {
    this.t += dt;
    return this.t < this.life + this.delay;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const t = (this.t - this.delay) / this.life;
    if (t < 0) return;
    const [x, y] = fx.screen(this.w);
    const e = 1 - (1 - t) ** 2;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.width;
    ctx.beginPath();
    ctx.arc(x, y, this.r0 + (this.r1 - this.r0) * e, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** Things that happen at set times, plus things that repeat for a while. */
export class Timeline implements Scene {
  private t = 0;
  private events: { at: number; fn: () => void; done: boolean }[] = [];
  private spawners: { from: number; to: number; every: number; acc: number; fn: (t: number) => void }[] = [];
  constructor(
    private end: number,
    private onEnd?: () => void,
  ) {}
  at(time: number, fn: () => void) {
    this.events.push({ at: time, fn, done: false });
    return this;
  }
  every(from: number, to: number, every: number, fn: (t: number) => void) {
    this.spawners.push({ from, to, every, acc: every, fn });
    return this;
  }
  update(dt: number) {
    this.t += dt;
    for (const e of this.events) {
      if (!e.done && this.t >= e.at) {
        e.done = true;
        e.fn();
      }
    }
    for (const s of this.spawners) {
      if (this.t < s.from || this.t > s.to) continue;
      s.acc += dt;
      while (s.acc >= s.every) {
        s.acc -= s.every;
        s.fn(this.t);
      }
    }
    if (this.t >= this.end) {
      this.onEnd?.();
      return false;
    }
    return true;
  }
}

/** A missile flying in an arc, leaving a smoke trail, exploding on arrival. */
export class Missile implements Scene {
  private t = 0;
  private trail = 0;
  constructor(
    private from: W,
    private to: W,
    private dur: number,
    private color: string,
    private k = 1,
    private onHit?: () => void,
  ) {}
  private pos(fx: Effects, t: number): [number, number] {
    const [ax, ay] = fx.screen(this.from);
    const [bx, by] = fx.screen(this.to);
    const d = Math.hypot(bx - ax, by - ay);
    const h = Math.min(160, d * 0.35 + 20);
    return [ax + (bx - ax) * t, ay + (by - ay) * t - Math.sin(Math.PI * t) * h];
  }
  update(dt: number, fx: Effects) {
    this.t += dt;
    const p = Math.min(1, this.t / this.dur);
    this.trail += dt;
    if (this.trail > 0.025 && p < 1) {
      this.trail = 0;
      const [x, y] = this.pos(fx, p);
      const w = fx.host.toWorld(x, y);
      fx.puff(w, '#d9d9d9', 2.5 * this.k, 9 * this.k, 0.7, { alpha: 0.55, fadeIn: 0.05 });
    }
    if (p >= 1) {
      fx.explosion(this.to, this.k);
      this.onHit?.();
      return false;
    }
    return true;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const p = Math.min(1, this.t / this.dur);
    const [x, y] = this.pos(fx, p);
    const [x2, y2] = this.pos(fx, Math.min(1, p + 0.01));
    const ang = Math.atan2(y2 - y, x2 - x);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(this.k, this.k);
    // flame
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ff9800';
    ctx.beginPath();
    ctx.ellipse(-10, 0, 5 + Math.random() * 3, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffeb3b';
    ctx.beginPath();
    ctx.ellipse(-8.5, 0, 2.6, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // fins
    ctx.fillStyle = '#37474f';
    ctx.beginPath();
    ctx.moveTo(-7, -2);
    ctx.lineTo(-9, -4.5);
    ctx.lineTo(-4, -2);
    ctx.moveTo(-7, 2);
    ctx.lineTo(-9, 4.5);
    ctx.lineTo(-4, 2);
    ctx.fill();
    // body
    ctx.fillStyle = '#eceff1';
    ctx.strokeStyle = '#263238';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.rect(-7, -2, 13, 4);
    ctx.fill();
    ctx.stroke();
    // nose in the side's colour
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(6, -2);
    ctx.lineTo(10.5, 0);
    ctx.lineTo(6, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

/** The winner's flag pops up on a pole. */
export class FlagPop implements Scene {
  private t = 0;
  behind = false;
  constructor(
    private w: W,
    private img: HTMLImageElement | null,
    private color: string,
    private life: number,
  ) {}
  update(dt: number) {
    this.t += dt;
    return this.t < this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const [x, y] = fx.screen(this.w);
    const t = this.t;
    const grow = Math.min(1, t / 0.35);
    const bounce = 1 + Math.sin(Math.min(1, t / 0.6) * Math.PI) * 0.18 * (1 - Math.min(1, t / 0.6));
    const s = grow * bounce;
    const fade = Math.min(1, (this.life - t) / 0.4);
    const poleH = 46 * s;
    ctx.globalAlpha = Math.max(0, fade);
    ctx.strokeStyle = '#f5f5f5';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - poleH);
    ctx.stroke();
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.arc(x, y - poleH, 2.6, 0, Math.PI * 2);
    ctx.fill();
    const fw = 34 * s;
    const fh = 24 * s;
    // waving flag: draw in 6 vertical strips with a wave offset
    const strips = 6;
    for (let i = 0; i < strips; i++) {
      const u = i / strips;
      const wave = Math.sin(t * 7 - u * 4) * 2.2 * u * s;
      const sx = x + 1 + u * fw;
      const sy = y - poleH + 1 + wave;
      if (this.img && this.img.complete && this.img.naturalWidth) {
        const iw = this.img.naturalWidth / strips;
        ctx.drawImage(this.img, i * iw, 0, iw, this.img.naturalHeight, sx, sy, fw / strips + 0.6, fh);
      } else {
        ctx.fillStyle = this.color;
        ctx.fillRect(sx, sy, fw / strips + 0.6, fh);
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1, y - poleH + 1, fw, fh);
    ctx.globalAlpha = 1;
  }
}

/** Cracks spreading through the ground (earthquakes, droughts). */
export class Cracks implements Scene {
  private t = 0;
  private lines: [number, number][][] = [];
  constructor(
    private w: W,
    rand: Rand,
    count: number,
    length: number,
    private color: string,
    private width: number,
    private grow: number,
    private life: number,
  ) {
    for (let i = 0; i < count; i++) {
      let a = (i / count) * Math.PI * 2 + rand() * 0.8;
      let x = 0;
      let y = 0;
      const pts: [number, number][] = [[0, 0]];
      const L = length * (0.55 + rand() * 0.45);
      const n = 9;
      for (let k = 0; k < n; k++) {
        a += (rand() - 0.5) * 0.9;
        x += Math.cos(a) * (L / n);
        y += Math.sin(a) * (L / n);
        pts.push([x, y]);
      }
      this.lines.push(pts);
    }
  }
  update(dt: number) {
    this.t += dt;
    return this.t < this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const [x, y] = fx.screen(this.w);
    const p = Math.min(1, this.t / this.grow);
    const fade = Math.min(1, (this.life - this.t) / 0.6);
    ctx.globalAlpha = Math.max(0, fade);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass ? this.color : 'rgba(255,230,190,0.55)';
      ctx.lineWidth = pass ? this.width : this.width + 2.5;
      for (const line of this.lines) {
        const n = Math.max(1, Math.floor(p * (line.length - 1)));
        ctx.beginPath();
        ctx.moveTo(x + line[0][0], y + line[0][1]);
        for (let i = 1; i <= n; i++) ctx.lineTo(x + line[i][0], y + line[i][1]);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}

/** A spinning tornado funnel moving across the land. */
export class Tornado implements Scene {
  private t = 0;
  constructor(
    private from: W,
    private to: W,
    private life: number,
    private h: number,
  ) {}
  private where(fx: Effects): [number, number] {
    const [ax, ay] = fx.screen(this.from);
    const [bx, by] = fx.screen(this.to);
    const p = Math.min(1, this.t / this.life);
    return [ax + (bx - ax) * p + Math.sin(this.t * 3) * 10, ay + (by - ay) * p];
  }
  update(dt: number, fx: Effects) {
    this.t += dt;
    const [x, y] = this.where(fx);
    const base = fx.host.toWorld(x, y);
    for (let i = 0; i < 2; i++) {
      const a = fx.rand() * Math.PI * 2;
      fx.spawn(base, {
        kind: 'dot', color: fx.pick(['#5d4037', '#795548', '#3e2723', '#8d6e63']), size: fx.between(1.2, 2.6), life: 0.8,
        vx: Math.cos(a) * 90, vy: -fx.between(40, 140), ay: 120, drag: 0.8, fadeIn: 0,
      });
    }
    fx.puff(base, '#a1887f', 6, 22, 0.9, { vx: fx.between(-30, 30), vy: -10, alpha: 0.5 });
    return this.t < this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const [x, y] = this.where(fx);
    const fade = Math.min(1, this.t / 0.3, (this.life - this.t) / 0.4);
    const n = 16;
    ctx.globalAlpha = Math.max(0, fade);
    for (let i = n; i >= 0; i--) {
      const u = i / n;
      const cy = y - u * this.h;
      const r = 4 + u * u * this.h * 0.42;
      const off = Math.sin(this.t * 6 + u * 4) * u * 14;
      ctx.fillStyle = `rgba(${110 + u * 40},${110 + u * 40},${120 + u * 40},0.28)`;
      ctx.strokeStyle = 'rgba(70,70,80,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(x + off, cy, r, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + off, cy, r, r * 0.28, 0, this.t * 9 + u * 6, this.t * 9 + u * 6 + 2.2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

/** A hurricane: spinning spiral of clouds with an eye. */
export class Hurricane implements Scene {
  private t = 0;
  constructor(
    private w: W,
    private R: number,
    private life: number,
  ) {}
  update(dt: number, fx: Effects) {
    this.t += dt;
    if (fx.rand() < 0.8) {
      const a = fx.rand() * Math.PI * 2;
      const r = fx.between(0.3, 1) * this.R;
      const w = fx.offset(this.w, Math.cos(a) * r, Math.sin(a) * r);
      fx.spawn(w, { kind: 'streak', color: 'rgba(190,225,255,0.7)', size: 12, life: 0.35, vx: -120, vy: 520, fadeIn: 0 });
    }
    return this.t < this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const [x, y] = fx.screen(this.w);
    const grow = Math.min(1, this.t / 0.7);
    const fade = Math.min(1, (this.life - this.t) / 0.6);
    const R = this.R * (0.4 + 0.6 * grow);
    const rot = -this.t * 2.6;
    ctx.globalAlpha = Math.max(0, fade);
    // Cloud mass in the middle, then four cloudy spiral arms.
    const white = fx.sprite('#ffffff');
    const grey = fx.sprite('#cfd8dc');
    ctx.drawImage(grey, x - R * 0.55, y - R * 0.55, R * 1.1, R * 1.1);
    for (let arm = 0; arm < 4; arm++) {
      for (let s = 0.05; s <= 1; s += 0.045) {
        const r = R * (0.12 + 0.95 * s);
        const a = rot + arm * (Math.PI / 2) + s * 3.4;
        const size = R * (0.34 - s * 0.2);
        ctx.globalAlpha = Math.max(0, fade) * (0.85 - s * 0.55);
        ctx.drawImage(s < 0.5 ? white : grey, x + Math.cos(a) * r - size / 2, y + Math.sin(a) * r * 0.92 - size / 2, size, size);
      }
    }
    ctx.globalAlpha = Math.max(0, fade);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(5, R * 0.1), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(20,40,70,0.7)';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(3, R * 0.07), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** Big tsunami waves rolling in from the sea. `dir` = unit vector from the land toward the sea. */
export class Waves implements Scene {
  private t = 0;
  behind = false;
  constructor(
    private w: W,
    private dir: [number, number],
    private R: number,
    private count: number,
    private travel: number,
    private gap: number,
  ) {}
  update(dt: number, fx: Effects) {
    const before = this.t;
    this.t += dt;
    for (let i = 0; i < this.count; i++) {
      const arrive = i * this.gap + this.travel;
      if (before < arrive && this.t >= arrive) {
        for (let k = 0; k < 26; k++) {
          const a = -Math.PI / 2 + (fx.rand() - 0.5) * 2.2;
          const s = fx.between(80, 220);
          fx.spawn(fx.offset(this.w, this.dir[0] * this.R * 0.15, this.dir[1] * this.R * 0.15), {
            kind: 'dot', color: fx.pick(['#ffffff', '#bbdefb', '#64b5f6']), size: fx.between(1.5, 3.4), size1: 0.8, life: 0.8,
            x: (fx.rand() - 0.5) * this.R * 0.9 * -this.dir[1], y: (fx.rand() - 0.5) * this.R * 0.9 * this.dir[0],
            vx: Math.cos(a) * s * 0.6, vy: Math.sin(a) * s, ay: 420, fadeIn: 0,
          });
        }
        for (let k = 0; k < 5; k++) {
          const p = fx.offset(this.w, (fx.rand() - 0.5) * this.R, (fx.rand() - 0.5) * this.R * 0.8);
          fx.puff(p, '#1e88e5', 6, this.R * 0.35, 2.4, { alpha: 0.45, fadeIn: 0.15 });
        }
      }
    }
    return this.t < (this.count - 1) * this.gap + this.travel + 0.3;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const [cx, cy] = fx.screen(this.w);
    const [dx, dy] = this.dir;
    const px = -dy;
    const py = dx;
    for (let i = 0; i < this.count; i++) {
      const t = (this.t - i * this.gap) / this.travel;
      if (t < 0 || t > 1.05) continue;
      const dist = this.R * 1.5 * (1 - Math.min(1, t));
      const ox = cx + dx * dist;
      const oy = cy + dy * dist;
      const halfW = this.R * (0.55 + 0.35 * (1 - t));
      const alpha = Math.min(1, t * 4, (1.05 - t) * 6);
      const curve = (u: number, push: number): [number, number] => [
        ox + px * u * halfW + dx * (u * u * halfW * 0.35 + push),
        oy + py * u * halfW + dy * (u * u * halfW * 0.35 + push),
      ];
      const line = (push: number, color: string, width: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        for (let k = 0; k <= 20; k++) {
          const [x, y] = curve(-1 + (2 * k) / 20, push);
          if (k) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      };
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.lineCap = 'round';
      line(8, 'rgba(13,71,161,0.65)', 16);
      line(2, '#1e88e5', 10);
      line(-4, '#90caf9', 4);
      line(-7, '#ffffff', 2.5);
    }
    ctx.globalAlpha = 1;
  }
}

/** A blazing sun with turning rays (droughts). */
export class Sun implements Scene {
  private t = 0;
  constructor(
    private w: W,
    private dy: number,
    private life: number,
  ) {}
  update(dt: number) {
    this.t += dt;
    return this.t < this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const [x0, y0] = fx.screen(this.w);
    const x = x0;
    const y = y0 + this.dy;
    const grow = Math.min(1, this.t / 0.5);
    const fade = Math.min(1, (this.life - this.t) / 0.5);
    const r = 32 * grow;
    ctx.globalAlpha = Math.max(0, fade);
    ctx.strokeStyle = '#ffb300';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a = this.t * 0.8 + (i * Math.PI) / 6;
      const len = r * (i % 2 ? 0.55 : 0.85) * (1 + 0.15 * Math.sin(this.t * 6 + i));
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * (r + 5), y + Math.sin(a) * (r + 5));
      ctx.lineTo(x + Math.cos(a) * (r + 5 + len), y + Math.sin(a) * (r + 5 + len));
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffecb3';
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** A volcano cone that glows. */
export class Cone implements Scene {
  private t = 0;
  behind = true;
  constructor(
    private w: W,
    private life: number,
  ) {}
  update(dt: number) {
    this.t += dt;
    return this.t < this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const [x, y] = fx.screen(this.w);
    const rise = Math.min(1, this.t / 0.4);
    const fade = Math.min(1, (this.life - this.t) / 0.5);
    ctx.globalAlpha = Math.max(0, fade);
    const h = 34 * rise;
    ctx.fillStyle = '#4e342e';
    ctx.strokeStyle = '#2b1b17';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 30, y);
    ctx.lineTo(x - 7, y - h);
    ctx.lineTo(x + 7, y - h);
    ctx.lineTo(x + 30, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff6d00';
    ctx.beginPath();
    ctx.moveTo(x - 7, y - h);
    ctx.lineTo(x - 3, y - h * 0.62);
    ctx.lineTo(x + 1, y - h * 0.8);
    ctx.lineTo(x + 4, y - h * 0.55);
    ctx.lineTo(x + 7, y - h);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** A fiery meteor streaking down. */
export class Meteor implements Scene {
  private t = 0;
  constructor(
    private to: W,
    private dx: number,
    private dy: number,
    private dur: number,
    private onHit: () => void,
  ) {}
  private where(fx: Effects): [number, number] {
    const [x, y] = fx.screen(this.to);
    const p = Math.min(1, this.t / this.dur);
    const e = p * p;
    return [x + this.dx * (1 - e), y + this.dy * (1 - e)];
  }
  update(dt: number, fx: Effects) {
    this.t += dt;
    const [x, y] = this.where(fx);
    const w = fx.host.toWorld(x, y);
    fx.spawn(w, { kind: 'glow', color: fx.pick(['#ff6d00', '#ffab00', '#ff3d00']), size: 12, size1: 3, life: 0.45, fadeIn: 0 });
    fx.puff(w, '#616161', 5, 16, 0.9, { alpha: 0.5 });
    if (this.t >= this.dur) {
      this.onHit();
      return false;
    }
    return true;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const [x, y] = this.where(fx);
    ctx.fillStyle = '#5d4037';
    ctx.strokeStyle = '#ffab40';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** A dark crater that slowly fades. */
export class Crater implements Scene {
  private t = 0;
  behind = true;
  constructor(
    private w: W,
    private r: number,
    private life: number,
  ) {}
  update(dt: number) {
    this.t += dt;
    return this.t < this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const [x, y] = fx.screen(this.w);
    ctx.globalAlpha = Math.max(0, Math.min(1, (this.life - this.t) / 1));
    ctx.fillStyle = 'rgba(40,25,20,0.75)';
    ctx.strokeStyle = 'rgba(255,145,0,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, this.r, this.r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
