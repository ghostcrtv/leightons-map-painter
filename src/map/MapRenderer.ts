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
import type { CountryShape, Lod, World, LineBuckets } from './world';
import type { Layer, Territory } from '../territory/Territory';
import { fitFlagRect, unionBBox, emptyBBox, type Rect } from './geometry';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MapOptions {
  showLabels: boolean;
  showBorders: boolean;
  showCapitals: boolean;
}

const OCEAN = '#2a6f97';
const OCEAN_DEEP = '#1f5a7d';
const BORDER = 'rgba(16, 22, 30, 0.8)';
const SELECT = '#ffd34d';
const CAPITAL = '#ffd34d';
/** A capital appears once its country is at least this many CSS px across on screen… */
const CAPITAL_MIN_COUNTRY_PX = 140;
/** …or, for small countries, once zoomed in this far. */
const CAPITAL_ANY_ZOOM = 14;
/** Below this many CSS px a shape gets a flat colour instead of a clipped flag. */
const MIN_FLAG_PX = 8;
/** Switch to the detailed borders when zoomed in at least this much. */
const HI_DETAIL_ZOOM = 2.5;
/** Use full-detail borders from this zoom (they start downloading a bit earlier). */
const MAX_DETAIL_ZOOM = 20;
const MAX_DETAIL_PRELOAD_ZOOM = 10;
/** Small countries between these on-screen sizes (CSS px) get a stronger outline. */
const SMALL_OUTLINE_PX: [number, number] = [4, 60];
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
  private options: MapOptions = { showLabels: true, showBorders: true, showCapitals: true };

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
  private territory: Territory | null = null;
  private unsubscribeTerritory: (() => void) | null = null;
  /** Drawing paths for painted layers, by layer key. */
  private layerPaths = new Map<string, Path2D>();
  /** Where each country's flag goes once it has painted new land (see ownerGroups). */
  private groups: { version: number; cluster: Map<string, Rect[]>; layer: Map<string, Rect> } | null = null;
  private conquered: { version: number; ids: Set<string> } = { version: -1, ids: new Set() };
  /**
   * Fast drawing while a finger paints: the map is drawn once, then each brush movement
   * only adds the new bit of paint on top (instead of redrawing the whole world).
   */
  private live: { strokeId: number; drawn: number; cam: Camera; rect: Rect | null; lod: Lod } | null = null;
  private strokeDirty = false;
  /** Set by MapView: called once when the player zooms in far enough to need full detail. */
  onNeedMaxDetail: (() => void) | null = null;
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

  /** Connect the current-world model (Phase 2). The map redraws whenever it changes. */
  setTerritory(t: Territory | null) {
    this.unsubscribeTerritory?.();
    this.territory = t;
    this.unsubscribeTerritory = t
      ? t.subscribe(() => {
          this.overview = null; // the whole-world picture used while panning is now out of date
          if (t.painting) {
            // A stroke grew: just add the new paint (see drawStrokeIncrement).
            this.strokeDirty = true;
            this.requestFrame();
          } else {
            this.live = null;
            this.invalidate();
          }
        })
      : null;
    this.invalidate();
  }

  /** Convert a screen point to world units (used by the paint tools). */
  toWorld(sx: number, sy: number): [number, number] {
    return screenToWorld(this.cam, sx, sy);
  }

  get scale() {
    return this.cam.scale;
  }

  destroy() {
    this.unsubscribeTerritory?.();
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
    const base = this.originalAt(wx, wy, lod);
    if (!base || !this.territory) return base;
    // Painted land belongs to whoever painted it last.
    const layers = this.territory.layers();
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      const clip = this.layerClip(l, lod);
      if (!clip || !bboxContains(clip.box, wx, wy)) continue;
      if (!this.hitCtx.isPointInPath(clip.path, wx, wy, 'nonzero')) continue;
      if (l.within && l.within !== base) continue; // locked strokes only cover their own country
      return l.kind === 'paint' ? l.owner! : base;
    }
    return base;
  }

  /** The country whose REAL land is under this screen point (ignores painting). */
  countryAt(sx: number, sy: number): string | null {
    const [wx, wy] = screenToWorld(this.cam, sx, sy);
    return this.originalAt(wx, wy, this.lod());
  }

  private originalAt(wx: number, wy: number, lod: Lod): string | null {
    // Smallest first, so an enclave (Lesotho) wins over its surroundings (South Africa).
    const candidates = this.world.countries.filter((c) => bboxContains(c.box, wx, wy)).sort((a, b) => a.area - b.area);
    for (const c of candidates) {
      if (this.hitCtx.isPointInPath(this.pick(c.outline, lod), wx, wy, 'evenodd')) return c.info.id;
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
    target.scale = Math.min(target.scale, this.limits.minScale * 150);
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
    return this.lodFor(this.zoomRelative());
  }

  private lodFor(zoomRel: number): Lod {
    const ready = this.world.ready;
    if (zoomRel >= MAX_DETAIL_PRELOAD_ZOOM && !ready.max && this.onNeedMaxDetail) {
      const load = this.onNeedMaxDetail;
      this.onNeedMaxDetail = null; // ask only once
      load();
    }
    if (ready.max && zoomRel >= MAX_DETAIL_ZOOM) return 'max';
    if (ready.hi && zoomRel >= HI_DETAIL_ZOOM) return 'hi';
    return 'lo';
  }

  /** The most detailed path available for this level. */
  private pick(paths: Record<Lod, Path2D | null>, lod: Lod): Path2D {
    return (lod === 'max' ? paths.max ?? paths.hi : lod === 'hi' ? paths.hi : null) ?? paths.lo!;
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

    const stroke = this.territory?.strokeInfo() ?? null;
    const live = this.live;
    if (
      stroke &&
      live &&
      live.strokeId === stroke.id &&
      !moving &&
      !this.needsFull &&
      sameCamera(live.cam, this.cam)
    ) {
      if (this.strokeDirty) this.drawStrokeIncrement(stroke.circles, stroke.kind, stroke.owner, stroke.within);
    } else if (moving && this.lastFullMs > SLOW_FRAME_MS && this.snapshotCam) {
      this.drawFast();
      this.needsFull = true;
    } else if (this.needsFull || moving || this.strokeDirty) {
      this.drawFull();
      // Remember what is on screen, so the next brush movements can just add to it.
      this.live =
        stroke && stroke.within
          ? {
              strokeId: stroke.id,
              drawn: stroke.circles.length,
              cam: { ...this.cam },
              rect: this.ownerGroups().layer.get(`stroke${stroke.id}:${stroke.circles.length}`) ?? null,
              lod: this.lod(),
            }
          : null;
    }
    this.strokeDirty = false;

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
    const lod = this.lodFor(zoomRel);

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

    // 1. The original Earth: each country's flag clipped to its land.
    ctx.imageSmoothingEnabled = true;
    for (const c of this.world.countries) {
      if (bboxIntersects(c.box, visible)) this.drawCountry(ctx, c, lod, s, visible);
    }

    const width = clamp(0.6 + Math.log2(zoomRel) * 0.25, 0.6, 1.6);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // 2. Borders between countries (painted land is drawn over these).
    if (this.options.showBorders) {
      ctx.strokeStyle = BORDER;
      ctx.lineWidth = width / s;
      this.strokeLines(ctx, this.world.inner, lod, visible);
    }

    // 3. Painted territory, oldest first.
    if (this.territory) this.drawLayers(ctx, lod, s, visible, width);

    // 4. Coastlines on top, so painted land keeps a crisp coast.
    if (this.options.showBorders) {
      ctx.strokeStyle = BORDER;
      ctx.lineWidth = width / s;
      this.strokeLines(ctx, this.world.coast, lod, visible);
      // Small countries (Gibraltar, Monaco, Andorra…) get a bolder outline so they stand out.
      ctx.lineWidth = (width + 1) / s;
      ctx.strokeStyle = 'rgba(10, 14, 22, 0.95)';
      for (const c of this.world.countries) {
        const px = Math.max(bboxWidth(c.box), bboxHeight(c.box)) * s;
        if (px < SMALL_OUTLINE_PX[0] || px > SMALL_OUTLINE_PX[1] || c.clusters.length > 3) continue;
        if (!bboxIntersects(c.box, visible)) continue;
        if (this.isConquered(c.info.id)) continue;
        ctx.stroke(this.pick(c.outline, lod));
      }
    }

    if (!decorations) return;

    // Hover and selection outlines.
    const hover = this.hoverId && this.hoverId !== this.selectedId ? this.world.byId.get(this.hoverId) : null;
    if (hover) {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2 / s;
      ctx.stroke(this.pick(hover.outline, lod));
    }
    const sel = this.selectedId ? this.world.byId.get(this.selectedId) : null;
    if (sel) {
      const path = this.pick(sel.outline, lod);
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 5.5 / s;
      ctx.stroke(path);
      ctx.strokeStyle = SELECT;
      ctx.lineWidth = 3 / s;
      // Borders have changed: the gold line shows the country's REAL borders, dashed.
      const changed = this.territory?.layers().some((l) => l.owner === sel.info.id || l.resetId === sel.info.id || bboxIntersects(l.box, sel.box));
      if (changed) ctx.setLineDash([8 / s, 6 / s]);
      ctx.stroke(path);
      ctx.setLineDash([]);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawMarkers(ctx, cam, visible, zoomRel);

    // Labels share one list of placed boxes so names never overlap each other.
    const placed: LabelBox[] = [];
    if (this.options.showLabels) this.drawLabels(ctx, cam, visible, sel ?? null, placed);
    if (this.options.showCapitals) this.drawCapitals(ctx, cam, visible, zoomRel, placed);
  }

  /** Capital cities: a yellow star with a yellow name, shown when zoomed in enough. */
  private drawCapitals(ctx: CanvasRenderingContext2D, cam: Camera, visible: BBox, zoomRel: number, placed: LabelBox[]) {
    const s = cam.scale;
    const fs = 13;
    ctx.font = `700 ${fs}px ${LABEL_FONT}`;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const cap of this.world.capitals) {
      if (!bboxContainsPoint(visible, cap.x, cap.y)) continue;
      const country = this.world.byId.get(cap.id);
      if (!country) continue;
      const countryPx = Math.max(bboxWidth(country.mainBox), bboxHeight(country.mainBox)) * s;
      if (countryPx < CAPITAL_MIN_COUNTRY_PX && zoomRel < CAPITAL_ANY_ZOOM) continue;
      // Tiny countries already have a dot and a name; a star on top would just add clutter.
      if (isTiny(country, s)) continue;
      const [x, y] = worldToScreen(cam, cap.x, cap.y);
      // "Monaco ★ Monaco": when a small country's capital shares its name, show just the star.
      const sameName = cap.name.toLowerCase().startsWith(country.info.name.toLowerCase());
      if (sameName && countryPx < CAPITAL_MIN_COUNTRY_PX * 2) {
        const box = { x0: x - 7, y0: y - 7, x1: x + 7, y1: y + 7 };
        if (!overlaps(placed, box)) {
          placed.push(box);
          drawStar(ctx, x, y, 6);
        }
        continue;
      }
      const w = this.unitWidth(cap.name, 700) * fs;
      // Try the name on the right of the star, then the left, then below.
      const options: [LabelBox, number, CanvasTextAlign][] = [
        [{ x0: x - 7, y0: y - fs * 0.7, x1: x + 9 + w, y1: y + fs * 0.7 }, x + 9, 'left'],
        [{ x0: x - 9 - w, y0: y - fs * 0.7, x1: x + 7, y1: y + fs * 0.7 }, x - 9, 'right'],
        [{ x0: x - w / 2 - 3, y0: y - 7, x1: x + w / 2 + 3, y1: y + 9 + fs * 1.2 }, x, 'center'],
      ];
      const fit = options.find(([b]) => !overlaps(placed, b));
      if (!fit) continue;
      placed.push(fit[0]);
      drawStar(ctx, x, y, 6);
      ctx.textAlign = fit[2];
      const ty = fit[2] === 'center' ? y + 9 + fs * 0.55 : y;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(10,14,22,0.9)';
      ctx.strokeText(cap.name, fit[1], ty);
      ctx.fillStyle = CAPITAL;
      ctx.fillText(cap.name, fit[1], ty);
    }
  }

  /** Dots for countries too small to see, so they can still be found and tapped. */
  private drawMarkers(ctx: CanvasRenderingContext2D, cam: Camera, visible: BBox, zoomRel: number) {
    this.markers = [];
    const s = cam.scale;
    for (const c of this.world.countries) {
      const tiny = isTiny(c, s);
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

  private drawLabels(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    visible: BBox,
    selected: CountryShape | null,
    placed: LabelBox[],
  ) {
    const s = cam.scale;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    const draw = (c: CountryShape, fs: number) => {
      const [x, y0] = worldToScreen(cam, c.labelPoint[0], c.labelPoint[1]);
      // Tiny countries are shown as a dot: put the name above the dot, not on top of it.
      const y = isTiny(c, s) ? y0 - MARKER_RADIUS - fs * 0.9 : y0;
      const w = this.unitWidth(c.info.name) * fs;
      const box = { x0: x - w / 2 - 3, y0: y - fs * 0.65, x1: x + w / 2 + 3, y1: y + fs * 0.65 };
      if (overlaps(placed, box)) return;
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
      if (this.isConquered(c.info.id)) continue;
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

  // ------------------------------------------------------------ drawing helpers

  /** Draw one country's flag(s) clipped to its land (the original Earth). */
  private drawCountry(ctx: CanvasRenderingContext2D, c: CountryShape, lod: Lod, s: number, visible: BBox) {
    const code = c.info.flag;
    const rects = this.ownerGroups().cluster.get(c.info.id);
    c.clusters.forEach((cl, i) => {
      if (!bboxIntersects(cl.box, visible)) return;
      const path = this.pick(cl.path, lod);
      const r = rects?.[i] ?? cl.flagRect;
      this.fillWithFlag(ctx, path, 'evenodd', code, r, Math.max(bboxWidth(cl.box), bboxHeight(cl.box)) * s, s);
    });
  }

  /** Fill a shape with a flag stretched over `rect` (or the flag's main colour when tiny). */
  private fillWithFlag(
    ctx: CanvasRenderingContext2D,
    path: Path2D,
    rule: CanvasFillRule,
    code: string | null,
    rect: Rect,
    shapePx: number,
    s: number,
  ) {
    const src = shapePx >= MIN_FLAG_PX && this.flags.has(code) ? this.flags.source(code, rect.w * s) : null;
    if (!src) {
      ctx.fillStyle = this.flags.averageColor(code);
      ctx.fill(path, rule);
      return;
    }
    ctx.save();
    ctx.clip(path, rule);
    // Backup fill in the flag's main colour, so no bit of land is ever left empty.
    ctx.fillStyle = this.flags.averageColor(code);
    ctx.fill(path, rule);
    ctx.drawImage(src.image, src.sx, src.sy, src.sw, src.sh, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  /** Stroke only the line pieces that are on screen. */
  private strokeLines(ctx: CanvasRenderingContext2D, lines: Record<Lod, LineBuckets | null>, lod: Lod, visible: BBox) {
    const set = (lod === 'max' ? lines.max ?? lines.hi : lod === 'hi' ? lines.hi : null) ?? lines.lo;
    if (!set) return;
    for (const cell of set.cells.values()) if (bboxIntersects(cell.box, visible)) ctx.stroke(cell.path);
  }

  /**
   * Painted territory. Each painted area is drawn country by country: clipped to that
   * country's land (so painting never covers the sea) and to the brush strokes, then
   * filled with the painter's flag. A dark line around the strokes becomes the new border.
   */
  private drawLayers(ctx: CanvasRenderingContext2D, lod: Lod, s: number, visible: BBox, width: number) {
    const layers = this.territory!.layers();
    const live = new Set<string>();
    for (const layer of layers) {
      const clip = this.layerClip(layer, lod);
      if (!clip) continue;
      live.add(clip.cacheKey);
      if (!bboxIntersects(clip.box, visible)) continue;
      const within = layer.within ? this.world.byId.get(layer.within) : undefined;
      if (layer.kind === 'paint') {
        const owner = this.world.byId.get(layer.owner!);
        if (!owner) continue;
        const rect = this.ownerGroups().layer.get(layer.key) ?? owner.clusters[0].flagRect;
        const code = owner.info.flag;
        const px = Math.max(bboxWidth(clip.box), bboxHeight(clip.box)) * s;
        // Paint only covers land: the locked country, or (older strokes) all land underneath.
        let land: Path2D;
        let foreign: Path2D;
        if (within) {
          land = this.pick(within.outline, lod);
          foreign = land;
        } else {
          land = this.landUnder(clip.box, lod, `${clip.cacheKey}|${lod}`);
          live.add(`${clip.cacheKey}|${lod}`);
          // Adding the painter's own outline again cuts it out (even-odd rule): no border on own land.
          const foreignKey = `${clip.cacheKey}|${lod}|not-own`;
          live.add(foreignKey);
          foreign = this.layerPaths.get(foreignKey) ?? new Path2D(land);
          if (!this.layerPaths.has(foreignKey)) {
            if (bboxIntersects(owner.box, clip.box)) foreign.addPath(this.pick(owner.outline, lod));
            this.layerPaths.set(foreignKey, foreign);
          }
        }
        if (this.options.showBorders && !layer.whole) {
          // The outer half of this line stays visible as the new border.
          ctx.save();
          ctx.clip(foreign, 'evenodd');
          ctx.strokeStyle = BORDER;
          ctx.lineWidth = (width * 2) / s;
          ctx.stroke(clip.path);
          ctx.restore();
        }
        ctx.save();
        ctx.clip(land, 'evenodd');
        this.fillWithFlag(ctx, clip.path, layer.whole ? 'evenodd' : 'nonzero', code, rect, Math.max(px, MIN_FLAG_PX), s);
        ctx.restore();
        if (this.options.showBorders && layer.whole) {
          ctx.strokeStyle = BORDER;
          ctx.lineWidth = width / s;
          ctx.stroke(land);
        }
      } else {
        // Erase / reset: draw the original countries again inside the area.
        const area = { minX: Math.max(clip.box.minX, visible.minX), minY: Math.max(clip.box.minY, visible.minY), maxX: Math.min(clip.box.maxX, visible.maxX), maxY: Math.min(clip.box.maxY, visible.maxY) };
        ctx.save();
        if (within) ctx.clip(this.pick(within.outline, lod), 'evenodd');
        ctx.clip(clip.path, layer.whole ? 'evenodd' : 'nonzero');
        for (const c of within ? [within] : this.world.countries) {
          if (!bboxIntersects(c.box, area)) continue;
          this.drawCountry(ctx, c, lod, s, visible);
        }
        if (this.options.showBorders) {
          ctx.strokeStyle = BORDER;
          ctx.lineWidth = width / s;
          if (within) ctx.stroke(this.pick(within.outline, lod));
          else this.strokeLines(ctx, this.world.inner, lod, area);
        }
        ctx.restore();
      }
    }
    // Forget paths for layers that no longer exist.
    if (this.layerPaths.size > live.size + 20) for (const k of this.layerPaths.keys()) if (!live.has(k)) this.layerPaths.delete(k);
  }

  /**
   * While a finger paints, add only the newest brush marks on top of what is already on
   * screen. Labels and new border lines are drawn properly when the finger lifts.
   */
  private drawStrokeIncrement(circles: number[], kind: 'paint' | 'erase', ownerId?: string, withinId?: string) {
    const live = this.live!;
    const within = withinId ? this.world.byId.get(withinId) : undefined;
    if (!within || live.drawn >= circles.length) {
      live.drawn = circles.length;
      return;
    }
    const ctx = this.ctx;
    const s = this.cam.scale;
    const dpr = this.dpr;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * this.cam.x, dpr * this.cam.y);
    // The new circles, plus the last one already drawn so the edges overlap smoothly.
    const path = new Path2D();
    const box = emptyBBox();
    for (let i = Math.max(0, live.drawn - 3); i < circles.length; i += 3) {
      const x = circles[i], y = circles[i + 1], r = circles[i + 2];
      path.moveTo(x + r, y);
      path.arc(x, y, r, 0, Math.PI * 2);
      box.minX = Math.min(box.minX, x - r);
      box.minY = Math.min(box.minY, y - r);
      box.maxX = Math.max(box.maxX, x + r);
      box.maxY = Math.max(box.maxY, y + r);
    }
    ctx.save();
    ctx.clip(this.pick(within.outline, live.lod), 'evenodd');
    if (kind === 'paint') {
      const owner = ownerId ? this.world.byId.get(ownerId) : undefined;
      if (owner) {
        const rect = live.rect ?? owner.clusters[0].flagRect;
        this.fillWithFlag(ctx, path, 'nonzero', owner.info.flag, rect, MIN_FLAG_PX * 4, s);
      }
    } else {
      ctx.clip(path, 'nonzero');
      this.drawCountry(ctx, within, live.lod, s, box);
    }
    ctx.restore();
    live.drawn = circles.length;
  }

  /**
   * All the land inside a box, as one path. Countries never overlap, so with the
   * even-odd rule this is exactly "land" (and enclaves like Lesotho still work).
   */
  private landUnder(box: BBox, lod: Lod, cacheKey: string): Path2D {
    let path = this.layerPaths.get(cacheKey);
    if (path) return path;
    path = new Path2D();
    for (const c of this.world.countries) if (bboxIntersects(c.box, box)) path.addPath(this.pick(c.outline, lod));
    this.layerPaths.set(cacheKey, path);
    return path;
  }

  /** The shape a layer covers, as a drawing path (cached). */
  private layerClip(layer: Layer, lod: Lod): { path: Path2D; box: BBox; cacheKey: string } | null {
    if (layer.kind === 'resetCountry') {
      const c = this.world.byId.get(layer.resetId!);
      if (!c) return null;
      const absorbs = layer.absorbs ?? [];
      const cacheKey = `${layer.key}|${lod}|${absorbs.map((a) => a.key).join(',')}`;
      let path = this.layerPaths.get(cacheKey);
      if (!path) {
        path = new Path2D();
        path.addPath(this.pick(c.outline, lod));
        for (const a of absorbs) {
          const ac = a.whole ? this.world.byId.get(a.within!) : undefined;
          path.addPath(ac ? this.pick(ac.outline, lod) : this.circlesPath(a));
        }
        this.layerPaths.set(cacheKey, path);
      }
      const box = absorbs.reduce((b, a) => unionBBox(b, layerBox(a, this.world)), c.box);
      return { path, box, cacheKey };
    }
    if (layer.whole) {
      const c = this.world.byId.get(layer.within!);
      if (!c) return null;
      return { path: this.pick(c.outline, lod), box: c.box, cacheKey: `${layer.key}|${lod}` };
    }
    const within = layer.within ? this.world.byId.get(layer.within) : undefined;
    const box = within ? intersectBox(layer.box, within.box) : layer.box;
    return { path: this.circlesPath(layer), box, cacheKey: layer.key };
  }

  private circlesPath(layer: Layer): Path2D {
    let path = this.layerPaths.get(layer.key);
    if (path) return path;
    path = new Path2D();
    const c = layer.circles;
    for (let i = 0; i < c.length; i += 3) {
      path.moveTo(c[i] + c[i + 2], c[i + 1]);
      path.arc(c[i], c[i + 1], c[i + 2], 0, Math.PI * 2);
    }
    this.layerPaths.set(layer.key, path);
    return path;
  }

  /**
   * One flag per country across its home AND the land it painted nearby, so Germany's
   * flag stretches over Germany plus the captured part of Poland as one country.
   * Land painted far from home gets its own whole flag.
   */
  private ownerGroups() {
    const version = this.territory?.version ?? -1;
    if (this.groups && this.groups.version === version) return this.groups;
    const cluster = new Map<string, Rect[]>();
    const layerRects = new Map<string, Rect>();
    const layers = this.territory?.layers() ?? [];
    const owners = new Set(layers.filter((l) => l.kind === 'paint').map((l) => l.owner!));
    for (const id of owners) {
      const c = this.world.byId.get(id);
      if (!c) continue;
      const groups = c.clusters.map((cl) => ({ box: { ...cl.box }, members: [] as string[], grown: false }));
      for (const l of layers) {
        if (l.kind !== 'paint' || l.owner !== id) continue;
        const lb = layerBox(l, this.world);
        let g = groups.find((g) => bboxIntersects(expandBox(g.box), lb));
        if (!g) {
          g = { box: emptyBBox(), members: [], grown: true };
          groups.push(g);
        }
        g.box = unionBBox(g.box, lb);
        g.grown = true;
        g.members.push(l.key);
      }
      const rects = groups.map((g) => fitFlagRect(g.box));
      cluster.set(
        id,
        c.clusters.map((cl, i) => (groups[i].grown ? rects[i] : cl.flagRect)),
      );
      groups.forEach((g, i) => g.members.forEach((k) => layerRects.set(k, rects[i])));
    }
    this.groups = { version, cluster, layer: layerRects };
    return this.groups;
  }

  private isConquered(id: string): boolean {
    const t = this.territory;
    if (!t) return false;
    // Measuring every country is too slow to do on every brush movement; refresh between strokes.
    if (this.conquered.version !== t.version && !t.painting) {
      const ids = new Set<string>();
      for (const c of this.world.countries) if (t.isConquered(c.info.id)) ids.add(c.info.id);
      this.conquered = { version: t.version, ids };
    }
    return this.conquered.ids.has(id);
  }

  /** Width of a label at a 1px font size (text width scales linearly). */
  private unitWidth(text: string, weight = 700): number {
    const key = `${weight}|${text}`;
    let w = this.labelWidth.get(key);
    if (w === undefined) {
      this.hitCtx.font = `${weight} 100px ${LABEL_FONT}`;
      w = this.hitCtx.measureText(text).width / 100;
      this.labelWidth.set(key, w);
    }
    return w;
  }
}

interface LabelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Too small to see as a shape on screen? Uses width AND height, because some micro-states
 * (like the Vatican) are thin slivers in the map data.
 */
const isTiny = (c: CountryShape, scale: number) =>
  Math.max(bboxWidth(c.box), bboxHeight(c.box)) * scale < 6 ||
  Math.sqrt(bboxWidth(c.box) * bboxHeight(c.box)) * scale < 4;

const overlaps = (placed: LabelBox[], b: LabelBox) =>
  placed.some((p) => p.x0 < b.x1 && p.x1 > b.x0 && p.y0 < b.y1 && p.y1 > b.y0);

/** The area a layer can change: brush circles, but never outside the country it is locked to. */
function layerBox(l: Layer, world: World): BBox {
  const within = l.within ? world.byId.get(l.within) : undefined;
  if (l.whole) return within ? within.box : l.box;
  return within ? intersectBox(l.box, within.box) : l.box;
}

function intersectBox(a: BBox, b: BBox): BBox {
  return { minX: Math.max(a.minX, b.minX), minY: Math.max(a.minY, b.minY), maxX: Math.min(a.maxX, b.maxX), maxY: Math.min(a.maxY, b.maxY) };
}

const sameCamera = (a: Camera, b: Camera) => a.x === b.x && a.y === b.y && a.scale === b.scale;

/** How far away painted land can be and still share its country's flag. */
const expandBox = (b: BBox): BBox => {
  const pad = Math.max(bboxWidth(b), bboxHeight(b)) * 0.3 + 1;
  return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
};

const bboxContainsPoint = (b: BBox, x: number, y: number) => x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;

/** Five-pointed capital-city star with a dark edge so it shows on any flag. */
function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(10,14,22,0.9)';
  ctx.stroke();
  ctx.fillStyle = CAPITAL;
  ctx.fill();
}
