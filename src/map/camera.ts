/**
 * The camera: how world units map onto the screen.
 *
 *   screenX = worldX * scale + x
 *   screenY = worldY * scale + y
 *
 * All values are in CSS pixels (the renderer multiplies by devicePixelRatio itself).
 */
import type { BBox } from './geometry';

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface CameraLimits {
  minScale: number;
  maxScale: number;
}

/** Most zoomed-in, relative to the whole-world view. Enough to see Monaco and Vatican, without going past what the map data can show. */
export const MAX_ZOOM = 300;

export function screenToWorld(cam: Camera, sx: number, sy: number): [number, number] {
  return [(sx - cam.x) / cam.scale, (sy - cam.y) / cam.scale];
}

export function worldToScreen(cam: Camera, wx: number, wy: number): [number, number] {
  return [wx * cam.scale + cam.x, wy * cam.scale + cam.y];
}

/** The camera that shows `box` centred in the viewport with some padding. */
export function fitBox(box: BBox, view: Viewport, padding = 24, limits?: CameraLimits): Camera {
  const bw = Math.max(box.maxX - box.minX, 1e-6);
  const bh = Math.max(box.maxY - box.minY, 1e-6);
  const availW = Math.max(view.width - padding * 2, 1);
  const availH = Math.max(view.height - padding * 2, 1);
  let scale = Math.min(availW / bw, availH / bh);
  if (limits) scale = clamp(scale, limits.minScale, limits.maxScale);
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  return { scale, x: view.width / 2 - cx * scale, y: view.height / 2 - cy * scale };
}

/** Zoom by `factor` keeping the world point under (sx, sy) fixed on screen. */
export function zoomAt(cam: Camera, factor: number, sx: number, sy: number, limits: CameraLimits): Camera {
  const scale = clamp(cam.scale * factor, limits.minScale, limits.maxScale);
  const real = scale / cam.scale;
  return { scale, x: sx - (sx - cam.x) * real, y: sy - (sy - cam.y) * real };
}

/**
 * Keep the map on screen: when the world is smaller than the viewport it is
 * centred; otherwise its edges cannot be dragged past the viewport edges.
 */
export function constrain(cam: Camera, world: { width: number; height: number }, view: Viewport): Camera {
  const w = world.width * cam.scale;
  const h = world.height * cam.scale;
  const x = w <= view.width ? (view.width - w) / 2 : clamp(cam.x, view.width - w, 0);
  const y = h <= view.height ? (view.height - h) / 2 : clamp(cam.y, view.height - h, 0);
  return { scale: cam.scale, x, y };
}

/** Smoothly interpolate cameras (zoom interpolated in log space so it feels even). */
export function lerpCamera(a: Camera, b: Camera, t: number, view: Viewport): Camera {
  const scale = Math.exp(Math.log(a.scale) + (Math.log(b.scale) - Math.log(a.scale)) * t);
  // Interpolate the world point at the viewport centre, then rebuild x/y.
  const [acx, acy] = screenToWorld(a, view.width / 2, view.height / 2);
  const [bcx, bcy] = screenToWorld(b, view.width / 2, view.height / 2);
  const cx = acx + (bcx - acx) * t;
  const cy = acy + (bcy - acy) * t;
  return { scale, x: view.width / 2 - cx * scale, y: view.height / 2 - cy * scale };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
