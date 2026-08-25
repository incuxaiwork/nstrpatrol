/**
 * Adapters converting backend API payloads into the web portal's domain
 * shapes (lib/types). Kept pure (no IO) so services.ts can own the
 * remote-vs-mock decision.
 */

import type { GeoJsonFeatureCollection, ApiAlert } from "@/lib/api";
import type {
  Observation,
  ObservationCategory,
  ObservationSeverity,
  ObservationStatus,
  Patrol,
  PatrolEvent,
  PatrolMethod,
  PatrolStatus,
  AdminUser,
  NotificationItem,
  Ranger,
} from "@/lib/types";
import type { BeatPolygon } from "@/lib/mock/gis";
import { SVG_MAP_SPACE } from "@/lib/map-space";

/* ------------------------------------------------------------------ */
/* GeoJSON → map shapes                                                */
/* ------------------------------------------------------------------ */

/** SVG viewBox shared by the mock map (see lib/map-space.ts). */
const VIEW = SVG_MAP_SPACE;

interface LngLatRing { lon: number; lat: number; }

/** Lon/lat bounding box — shared across GIS layers so beats and
 *  compartments project into the same viewBox space and stay aligned. */
export interface GeoExtent {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

function ringOf(feature: { geometry: { type: string; coordinates: unknown } | null }): LngLatRing[] {
  const g = feature.geometry;
  if (!g) return [];
  if (g.type === "Polygon") {
    const coords = g.coordinates as unknown[];
    const outer = coords[0];
    if (!Array.isArray(outer)) return [];
    return (outer as number[][]).map(([lon, lat]) => ({ lon, lat }));
  }
  if (g.type === "MultiPolygon") {
    const polygons = g.coordinates as unknown[];
    const first = polygons[0] as unknown[][] | undefined;
    const outer = first?.[0];
    if (!Array.isArray(outer)) return [];
    return (outer as number[][]).map(([lon, lat]) => ({ lon, lat }));
  }
  return [];
}

/** Union extent across multiple feature collections, or null when empty. */
export function unionExtent(...fcs: GeoJsonFeatureCollection[]): GeoExtent | null {
  const rings = fcs.flatMap((fc) => fc.features.flatMap(ringOf));
  if (rings.length === 0) return null;
  return {
    minLon: Math.min(...rings.map((p) => p.lon)),
    maxLon: Math.max(...rings.map((p) => p.lon)),
    minLat: Math.min(...rings.map((p) => p.lat)),
    maxLat: Math.max(...rings.map((p) => p.lat)),
  };
}

/** Projector that maps lon/lat into the shared SVG viewBox (1000×700). */
function makeProjector(extent: GeoExtent) {
  const spanLon = Math.max(extent.maxLon - extent.minLon, 1e-6);
  const spanLat = Math.max(extent.maxLat - extent.minLat, 1e-6);
  const availW = VIEW.w - VIEW.pad * 2;
  const availH = VIEW.h - VIEW.pad * 2;
  return (lon: number, lat: number) => ({
    x: Math.round(VIEW.pad + ((lon - extent.minLon) / spanLon) * availW),
    y: Math.round(VIEW.pad + ((extent.maxLat - lat) / spanLat) * availH),
  });
}

function extentOf(fc: GeoJsonFeatureCollection, fallback: GeoExtent | null): GeoExtent {
  return unionExtent(fc) ?? fallback ?? {
    minLon: SVG_MAP_SPACE.minLon,
    maxLon: SVG_MAP_SPACE.maxLon,
    minLat: SVG_MAP_SPACE.minLat,
    maxLat: SVG_MAP_SPACE.maxLat,
  };
}

export function beatsFromGeoJson(fc: GeoJsonFeatureCollection, extent?: GeoExtent | null): BeatPolygon[] {
  const features = fc.features.filter(
    (f) => f.geometry?.type === "Polygon" && Array.isArray((f.geometry.coordinates as unknown[])[0])
  );
  if (features.length === 0) return [];

  const proj = makeProjector(extentOf(fc, extent ?? null));

  return features.map((f, i) => {
    const ring = ringOf(f);
    const coverage = Number(f.properties.coveragePct ?? f.properties.Coverage_pct);
    return {
      id: String(f.id ?? `api-beat-${i}`),
      name: String(f.properties.Beat ?? f.properties.name ?? `Beat ${i + 1}`),
      division: String(f.properties.Division ?? ""),
      range: String(f.properties.Range ?? ""),
      points: ring.map((p) => `${proj(p.lon, p.lat).x},${proj(p.lon, p.lat).y}`).join(" "),
      coveragePct: Number.isFinite(coverage) ? coverage : null,
      // Zero-patrol flag only when the backend supplies a coverage value.
      ...(Number.isFinite(coverage) ? { isZeroPatrol: coverage < 70 } : {}),
    };
  });
}

export interface CompartmentPolygon {
  id: string;
  compNo: string;
  beat: string;
  points: string;
  areaHa: number;
  /** Region tags (client-side spatial resolution over real polygons). */
  rangeId?: string;
  beatId?: string;
  compId?: string;
}

/** Reserved forest boundary — one or more outer rings (MultiPolygon-safe). */
export interface BoundaryPolygon {
  id: string;
  name: string;
  forestCode: string;
  /** One SVG point-string per polygon part. */
  parts: string[];
}

/** Reference grid cell. */
export interface GridPolygon {
  id: string;
  gridCode: string;
  points: string;
  /** Region resolution (client-side spatial containment over real polygons). */
  rangeId?: string;
  beatId?: string;
  /** Contained compartment id, when the grid centroid falls inside one. */
  compId?: string;
}

/** All outer rings of a Polygon or MultiPolygon (one entry per part). */
function ringsOf(feature: { geometry: { type: string; coordinates: unknown } | null }): LngLatRing[][] {
  const g = feature.geometry;
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) return [];
  /* Normalize to a list of polygons first — for a plain Polygon the
   * coordinates ARE the single polygon's ring list; taking [0] of each
   * ring would grab a coordinate pair instead of the outer ring. */
  const polys: unknown[][] =
    g.type === "Polygon" ? [g.coordinates as unknown[]] : (g.coordinates as unknown[][]);
  return polys.map((poly) => {
    const outer = Array.isArray(poly) ? poly[0] : poly;
    if (!Array.isArray(outer)) return [];
    return (outer as number[][])
      .filter((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .map(([lon, lat]) => ({ lon, lat }));
  });
}

export function boundariesFromGeoJson(fc: GeoJsonFeatureCollection, extent?: GeoExtent | null): BoundaryPolygon[] {
  const features = fc.features.filter(
    (f) =>
      (f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon") &&
      Array.isArray((f.geometry.coordinates as unknown[])[0])
  );
  if (features.length === 0) return [];

  const proj = makeProjector(extentOf(fc, extent ?? null));

  return features.map((f, i) => ({
    id: String(f.id ?? `api-boundary-${i}`),
    name: String(f.properties.name ?? "Forest boundary"),
    forestCode: String(f.properties.forestCode ?? ""),
    parts: ringsOf(f).map((ring) => ring.map((p) => `${proj(p.lon, p.lat).x},${proj(p.lon, p.lat).y}`).join(" ")),
  }));
}

export function gridsFromGeoJson(fc: GeoJsonFeatureCollection, extent?: GeoExtent | null): GridPolygon[] {
  const features = fc.features.filter(
    (f) => f.geometry?.type === "Polygon" && Array.isArray((f.geometry.coordinates as unknown[])[0])
  );
  if (features.length === 0) return [];

  const proj = makeProjector(extentOf(fc, extent ?? null));

  return features.map((f, i) => {
    const ring = ringOf(f);
    return {
      id: String(f.id ?? `api-grid-${i}`),
      gridCode: String(f.properties.gridCode ?? `G${i + 1}`),
      points: ring.map((p) => `${proj(p.lon, p.lat).x},${proj(p.lon, p.lat).y}`).join(" "),
    };
  });
}

export function compartmentsFromGeoJson(fc: GeoJsonFeatureCollection, extent?: GeoExtent | null): CompartmentPolygon[] {
  const features = fc.features.filter(
    (f) =>
      (f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon") &&
      Array.isArray((f.geometry.coordinates as unknown[])[0])
  );
  if (features.length === 0) return [];

  const proj = makeProjector(extentOf(fc, extent ?? null));

  /* One polygon per outer ring — MultiPolygons expand into sibling parts
   * sharing compNo/beat/area (deterministic -pN id suffixes) so no feature
   * ever silently disappears from the map. */
  return features.flatMap((f, i) => {
    const compNo = String(f.properties.COMP_NO ?? f.properties.compNo ?? `C${i + 1}`);
    const beat = String(f.properties.BEAT ?? "");
    const area = Number(f.properties.AREA_HA ?? f.properties.areaHa);
    const areaHa = Number.isFinite(area) ? area : 0;
    const baseId = String(f.id ?? `api-comp-${i}`);
    return ringsOf(f)
      .filter((ring) => ring.length > 0)
      .map((ring, part) => ({
        id: part === 0 ? baseId : `${baseId}-p${part + 1}`,
        compNo,
        beat,
        points: ring.map((p) => `${proj(p.lon, p.lat).x},${proj(p.lon, p.lat).y}`).join(" "),
        areaHa,
      }));
  });
}

/* ------------------------------------------------------------------ */
/* Forest hierarchy ↔ backend GIS beats/compartments                    */
/* ------------------------------------------------------------------ */

export interface HierarchyUnit {
  id: string;
  name: string;
  parent: string;
}

export interface HierarchyCompartment {
  id: string;
  compNo: string;
  beat: string;
  range: string;
  areaHa: number;
}

export interface HierarchyTree {
  divisions: HierarchyUnit[];
  /** Keyed by division id. */
  ranges: Record<string, HierarchyUnit[]>;
  /** Keyed by range id. */
  beats: Record<string, HierarchyUnit[]>;
  compartments: HierarchyCompartment[];
}

/** Lowercase; non-alphanumeric runs → "-"; used for stable unit ids. */
function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Deterministic id/name mapping for the known Markapur hierarchy. */
const DIVISION_MAP: Record<string, { id: string; name: string }> = {
  "DD MARKAPUR": { id: "d-markapur", name: "Markapur Division" },
};

const RANGE_MAP: Record<string, { id: string; name: string }> = {
  "V.P.SOUTH": { id: "r-vp-south", name: "V.P. South" },
  "Y.PALEM": { id: "r-y-palem", name: "Y. Palem" },
  NEKKANTI: { id: "r-nekkanti", name: "Nekkanti" },
  "G.V.PALLI": { id: "r-gv-palli", name: "G.V. Palli" },
  DORNALA: { id: "r-dornala", name: "Dornala" },
  KORRAPROLU: { id: "r-korraprolu", name: "Korraprolu" },
  MARKAPUR: { id: "r-markapur", name: "Markapur" },
};

function divisionUnit(divisionName: string): HierarchyUnit {
  const known = DIVISION_MAP[divisionName];
  if (known) return { id: known.id, name: known.name, parent: "" };
  const id = `d-${slugify(divisionName)}`;
  return { id, name: divisionName, parent: "" };
}

function rangeUnit(rangeName: string, divisionId: string): HierarchyUnit {
  const known = RANGE_MAP[rangeName];
  if (known) return { id: known.id, name: known.name, parent: divisionId };
  const id = `r-${slugify(rangeName)}`;
  return { id, name: rangeName, parent: divisionId };
}

function beatUnit(beatName: string, range: HierarchyUnit): HierarchyUnit {
  const id = `b-${range.id.replace(/^r-/, "")}-${slugify(beatName)}`;
  return { id, name: beatName, parent: range.id };
}

/* ------------------------------------------------------------------ */
/* Region key resolution (raw names ↔ hierarchy ids)                   */
/* ------------------------------------------------------------------ */

/**
 * Normalize a range reference to its hierarchy range id. Accepts either the
 * raw feature property ("V.P.SOUTH") or an already-normalized id
 * ("r-vp-south") — beat polygons from the backend carry raw names, mock
 * fixtures carry ids.
 */
export function rangeIdFor(rawRange: string): string | undefined {
  if (!rawRange) return undefined;
  const known = RANGE_MAP[rawRange];
  if (known) return known.id;
  if (/^r-/.test(rawRange)) return rawRange;
  const id = `r-${slugify(rawRange)}`;
  return RANGE_MAP[id]?.id ?? id;
}

/** Beat hierarchy id for a (range, beat) pair, mirroring hierarchyFromGeoJson. */
export function beatIdFor(rawRange: string, beatName: string): string | undefined {
  const rangeId = rangeIdFor(rawRange);
  if (!rangeId || !beatName) return undefined;
  return `b-${rangeId.replace(/^r-/, "")}-${slugify(beatName)}`;
}

/** Derive the division → range → beat tree + compartments from the backend
 *  GIS layers (GET /api/gis/beats + /api/gis/compartments). Empty input
 *  yields an empty tree (callers fall back to the mobile-derived register).
 *  Note: raw feature property names ("DD MARKAPUR", "V.P.SOUTH") are kept as
 *  the map keys throughout — display names come from DIVISION_MAP/RANGE_MAP. */
export function hierarchyFromGeoJson(
  beatsFc: GeoJsonFeatureCollection,
  compsFc: GeoJsonFeatureCollection | null
): HierarchyTree {
  const divisionNames = new Set<string>();
  const rangeNamesByDivision = new Map<string, Set<string>>();
  const beatsByRange = new Map<string, { name: string; rangeName: string }[]>();

  for (const f of beatsFc.features) {
    const div = String(f.properties.Division ?? "");
    const range = String(f.properties.Range ?? "");
    const beat = String(f.properties.Beat ?? "");
    if (!div || !range || !beat) continue;
    divisionNames.add(div);
    if (!rangeNamesByDivision.has(div)) rangeNamesByDivision.set(div, new Set());
    rangeNamesByDivision.get(div)!.add(range);
    const key = `${div}::${range}`;
    if (!beatsByRange.has(key)) beatsByRange.set(key, []);
    beatsByRange.get(key)!.push({ name: beat, rangeName: range });
  }

  const rawDivisions = [...divisionNames].sort();
  const divisionUnitByRaw = new Map<string, HierarchyUnit>();
  for (const raw of rawDivisions) divisionUnitByRaw.set(raw, divisionUnit(raw));
  const divisions = rawDivisions.map((raw) => divisionUnitByRaw.get(raw)!);

  const ranges: Record<string, HierarchyUnit[]> = {};
  const beats: Record<string, HierarchyUnit[]> = {};
  const beatIdsByName = new Map<string, string>();

  for (const rawDiv of rawDivisions) {
    const div = divisionUnitByRaw.get(rawDiv)!;
    const rangeNames = [...(rangeNamesByDivision.get(rawDiv) ?? new Set<string>())].sort();
    ranges[div.id] = rangeNames.map((rn) => rangeUnit(rn, div.id));
    for (const rangeName of rangeNames) {
      const range = rangeUnit(rangeName, div.id);
      const key = `${rawDiv}::${rangeName}`;
      const beatList = (beatsByRange.get(key) ?? []).sort((a, b) => a.name.localeCompare(b.name));
      beats[range.id] = beatList.map((b) => beatUnit(b.name, range));
      for (const bu of beats[range.id]) beatIdsByName.set(bu.name, bu.id);
    }
  }

  const compartments: HierarchyCompartment[] = (compsFc?.features ?? []).flatMap((f) => {
    const beatName = String(f.properties.BEAT ?? "");
    const compNo = String(f.properties.COMP_NO ?? "");
    const area = Number(f.properties.AREA_HA ?? f.properties.areaHa);
    const beatId = beatIdsByName.get(beatName);
    if (!beatName || !compNo || !beatId) return [];
    const rangeId = Object.entries(beats)
      .find(([, list]) => list.some((b) => b.id === beatId))?.[0];
    if (!rangeId) return [];
    return [
      {
        id: `${beatId}-c-${slugify(compNo)}`,
        compNo,
        beat: beatId,
        range: rangeId,
        areaHa: Number.isFinite(area) ? area : 0,
      },
    ];
  });

  return { divisions, ranges, beats, compartments };
}

/* ------------------------------------------------------------------ */
/* Patrols                                                             */
/* ------------------------------------------------------------------ */

const patrolStatusMap: Record<string, PatrolStatus> = {
  ACTIVE: "ongoing",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const patrolMethodMap: Record<string, PatrolMethod> = {
  WALK: "foot",
  BICYCLE: "cycle",
  VEHICLE: "four-wheeler",
  STATIONARY: "foot",
};

export function patrolFromApi(
  p: {
    id: string;
    name?: string | null;
    description?: string | null;
    type?: string;
    status?: string;
    startedAt?: string | null;
    endedAt?: string | null;
    createdAt?: string;
    beat?: string | null;
    forest?: { code?: string } | null;
    user?: { fullName?: string } | null;
    geography?: {
      beatId: string | null;
      beat: string | null;
      range: string | null;
      rangeId: string | null;
      subDivision: string | null;
      subDivisionId: string | null;
      division: string | null;
    } | null;
    stats?: { points?: number; distanceKm?: number; durationSeconds?: number };
  },
  points: { lat: number; lng: number; t?: string | null }[] = [],
  patrolIncidents: { patrolId?: string | null; photos?: string[] }[] = []
): Patrol {
  const mine = patrolIncidents.filter((i) => i.patrolId === p.id);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const timeline: PatrolEvent[] = [];
  if (firstPoint?.t) timeline.push({ time: firstPoint.t, kind: "start", label: "Patrol started" });
  if (lastPoint?.t) timeline.push({ time: lastPoint.t, kind: "end", label: "Patrol ended" });
  return {
    id: p.id,
    code: `PT-${p.id.slice(-6).toUpperCase()}`,
    title: p.name ?? (p.forest?.code ? `${p.forest.code} patrol` : "Field patrol"),
    // No semantic patrol-type entity exists in the backend — leave undefined
    // ("—" / "Unavailable" in the UI). The device's movement mode is mapped
    // separately into `method`.
    type: undefined,
    method: p.type ? patrolMethodMap[p.type] ?? undefined : undefined,
    status: (p.status ? patrolStatusMap[p.status] : undefined) ?? "ongoing",
    objective: p.description ?? "",
    // Authoritative server-resolved geography only. Unresolved levels stay
    // "" (rendered "—"), never guessed.
    division: p.geography?.division ?? "",
    range: p.geography?.range ?? "",
    beat: p.geography?.beat ?? p.beat ?? "",
    teamId: "",
    leader: p.user?.fullName ?? "",
    members: [],
    startScheduled: p.startedAt ?? p.createdAt ?? new Date().toISOString(),
    startActual: firstPoint?.t ?? p.startedAt ?? undefined,
    endActual: lastPoint?.t ?? p.endedAt ?? undefined,
    distanceKm: p.stats?.distanceKm ?? 0,
    durationMin: p.stats?.durationSeconds ? Math.round(p.stats.durationSeconds / 60) : 0,
    // Real coverage arrives only via GET /api/patrols/:id/coverage/summary on
    // the DETAIL view (services.patrols.get merges it); lists never carry it.
    checkpoints: undefined,
    incidents: mine.length,
    observations: mine.length,
    photos: mine.reduce((acc, i) => acc + (i.photos?.length ?? 0), 0),
    route: points.map((pt) => ({ lat: pt.lat, lng: pt.lng })),
    timeline,
  };
}

/* ------------------------------------------------------------------ */
/* Observations ↔ backend incidents                                    */
/* ------------------------------------------------------------------ */

/**
 * True when an incident record IS an SOS. The ranger app sends SOS as
 * QUICK_CAPTURE with details.sos === true; legacy/manual entries may carry a
 * title starting with "SOS". Same predicate the GIS marker builder uses, so
 * the map, the feed and the control room always agree on what an SOS is.
 */
export function isSosIncident(i: {
  type?: string;
  title?: string;
  details?: Record<string, unknown> | null;
}): boolean {
  if (i.type === "QUICK_CAPTURE") return true;
  if ((i.title ?? "").toUpperCase().startsWith("SOS")) return true;
  return i.details?.sos === true;
}

const categoryFromType: Record<string, ObservationCategory> = {
  HUMAN_IMPACT: "human-impact",
  ANIMAL_MORTALITY: "mortality",
  SIGHTING: "wildlife",
  WATER_SOURCE: "water-body",
  QUICK_CAPTURE: "others",
  GENERAL: "others",
};

const severityFromApi: Record<string, ObservationSeverity> = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
};

const statusFromApi: Record<string, ObservationStatus> = {
  SUBMITTED: "open",
  VERIFIED: "under-review",
  RESOLVED: "resolved",
  // REJECTED is its own lifecycle state — it must never read as "resolved"
  // (a rejected report was dismissed, not closed out successfully).
  REJECTED: "rejected",
};

export function observationFromApi(i: {
  id: string;
  type?: string;
  title?: string;
  description?: string | null;
  severity?: string;
  status?: string;
  latitude?: number | null;
  longitude?: number | null;
  occurredAt?: string;
  reportedAt?: string;
  patrolId?: string | null;
  user?: { fullName?: string } | null;
  photos?: string[];
}): Observation {
  const severity = i.severity ? severityFromApi[i.severity] ?? "medium" : "medium";
  return {
    id: i.id,
    code: `OB-${i.id.slice(-4).toUpperCase()}`,
    category: (i.type ? categoryFromType[i.type] : undefined) ?? "others",
    subcategory: "",
    title: i.title ?? "Incident report",
    description: i.description ?? "",
    severity,
    status: (i.status ? statusFromApi[i.status] : undefined) ?? "open",
    priority: severity === "high" ? ("urgent" as const) : undefined,
    division: "",
    range: "",
    beat: "",
    recordedBy: i.user?.fullName ?? "—",
    recordedAt: i.occurredAt ?? i.reportedAt ?? new Date().toISOString(),
    patrolId: i.patrolId ?? undefined,
    // Preserve absence honestly — a missing GPS fix must never become a
    // fabricated (0, 0) pin in the Gulf of Guinea.
    lat: i.latitude ?? null,
    lng: i.longitude ?? null,
    media: (i.photos ?? []).map((src, n) => {
      void src;
      return {
        type: "photo" as const,
        label: `Photo ${n + 1}`,
        captureTime: i.occurredAt ?? i.reportedAt ?? new Date().toISOString(),
      };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Admin users ↔ backend users                                         */
/* ------------------------------------------------------------------ */

const roleIdFromApi: Record<string, string> = {
  ADMIN: "admin",
  RANGER: "ranger",
};

export function adminUserFromApi(u: {
  id: string;
  fullName?: string;
  email?: string;
  role?: string;
  isActive?: boolean;
  cader?: string | null;
}): AdminUser {
  return {
    id: u.id,
    name: u.fullName ?? "",
    email: u.email ?? "",
    roleId: u.role ? roleIdFromApi[u.role] ?? u.role.toLowerCase() : "ranger",
    status: u.isActive === false ? "disabled" : "active",
    division: "",
    created: "",
  };
}

/* ------------------------------------------------------------------ */
/* Users → rangers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Ranger directory entry built from the users API (GET /api/users?role=RANGER).
 * The backend stores no division/range/beat/duty-status or per-ranger
 * distance/coverage aggregates yet — those fields fall back to neutral
 * defaults (duty status is derived from live patrol records when provided).
 */
export function rangerFromApi(
  u: {
    id: string;
    email?: string;
    fullName?: string;
    cader?: string | null;
    phone?: string | null;
    isActive?: boolean;
    createdAt?: string | null;
    beatId?: string | null;
  },
  patrols: { userId: string; status: string; startedAt: string | null; endedAt: string | null }[] = []
): Ranger {
  const mine = patrols.filter((p) => p.userId === u.id);
  const onPatrol = mine.some((p) => p.status === "ACTIVE");
  const completed = mine.filter(
    (p) => p.status === "COMPLETED" && p.startedAt && p.endedAt
  );
  const fieldHours = completed.reduce((acc, p) => {
    const ms = new Date(p.endedAt!).getTime() - new Date(p.startedAt!).getTime();
    return acc + (Number.isFinite(ms) && ms > 0 ? ms / 3_600_000 : 0);
  }, 0);
  return {
    id: u.id,
    code: u.id.slice(0, 8).toUpperCase(),
    name: u.fullName ?? "Unnamed ranger",
    designation: u.cader ?? "Forest Ranger",
    dutyStatus: u.isActive === false ? "offline" : onPatrol ? "field" : "off-duty",
    phone: u.phone ?? undefined,
    joinYear: u.createdAt ? new Date(u.createdAt).getFullYear() : new Date().getFullYear(),
    division: "",
    range: "",
    beat: "",
    // Real DB assignment id when the backend has finalized a beat assignment
    // (users API). No name resolution exists yet — never fabricated.
    assignedBeatId: u.beatId ?? undefined,
    teamId: "",
    stats: {
      patrols: mine.length,
      distanceKm: 0,
      fieldHours: Math.round(fieldHours * 10) / 10,
      // No per-ranger coverage aggregate exists in the backend — the field
      // stays undefined ("—") rather than a fabricated 0%.
      observations: 0,
      incidents: 0,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Admin alerts → notifications                                        */
/* ------------------------------------------------------------------ */

/**
 * Backend alert feed (GET /api/alerts: SOS incidents, time-tamper logs,
 * coverage violations) mapped onto the bell menu's notification shape.
 * The backend has no read-tracking — items always arrive unread and "mark
 * all read" is session-local.
 */
export function alertFromApi(a: ApiAlert): NotificationItem {
  const base: Pick<NotificationItem, "id" | "time" | "read"> = {
    id: `${a.type}-${a.eventId ?? a.incidentId ?? a.patrolId ?? a.timestamp}`,
    time: a.timestamp,
    read: false,
  };
  if (a.type === "SOS") {
    return {
      ...base,
      kind: "critical",
      title: `SOS — ${a.ranger ?? "Ranger"}`,
      body:
        a.details ??
        (a.latitude != null
          ? `Emergency at ${a.latitude.toFixed(4)}, ${a.longitude?.toFixed(4) ?? "?"}`
          : "Emergency alert fired from ranger device"),
      module: "sos",
      // Real destination only when the backend gave us the incident id —
      // lands on the SOS Control Room card (acknowledge / view on map).
      href: a.incidentId ? `/sos#${encodeURIComponent(a.incidentId)}` : undefined,
    };
  }
  if (a.type === "TAMPER") {
    return {
      ...base,
      kind: "warning",
      title: "Time tamper detected",
      body: a.details ?? "Sync integrity violation on a patrol",
      module: "sync",
    };
  }
  return {
    ...base,
    kind: "warning",
    title: `Coverage breach${a.eventType ? ` — ${a.eventType.replace(/_/g, " ").toLowerCase()}` : ""}`,
    body: a.details ?? "Location or coverage violation on a patrol",
    module: "gis",
  };
}