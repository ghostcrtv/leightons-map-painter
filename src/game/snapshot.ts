/**
 * "Picture of the map": the map as it looks now (plus any smoke/effects), with a banner
 * showing the world's name and year — ready to share or save.
 */
import { useGame } from './store';
import { getTerritory } from '../territory/session';
import { sharePicture } from '../utils/files';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function makeMapPicture(): Promise<HTMLCanvasElement | null> {
  const map = document.querySelector<HTMLCanvasElement>('.map-canvas');
  const fx = document.querySelector<HTMLCanvasElement>('.fx-canvas');
  if (!map) return null;
  const W = map.width;
  const scale = W / map.getBoundingClientRect().width || 1;
  const footer = Math.round(84 * scale);
  const out = document.createElement('canvas');
  out.width = W;
  out.height = map.height + footer;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(map, 0, 0);
  if (fx && fx.width === W) ctx.drawImage(fx, 0, 0);
  // Banner
  const y = map.height;
  const g = ctx.createLinearGradient(0, y, 0, y + footer);
  g.addColorStop(0, '#16213a');
  g.addColorStop(1, '#0d1424');
  ctx.fillStyle = g;
  ctx.fillRect(0, y, W, footer);
  ctx.fillStyle = '#ffd34d';
  ctx.fillRect(0, y, W, Math.max(2, 3 * scale));
  const logo = await loadImage(`${import.meta.env.BASE_URL}icons/logo.svg`);
  const pad = 16 * scale;
  const size = footer - pad * 1.4;
  if (logo) ctx.drawImage(logo, pad, y + (footer - size) / 2, size, size);
  const world = useGame.getState().world;
  const year = getTerritory()?.year() ?? 0;
  const left = pad * 2 + size;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.round(30 * scale)}px "Lilita One", system-ui, sans-serif`;
  ctx.fillText(`${world?.name ?? 'My World'}${year ? ` · Year ${year}` : ''}`, left, y + footer * 0.4);
  ctx.fillStyle = '#a7b3c4';
  ctx.font = `700 ${Math.round(15 * scale)}px system-ui, sans-serif`;
  ctx.fillText(`Leighton’s Map Painter · ${new Date().toLocaleDateString()}`, left, y + footer * 0.74);
  return out;
}

export async function shareMapPicture(): Promise<string> {
  const pic = await makeMapPicture();
  if (!pic) return 'The map isn’t ready yet.';
  const world = useGame.getState().world?.name ?? 'My World';
  const name = `${world.replace(/[^a-z0-9 _-]+/gi, '').trim().replace(/\s+/g, '-') || 'map'}.png`;
  const how = await sharePicture(pic, name, world);
  return how === 'saved' ? 'Picture saved (look in your Downloads).' : how === 'shared' ? 'Picture shared!' : '';
}
