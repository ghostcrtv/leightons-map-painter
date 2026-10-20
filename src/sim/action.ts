/**
 * "Action level" extras for battles and disasters: the build-up (countdown, warnings), the
 * action (dogfights, lightning, flying debris…) and the payoff (stamps, flag raising).
 *
 * Everything here is screen-space or world-anchored cartoon drawing on the effects canvas —
 * emoji and simple shapes, no image files — so it stays fast on an iPad.
 * Calm = none of this; Normal = most of it; Epic = all of it, plus slow motion and camera punches.
 */
import { Ring, drawJet, type Effects, type Scene, type W } from './effects';
import { drawEmoji } from '../utils/emoji';
import { sound } from '../audio/sound';

export type ActionLevel = 'calm' | 'normal' | 'epic';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const FONT = "'Lilita One', system-ui, sans-serif";

/** Big outlined cartoon text. */
function bigText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, fill: string, stroke = '#10131c') {
  ctx.font = `${Math.round(px)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, px * 0.14);
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

// ------------------------------------------------------------------ build-up

/** "3… 2… 1… FIGHT!" in the middle of the screen, then `onDone`. ~1.9 s. */
export class Countdown implements Scene {
  private t = 0;
  private step = -1;
  constructor(private onDone: () => void) {}
  update(dt: number) {
    this.t += dt;
    const step = Math.floor(this.t / 0.45);
    if (step !== this.step && step <= 3) {
      this.step = step;
      sound.play(step < 3 ? 'beep' : 'go');
    }
    if (this.t >= 1.9) {
      this.onDone();
      return false;
    }
    return true;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const step = Math.min(3, Math.floor(this.t / 0.45));
    const local = (this.t - step * 0.45) / (step < 3 ? 0.45 : 0.55);
    const s = 1.6 - 0.6 * easeOut(clamp01(local * 2.5));
    const label = step < 3 ? String(3 - step) : 'FIGHT!';
    ctx.save();
    ctx.globalAlpha = step < 3 ? 1 - clamp01((local - 0.75) * 4) : 1 - clamp01((local - 0.7) * 3.3);
    ctx.translate(fx.width / 2, fx.height * 0.42);
    ctx.scale(s, s);
    bigText(ctx, label, 0, 0, step < 3 ? 96 : 84, step < 3 ? '#ffffff' : '#ffd34d');
    ctx.restore();
  }
}

/** A cartoon stamp slammed onto the screen: "UPSET!", "CONQUERED!", "EXTREME!"… ~1.8 s. */
export class Stamp implements Scene {
  private t = 0;
  constructor(
    private text: string,
    private color: string,
    private delay = 0,
    private life = 1.8,
  ) {}
  update(dt: number, fx: Effects) {
    const before = this.t;
    this.t += dt;
    if (before < this.delay && this.t >= this.delay) sound.play('stamp');
    const k = this.t - this.delay;
    if (k > 0 && k < 0.25) fx.shake(7 * (1 - k / 0.25));
    return this.t < this.delay + this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const k = this.t - this.delay;
    if (k < 0) return;
    const inK = clamp01(k / 0.16);
    const s = 2.6 - 1.6 * inK;
    const px = Math.min(76, fx.width / Math.max(6, this.text.length * 0.62));
    ctx.save();
    ctx.globalAlpha = inK * (1 - clamp01((k - (this.life - 0.35)) / 0.35));
    ctx.translate(fx.width / 2, fx.height * 0.3);
    ctx.rotate(-0.12);
    ctx.scale(s, s);
    // a rough rectangle border, like a rubber stamp
    ctx.font = `${Math.round(px)}px ${FONT}`;
    const w = ctx.measureText(this.text).width + px * 0.7;
    const h = px * 1.35;
    ctx.lineWidth = px * 0.1;
    ctx.strokeStyle = this.color;
    ctx.fillStyle = 'rgba(16,19,28,0.55)';
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w, h);
    ctx.fill();
    ctx.stroke();
    bigText(ctx, this.text, 0, px * 0.04, px, this.color);
    ctx.restore();
  }
}

/** The sky darkens (behind the effects), e.g. before a disaster hits. */
export class Darken implements Scene {
  behind = true;
  private t = 0;
  constructor(
    private life: number,
    private color = '8,12,28',
    private max = 0.38,
  ) {}
  update(dt: number) {
    this.t += dt;
    return this.t < this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const a = this.max * Math.min(1, this.t / 0.6, (this.life - this.t) / 0.6);
    ctx.fillStyle = `rgba(${this.color},${Math.max(0, a)})`;
    ctx.fillRect(0, 0, fx.width, fx.height);
  }
}

/** A flashing ⚠️ over the place about to be hit, with a pulsing red edge on the screen. */
export class Warning implements Scene {
  private t = 0;
  constructor(
    private at: W,
    private life = 1.1,
  ) {
    sound.play('siren');
  }
  update(dt: number) {
    this.t += dt;
    return this.t < this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 14);
    const fade = Math.min(1, (this.life - this.t) / 0.25);
    const [x, y] = fx.screen(this.at);
    ctx.save();
    // red glow around the screen edge
    const g = ctx.createRadialGradient(fx.width / 2, fx.height / 2, Math.min(fx.width, fx.height) * 0.35, fx.width / 2, fx.height / 2, Math.max(fx.width, fx.height) * 0.75);
    g.addColorStop(0, 'rgba(255,0,0,0)');
    g.addColorStop(1, `rgba(255,30,30,${0.35 * pulse * fade})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, fx.width, fx.height);
    ctx.restore();
    drawEmoji(ctx, '⚠️', x, y - 10, 54 + pulse * 14, { alpha: fade * (0.6 + 0.4 * pulse) });
  }
}

/** A full-screen flash (meteor impact, lightning). */
export class Flash implements Scene {
  private t = 0;
  constructor(
    private life = 0.35,
    private color = '255,255,255',
    private max = 0.85,
  ) {}
  update(dt: number) {
    this.t += dt;
    return this.t < this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    ctx.fillStyle = `rgba(${this.color},${this.max * (1 - this.t / this.life) ** 2})`;
    ctx.fillRect(0, 0, fx.width, fx.height);
  }
}

// ------------------------------------------------------------------ battle action

/**
 * A tug-of-war bar under the banner: both flags, a marker that shoves back and forth while they
 * fight, then snaps to the winner (or rests in the middle for peace).
 */
export class TugBar implements Scene {
  private t = 0;
  private p = 0;
  private v = 0;
  constructor(
    private a: { img: HTMLImageElement | null; color: string },
    private b: { img: HTMLImageElement | null; color: string },
    /** 'a', 'b' or null (peace) */
    private winner: 'a' | 'b' | null,
    private resolveAt: number,
    private life: number,
    /** Leaning toward the stronger side while they fight (0–1 share for A). */
    private aShare: number,
  ) {}
  update(dt: number, fx: Effects) {
    this.t += dt;
    if (this.t < this.resolveAt) {
      // a wobbly random walk, pulled toward the stronger side
      const lean = (this.aShare - 0.5) * 1.2;
      this.v += ((fx.rand() - 0.5) * 9 + (lean - this.p) * 3) * dt;
      this.v *= Math.exp(-2.5 * dt);
      this.p = Math.max(-0.8, Math.min(0.8, this.p + this.v * dt));
    } else {
      const target = this.winner === 'a' ? 1 : this.winner === 'b' ? -1 : 0;
      this.p += (target - this.p) * Math.min(1, dt * 9);
    }
    return this.t < this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const phone = fx.width < 600;
    // On phones, keep clear of the toolbar on the left.
    const W = phone ? fx.width - 132 - 50 : Math.min(420, fx.width - 120);
    const x0 = phone ? 132 : (fx.width - W) / 2;
    const y = fx.width < 600 ? 178 : 132; // below the banner (it wraps onto two lines on phones)
    const h = 14;
    const alpha = Math.min(1, this.t / 0.3, (this.life - this.t) / 0.4);
    if (alpha <= 0) return;
    const pushX = x0 + W / 2 + (this.p * W) / 2; // A pushes the marker toward B (right)
    ctx.save();
    ctx.globalAlpha = alpha;
    // track
    ctx.fillStyle = 'rgba(16,19,28,0.7)';
    roundRect(ctx, x0 - 4, y - h / 2 - 4, W + 8, h + 8, 12);
    ctx.fill();
    // A's colour from the left up to the marker, B's from the right
    ctx.fillStyle = this.a.color;
    roundRect(ctx, x0, y - h / 2, Math.max(0, pushX - x0), h, 7);
    ctx.fill();
    ctx.fillStyle = this.b.color;
    roundRect(ctx, pushX, y - h / 2, Math.max(0, x0 + W - pushX), h, 7);
    ctx.fill();
    // marker
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#10131c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pushX, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    drawEmoji(ctx, '⚔️', pushX, y, 13);
    // flags at both ends
    for (const [side, img] of [[-1, this.a.img], [1, this.b.img]] as const) {
      const fxp = side < 0 ? x0 - 36 : x0 + W + 4;
      const win = this.t > this.resolveAt && ((side < 0 && this.winner === 'a') || (side > 0 && this.winner === 'b'));
      const bounce = win ? Math.abs(Math.sin(this.t * 10)) * 4 : 0;
      if (img?.complete && img.naturalWidth) {
        ctx.fillStyle = '#10131c';
        ctx.fillRect(fxp - 2, y - 13 - bounce, 36, 26);
        ctx.drawImage(img, fxp, y - 11 - bounce, 32, 22);
      }
    }
    ctx.restore();
  }
}

/** Two jets chasing each other in loops above the battle, with tracer fire. */
export class Dogfight implements Scene {
  private t = 0;
  constructor(
    private at: W,
    private aColor: string,
    private bColor: string,
    private life: number,
    private delay = 0,
  ) {}
  private pos(fx: Effects, phase: number): { x: number; y: number; ang: number } {
    const [cx, cy] = fx.screen(this.at);
    const R = 70;
    // a figure-of-eight
    const u = this.t * 1.7 + phase;
    const x = cx + Math.sin(u) * R * 1.3;
    const y = cy - 70 + Math.sin(u * 2) * R * 0.45;
    const dx = Math.cos(u) * R * 1.3;
    const dy = Math.cos(u * 2) * 2 * R * 0.45;
    return { x, y, ang: Math.atan2(dy, dx) };
  }
  update(dt: number, fx: Effects) {
    this.t += dt;
    if (this.t < this.delay) return true;
    for (const [phase] of [[0], [-0.55]]) {
      const p = this.pos(fx, phase);
      if (fx.rand() < 0.7) fx.puff(fx.host.toWorld(p.x, p.y), '#ffffff', 1.4, 4.5, 0.6, { alpha: 0.4, fadeIn: 0 });
    }
    // the chaser fires short bursts
    if (fx.rand() < 0.12) {
      const a = this.pos(fx, -0.55);
      const b = this.pos(fx, 0);
      fx.spawn(fx.host.toWorld(a.x, a.y), { kind: 'streak', color: 'rgba(255,235,59,0.95)', size: 9, life: 0.25, vx: (b.x - a.x) * 3, vy: (b.y - a.y) * 3, fadeIn: 0 });
    }
    return this.t < this.delay + this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    if (this.t < this.delay) return;
    const fade = Math.min(1, (this.t - this.delay) / 0.3, (this.delay + this.life - this.t) / 0.3);
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    const a = this.pos(fx, 0);
    const b = this.pos(fx, -0.55);
    drawJet(ctx, a.x, a.y, a.ang, this.bColor, 0, 1.15);
    drawJet(ctx, b.x, b.y, b.ang, this.aColor, 0, 1.15);
    ctx.restore();
  }
}

/** The winner's flag raised on a pole at the captured land, waving. */
export class FlagRaise implements Scene {
  private t = 0;
  constructor(
    private at: W,
    private img: HTMLImageElement | null,
    private color: string,
    private life = 2.6,
  ) {}
  update(dt: number) {
    this.t += dt;
    return this.t < this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const [x, y] = fx.screen(this.at);
    const poleH = 70 * easeOut(clamp01(this.t / 0.3));
    const climb = easeOut(clamp01((this.t - 0.25) / 0.6));
    const fade = Math.min(1, (this.life - this.t) / 0.4);
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    // pole + gold knob
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - poleH);
    ctx.stroke();
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.arc(x, y - poleH, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // waving flag, drawn in thin vertical slices
    const fw = 44;
    const fh = 30;
    const top = y - 8 - (poleH - 12) * climb - fh * climb;
    const slices = 11;
    for (let i = 0; i < slices; i++) {
      const sx = (i / slices) * fw;
      const wave = Math.sin(this.t * 9 - i * 0.6) * 3 * (i / slices);
      if (this.img?.complete && this.img.naturalWidth) {
        const iw = this.img.naturalWidth;
        const ih = this.img.naturalHeight;
        ctx.drawImage(this.img, (i / slices) * iw, 0, iw / slices + 1, ih, x + 1.5 + sx, top + wave, fw / slices + 0.6, fh);
      } else {
        ctx.fillStyle = this.color;
        ctx.fillRect(x + 1.5 + sx, top + wave, fw / slices + 0.6, fh);
      }
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------ disaster action

/** A jagged lightning bolt striking a point, with a flash. ~0.4 s. */
export class Lightning implements Scene {
  private t = 0;
  private pts: [number, number][] = [];
  constructor(private at: W) {}
  update(dt: number, fx: Effects) {
    if (this.t === 0) {
      sound.play('thunder');
      fx.add(new Flash(0.25, '230,240,255', 0.35));
      let x = 0;
      for (let i = 0; i <= 9; i++) {
        this.pts.push([x, -180 + (i / 9) * 180]);
        x += fx.between(-16, 16);
      }
      this.pts[this.pts.length - 1] = [0, 0];
    }
    this.t += dt;
    return this.t < 0.4;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const [x, y] = fx.screen(this.at);
    const on = this.t < 0.08 || (this.t > 0.14 && this.t < 0.26);
    if (!on) return;
    ctx.save();
    ctx.lineJoin = 'round';
    for (const [w, c] of [[7, 'rgba(160,190,255,0.5)'], [2.5, '#ffffff']] as const) {
      ctx.lineWidth = w;
      ctx.strokeStyle = c;
      ctx.beginPath();
      this.pts.forEach(([px, py], i) => ctx[i ? 'lineTo' : 'moveTo'](x + px, y + py));
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Things (cows, cars, roofs…) whirling around a storm's centre. `centre(t)` may move. */
export class Whirl implements Scene {
  private t = 0;
  private items: { ch: string; a: number; r: number; spin: number; px: number; up: number }[] = [];
  constructor(
    private centre: (t: number) => W,
    emojis: string[],
    count: number,
    radius: number,
    private life: number,
    private speed = 3,
    size = 1,
  ) {
    for (let i = 0; i < count; i++) {
      this.items.push({ ch: emojis[i % emojis.length], a: (i / count) * Math.PI * 2, r: radius * (0.5 + Math.random() * 0.6), spin: Math.random() * 6, px: (15 + Math.random() * 9) * size, up: Math.random() });
    }
  }
  update(dt: number) {
    this.t += dt;
    return this.t < this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const [cx, cy] = fx.screen(this.centre(this.t));
    const k = Math.min(1, this.t / 0.6, (this.life - this.t) / 0.6);
    for (const it of this.items) {
      const a = it.a + this.t * this.speed * (60 / it.r);
      const lift = Math.sin(this.t * 2 + it.up * 6) * it.r * 0.25 + it.up * it.r * 0.4;
      drawEmoji(ctx, it.ch, cx + Math.cos(a) * it.r * k, cy - lift * k + Math.sin(a) * it.r * 0.35 * k, it.px, { rot: this.t * it.spin, alpha: k });
    }
  }
}

/** A house that wobbles in an earthquake, then topples over into a ruin with a puff of dust. */
export class Crumble implements Scene {
  private t = 0;
  private fell = false;
  constructor(
    private at: W,
    private delay: number,
    private life = 3.2,
  ) {}
  update(dt: number, fx: Effects) {
    this.t += dt;
    if (!this.fell && this.t - this.delay > 1.0) {
      this.fell = true;
      fx.puff(this.at, '#bcaaa4', 8, 34, 1.4, { vy: -18, alpha: 0.7 });
      fx.puff(this.at, '#a1887f', 6, 26, 1.2, { vy: -10, vx: 14, alpha: 0.6 });
    }
    return this.t < this.delay + this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const k = this.t - this.delay;
    if (k < 0) return;
    const [x, y] = fx.screen(this.at);
    const fade = Math.min(1, k / 0.2, (this.life - k) / 0.4);
    if (k < 1.0) drawEmoji(ctx, '🏠', x + Math.sin(k * 40) * 2.5, y - 10, 22, { rot: Math.sin(k * 30) * 0.12, alpha: fade });
    else drawEmoji(ctx, '🏚️', x, y - 8 + 2, 22, { rot: 0.25, alpha: fade });
  }
}

/** A tumbleweed bouncing across the land. */
export class Tumbleweed implements Scene {
  private t = 0;
  constructor(
    private from: W,
    private to: W,
    private life: number,
    private delay = 0,
  ) {}
  update(dt: number) {
    this.t += dt;
    return this.t < this.delay + this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const k = (this.t - this.delay) / this.life;
    if (k < 0) return;
    const [ax, ay] = fx.screen(this.from);
    const [bx, by] = fx.screen(this.to);
    const x = lerp(ax, bx, k);
    const y = lerp(ay, by, k) - Math.abs(Math.sin(k * Math.PI * 5)) * 16;
    const r = 9;
    ctx.save();
    ctx.globalAlpha = Math.min(1, k / 0.08, (1 - k) / 0.1);
    ctx.translate(x, y);
    ctx.rotate(k * 22);
    ctx.strokeStyle = '#a1887f';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = i * 2.3;
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.quadraticCurveTo(Math.cos(a + 1.2) * r * 0.2, Math.sin(a + 1.2) * r * 0.2, Math.cos(a + 2.6) * r, Math.sin(a + 2.6) * r);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** An icy frost spreading over the land (blizzard). */
export class Frost implements Scene {
  behind = true;
  private t = 0;
  constructor(
    private at: W,
    private R: number,
    private life: number,
  ) {}
  update(dt: number) {
    this.t += dt;
    return this.t < this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const [x, y] = fx.screen(this.at);
    const grow = easeOut(clamp01(this.t / 1.6));
    const fade = Math.min(1, (this.life - this.t) / 0.6);
    const r = this.R * 1.3 * grow;
    if (r < 2) return;
    const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    g.addColorStop(0, `rgba(225,245,254,${0.55 * fade})`);
    g.addColorStop(0.7, `rgba(179,229,252,${0.35 * fade})`);
    g.addColorStop(1, 'rgba(179,229,252,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A circle of water rising over the land (flood). */
export class RisingWater implements Scene {
  behind = true;
  private t = 0;
  constructor(
    private at: W,
    private R: number,
    private life: number,
  ) {}
  update(dt: number) {
    this.t += dt;
    return this.t < this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const [x, y] = fx.screen(this.at);
    const grow = easeOut(clamp01(this.t / 2.2));
    const fade = Math.min(1, (this.life - this.t) / 0.7);
    const r = this.R * 1.1 * grow;
    if (r < 2) return;
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, `rgba(30,136,229,${0.5 * fade})`);
    g.addColorStop(0.8, `rgba(66,165,245,${0.35 * fade})`);
    g.addColorStop(1, 'rgba(66,165,245,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    // little wave lines on top
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * fade})`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const wy = y - r * 0.5 + (i * r) / 5;
      const wx = x - r * 0.45 + Math.sin(this.t * 2 + i) * 10;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.quadraticCurveTo(wx + 10, wy - 5, wx + 20, wy);
      ctx.quadraticCurveTo(wx + 30, wy + 5, wx + 40, wy);
      ctx.stroke();
    }
  }
}

/** Shockwave rings + rocks flying out of a crater. */
export function impactBlast(fx: Effects, at: W, R: number, big: number) {
  for (const [d, c, w] of [[0, 'rgba(255,255,255,0.95)', 6], [0.12, 'rgba(255,183,77,0.9)', 4], [0.26, 'rgba(255,112,67,0.8)', 3]] as const) {
    fx.add(new Ring(at, 10, R * (1.2 + big * 0.5), 1.0, c, w, d));
  }
  for (let i = 0; i < 18 * big; i++) {
    const a = fx.rand() * Math.PI * 2;
    const sp = fx.between(120, 320);
    fx.spawn(at, { kind: 'dot', color: fx.pick(['#6d4c41', '#8d6e63', '#4e342e', '#ffab40']), size: fx.between(2, 4.5), size1: 1, life: fx.between(0.7, 1.2), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 140, ay: 420, drag: 0.8, fadeIn: 0 });
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
