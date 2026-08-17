/**
 * Adapters converting backend API payloads into the web portal's domain
 * shapes (lib/types). Kept pure (no IO) so services.ts can own the
 * remote-vs-mock decision.
 */

import type { GeoJsonFeatureCollection } from "@/lib/api";
import type {
  Observation,
  ObservationCategory,
  ObservationSeverity,
  ObservationStatus,
  Patrol,
  PatrolMethod,
  PatrolStatus,
  AdminUser,
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
  if (feature.geometry?.type !== "Polygon") return [];
  const coords = feature.geometry.coordinates as unknown[];
  const outer = coords[0];
  if (!Array.isArray(outer)) return [];
  return (outer as number[][]).map(([lon, lat]) => ({ lon, lat }));
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
}

/** All outer rings of a Polygon or MultiPolygon + overall bbox. */
function ringsOf(feature: { geometry: { type: string; coordinates: unknown } | null }): LngLatRing[][] {
  const g = feature.geometry;
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) return [];
  const coords = g.coordinates as unknown[][];
  return coords.map((poly: unknown) => {
    const outer = Array.isArray(poly) ? poly[0] : poly;
    if (!Array.isArray(outer)) return [];
    return (outer as number[][]).map(([lon, lat]) => ({ lon, lat }));
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
    (f) => f.geometry?.type === "Polygon" && Array.isArray((f.geometry.coordinates as unknown[])[0])
  );
  if (features.length === 0) return [];

  const proj = makeProjector(extentOf(fc, extent ?? null));

  return features.map((f, i) => {
    const ring = ringOf(f);
    const area = Number(f.properties.AREA_HA ?? f.properties.areaHa);
    return {
      id: String(f.id ?? `api-comp-${i}`),
      compNo: String(f.properties.COMP_NO ?? f.properties.compNo ?? `C${i + 1}`),
      beat: String(f.properties.BEAT ?? ""),
      points: ring.map((p) => `${proj(p.lon, p.lat).x},${proj(p.lon, p.lat).y}`).join(" "),
      areaHa: Number.isFinite(area) ? area : 0,
    };
  });
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

export function patrolFromApi(p: {
  id: string;
  name?: string | null;
  description?: string | null;
  type?: string;
  status?: string;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt?: string;
  forest?: { code?: string } | null;
  user?: { fullName?: string } | null;
}): Patrol {
  return {
    id: p.id,
    code: `PT-${p.id.slice(-6).toUpperCase()}`,
    title: p.name ?? (p.forest?.code ? `${p.forest.code} patrol` : "Field patrol"),
    type: "general-duties",
    method: p.type ? patrolMethodMap[p.type] ?? undefined : undefined,
    status: (p.status ? patrolStatusMap[p.status] : undefined) ?? "ongoing",
    objective: p.description ?? "",
    division: "",
    range: "",
    beat: "",
    teamId: "",
    leader: p.user?.fullName ?? "",
    members: [],
    startScheduled: p.startedAt ?? p.createdAt ?? new Date().toISOString(),
    endActual: p.endedAt ?? undefined,
    distanceKm: 0,
    durationMin: 0,
    coveragePct: 0,
    checkpoints: 0,
    incidents: 0,
    observations: 0,
    photos: 0,
    route: [],
    timeline: [],
  };
}

/* ------------------------------------------------------------------ */
/* Observations ↔ backend incidents                                    */
/* ------------------------------------------------------------------ */

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
  REJECTED: "resolved",
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
    lat: i.latitude ?? 0,
    lng: i.longitude ?? 0,
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

export function registerRoleFromWeb(roleId: string): "ADMIN" | "RANGER" {
  return roleId === "admin" ? "ADMIN" : "RANGER";
}