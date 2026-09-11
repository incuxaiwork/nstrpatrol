/**
 * Shared "map space" helpers. The MapLibre GL renderer (components/map.tsx)
 * positions demo and backend features in the same coordinate space; this
 * module owns the SVG viewBox → lon/lat mapping (the exact inverse of the
 * projection in lib/backend-adapters.ts) plus the GeoJSON builders for every
 * GL layer.
 */

import type { BeatPolygon, GisMarker, GisRoute, HeatBlock } from "@/lib/mock/gis";
import type { BoundaryPolygon, CompartmentPolygon } from "@/lib/backend-adapters";
import type { TaggedGrid } from "@/lib/grid-regions";

/**
 * SVG viewBox SHARED BY BOTH PROJECTION DIRECTIONS — this is the invertibility
 * contract that fixes the old coordinate bug:
 *
 *   - backend-adapters' makeProjector maps lon/lat → SVG with THIS box
 *     (the shared union extent below), and
 *   - the builders in this module map SVG -> lon/lat with the SAME box via
 *     svgToLngLat / svgRingToLngLat.
 *
 * Because the forward map (adapters) and inverse map (svgToLngLat) use the
 * exact same affine constants and no integer rounding, projecting a polygon
 * to SVG and projecting its centroid back to geographic coordinates
 * reproduces the original centroid EXACTLY (see scripts/verify-gis-projection.mjs
 * for the numeric proof — the old hardcoded 78.6–79.7 / 15.4–16.4 box put the
 * centroid 26.07 km off).
 *
 * The extents are the real union bounding box of the Markapur survey
 * (backend/assets/mark_beat.json + mark_comp.json, computed read-only) so the
 * box is a true superset of every contour and never clipped.
 */
export const SVG_MAP_SPACE = {
  w: 1000,
  h: 700,
  pad: 60,
  /** Real-world bounding box the viewBox maps onto (Markapur Division survey
   *  union — beats ∪ compartments, no padding needed: pad is already spatial). */
  minLon: 78.79562386115231,
  maxLon: 79.5670037025589,
  minLat: 15.591406785794561,
  maxLat: 16.634652237510807,
};

const availW = SVG_MAP_SPACE.w - SVG_MAP_SPACE.pad * 2;
const availH = SVG_MAP_SPACE.h - SVG_MAP_SPACE.pad * 2;

/** SVG viewBox point → [lon, lat]. */
export function svgToLngLat(x: number, y: number): [number, number] {
  const { pad, minLon, maxLon, minLat, maxLat } = SVG_MAP_SPACE;
  const lon = minLon + ((x - pad) / availW) * (maxLon - minLon);
  const lat = maxLat - ((y - pad) / availH) * (maxLat - minLat);
  return [lon, lat];
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
  if (typeof points !== "string" || !points.trim()) return [];
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
  observation: "#EAB308",
  patrol: "#2E7D32",
  incident: "#EAB308",
  sos: "#B3261E",
};

function flatProps(
  props: Record<string, unknown>
): { [name: string]: unknown } {
  return props;
}

export function beatsToFeatures(
  beats: BeatPolygon[],
  selectedId?: string | null,
  hoveredBeatId?: string | null,
  filteredBeatId?: string | null
): GeoFeatureCollection {
  return {
    type: "FeatureCollection",
    features: beats.map((b) => {
      // All outer rings — MultiPolygon-safe: a fragmented beat renders as
      // ONE feature (ONE label) whose geometry carries every disjoint part.
      const rings = [b.points, ...(b.parts ?? [])]
        .map(svgRingToLngLat)
        .filter((r) => r.length >= 4);
      const coordinates = rings.map((r) => [r]);
      return {
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
          hovered: hoveredBeatId != null && hoveredBeatId === b.beatId,
          filtered: filteredBeatId != null && filteredBeatId === b.beatId,
        }),
        geometry:
          coordinates.length > 1
            ? { type: "MultiPolygon", coordinates }
            : { type: "Polygon", coordinates: coordinates[0] ?? [] },
      };
    }),
  };
}

/** Forest boundary polygons (MultiPolygon-safe, one feature per part). */
export function boundariesToFeatures(boundaries: BoundaryPolygon[]): GeoFeatureCollection {
  return {
    type: "FeatureCollection",
    features: boundaries.map((b) => {
      const coordinates = b.parts.map((part) => [svgRingToLngLat(part)]);
      return {
        type: "Feature",
        id: b.id,
        properties: flatProps({
          id: b.id,
          name: b.name,
          forestCode: b.forestCode,
        }),
        // ONE feature per boundary regardless of part count. The symbol layer
        // therefore emits exactly ONE label per forest, anchored to the whole
        // dissolved outline — never one label per fragment along the rim.
        geometry:
          coordinates.length > 1
            ? { type: "MultiPolygon", coordinates }
            : { type: "Polygon", coordinates: coordinates[0] ?? [] },
      };
    }),
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
        category: m.category ?? null,
        severity: m.severity ?? null,
        status: m.status ?? null,
        occurredAt: m.occurredAt ?? null,
        reporter: m.reporter ?? null,
        accuracyM: m.accuracyM ?? null,
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
        patrolType: r.patrolType ?? null,
        rangerName: r.rangerName ?? null,
        startedAt: r.startedAt ?? null,
        endedAt: r.endedAt ?? null,
        durationMinutes: r.durationMinutes ?? null,
        distanceKm: r.distanceKm ?? null,
        pointCount: r.pointCount ?? null,
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

/* ------------------------------------------------------------------ */
/* LIVE patrol operations (GET /api/patrols/live)                      */
/* ------------------------------------------------------------------ */

/** One LIVE patrol path — the bounded recent window of an ACTIVE patrol.
 *  `coordinates` are real [lng, lat] fixes straight from the backend feed
 *  (chronological); they never pass through the mock SVG space. */
export interface LivePathFeature {
  id: string;
  patrolId: string;
  label: string | null;
  rangerName: string;
  coordinates: [number, number][];
  startAt: string | null;
  endAt: string | null;
  durationMinutes: number | null;
  distanceKm: number | null;
  pointCount: number;
  freshness: "current" | "stale";
}

/** One LIVE ranger position — the latest valid fix, one per ranger. */
export interface LiveRangerFeature {
  /** Feature select id = the patrol id (click → patrol detail). */
  id: string;
  patrolId: string;
  rangerName: string;
  patrolLabel: string | null;
  lng: number;
  lat: number;
  fixAt: string | null;
  accuracyM: number | null;
  speedKmh: number | null;
  pointCount: number | null;
  freshness: "current" | "stale";
  /** Actual feed path window (e.g. "15 min") for the hover card. */
  pathWindow?: string | null;
}

export function livePathsToFeatures(paths: LivePathFeature[]): GeoFeatureCollection {
  return {
    type: "FeatureCollection",
    features: paths.map((p) => ({
      type: "Feature",
      id: p.id,
      properties: flatProps({
        id: p.id,
        kind: "live-patrol",
        patrolId: p.patrolId,
        label: p.label,
        rangerName: p.rangerName,
        startedAt: p.startAt,
        endAt: p.endAt,
        durationMinutes: p.durationMinutes,
        distanceKm: p.distanceKm,
        pointCount: p.pointCount,
        freshness: p.freshness,
      }),
      geometry: { type: "LineString", coordinates: p.coordinates },
    })),
  };
}

export function liveRangersToFeatures(rangers: LiveRangerFeature[]): GeoFeatureCollection {
  return {
    type: "FeatureCollection",
    features: rangers.map((r) => ({
      type: "Feature",
      id: r.id,
      properties: flatProps({
        id: r.id,
        kind: "live-ranger",
        patrolId: r.patrolId,
        patrolLabel: r.patrolLabel,
        rangerName: r.rangerName,
        fixAt: r.fixAt,
        accuracyM: r.accuracyM,
        speedKmh: r.speedKmh,
        pointCount: r.pointCount,
        freshness: r.freshness,
        pathWindow: r.pathWindow ?? null,
      }),
      geometry: { type: "Point", coordinates: [r.lng, r.lat] },
    })),
  };
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

/**
 * Playback geometry at `progress` (0..1) — base trail (full path in blue),
 * progress trail (played portion in red), head point, and the GPS dots played
 * so far. `dots` holds only the points up to the current playhead so the
 * replayed patrol's markers animate in alongside the trail instead of flashing
 * every fix at once.
 */
export function replayFeatures(
  timed: TimedPoint[],
  progress: number
): { baseTrail: GeoFeatureCollection; trail: GeoFeatureCollection; head: GeoFeatureCollection; dots: GeoFeatureCollection } {
  const allPoints = timed.map((p) => [p.lon, p.lat] as [number, number]);
  const shown = timed.slice(0, Math.floor(progress * Math.max(timed.length - 1, 0)) + 1);
  const points = shown.map((p) => [p.lon, p.lat] as [number, number]);
  const last = points[points.length - 1];
  return {
    baseTrail: {
      type: "FeatureCollection",
      features:
        allPoints.length >= 2
          ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: allPoints } }]
          : [],
    },
    trail: {
      type: "FeatureCollection",
      features:
        points.length >= 2
          ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: points } }]
          : [],
    },
    head: {
      type: "FeatureCollection",
      features: last
        ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: last } }]
        : [],
    },
    dots: {
      type: "FeatureCollection",
      features: points.map((p) => ({
        type: "Feature" as const,
        properties: {},
        geometry: { type: "Point" as const, coordinates: p },
      })),
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
  /** Primary SVG ring of the range outline — the largest part. */
  points: string;
  color: string;
  /** Hierarchy range id, when the beats carry region tags. */
  rangeId?: string;
  /** Additional SVG rings when a range is spatially fragmented. */
  parts?: string[];
}

export const RANGE_COLORS = [
  "#1F4626",
  "#0E4C92",
  "#4A6572",
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

export function rangeLabel(key: string): string {
  const m = key.match(/^r-(\w+)$/i);
  return m ? m[1].toUpperCase() : key;
}

/** Group beats by range and edge-dissolve each range's real beat outlines.
 *  Same union semantics as the forest boundary (dissolveRings) so range
 *  boundaries follow the actual beat edges instead of a convex hull. */
export function rangesFromBeats(beats: BeatPolygon[]): RangePolygon[] {
  const byRange = new Map<string, BeatPolygon[]>();
  for (const b of beats) {
    const key = b.range || "—";
    if (!byRange.has(key)) byRange.set(key, []);
    byRange.get(key)!.push(b);
  }
  const entries = [...byRange.entries()];
  return entries
    .map(([key, group], i): RangePolygon | null => {
      const polys: [number, number][][] = [];
      for (const b of group) {
        for (const ringStr of [b.points, ...(b.parts ?? [])]) {
          const ring = parsePoly(ringStr);
          if (ring.length >= 4) polys.push(ring);
        }
      }
      // Fragmented ranges yield several rings; `points` keeps the largest so
      // its centroid anchors the range label.
      const parts = dissolveRings(polys).sort(
        (a, b) => parsePoly(b).length - parsePoly(a).length
      );
      if (parts.length === 0) return null;
      return {
        id: `range-${key}`,
        name: rangeLabel(key),
        division: group[0]?.division ?? "",
        rangeId: group.find((b) => b.rangeId)?.rangeId,
        points: parts[0],
        parts: parts.length > 1 ? parts : undefined,
        color: RANGE_COLORS[i % RANGE_COLORS.length],
      };
    })
    .filter((r): r is RangePolygon => r !== null);
}

/**
 * Dissolve a set of closed SVG polygon rings into the outline of their
 * union (edge dissolve). An edge owned by exactly one ring is part of the
 * dissolved boundary; an edge shared by two rings is interior and dropped.
 * Edges are keyed canonically by their two endpoints *without* direction
 * (the lexicographically smaller endpoint first), so an interior divider
 * counts as shared no matter which direction each neighbouring ring
 * digitised it in (survey rings commonly trace a shared boundary in
 * opposite directions). Vertices are quantized to an EPS grid before
 * keying — adjacent rings rarely digitize a shared node to the exact same
 * double, and EPS (~0.2 m at this scale) snaps near-identical vertices
 * together — while the surviving boundary vertices keep their original
 * (unquantized) coordinates, so the dissolve never moves the map.
 * Surviving edges are walked back into closed rings.
 * Returns [] when nothing can be dissolved (no rings, or no boundary
 * edges) so a layer using it stays honestly empty.
 */
export function dissolveRings(polys: [number, number][][]): string[] {
  if (polys.length === 0) return [];

  const EPS = 2e-3;
  const qk = (p: [number, number]): string =>
    `${Math.round(p[0] / EPS)},${Math.round(p[1] / EPS)}`;
  const nodeExact = new Map<string, [number, number]>();
  const edgeRings = new Map<string, Set<number>>();
  for (let ri = 0; ri < polys.length; ri++) {
    const poly = polys[ri];
    const seen = new Set<string>();
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i];
      const b = poly[i + 1];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      const qa = qk(a);
      const qb = qk(b);
      if (qa === qb) continue;
      const key = qa < qb ? `${qa}|${qb}` : `${qb}|${qa}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const rings = edgeRings.get(key) ?? new Set<number>();
      rings.add(ri);
      edgeRings.set(key, rings);
      if (!nodeExact.has(qa)) nodeExact.set(qa, a);
      if (!nodeExact.has(qb)) nodeExact.set(qb, b);
    }
  }

  const neighbors = new Map<string, string[]>();
  for (const [key, rings] of edgeRings) {
    if (rings.size !== 1) continue;
    const [a, b] = key.split("|");
    const la = neighbors.get(a) ?? [];
    la.push(b);
    neighbors.set(a, la);
    const lb = neighbors.get(b) ?? [];
    lb.push(a);
    neighbors.set(b, lb);
  }
  if (neighbors.size === 0) return [];

  // Reassemble the surviving boundary edges into closed rings by planar face
  // traversal. Each boundary edge separates two dissolving cells; ordering the
  // neighbours of every vertex by angle, each face is recovered by following
  // every directed edge to its successor around the same face (the neighbour
  // immediately before the incoming vertex in the circular order). Junction
  // vertices and fragmented edges resolve exactly — no heuristic that could
  // jump to a distant vertex and draw a long straight chord across open
  // terrain, and no vertex is ever moved.
  const parseV = (s: string): [number, number] => {
    const i = s.indexOf(",");
    return [Number(s.slice(0, i)), Number(s.slice(i + 1))];
  };
  const angleOf = (o: [number, number], n: [number, number]): number =>
    Math.atan2(n[1] - o[1], n[0] - o[0]);
  const sortedNeighbors = new Map<string, string[]>();
  for (const [u, nbrs] of neighbors) {
    const o = nodeExact.get(u) ?? parseV(u);
    sortedNeighbors.set(
      u,
      [...nbrs].sort((p, q) => {
        const a = angleOf(o, nodeExact.get(p) ?? parseV(p));
        const b = angleOf(o, nodeExact.get(q) ?? parseV(q));
        return a - b;
      }),
    );
  }
  const nextOf = new Map<string, string>();
  for (const [v, nbrs] of sortedNeighbors) {
    const deg = nbrs.length;
    for (let i = 0; i < deg; i++) {
      nextOf.set(`${nbrs[i]}|${v}`, `${v}|${nbrs[(i - 1 + deg) % deg]}`);
    }
  }

  const used = new Set<string>();
  const parts: string[] = [];
  for (const [startDir] of nextOf) {
    if (used.has(startDir)) continue;
    const ring: string[] = [];
    let dir = startDir;
    let guard = 0;
    while (!used.has(dir) && guard <= nextOf.size) {
      used.add(dir);
      ring.push(dir.slice(0, dir.indexOf("|")));
      dir = nextOf.get(dir)!;
      guard++;
    }
    if (ring.length < 3) continue;
    // The face traversal yields every face of the boundary planar graph,
    // including the unbounded exterior face. Bounded dissolving faces are
    // traversed counterclockwise — keep only those (positive signed area) and
    // drop the exterior.
    let signedArea = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = nodeExact.get(ring[i]) ?? parseV(ring[i]);
      const q = nodeExact.get(ring[(i + 1) % ring.length]) ?? parseV(ring[(i + 1) % ring.length]);
      signedArea += p[0] * q[1] - q[0] * p[1];
    }
    if (signedArea <= 0) continue;
    // Close the ring (first point repeated) so MapLibre renders a Polygon,
    // emitting the original (unquantized) coordinates.
    parts.push(
      [...ring, ring[0]]
        .map((k) => {
          const v = nodeExact.get(k) ?? parseV(k);
          return `${v[0]},${v[1]}`;
        })
        .join(" "),
    );
  }

  // A ~0.0253 km² per SVG-unit² scale times a 0.01 km² floor drops the
  // sub-meter sliver rings that survive the dissolve when neighbouring
  // beats share slightly non-identical edges (common in survey data). Those
  // slivers draw as hairline fragments along the rim and fragment the field
  // stacking of the two sides. Kept parts are the forest's true islands.
  if (parts.length > 1) {
    const KM2_PER_SVG2 = 0.0253;
    const svg2Area = (ring: string): number => {
      const v = ring.split(/\s+/).map(parseV);
      let a = 0;
      for (let i = 0; i < v.length - 1; i++) a += v[i][0] * v[i + 1][1] - v[i + 1][0] * v[i][1];
      return Math.abs(a / 2);
    };
    return parts.filter((p) => svg2Area(p) * KM2_PER_SVG2 >= 0.01);
  }
  return parts;
}

/**
 * Derive the reserved forest boundary as the union of the real beat
 * polygons (edge dissolve, see dissolveRings). Beats in a division tile
 * contiguously — shared interior edges dissolve away, leaving the forest's
 * outer outline: the same result the (unavailable, PostGIS) /boundary path
 * would produce via ST_Union(geom), computed read-only from the real beat
 * geometry with no new dependency and no fabricated coordinates.
 *
 * Returns [] when nothing can be dissolved (no beats, or no boundary
 * edges) so the layer stays honestly empty.
 */
export function boundaryFromBeats(beats: BeatPolygon[]): BoundaryPolygon[] {
  const polys: [number, number][][] = [];
  for (const b of beats) {
    for (const ringStr of [b.points, ...(b.parts ?? [])]) {
      const ring = parsePoly(ringStr);
      if (ring.length >= 4) polys.push(ring);
    }
  }
  const parts = dissolveRings(polys);
  if (parts.length === 0) return [];

  return [
    {
      id: "forest-boundary",
      name: "Forest boundary",
      forestCode: "",
      parts,
    },
  ];
}

function ringCentroid(ringLike: string | [number, number][]): [number, number] {
  const ring = typeof ringLike === "string" ? parsePoly(ringLike) : ringLike;
  const n = ring.length || 1;
  const x = ring.reduce((a, p) => a + p[0], 0) / n;
  const y = ring.reduce((a, p) => a + p[1], 0) / n;
  return [x, y];
}

export function rangesToFeatures(ranges: RangePolygon[]): GeoFeatureCollection {
  return {
    type: "FeatureCollection",
    features: ranges.map((r) => {
      const all = r.parts && r.parts.length > 1 ? r.parts : [r.points];
      const coordinates = all.map((part) => [svgRingToLngLat(part)]);
      return {
        type: "Feature",
        id: r.id,
        properties: flatProps({
          id: r.id,
          name: r.name,
          division: r.division,
          rangeId: r.rangeId ?? null,
          color: r.color,
        }),
        geometry:
          coordinates.length > 1
            ? { type: "MultiPolygon", coordinates }
            : { type: "Polygon", coordinates: coordinates[0] },
      };
    }),
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

export function compartmentsToFeatures(
  comps: CompartmentPolygon[],
  hoveredCompId?: string | null,
  filteredCompId?: string | null
): GeoFeatureCollection {
  return {
    type: "FeatureCollection",
    features: comps.map((c) => {
      const coordinates = [svgRingToLngLat(c.points), ...(c.holes ?? []).map((h) => svgRingToLngLat(h))];
      return {
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
          hovered: hoveredCompId != null && hoveredCompId === (c.compId ?? c.id),
          filtered: filteredCompId != null && filteredCompId === (c.compId ?? c.id),
        }),
        geometry: {
          type: "Polygon",
          coordinates: [coordinates[0], ...(coordinates.length > 1 ? coordinates.slice(1) : [])],
        },
      };
    }),
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

/**
 * Build the topmost region-hover highlight geometry for the currently hovered
 * Beat or Compartment. Returns the entity's COMPLETE boundary so the yellow
 * highlight draws the whole 360° outline (all outer rings; compartments keep
 * their interior holes as-is). Empty features when nothing is hovered.
 */
export function regionHoverToFeatures(
  beatId: string | null | undefined,
  compId: string | null | undefined,
  beats: BeatPolygon[],
  comps: CompartmentPolygon[],
  compIdOf: (c: CompartmentPolygon) => string | null | undefined
): GeoFeatureCollection {
  // Compartment hover wins — the finest entity under the cursor. Only one
  // highlight at a time so we never stack overlapping yellow geometries.
  if (compId) {
    const c = comps.find((x) => (compIdOf(x) ?? x.id) === compId);
    if (c) {
      const rings = [c.points, ...(c.holes ?? [])].map(svgRingToLngLat).filter((r) => r.length >= 4);
      return {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: c.id,
            properties: { kind: "compartment", id: c.id },
            geometry:
              rings.length > 1
                ? { type: "MultiPolygon", coordinates: rings.map((r) => [r]) }
                : { type: "Polygon", coordinates: rings[0] ? [rings[0]] : [] },
          },
        ],
      };
    }
  }
  if (beatId) {
    const b = beats.find((x) => x.beatId === beatId);
    if (b) {
      const rings = [b.points, ...(b.parts ?? [])].map(svgRingToLngLat).filter((r) => r.length >= 4);
      return {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: b.id,
            properties: { kind: "beat", id: b.id },
            geometry:
              rings.length > 1
                ? { type: "MultiPolygon", coordinates: rings.map((r) => [r]) }
                : { type: "Polygon", coordinates: rings[0] ? [rings[0]] : [] },
          },
        ],
      };
    }
  }
  return emptyFc();
}