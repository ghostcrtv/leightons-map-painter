/**
 * The short "shows" played on the map: a conflict (~4.5 s) and each natural disaster (~3.5 s).
 * Each show calls `climax` at the dramatic moment (that's when the map actually changes)
 * and `done` at the end.
 */
import {
  Cone, Cracks, Crater, type Effects, type Scene, FlagPop, Hurricane, Jet, Meteor, Missile, Ring, Ship, Sun, Tank, Timeline, Tornado, Waves, type W,
} from './effects';
import { DISASTER_SOUND, sound } from '../audio/sound';
import type { ConflictOutcome } from './conflict';
import { playCrazy, Walker } from './crazy';
import {
  Countdown, Crumble, Darken, Dogfight, Flash, FlagRaise, Frost, Lightning, RisingWater, Stamp, TugBar, Tumbleweed, Warning, Whirl, impactBlast,
  type ActionLevel,
} from './action';
import { severityWord } from './disasters';

export interface BattleShow {
  /** Points on each side's land near the fighting (world units). */
  aPts: W[];
  bPts: W[];
  aColor: string;
  bColor: string;
  /** Share of missiles fired by A (0–1): the stronger side fires more. */
  aFire: number;
  outcome: ConflictOutcome;
  /** 'a' or 'b' won (not for peace). */
  winner?: 'a' | 'b';
  /** Where the land is taken (partial), or the loser's middle (conquest). */
  target: W;
  /** Size of the area taken, in screen px (partial). */
  targetPx: number;
  /** Extra points on the loser's land (conquest barrage). */
  loserPts: W[];
  winnerFlag: HTMLImageElement | null;
  winnerColors: string[];
  /** Sea near each side's front (warships appear there). */
  aSea?: W[];
  bSea?: W[];
  climax: () => void;
  done: () => void;
  /** How big the show is (Settings → Action level). Missing = calm (the original show). */
  level?: ActionLevel;
  /** A full show (not inside a fast year / world war): countdown, tug-of-war bar, stamps. */
  full?: boolean;
  aFlag?: HTMLImageElement | null;
  bFlag?: HTMLImageElement | null;
  upset?: boolean;
}

export const BATTLE_FIGHT_SECONDS = 2.7;

/** Battle show: with Normal/Epic action, a countdown while both armies march to the front first. */
export function playBattle(fx: Effects, s: BattleShow) {
  const level = s.level ?? 'calm';
  if (level === 'calm' || !s.full) {
    playBattleMain(fx, s, level);
    return;
  }
  sound.play('drumroll');
  marchArmies(fx, s, 2.2);
  fx.add(new Countdown(() => playBattleMain(fx, s, level)));
}

/** Little soldiers march from deep inside each country toward the front, behind their flag. */
function marchArmies(fx: Effects, s: BattleShow, life: number) {
  const sides: [W[], W | undefined, HTMLImageElement | null | undefined][] = [
    [s.aPts, s.bPts[0], s.aFlag],
    [s.bPts, s.aPts[0], s.bFlag],
  ];
  for (const [pts, enemy, flag] of sides) {
    const front = pts[0];
    if (!front || !enemy) continue;
    // March in from well behind the front line (away from the enemy), stopping just short of it.
    const [fx0, fy0] = fx.screen(front);
    const [ex, ey] = fx.screen(enemy);
    const len = Math.hypot(fx0 - ex, fy0 - ey) || 1;
    const ux = (fx0 - ex) / len;
    const uy = (fy0 - ey) / len;
    const back = fx.host.toWorld(fx0 + ux * 150, fy0 + uy * 150);
    const stop = fx.host.toWorld(fx0 + ux * 22, fy0 + uy * 22);
    for (let i = 0; i < 7; i++) {
      const row = Math.floor(i / 3);
      const col = (i % 3) - 1;
      const from = fx.offset(back, col * 12 - row * 6, col * 6 + row * 12);
      const to = fx.offset(stop, col * 12 - row * 6, col * 6 + row * 12);
      fx.add(new Walker(from, to, life, '💂', 16, { gait: 'march', noFlip: true, delay: row * 0.1 }));
    }
    fx.add(new MarchFlag(fx.offset(back, 22, -10), fx.offset(stop, 22, -10), life, flag ?? null));
  }
}

/** A small flag on a pole, carried along. */
class MarchFlag implements Scene {
  private t = 0;
  constructor(
    private from: W,
    private to: W,
    private life: number,
    private img: HTMLImageElement | null,
  ) {}
  update(dt: number) {
    this.t += dt;
    return this.t < this.life;
  }
  draw(ctx: CanvasRenderingContext2D, fx: Effects) {
    const k = Math.min(1, this.t / this.life);
    const [ax, ay] = fx.screen(this.from);
    const [bx, by] = fx.screen(this.to);
    const x = ax + (bx - ax) * k;
    const y = ay + (by - ay) * k - Math.abs(Math.sin(this.t * 10)) * 2;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.t / 0.2, (this.life - this.t) / 0.3);
    ctx.strokeStyle = '#eeeeee';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + 12);
    ctx.lineTo(x, y - 18);
    ctx.stroke();
    if (this.img?.complete && this.img.naturalWidth) ctx.drawImage(this.img, x + 1, y - 18 + Math.sin(this.t * 8) * 1.2, 22, 15);
    ctx.restore();
  }
}

function playBattleMain(fx: Effects, s: BattleShow, level: ActionLevel) {
  const fight = BATTLE_FIGHT_SECONDS;
  const fancy = level !== 'calm';
  const epic = level === 'epic';
  const tl = new Timeline((s.outcome === 'peace' ? 4.6 : 4.8) + (level !== 'calm' && s.full ? 0.9 : 0), s.done);
  const fire = (fromA: boolean, k = 1.25, to?: W, dur?: number) => {
    const from = fx.pick(fromA ? s.aPts : s.bPts);
    const target = to ?? fx.pick(fromA ? s.bPts : s.aPts);
    fx.add(new Missile(from, target, dur ?? fx.between(0.7, 1.0), fromA ? s.aColor : s.bColor, k));
  };
  // Tanks roll toward the front, jets fly over, warships fire from the sea.
  const aFront = s.aPts[0];
  const bFront = s.bPts[0];
  if (aFront && bFront) {
    const far = (pts: W[], from: W) => [...pts].sort((p, q) => (q[0] - from[0]) ** 2 + (q[1] - from[1]) ** 2 - ((p[0] - from[0]) ** 2 + (p[1] - from[1]) ** 2));
    const aBack = far(s.aPts, bFront).slice(0, 3);
    const bBack = far(s.bPts, aFront).slice(0, 3);
    aBack.slice(0, s.aFire >= 0.5 ? 3 : 2).forEach((p, i) => fx.add(new Tank(p, bFront, fight * 0.8, s.aColor, 0.1 + i * 0.35)));
    bBack.slice(0, s.aFire < 0.5 ? 3 : 2).forEach((p, i) => fx.add(new Tank(p, aFront, fight * 0.8, s.bColor, 0.25 + i * 0.35)));
    fx.add(new Jet(fx.pick(aBack.length ? aBack : [aFront]), bFront, 1.4, s.aColor, 0.6));
    fx.add(new Jet(fx.pick(bBack.length ? bBack : [bFront]), aFront, 1.4, s.bColor, 1.5));
    if (s.aSea?.length) fx.add(new Ship(s.aSea[0], s.bPts, fight, s.aColor, bFront[0] >= s.aSea[0][0] ? 1 : -1));
    if (s.bSea?.length) fx.add(new Ship(s.bSea[0], s.aPts, fight, s.bColor, aFront[0] >= s.bSea[0][0] ? 1 : -1));
  }

  const mid0: W = midpoint(s.aPts, s.bPts);
  if (fancy) {
    fx.add(new Dogfight(mid0, s.aColor, s.bColor, fight, 0.2));
    if (s.full) {
      fx.add(new TugBar({ img: s.aFlag ?? null, color: s.aColor }, { img: s.bFlag ?? null, color: s.bColor }, s.outcome === 'peace' ? null : s.winner ?? null, fight + 0.85, fight + 3.6, s.aFire));
    }
    tl.every(0.2, fight, epic ? 0.22 : 0.4, () => {
      const p = fx.pick([...s.aPts, ...s.bPts]);
      fx.explosion(fx.offset(p, fx.between(-16, 16), fx.between(-14, 14)), fx.between(0.6, 1.1));
    });
  }
  if (epic && aFront && bFront) {
    // helicopters hover in from both sides
    const heli = (from: W, to: W, d: number) => fx.add(new Walker(fx.offset(from, 0, -50), fx.offset(to, 0, -60), fight * 0.9, '🚁', 24, { gait: 'fly', delay: d }));
    heli(s.aPts[s.aPts.length - 1] ?? aFront, aFront, 0.3);
    heli(s.bPts[s.bPts.length - 1] ?? bFront, bFront, 0.6);
    // paratroopers drop in over the land being taken
    if (s.outcome !== 'peace') {
      for (let i = 0; i < 6; i++) {
        const land = fx.offset(s.target, fx.between(-0.7, 0.7) * Math.max(30, s.targetPx), fx.between(-0.5, 0.5) * Math.max(24, s.targetPx));
        fx.add(new Walker(fx.offset(land, fx.between(-20, 20), -150), land, fx.between(1.6, 2.1), '🪂', 20, { gait: 'drift', noFlip: true, delay: fight - 1.5 + i * 0.15 }));
      }
    }
  }

  // The fight: missiles both ways, more from the stronger side.
  tl.every(0, fight, 0.16, () => fire(fx.rand() < s.aFire));
  // Shelling along the front.
  tl.every(0.3, fight, 0.28, () => {
    const p = fx.pick(fx.rand() < 0.5 ? s.aPts : s.bPts);
    fx.explosion(fx.offset(p, fx.between(-12, 12), fx.between(-12, 12)), 0.6);
  });
  tl.every(0.4, fight + 0.6, 0.35, () => {
    const p = fx.pick([...s.aPts, ...s.bPts]);
    fx.puff(p, '#4a4a4a', 8, 40, 2.2, { vy: -14, vx: 8, alpha: 0.55, fadeIn: 0.3 });
  });

  const mid: W = midpoint(s.aPts, s.bPts);
  if (s.outcome === 'peace') {
    tl.at(fight + 0.35, () => {
      s.climax();
      fx.doves(mid, 9);
      if (fancy) {
        fx.add(new Walker(mid, fx.offset(mid, 0, -46), 2.4, '🏳️', 44, { gait: 'fly', noFlip: true }));
        if (s.full) fx.add(new Stamp('PEACE!', '#90caf9', 0.2, 1.6));
      }
    });
  } else {
    const winA = s.winner === 'a';
    const k = s.outcome === 'conquest' ? 1.5 : 1.3;
    // Final barrage at the land being taken.
    const shots = s.outcome === 'conquest' ? 9 : 6;
    for (let i = 0; i < shots; i++) {
      tl.at(fight - 0.1 + i * 0.05, () => {
        const to =
          s.outcome === 'conquest' && s.loserPts.length
            ? fx.pick(s.loserPts)
            : fx.offset(s.target, fx.between(-0.6, 0.6) * s.targetPx, fx.between(-0.6, 0.6) * s.targetPx);
        fire(winA, k, to, 0.75);
      });
    }
    if (epic && s.full) tl.at(fight - 0.15, () => fx.slowMo(0.9, 0.35)); // the final barrage in slow motion
    tl.at(fight + 0.85, () => {
      s.climax();
      const colors = [...s.winnerColors, '#ffd34d', '#ffffff'];
      fx.add(new Ring(s.target, 10, Math.max(60, s.targetPx * 1.1), 0.7, 'rgba(255,255,255,0.9)', 4));
      if (fancy) {
        fx.add(new FlagRaise(s.target, s.winnerFlag, s.winnerColors[0] ?? '#ffd34d', 2.8));
        sound.play('trumpet');
        fx.explosion(s.target, 1.6);
        if (epic) {
          const [px, py] = fx.screen(s.target);
          fx.punch(0.1, px, py);
        }
        if (s.full) {
          const text = s.upset ? 'UPSET!' : s.outcome === 'conquest' ? 'CONQUERED!' : 'VICTORY!';
          fx.add(new Stamp(text, s.upset ? '#ff5252' : s.outcome === 'conquest' ? '#ffd34d' : '#69f0ae', 0.35));
        }
      } else fx.add(new FlagPop(s.target, s.winnerFlag, s.winnerColors[0] ?? '#ffd34d', 1.6));
      fx.confetti(s.target, colors);
      if (s.outcome === 'conquest') {
        for (let i = 0; i < 3; i++) {
          tl.at(fight + 1.0 + i * 0.25, () => {
            const p = s.loserPts.length ? fx.pick(s.loserPts) : s.target;
            fx.firework(fx.offset(p, 0, -40), colors, 0.9);
          });
        }
      }
    });
  }
  fx.add(tl);
}

function midpoint(a: W[], b: W[]): W {
  const all = [...a.slice(0, 4), ...b.slice(0, 4)];
  if (!all.length) return [0, 0];
  return [all.reduce((s, p) => s + p[0], 0) / all.length, all.reduce((s, p) => s + p[1], 0) / all.length];
}

export interface DisasterShow {
  type: string;
  /** Middle of the country (world). */
  center: W;
  /** Points spread over the country's land (world). */
  pts: W[];
  /** Rough size of the country on screen, in px (radius). */
  R: number;
  /** Unit vector from the land toward the nearest sea (tsunamis). */
  seaDir: [number, number] | null;
  /** A point out at sea near the country (world), if there is one. */
  seaAt?: W | null;
  climax: () => void;
  done: () => void;
  level?: ActionLevel;
  /** A full show: a warning first (siren, darker sky, ⚠️) and the EXTREME stamp. */
  full?: boolean;
  /** 0–0.6: how bad it is (bigger = more of everything). */
  severity?: number;
}

export const DISASTER_SECONDS = 3.8;
const WARNING_SECONDS = 1.1;

/** Disaster show: with Normal/Epic action, a warning first (darker sky, siren, ⚠️). */
export function playDisaster(fx: Effects, s: DisasterShow) {
  const level = s.level ?? 'calm';
  if (level === 'calm' || !s.full) {
    playDisasterMain(fx, s, level);
    return;
  }
  fx.add(new Darken(WARNING_SECONDS + DISASTER_SECONDS + 0.2));
  fx.add(new Warning(s.center, WARNING_SECONDS));
  fx.add(new Timeline(WARNING_SECONDS, () => playDisasterMain(fx, s, level)));
}

function playDisasterMain(fx: Effects, s: DisasterShow, level: ActionLevel) {
  const R = s.R;
  const tl = new Timeline(DISASTER_SECONDS, s.done);
  for (const name of DISASTER_SOUND[s.type] ?? []) sound.play(name);
  const any = () => fx.pick(s.pts.length ? s.pts : [s.center]);
  const around = (spread = 1): W => fx.offset(s.center, fx.between(-1, 1) * R * spread, fx.between(-0.8, 0.8) * R * spread);
  let climaxAt = 1.6;

  switch (s.type) {
    case 'earthquake': {
      let amp = 0;
      tl.every(0.15, 2.1, 0.016, (t) => {
        amp = 11 * Math.max(0, 1 - (t - 0.15) / 1.95);
        fx.shake(amp);
      });
      tl.at(0.2, () => fx.add(new Cracks(s.center, fx.rand, 7, R * 0.9, 'rgba(45,25,12,0.9)', 3, 1.0, 3.5)));
      for (const d of [0.2, 0.6, 1.0]) fx.add(new Ring(s.center, 6, R * 1.1, 1.1, 'rgba(255,214,140,0.8)', 3, d));
      tl.every(0.4, 1.8, 0.07, () => fx.puff(around(0.8), fx.pick(['#c8a37a', '#b08a60', '#d7bf9a']), 6, 30, 1.6, { vy: -12, alpha: 0.55 }));
      climaxAt = 1.2;
      break;
    }
    case 'volcano': {
      const top = fx.offset(s.center, 0, -34);
      fx.add(new Cone(s.center, DISASTER_SECONDS));
      tl.every(0.35, 2.6, 0.02, () =>
        fx.spawn(top, {
          kind: 'dot', color: fx.pick(['#ff3d00', '#ff6d00', '#ffab00', '#ffd600']), size: fx.between(2.2, 4.5), size1: 1,
          life: fx.between(1.0, 1.6), vx: fx.between(-90, 90), vy: -fx.between(240, 430), ay: 520, fadeIn: 0,
        }),
      );
      tl.every(0.35, 2.6, 0.06, () => fx.spawn(top, { kind: 'glow', color: '#ff6d00', size: 14, size1: 30, life: 0.5, fadeIn: 0 }));
      tl.every(0.5, 3.0, 0.08, () =>
        fx.puff(top, fx.pick(['#3a3a3a', '#4f4f4f', '#2e2e2e']), 14, fx.between(60, 95), fx.between(2.4, 3.2), {
          vx: fx.between(10, 40), vy: -fx.between(35, 60), alpha: 0.7,
        }),
      );
      tl.at(0.35, () => fx.add(new Ring(top, 6, 80, 0.6, 'rgba(255,171,64,0.9)', 4)));
      climaxAt = 1.0;
      break;
    }
    case 'tsunami': {
      const dir = s.seaDir ?? [1, 0];
      fx.add(new Waves(s.center, dir, R, 3, 1.3, 0.4));
      climaxAt = 1.4;
      break;
    }
    case 'flood': {
      tl.every(0, 2.6, 0.006, () => {
        const p = fx.offset(s.center, fx.between(-1.3, 1.3) * R, -R * 1.2);
        fx.spawn(p, { kind: 'streak', color: 'rgba(200,230,255,0.9)', size: 18, life: (R * 2.2) / 640, vx: -70, vy: 640, fadeIn: 0 });
      });
      fx.puff(s.center, '#1565c0', R * 0.3, R * 1.0, 3.6, { alpha: 0.4, fadeIn: 0.3 });
      tl.every(0.3, 2.2, 0.06, () => fx.puff(any(), fx.pick(['#2d7ff9', '#1e88e5', '#42a5f5']), 6, fx.between(0.3, 0.5) * R, 2.8, { alpha: 0.7, fadeIn: 0.3 }));
      tl.every(0.6, 2.8, 0.18, () => fx.add(new Ring(any(), 3, 28, 0.9, 'rgba(200,230,255,0.85)', 2)));
      climaxAt = 1.5;
      break;
    }
    case 'tornado': {
      const from = fx.offset(s.center, -R * 0.7, R * 0.15);
      const to = fx.offset(s.center, R * 0.7, -R * 0.1);
      fx.add(new Tornado(from, to, 3.4, Math.max(70, Math.min(150, R * 0.9))));
      tl.every(0.1, 3.2, 0.25, () => fx.puff(fx.offset(s.center, fx.between(-1, 1) * R, -R * 0.6), '#455a64', 18, 50, 1.6, { alpha: 0.4, vx: 30 }));
      climaxAt = 1.6;
      break;
    }
    case 'hurricane': {
      fx.add(new Hurricane(s.center, Math.max(60, Math.min(220, R * 1.1)), 3.6));
      climaxAt = 1.6;
      break;
    }
    case 'wildfire': {
      const fires = s.pts.slice(0, 12);
      if (!fires.length) fires.push(s.center);
      for (const f of fires) fx.spawn(f, { kind: 'glow', color: '#ff6d00', size: 30, size1: 55, life: 3.4, alpha: 0.5 });
      tl.every(0.1, 3.1, 0.008, () => {
        const f = fx.offset(fx.pick(fires), fx.between(-22, 22), fx.between(-8, 8));
        fx.spawn(f, {
          kind: 'glow', color: fx.pick(['#ffd54f', '#ffab00', '#ff6d00', '#ff3d00']), size: fx.between(12, 22), size1: 3,
          life: fx.between(0.55, 0.9), vx: fx.between(-12, 12), vy: -fx.between(50, 100), fadeIn: 0.1,
        });
      });
      tl.every(0.2, 3.0, 0.05, () =>
        fx.spawn(fx.pick(fires), {
          kind: 'dot', color: fx.pick(['#ffe082', '#ffab40']), size: 2, size1: 0.5, life: 1.0,
          vx: fx.between(-40, 40), vy: -fx.between(80, 160), ay: 40, fadeIn: 0,
        }),
      );
      tl.every(0.3, 3.2, 0.09, () =>
        fx.puff(fx.offset(fx.pick(fires), 0, -18), fx.pick(['#3b3b3b', '#555555']), 8, 42, 2.2, { vy: -30, vx: 12, alpha: 0.6 }),
      );
      climaxAt = 1.5;
      break;
    }
    case 'drought': {
      fx.add(new Sun(s.center, -Math.min(R * 0.7, 90), 3.6));
      fx.puff(s.center, '#ff8f00', R * 0.4, R * 1.2, 3.6, { alpha: 0.35, fadeIn: 0.3 });
      for (let i = 0; i < 4; i++) tl.at(0.4 + i * 0.25, () => fx.add(new Cracks(any(), fx.rand, 5, Math.min(70, R * 0.45), 'rgba(110,70,30,0.85)', 2, 0.8, 3.0)));
      tl.every(0.5, 3.0, 0.15, () => fx.puff(around(0.8), '#d7b98e', 6, 26, 1.8, { vx: 25, alpha: 0.5 }));
      climaxAt = 1.5;
      break;
    }
    case 'blizzard': {
      fx.puff(s.center, '#ffffff', R * 0.5, R * 1.3, 3.6, { alpha: 0.55, fadeIn: 0.3 });
      tl.every(0.3, 2.6, 0.15, () => fx.puff(any(), '#ffffff', 10, R * 0.4, 2.2, { alpha: 0.6, fadeIn: 0.3 }));
      tl.every(0, 3.2, 0.004, () => {
        const p = fx.offset(s.center, -R * 1.4 + fx.between(-0.3, 1.6) * R, -R * 1.1);
        fx.spawn(p, {
          kind: 'flake', color: '#ffffff', size: fx.between(1.3, 3.2), life: fx.between(1.1, 1.6),
          vx: fx.between(140, 210), vy: fx.between(100, 150), rot: fx.rand() * 6, fadeIn: 0.1,
        });
      });
      tl.every(0.2, 3.0, 0.07, () => {
        const p = fx.offset(s.center, -R * 1.2, fx.between(-0.8, 0.8) * R);
        fx.spawn(p, { kind: 'streak', color: 'rgba(255,255,255,0.6)', size: 40, life: 0.6, vx: 420, vy: 60, fadeIn: 0.1 });
      });
      climaxAt = 1.5;
      break;
    }
    case 'sandstorm': {
      tl.every(0, 3.0, 0.05, () => {
        const p = fx.offset(s.center, -R * 1.5, fx.between(-0.9, 0.9) * R);
        fx.puff(p, fx.pick(['#d7a86e', '#c99a5b', '#e0bb85']), 30, fx.between(60, 100), 2.6, { vx: fx.between(140, 200), alpha: 0.5, fadeIn: 0.15 });
      });
      tl.every(0, 3.0, 0.012, () => {
        const p = fx.offset(s.center, -R * 1.4, fx.between(-1, 1) * R);
        fx.spawn(p, { kind: 'streak', color: 'rgba(222,184,135,0.8)', size: 10, life: 1.0, vx: fx.between(280, 380), vy: fx.between(-20, 20), fadeIn: 0 });
      });
      climaxAt = 1.5;
      break;
    }
    case 'meteor': {
      climaxAt = 99; // happens on impact
      fx.add(
        new Meteor(s.center, Math.min(R * 1.5, 320), -Math.min(R * 1.7, 340), 0.95, () => {
          s.climax();
          fx.explosion(s.center, 2.2);
          fx.spawn(s.center, { kind: 'glow', color: '#ffffff', size: 20, size1: R * 2.2, life: 0.5, fadeIn: 0 });
          fx.add(new Ring(s.center, 10, R * 1.4, 0.9, 'rgba(255,255,255,0.9)', 5));
          fx.add(new Ring(s.center, 10, R * 1.0, 0.9, 'rgba(255,171,64,0.9)', 3, 0.15));
          fx.add(new Crater(s.center, Math.max(10, Math.min(40, R * 0.18)), 2.8));
          tl.every(1.0, 2.6, 0.06, () =>
            fx.puff(fx.offset(s.center, fx.between(-10, 10), -fx.between(0, 30)), '#3e3e3e', 12, 60, 2.2, { vy: -50, alpha: 0.7 }),
          );
          let shook = 0;
          fx.add({
            update(dt, f) {
              shook += dt;
              f.shake(12 * Math.max(0, 1 - shook / 0.9));
              return shook < 0.9;
            },
          });
        }),
      );
      break;
    }
    default: {
      const at = playCrazy(fx, tl, s);
      if (at !== null) climaxAt = at;
      else tl.every(0, 2.4, 0.1, () => fx.explosion(any(), 0.7));
    }
  }
  if (level !== 'calm') disasterExtras(fx, tl, s, climaxAt < 99 ? climaxAt : 1.0, level);
  if (climaxAt < 99) tl.at(climaxAt, s.climax);
  fx.add(tl);
}

/** More action for each disaster (Normal / Epic), scaled by how severe it is. */
function disasterExtras(fx: Effects, tl: Timeline, s: DisasterShow, climaxAt: number, level: ActionLevel) {
  const R = s.R;
  const epic = level === 'epic';
  const sev = s.severity ?? 0.15;
  const big = Math.min(1.8, 0.8 + sev * 2.2) * (epic ? 1.25 : 1);
  // creatures grow with the country's size on screen, so they don't look like specks on Canada
  const e = Math.max(0.9, Math.min(1.8, R / 80));
  const n = (k: number) => Math.max(1, Math.round(k * big));
  const any = () => fx.pick(s.pts.length ? s.pts : [s.center]);
  const around = (spread = 1): W => fx.offset(s.center, fx.between(-1, 1) * R * spread, fx.between(-0.8, 0.8) * R * spread);
  const away = (p: W, dist: number): W => {
    const [cx, cy] = fx.screen(s.center);
    const [px, py] = fx.screen(p);
    const a = Math.atan2(py - cy, px - cx) + fx.between(-0.4, 0.4);
    return fx.offset(p, Math.cos(a) * dist, Math.sin(a) * dist);
  };
  switch (s.type) {
    case 'earthquake':
      s.pts.slice(0, n(4)).forEach((p, i) => fx.add(new Crumble(p, 0.15 + i * 0.12)));
      tl.every(0.15, 2.1, 0.016, () => fx.shake(4 * big));
      break;
    case 'volcano': {
      const top = fx.offset(s.center, 0, -34);
      tl.every(0.6, 3.4, 0.03 / big, () => // lava running down the slopes
        fx.spawn(fx.offset(top, fx.between(-6, 6), 8), {
          kind: 'glow', color: fx.pick(['#ff3d00', '#ff6d00', '#ffab00']), size: fx.between(4, 7), size1: 2, life: fx.between(1.4, 2.2),
          vx: fx.between(-70, 70), vy: fx.between(18, 50), drag: 0.6, fadeIn: 0,
        }),
      );
      for (const d of epic ? [1.2, 1.9, 2.7] : [1.4, 2.5]) tl.at(d, () => fx.add(new Lightning(fx.offset(top, fx.between(-50, 50), -fx.between(60, 100)))));
      break;
    }
    case 'tsunami': {
      const dir = s.seaDir ?? [1, 0];
      const sea = s.seaAt ?? fx.offset(s.center, dir[0] * R * 1.2, dir[1] * R * 1.2);
      fx.add(new Walker(fx.offset(sea, dir[0] * 40, dir[1] * 40), s.center, 1.7, '🏄', 30 * e, { gait: 'hop', delay: 0.6 }));
      for (let i = 0; i < n(3); i++) fx.add(new Walker(fx.offset(sea, fx.between(-40, 40), fx.between(-30, 30)), around(0.6), fx.between(1.4, 2), fx.pick(['⛵', '🚤', '🛟']), 20 * e, { spin: fx.between(-4, 4), delay: 0.9 + i * 0.15, noFlip: true }));
      break;
    }
    case 'hurricane':
      fx.add(new Whirl(() => s.center, ['🐄', '🚗', '🏠', '🌴', '🪵', '🐑'], n(7), Math.max(50, Math.min(170, R * 0.75)), 3.6, 3.2, e));
      for (let i = 0; i < n(3); i++) tl.at(0.6 + i * 0.8, () => fx.add(new Lightning(around(0.8))));
      break;
    case 'tornado': {
      const from = fx.offset(s.center, -R * 0.7, R * 0.15);
      const to = fx.offset(s.center, R * 0.7, -R * 0.1);
      const at = (t: number): W => {
        const k = Math.max(0, Math.min(1, t / 3.4));
        return [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
      };
      fx.add(new Whirl((t) => fx.offset(at(t), 0, -30), ['🐄', '🚗', '🏠', '🪵', '🐑'], n(5), 38 * e, 3.4, 4, e));
      if (epic) tl.at(1.0, () => fx.add(new Lightning(around(0.9))));
      break;
    }
    case 'flood':
      fx.add(new RisingWater(s.center, R, 3.7));
      for (let i = 0; i < n(5); i++) fx.add(new Walker(around(0.6), around(0.6), fx.between(2.4, 3.2), fx.pick(['🦆', '🛶', '🦆', '🐸']), 20 * e, { gait: 'fly', delay: 0.6 + i * 0.12 }));
      if (epic) tl.at(1.2, () => fx.add(new Lightning(around(0.8))));
      break;
    case 'wildfire': {
      // animals running away from the fire
      for (let i = 0; i < n(5); i++) {
        const p = any();
        fx.add(new Walker(p, away(p, fx.between(70, 120)), fx.between(1.3, 1.8), fx.pick(['🦌', '🐇', '🦊', '🐿️', '🦔']), 20 * e, { gait: 'hop', delay: 0.4 + i * 0.15 }));
      }
      // a water bomber drops water on the fire
      const a = fx.offset(s.center, -R * 1.3, -R * 0.45);
      const b = fx.offset(s.center, R * 1.3, -R * 0.3);
      fx.add(new Walker(a, b, 2.4, '🛩️', 30 * e, { gait: 'fly', delay: 1.0, facesLeft: false }));
      tl.every(1.5, 3.1, 0.02, (t) => {
        const k = (t - 1.0) / 2.4;
        const p: W = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
        fx.spawn(fx.offset(p, fx.between(-6, 6), 12), { kind: 'dot', color: fx.pick(['#4fc3f7', '#81d4fa', '#e1f5fe']), size: 2.2, size1: 1, life: 0.9, vy: fx.between(90, 160), vx: fx.between(-10, 10), fadeIn: 0 });
      });
      break;
    }
    case 'drought':
      for (let i = 0; i < n(3); i++) {
        const y = fx.between(-0.6, 0.6) * R;
        fx.add(new Tumbleweed(fx.offset(s.center, -R * 1.2, y), fx.offset(s.center, R * 1.2, y + fx.between(-20, 20)), fx.between(2.4, 3.2), 0.2 + i * 0.5));
      }
      for (let i = 0; i < n(3); i++) {
        const p = any();
        fx.add(new Walker(p, p, 3.2, '🌵', 22 * e, { gait: 'hop', noFlip: true, delay: 0.5 + i * 0.3 }));
      }
      break;
    case 'blizzard':
      fx.add(new Frost(s.center, R, 3.8));
      for (let i = 0; i < n(2); i++) {
        const p = around(0.5);
        fx.add(new Walker(p, fx.offset(p, fx.between(40, 80), 0), 2.6, '🐧', 24 * e, { gait: 'walk', delay: 0.5 + i * 0.4 }));
      }
      fx.add(new Walker(any(), any(), 3.2, '⛄', 26 * e, { gait: 'hop', noFlip: true, delay: 1.0 }));
      break;
    case 'sandstorm':
      for (let i = 0; i < n(2); i++) {
        const y = fx.between(-0.4, 0.4) * R;
        fx.add(new Walker(fx.offset(s.center, -R * 0.9, y), fx.offset(s.center, R * 0.9, y), 3.2, '🐫', 28 * e, { gait: 'walk', delay: i * 0.6 }));
      }
      break;
    case 'meteor':
      tl.at(0.95, () => {
        fx.add(new Flash(0.5, '255,244,214', 0.9));
        impactBlast(fx, s.center, R, big);
        if (epic) {
          const [px, py] = fx.screen(s.center);
          fx.punch(0.12, px, py);
        }
      });
      break;
  }
  if (s.full && severityWord(sev) === 'Extreme') tl.at(climaxAt + 0.25, () => fx.add(new Stamp('EXTREME!', '#ff5252')));
}

/** New land rising from the sea: golden sparkles, rings and a splash. ~2.4 s. */
export function playGrowth(fx: Effects, s: { at: W; pts: W[]; climax: () => void; done: () => void }) {
  const tl = new Timeline(2.4, s.done);
  sound.play('splash');
  tl.every(0, 1.6, 0.03, () => {
    const p = fx.offset(fx.pick(s.pts.length ? s.pts : [s.at]), fx.between(-14, 14), fx.between(-10, 10));
    fx.spawn(p, { kind: 'glow', color: fx.pick(['#ffe082', '#a5d6a7', '#ffffff', '#66bb6a']), size: fx.between(4, 8), size1: 1, life: 0.9, vy: -fx.between(20, 50), fadeIn: 0.1 });
  });
  for (const [i, p] of s.pts.slice(0, 6).entries()) fx.add(new Ring(p, 4, 46, 0.9, 'rgba(165,214,167,0.9)', 3, i * 0.12));
  tl.at(0.9, () => {
    s.climax();
    sound.play('fill');
    fx.confetti(s.at, ['#66bb6a', '#ffd34d', '#ffffff'], 18);
  });
  fx.add(tl);
}

/** Seas rise all over the world: blue ripples on many coasts. ~2.8 s. */
export function playSeaRise(fx: Effects, s: { points: W[]; climax: () => void; done: () => void }) {
  const tl = new Timeline(2.8, s.done);
  sound.play('wave');
  const pts = s.points.slice(0, 60);
  pts.forEach((p, i) => fx.add(new Ring(p, 2, 22, 1.1, 'rgba(144,202,249,0.9)', 2, (i % 12) * 0.08)));
  tl.at(1.2, () => {
    s.climax();
    pts.forEach((p, i) => fx.add(new Ring(p, 2, 16, 0.9, 'rgba(255,255,255,0.8)', 1.5, (i % 8) * 0.05)));
  });
  fx.add(tl);
}
