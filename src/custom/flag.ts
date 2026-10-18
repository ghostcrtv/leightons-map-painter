/**
 * Draws a custom country's flag from its design (layout + colours + optional symbol).
 * Used for the map (a 480×360 canvas registered with the flag library) and the UI.
 */
import type { FlagDesign } from '../worlds/model';

export const FLAG_W = 480;
export const FLAG_H = 360;

export const FLAG_COLORS = ['#e8463a', '#ffffff', '#2d7ff9', '#ffd34d', '#2fae5a', '#111111', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#7c2d12', '#0f2a6b'];
export const FLAG_SYMBOLS = ['', '⭐', '☀️', '🌙', '🦁', '🦅', '🐉', '🦖', '🐺', '🦈', '🍁', '⚡', '🔥', '🌊', '🏔️', '👑', '🛡️', '⚓', '🌸', '💎', '🚀', '🎯', '🐻', '🌍'];

export function drawFlag(ctx: CanvasRenderingContext2D, d: FlagDesign, w = FLAG_W, h = FLAG_H) {
  const c = d.colors.length ? d.colors : ['#2d7ff9', '#ffffff'];
  ctx.save();
  ctx.fillStyle = c[0];
  ctx.fillRect(0, 0, w, h);
  switch (d.layout) {
    case 'h':
      c.forEach((col, i) => {
        ctx.fillStyle = col;
        ctx.fillRect(0, Math.round((i * h) / c.length), w, Math.ceil(h / c.length) + 1);
      });
      break;
    case 'v':
      c.forEach((col, i) => {
        ctx.fillStyle = col;
        ctx.fillRect(Math.round((i * w) / c.length), 0, Math.ceil(w / c.length) + 1, h);
      });
      break;
    case 'cross': {
      ctx.fillStyle = c[1] ?? '#ffffff';
      const t = h * 0.22;
      ctx.fillRect(w * 0.3, 0, t, h);
      ctx.fillRect(0, (h - t) / 2, w, t);
      if (c[2]) {
        ctx.fillStyle = c[2];
        const t2 = t * 0.5;
        ctx.fillRect(w * 0.3 + (t - t2) / 2, 0, t2, h);
        ctx.fillRect(0, (h - t2) / 2, w, t2);
      }
      break;
    }
    case 'diag':
      ctx.fillStyle = c[1] ?? '#ffffff';
      ctx.beginPath();
      ctx.moveTo(w, 0);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
      if (c[2]) {
        ctx.strokeStyle = c[2];
        ctx.lineWidth = h * 0.14;
        ctx.beginPath();
        ctx.moveTo(-10, h + 10);
        ctx.lineTo(w + 10, -10);
        ctx.stroke();
      }
      break;
    case 'plain':
      break;
  }
  if (d.symbol) {
    const size = h * 0.5;
    ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const x = d.layout === 'cross' ? w * 0.3 + h * 0.11 : w / 2;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = h * 0.03;
    ctx.fillStyle = d.symbolColor ?? '#ffffff';
    ctx.fillText(d.symbol, x, h / 2 + size * 0.04);
  }
  ctx.restore();
}

/** A finished flag picture (canvas) and its main colour. */
export function renderFlag(d: FlagDesign): { canvas: HTMLCanvasElement; url: string; color: string } {
  const canvas = document.createElement('canvas');
  canvas.width = FLAG_W;
  canvas.height = FLAG_H;
  const ctx = canvas.getContext('2d')!;
  drawFlag(ctx, d);
  let url = '';
  try {
    url = canvas.toDataURL('image/png');
  } catch {
    /* ignore */
  }
  return { canvas, url, color: d.colors[0] ?? '#2d7ff9' };
}
