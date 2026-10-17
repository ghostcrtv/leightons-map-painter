/**
 * A tiny bridge so buttons anywhere in the UI can move the map
 * without passing the renderer through React props.
 */
import type { MapRenderer } from '../map/MapRenderer';
import type { FlagLibrary } from '../map/flags';

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
  flagUrl: (code: string | null) => (code && flagLibrary?.has(code) ? flagLibrary.largeUrl(code) : null),
};
