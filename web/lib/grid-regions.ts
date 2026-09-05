/**
 * Grid region resolution — the bridge between the backend's real GIS
 * polygons (beats / compartments / ForestGrid survey cells, all projected into
 * the SAME shared SVG map space by lib/services.ts gis.spatial()) and the
 * hierarchy register.
 *
 * A grid cell is attributed to a Range / Beat / Compartment by genuine
 * spatial containment of its centroid inside the real polygons — no values
 * are invented: if a cell's centroid falls outside every polygon, the region
 * stays undefined and the UI shows "Not available".
 *
 * The same SVG-space ring geometry is used for containment everywhere, so
 * attribution is exact within the shared projection (no lon/lat round trip).
 */

import type { BeatPolygon } from "@/lib/mock/gis";
import type { CompartmentPolygon, GridPolygon } from "@/lib/backend-adapters";
import { beatIdFor, rangeIdFor } from "@/lib/backend-adapters";

/* ------------------------------------------------------------------ */
/* Ring helpers (SVG-space "x,y x,y …" point strings)                  */
/* ------------------------------------------------------------------ */

export interface Pt {
  x: number;
  y: number;
}

export function parseRing(points: string): Pt[] {
  return points
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => {
      const [x, y] = p.split(",").map(Number);
      return { x, y };
    })
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

export function ringCentroid(points: string): Pt | null {
  const ring = parseRing(points);
  if (ring.length === 0) return null;
  return {
    x: ring.reduce((a, p) => a + p.x, 0) / ring.length,
    y: ring.reduce((a, p) => a + p.y, 0) / ring.length,
  };
}

/** Ray-casting point-in-polygon test (planar; SVG space is small & local). */
export function pointInPolygon(pt: Pt, ring: Pt[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const crosses =
      a.y > pt.y !== b.y > pt.y &&
      pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Fast bbox rejection before the full ring test. */
function ringBbox(ring: Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of ring) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function containingPolygons(
  ring: Pt[],
  polys: { id: string; ring: Pt[]; bbox: ReturnType<typeof ringBbox> }[]
): string[] {
  const inside: string[] = [];
  for (const poly of polys) {
    if (ring.length === 0) continue;
    const hits = ring.filter((p) => pointInRing(p, poly));
    if (hits.length > 0) inside.push(poly.id);
  }
  return inside;
}

function pointInRing(pt: Pt, poly: { ring: Pt[]; bbox: ReturnType<typeof ringBbox> }): boolean {
  const b = poly.bbox;
  if (pt.x < b.minX || pt.x > b.maxX || pt.y < b.minY || pt.y > b.maxY) return false;
  return pointInPolygon(pt, poly.ring);
}

/* ------------------------------------------------------------------ */
/* Tagging                                                            */
/* ------------------------------------------------------------------ */

export interface TaggedBeat extends BeatPolygon {
  rangeId?: string;
  beatId?: string;
}

/** Attach range/beat hierarchy ids to beat polygons (name-based mapping). */
export function tagBeats(beats: BeatPolygon[]): TaggedBeat[] {
  return beats.map((b) => {
    const rangeId = b.rangeId ?? rangeIdFor(b.range);
    const beatId = b.beatId ?? beatIdFor(b.range, b.name);
    return { ...b, rangeId, beatId };
  });
}

export interface TaggedCompartment extends CompartmentPolygon {
  rangeId?: string;
  beatId?: string;
  compId?: string;
}

/** Attribute compartments to beats by centroid containment (real polygons). */
export function tagCompartments(
  comps: CompartmentPolygon[],
  beats: TaggedBeat[]
): TaggedCompartment[] {
  const beatPolys = beats
    .filter((b) => b.beatId)
    .map((b) => ({ id: b.beatId!, ring: parseRing(b.points), bbox: ringBbox(parseRing(b.points)) }));
  return comps.map((c) => {
    const centroid = ringCentroid(c.points);
    const matches = centroid ? containingPolygons([centroid], beatPolys) : [];
    const beatId = matches.length > 0 ? matches[0] : undefined;
    const rangeId = beatId
      ? beats.find((b) => b.beatId === beatId)?.rangeId ?? c.rangeId
      : c.rangeId;
    return { ...c, rangeId, beatId, compId: c.compId ?? (c.id.replace(/-p\d+$/, "")) };
  });
}

export interface TaggedGrid extends GridPolygon {
  rangeId?: string;
  rangeIds?: string[];
  beatId?: string;
  beatIds?: string[];
  compId?: string;
  compIds?: string[];
  /** Coverage hint for UI — when a single beat/compartment dominates ≥90% of the cell */
  primaryBeatId?: string;
  primaryCompId?: string;
}

/** Rect vs ring intersection — re-used from lib/gis/grid.ts (planar, SVG space) */
function rectIntersectsRingFast(x0: number, y0: number, x1: number, y1: number, poly: { ring: Pt[]; bbox: ReturnType<typeof ringBbox> }): boolean {
  const { ring, bbox } = poly;
  if (x1 < bbox.minX || x0 > bbox.maxX || y1 < bbox.minY || y0 > bbox.maxY) return false;
  const corners: Pt[] = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  for (const c of corners) if (pointInRing(c, poly)) return true;
  for (const v of ring) if (v.x >= x0 && v.x <= x1 && v.y >= y0 && v.y <= y1) return true;
  const segs: [Pt, Pt][] = [[{ x: x0, y: y0 }, { x: x1, y: y0 }], [{ x: x1, y: y0 }, { x: x1, y: y1 }], [{ x: x1, y: y1 }, { x: x0, y: y1 }], [{ x: x0, y: y1 }, { x: x0, y: y0 }]];
  const n = ring.length;
  for (const [a, b] of segs) for (let j = 0; j < n; j++) if (segmentsIntersect(a, b, ring[j], ring[(j + 1) % n])) return true;
  return false;
}
function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d1 = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  const d2 = (p2.x - p1.x) * (p4.y - p1.y) - (p2.y - p1.y) * (p4.x - p1.x);
  const d3 = (p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x);
  const d4 = (p4.x - p3.x) * (p2.y - p3.y) - (p4.y - p3.y) * (p2.x - p3.x);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Estimate what fraction of a grid rect lies inside a polygon by 5×5 sampling (25 pts) */
function coverageFraction(
  x0: number, y0: number, x1: number, y1: number,
  poly: { ring: Pt[]; bbox: ReturnType<typeof ringBbox> }
): number {
  const NX = 5, NY = 5;
  let inside = 0, total = 0;
  for (let ix = 0; ix < NX; ix++) for (let iy = 0; iy < NY; iy++) {
    const x = x0 + (x1 - x0) * (ix + 0.5) / NX;
    const y = y0 + (y1 - y0) * (iy + 0.5) / NY;
    total++;
    if (pointInRing({ x, y }, poly)) inside++;
  }
  return total ? inside / total : 0;
}

/** Attribute grid cells to beats/compartments — lists all touched, but collapses to single when one dominates ≥90% */
export function tagGrids(
  grids: GridPolygon[],
  beats: TaggedBeat[],
  comps: TaggedCompartment[]
): TaggedGrid[] {
  const beatPolys = beats
    .filter((b) => b.beatId)
    .map((b) => {
      const ring = parseRing(b.points);
      return { id: b.beatId!, ring, bbox: ringBbox(ring), rangeId: b.rangeId };
    });
  const compPolys = comps
    .filter((c) => c.compId)
    .map((c) => {
      const ring = parseRing(c.points);
      return { id: c.compId!, ring, bbox: ringBbox(ring), beatId: c.beatId, rangeId: c.rangeId };
    });

  return grids.map((g) => {
    const gRing = parseRing(g.points);
    if (gRing.length < 3) return { ...g };
    const bbox = ringBbox(gRing);
    const x0 = bbox.minX, y0 = bbox.minY, x1 = bbox.maxX, y1 = bbox.maxY;

    // All beats that intersect the cell rect
    const touchingBeats = beatPolys.filter((bp) => rectIntersectsRingFast(x0, y0, x1, y1, bp));
    // All compartments that intersect
    const touchingComps = compPolys.filter((cp) => rectIntersectsRingFast(x0, y0, x1, y1, cp));

    // Determine primary (≥90% coverage) by sampling
    let primaryBeatId: string | undefined;
    let primaryCompId: string | undefined;
    let maxBeatCov = 0;
    for (const b of touchingBeats) {
      const cov = coverageFraction(x0, y0, x1, y1, b);
      if (cov > maxBeatCov) { maxBeatCov = cov; primaryBeatId = b.id; }
    }
    let maxCompCov = 0;
    for (const c of touchingComps) {
      const cov = coverageFraction(x0, y0, x1, y1, c);
      if (cov > maxCompCov) { maxCompCov = cov; primaryCompId = c.id; }
    }
    if (maxBeatCov < 0.9) primaryBeatId = undefined;
    if (maxCompCov < 0.9) primaryCompId = undefined;

    const beatIds = touchingBeats.map((b) => b.id);
    const compIds = touchingComps.map((c) => c.id);
    // Range ids are the union of the touching beats' ranges
    const rangeIds = [...new Set(touchingBeats.map((b) => b.rangeId).filter((v): v is string => Boolean(v)))];
    // Fallback to centroid for range when no beat touches (edge cell outside beats but inside boundary)
    let rangeId: string | undefined;
    if (rangeIds.length === 1) rangeId = rangeIds[0];
    else if (primaryBeatId) rangeId = beatPolys.find((b) => b.id === primaryBeatId)?.rangeId;
    else {
      const centroid = ringCentroid(g.points);
      if (centroid) {
        const m = containingPolygons([centroid], beatPolys.map((b) => ({ id: b.id, ring: b.ring, bbox: b.bbox })));
        if (m.length) rangeId = beatPolys.find((b) => b.id === m[0])?.rangeId;
      }
    }

    const beatId = primaryBeatId ?? (beatIds.length === 1 ? beatIds[0] : undefined);
    const compId = primaryCompId ?? (compIds.length === 1 ? compIds[0] : undefined);

    return {
      ...g,
      rangeId,
      rangeIds: rangeIds.length > 0 ? rangeIds : undefined,
      beatId,
      beatIds: beatIds.length > 0 ? beatIds : undefined,
      compId,
      compIds: compIds.length > 0 ? compIds : undefined,
      primaryBeatId,
      primaryCompId,
    };
  });
}