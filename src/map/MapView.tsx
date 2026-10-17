import { useEffect, useRef } from 'react';
import { loadCountryRegistry } from '../data/countries';
import { useGame } from '../game/store';
import { attachMap } from '../game/mapController';
import { FlagLibrary } from './flags';
import { GestureController } from './gestures';
import { MapRenderer } from './MapRenderer';
import { loadHiDetail, loadWorld } from './world';

const BASE = import.meta.env.BASE_URL;

/** The full-screen map. Loads the world, then hands drawing over to MapRenderer. */
export function MapView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const game = useGame.getState();
    let renderer: MapRenderer | null = null;
    let gestures: GestureController | null = null;
    let cancelled = false;
    const cleanups: (() => void)[] = [];

    (async () => {
      try {
        game.setLoading('Loading countries…');
        const registry = await loadCountryRegistry(BASE);
        game.setLoading('Drawing borders and flags…');
        const [world, flags] = await Promise.all([loadWorld(BASE, registry), FlagLibrary.load(BASE)]);
        if (cancelled) return;

        renderer = new MapRenderer(canvas, world, flags);
        const r = renderer;
        attachMap(r, flags);
        if (window.location.search.includes('debug')) (window as unknown as { __map: MapRenderer }).__map = r;
        const s = useGame.getState();
        r.setOptions({ showLabels: s.showLabels, showBorders: s.showBorders });
        r.setSelected(s.selectedId);

        gestures = new GestureController(canvas, {
          panBy: (dx, dy) => r.panBy(dx, dy),
          zoomAt: (f, x, y) => r.zoomAt(f, x, y),
          tap: (x, y) => useGame.getState().select(r.hitTest(x, y)),
          doubleTap: (x, y) => r.zoomAt(2, x, y),
          hover: (x, y) => r.setHover(r.hitTest(x, y)),
          hoverEnd: () => r.setHover(null),
          begin: () => r.beginInteraction(),
          end: (vx, vy) => r.endInteraction(vx, vy),
        });

        // Keep the renderer in sync with the store without re-rendering React.
        cleanups.push(
          useGame.subscribe((st, prev) => {
            if (st.selectedId !== prev.selectedId) r.setSelected(st.selectedId);
            if (st.showLabels !== prev.showLabels || st.showBorders !== prev.showBorders) {
              r.setOptions({ showLabels: st.showLabels, showBorders: st.showBorders });
            }
          }),
        );

        const ro = new ResizeObserver(() => r.resize());
        ro.observe(canvas);
        cleanups.push(() => ro.disconnect());

        useGame.getState().setReady(registry);

        // Sharper borders for zooming in, built quietly in the background.
        loadHiDetail(BASE, world)
          .then(() => !cancelled && r.invalidate())
          .catch((e) => console.warn('Detailed borders could not load; using simpler ones.', e));
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          useGame
            .getState()
            .setError('The map could not be loaded. Check your internet connection and reload the page.');
        }
      }
    })();

    const onKey = (e: KeyboardEvent) => {
      if (!renderer || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
      const r = renderer;
      const step = 120;
      switch (e.key) {
        case '+':
        case '=':
          r.zoomStep(2);
          break;
        case '-':
        case '_':
          r.zoomStep(0.5);
          break;
        case '0':
          r.showWholeWorld();
          break;
        case 'ArrowLeft':
          r.panBy(step, 0);
          break;
        case 'ArrowRight':
          r.panBy(-step, 0);
          break;
        case 'ArrowUp':
          r.panBy(0, step);
          break;
        case 'ArrowDown':
          r.panBy(0, -step);
          break;
        case 'Escape':
          useGame.getState().select(null);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
      cleanups.forEach((f) => f());
      gestures?.destroy();
      renderer?.destroy();
      attachMap(null, null);
    };
  }, []);

  return <canvas ref={canvasRef} className="map-canvas" aria-label="World map" role="img" />;
}
