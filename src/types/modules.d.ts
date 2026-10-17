// d3-geo-projection ships without TypeScript types; declare the two functions we use.
declare module 'd3-geo-projection' {
  import type { GeoProjection } from 'd3-geo';
  export function geoMiller(): GeoProjection;
  export function geoProject<T>(object: T, projection: GeoProjection): T;
}

// polylabel: finds the best point inside a polygon for a label.
declare module 'polylabel' {
  export default function polylabel(polygon: number[][][], precision?: number): [number, number] & { distance: number };
}
