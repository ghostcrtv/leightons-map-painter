/**
 * Touch, mouse and trackpad input for the map.
 *
 *   one finger / mouse drag   -> pan (with a gentle glide on release)
 *   two-finger pinch          -> zoom + pan
 *   tap / click               -> select
 *   double tap / double click -> zoom in
 *   mouse wheel / pinch on a Mac trackpad -> zoom; two-finger trackpad swipe -> pan
 *
 * Uses Pointer Events, which iPad Safari supports, so touch and mouse share one path.
 * Later phases (painting) will plug in here: when a paint tool is active, one-finger
 * drags will paint instead of pan, and two fingers will still move the map.
 */

export interface GestureHandlers {
  panBy(dx: number, dy: number): void;
  zoomAt(factor: number, x: number, y: number): void;
  tap(x: number, y: number): void;
  doubleTap(x: number, y: number): void;
  hover(x: number, y: number): void;
  hoverEnd(): void;
  begin(): void;
  end(vx: number, vy: number): void;
}

/** A press that moves less than this is a tap, not a drag (bigger for fingers). */
const TAP_SLOP_MOUSE = 4;
const TAP_SLOP_TOUCH = 10;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DIST = 30;

interface Pt {
  x: number;
  y: number;
}

export class GestureController {
  private pointers = new Map<number, Pt & { type: string }>();
  private start: (Pt & { t: number; id: number }) | null = null;
  private moved = false;
  private pinch: { dist: number; mid: Pt } | null = null;
  private samples: { x: number; y: number; t: number }[] = [];
  private lastTap: { x: number; y: number; t: number } | null = null;
  private active = false;
  private wheelTimer = 0;

  constructor(
    private el: HTMLElement,
    private h: GestureHandlers,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    // Stop iPad Safari from zooming the whole page instead of the map.
    document.addEventListener('gesturestart', prevent, { passive: false } as AddEventListenerOptions);
    document.addEventListener('gesturechange', prevent, { passive: false } as AddEventListenerOptions);
  }

  destroy() {
    clearTimeout(this.wheelTimer);
    const el = this.el;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointercancel', this.onUp);
    el.removeEventListener('pointerleave', this.onLeave);
    el.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('gesturestart', prevent);
    document.removeEventListener('gesturechange', prevent);
  }

  private local(e: PointerEvent | WheelEvent): Pt {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* not critical: we still get the events while the finger stays on the map */
    }
    const p = this.local(e);
    this.pointers.set(e.pointerId, { ...p, type: e.pointerType });
    if (!this.active) {
      this.active = true;
      this.h.begin();
    }
    if (this.pointers.size === 1) {
      this.start = { ...p, t: performance.now(), id: e.pointerId };
      this.moved = false;
      this.samples = [{ ...p, t: performance.now() }];
    } else if (this.pointers.size === 2) {
      this.moved = true; // a two-finger gesture is never a tap
      this.pinch = this.pinchState();
    }
  };

  private onMove = (e: PointerEvent) => {
    const p = this.local(e);
    const prev = this.pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse') this.h.hover(p.x, p.y);
      return;
    }
    this.pointers.set(e.pointerId, { ...p, type: e.pointerType });

    if (this.pointers.size >= 2) {
      const now = this.pinchState();
      if (this.pinch && now) {
        if (this.pinch.dist > 0) this.h.zoomAt(now.dist / this.pinch.dist, now.mid.x, now.mid.y);
        this.h.panBy(now.mid.x - this.pinch.mid.x, now.mid.y - this.pinch.mid.y);
      }
      this.pinch = now;
      return;
    }

    if (this.start && !this.moved) {
      const slop = e.pointerType === 'mouse' ? TAP_SLOP_MOUSE : TAP_SLOP_TOUCH;
      if (Math.hypot(p.x - this.start.x, p.y - this.start.y) < slop) return;
      this.moved = true;
    }
    this.h.panBy(p.x - prev.x, p.y - prev.y);
    const t = performance.now();
    this.samples.push({ ...p, t });
    while (this.samples.length > 2 && t - this.samples[0].t > 100) this.samples.shift();
  };

  private onUp = (e: PointerEvent) => {
    const p = this.local(e);
    const had = this.pointers.delete(e.pointerId);
    if (!had) return;

    if (this.pointers.size === 1) {
      // Lifting one finger of a pinch: carry on panning with the other without a jump.
      this.pinch = null;
      this.samples = [];
      return;
    }
    if (this.pointers.size > 0) {
      this.pinch = this.pinchState();
      return;
    }

    this.pinch = null;
    this.active = false;
    let vx = 0;
    let vy = 0;
    if (this.moved && this.samples.length >= 2 && e.type === 'pointerup') {
      const a = this.samples[0];
      const b = this.samples[this.samples.length - 1];
      const dt = b.t - a.t;
      if (dt > 0 && performance.now() - b.t < 60) {
        vx = (b.x - a.x) / dt;
        vy = (b.y - a.y) / dt;
      }
    }
    this.h.end(vx, vy);

    if (!this.moved && e.type === 'pointerup' && this.start) {
      const t = performance.now();
      const last = this.lastTap;
      if (last && t - last.t < DOUBLE_TAP_MS && Math.hypot(p.x - last.x, p.y - last.y) < DOUBLE_TAP_DIST) {
        this.lastTap = null;
        this.h.doubleTap(p.x, p.y);
      } else {
        this.lastTap = { ...p, t };
        this.h.tap(p.x, p.y);
      }
    }
    this.start = null;
  };

  private onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && !this.pointers.size) this.h.hoverEnd();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = this.local(e);
    // Treat a burst of wheel events as one gesture so slow devices can use the fast path.
    if (!this.active && !this.wheelTimer) this.h.begin();
    clearTimeout(this.wheelTimer);
    this.wheelTimer = window.setTimeout(() => {
      this.wheelTimer = 0;
      if (!this.active) this.h.end(0, 0);
    }, 160);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    if (e.ctrlKey) {
      // Trackpad pinch (and ctrl + wheel).
      this.h.zoomAt(Math.exp(-dy * 0.012), p.x, p.y);
    } else if (Math.abs(dx) > 0.5) {
      // Two-finger trackpad swipe.
      this.h.panBy(-dx, -dy);
    } else {
      this.h.zoomAt(Math.exp(-clampWheel(dy) * 0.003), p.x, p.y);
    }
  };

  private pinchState(): { dist: number; mid: Pt } | null {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return null;
    const [a, b] = pts;
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }
}

function prevent(e: Event) {
  e.preventDefault();
}

const clampWheel = (d: number) => Math.max(-120, Math.min(120, d));
