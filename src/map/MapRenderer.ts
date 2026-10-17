/**
 * MapRenderer — draws the world onto a <canvas> and owns the camera.
 *
 * Why a hand-written Canvas 2D renderer instead of MapLibre?
 *   MapLibre can only fill shapes with colours or *screen-space repeating*
 *   patterns. It cannot stretch one flag image across a country and clip it to
 *   the border. Canvas 2D can (clip + drawImage), it is rock-solid in iPad
 *   Safari, and it lets us paint territory pixel-by-pixel later (Phase 2).
 *
 * Speed tricks (important on iPad):
 *   - Geometry is projected once; panning/zooming only changes a transform.
 *   - Two levels of detail; shapes too small to show a flag are filled with the
 *     flag's average colour (no clipping).
 *   - While a finger is moving, if a full redraw is too slow for 60 fps we
 *     move a cached snapshot instead and redraw sharply when the gesture ends.
 *
 * This class knows nothing about React. The UI talks to it through methods.
 */
import {
  clamp,
  constrain,
  easeInOut,
  fitBox,
  lerpCamera,
  MAX_ZOOM,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type Camera,
  type CameraLimits,
  type Viewport,
} from './camera';
import { bboxContains, bboxHeight, bboxIntersects, bboxWidth, type BBox } from './geometry';
import type { FlagLibrary } from './flags';
import type { CountryShape, Lod, World } from './world';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MapOptions {
  showLabels: boolean;
  showBorders: boolean;
}

const OCEAN = '#2a6f97';
const OCEAN_DEEP = '#1f5a7d';
const BORDER = 'rgba(16, 22, 30, 0.8)';
const SELECT = '#ffd34d';
/** Below this many CSS px a shape gets a flat colour instead of a clipped flag. */
const MIN_FLAG_PX = 8;
/** Switch to the detailed borders when zoomed in at least this much. */
const HI_DETAIL_ZOOM = 2.5;
/** Tiny countries get a tappable dot once zoomed in this much. */
const MARKER_ZOOM = 2.5;
const MARKER_RADIUS = 6;
/** If a full redraw takes longer than this (ms), gestures move a snapshot instead. */
const SLOW_FRAME_MS = 14;
const LABEL_FONT = 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", sans-serif';

interface Marker {
  id: string;
  x: number;
  y: number;
}

export class MapRenderer {
  private ctx: CanvasRenderingContext2D;
  private hitCtx: CanvasRenderingContext2D;
  private view: Viewport = { width: 1, height: 1 };
  private dpr = 1;
  private cam: Camera = { x: 0, y: 0, scale: 1 };
  private limits: CameraLimits = { minScale: 1, maxScale: MAX_ZOOM };
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private options: MapOptions = { showLabels: true, showBorders: true };

  private selectedId: string | null = null;
  private hoverId: string | null = null;

  private raf = 0;
  private interacting = false;
  private lastFullMs = 0;
  private needsFull = true;
  private snapshot: HTMLCanvasElement;
  private snapshotCam: Camera | null = null;
  private overview: HTMLCanvasElement | null = null;
  private overviewScale = 1;

  private anim: { from: Camera; to: Camera; start: number; duration: number } | null = null;
  private momentum: { vx: number; vy: number; last: number } | null = null;

  private markers: Marker[] = [];
  private labelWidth = new Map<string, number>();
  private hasCamera = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private world: World,
    private flags: FlagLibrary,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas is not supported in this browser');
    this.ctx = ctx;
    const hit = document.createElement('canvas');
    hit.width = hit.height = 1;
    this.hitCtx = hit.getContext('2d')!;
    this.snapshot = document.createElement('canvas');
    flags.onImageLoaded = () => this.invalidate();
    this.resize();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.flags.onImageLoaded = () => {};
  }

  /** Numbers for automated tests and troubleshooting (open the game with ?debug). */
  debugInfo() {
    return { lastFrameMs: this.lastFullMs, zoom: this.zoomRelative(), lod: this.lod(), camera: { ...this.cam } };
  }

  /** Screen position of a country's label point (used by automated tests). */
  debugScreenPoint(id: string): [number, number] | null {
    const c = this.world.byId.get(id);
    return c ? worldToScreen(this.cam, c.labelPoint[0], c.labelPoint[1]) : null;
  }

  // ---------------------------------------------------------------- sizing

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    // Cap at 2x: sharper than that costs a lot of memory/speed for little gain.
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.snapshot.width = this.canvas.width;
    this.snapshot.height = this.canvas.height;
    this.snapshotCam = null;

    const oldView = this.view;
    this.view = { width, height };
    const worldBox = this.worldBox();
    // Fully zoomed out = the whole world fits on screen.
    const fit = fitBox(worldBox, this.view, 8);
    this.limits = { minScale: fit.scale, maxScale: fit.scale * MAX_ZOOM };

    if (!this.hasCamera) {
      this.cam = fit;
      this.hasCamera = true;
    } else {
      // Keep the same spot in the middle of the screen after a rotation/resize.
      const [cx, cy] = screenToWorld(this.cam, oldView.width / 2, oldView.height / 2);
      const scale = clamp(this.cam.scale, this.limits.minScale, this.limits.maxScale);
      this.cam = { scale, x: width / 2 - cx * scale, y: height / 2 - cy * scale };
    }
    this.cam = this.constrained(this.cam);
    this.invalidate();
  }

  setInsets(insets: Partial<Insets>) {
    this.insets = { ...this.insets, ...insets };
  }

  setOptions(options: Partial<MapOptions>) {
    this.options = { ...this.options, ...options };
    this.invalidate();
  }

  // ------------------------------------------------------------- selection

  setSelected(id: string | null) {
    if (id === this.selectedId) return;
    this.selectedId = id;
    this.invalidate();
  }

  setHover(id: string | null) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.canvas.style.cursor = id ? 'pointer' : '';
    this.invalidate();
  }

  /** Which country (if any) is under this screen point? */
  hitTest(sx: number, sy: number): string | null {
    // Dots for tiny countries first: they are easier to tap than the real shape.
    let best: Marker | null = null;
    let bestD = (MARKER_RADIUS + 10) ** 2;
    for (const m of this.markers) {
      const d = (m.x - sx) ** 2 + (m.y - sy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    if (best) return best.id;

    const [wx, wy] = screenToWorld(this.cam, sx, sy);
    const lod = this.lod();
    // Smallest first, so an enclave (Lesotho) wins over its surroundings (South Africa).
    const candidates = this.world.countries
      .filter((c) => bboxContains(c.box, wx, wy))
      .sort((a, b) => a.area - b.area);
    for (const c of candidates) {
      const path = c.outline[lod] ?? c.outline.lo!;
      if (this.hitCtx.isPointInPath(path, wx, wy, 'evenodd')) return c.info.id;
    }
    return null;
  }

  // ---------------------------------------------------------------- camera

  zoomRelative(): number {
    return this.cam.scale / this.limits.minScale;
  }

  panBy(dx: number, dy: number) {
    this.stopMotion();
    this.cam = this.constrained({ ...this.cam, x: this.cam.x + dx, y: this.cam.y + dy });
    this.requestFrame();
  }

  zoomAt(factor: number, sx: number, sy: number) {
    this.stopMotion();
    this.cam = this.constrained(zoomAt(this.cam, factor, sx, sy, this.limits));
    this.requestFrame();
  }

  /** Zoom around the middle of the visible map area (used by the + / − buttons). */
  zoomStep(factor: number) {
    const sx = (this.insets.left + this.view.width - this.insets.right) / 2;
    const sy = (this.insets.top + this.view.height - this.insets.bottom) / 2;
    const target = this.constrained(zoomAt(this.cam, factor, sx, sy, this.limits));
    this.animateTo(target, 280);
  }

  showWholeWorld() {
    this.animateTo(this.constrained(fitBox(this.worldBox(), this.view, 8, this.limits)), 600);
  }

  flyToCountry(id: string) {
    const c = this.world.byId.get(id);
    if (!c) return;
    const box = c.mainBox;
    // Fit into the area not covered by panels.
    const inner = {
      width: this.view.width - this.insets.left - this.insets.right,
      height: this.view.height - this.insets.top - this.insets.bottom,
    };
    let target = fitBox(box, inner, Math.max(40, Math.min(inner.width, inner.height) * 0.12), this.limits);
    // Don't zoom in absurdly far on micro-states; don't zoom *out* for huge ones.
    target.scale = Math.min(target.scale, this.limits.minScale * 400);
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    target = {
      scale: target.scale,
      x: this.insets.left + inner.width / 2 - cx * target.scale,
      y: this.insets.top + inner.height / 2 - cy * target.scale,
    };
    this.animateTo(this.constrained(target), 700);
  }

  beginInteraction() {
    this.stopMotion();
    this.interacting = true;
  }

  /** Gesture ended; velocity in CSS px per millisecond starts a gentle glide. */
  endInteraction(vx = 0, vy = 0) {
    this.interacting = false;
    if (Math.hypot(vx, vy) > 0.25) {
      this.momentum = { vx, vy, last: performance.now() };
    }
    this.needsFull = true;
    this.requestFrame();
  }

  private animateTo(to: Camera, duration: number) {
    this.stopMotion();
    this.anim = { from: { ...this.cam }, to, start: performance.now(), duration };
    this.requestFrame();
  }

  private stopMotion() {
    this.anim = null;
    this.momentum = null;
  }

  private constrained(cam: Camera): Camera {
    return constrain(cam, { width: this.world.width, height: this.world.height }, this.view);
  }

  private worldBox(): BBox {
    return { minX: 0, minY: 0, maxX: this.world.width, maxY: this.world.height };
  }

  private lod(): Lod {
    return this.world.hiReady && this.zoomRelative() >= HI_DETAIL_ZOOM ? 'hi' : 'lo';
  }

  // --------------------------------------------------------------- drawing

  /** Something changed that needs a sharp redraw. */
  invalidate() {
    this.needsFull = true;
    this.requestFrame();
  }

  private requestFrame() {
    if (!this.raf) this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private frame(now: number) {
    this.raf = 0;
    let moving = this.interacting;

    if (this.anim) {
      const t = Math.min(1, (now - this.anim.start) / this.anim.duration);
      this.cam = lerpCamera(this.anim.from, this.anim.to, easeInOut(t), this.view);
      if (t >= 1) {
        this.cam = this.anim.to;
        this.anim = null;
        this.needsFull = true;
      } else moving = true;
    }

    if (this.momentum) {
      const m = this.momentum;
      const dt = Math.min(now - m.last, 50);
      m.last = now;
      this.cam = this.constrained({ ...this.cam, x: this.cam.x + m.vx * dt, y: this.cam.y + m.vy * dt });
      const decay = Math.pow(0.994, dt);
      m.vx *= decay;
      m.vy *= decay;
      if (Math.hypot(m.vx, m.vy) < 0.02) {
        this.momentum = null;
        this.needsFull = true;
      } else moving = true;
    }

    if (moving && this.lastFullMs > SLOW_FRAME_MS && this.snapshotCam) {
      this.drawFast();
      this.needsFull = true;
    } else if (this.needsFull || moving) {
      this.drawFull();
    }

    if (moving || this.anim || this.momentum) this.requestFrame();
  }

  private drawFull() {
    const t0 = performance.now();
    this.drawScene(this.ctx, this.cam, this.view, this.dpr, true);
    this.lastFullMs = performance.now() - t0;
    this.needsFull = false;
    // Keep a copy to slide around during gestures (only needed on slower devices).
    const sctx = this.lastFullMs > SLOW_FRAME_MS * 0.6 ? this.snapshot.getContext('2d') : null;
    if (sctx) {
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.drawImage(this.canvas, 0, 0);
      this.snapshotCam = { ...this.cam };
    }
  }

  /** Cheap frame: whole-world overview underneath, last sharp frame on top. */
  private drawFast() {
    const ctx = this.ctx;
    const cam = this.cam;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = OCEAN;
    ctx.fillRect(0, 0, this.view.width, this.view.height);
    const overview = this.getOverview();
    if (overview) {
      const s = cam.scale / this.overviewScale;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(overview, cam.x, cam.y, overview.width * s, overview.height * s);
    }
    const snap = this.snapshotCam;
    if (snap) {
      const r = cam.scale / snap.scale;
      ctx.drawImage(this.snapshot, cam.x - snap.x * r, cam.y - snap.y * r, this.view.width * r, this.view.height * r);
    }
  }

  /** A low-resolution picture of the whole world, built once. */
  private getOverview(): HTMLCanvasElement | null {
    if (this.overview) return this.overview;
    const w = 2048;
    const scale = w / this.world.width;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = Math.ceil(this.world.height * scale);
    const ctx = c.getContext('2d', { alpha: false });
    if (!ctx) return null;
    this.drawScene(ctx, { x: 0, y: 0, scale }, { width: c.width, height: c.height }, 1, false);
    this.overview = c;
    this.overviewScale = scale;
    return c;
  }

  private drawScene(ctx: CanvasRenderingContext2D, cam: Camera, view: Viewport, dpr: number, decorations: boolean) {
    const s = cam.scale;
    const zoomRel = s / this.limits.minScale;
    const lod: Lod = this.world.hiReady && zoomRel >= HI_DETAIL_ZOOM ? 'hi' : 'lo';

    // Ocean
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = OCEAN_DEEP;
    ctx.fillRect(0, 0, view.width, view.height);

    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * cam.x, dpr * cam.y);
    ctx.fillStyle = OCEAN;
    ctx.fillRect(0, 0, this.world.width, this.world.height);

    const [vx0, vy0] = screenToWorld(cam, 0, 0);
    const [vx1, vy1] = screenToWorld(cam, view.width, view.height);
    const visible: BBox = { minX: vx0, minY: vy0, maxX: vx1, maxY: vy1 };

    // Latitude/longitude grid, very faint.
    ctx.lineWidth = 0.75 / s;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.stroke(this.world.graticule);

    // Countries: each flag clipped to its land.
    ctx.imageSmoothingEnabled = true;
    for (const c of this.world.countries) {
      if (!bboxIntersects(c.box, visible)) continue;
      const code = c.info.flag;
      for (const cl of c.clusters) {
        if (!bboxIntersects(cl.box, visible)) continue;
        const path = cl.path[lod] ?? cl.path.lo!;
        const px = Math.max(bboxWidth(cl.box), bboxHeight(cl.box)) * s;
        const src = px >= MIN_FLAG_PX && this.flags.has(code) ? this.flags.source(code, cl.flagRect.w * s) : null;
        if (!src) {
          ctx.fillStyle = this.flags.averageColor(code);
          ctx.fill(path, 'evenodd');
          continue;
        }
        ctx.save();
        ctx.clip(path, 'evenodd');
        // Backup fill in the flag's main colour, so no bit of land is ever left empty.
        ctx.fillStyle = this.flags.averageColor(code);
        ctx.fill(path, 'evenodd');
        const r = cl.flagRect;
        ctx.drawImage(src.image, src.sx, src.sy, src.sw, src.sh, r.x, r.y, r.w, r.h);
        ctx.restore();
      }
    }

    // Borders and coastlines in one stroke.
    if (this.options.showBorders) {
      ctx.lineJoin = 'round';
      ctx.strokeStyle = BORDER;
      ctx.lineWidth = clamp(0.6 + Math.log2(zoomRel) * 0.25, 0.6, 1.6) / s;
      ctx.stroke(this.world.borders[lod] ?? this.world.borders.lo!);
    }

    if (!decorations) return;

    // Hover and selection outlines.
    const hover = this.hoverId && this.hoverId !== this.selectedId ? this.world.byId.get(this.hoverId) : null;
    if (hover) {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2 / s;
      ctx.stroke(hover.outline[lod] ?? hover.outline.lo!);
    }
    const sel = this.selectedId ? this.world.byId.get(this.selectedId) : null;
    if (sel) {
      const path = sel.outline[lod] ?? sel.outline.lo!;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 5.5 / s;
      ctx.stroke(path);
      ctx.strokeStyle = SELECT;
      ctx.lineWidth = 3 / s;
      ctx.stroke(path);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawMarkers(ctx, cam, visible, zoomRel);
    if (this.options.showLabels) this.drawLabels(ctx, cam, visible, sel ?? null);
  }

  /** Dots for countries too small to see, so they can still be found and tapped. */
  private drawMarkers(ctx: CanvasRenderingContext2D, cam: Camera, visible: BBox, zoomRel: number) {
    this.markers = [];
    const s = cam.scale;
    for (const c of this.world.countries) {
      const tiny = Math.max(bboxWidth(c.box), bboxHeight(c.box)) * s < 6;
      const isSel = c.info.id === this.selectedId;
      if (!tiny || (zoomRel < MARKER_ZOOM && !isSel)) continue;
      if (!bboxIntersects(c.box, visible)) continue;
      const [x, y] = worldToScreen(cam, c.labelPoint[0], c.labelPoint[1]);
      this.markers.push({ id: c.info.id, x, y });
      ctx.beginPath();
      ctx.arc(x, y, isSel ? MARKER_RADIUS + 2 : MARKER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = this.flags.averageColor(c.info.flag);
      ctx.fill();
      ctx.lineWidth = isSel ? 3 : 1.5;
      ctx.strokeStyle = isSel ? SELECT : 'rgba(255,255,255,0.95)';
      ctx.stroke();
    }
  }

  private drawLabels(ctx: CanvasRenderingContext2D, cam: Camera, visible: BBox, selected: CountryShape | null) {
    const s = cam.scale;
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    const draw = (c: CountryShape, fs: number) => {
      const [x, y] = worldToScreen(cam, c.labelPoint[0], c.labelPoint[1]);
      const w = this.unitWidth(c.info.name) * fs;
      const box = { x0: x - w / 2 - 3, y0: y - fs * 0.65, x1: x + w / 2 + 3, y1: y + fs * 0.65 };
      if (placed.some((p) => p.x0 < box.x1 && p.x1 > box.x0 && p.y0 < box.y1 && p.y1 > box.y0)) return;
      placed.push(box);
      ctx.font = `700 ${fs}px ${LABEL_FONT}`;
      ctx.lineWidth = Math.max(2.5, fs * 0.22);
      ctx.strokeStyle = 'rgba(10,14,22,0.82)';
      ctx.strokeText(c.info.name, x, y);
      ctx.fillStyle = '#fff';
      ctx.fillText(c.info.name, x, y);
    };

    // The selected country's name always shows.
    if (selected) draw(selected, 15);

    let count = 0;
    for (const c of this.world.countries) {
      if (count > 160) break;
      if (c === selected || !bboxIntersects(c.mainBox, visible)) continue;
      const bw = bboxWidth(c.mainBox) * s;
      const bh = bboxHeight(c.mainBox) * s;
      if (bw < 28 || bh < 10) continue;
      let fs = clamp(Math.min(bw / 7, bh / 2.2), 0, 20);
      fs = Math.min(fs, (bw * 0.95) / this.unitWidth(c.info.name));
      if (fs < 10) continue;
      draw(c, Math.round(fs));
      count++;
    }
  }

  /** Width of a label at a 1px font size (text width scales linearly). */
  private unitWidth(text: string): number {
    let w = this.labelWidth.get(text);
    if (w === undefined) {
      this.hitCtx.font = `700 100px ${LABEL_FONT}`;
      w = this.hitCtx.measureText(text).width / 100;
      this.labelWidth.set(text, w);
    }
    return w;
  }
}
