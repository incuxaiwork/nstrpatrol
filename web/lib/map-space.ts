/**
 * Shared "map space" helpers. The MapLibre GL renderer (components/map.tsx)
 * positions demo and backend features in the same coordinate space; this
 * module owns the SVG viewBox → lon/lat mapping (the exact inverse of the
 * projection in lib/backend-adapters.ts) plus the GeoJSON builders for every
 * GL layer.
 */

import type { BeatPolygon, GisMarker, GisRoute, HeatBlock } from "@/lib/mock/gis";
import type { BoundaryPolygon, CompartmentPolygon, GridPolygon } from "@/lib/backend-adapters";
import type { TaggedGrid } from "@/lib/grid-regions";

/** SVG viewBox shared by the mock renderers (see lib/backend-adapters.ts). */
export const SVG_MAP_SPACE = {
  w: 1000,
  h: 700,
  pad: 60,
  /** Real-world bounding box the mock viewBox maps onto (Markapur Division). */
  minLon: 78.6,
  maxLon: 79.7,
  minLat: 15.4,
  maxLat: 16.4,
};

const availW = SVG_MAP_SPACE.w - SVG_MAP_SPACE.pad * 2;
const availH = SVG_MAP_SPACE.h - SVG_MAP_SPACE.pad * 2;

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** SVG viewBox point → [lon, lat]. */
export function svgToLngLat(x: number, y: number): [number, number] {
  const { pad, minLon, maxLon, minLat, maxLat } = SVG_MAP_SPACE;
  const lon = minLon + ((x - pad) / availW) * (maxLon - minLon);
  const lat = maxLat - ((y - pad) / availH) * (maxLat - minLat);
  return [round6(lon), round6(lat)];
}

/** [lon, lat] → SVG viewBox point (inverse of svgToLngLat). */
export function lngLatToSvg(lng: number, lat: number): { x: number; y: number } {
  const { pad, minLon, maxLon, minLat, maxLat } = SVG_MAP_SPACE;
  const x = pad + ((lng - minLon) / (maxLon - minLon)) * availW;
  const y = pad + ((maxLat - lat) / (maxLat - minLat)) * availH;
  return { x, y };
}

/** "x,y x,y …" SVG polygon string → [lon, lat][] ring. */
export function svgRingToLngLat(points: string): [number, number][] {
  return points
    .trim()
    .split(/\s+/)
    .map((p) => {
      const [x, y] = p.split(",").map(Number);
      return svgToLngLat(x, y);
    });
}

export type GeoFeatureCollection = GeoJSON.FeatureCollection;
export type GeoFeature = GeoJSON.Feature;

export function emptyFc(): GeoFeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

const markerColor: Record<GisMarker["kind"], string> = {
  ranger: "#1B365D",
  observation: "#B3261E",
  patrol: "#2E7D32",
  incident: "#FF8F00",
  sos: "#B3261E",
};

function flatProps(
  props: Record<string, unknown>
): { [name: string]: unknown } {
  return props;
}

export function beatsToFeatures(
  beats: BeatPolygon[],
  selectedId?: string | null
): GeoFeatureCollection {
  return {
    type: "FeatureCollection",
    features: beats.map((b) => ({
      type: "Feature",
      id: b.id,
      properties: flatProps({
        id: b.id,
        name: b.name,
        division: b.division,
        range: b.range,
        rangeId: b.rangeId ?? null,
        beatId: b.beatId ?? null,
        coveragePct: b.coveragePct,
        isZero: b.isZeroPatrol === true,
        isAuth: false,
        selected: selectedId === b.id,
      }),
      geometry: { type: "Polygon", coordinates: [svgRingToLngLat(b.points)] },
    })),
  };
}

/** Forest boundary polygons (MultiPolygon-safe, one feature per part). */
export function boundariesToFeatures(boundaries: BoundaryPolygon[]): GeoFeatureCollection {
  return {
    type: "FeatureCollection",
    features: boundaries.flatMap((b) =>
      b.parts.map((points, i) => ({
        type: "Feature",
        id: b.parts.length > 1 ? `${b.id}-${i}` : b.id,
        properties: flatProps({
          id: b.id,
          name: b.name,
          forestCode: b.forestCode,
        }),
        geometry: { type: "Polygon", coordinates: [svgRingToLngLat(points)] },
      }))
    ),
  };
}

/**
 * Coverage record for one ForestGrid cell — joined to the layer feature by
 * the authoritative grid id (backend coverage cells[].id ≡ GIS feature id).
 */
export interface GridCoverageInfo {
  covered: boolean;
  pointCount: number;
  lastPatrolledAt: string | null;
}

/**
 * Reference grid cells. Coverage fields are populated by joining the
 * authoritative coverage API response (GET /api/coverage/grids) onto the
 * layer features by ForestGrid id (never by index / label / position). Cells
 * without a coverage record stay coverageStatus: null → "no data" styling.
 */
export function gridsToFeatures(
  grids: GridPolygon[],
  coverageById?: Record<string, GridCoverageInfo> | null
): GeoFeatureCollection {
  return {
    type: "FeatureCollection",
    features: grids.map((g) => {
      const cov = coverageById?.[g.id];
      return {
        type: "Feature",
        id: g.id,
        properties: flatProps({
          id: g.id,
          gridCode: g.gridCode,
          rangeId: g.rangeId ?? null,
          beatId: g.beatId ?? null,
          compId: g.compId ?? null,
          coverageStatus: cov ? (cov.covered ? "covered" : "uncovered") : null,
          lastPatrolAt: cov?.lastPatrolledAt ?? null,
          patrolCount: cov?.pointCount ?? null,
        }),
        geometry: { type: "Polygon", coordinates: [svgRingToLngLat(g.points)] },
      };
    }),
  };
}

export function markersToFeatures(markers: GisMarker[]): GeoFeatureCollection {
  return {
    type: "FeatureCollection",
    features: markers.map((m) => ({
      type: "Feature",
      id: m.id,
      properties: flatProps({
        id: m.id,
        kind: m.kind,
        label: m.label,
        code: m.label.match(/^([A-Z]+-\d+)/i)?.[1] ?? m.label,
        color: markerColor[m.kind],
        tone: m.tone ?? null,
      }),
      geometry: { type: "Point", coordinates: svgToLngLat(m.x, m.y) },
    })),
  };
}

/**
 * Analysis-grid cells (frontend-generated, metric). Selected state is baked
 * into the features so MapLibre styles it with plain data-driven expressions
 * (the same convention the beat layers already use). Region fields are the
 * client-side spatial attribution from lib/grid-regions.ts — undefined when a
 * cell's centroid is not contained by any real polygon, never invented.
 */
export function analysisGridsToFeatures(
  cells: TaggedGrid[],
  selectedIds?: ReadonlySet<string>
): GeoFeatureCollection {
  return {
    type: "FeatureCollection",
    features: cells.map((g) => ({
      type: "Feature",
      id: g.id,
      properties: flatProps({
        id: g.id,
        gridCode: g.gridCode,
        rangeId: g.rangeId ?? null,
        beatId: g.beatId ?? null,
        compId: g.compId ?? null,
        selected: selectedIds?.has(g.id) === true,
        row: (g as { row?: number }).row ?? null,
        col: (g as { col?: number }).col ?? null,
      }),
      geometry: { type: "Polygon", coordinates: [svgRingToLngLat(g.points)] },
    })),
  };
}

export function routesToFeatures(routes: GisRoute[]): GeoFeatureCollection {
  return {
    type: "FeatureCollection",
    features: routes.map((r) => ({
      type: "Feature",
      id: r.id,
      properties: flatProps({
        id: r.id,
        patrolId: r.patrolId,
        label: r.label,
        status: r.status,
        color: r.color,
      }),
      geometry: { type: "LineString", coordinates: svgRingToLngLat(r.points) },
    })),
  };
}

export interface TimedPoint {
  t: number;
  lon: number;
  lat: number;
}

export function routeToTimed(r: GisRoute): TimedPoint[] {
  if (!r.timedPoints || r.timedPoints.length < 2) {
    return svgRingToLngLat(r.points).map(([lon, lat], i, arr) => ({
      t: arr.length > 1 ? i / (arr.length - 1) : 0,
      lon,
      lat,
    }));
  }
  return r.timedPoints.map((p) => {
    const [lon, lat] = svgToLngLat(p.x, p.y);
    return { t: p.t, lon, lat };
  });
}

/** Playback geometry at `progress` (0..1) — trail polyline + head point. */
export function replayFeatures(
  timed: TimedPoint[],
  progress: number
): { trail: GeoFeatureCollection; head: GeoFeatureCollection } {
  const idx = Math.floor(progress * Math.max(timed.length - 1, 0));
  const shown = timed.slice(0, idx + 1).map((p) => [p.lon, p.lat] as [number, number]);
  const last = shown[shown.length - 1];
  return {
    trail: {
      type: "FeatureCollection",
      features:
        shown.length >= 2
          ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: shown } }]
          : [],
    },
    head: {
      type: "FeatureCollection",
      features: last
        ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: last } }]
        : [],
    },
  };
}

export function heatToFeatures(blocks: HeatBlock[]): GeoFeatureCollection {
  return {
    type: "FeatureCollection",
    features: blocks.map((h, i) => {
      const tl = svgToLngLat(h.x, h.y);
      const tr = svgToLngLat(h.x + h.w, h.y);
      const br = svgToLngLat(h.x + h.w, h.y + h.h);
      const bl = svgToLngLat(h.x, h.y + h.h);
      return {
        type: "Feature",
        id: `heat-${i}`,
        properties: flatProps({ intensity: h.intensity }),
        geometry: { type: "Polygon", coordinates: [[tl, tr, br, bl, tl]] },
      };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Range + compartment boundaries                                      */
/* ------------------------------------------------------------------ */

export interface RangePolygon {
  id: string;
  name: string;
  division: string;
  points: string; // SVG ring of the range's outer hull
  color: string;
  /** Hierarchy range id, when the beats carry region tags. */
  rangeId?: string;
}

export const RANGE_COLORS = [
  "#1F4626",
  "#0E4C92",
  "#7B1FA2",
  "#92500E",
  "#2E7D32",
  "#00695C",
  "#5B2C6F",
  "#B3261E",
];

function parsePoly(points: string): [number, number][] {
  return points
    .trim()
    .split(/\s+/)
    .map((p) => {
      const [x, y] = p.split(",").map(Number);
      return [x, y] as [number, number];
    });
}

/** Convex hull (Andrew's monotone chain) — used to outline a range's beats. */
function convexHull(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

export function rangeLabel(key: string): string {
  const m = key.match(/^r-(\w+)$/i);
  return m ? m[1].toUpperCase() : key;
}

/** Group beats by range and outline each range (union hull of its beats). */
export function rangesFromBeats(beats: BeatPolygon[]): RangePolygon[] {
  const byRange = new Map<string, BeatPolygon[]>();
  for (const b of beats) {
    const key = b.range || "—";
    if (!byRange.has(key)) byRange.set(key, []);
    byRange.get(key)!.push(b);
  }
  const entries = [...byRange.entries()];
  return entries.map(([key, group], i) => {
    const pts: [number, number][] = [];
    for (const b of group) pts.push(...parsePoly(b.points));
    const hull = convexHull(pts);
    return {
      id: `range-${key}`,
      name: rangeLabel(key),
      division: group[0]?.division ?? "",
      rangeId: group.find((b) => b.rangeId)?.rangeId,
      points: hull.map((p) => `${p[0]},${p[1]}`).join(" "),
      color: RANGE_COLORS[i % RANGE_COLORS.length],
    };
  });
}

function ringCentroid(points: string): [number, number] {
  const ring = parsePoly(points);
  const n = ring.length || 1;
  const x = ring.reduce((a, p) => a + p[0], 0) / n;
  const y = ring.reduce((a, p) => a + p[1], 0) / n;
  return [x, y];
}

export function rangesToFeatures(ranges: RangePolygon[]): GeoFeatureCollection {
  return {
    type: "FeatureCollection",
    features: ranges.map((r) => ({
      type: "Feature",
      id: r.id,
      properties: flatProps({
        id: r.id,
        name: r.name,
        division: r.division,
        rangeId: r.rangeId ?? null,
        color: r.color,
      }),
      geometry: { type: "Polygon", coordinates: [svgRingToLngLat(r.points)] },
    })),
  };
}

export function rangeLabelsToFeatures(ranges: RangePolygon[]): GeoFeatureCollection {
  return {
    type: "FeatureCollection",
    features: ranges.map((r) => {
      const [x, y] = ringCentroid(r.points);
      return {
        type: "Feature",
        id: `${r.id}-label`,
        properties: flatProps({ name: r.name, rangeId: r.rangeId ?? null, color: r.color }),
        geometry: { type: "Point", coordinates: svgToLngLat(x, y) },
      };
    }),
  };
}

export function compartmentsToFeatures(comps: CompartmentPolygon[]): GeoFeatureCollection {
  return {
    type: "FeatureCollection",
    features: comps.map((c) => ({
      type: "Feature",
      id: c.id,
      properties: flatProps({
        id: c.id,
        compNo: c.compNo,
        beat: c.beat,
        areaHa: c.areaHa,
        rangeId: c.rangeId ?? null,
        beatId: c.beatId ?? null,
        compId: c.compId ?? c.id,
      }),
      geometry: { type: "Polygon", coordinates: [svgRingToLngLat(c.points)] },
    })),
  };
}

export function compartmentLabelsToFeatures(comps: CompartmentPolygon[]): GeoFeatureCollection {
  return {
    type: "FeatureCollection",
    features: comps.map((c) => {
      const [x, y] = ringCentroid(c.points);
      return {
        type: "Feature",
        id: `${c.id}-label`,
        properties: flatProps({
          compNo: c.compNo,
          rangeId: c.rangeId ?? null,
          beatId: c.beatId ?? null,
          compId: c.compId ?? c.id,
        }),
        geometry: { type: "Point", coordinates: svgToLngLat(x, y) },
      };
    }),
  };
}