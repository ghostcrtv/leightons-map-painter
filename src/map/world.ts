/**
 * Loads the boundary data and turns it into ready-to-draw shapes.
 *
 * Projection: Miller cylindrical — a familiar, rectangular "classroom" world map
 * that is less stretched near the poles than Mercator. Everything is projected
 * ONCE into world units; zooming and panning only change the camera, so flags
 * and borders always stay aligned.
 *
 * Two levels of detail: "lo" (loaded first, used when zoomed out) and "hi"
 * (built in the background, used when zoomed in).
 */
import { geoGraticule10, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { geoMiller, geoProject } from 'd3-geo-projection';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import polylabel from 'polylabel';
import {
  bboxHeight,
  bboxWidth,
  clusterPolygons,
  emptyBBox,
  fitFlagRect,
  polygonArea,
  polygonBBox,
  unionBBox,
  type BBox,
  type PlanarPolygon,
  type Rect,
  type Ring,
} from './geometry';
import type { CountryInfo } from '../data/countries';

export const WORLD_WIDTH = 1000;

export type Lod = 'lo' | 'hi';

export interface FlagCluster {
  box: BBox;
  /** Where the flag image is drawn (it is clipped to the cluster's shape). */
  flagRect: Rect;
  path: Record<Lod, Path2D | null>;
}

export interface CountryShape {
  info: CountryInfo;
  box: BBox;
  /** Planar area in world units² (used for sorting and hit-test priority). */
  area: number;
  /** Best point for the name label (inside the largest piece of land). */
  labelPoint: [number, number];
  /** Bounding box of the largest cluster (decides how big the label can be). */
  mainBox: BBox;
  clusters: FlagCluster[];
  /** All of the country's land, for hit-testing and selection outlines. */
  outline: Record<Lod, Path2D | null>;
  /** Which cluster each polygon belongs to (used to match the hi-detail data). */
  polyCluster: number[];
}

export interface World {
  width: number;
  height: number;
  countries: CountryShape[];
  byId: Map<string, CountryShape>;
  /** Every border and coastline in one path, so they stroke in a single call. */
  borders: Record<Lod, Path2D | null>;
  graticule: Path2D;
  hiReady: boolean;
}

type CountriesTopo = Topology<{ countries: GeometryCollection<{ name: string }> }>;

function makeProjection() {
  return geoMiller().fitWidth(WORLD_WIDTH, { type: 'Sphere' }).precision(0.3);
}

async function fetchTopo(baseUrl: string, lod: Lod): Promise<CountriesTopo> {
  const res = await fetch(`${baseUrl}data/world-${lod}.json`);
  if (!res.ok) throw new Error(`Could not load map data (${res.status})`);
  return (await res.json()) as CountriesTopo;
}

/** Project a country to flat polygons in world units. */
function projectFeature(f: Feature, projection: ReturnType<typeof makeProjection>): PlanarPolygon[] {
  const projected = geoProject(f, projection) as Feature<Polygon | MultiPolygon> | null;
  const geom = projected?.geometry;
  if (!geom) return [];
  const toRing = (r: Position[]): Ring => r.map((p) => [p[0], p[1]] as [number, number]);
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys.map((p) => p.map(toRing)).filter((p) => p.length > 0 && p[0].length >= 3);
}

function appendPolygon(path: Path2D, poly: PlanarPolygon) {
  for (const ring of poly) {
    if (ring.length < 3) continue;
    path.moveTo(ring[0][0], ring[0][1]);
    for (let i = 1; i < ring.length; i++) path.lineTo(ring[i][0], ring[i][1]);
    path.closePath();
  }
}

function pathOf(polys: PlanarPolygon[]): Path2D {
  const p = new Path2D();
  for (const poly of polys) appendPolygon(p, poly);
  return p;
}

const yieldToBrowser = () => new Promise<void>((r) => setTimeout(r, 0));

/** Load the low-detail world (fast) — the map can draw as soon as this resolves. */
export async function loadWorld(baseUrl: string, registry: CountryInfo[]): Promise<World> {
  const topo = await fetchTopo(baseUrl, 'lo');
  const projection = makeProjection();
  const infoById = new Map(registry.map((c) => [c.id, c]));
  const fc = feature(topo, topo.objects.countries) as FeatureCollection;

  const sphereBounds = geoPath(projection).bounds({ type: 'Sphere' } as GeoPermissibleObjects);
  const height = sphereBounds[1][1] - sphereBounds[0][1];

  const countries: CountryShape[] = [];
  const borders = new Path2D();

  for (const f of fc.features) {
    const info = infoById.get(String(f.id));
    if (!info) continue;
    const polys = projectFeature(f, projection);
    if (polys.length === 0) continue;

    const groups = clusterPolygons(polys);
    const clusters: FlagCluster[] = groups.map((members) => {
      const mpolys = members.map((i) => polys[i]);
      const box = mpolys.map(polygonBBox).reduce(unionBBox, emptyBBox());
      return { box, flagRect: fitFlagRect(box), path: { lo: pathOf(mpolys), hi: null } };
    });

    // Label goes at the "pole of inaccessibility" of the biggest single piece.
    let biggest = polys[0];
    for (const p of polys) if (polygonArea(p) > polygonArea(biggest)) biggest = p;
    const lp = polylabel(biggest, Math.max(bboxWidth(polygonBBox(biggest)), 0.01) / 50);

    for (const p of polys) appendPolygon(borders, p);

    countries.push({
      info,
      box: polys.map(polygonBBox).reduce(unionBBox, emptyBBox()),
      area: polys.reduce((s, p) => s + polygonArea(p), 0),
      labelPoint: [lp[0], lp[1]],
      mainBox: clusters[0].box,
      clusters,
      outline: { lo: pathOf(polys), hi: null },
      polyCluster: polyToCluster(groups, polys.length),
    });
  }

  const graticule = new Path2D();
  const graticuleGeo = geoGraticule10();
  const gpath = geoPath(projection);
  const d = gpath(graticuleGeo as GeoPermissibleObjects);
  if (d) graticule.addPath(new Path2D(d));

  // Biggest first: labels for large countries get placed before small ones.
  countries.sort((a, b) => b.area - a.area);

  return {
    width: WORLD_WIDTH,
    height,
    countries,
    byId: new Map(countries.map((c) => [c.info.id, c])),
    borders: { lo: borders, hi: null },
    graticule,
    hiReady: false,
  };
}

function polyToCluster(groups: number[][], count: number): number[] {
  const out = new Array<number>(count).fill(0);
  groups.forEach((members, ci) => members.forEach((pi) => (out[pi] = ci)));
  return out;
}

/**
 * Build the detailed shapes in small chunks so the map stays responsive.
 * Flag positions are kept from the low-detail version so nothing jumps.
 */
export async function loadHiDetail(baseUrl: string, world: World): Promise<void> {
  const topo = await fetchTopo(baseUrl, 'hi');
  const projection = makeProjection();
  const fc = feature(topo, topo.objects.countries) as FeatureCollection;
  const borders = new Path2D();
  let n = 0;
  for (const f of fc.features) {
    const shape = world.byId.get(String(f.id));
    if (!shape) continue;
    const polys = projectFeature(f, projection);
    if (polys.length === 0) continue;
    const mapping = shape.polyCluster;
    const perCluster: PlanarPolygon[][] = shape.clusters.map(() => []);
    polys.forEach((poly, i) => {
      const ci = mapping.length === polys.length ? mapping[i] : nearestCluster(shape, polygonBBox(poly));
      perCluster[ci].push(poly);
    });
    shape.clusters.forEach((c, ci) => {
      const hiPolys = perCluster[ci];
      c.path.hi = hiPolys.length ? pathOf(hiPolys) : c.path.lo;
      // Simplifying can shrink small islands a lot, so the detailed island may reach
      // past the flag sized for the simple one. Re-fit the flag to cover both, and use
      // the same rectangle at every zoom level so flags never jump.
      if (hiPolys.length) {
        c.box = hiPolys.map(polygonBBox).reduce(unionBBox, c.box);
        c.flagRect = fitFlagRect(c.box);
      }
    });
    shape.box = shape.clusters.map((c) => c.box).reduce(unionBBox, shape.box);
    shape.mainBox = shape.clusters[0].box;
    shape.outline.hi = pathOf(polys);
    for (const p of polys) appendPolygon(borders, p);
    if (++n % 20 === 0) await yieldToBrowser();
  }
  world.borders.hi = borders;
  world.hiReady = true;
}

function nearestCluster(shape: CountryShape, box: BBox): number {
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  let best = 0;
  let bestD = Infinity;
  shape.clusters.forEach((c, i) => {
    const dx = cx - (c.box.minX + c.box.maxX) / 2;
    const dy = cy - (c.box.minY + c.box.maxY) / 2;
    const d = dx * dx + dy * dy - (bboxWidth(c.box) * bboxHeight(c.box));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
