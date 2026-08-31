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
  beatId?: string;
  compId?: string;
}

/** Attribute grid cells to beat → compartment by centroid containment. */
export function tagGrids(
  grids: GridPolygon[],
  beats: TaggedBeat[],
  comps: TaggedCompartment[]
): TaggedGrid[] {
  const beatPolys = beats
    .filter((b) => b.beatId)
    .map((b) => ({ id: b.beatId!, ring: parseRing(b.points), bbox: ringBbox(parseRing(b.points)) }));
  const compPolys = comps
    .filter((c) => c.compId)
    .map((c) => ({ id: c.compId!, ring: parseRing(c.points), bbox: ringBbox(parseRing(c.points)) }));
  return grids.map((g) => {
    const centroid = ringCentroid(g.points);
    if (!centroid) return { ...g };
    const beatMatches = containingPolygons([centroid], beatPolys);
    const beatId = beatMatches.length > 0 ? beatMatches[0] : undefined;
    const compMatches = containingPolygons([centroid], compPolys);
    const compId = compMatches.length > 0 ? compMatches[0] : undefined;
    const rangeId = beatId ? beats.find((b) => b.beatId === beatId)?.rangeId : undefined;
    return { ...g, rangeId, beatId, compId };
  });
}