/**
 * Admin Analysis Grid — a deterministic, geographically meaningful grid
 * overlay generated entirely in the frontend.
 *
 * Design:
 *   • CRS    : source data stays EPSG:4326. The portal's shared projection
 *              (lib/map-space.ts SVG round-trip) is linear over this small,
 *              local area, so metric-to-SVG conversion is done once at the
 *              forest centroid and cells are generated as metric squares in
 *              that shared space, then projected back to lon/lat for MapLibre.
 *   • Metric : cell edges are sized in METRES, not raw degrees. Horizontal
 *              degree spacing is corrected by cos(reference latitude) so a
 *              1 km cell is ~1 km on the ground, not "0.01 degrees".
 *              No GIS dependency is required; no fixed degree step is used.
 *   • Origin : anchored to the SW corner of the beat extent, floored to the
 *              cell step. The origin is derived from the data + size only —
 *              pan/zoom/viewport never move it.
 *   • IDs    : `GRID_<sizeKey>_r<row>_c<col>` — deterministic for the same
 *              boundary + size. Changing size changes topology → new IDs.
 *   • Bounds : cells are generated across the REAL beats/forest extent only,
 *              never the world or the viewport, and only cells intersecting
 *              the real beat/boundary polygons are kept (Option A — cells
 *              keep their square identity; they are not clipped into folds).
 *   • Coverage: none. This module never fabricates coverage/patrol data.
 */

import { SVG_MAP_SPACE } from "@/lib/map-space";
import type { BoundaryPolygon, GeoExtent, GridPolygon } from "@/lib/backend-adapters";
import type { BeatPolygon } from "@/lib/mock/gis";
import { type GridSizeKey, GRID_SIZES, gridSizeLabel } from "@/lib/forest-context";
import { parseRing, pointInPolygon, type Pt } from "@/lib/grid-regions";

/* ------------------------------------------------------------------ */
/* Metric spacing in the shared projection                              */
/* ------------------------------------------------------------------ */

const METERS_PER_DEG_LAT = 111132;

/** Scale of the shared projection (the exact inverse of makeProjector in
 *  lib/backend-adapters.ts): the real lon/lat extent is mapped onto the
 *  SVG viewBox interior, so one "svg unit per real degree" derives from
 *  THE DATA extent — not from the fixed SVG_MAP_SPACE description box
 *  (which only approximates the real Markapur bbox). Anchoring to the
 *  wrong box would render cells 30%+ off their metric size. */
export interface MetricSpace {
  svgPerDegLon: number;
  svgPerDegLat: number;
  refLat: number;
}

export function metricSpaceFromExtent(extent: GeoExtent): MetricSpace {
  const spanLon = Math.max(extent.maxLon - extent.minLon, 1e-6);
  const spanLat = Math.max(extent.maxLat - extent.minLat, 1e-6);
  return {
    svgPerDegLon: (SVG_MAP_SPACE.w - SVG_MAP_SPACE.pad * 2) / spanLon,
    svgPerDegLat: (SVG_MAP_SPACE.h - SVG_MAP_SPACE.pad * 2) / spanLat,
    refLat: (extent.minLat + extent.maxLat) / 2,
  };
}

/** Fallback space when no extent is supplied — the SVG_MAP_SPACE box
 *  itself (degrades to the box's own per-degree scale; the caller should
 *  always pass the real extent). */
const LEGACY_METRIC_SPACE: MetricSpace = {
  svgPerDegLon: (SVG_MAP_SPACE.w - SVG_MAP_SPACE.pad * 2) / (SVG_MAP_SPACE.maxLon - SVG_MAP_SPACE.minLon),
  svgPerDegLat: (SVG_MAP_SPACE.h - SVG_MAP_SPACE.pad * 2) / (SVG_MAP_SPACE.maxLat - SVG_MAP_SPACE.minLat),
  refLat: (SVG_MAP_SPACE.minLat + SVG_MAP_SPACE.maxLat) / 2,
};

export interface GridStep {
  /** SVG-space cell width/height for the requested metric size. */
  w: number;
  h: number;
}

/** SVG-units-per-metre along the lon and lat axes at the forest latitude. */
export function metricStep(meters: number, space: MetricSpace = LEGACY_METRIC_SPACE): GridStep {
  const metersPerDegLon = 111320 * Math.cos((space.refLat * Math.PI) / 180);
  const stepX = meters / metersPerDegLon * space.svgPerDegLon;
  const stepY = meters / METERS_PER_DEG_LAT * space.svgPerDegLat;
  return { w: Math.abs(stepX), h: Math.abs(stepY) };
}

/* ------------------------------------------------------------------ */
/* Cell model                                                          */
/* ------------------------------------------------------------------ */

/** A single generated analysis-grid cell in the shared SVG projection. */
export interface AnalysisGridCell extends GridPolygon {
  /** Deterministic cell identity (topology-scoped to the grid size). */
  id: string;
  gridCode: string;
  points: string;
  row: number;
  col: number;
  sizeKey: GridSizeKey;
}

export interface AnalysisGridMeta {
  sizeKey: GridSizeKey;
  sizeLabel: string;
  meters: number;
  count: number;
}

/* ------------------------------------------------------------------ */
/* Rect vs polygon intersection (planar — shared SVG space is local)    */
/* ------------------------------------------------------------------ */

interface Ring {
  pts: Pt[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function toRing(pts: Pt[]): Ring {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { pts, minX, minY, maxX, maxY };
}

function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d1 = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  const d2 = (p2.x - p1.x) * (p4.y - p1.y) - (p2.y - p1.y) * (p4.x - p1.x);
  const d3 = (p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x);
  const d4 = (p4.x - p3.x) * (p2.y - p3.y) - (p4.y - p3.y) * (p2.x - p3.x);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** True when the cell rectangle intersects the ring polygon. */
function rectIntersectsRing(x0: number, y0: number, x1: number, y1: number, ring: Ring): boolean {
  if (x1 < ring.minX || x0 > ring.maxX || y1 < ring.minY || y0 > ring.maxY) return false;
  const corners: Pt[] = [
    { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
  ];
  for (const c of corners) if (pointInPolygon(c, ring.pts)) return true;
  for (const v of ring.pts) {
    if (v.x >= x0 && v.x <= x1 && v.y >= y0 && v.y <= y1) return true;
  }
  const rectEdges: [Pt, Pt][] = [
    [{ x: x0, y: y0 }, { x: x1, y: y0 }],
    [{ x: x1, y: y0 }, { x: x1, y: y1 }],
    [{ x: x1, y: y1 }, { x: x0, y: y1 }],
    [{ x: x0, y: y1 }, { x: x0, y: y0 }],
  ];
  const n = ring.pts.length;
  for (let i = 0; i < rectEdges.length; i++) {
    const [a, b] = rectEdges[i];
    for (let j = 0; j < n; j++) {
      const c = ring.pts[j];
      const d = ring.pts[(j + 1) % n];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

function ringSet(polygons: { points?: string; parts?: string[] }[]): Ring[] {
  const out: Ring[] = [];
  for (const poly of polygons) {
    if (poly.parts) {
      for (const part of poly.parts) {
        const pts = parseRing(part);
        if (pts.length >= 3) out.push(toRing(pts));
      }
    } else if (poly.points) {
      const pts = parseRing(poly.points);
      if (pts.length >= 3) out.push(toRing(pts));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Grid generation                                                     */
/* ------------------------------------------------------------------ */

function extentOf(rings: Ring[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (rings.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rings) {
    if (r.minX < minX) minX = r.minX;
    if (r.minY < minY) minY = r.minY;
    if (r.maxX > maxX) maxX = r.maxX;
    if (r.maxY > maxY) maxY = r.maxY;
  }
  return { minX, minY, maxX, maxY };
}

export interface GraphInput {
  /** Real beat polygons (authoritative forest area / extent). */
  beats: BeatPolygon[];
  /** Real reserve boundary parts, when available (belt-and-braces clip). */
  boundary?: BoundaryPolygon[];
  /** Real lon/lat extent the shared projection is anchored to (the value
   *  exposed by services.gis.spatial()). Anchors the metric step to the
   *  actual data space so cell sizes are true ground metres. */
  extent?: GeoExtent | null;
  sizeKey: GridSizeKey;
}

export function buildAnalysisGrid({ beats, boundary, extent, sizeKey }: GraphInput): {
  cells: AnalysisGridCell[];
  meta: AnalysisGridMeta;
} {
  const def = GRID_SIZES.find((g) => g.key === sizeKey) ?? GRID_SIZES[1];
  const beatRings = ringSet(beats);
  const boundaryRings = ringSet(boundary ?? []);
  const ringsExtent = extentOf(beatRings) ?? extentOf(boundaryRings);
  if (!ringsExtent) return { cells: [], meta: { sizeKey: def.key, sizeLabel: gridSizeLabel(def.key), meters: def.meters, count: 0 } };

  const space = extent ? metricSpaceFromExtent(extent) : LEGACY_METRIC_SPACE;
  const step = metricStep(def.meters, space);
  const w = Math.max(step.w, 1e-6);
  const h = Math.max(step.h, 1e-6);

  const startX = Math.floor(ringsExtent.minX / w) * w;
  const startY = Math.floor(ringsExtent.minY / h) * h;
  const colCount = Math.ceil((ringsExtent.maxX - startX) / w);
  const rowCount = Math.ceil((ringsExtent.maxY - startY) / h);

  const cells: AnalysisGridCell[] = [];
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const x0 = startX + c * w;
      const y0 = startY + r * h;
      const x1 = x0 + w;
      const y1 = y0 + h;
      const hits = beatRings.length > 0
        ? beatRings.some((ring) => rectIntersectsRing(x0, y0, x1, y1, ring))
        : boundaryRings.some((ring) => rectIntersectsRing(x0, y0, x1, y1, ring));
      if (!hits) continue;
      cells.push({
        id: `GRID_${def.key}_r${r}_c${c}`,
        gridCode: `${def.key.replace("m", "M")}-R${r}-C${c}`,
        points: `${x0},${y0} ${x1},${y0} ${x1},${y1} ${x0},${y1} ${x0},${y0}`,
        row: r,
        col: c,
        sizeKey: def.key,
      });
    }
  }

  return { cells, meta: { sizeKey: def.key, sizeLabel: gridSizeLabel(def.key), meters: def.meters, count: cells.length } };
}