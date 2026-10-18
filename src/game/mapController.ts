/**
 * A tiny bridge so buttons anywhere in the UI can move the map
 * without passing the renderer through React props.
 */
import type { MapRenderer } from '../map/MapRenderer';
import type { FlagLibrary } from '../map/flags';
import { getTerritory } from '../territory/session';
import { isCoastal } from '../territory/regions';

let coastCache = { key: '', value: false };

let renderer: MapRenderer | null = null;
let flagLibrary: FlagLibrary | null = null;

export function attachMap(r: MapRenderer | null, flags: FlagLibrary | null) {
  renderer = r;
  flagLibrary = flags;
}

export const mapController = {
  zoomIn: () => renderer?.zoomStep(2),
  zoomOut: () => renderer?.zoomStep(0.5),
  wholeWorld: () => renderer?.showWholeWorld(),
  /** Waits two frames so a just-opened country panel is measured before the map centres. */
  flyTo: (id: string) => requestAnimationFrame(() => requestAnimationFrame(() => renderer?.flyToCountry(id))),
  setInsets: (insets: Parameters<MapRenderer['setInsets']>[0]) => renderer?.setInsets(insets),
  /** Flag's main colour (for wheels and charts). */
  flagColor: (code: string | null) => flagLibrary?.averageColor(code) ?? '#8b95a1',
  flagUrl: (code: string | null) => (code && flagLibrary?.has(code) ? flagLibrary.largeUrl(code) : null),
  undo: () => getTerritory()?.undo(),
  redo: () => getTerritory()?.redo(),
  resetCountry: (id: string) => getTerritory()?.resetCountry(id),
  resetWorld: () => getTerritory()?.resetWorld(),
  stats: (id: string) => getTerritory()?.statsFor(id) ?? null,
  isConquered: (id: string) => getTerritory()?.isConquered(id) ?? false,
  worldChanged: () => getTerritory()?.changedFromEarth ?? false,
  /** Can this country make new land? Only countries next to the sea (checked on the map as it is now). */
  isCoastal: (id: string) => {
    const t = getTerritory();
    if (!t) return false;
    // A brand-new custom country with no land yet can start on a new island.
    if (id.startsWith('custom-') && (t.statsFor(id)?.currentKm2 ?? 0) <= 0) return true;
    const key = `${id}:${t.version}`;
    if (coastCache.key !== key) coastCache = { key, value: isCoastal(t.grid, t.codeOf(id)) };
    return coastCache.value;
  },
};
