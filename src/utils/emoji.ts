/**
 * Emoji drawn onto a canvas. Each emoji is drawn once into a small canvas and reused,
 * because drawing emoji text every frame is slow in Safari. Used by the crazy disasters
 * and the landmark pins.
 */

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const spriteCache = new Map<string, HTMLCanvasElement>();

/** A canvas holding one emoji, drawn at about `px` (rounded so few sizes are cached). */
export function emojiSprite(ch: string, px: number): HTMLCanvasElement {
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

