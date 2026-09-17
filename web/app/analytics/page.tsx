"use client";

/**
 * Analytics & Insights — live operational analytics.
 *
 * Every figure on this page derives from real backend records and refreshes
 * automatically (30 s polling + manual refresh):
 *   GET /api/patrols          — patrol volume, distance, duration, heatmap, jurisdiction
 *   GET /api/incidents        — incident trends by type / severity (monthly)
 *   GET /api/users            — officer roster for jurisdiction home-area matching
 *   GET /api/gis/beats        — beat register for roster beat/range resolution
 *   GET /api/coverage/grids   — authoritative grid coverage (forest-wide KPI)
 *   GET /api/coverage/beats   — per-beat coverage bars + scoped coverage KPI
 *   in-session authorizations — jurisdiction exception matching (same as Patrols)
 *
 * No mock datasets, no fabricated change percentages. Half-window deltas are
 * computed from the same real records. Sections with no backend rows surface
 * as empty states; failures surface as error states with retry.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type ApiIncident, type ApiPatrol, type GeoJsonFeatureCollection } from "@/lib/api";
import { authorizations, gis } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { patrolFromApi } from "@/lib/backend-adapters";
import { resolveJurisdiction } from "@/lib/jurisdiction";
import { Card, CardHeader, PageHeader, SegmentedControl } from "@/components/ui";
import { FilterBar, FilterSelect, KpiCard } from "@/components/data";
import { LineChart, BarChart, GroupBars, DonutLegend, GridHeatmap, CoverageBars, Donut } from "@/components/charts";
import { Icon } from "@/components/icons";
import { ExportButton, type ExportKind } from "@/components/overlays";
import { SkeletonRows, ErrorState, EmptyState } from "@/components/ui/loading";
import { exportRows, stamp } from "@/lib/export";
import { geoLabel } from "@/lib/utils";

type PeriodKey = "7d" | "30d" | "90d";

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

const PERIOD_DAYS: Record<PeriodKey, number> = { "7d": 7, "30d": 30, "90d": 90 };

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MS_DAY = 24 * 60 * 60 * 1000;

const SEVERITY_ORDER = ["HIGH", "MEDIUM", "LOW"] as const;
const SEVERITY_LABEL: Record<string, string> = { HIGH: "High severity", MEDIUM: "Medium", LOW: "Low" };

const INCIDENT_TYPE_LABEL: Record<string, string> = {
  HUMAN_IMPACT: "Human impact",
  ANIMAL_MORTALITY: "Mortality",
  SIGHTING: "Sightings",
  WATER_SOURCE: "Water sources",
};

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

function windowFor(period: PeriodKey): { from: string; to: string; fromMs: number; toMs: number; days: number } {
  const toMs = Date.now();
  const fromMs = toMs - PERIOD_DAYS[period] * MS_DAY;
  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), fromMs, toMs, days: PERIOD_DAYS[period] };
}

function patrolStartMs(p: ApiPatrol): number {
  const t = p.startedAt ?? p.createdAt;
  const ms = t ? new Date(t).getTime() : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

function inWindowMs(ms: number, fromMs: number, toMs: number): boolean {
  return ms >= fromMs && ms <= toMs;
}

/** % change of second half vs first half of the window (null when no baseline). */
function halfDelta(current: number, previous: number): number | undefined {
  if (previous <= 0) return undefined;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Labels for the trailing 7 calendar months ending this month. */
function last7MonthLabels(): { labels: string[]; keys: number[] } {
  const now = new Date();
  const labels: string[] = [];
  const keys: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(MONTH_SHORT[d.getMonth()]);
    keys.push(d.getFullYear() * 12 + d.getMonth());
  }
  return { labels, keys };
}

/** Bucket counts of timestamped items across the window (daily/weekly/monthly). */
function bucketize(times: number[], fromMs: number, toMs: number): { labels: string[]; values: number[] } {
  const days = Math.max(1, Math.ceil((toMs - fromMs) / MS_DAY));
  const size = days <= 8 ? 1 : days <= 35 ? 7 : 30;
  const n = Math.max(1, Math.ceil(days / size));
  const values = new Array<number>(n).fill(0);
  for (const t of times) {
    const idx = Math.min(Math.floor((t - fromMs) / (size * MS_DAY)), n - 1);
    if (idx >= 0) values[idx] += 1;
  }
  const labels = values.map((_, i) => {
    const start = new Date(fromMs + i * size * MS_DAY);
    if (size === 1) return `${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    if (size === 7) return `W${i + 1}`;
    return MONTH_SHORT[start.getMonth()];
  });
  return { labels, values };
}

function fmtKm(km: number): string {
  return km >= 100 ? km.toFixed(0) : km.toFixed(1);
}

/* ------------------------------------------------------------------ */
/* Beat-geometry index (shared by grid coverage + incident attribution) */
/* ------------------------------------------------------------------ */

interface BeatPoly {
  ring: number[][];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  beat: string;
  range: string;
}

interface GeoIndex {
  polys: BeatPoly[];
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
  dLat: number;
  dLng: number;
  cols: number;
  rows: number;
}

function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 1 km grid index over real beat polygons (null when geometry unavailable). */
function geoIndexFromFc(fc: GeoJsonFeatureCollection | null | undefined): GeoIndex | null {
  if (!fc || fc.features.length === 0) return null;
  const polys: BeatPoly[] = [];
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    const beat = String(f.properties.Beat ?? "");
    const range = String(f.properties.Range ?? "");
    if (!beat) continue;
    const parts: number[][][][] =
      g.type === "Polygon" ? [g.coordinates as number[][][]] : g.type === "MultiPolygon" ? (g.coordinates as number[][][][]) : [];
    for (const poly of parts) {
      const ring = poly[0];
      if (!ring || ring.length < 4) continue;
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const [x, y] of ring) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      if (!Number.isFinite(x0)) continue;
      polys.push({ ring, minX: x0, maxX: x1, minY: y0, maxY: y1, beat, range });
      if (x0 < minLng) minLng = x0;
      if (x1 > maxLng) maxLng = x1;
      if (y0 < minLat) minLat = y0;
      if (y1 > maxLat) maxLat = y1;
    }
  }
  if (polys.length === 0 || !Number.isFinite(minLng)) return null;
  const meanLat = (minLat + maxLat) / 2;
  const dLat = 1 / 110.574;
  const dLng = 1 / (111.32 * Math.cos((meanLat * Math.PI) / 180));
  const cols = Math.ceil((maxLng - minLng) / dLng);
  const rows = Math.ceil((maxLat - minLat) / dLat);
  if (cols <= 0 || rows <= 0 || cols * rows > 30000) return null;
  return { polys, minLng, maxLng, minLat, maxLat, dLat, dLng, cols, rows };
}

/** Locate the beat/range containing a GPS fix (null when outside all beats). */
function locateBeat(geo: GeoIndex, lng: number, lat: number): { beat: string; range: string } | null {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lat === 0 && lng === 0) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  for (const p of geo.polys) {
    if (lng < p.minX || lng > p.maxX || lat < p.minY || lat > p.maxY) continue;
    if (pointInRing(lng, lat, p.ring)) return { beat: p.beat, range: p.range };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AnalyticsPage() {
  const { scope } = useApp();
  const router = useRouter();
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [rangeSel, setRangeSel] = useState("");
  const [beatSel, setBeatSel] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const patrols = useAsyncData(() => api.patrols.list(), [reloadKey], { cacheKey: "analytics:patrols", pollInterval: 30000 });
  const incidents = useAsyncData(() => api.incidents.list(), [reloadKey], { cacheKey: "analytics:incidents", pollInterval: 30000 });
  const auths = useAsyncData(() => authorizations.list(), [reloadKey], { cacheKey: "patrols:auths" });
  const users = useAsyncData(() => api.users.list().catch(() => []), [reloadKey], { cacheKey: "analytics:users", pollInterval: 30000 });
  const beats = useAsyncData(() => gis.beats().catch(() => []), [reloadKey], { cacheKey: "analytics:beats", pollInterval: 60000 });

  const window = useMemo(() => windowFor(period), [period]);
  const winKey = `${window.from}|${window.to}`;
  const gridCov = useAsyncData(() => api.coverage.grids({ from: window.from, to: window.to }).catch(() => null), [winKey, reloadKey], { cacheKey: "analytics:gridCov", pollInterval: 30000 });
  const beatCov = useAsyncData(() => api.coverage.beats({ from: window.from, to: window.to }).catch(() => null), [winKey, reloadKey], { cacheKey: "analytics:beatCov", pollInterval: 30000 });
  const beatsGeo = useAsyncData(() => api.gis.beats().catch(() => null), [reloadKey], { cacheKey: "analytics:beatsGeo", pollInterval: 60000 });

  const patrolList: ApiPatrol[] = useMemo(() => patrols.data ?? [], [patrols.data]);
  const incidentList: ApiIncident[] = useMemo(() => incidents.data ?? [], [incidents.data]);

  const patrolById = useMemo(() => new Map(patrolList.map((p) => [p.id, p])), [patrolList]);

  /* Shared beat-geometry index for grid coverage + incident GPS attribution. */
  const geoIndex = useMemo(() => geoIndexFromFc(beatsGeo.data), [beatsGeo.data]);

  /* Reporting officer home area (beat register) — last-resort incident scope. */
  const userHome = useMemo(() => {
    const beatList = beats.data ?? [];
    const m = new Map<string, { range: string; beat: string }>();
    for (const u of users.data ?? []) {
      const b = u.beatId ? beatList.find((bb) => bb.id === u.beatId) : undefined;
      m.set(u.id, { range: b?.range ?? "", beat: b?.name ?? "" });
    }
    return m;
  }, [users.data, beats.data]);

  /* All 7 register ranges from real beat geometry (fallback: patrol geography).
   * Beats cascade off the selected range and stay disabled until one is picked. */
  const rangeOptions = useMemo(() => {
    const fromBeats = [...new Set((beatsGeo.data?.features ?? []).map((f) => String(f.properties.Range ?? "")).filter(Boolean))].sort();
    const names =
      fromBeats.length > 0
        ? fromBeats
        : [...new Set(patrolList.map((p) => p.geography?.range).filter((r): r is string => Boolean(r)))].sort();
    return names.map((r) => ({ value: r, label: geoLabel(r) }));
  }, [beatsGeo.data, patrolList]);

  const beatOptions = useMemo(() => {
    if (!rangeSel) return [];
    const feats = beatsGeo.data?.features ?? [];
    if (feats.length > 0) {
      const seen = new Map<string, string>();
      for (const f of feats) {
        if (String(f.properties.Range ?? "") !== rangeSel) continue;
        const b = String(f.properties.Beat ?? "");
        if (b && !seen.has(b)) seen.set(b, geoLabel(b));
      }
      return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }));
    }
    const seen = new Map<string, string>();
    for (const p of patrolList) {
      const b = p.geography?.beat;
      if (!b) continue;
      if (p.geography?.range !== rangeSel) continue;
      if (!seen.has(b)) seen.set(b, geoLabel(b));
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }));
  }, [beatsGeo.data, patrolList, rangeSel]);

  useEffect(() => {
    if (beatSel && !beatOptions.some((o) => o.value === beatSel)) setBeatSel("");
  }, [beatSel, beatOptions]);

  const inScopePatrol = (p: ApiPatrol): boolean =>
    (!rangeSel || p.geography?.range === rangeSel) && (!beatSel || p.geography?.beat === beatSel);

  /* Incident scope attribution (real data, most precise first):
   * 1. linked patrol geography (where it happened), 2. incident GPS fix
   * contained in a beat polygon, 3. reporting officer's home beat/range. */
  const incidentScopeOf = (i: ApiIncident): { range: string; beat: string } | null => {
    if (i.patrolId) {
      const p = patrolById.get(i.patrolId);
      if (p) return { range: p.geography?.range ?? "", beat: p.geography?.beat ?? "" };
    }
    if (typeof i.latitude === "number" && typeof i.longitude === "number" && geoIndex) {
      const hit = locateBeat(geoIndex, i.longitude, i.latitude);
      if (hit) return hit;
    }
    if (i.userId) {
      const home = userHome.get(i.userId);
      if (home && (home.range || home.beat)) return home;
    }
    return null;
  };

  const inScopeIncident = (i: ApiIncident): boolean => {
    if (!rangeSel && !beatSel) return true;
    const g = incidentScopeOf(i);
    if (!g) return false;
    return (!rangeSel || g.range === rangeSel) && (!beatSel || g.beat === beatSel);
  };

  /* Window + scope filtered records (the single source for every section). */
  const scopedPatrols = useMemo(
    () => patrolList.filter((p) => inScopePatrol(p) && inWindowMs(patrolStartMs(p), window.fromMs, window.toMs)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patrolList, rangeSel, beatSel, window]
  );

  const scopedIncidents = useMemo(() => {
    const out: ApiIncident[] = [];
    for (const i of incidentList) {
      const ms = new Date(i.occurredAt).getTime();
      if (!Number.isFinite(ms) || !inWindowMs(ms, window.fromMs, window.toMs)) continue;
      if (!inScopeIncident(i)) continue;
      out.push(i);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentList, patrolById, geoIndex, userHome, rangeSel, beatSel, window]);

  /* GPS points for scoped window patrols (cap 50) — feeds the 1 km grid model.
   * One-shot per patrol set (history is stable); refresh button refetches. */
  const pointPatrolIds = useMemo(() => scopedPatrols.slice(0, 50).map((p) => p.id).sort(), [scopedPatrols]);
  const pointsKey = pointPatrolIds.join(",");
  const pointsData = useAsyncData(
    () =>
      Promise.all(pointPatrolIds.map((id) => api.patrols.points(id).catch(() => [] as { lat: number; lng: number }[]))).then((arr) => arr.flat()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pointsKey, reloadKey],
    { cacheKey: "analytics:points", pollInterval: 0 }
  );

  /* Half-window deltas (same real records, first half vs second half). */
  const patrolDelta = useMemo(() => {
    const mid = (window.fromMs + window.toMs) / 2;
    let a = 0;
    let b = 0;
    for (const p of patrolList) {
      if (!inScopePatrol(p)) continue;
      const ms = patrolStartMs(p);
      if (!inWindowMs(ms, window.fromMs, window.toMs)) continue;
      if (ms < mid) a += 1;
      else b += 1;
    }
    return halfDelta(b, a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patrolList, rangeSel, beatSel, window]);

  const incidentDelta = useMemo(() => {
    const mid = (window.fromMs + window.toMs) / 2;
    let a = 0;
    let b = 0;
    for (const i of incidentList) {
      const ms = new Date(i.occurredAt).getTime();
      if (!Number.isFinite(ms) || !inWindowMs(ms, window.fromMs, window.toMs)) continue;
      if (!inScopeIncident(i)) continue;
      if (ms < mid) a += 1;
      else b += 1;
    }
    return halfDelta(b, a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentList, patrolById, geoIndex, userHome, rangeSel, beatSel, window]);

  /* KPI aggregates (real backend stats carried on each patrol row). */
  const kpiDistanceKm = useMemo(
    () => Math.round(scopedPatrols.reduce((s, p) => s + (p.stats?.distanceKm ?? 0), 0) * 10) / 10,
    [scopedPatrols]
  );
  const kpiFieldHours = useMemo(
    () => Math.round((scopedPatrols.reduce((s, p) => s + (p.stats?.durationSeconds ?? 0), 0) / 3600) * 10) / 10,
    [scopedPatrols]
  );
  const activeNow = useMemo(
    () => patrolList.filter((p) => p.status === "ACTIVE" && inScopePatrol(p)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patrolList, rangeSel, beatSel]
  );

  /* Client-side 1 km grid model over real beat polygons + real patrol GPS points.
   * Used when the PostGIS grid service is degraded (0 cells): grids covered =
   * cells containing >= 1 patrol fix; total = cells inside beat boundaries. */
  const clientGrid = useMemo(() => {
    const geo = geoIndex;
    // Points may legitimately be empty (scoped patrols without GPS) — the
    // cell totals are still real, with covered = 0 rather than a lost KPI.
    const pts = pointsData.data ?? [];
    if (!geo) return null;
    const { polys, minLng, minLat, dLat, dLng, cols, rows: rowsN } = geo;
    const cellBeat = new Map<string, { beat: string; range: string }>();
    const perBeat = new Map<string, { beat: string; range: string; total: number; covered: number }>();
    for (let r = 0; r < rowsN; r++) {
      const cy = minLat + (r + 0.5) * dLat;
      for (let c = 0; c < cols; c++) {
        const cx = minLng + (c + 0.5) * dLng;
        let hit: BeatPoly | null = null;
        for (const p of polys) {
          if (cx < p.minX || cx > p.maxX || cy < p.minY || cy > p.maxY) continue;
          if (pointInRing(cx, cy, p.ring)) {
            hit = p;
            break;
          }
        }
        if (!hit) continue;
        const key = `${c},${r}`;
        cellBeat.set(key, { beat: hit.beat, range: hit.range });
        const e = perBeat.get(hit.beat) ?? { beat: hit.beat, range: hit.range, total: 0, covered: 0 };
        e.total += 1;
        perBeat.set(hit.beat, e);
      }
    }
    if (cellBeat.size === 0) return null;
    const coveredCells = new Set<string>();
    for (const pt of pts) {
      const { lat, lng } = pt;
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
      const key = `${Math.floor((lng - minLng) / dLng)},${Math.floor((lat - minLat) / dLat)}`;
      if (cellBeat.has(key)) coveredCells.add(key);
    }
    for (const key of coveredCells) {
      const cb = cellBeat.get(key);
      if (cb) {
        const e = perBeat.get(cb.beat);
        if (e) e.covered += 1;
      }
    }
    return { total: cellBeat.size, covered: coveredCells.size, perBeat: [...perBeat.values()] };
  }, [geoIndex, pointsData.data]);

  /* Coverage KPI as grids covered / total grids (1 km cells). Server grid
   * summary when healthy, else the client grid model over real geometry. */
  const coverageKpi = useMemo((): { covered: number; total: number } | null => {
    if (!rangeSel && !beatSel) {
      const s = gridCov.data?.summary;
      if (s && s.totalCells > 0) return { covered: s.patrolledCells, total: s.totalCells };
      if (clientGrid) return { covered: clientGrid.covered, total: clientGrid.total };
      return null;
    }
    const rows = (beatCov.data?.rows ?? []).filter(
      (r) => (!rangeSel || r.rangeName === rangeSel) && (!beatSel || r.beat === beatSel)
    );
    const total = rows.reduce((s, r) => s + r.totalCells, 0);
    if (total > 0) return { covered: rows.reduce((s, r) => s + r.patrolledCells, 0), total };
    if (clientGrid) {
      let totalC = 0;
      let coveredC = 0;
      for (const b of clientGrid.perBeat) {
        if (rangeSel && b.range !== rangeSel) continue;
        if (beatSel && b.beat !== beatSel) continue;
        totalC += b.total;
        coveredC += b.covered;
      }
      if (totalC > 0) return { covered: coveredC, total: totalC };
    }
    return null;
  }, [gridCov.data, beatCov.data, clientGrid, rangeSel, beatSel]);

  /* Weekly patrols & observations (trailing 7 days of the window, live). */
  const weeklyDs = useMemo(() => {
    const labels: string[] = [];
    const patrolVals: number[] = [];
    const obsVals: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = Math.floor((window.toMs - i * MS_DAY) / MS_DAY) * MS_DAY;
      const dayEnd = dayStart + MS_DAY;
      const d = new Date(dayStart);
      labels.push(WEEKDAY_SHORT[d.getDay()]);
      let pc = 0;
      for (const p of patrolList) {
        if (!inScopePatrol(p)) continue;
        const ms = patrolStartMs(p);
        if (ms >= dayStart && ms < dayEnd) pc += 1;
      }
      let ic = 0;
      for (const inc of incidentList) {
        const ms = new Date(inc.occurredAt).getTime();
        if (!Number.isFinite(ms) || ms < dayStart || ms >= dayEnd) continue;
        if (!inScopeIncident(inc)) continue;
        ic += 1;
      }
      patrolVals.push(pc);
      obsVals.push(ic);
    }
    return { labels, series: [{ name: "Patrols", values: patrolVals }, { name: "Observations", values: obsVals }] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patrolList, incidentList, patrolById, geoIndex, userHome, rangeSel, beatSel, window]);

  /* Patrol volume trend across the window (daily / weekly / monthly buckets). */
  const volumeDs = useMemo(() => {
    const times = scopedPatrols.map(patrolStartMs).filter((ms) => ms > 0);
    return { labels: bucketize(times, window.fromMs, window.toMs).labels, series: [{ name: "Patrols", values: bucketize(times, window.fromMs, window.toMs).values }] };
  }, [scopedPatrols, window]);

  /* Trailing-7-month incident trends (scope-filtered, live). */
  const monthTrend = useMemo(() => {
    const { labels, keys } = last7MonthLabels();
    const nowKey = keys[keys.length - 1];
    const bucket = (ms: number): number => {
      const d = new Date(ms);
      const idx = 6 - (nowKey - (d.getFullYear() * 12 + d.getMonth()));
      return idx >= 0 && idx < 7 ? idx : -1;
    };
    const scoped7mo: ApiIncident[] = [];
    for (const i of incidentList) {
      const ms = new Date(i.occurredAt).getTime();
      if (!Number.isFinite(ms) || bucket(ms) < 0) continue;
      if (!inScopeIncident(i)) continue;
      scoped7mo.push(i);
    }
    const byType = (types: string[]): number[] => {
      const v = new Array<number>(7).fill(0);
      for (const i of scoped7mo) if (types.includes(i.type)) v[bucket(new Date(i.occurredAt).getTime())] += 1;
      return v;
    };
    const byTypeSeverity = (types: string[], sev: string): number[] => {
      const v = new Array<number>(7).fill(0);
      for (const i of scoped7mo) if (types.includes(i.type) && i.severity === sev) v[bucket(new Date(i.occurredAt).getTime())] += 1;
      return v;
    };
    return {
      labels,
      humanImpact: byType(["HUMAN_IMPACT"]),
      water: byType(["WATER_SOURCE"]),
      mortalityBySev: SEVERITY_ORDER.map((s) => ({ name: SEVERITY_LABEL[s], values: byTypeSeverity(["ANIMAL_MORTALITY"], s) })),
      wildlifeBySev: SEVERITY_ORDER.map((s) => ({ name: SEVERITY_LABEL[s], values: byTypeSeverity(["SIGHTING"], s) })),
      typeMix: (Object.keys(INCIDENT_TYPE_LABEL) as string[]).map((t) => ({ name: INCIDENT_TYPE_LABEL[t], values: byType([t]) })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentList, patrolById, geoIndex, userHome, rangeSel, beatSel]);

  /* Beat coverage bars: server per-beat rows when healthy, else the client
   * grid model (per-beat covered/total cells) — lowest coverage first. */
  const beatBars = useMemo(() => {
    const server = (beatCov.data?.rows ?? [])
      .filter((r) => (!rangeSel || r.rangeName === rangeSel) && (!beatSel || r.beat === beatSel))
      .map((r) => ({ beat: r.beat, range: r.rangeName ?? "—", coverage: r.coveragePercent, points: r.pointCount }))
      .sort((a, b) => (a.coverage ?? Number.POSITIVE_INFINITY) - (b.coverage ?? Number.POSITIVE_INFINITY));
    const rows =
      server.length > 0
        ? server
        : (clientGrid
            ? clientGrid.perBeat
                .filter((b) => (!rangeSel || b.range === rangeSel) && (!beatSel || b.beat === beatSel))
                .map((b) => ({
                  beat: b.beat,
                  range: b.range,
                  coverage: b.total > 0 ? Math.round((b.covered / b.total) * 1000) / 10 : null,
                  points: 0,
                }))
                .sort((a, b) => (a.coverage ?? Number.POSITIVE_INFINITY) - (b.coverage ?? Number.POSITIVE_INFINITY))
            : []);
    const withData = rows.filter((r) => r.coverage != null);
    return { rows, withData, total: rows.length };
  }, [beatCov.data, clientGrid, rangeSel, beatSel]);

  /* Patrol heatmap: patrol share per range (single-division deployment). */
  const heat = useMemo(() => {
    const ranges = [...new Set(scopedPatrols.map((p) => p.geography?.range).filter((r): r is string => Boolean(r)))].sort();
    const counts = ranges.map((r) => scopedPatrols.filter((p) => p.geography?.range === r).length);
    const max = Math.max(...counts, 1);
    return {
      ranges: ranges.map((r) => geoLabel(r)),
      values: [counts.map((c) => Math.round((c / max) * 100))],
      counts,
      busiest: ranges.length ? { name: geoLabel(ranges[counts.indexOf(max)]), count: max } : null,
    };
  }, [scopedPatrols]);

  /* Jurisdiction compliance over real patrols + roster + authorizations. */
  const jurisdiction = useMemo(() => {
    const authList = auths.data ?? [];
    const beatList = beats.data ?? [];
    const deploymentDivision = patrolList.find((p) => p.geography?.division)?.geography?.division ?? "";
    const roster = (users.data ?? []).map((u) => {
      const b = u.beatId ? beatList.find((bb) => bb.id === u.beatId) : undefined;
      return { id: u.id, name: u.fullName ?? "", division: deploymentDivision, range: b?.range ?? "", beat: b?.name ?? "" };
    });
    const counts = { normal: 0, authorized: 0, pending: 0, review: 0, unknown: 0 };
    for (const p of scopedPatrols) {
      const home = roster.find((r) => r.id === p.userId || (p.user?.fullName && r.name === p.user.fullName));
      if (!home || (!home.range && !home.beat)) {
        counts.unknown += 1;
        continue;
      }
      const dp = { ...patrolFromApi(p), rangerId: p.userId };
      const state = resolveJurisdiction(dp, authList, roster).state;
      if (state === "normal") counts.normal += 1;
      else if (state === "authorized-exception") counts.authorized += 1;
      else if (state === "pending-review") counts.pending += 1;
      else counts.review += 1;
    }
    const total = Math.max(scopedPatrols.length, 1);
    const pct = (n: number) => Math.round((n / total) * 100);
    return { ...counts, total: scopedPatrols.length, normalPct: pct(counts.normal), authorizedPct: pct(counts.authorized), reviewPct: pct(counts.review + counts.pending), withinPct: pct(counts.normal + counts.authorized) };
  }, [scopedPatrols, auths.data, users.data, beats.data, patrolList]);

  const scopeLabel = rangeSel ? `${geoLabel(rangeSel)}${beatSel ? ` / ${geoLabel(beatSel)}` : ""}` : "All ranges & beats";
  const windowLabel = `${PERIOD_DAYS[period]} days`;

  const handleExport = (kind: ExportKind) => {
    exportRows(kind, `analytics-live-${period}-${stamp()}`, [
      { metric: "patrols", value: scopedPatrols.length, scope: scopeLabel, window: windowLabel },
      { metric: "coverageGridsCovered", value: coverageKpi?.covered ?? "—", scope: scopeLabel, window: windowLabel },
      { metric: "coverageGridsTotal", value: coverageKpi?.total ?? "—", scope: scopeLabel, window: windowLabel },
      { metric: "incidents", value: scopedIncidents.length, scope: scopeLabel, window: windowLabel },
      { metric: "distanceKm", value: kpiDistanceKm, scope: scopeLabel, window: windowLabel },
      { metric: "fieldHours", value: kpiFieldHours, scope: scopeLabel, window: windowLabel },
      { metric: "activeNow", value: activeNow, scope: scopeLabel, window: windowLabel },
      { metric: "jurisdiction-normal", value: jurisdiction.normal, scope: scopeLabel, window: windowLabel },
      { metric: "jurisdiction-authorized", value: jurisdiction.authorized, scope: scopeLabel, window: windowLabel },
      { metric: "jurisdiction-pending", value: jurisdiction.pending, scope: scopeLabel, window: windowLabel },
      { metric: "jurisdiction-review", value: jurisdiction.review, scope: scopeLabel, window: windowLabel },
      { metric: "jurisdiction-unknown", value: jurisdiction.unknown, scope: scopeLabel, window: windowLabel },
      ...beatBars.rows.map((r) => ({ metric: `beat:${r.beat}`, value: r.coverage ?? "—", scope: r.range, window: windowLabel })),
    ]);
  };

  const loading = (patrols.loading && !patrols.data) || (incidents.loading && !incidents.data);
  if (loading) return <SkeletonRows rows={7} />;
  if (patrols.error && !patrols.data) return <ErrorState message={patrols.error.message} onRetry={patrols.reload} />;
  if (incidents.error && !incidents.data) return <ErrorState message={incidents.error.message} onRetry={incidents.reload} />;

  const coverageLoading =
    (beatCov.loading && !beatCov.data && !clientGrid) ||
    (pointsData.loading && !pointsData.data) ||
    (beatsGeo.loading && !beatsGeo.data);

  const refresh = () => {
    setReloadKey((k) => k + 1);
    patrols.reload();
    incidents.reload();
    gridCov.reload();
    beatCov.reload();
    beatsGeo.reload();
    pointsData.reload();
  };

  return (
    <div>
      <PageHeader
        title="Analytics & Insights"
        subtitle={`Live operational analytics — last ${windowLabel} · ${scope.forest} · ${scopeLabel}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl<PeriodKey> value={period} onChange={setPeriod} options={PERIODS} />
            <button
              onClick={refresh}
              className="rounded-field border border-line-strong bg-white px-3 py-1.5 text-sm font-medium text-ink hover:text-forest-800"
            >
              Refresh
            </button>
            <ExportButton onExport={handleExport} />
          </div>
        }
      />

      <div className="mt-4">
        <FilterBar onClear={() => { setRangeSel(""); setBeatSel(""); }}>
          <FilterSelect label="Range" value={rangeSel} onChange={(v) => { setRangeSel(v); setBeatSel(""); }} options={rangeOptions} />
          <FilterSelect label="Beat" value={beatSel} onChange={setBeatSel} options={beatOptions} disabled={!rangeSel} />
          <span className="ml-auto self-end text-xs text-ink-soft">
            {scopedPatrols.length} patrol{scopedPatrols.length === 1 ? "" : "s"} · {scopedIncidents.length} incident{scopedIncidents.length === 1 ? "" : "s"} · live
          </span>
        </FilterBar>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label={`Patrols (${windowLabel})`} value={scopedPatrols.length} change={patrolDelta} icon="route" tone="forest" />
        <KpiCard label="Coverage" value={coverageKpi ? `${coverageKpi.covered}/${coverageKpi.total}` : "—"} unit={coverageKpi ? "grids" : undefined} icon="target" tone="forest" />
        <KpiCard label={`Incidents (${windowLabel})`} value={scopedIncidents.length} change={incidentDelta} icon="alert" tone="danger" />
        <KpiCard label="Distance covered" value={fmtKm(kpiDistanceKm)} unit="km" icon="map" tone="success" />
        <KpiCard label="Field hours" value={kpiFieldHours} unit="h" icon="clock" tone="warning" />
        <KpiCard label="Active now" value={activeNow} icon="radio" tone="info" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Normal patrols" value={jurisdiction.normal} unit={`of ${jurisdiction.total}`} icon="check" tone="forest" onClick={() => router.push("/patrols")} />
        <KpiCard label="Authorized patrols" value={jurisdiction.authorized} unit={`of ${jurisdiction.total}`} icon="lock" tone="info" onClick={() => router.push("/patrols")} />
        <KpiCard label="Pending review" value={jurisdiction.pending} icon="clock" tone="warning" onClick={() => router.push("/patrols")} />
        <KpiCard label="Out-of-authorization" value={jurisdiction.review} icon="alert" tone="danger" onClick={() => router.push("/patrols")} />
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Patrol jurisdiction compliance"
          icon="map"
          subtitle={`Window patrols by home-area match — live${jurisdiction.unknown > 0 ? ` · ${jurisdiction.unknown} with unknown home area` : ""}`}
          actions={
            <Link href="/patrols/permissions" className="text-xs font-medium text-forest-700 hover:underline">
              Manage patrol permissions →
            </Link>
          }
        />
        <div className="grid gap-6 p-5 lg:grid-cols-2">
          <div className="flex items-center gap-4">
            <Donut
              segments={[
                { label: "Normal", value: jurisdiction.normal, color: "#1F4626" },
                { label: "Authorized", value: jurisdiction.authorized, color: "#2E7D32" },
                { label: "Pending review", value: jurisdiction.pending, color: "#FF8F00" },
                { label: "Out-of-authorization", value: jurisdiction.review, color: "#B3261E" },
                { label: "Unknown area", value: jurisdiction.unknown, color: "#757575" },
              ]}
              centerValue={`${jurisdiction.withinPct}%`}
              centerLabel="within jurisdiction"
            />
            <div className="flex-1">
              <DonutLegend
                segments={[
                  { label: "Normal", value: jurisdiction.normal, color: "#1F4626" },
                  { label: "Authorized", value: jurisdiction.authorized, color: "#2E7D32" },
                  { label: "Pending review", value: jurisdiction.pending, color: "#FF8F00" },
                  { label: "Out-of-authorization", value: jurisdiction.review, color: "#B3261E" },
                  { label: "Unknown area", value: jurisdiction.unknown, color: "#757575" },
                ]}
              />
            </div>
          </div>
          <div className="space-y-2.5 text-sm">
            <p className="text-ink-soft">
              <strong className="text-ink">{jurisdiction.normalPct}%</strong> of window patrols run entirely within the officer&apos;s home range/beat.
            </p>
            <p className="text-ink-soft">
              <strong className="text-ink">{jurisdiction.authorizedPct}%</strong> run outside the home area under an approved authorization.
            </p>
            <p className="text-ink-soft">
              <strong className="text-ink">{jurisdiction.reviewPct}%</strong> are flagged for review — out-of-authorization or pending approval.
            </p>
            {jurisdiction.unknown > 0 && (
              <p className="text-ink-soft">
                <strong className="text-ink">{jurisdiction.unknown}</strong> patrol{jurisdiction.unknown === 1 ? "" : "s"} could not be matched to a home beat — officer area not on record.
              </p>
            )}
            <Link href="/patrols/permissions" className="inline-flex items-center gap-1.5 pt-1 text-xs font-medium text-forest-700 hover:underline">
              Manage patrol permissions <Icon name="chevronRight" size={12} />
            </Link>
          </div>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Weekly patrols & observations" icon="activity" subtitle="Trailing 7 days, live" />
          <div className="p-4">
            <GroupBars dataset={weeklyDs} height={230} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Patrol volume trend" icon="chart" subtitle={`Patrol counts across the window, live`} />
          <div className="p-4">
            {scopedPatrols.length === 0 ? (
              <EmptyState icon="filter" title="Nothing to show" description="No patrol records in this window and scope." />
            ) : (
              <BarChart dataset={volumeDs} />
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Human impact trend" icon="fire" subtitle="Reports per month, trailing 7 months, live" />
          <div className="p-4">
            <LineChart dataset={{ labels: monthTrend.labels, series: [{ name: "Reports", values: monthTrend.humanImpact }] }} height={230} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Water body status" icon="droplet" subtitle="Surveys per month, trailing 7 months, live" />
          <div className="p-4">
            <BarChart dataset={{ labels: monthTrend.labels, series: [{ name: "Sites surveyed", values: monthTrend.water }] }} />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Animal mortality" icon="paw" subtitle="Cases by severity per month, trailing 7 months, live" />
          <div className="p-4">
            <LineChart dataset={{ labels: monthTrend.labels, series: monthTrend.mortalityBySev }} height={230} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Wildlife sightings" icon="binoculars" subtitle="Sightings by severity per month, trailing 7 months, live" />
          <div className="p-4">
            <BarChart dataset={{ labels: monthTrend.labels, series: monthTrend.wildlifeBySev }} />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader
              title="Beat coverage"
              icon="target"
              subtitle={beatBars.total > 0 ? `Lowest ${Math.min(12, beatBars.withData.length)} of ${beatBars.total} beats in window, live` : "Live beat coverage"}
            />
            <div className="p-4">
              {beatCov.error && beatBars.total === 0 ? (
                <ErrorState message="Could not load beat coverage." onRetry={beatCov.reload} />
              ) : coverageLoading ? (
                <p className="py-6 text-center text-sm text-ink-soft">Loading coverage…</p>
              ) : beatBars.withData.length === 0 ? (
                <EmptyState icon="filter" title="Nothing to show" description="No beat coverage in this window and scope (spatial service degraded or no patrol points)." />
              ) : (
                <CoverageBars
                  labels={beatBars.withData.slice(0, 12).map((r) => r.beat)}
                  values={beatBars.withData.slice(0, 12).map((r) => r.coverage ?? 0)}
                />
              )}
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader title="Patrol activity heatmap" icon="grid" subtitle="Patrol share by range, % of busiest, live" />
          <div className="p-4">
            {heat.ranges.length === 0 ? (
              <EmptyState icon="filter" title="Nothing to show" description="No patrol records in this window and scope." />
            ) : (
              <>
                <GridHeatmap rowLabels={[scope.forest]} colLabels={heat.ranges} values={heat.values} />
                {heat.busiest && (
                  <p className="mt-2 text-xs text-ink-soft">
                    Busiest: <strong className="text-ink">{heat.busiest.name}</strong> ({heat.busiest.count} patrol{heat.busiest.count === 1 ? "" : "s"})
                  </p>
                )}
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
