/**
 * Crazy disasters (turned on in Settings) and the secret Titanic scene.
 *
 * Most crazy creatures are emoji drawn onto the effects canvas: they look great on an iPad
 * (Apple's emoji), need no image files, and stay cartoon-like. Each emoji is drawn once into
 * a small canvas and reused, because drawing emoji text every frame is slow in Safari.
 */
import { Ring, Timeline, Waves, type Effects, type Scene, type W } from './effects';
import { sound } from '../audio/sound';

// ------------------------------------------------------------------ emoji sprites

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const spriteCache = new Map<string, HTMLCanvasElement>();

/** A canvas holding one emoji, drawn at about `px` (rounded so few sizes are cached). */
function emojiSprite(ch: string, px: number): HTMLCanvasElement {
  const size = Math.max(12, Math.min(256, Math.round((px * 2) / 8) * 8)); // 2× for sharp iPad screens
  const key = `${ch}|${size}`;
  let c = spriteCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * 1.3);
    const ctx = c.getContext('2d')!;
    ctx.font = `${size}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, c.width / 2, c.height / 2 + size * 0.06);
    spriteCache.set(key, c);
  }
  return c;
}

/** Draw an emoji centred at x, y (screen px). */
export function drawEmoji(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, px: number, o: { flip?: boolean; rot?: number; alpha?: number } = {}) {
  if (px < 2) return;
  const img = emojiSprite(ch, px);
  const s = (px * 1.3) / img.width;
  const w = img.width * s;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, o.alpha ?? 1));
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  if (o.flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -w / 2, w, w);
  ctx.restore();
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (t: number) => 1 - (1 - t) ** 2;

// ------------------------------------------------------------------ scenes

type Gait = 'walk' | 'hop' | 'scurry' | 'fly' | 'fall' | 'march';

/** An emoji moving from one map point to another. */
export class Walker implements Scene {
  private t = 0;
  private seed = Math.random() * 10;
  constructor(
    private from: W,
    private to: W,
    private life: number,
    private ch: string,
    private px: number,
    private o: { delay?: number; gait?: Gait; facesLeft?: boolean; noFlip?: boolean; spin?: number; onEnd?: () => void } = {},
  ) {}
  update(dt: number) {
    this.t += dt;
    const end = (this.o.delay ?? 0) + this.life;
    if (this.t >= end) {
      this.o.onEnd?.();
      return false;
    }
    return true;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const k = (this.t - (this.o.delay ?? 0)) / this.life;
    if (k < 0) return;
    const [ax, ay] = fx.screen(this.from);
    const [bx, by] = fx.screen(this.to);
    const gait = this.o.gait ?? 'walk';
    const e = gait === 'fall' ? k * k : k;
    let x = lerp(ax, bx, e);
    let y = lerp(ay, by, e);
    const time = this.t + this.seed;
    let rot = 0;
    if (gait === 'walk') {
      y -= Math.abs(Math.sin(time * 7)) * this.px * 0.12;
      rot = Math.sin(time * 7) * 0.1;
    } else if (gait === 'march') {
      y -= Math.abs(Math.sin(time * 10)) * this.px * 0.08;
    } else if (gait === 'hop') {
      y -= Math.abs(Math.sin(time * 11)) * this.px * 0.25;
    } else if (gait === 'scurry') {
      x += Math.sin(time * 37) * 2.2;
      y += Math.cos(time * 29) * 2.2;
      rot = Math.sin(time * 9) * 0.35;
    } else if (gait === 'fly') {
      y += Math.sin(time * 4) * this.px * 0.12;
    }
    if (this.o.spin) rot = time * this.o.spin;
    const facesLeft = this.o.facesLeft ?? true;
    const flip = !this.o.noFlip && (bx > ax) === facesLeft;
    const alpha = Math.min(1, k / 0.08, (1 - k) / 0.1);
    drawEmoji(ctx, this.ch, x, y, this.px, { flip, rot, alpha });
  }
}

/** An emoji that rises up (grows) at one spot, wobbles, then sinks back down. */
class Riser implements Scene {
  private t = 0;
  constructor(
    private at: W,
    private ch: string,
    private px: number,
    private life: number,
    private delay = 0,
  ) {}
  update(dt: number) {
    this.t += dt;
    return this.t < this.delay + this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const t = this.t - this.delay;
    if (t < 0) return;
    const [x, y] = fx.screen(this.at);
    const up = easeOut(clamp01(t / 0.7));
    const down = clamp01((t - (this.life - 0.6)) / 0.6);
    const s = up * (1 - down * 0.7);
    const px = this.px * Math.max(0.05, s);
    drawEmoji(ctx, this.ch, x + Math.sin(t * 3) * 3, y + (1 - up) * this.px * 0.6 + down * this.px * 0.5 - px * 0.25, px, {
      rot: Math.sin(t * 2.5) * 0.12,
      alpha: 1 - down,
    });
  }
}

/** Flying saucer: flies in, shines a tractor beam, lifts a cow, flies away. */
class Saucer implements Scene {
  private t = 0;
  constructor(
    private ground: W,
    private life: number,
    private delay: number,
    private hover: number,
  ) {}
  update(dt: number) {
    this.t += dt;
    return this.t < this.delay + this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const t = this.t - this.delay;
    if (t < 0) return;
    const [gx, gy] = fx.screen(this.ground);
    const hx = gx;
    const hy = gy - this.hover;
    const inT = 0.7;
    const outT = this.life - 0.6;
    let x = hx;
    let y = hy;
    if (t < inT) {
      const k = easeOut(t / inT);
      x = lerp(hx + 260, hx, k);
      y = lerp(hy - 220, hy, k);
    } else if (t > outT) {
      const k = clamp01((t - outT) / 0.6) ** 2;
      x = lerp(hx, hx - 120, k);
      y = lerp(hy, hy - 400, k);
    }
    y += Math.sin(t * 4) * 3;
    // The beam (only while hovering).
    const beam = t > inT + 0.1 && t < outT ? Math.min(1, (t - inT - 0.1) / 0.25, (outT - t) / 0.2) : 0;
    if (beam > 0) {
      const g = ctx.createLinearGradient(0, y, 0, gy);
      g.addColorStop(0, `rgba(178,255,89,${0.55 * beam})`);
      g.addColorStop(1, `rgba(178,255,89,${0.12 * beam})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 8, y + 6);
      ctx.lineTo(x + 8, y + 6);
      ctx.lineTo(gx + 26, gy + 4);
      ctx.lineTo(gx - 26, gy + 4);
      ctx.closePath();
      ctx.fill();
      // A cow floats up the beam.
      const k = clamp01((t - inT - 0.2) / (outT - inT - 0.3));
      drawEmoji(ctx, '🐄', lerp(gx, x, k) + Math.sin(t * 5) * 3, lerp(gy - 6, y + 12, k), 18 * (1 - k * 0.5), { rot: t * 2, alpha: 1 - k * 0.6 });
    }
    drawEmoji(ctx, '🛸', x, y, 44, { alpha: Math.min(1, t / 0.2) });
  }
}

/** A cartoon mushroom cloud growing from a point. */
class Mushroom implements Scene {
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
    const k = easeOut(clamp01(this.t / 1.5));
    const fade = clamp01((this.life - this.t) / 0.9);
    const cool = clamp01((this.t - 0.5) / 2.2); // fiery orange → smoky grey-brown
    const mix = (a: number[], b: number[], alpha = 1) =>
      `rgba(${Math.round(lerp(a[0], b[0], cool))},${Math.round(lerp(a[1], b[1], cool))},${Math.round(lerp(a[2], b[2], cool))},${alpha})`;
    const h = this.R * 0.9 * k;
    const capR = this.R * (0.2 + 0.32 * k);
    const sw = capR * 0.22;
    const cy = y - h;
    ctx.save();
    ctx.globalAlpha = fade;
    // Dust ring along the ground
    ctx.fillStyle = mix([255, 183, 77], [141, 110, 99], 0.75);
    ctx.beginPath();
    ctx.ellipse(x, y, capR * (0.7 + 0.6 * k), capR * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    // Stem: a column that flares at the bottom and top
    const sg = ctx.createLinearGradient(x - sw * 2, 0, x + sw * 2, 0);
    sg.addColorStop(0, mix([216, 67, 21], [93, 64, 55]));
    sg.addColorStop(0.5, mix([255, 202, 40], [188, 170, 164]));
    sg.addColorStop(1, mix([216, 67, 21], [93, 64, 55]));
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(x - sw * 2.2, y);
    ctx.quadraticCurveTo(x - sw * 0.8, y - h * 0.4, x - sw, cy + capR * 0.2);
    ctx.lineTo(x + sw, cy + capR * 0.2);
    ctx.quadraticCurveTo(x + sw * 0.8, y - h * 0.4, x + sw * 2.2, y);
    ctx.closePath();
    ctx.fill();
    // Cap underside (darker), then puffy dome on top
    ctx.fillStyle = mix([191, 54, 12], [78, 52, 46]);
    ctx.beginPath();
    ctx.ellipse(x, cy + capR * 0.15, capR * 1.05, capR * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    const puffs = 8;
    for (let i = 0; i < puffs; i++) {
      const a = Math.PI + (i / (puffs - 1)) * Math.PI; // across the top half
      const r = capR * (0.42 + 0.06 * Math.sin(i * 2.3 + this.t * 2));
      const px = x + Math.cos(a) * capR * 0.72;
      const py = cy + Math.sin(a) * capR * 0.45;
      const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.35, r * 0.1, px, py, r);
      g.addColorStop(0, mix([255, 249, 196], [215, 204, 200]));
      g.addColorStop(0.6, mix([255, 152, 0], [141, 110, 99]));
      g.addColorStop(1, mix([230, 81, 0], [109, 76, 65]));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Glowing heart of the cap
    const g = ctx.createRadialGradient(x, cy - capR * 0.1, 1, x, cy, capR * 0.7);
    g.addColorStop(0, mix([255, 255, 255], [239, 235, 233], 1 - cool * 0.5));
    g.addColorStop(1, mix([255, 171, 0], [161, 136, 127], 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, cy - capR * 0.1, capR * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** A spider web spinning out at a point. */
class Web implements Scene {
  private t = 0;
  constructor(
    private at: W,
    private r: number,
    private life: number,
    private delay = 0,
  ) {}
  update(dt: number) {
    this.t += dt;
    return this.t < this.delay + this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const t = this.t - this.delay;
    if (t < 0) return;
    const [x, y] = fx.screen(this.at);
    const k = easeOut(clamp01(t / 0.7));
    const r = this.r * k;
    ctx.save();
    ctx.globalAlpha = 0.75 * clamp01((this.life - t) / 0.6);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    const spokes = 10;
    ctx.beginPath();
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    for (let ring = 1; ring <= 5; ring++) {
      const rr = (r * ring) / 5;
      for (let i = 0; i <= spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else {
          const am = ((i - 0.5) / spokes) * Math.PI * 2;
          ctx.quadraticCurveTo(x + Math.cos(am) * rr * 0.86, y + Math.sin(am) * rr * 0.86, px, py);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** A swirling black hole, with things spiralling into it. */
class BlackHole implements Scene {
  private t = 0;
  private junk: { ch: string; a: number; r: number; at: number; dur: number }[] = [];
  constructor(
    private at: W,
    private R: number,
    private life: number,
  ) {
    const things = ['🏠', '🌳', '🚗', '🐄', '🏢', '🚌', '⛪', '🌲', '🐑', '🏰', '🚜', '🗽'];
    for (let i = 0; i < 16; i++) {
      this.junk.push({ ch: things[i % things.length], a: Math.random() * Math.PI * 2, r: R * (0.75 + Math.random() * 0.5), at: 0.3 + Math.random() * 1.8, dur: 1.1 + Math.random() * 0.6 });
    }
  }
  update(dt: number) {
    this.t += dt;
    return this.t < this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const [x, y] = fx.screen(this.at);
    const grow = easeOut(clamp01(this.t / 0.8));
    const shrink = clamp01((this.t - (this.life - 0.7)) / 0.7);
    const r = this.R * 0.28 * grow * (1 - shrink);
    if (r < 0.5) return;
    ctx.save();
    // Glowing swirl
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = ['rgba(255,145,0,0.75)', 'rgba(213,0,249,0.6)', 'rgba(255,235,59,0.6)'][i];
      ctx.lineWidth = 3 + i;
      ctx.beginPath();
      const spin = this.t * (4 + i);
      ctx.ellipse(x, y, r * (1.8 - i * 0.25), r * (0.7 - i * 0.08), spin * 0.1 + i, spin, spin + Math.PI * 1.4);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.3);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.75, 'rgba(20,0,40,0.95)');
    g.addColorStop(1, 'rgba(120,0,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Things getting sucked in
    for (const j of this.junk) {
      const k = (this.t - j.at) / j.dur;
      if (k < 0 || k > 1) continue;
      const rr = j.r * (1 - k * k);
      const a = j.a + k * 5;
      drawEmoji(ctx, j.ch, x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.6, 30 * (1 - k * 0.85), { rot: k * 8, alpha: Math.min(1, k * 6) });
    }
  }
}

/** A quick laser beam. */
class Laser implements Scene {
  private t = 0;
  constructor(
    private from: W,
    private to: W,
  ) {}
  update(dt: number) {
    this.t += dt;
    return this.t < 0.22;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const [ax, ay] = fx.screen(this.from);
    const [bx, by] = fx.screen(this.to);
    const a = 1 - this.t / 0.22;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,23,68,0.5)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.strokeStyle = '#ffebee';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

// ------------------------------------------------------------------ crazy disaster shows

export interface CrazyShow {
  type: string;
  center: W;
  pts: W[];
  R: number;
  seaDir: [number, number] | null;
  seaAt?: W | null;
}

/**
 * Adds the crazy disaster's animation to the timeline. Returns when (seconds) the map
 * should change, or null if `type` isn't a crazy disaster.
 */
export function playCrazy(fx: Effects, tl: Timeline, s: CrazyShow): number | null {
  const R = s.R;
  const any = () => fx.pick(s.pts.length ? s.pts : [s.center]);
  const around = (spread = 1): W => fx.offset(s.center, fx.between(-1, 1) * R * spread, fx.between(-0.8, 0.8) * R * spread);
  const edge = (): W => {
    const a = fx.rand() * Math.PI * 2;
    return fx.offset(s.center, Math.cos(a) * R * 1.35, Math.sin(a) * R * 1.0);
  };

  switch (s.type) {
    case 'zombies': {
      fx.puff(s.center, '#7cb342', R * 0.3, R * 1.2, 3.6, { alpha: 0.3, fadeIn: 0.4 });
      for (let i = 0; i < 14; i++) {
        const from = around(0.2);
        const to = i < 10 ? any() : around(1.05);
        fx.add(new Walker(from, to, fx.between(2.6, 3.3), '🧟', fx.between(26, 36), { delay: i * 0.1, gait: 'walk' }));
      }
      tl.every(0.3, 3.2, 0.12, () => fx.puff(around(0.9), fx.pick(['#9ccc65', '#7cb342', '#558b2f']), 6, 30, 1.6, { vy: -10, alpha: 0.45 }));
      tl.at(1.7, () => sound.play('groan'));
      return 1.8;
    }
    case 'aliens': {
      const spots = [s.center, any(), any()];
      spots.forEach((p, i) => fx.add(new Saucer(p, 3.3 - i * 0.25, i * 0.25, Math.max(70, Math.min(130, R * 0.7)))));
      tl.every(0.9, 2.8, 0.05, () =>
        fx.spawn(fx.pick(spots), { kind: 'glow', color: fx.pick(['#b2ff59', '#eeff41', '#69f0ae']), size: 4, size1: 1, life: 0.9, vy: -fx.between(40, 90), vx: fx.between(-10, 10), fadeIn: 0 }),
      );
      return 2.0;
    }
    case 'nuke': {
      fx.add(new Walker(fx.offset(s.center, 0, -R * 1.4), s.center, 0.6, '💣', 26, { gait: 'fall', noFlip: true, spin: 1.5 }));
      tl.at(0.62, () => {
        sound.play('bigBoom');
        sound.play('rumble');
        fx.spawn(s.center, { kind: 'glow', color: '#ffffff', size: 30, size1: R * 3.2, life: 0.7, alpha: 1, fadeIn: 0 });
        fx.spawn(s.center, { kind: 'glow', color: '#fff59d', size: 20, size1: R * 2, life: 1.1, alpha: 0.9, fadeIn: 0 });
        for (const [d, c] of [[0, 'rgba(255,255,255,0.95)'], [0.15, 'rgba(255,213,79,0.9)'], [0.3, 'rgba(255,138,101,0.8)']] as const) {
          fx.add(new Ring(s.center, 10, R * 1.6, 1.2, c, 5, d));
        }
        fx.add(new Mushroom(s.center, Math.max(80, Math.min(240, R * 1.2)), 3.1));
        let shook = 0;
        fx.add({
          update(dt, f) {
            shook += dt;
            f.shake(14 * Math.max(0, 1 - shook / 1.2));
            return shook < 1.2;
          },
        });
      });
      tl.every(0.9, 3.4, 0.08, () => fx.puff(around(1.1), fx.pick(['#6d4c41', '#8d6e63', '#757575']), 10, 50, 2, { vx: fx.between(-40, 40), alpha: 0.5 }));
      return 0.7;
    }
    case 'spiders': {
      for (let i = 0; i < 3; i++) fx.add(new Web(i === 0 ? s.center : any(), Math.max(30, Math.min(80, R * 0.4)), 3.5 - i * 0.2, i * 0.25));
      for (let i = 0; i < 28; i++) {
        fx.add(new Walker(edge(), fx.rand() < 0.7 ? any() : edge(), fx.between(1.8, 3.0), '🕷️', fx.between(13, 22), { delay: fx.between(0, 0.9), gait: 'scurry', noFlip: true }));
      }
      fx.add(new Walker(fx.offset(s.center, -R * 1.2, R * 0.2), fx.offset(s.center, R * 1.2, -R * 0.1), 3.5, '🕷️', Math.max(50, Math.min(90, R * 0.5)), { gait: 'scurry', noFlip: true }));
      return 1.8;
    }
    case 'kraken': {
      const dir = s.seaDir ?? [1, 0];
      const sea = s.seaAt ?? fx.offset(s.center, dir[0] * R * 1.15, dir[1] * R * 1.15);
      fx.add(new Riser(sea, '🐙', Math.max(60, Math.min(120, R * 0.7)), 3.4, 0.1));
      fx.add(new Riser(fx.offset(sea, -50, 30), '🦑', 34, 2.4, 0.7));
      fx.add(new Riser(fx.offset(sea, 55, 25), '🦑', 30, 2.2, 1.0));
      for (const d of [0.1, 0.5, 0.9, 1.6]) fx.add(new Ring(sea, 8, 90, 1.1, 'rgba(225,245,254,0.9)', 3, d));
      fx.add(new Waves(s.center, dir, R, 2, 1.2, 0.9));
      tl.at(0.5, () => sound.play('roar'));
      tl.every(0.6, 3.0, 0.07, () =>
        fx.spawn(fx.offset(sea, fx.between(-40, 40), 10), { kind: 'dot', color: fx.pick(['#ffffff', '#b3e5fc']), size: 2.4, size1: 0.6, life: 0.8, vy: -fx.between(80, 160), vx: fx.between(-40, 40), ay: 260, fadeIn: 0 }),
      );
      return 1.6;
    }
    case 'robots': {
      for (let i = 0; i < 12; i++) {
        const row = (i % 4) / 3 - 0.5;
        const from = fx.offset(s.center, -R * 1.35 - Math.floor(i / 4) * 34, row * R * 1.1);
        const to = fx.offset(s.center, R * 0.5 - Math.floor(i / 4) * 34, row * R * 1.1);
        fx.add(new Walker(from, to, 3.2, '🤖', fx.between(22, 28), { delay: Math.floor(i / 4) * 0.15, gait: 'march', noFlip: true }));
      }
      tl.every(0.5, 3.0, 0.2, () => {
        const to = any();
        fx.add(new Laser(fx.offset(s.center, -R * fx.between(0.4, 1.1), fx.between(-0.5, 0.5) * R), to));
        fx.explosion(to, 0.35);
        sound.play('laser');
      });
      return 1.8;
    }
    case 'dinosaurs': {
      for (let i = 0; i < 10; i++) {
        const y = fx.between(-0.7, 0.7) * R;
        const from = fx.offset(s.center, -R * 1.4, y);
        const to = fx.offset(s.center, R * 1.4, y + fx.between(-20, 20));
        fx.add(new Walker(from, to, fx.between(2.0, 2.6), fx.rand() < 0.6 ? '🦖' : '🦕', fx.between(34, 50), { delay: fx.between(0, 1.0), gait: 'hop' }));
      }
      tl.every(0.2, 3.2, 0.05, () => fx.puff(around(1), fx.pick(['#a1887f', '#bcaaa4', '#8d6e63']), 6, 34, 1.4, { vy: -10, alpha: 0.5 }));
      tl.every(0.2, 2.8, 0.016, () => fx.shake(3));
      tl.at(1.0, () => sound.play('roar'));
      return 1.6;
    }
    case 'spaghetti': {
      tl.every(0, 3.0, 0.1, () => fx.puff(fx.offset(s.center, fx.between(-1.2, 1.2) * R, -R * 1.15), fx.pick(['#e57373', '#ef9a9a', '#8d6e63']), 20, 60, 1.6, { alpha: 0.45, vx: 20 }));
      tl.every(0.2, 3.0, 0.035, () => {
        const land = fx.rand() < 0.7 ? fx.offset(any(), fx.between(-25, 25), fx.between(-20, 20)) : around(0.8);
        const [lx, ly] = fx.screen(land);
        const top = fx.host.toWorld(lx + fx.between(-30, 30), ly - R * 1.3);
        fx.add(
          new Walker(top, land, fx.between(0.55, 0.8), fx.rand() < 0.55 ? '🍝' : '🧆', fx.between(22, 32), {
            gait: 'fall', noFlip: true, spin: fx.between(-3, 3),
            onEnd: () => {
              fx.spawn(land, { kind: 'glow', color: '#e53935', size: 6, size1: 16, life: 0.6, alpha: 0.7, fadeIn: 0 });
              for (let i = 0; i < 4; i++) fx.spawn(land, { kind: 'dot', color: fx.pick(['#c62828', '#ffcc80']), size: 2, size1: 0.6, life: 0.5, vx: fx.between(-70, 70), vy: -fx.between(40, 110), ay: 300, fadeIn: 0 });
            },
          }),
        );
      });
      return 1.6;
    }
    case 'dragon': {
      const from = fx.offset(s.center, -R * 1.5, -R * 0.55);
      const to = fx.offset(s.center, R * 1.5, -R * 0.35);
      const life = 3.3;
      fx.add(new Walker(from, to, life, '🐉', Math.max(54, Math.min(90, R * 0.5)), { gait: 'fly' }));
      tl.every(0.4, 2.9, 0.018, (t) => {
        const k = t / life;
        const head: W = [lerp(from[0], to[0], k), lerp(from[1], to[1], k)];
        const mouth = fx.offset(head, 26, 14);
        fx.spawn(mouth, {
          kind: 'glow', color: fx.pick(['#ffd54f', '#ffab00', '#ff6d00', '#ff3d00']), size: fx.between(8, 14), size1: fx.between(18, 30),
          life: fx.between(0.5, 0.75), vx: fx.between(60, 140), vy: fx.between(130, 230), fadeIn: 0,
        });
      });
      tl.every(0.8, 3.4, 0.12, () => {
        const p = any();
        fx.spawn(p, { kind: 'glow', color: '#ff6d00', size: 10, size1: 28, life: 1.2, alpha: 0.6 });
        fx.puff(fx.offset(p, 0, -10), '#424242', 8, 36, 1.8, { vy: -25, alpha: 0.55 });
      });
      tl.at(0.3, () => sound.play('roar'));
      return 1.8;
    }
    case 'blackhole': {
      fx.add(new BlackHole(s.center, Math.max(90, Math.min(260, R * 1.2)), 3.7));
      tl.every(0.4, 3.0, 0.02, () => {
        const a = fx.rand() * Math.PI * 2;
        const d = R * fx.between(0.6, 1.3);
        const p = fx.offset(s.center, Math.cos(a) * d, Math.sin(a) * d * 0.6);
        fx.spawn(p, { kind: 'streak', color: fx.pick(['rgba(206,147,216,0.8)', 'rgba(255,183,77,0.8)']), size: 14, life: 0.5, vx: -Math.cos(a) * d * 1.8, vy: -Math.sin(a) * d * 1.1, fadeIn: 0 });
      });
      return 2.0;
    }
  }
  return null;
}

// ------------------------------------------------------------------ the Titanic (secret)

/** Real places, [longitude, latitude]. */
export const TITANIC_ROUTE: [number, number][] = [
  [-1.4, 50.9], // Southampton, England (left 10 April 1912)
  [-1.0, 50.45],
  [-1.62, 49.65], // Cherbourg, France
  [-4.5, 50.1],
  [-8.3, 51.78], // Queenstown (Cobh), Ireland
  [-12, 51.3],
  [-25, 48.4],
  [-40, 44.0],
  [-49.95, 41.73], // where it struck the iceberg, 14 April 1912
];

/** The great ship: black hull, white decks, four buff funnels. Draws facing right. */
function drawLiner(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, alpha: number, flip: boolean) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(flip ? -s : s, s);
  ctx.lineJoin = 'round';
  // Hull
  ctx.fillStyle = '#1b1b1b';
  ctx.beginPath();
  ctx.moveTo(-26, -3);
  ctx.lineTo(27, -4);
  ctx.lineTo(23, 4);
  ctx.lineTo(-23, 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#b71c1c';
  ctx.fillRect(-22, 2.6, 45, 1.6);
  // Decks
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(-20, -6.5, 38, 3.6);
  // Funnels
  for (let i = 0; i < 4; i++) {
    const fx = -14 + i * 8.5;
    ctx.fillStyle = '#e0a84a';
    ctx.fillRect(fx, -13, 4, 7);
    ctx.fillStyle = '#111';
    ctx.fillRect(fx, -13.5, 4, 1.8);
  }
  // Masts
  ctx.strokeStyle = '#6d4c41';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-23, -3);
  ctx.lineTo(-23, -15);
  ctx.moveTo(22, -4);
  ctx.lineTo(22, -16);
  ctx.stroke();
  ctx.restore();
}

function drawIceberg(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(178,235,242,0.45)'; // the big part under water
  ctx.beginPath();
  ctx.ellipse(0, 6, 20, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createLinearGradient(-12, -20, 12, 4);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#b3e5fc');
  ctx.fillStyle = g;
  ctx.strokeStyle = '#81d4fa';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-14, 4);
  ctx.lineTo(-9, -8);
  ctx.lineTo(-4, -5);
  ctx.lineTo(1, -19);
  ctx.lineTo(7, -9);
  ctx.lineTo(11, -12);
  ctx.lineTo(15, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * About 5.5 seconds: the ship sails from Southampton, past Cherbourg and Queenstown, across
 * the Atlantic, strikes the iceberg, and sinks. Nothing stays on the map afterwards.
 */
export class TitanicScene implements Scene {
  private t = 0;
  private sailEnd = 3.3;
  private life = 6.2;
  private lengths: number[] = [];
  private hit = false;
  constructor(
    private route: W[],
    private onDone: () => void,
  ) {
    let total = 0;
    this.lengths.push(0);
    for (let i = 1; i < route.length; i++) {
      total += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
      this.lengths.push(total);
    }
  }
  /** Position (world) and heading (radians) after travelling fraction `k` of the route. */
  private at(k: number): { p: W; dir: number } {
    const total = this.lengths[this.lengths.length - 1];
    const d = clamp01(k) * total;
    let i = 1;
    while (i < this.lengths.length - 1 && this.lengths[i] < d) i++;
    const a = this.route[i - 1];
    const b = this.route[i];
    const seg = this.lengths[i] - this.lengths[i - 1] || 1;
    const f = (d - this.lengths[i - 1]) / seg;
    return { p: [lerp(a[0], b[0], f), lerp(a[1], b[1], f)], dir: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  }
  update(dt: number, fx: Effects) {
    this.t += dt;
    const sailing = this.t < this.sailEnd;
    const k = Math.min(1, this.t / this.sailEnd);
    const { p } = this.at(k * k * (3 - 2 * k) * 0.25 + k * 0.75); // eases out of port
    if (sailing) {
      // Wake behind the ship and smoke from the funnels
      if (fx.rand() < 0.5) fx.spawn(p, { kind: 'dot', color: '#e1f5fe', size: 1.6, size1: 0.3, life: 1.0, fadeIn: 0 });
      if (fx.rand() < 0.35) fx.puff(fx.offset(p, 0, -12), '#616161', 2, 9, 1.1, { vy: -14, vx: 10, alpha: 0.5 });
    }
    if (!this.hit && this.t >= this.sailEnd) {
      this.hit = true;
      sound.play('crash');
      const end = this.route[this.route.length - 1];
      fx.add(new Ring(end, 4, 50, 0.9, 'rgba(255,255,255,0.9)', 3));
      fx.add(new Ring(end, 4, 34, 0.9, 'rgba(179,229,252,0.9)', 2, 0.2));
      for (let i = 0; i < 14; i++) {
        fx.spawn(end, { kind: 'dot', color: fx.pick(['#ffffff', '#b3e5fc', '#e1f5fe']), size: 2.4, size1: 0.6, life: 0.8, vx: fx.between(-90, 90), vy: -fx.between(60, 150), ay: 280, fadeIn: 0 });
      }
      let shook = 0;
      fx.add({
        update(d, f) {
          shook += d;
          f.shake(5 * Math.max(0, 1 - shook / 0.5));
          return shook < 0.5;
        },
      });
    }
    if (this.hit && this.t < this.sailEnd + 2.4 && fx.rand() < 0.4) {
      const end = this.route[this.route.length - 1];
      fx.spawn(fx.offset(end, fx.between(-10, 10), fx.between(-2, 4)), { kind: 'dot', color: '#e1f5fe', size: 1.8, size1: 0.5, life: 0.7, vy: -fx.between(10, 30), fadeIn: 0 });
    }
    if (this.t >= this.life) {
      this.onDone();
      return false;
    }
    return true;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const zoomPx = Math.max(0.8, Math.min(1.5, fx.width / 900)); // ship size on screen
    const end = this.route[this.route.length - 1];
    const [ix, iy] = fx.screen(end);
    const fadeAll = clamp01((this.life - this.t) / 0.6);
    // Iceberg: appears as the ship nears it, stays a moment after the sinking, then fades.
    const iceIn = clamp01((this.t - 1.4) / 0.6);
    // Just west of the ship's last position, so the bow meets it at the real spot.
    drawIceberg(ctx, ix - 30 * zoomPx, iy - 1, zoomPx * 1.1, iceIn * fadeAll);

    // Caption
    ctx.save();
    ctx.font = `600 ${Math.round(13 * Math.max(0.9, zoomPx))}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 4;
    const start = fx.screen(this.route[0]);
    const capA = clamp01(this.t / 0.4) * clamp01((2.0 - this.t) / 0.4);
    if (capA > 0) {
      ctx.globalAlpha = capA;
      ctx.fillText('Southampton · 10 April 1912', start[0], start[1] + 30);
    }
    const capB = clamp01((this.t - this.sailEnd) / 0.3) * fadeAll;
    if (capB > 0) {
      ctx.globalAlpha = capB;
      ctx.fillText('14 April 1912', ix, iy + 34 * zoomPx + 8);
    }
    ctx.restore();

    // The ship
    if (this.t < this.sailEnd) {
      const k = Math.min(1, this.t / this.sailEnd);
      const { p, dir } = this.at(k * k * (3 - 2 * k) * 0.25 + k * 0.75);
      const [x, y] = fx.screen(p);
      const flip = Math.cos(dir) < 0;
      drawLiner(ctx, x, y + Math.sin(this.t * 3) * 0.6, zoomPx, Math.sin(dir) * 0.25 * (flip ? -1 : 1), Math.min(1, this.t / 0.3), flip);
    } else {
      // Sinking: tips bow-first, slides under, gone.
      const k = clamp01((this.t - this.sailEnd - 0.4) / 2.0);
      if (k < 1) {
        const [x, y] = fx.screen(end);
        ctx.save();
        // Only the part above the waterline shows.
        ctx.beginPath();
        ctx.rect(x - 90, y - 90, 180, 90 + 4 * zoomPx);
        ctx.clip();
        drawLiner(ctx, x - 6 * zoomPx, y + k * 22 * zoomPx, zoomPx, -k * 0.9, 1 - k * 0.4, true);
        ctx.restore();
      }
    }
  }
}
