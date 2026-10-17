import { describe, expect, it } from 'vitest';
import { clusterPolygons, fitFlagRect, polygonArea, type PlanarPolygon } from '../src/map/geometry';
import { constrain, fitBox, screenToWorld, zoomAt, type Camera } from '../src/map/camera';

const square = (x: number, y: number, s: number): PlanarPolygon => [
  [
    [x, y],
    [x + s, y],
    [x + s, y + s],
    [x, y + s],
    [x, y],
  ],
];

describe('polygon area', () => {
  it('subtracts holes', () => {
    const withHole: PlanarPolygon = [square(0, 0, 10)[0], square(2, 2, 2)[0]];
    expect(polygonArea(withHole)).toBe(96);
  });
});

describe('flag clusters', () => {
  it('groups big nearby pieces but separates far-away pieces', () => {
    const mainland = square(0, 0, 10);
    const bigIsland = square(11, 2, 4); // close by and fairly big, like Hokkaido
    const farAway = square(100, 100, 3); // like Hawaii
    const clusters = clusterPolygons([farAway, mainland, bigIsland]);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].sort()).toEqual([1, 2]); // biggest cluster first
    expect(clusters[1]).toEqual([0]);
  });

  it('gives a small island its own whole flag', () => {
    const mainland = square(0, 0, 10);
    const tinyIsland = square(11, 2, 1); // close by but small
    const clusters = clusterPolygons([mainland, tinyIsland]);
    expect(clusters).toEqual([[0], [1]]);
  });
});

describe('flag placement', () => {
  it('always covers the whole shape', () => {
    for (const box of [
      { minX: 0, minY: 0, maxX: 40, maxY: 30 },
      { minX: 0, minY: 0, maxX: 5, maxY: 100 }, // tall, like Chile
      { minX: 0, minY: 0, maxX: 100, maxY: 5 }, // wide
    ]) {
      const r = fitFlagRect(box);
      expect(r.x).toBeLessThanOrEqual(box.minX + 1e-9);
      expect(r.y).toBeLessThanOrEqual(box.minY + 1e-9);
      expect(r.x + r.w).toBeGreaterThanOrEqual(box.maxX - 1e-9);
      expect(r.y + r.h).toBeGreaterThanOrEqual(box.maxY - 1e-9);
    }
  });

  it('never stretches a flag beyond 1.6x its shape', () => {
    const r = fitFlagRect({ minX: 0, minY: 0, maxX: 5, maxY: 100 });
    const aspect = r.w / r.h;
    expect(aspect).toBeGreaterThanOrEqual(4 / 3 / 1.6 - 1e-9);
  });
});

describe('camera', () => {
  const limits = { minScale: 1, maxScale: 100 };

  it('keeps the point under the finger fixed while zooming', () => {
    const cam: Camera = { x: 10, y: 20, scale: 2 };
    const before = screenToWorld(cam, 300, 200);
    const after = screenToWorld(zoomAt(cam, 1.7, 300, 200, limits), 300, 200);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });

  it('respects zoom limits', () => {
    expect(zoomAt({ x: 0, y: 0, scale: 50 }, 10, 0, 0, limits).scale).toBe(100);
    expect(zoomAt({ x: 0, y: 0, scale: 2 }, 0.01, 0, 0, limits).scale).toBe(1);
  });

  it('fits a box inside the view', () => {
    const cam = fitBox({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, { width: 800, height: 600 }, 0);
    expect(cam.scale).toBe(8);
  });

  it('keeps the world on screen', () => {
    const view = { width: 800, height: 600 };
    const cam = constrain({ x: 5000, y: 0, scale: 10 }, { width: 1000, height: 700 }, view);
    expect(cam.x).toBe(0); // can't drag the left edge of the world past the screen's left edge
  });
});
