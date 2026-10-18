import { useEffect, useRef } from 'react';
import { loadCountryRegistry } from '../data/countries';
import { BRUSH_PX, useGame } from '../game/store';
import { createTerritory, getTerritory } from '../territory/session';
import { loadStats } from '../stats/session';
import { attachMap } from '../game/mapController';
import { FlagLibrary } from './flags';
import { GestureController } from './gestures';
import { MapRenderer } from './MapRenderer';
import { loadDetail, loadWorld } from './world';

const BASE = import.meta.env.BASE_URL;

/** The full-screen map. Loads the world, then hands drawing over to MapRenderer. */
export function MapView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ring = ringRef.current!;
    const game = useGame.getState();
    /**
     * The brush outline is a small page element moved with CSS, not drawn on the map,
     * so following the finger never makes the map redraw.
     */
    const showRing = (x: number, y: number, radius: number, erase: boolean) => {
      ring.hidden = false;
      ring.style.width = ring.style.height = `${radius * 2}px`;
      ring.style.transform = `translate(${x - radius}px, ${y - radius}px)`;
      ring.classList.toggle('erase', erase);
    };
    const hideRing = () => {
      ring.hidden = true;
    };
    let renderer: MapRenderer | null = null;
    let gestures: GestureController | null = null;
    let cancelled = false;
    const cleanups: (() => void)[] = [];

    (async () => {
      try {
        game.setLoading('Loading countries…');
        const { countries: registry, capitals } = await loadCountryRegistry(BASE);
        game.setLoading('Drawing borders and flags…');
        const [world, flags] = await Promise.all([
          loadWorld(BASE, registry, capitals),
          FlagLibrary.load(BASE),
          loadStats(BASE, registry.map((c) => c.id)),
        ]);
        if (cancelled) return;

        renderer = new MapRenderer(canvas, world, flags);
        const r = renderer;
        attachMap(r, flags);
        if (window.location.search.includes('debug')) (window as unknown as { __map: MapRenderer }).__map = r;
        const s = useGame.getState();
        r.setOptions({ showLabels: s.showLabels, showBorders: s.showBorders, showCapitals: s.showCapitals });
        r.setSelected(s.selectedId);

        /** One finger paints when Paint (with a country chosen) or Erase is on. */
        const paintMode = () => {
          const st = useGame.getState();
          return !!getTerritory() && (st.tool === 'erase' || (st.tool === 'paint' && !!st.painterId));
        };
        const toWorld = (x: number, y: number) => r.toWorld(x, y);
        let fillAt: [number, number] | null = null;
        /**
         * A stroke only changes ONE country: the first one it reaches that it can change
         * (for Paint, not the painter's own land). Until then the pen just follows the finger.
         */
        const paintTo = (x: number, y: number) => {
          const t = getTerritory();
          if (!t) return;
          const [wx, wy] = toWorld(x, y);
          if (!t.strokeLocked) {
            const st = useGame.getState();
            const id = r.countryAt(x, y);
            if (id && (st.tool === 'erase' || id !== st.painterId)) t.lockStroke(id);
            else {
              t.trackStroke(wx, wy);
              return;
            }
          }
          t.extendStroke(wx, wy);
        };
        gestures = new GestureController(canvas, {
          panBy: (dx, dy) => r.panBy(dx, dy),
          zoomAt: (f, x, y) => r.zoomAt(f, x, y),
          tap: (x, y) => {
            const st = useGame.getState();
            const id = r.hitTest(x, y);
            // Paint tool with no country chosen yet: the tapped country becomes the painter.
            if (st.tool === 'paint' && !st.painterId) {
              if (id) {
                st.setPainter(id);
                st.select(id);
              }
              return;
            }
            st.select(id);
          },
          doubleTap: (x, y) => r.zoomAt(2, x, y),
          hover: (x, y) => {
            const st = useGame.getState();
            if (paintMode()) {
              r.setHover(null);
              if (st.brush === 'F') hideRing();
              else showRing(x, y, BRUSH_PX[st.brush], st.tool === 'erase');
            } else {
              hideRing();
              r.setHover(r.hitTest(x, y));
            }
          },
          hoverEnd: () => {
            r.setHover(null);
            hideRing();
          },
          begin: () => r.beginInteraction(),
          end: (vx, vy) => r.endInteraction(vx, vy),
          paintMode,
          paintStart: (x, y) => {
            const t = getTerritory();
            const st = useGame.getState();
            if (!t) return;
            if (st.brush === 'F') {
              fillAt = [x, y]; // Fill happens when the finger lifts (so a two-finger move can cancel it)
              return;
            }
            t.beginStroke(st.tool === 'paint' ? 'paint' : 'erase', BRUSH_PX[st.brush] / r.scale, st.painterId ?? undefined);
            paintTo(x, y);
          },
          paintMove: (x, y) => {
            if (fillAt) return;
            paintTo(x, y);
          },
          paintEnd: () => {
            const t = getTerritory();
            const st = useGame.getState();
            if (fillAt && t) {
              const id = r.countryAt(fillAt[0], fillAt[1]);
              if (id) {
                if (st.tool === 'erase') t.fill(id);
                else if (st.painterId && id !== st.painterId) t.fill(id, st.painterId);
              }
              fillAt = null;
              return;
            }
            t?.endStroke();
          },
          paintCancel: () => {
            fillAt = null;
            getTerritory()?.cancelStroke();
          },
        });

        // Keep the renderer in sync with the store without re-rendering React.
        cleanups.push(
          useGame.subscribe((st, prev) => {
            if (st.selectedId !== prev.selectedId) r.setSelected(st.selectedId);
            if (st.tool !== prev.tool || st.painterId !== prev.painterId || st.brush !== prev.brush) {
              hideRing();
              canvas.style.cursor = paintMode() ? 'crosshair' : '';
            }
            if (
              st.showLabels !== prev.showLabels ||
              st.showBorders !== prev.showBorders ||
              st.showCapitals !== prev.showCapitals
            ) {
              r.setOptions({ showLabels: st.showLabels, showBorders: st.showBorders, showCapitals: st.showCapitals });
            }
          }),
        );

        const ro = new ResizeObserver(() => r.resize());
        ro.observe(canvas);
        cleanups.push(() => ro.disconnect());

        useGame.getState().setReady(registry);

        // Sharper borders for zooming in, built quietly in the background.
        // Then the territory engine (it measures land using those detailed borders).
        const startTerritory = () => {
          if (cancelled) return;
          try {
            r.setTerritory(createTerritory(world));
          } catch (e) {
            console.error('Territory painting could not start.', e);
          }
        };
        loadDetail(BASE, world, 'hi')
          .then(() => {
            if (cancelled) return;
            r.invalidate();
            setTimeout(startTerritory, 50);
          })
          .catch((e) => {
            console.warn('Detailed borders could not load; using simpler ones.', e);
            startTerritory();
          });
        // Full-detail borders are big, so they only download if the player zooms in close.
        r.onNeedMaxDetail = () => {
          loadDetail(BASE, world, 'max')
            .then(() => !cancelled && r.invalidate())
            .catch((e) => console.warn('Full-detail borders could not load.', e));
        };
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
      const st = useGame.getState();
      // A window (Help, Settings, tour) is open: keys belong to it.
      if (st.helpOpen || st.settingsOpen || st.tourOpen || st.actionsOpen || st.rankingsOpen) return;
      // Undo: Cmd/Ctrl+Z · Redo: Shift+Cmd/Ctrl+Z or Ctrl+Y
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) {
        const redo = e.key === 'y' || e.shiftKey;
        if (redo) getTerritory()?.redo();
        else getTerritory()?.undo();
        e.preventDefault();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case 'b':
        case 'p':
          if (st.territoryReady) {
            if (!st.painterId && st.selectedId) st.setPainter(st.selectedId);
            st.setTool('paint');
          }
          break;
        case 'e':
          if (st.territoryReady) st.setTool('erase');
          break;
        case 'v':
          st.setTool('select');
          break;
        case '1':
          st.setBrush('S');
          break;
        case '2':
          st.setBrush('M');
          break;
        case '3':
          st.setBrush('L');
          break;
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
          if (st.tool !== 'select') st.setTool('select');
          else st.select(null);
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

  return (
    <>
      <canvas ref={canvasRef} className="map-canvas" aria-label="World map" role="img" />
      <div ref={ringRef} className="brush-ring" hidden aria-hidden />
    </>
  );
}
