/**
 * Applies a world's extras to the game when it opens (and whenever they change):
 *  - custom countries: their flags, names and a place in the country list
 *  - renamed countries and capitals (Leighton's names)
 * The original world data is never changed: original names are kept and restored.
 */
import type { CountryInfo } from '../data/countries';
import type { FlagLibrary } from '../map/flags';
import type { MapRenderer } from '../map/MapRenderer';
import { emptyBBox } from '../map/geometry';
import type { CountryShape, World } from '../map/world';
import { useGame } from '../game/store';
import { getStats } from '../stats/session';
import { onWorldOpened } from '../worlds/session';
import type { SavedWorld } from '../worlds/model';
import { renderFlag } from './flag';
import { CUSTOM_SLOT_IDS } from './slots';

let world: World | null = null;
let flags: FlagLibrary | null = null;
let renderer: MapRenderer | null = null;
let base: CountryInfo[] = [];
const originalNames = new Map<string, { name: string; capital?: string }>();
const originalCapitalNames = new Map<number, string>();
const customInfo = new Map<string, CountryInfo>();

export function attachCustoms(w: World, f: FlagLibrary, r: MapRenderer, registry: CountryInfo[]) {
  world = w;
  flags = f;
  renderer = r;
  base = registry;
  for (const c of registry) originalNames.set(c.id, { name: c.name, capital: c.capital });
  w.capitals.forEach((c, i) => originalCapitalNames.set(i, c.name));
  onWorldOpened(apply);
}

/** The real (original) name of a country. */
export const realName = (id: string) => originalNames.get(id)?.name ?? id;
export const realCapital = (id: string) => originalNames.get(id)?.capital;

function apply(w: SavedWorld) {
  if (!world || !flags) return;
  // Names
  for (const c of base) {
    const o = originalNames.get(c.id)!;
    c.name = w.names[c.id]?.name || o.name;
    c.capital = w.names[c.id]?.capital || o.capital;
  }
  world.capitals.forEach((cap, i) => {
    cap.name = w.names[cap.id]?.capital || originalCapitalNames.get(i) || cap.name;
  });
  // Custom countries
  const defined = new Map(w.customs.map((c) => [c.id, c]));
  for (const id of CUSTOM_SLOT_IDS) {
    const def = defined.get(id);
    if (!def) {
      world.byId.delete(id);
      flags.setCustom(id, null);
      customInfo.delete(id);
      continue;
    }
    let info = customInfo.get(id);
    if (!info) {
      info = { id, name: def.name, flag: id, disputed: false, areaKm2: 0, custom: true };
      customInfo.set(id, info);
    }
    info.name = def.name;
    info.capital = def.capital;
    flags.setCustom(id, renderFlag(def.flag));
    if (!world.byId.has(id)) world.byId.set(id, virtualShape(info));
  }
  const customs = CUSTOM_SLOT_IDS.filter((id) => defined.has(id)).map((id) => customInfo.get(id)!);
  useGame.getState().setCountries([...base, ...customs]);
  getStats()?.setVisible([...base.map((c) => c.id), ...customs.map((c) => c.id)]);
  renderer?.namesChanged();
}

/** A map shape for a country with no land on the real Earth. */
function virtualShape(info: CountryInfo): CountryShape {
  return {
    info,
    box: emptyBBox(),
    area: 0,
    labelPoint: [-9999, -9999],
    mainBox: emptyBBox(),
    clusters: [],
    outline: { lo: new Path2D(), hi: null, max: null },
    polyCluster: [],
    polys: [],
  } as unknown as CountryShape;
}

/** A free slot for a new custom country (or null if all 24 are used). */
export function freeSlot(w: SavedWorld): string | null {
  const used = new Set(w.customs.map((c) => c.id));
  return CUSTOM_SLOT_IDS.find((id) => !used.has(id)) ?? null;
}
