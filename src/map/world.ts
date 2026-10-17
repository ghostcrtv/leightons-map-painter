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
import { geoArea, geoGraticule10, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { geoMiller, geoProject } from 'd3-geo-projection';
import { feature, mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, FeatureCollection, MultiLineString, MultiPolygon, Polygon, Position } from 'geojson';
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
import type { CapitalInfo, CountryInfo } from '../data/countries';

export const WORLD_WIDTH = 1000;

/** lo: whole-world view · hi: country view · max: full detail for very close zoom. */
export type Lod = 'lo' | 'hi' | 'max';

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
  /**
   * The country's flat polygons (the 'hi' detail once it has loaded). Used to measure
   * territory — the ORIGINAL borders, never changed by gameplay.
   */
  polys: PlanarPolygon[];
}

/**
 * Lines split into map squares, so only the squares on screen are drawn.
 * (Stroking every border in the world at full detail would be slow on an iPad.)
 */
export interface LineBuckets {
  size: number;
  cells: Map<number, { box: BBox; path: Path2D }>;
}

export interface World {
  width: number;
  height: number;
  countries: CountryShape[];
  byId: Map<string, CountryShape>;
  /** Borders between countries. Painted territory is drawn over these. */
  inner: Record<Lod, LineBuckets | null>;
  /** Coastlines. Drawn last, so painted land keeps a crisp coast. */
  coast: Record<Lod, LineBuckets | null>;
  graticule: Path2D;
  ready: Record<Lod, boolean>;
  /** Capital cities, projected to world units. */
  capitals: { id: string; name: string; x: number; y: number }[];
  /** Real-world area (km²) of one square of world units at a given height (y). */
  km2PerUnit2At(y: number): number;
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

/**
 * On a globe, a ring's direction decides which side is "inside". Rounding can flip a
 * very small shape (like the Vatican), turning it into "the whole world except the
 * Vatican". Any piece covering more than half the globe is flipped back.
 */
function fixWinding(f: Feature): Feature {
  const g = f.geometry;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return f;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let changed = false;
  const fixed = polys.map((rings) => {
    if (geoArea({ type: 'Polygon', coordinates: rings }) <= 2 * Math.PI) return rings;
    changed = true;
    return rings.map((r) => [...r].reverse());
  });
  if (!changed) return f;
  return { ...f, geometry: { type: 'MultiPolygon', coordinates: fixed } };
}

/** Project a country to flat polygons in world units. */
function projectFeature(f: Feature, projection: ReturnType<typeof makeProjection>): PlanarPolygon[] {
  const projected = geoProject(fixWinding(f), projection) as Feature<Polygon | MultiPolygon> | null;
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
export async function loadWorld(baseUrl: string, registry: CountryInfo[], capitals: CapitalInfo[] = []): Promise<World> {
  const topo = await fetchTopo(baseUrl, 'lo');
  const projection = makeProjection();
  const infoById = new Map(registry.map((c) => [c.id, c]));
  const fc = feature(topo, topo.objects.countries) as FeatureCollection;

  const sphereBounds = geoPath(projection).bounds({ type: 'Sphere' } as GeoPermissibleObjects);
  const height = sphereBounds[1][1] - sphereBounds[0][1];

  const countries: CountryShape[] = [];

  for (const f of fc.features) {
    const info = infoById.get(String(f.id));
    if (!info) continue;
    const polys = projectFeature(f, projection);
    if (polys.length === 0) continue;

    const groups = clusterPolygons(polys);
    const clusters: FlagCluster[] = groups.map((members) => {
      const mpolys = members.map((i) => polys[i]);
      const box = mpolys.map(polygonBBox).reduce(unionBBox, emptyBBox());
      return { box, flagRect: fitFlagRect(box), path: { lo: pathOf(mpolys), hi: null, max: null } };
    });

    // Label goes at the "pole of inaccessibility" of the biggest single piece.
    let biggest = polys[0];
    for (const p of polys) if (polygonArea(p) > polygonArea(biggest)) biggest = p;
    const lp = polylabel(biggest, Math.max(bboxWidth(polygonBBox(biggest)), 0.01) / 50);

    countries.push({
      info,
      box: polys.map(polygonBBox).reduce(unionBBox, emptyBBox()),
      area: polys.reduce((s, p) => s + polygonArea(p), 0),
      labelPoint: [lp[0], lp[1]],
      mainBox: clusters[0].box,
      clusters,
      outline: { lo: pathOf(polys), hi: null, max: null },
      polyCluster: polyToCluster(groups, polys.length),
      polys,
    });
  }
  const lines = buildLines(topo, projection);

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
    inner: { lo: lines.inner, hi: null, max: null },
    coast: { lo: lines.coast, hi: null, max: null },
    graticule,
    ready: { lo: true, hi: false, max: false },
    capitals: capitals.flatMap((c) => {
      const p = projection([c.lon, c.lat]);
      return p ? [{ id: c.id, name: c.name, x: p[0], y: p[1] }] : [];
    }),
    km2PerUnit2At: makeAreaScale(projection, height),
  };
}

/**
 * The flat map stretches land near the poles. This returns how many real km² one
 * square world unit covers at height y (precomputed in 0.5-unit steps).
 */
function makeAreaScale(projection: ReturnType<typeof makeProjection>, height: number) {
  const R = 6371.0088;
  const step = 0.5;
  const table: number[] = [];
  const degPerUnit = 360 / WORLD_WIDTH;
  for (let y = 0; y <= height; y += step) {
    const a = projection.invert?.([WORLD_WIDTH / 2, y]);
    const b = projection.invert?.([WORLD_WIDTH / 2, y + step]);
    if (!a || !b) {
      table.push(0);
      continue;
    }
    const band = R * R * (degPerUnit * Math.PI / 180) * Math.abs(Math.sin((a[1] * Math.PI) / 180) - Math.sin((b[1] * Math.PI) / 180));
    table.push(band / step); // km² per (1 unit wide × 1 unit tall)
  }
  return (y: number) => table[Math.max(0, Math.min(table.length - 1, Math.floor(y / step)))];
}

const BUCKET = 20;
const MAX_SEGMENT_POINTS = 64;

/** Split projected lines into map squares (see LineBuckets). */
function bucketLines(geom: MultiLineString | null): LineBuckets {
  const out: LineBuckets = { size: BUCKET, cells: new Map() };
  if (!geom) return out;
  const cols = Math.ceil(WORLD_WIDTH / BUCKET) + 1;
  for (const line of geom.coordinates) {
    for (let start = 0; start < line.length - 1; start += MAX_SEGMENT_POINTS) {
      const pts = line.slice(start, Math.min(line.length, start + MAX_SEGMENT_POINTS + 1));
      const key = Math.floor(pts[0][1] / BUCKET) * cols + Math.floor(pts[0][0] / BUCKET);
      let cell = out.cells.get(key);
      if (!cell) {
        cell = { box: emptyBBox(), path: new Path2D() };
        out.cells.set(key, cell);
      }
      cell.path.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) cell.path.lineTo(pts[i][0], pts[i][1]);
      for (const p of pts) {
        if (p[0] < cell.box.minX) cell.box.minX = p[0];
        if (p[1] < cell.box.minY) cell.box.minY = p[1];
        if (p[0] > cell.box.maxX) cell.box.maxX = p[0];
        if (p[1] > cell.box.maxY) cell.box.maxY = p[1];
      }
    }
  }
  return out;
}

/** Borders between countries (shared edges) and coastlines (edges with only one country). */
function buildLines(topo: CountriesTopo, projection: ReturnType<typeof makeProjection>) {
  const obj = topo.objects.countries;
  const project = (m: MultiLineString) => geoProject(m, projection) as MultiLineString | null;
  return {
    inner: bucketLines(project(mesh(topo, obj, (a, b) => a !== b))),
    coast: bucketLines(project(mesh(topo, obj, (a, b) => a === b))),
  };
}

function polyToCluster(groups: number[][], count: number): number[] {
  const out = new Array<number>(count).fill(0);
  groups.forEach((members, ci) => members.forEach((pi) => (out[pi] = ci)));
  return out;
}

/**
 * Build a more detailed level ('hi' or 'max') in small chunks so the map stays responsive.
 */
export async function loadDetail(baseUrl: string, world: World, lod: 'hi' | 'max'): Promise<void> {
  const topo = await fetchTopo(baseUrl, lod);
  const projection = makeProjection();
  const fc = feature(topo, topo.objects.countries) as FeatureCollection;
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
      c.path[lod] = hiPolys.length ? pathOf(hiPolys) : (c.path.hi ?? c.path.lo);
      // Simplifying can shrink small islands a lot, so the detailed island may reach
      // past the flag sized for the simple one. Re-fit the flag to cover both, once,
      // and use that rectangle at every zoom level so flags don't jump. (The 'max'
      // level only adds tiny details; the backup colour fill covers any edge.)
      if (lod === 'hi' && hiPolys.length) {
        c.box = hiPolys.map(polygonBBox).reduce(unionBBox, c.box);
        c.flagRect = fitFlagRect(c.box);
      }
    });
    shape.box = shape.clusters.map((c) => c.box).reduce(unionBBox, shape.box);
    shape.mainBox = shape.clusters[0].box;
    shape.outline[lod] = pathOf(polys);
    if (lod === 'hi') shape.polys = polys;
    if (++n % 20 === 0) await yieldToBrowser();
  }
  const lines = buildLines(topo, projection);
  world.inner[lod] = lines.inner;
  world.coast[lod] = lines.coast;
  world.ready[lod] = true;
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
