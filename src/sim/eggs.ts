/**
 * Secret scene (search "messi"): over Argentina, a little football pitch appears, a cartoon
 * star player in a striped sky-blue-and-white shirt with the number 10 dribbles in, scores,
 * and the crowd goes wild. ~5.5 s; nothing is saved and nothing stays on the map.
 *
 * The player is a generic cartoon footballer (no real person's face or name).
 */
import { Timeline, type Effects, type Scene, type W } from './effects';
import { sound } from '../audio/sound';
import { drawEmoji } from '../utils/emoji';

const SKY = '#75aadb';
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - t) ** 2;

export class SoccerScene implements Scene {
  private t = 0;
  private life = 5.6;
  private tl: Timeline;
  private crowd: { x: number; row: number; color: string; seed: number }[] = [];
  constructor(
    _at: W,
    private onDone: () => void,
  ) {
    const colors = [SKY, '#ffffff', SKY, '#ffd34d', '#ffffff', SKY, '#f4a3a3', '#cfd8dc'];
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 22; i++) this.crowd.push({ x: (i + (row % 2) * 0.5) / 21.5, row, color: colors[(i * 3 + row) % colors.length], seed: Math.random() * 6 });
    this.tl = new Timeline(this.life);
  }

  update(dt: number, fx: Effects) {
    if (this.t === 0) {
      const tl = this.tl;
      tl.at(1.6, () => sound.play('kick'));
      tl.at(2.35, () => {
        sound.play('cheer');
        const k = this.k(fx);
        const c = fx.host.toWorld(fx.width / 2, Math.max(fx.height * 0.56, 230 * k));
        const goal = fx.offset(c, 165 * k, -10 * k);
        fx.confetti(goal, [SKY, '#ffffff', '#ffd34d', SKY], 50);
        fx.firework(fx.offset(c, -60 * k, -150 * k), [SKY, '#ffffff', '#ffd34d'], 1);
      });
      tl.at(2.9, () => {
        const k = this.k(fx);
        const c = fx.host.toWorld(fx.width / 2, Math.max(fx.height * 0.56, 230 * k));
        fx.firework(fx.offset(c, 80 * k, -160 * k), [SKY, '#ffffff', '#ffd34d'], 1.1);
      });
      tl.every(2.4, 4.6, 0.12, () => {
        const k = this.k(fx);
        const c = fx.host.toWorld(fx.width / 2, Math.max(fx.height * 0.56, 230 * k));
        const p = fx.offset(c, fx.between(-170, 170) * k, -fx.between(95, 125) * k);
        fx.spawn(p, { kind: 'confetti', color: fx.pick([SKY, '#ffffff', '#ffd34d']), size: 5, life: 1.4, vy: -fx.between(60, 120), vx: fx.between(-40, 40), ay: 160, vr: fx.between(-8, 8) });
      });
    }
    this.t += dt;
    this.tl.update(dt);
    if (this.t >= this.life) {
      this.onDone();
      return false;
    }
    return true;
  }

  private k(fx: Effects) {
    return Math.max(0.6, Math.min(1.25, fx.width / 950));
  }

  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const k = this.k(fx);
    // The camera has flown to Argentina: put the pitch in the middle of the screen.
    const cx = Math.min(fx.width - 180 * k - 8, Math.max(fx.width / 2, 112 + 180 * k)); // clear of the toolbar on phones
    const cy = Math.max(fx.height * 0.56, 230 * k);
    const t = this.t;
    const alpha = Math.min(1, t / 0.4, (this.life - t) / 0.6);
    const W = 360 * k;
    const H = 170 * k;
    const left = cx - W / 2;
    const top = cy - H / 2;
    const ground = top + H * 0.72; // where the players' feet are
    const goalX = left + W - 22 * k;
    const scored = t >= 2.35;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);

    // Stands with the crowd (they bounce and wave after the goal)
    const standTop = top - 62 * k;
    ctx.fillStyle = '#37474f';
    roundRect(ctx, left - 10 * k, standTop, W + 20 * k, 66 * k, 12 * k);
    ctx.fill();
    for (const c of this.crowd) {
      const jump = scored ? Math.abs(Math.sin(t * 9 + c.seed)) * 6 * k : Math.abs(Math.sin(t * 2 + c.seed)) * 1.2 * k;
      const x = left + c.x * W;
      const y = standTop + (14 + c.row * 18) * k - jump;
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.ellipse(x, y + 7 * k, 5.5 * k, 4 * k, 0, 0, Math.PI * 2); // shoulders
      ctx.fill();
      ctx.fillStyle = '#f1c7a0';
      ctx.beginPath();
      ctx.arc(x, y, 3.6 * k, 0, Math.PI * 2);
      ctx.fill();
      if (scored && (c.seed > 3)) {
        ctx.strokeStyle = '#f1c7a0';
        ctx.lineWidth = 1.6 * k;
        ctx.beginPath();
        ctx.moveTo(x - 4 * k, y + 5 * k);
        ctx.lineTo(x - 6 * k, y - 4 * k - jump * 0.3);
        ctx.moveTo(x + 4 * k, y + 5 * k);
        ctx.lineTo(x + 6 * k, y - 4 * k - jump * 0.3);
        ctx.stroke();
      }
    }

    // Pitch: striped grass and white lines
    ctx.save();
    roundRect(ctx, left, top, W, H, 14 * k);
    ctx.clip();
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#43a047' : '#388e3c';
      ctx.fillRect(left + (i * W) / 8, top, W / 8 + 1, H);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2 * k;
    roundRect(ctx, left + 6 * k, top + 6 * k, W - 12 * k, H - 12 * k, 8 * k);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, top + 6 * k);
    ctx.lineTo(cx, top + H - 6 * k);
    ctx.moveTo(cx + 22 * k, cy);
    ctx.arc(cx, cy, 22 * k, 0, Math.PI * 2);
    ctx.stroke();

    // Goal (the net bulges when the ball goes in)
    const bulge = scored ? Math.sin(clamp01((t - 2.35) / 0.5) * Math.PI) * 8 * k : 0;
    const gTop = ground - 62 * k;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1 * k;
    for (let i = 0; i <= 6; i++) {
      const y = gTop + (i * 62 * k) / 6;
      ctx.beginPath();
      ctx.moveTo(goalX, y);
      ctx.quadraticCurveTo(goalX + 14 * k + bulge, y, goalX + 16 * k + bulge * 0.6, y + 4 * k);
      ctx.stroke();
    }
    for (let i = 0; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(goalX + i * 4 * k + (bulge * i) / 3, gTop);
      ctx.lineTo(goalX + i * 4 * k + (bulge * i) / 3, ground);
      ctx.stroke();
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5 * k;
    ctx.beginPath();
    ctx.moveTo(goalX, ground);
    ctx.lineTo(goalX, gTop);
    ctx.lineTo(goalX + 16 * k, gTop + 4 * k);
    ctx.stroke();

    // The player: dribbles in (0.2–1.5 s), kicks (1.5–1.8 s), celebrates.
    const runK = clamp01((t - 0.2) / 1.3);
    const startX = left + 30 * k;
    const kickX = cx - 10 * k;
    let px = lerp(startX, kickX, easeOut(runK));
    let mode: 'run' | 'kick' | 'cheer' = 'run';
    if (t >= 1.5) mode = 'kick';
    if (t >= 2.35) {
      mode = 'cheer';
      px = kickX + Math.min(1, (t - 2.35) / 0.8) * 30 * k; // runs to the crowd
    }
    const hop = mode === 'cheer' ? Math.abs(Math.sin((t - 2.35) * 7)) * 12 * k : 0;
    drawPlayer(ctx, px, ground - hop, k * 1.35, t, mode);

    // The ball: at his feet while dribbling, then a curling shot into the goal.
    let bx: number;
    let by: number;
    if (t < 1.6) {
      bx = px + 16 * k + Math.abs(Math.sin(t * 9)) * 3 * k;
      by = ground - 4 * k;
    } else {
      const f = clamp01((t - 1.6) / 0.75);
      bx = lerp(kickX + 14 * k, goalX + 8 * k, f);
      by = lerp(ground - 5 * k, ground - 34 * k, f) - Math.sin(f * Math.PI) * 40 * k;
      if (t > 2.35) {
        bx = goalX + 8 * k + bulge * 0.5;
        by = ground - 6 * k - Math.max(0, 20 - (t - 2.35) * 40) * k;
      }
    }
    drawBall(ctx, bx, by, 6.5 * k, t * (t < 1.6 ? 10 : 22));

    // "GOOOL!" and cheering hands
    if (scored) {
      const g = clamp01((t - 2.35) / 0.35);
      const s = 0.4 + 0.6 * easeOut(g) + Math.sin(t * 6) * 0.03;
      ctx.save();
      ctx.translate(cx, top - 88 * k);
      ctx.scale(s, s);
      ctx.font = `${Math.round(52 * k)}px 'Lilita One', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 8 * k;
      ctx.strokeStyle = '#123';
      ctx.strokeText('GOOOOL!', 0, 0);
      ctx.fillStyle = '#ffd34d';
      ctx.fillText('GOOOOL!', 0, 0);
      ctx.restore();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + t;
        drawEmoji(ctx, i % 2 ? '🙌' : '🎉', cx + Math.cos(a) * (W * 0.62), top + H * 0.35 + Math.sin(a) * H * 0.75, 24 * k, { alpha: g });
      }
    }
    ctx.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A cartoon footballer facing right, feet at (x, ground). */
function drawPlayer(ctx: CanvasRenderingContext2D, x: number, ground: number, k: number, t: number, mode: 'run' | 'kick' | 'cheer') {
  const hipY = ground - 20 * k;
  const shoulderY = ground - 42 * k;
  const skin = '#f1c7a0';
  ctx.save();
  ctx.lineCap = 'round';
  // Legs (socks + boots)
  const swing = mode === 'run' ? Math.sin(t * 16) * 0.7 : mode === 'cheer' ? Math.sin(t * 14) * 0.3 : 0;
  const legs: number[] = mode === 'kick' ? [-0.35, 1.25 - Math.max(0, t - 1.7) * 3] : [swing, -swing];
  legs.forEach((a, i) => {
    const fx = x + Math.sin(a) * 20 * k;
    const fy = hipY + Math.cos(a) * 20 * k;
    ctx.strokeStyle = i ? '#f5f5f5' : '#e0e0e0';
    ctx.lineWidth = 5 * k;
    ctx.beginPath();
    ctx.moveTo(x, hipY);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    ctx.fillStyle = '#212121';
    ctx.beginPath();
    ctx.ellipse(fx + 2 * k, fy, 4 * k, 2.4 * k, a * 0.3, 0, Math.PI * 2);
    ctx.fill();
  });
  // Shorts
  ctx.fillStyle = '#1a237e';
  ctx.fillRect(x - 7 * k, hipY - 6 * k, 14 * k, 9 * k);
  // Arms (up high when celebrating)
  ctx.strokeStyle = skin;
  ctx.lineWidth = 4 * k;
  const armUp = mode === 'cheer';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + side * 6 * k, shoulderY + 3 * k);
    if (armUp) ctx.lineTo(x + side * 11 * k, shoulderY - 15 * k + Math.sin(t * 14 + side) * 2 * k);
    else ctx.lineTo(x + side * 9 * k + Math.sin(t * 16) * side * 4 * k, shoulderY + 17 * k);
    ctx.stroke();
  }
  // Shirt: sky-blue and white stripes, number 10
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 8 * k, shoulderY, 16 * k, 20 * k);
  ctx.clip();
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : SKY;
    ctx.fillRect(x - 8 * k + i * 3.2 * k, shoulderY, 3.3 * k, 20 * k);
  }
  ctx.restore();
  ctx.fillStyle = '#0d1b4a';
  ctx.font = `800 ${Math.round(8 * k)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('10', x, shoulderY + 10 * k);
  // Head: a simple cartoon face with short brown hair
  const hy = shoulderY - 9 * k;
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x + 1 * k, hy, 8 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5d4037';
  ctx.beginPath();
  ctx.arc(x + 1 * k, hy - 1.5 * k, 8.2 * k, Math.PI * 1.02, Math.PI * 1.98);
  ctx.fill();
  ctx.fillStyle = '#212121';
  ctx.beginPath();
  ctx.arc(x + 4.5 * k, hy, 1.1 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6d4c41';
  ctx.lineWidth = 1.2 * k;
  ctx.beginPath();
  if (mode === 'cheer') ctx.arc(x + 4 * k, hy + 3.2 * k, 2.4 * k, 0, Math.PI); // big open smile
  else ctx.arc(x + 4 * k, hy + 2.6 * k, 1.8 * k, 0.2, Math.PI - 0.6);
  ctx.stroke();
  ctx.restore();
}
