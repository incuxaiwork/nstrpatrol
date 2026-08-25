"use client";

/**
 * GIS Intelligence (PRD §9) — the full map workspace with layer control,
 * live markers, patrol route playback, and the zero-patrol-zone board.
 */

import { useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { gis, rangers as servicesRangers, observations as servicesObservations, hierarchy as hierarchyService, sos as sosService } from "@/lib/services";
import type { GisLivePatrol } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { api, invalidateCache, ApiError } from "@/lib/api";
import type { ApiGridCoverage } from "@/lib/api";
import { fixFreshness, useLiveTracking, useTicker } from "@/lib/use-live-tracking";
import { Card, CardHeader, Badge, PageHeader } from "@/components/ui";
import { DataTable } from "@/components/data";
import { MapWorkspace } from "@/components/map-loader";
import { MapSidebarFacts, type GridRegionFilter } from "@/components/map";
import { MapLayersPanel } from "@/components/map-layers-panel";
import { DEFAULT_LAYER_STATE, type ForestLayerState } from "@/lib/map-layers";
import { RegionFilter } from "@/components/gis-region-filter";
import { ExportButton, type ExportKind } from "@/components/overlays";
import { Icon } from "@/components/icons";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { stamp, exportRows } from "@/lib/export";
import { ReportButton } from "@/components/reports/ReportButton";
import { RegionReportDialog } from "@/components/reports/dialogs";
import { FOREST_CONTEXT, GRID_SIZES, DEFAULT_GRID_SIZE, gridSizeLabel, type GridSizeKey } from "@/lib/forest-context";
import { tagBeats, tagCompartments, tagGrids, type TaggedGrid } from "@/lib/grid-regions";
import { buildAnalysisGrid } from "@/lib/gis/grid";
import type { GridCoverageInfo, LivePathFeature, LiveRangerFeature } from "@/lib/map-space";
import type { GisMarker, GisRoute, HeatBlock } from "@/lib/mock/gis";

function beatIsZero(b: { id: string; isZeroPatrol?: boolean }): boolean {
  return b.isZeroPatrol === true;
}

/** Path window requested from GET /api/patrols/live (backend default). */
const LIVE_PATH_WINDOW_MIN = 15;

function heatTone(v: number): number {
  return 0.12 + v * 0.55;
}

/** Honest message for a failed coverage request (never shown as "0%"). */
function coverageErrorMessage(err: Error): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Sign in required — patrol coverage unavailable.";
    if (err.status === 403) return "You don't have access to patrol coverage for this scope.";
    if (err.status === 404) return "Patrol coverage endpoint unavailable.";
    if (err.status >= 500) return "Patrol coverage server error — try again shortly.";
    return `Patrol coverage unavailable (${err.status}).`;
  }
  return "Patrol coverage unavailable — check the backend connection.";
}

function formatCoverageTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const COVERAGE_SCOPE_LABELS: Record<string, string> = {
  DIVISION: "Division-wide",
  SUB_DIVISION: "Sub-division scope",
  RANGE: "Range scope",
  BEAT: "Beat scope",
  OPERATIONAL: "Personal patrol scope",
};

/** Row-level coverage detail attached to a selected reference grid cell. */
export interface GridCoverageDetail {
  coverage: "Patrolled" | "Unpatrolled" | null;
  /** Loading / error states leave the detail rows honest instead of fake. */
  available: boolean;
  pointCount: number | null;
  lastPatrolledAt: string | null;
}

function selectedDetail(
  selected: string | null,
  beats: { id: string; name: string; coveragePct: number | null }[],
  comps: { id: string; compNo: string; beat: string; areaHa: number }[],
  routes: GisRoute[],
  markers: GisMarker[],
  grids: { id: string; gridCode: string; rangeId?: string; beatId?: string; compId?: string }[],
  names: { rangeName(id?: string): string | undefined; beatName(id?: string): string | undefined; compNo(id?: string): string | undefined },
  coverageById: Record<string, GridCoverageInfo> | null = null,
  coverageLoaded: boolean = false,
  liveById: Map<string, GisLivePatrol> = new Map()
) {
  if (!selected) return null;
  // LIVE patrol selection wins over everything else — an active patrol also
  // appears in the historical traces, but its card must read as live.
  const livePatrol = liveById.get(selected);
  if (livePatrol) {
    const latest = livePatrol.latest;
    return {
      kind: "live" as const,
      title: livePatrol.name ?? `Patrol ${livePatrol.patrolId.slice(0, 8)}`,
      body: `${livePatrol.rangerName}${livePatrol.beat ? ` · ${livePatrol.beat}` : ""} · ${livePatrol.patrolType.toLowerCase()}`,
      href: `/patrols/${livePatrol.patrolId}`,
      cta: "Open patrol",
      tone: "neutral" as const,
      tag: "Live patrol",
      live: {
        rangerId: livePatrol.rangerId,
        rangerName: livePatrol.rangerName,
        beat: livePatrol.beat,
        fixAt: latest?.t ?? null,
        accuracyM: latest?.accuracy ?? null,
        speedKmh: latest?.speed != null ? Math.round(latest.speed * 36) / 10 : null,
        pointCount: livePatrol.pointCount,
        pathDistanceKm: livePatrol.pathDistanceKm,
        pathMinutes: livePatrol.pathMinutes,
        lng: latest?.lng ?? null,
        lat: latest?.lat ?? null,
      },
    };
  }
  const route = routes.find((r) => r.id === selected);
  if (route) {
    const bits = [route.patrolId, route.status];
    if (route.distanceKm != null) bits.push(`${route.distanceKm} km`);
    if (route.durationMinutes != null) bits.push(`${route.durationMinutes} min`);
    return {
      kind: "route" as const,
      title: route.label,
      body: bits.join(" · "),
      href: `/patrols/${route.patrolId}`,
      cta: "Open patrol",
      tone: "neutral" as const,
      tag: "Patrol route",
    };
  }
  const grid = grids.find((g) => g.id === selected);
  if (grid) {
    const cell = coverageById?.[grid.id] ?? null;
    const coverageDetail: GridCoverageDetail = coverageLoaded
      ? {
          coverage: cell ? (cell.covered ? "Patrolled" : "Unpatrolled") : null,
          available: cell != null,
          pointCount: cell?.pointCount ?? null,
          lastPatrolledAt: cell?.lastPatrolledAt ?? null,
        }
      : { coverage: null, available: false, pointCount: null, lastPatrolledAt: null };
    return {
      kind: "grid" as const,
      title: grid.gridCode || "Grid",
      rangeName: names.rangeName(grid.rangeId),
      beatName: names.beatName(grid.beatId),
      compNo: names.compNo(grid.compId),
      coverageDetail,
      tag: "Reference grid",
    };
  }
  const comp = comps.find((c) => c.id === selected);
  if (comp) {
    return {
      kind: "compartment" as const,
      title: `Compartment ${comp.compNo}`,
      body: `${comp.areaHa > 0 ? comp.areaHa + " ha · " : ""}${comp.beat || "beat not mapped"}`,
      href: "/gis",
      cta: "Dismiss",
      tone: "neutral" as const,
      tag: "Compartment",
    };
  }
  const beat = beats.find((b) => b.id === selected);
  if (beat) {
    const zero = beatIsZero(beat);
    return {
      kind: "beat" as const,
      title: `${beat.name} beat`,
      body: beat.coveragePct == null ? "Coverage data pending" : `${beat.coveragePct}% coverage`,
      href: "/gis",
      cta: "Zoom to beat",
      tone: zero ? "danger" : ("neutral" as const),
      tag: zero ? "Zero patrol zone" : undefined,
    };
  }
  const marker = markers.find((m) => m.id === selected);
  if (!marker) return null;
  // Ranger last-known position → the ranger's real profile page.
  if (marker.kind === "ranger") {
    const when = marker.occurredAt ? formatCoverageTime(marker.occurredAt) : null;    return {
      kind: "ranger" as const,
      title: marker.label,
      body: when ? `Last GPS fix ${when}` : "On patrol — no recent GPS fix time available",
      href: `/rangers/${marker.id}`,
      cta: "Open ranger profile",
      tone: "neutral" as const,
      tag: "Ranger position",
    };
  }
  // Observation / incident / SOS → that record's own observation page.
  return {
    kind: marker.kind,
    title: marker.label,
    body:
      [marker.category, marker.status, marker.severity].filter(Boolean).join(" · ") ||
      "Geolocated report on the live map",
    href: `/observations/${marker.id}`,
    cta: "Open observation",
    tone: "danger" as const,
    tag: marker.kind === "sos" ? "SOS" : marker.kind === "observation" ? "Observation" : "Incident",
  };
}

export default function GisPage() {
  // ?sos=<incidentId> deep link ("View on Map") — read inside Suspense per
  // the Next.js useSearchParams contract.
  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <GisWorkspace />
    </Suspense>
  );
}

function GisWorkspace() {
  const searchParams = useSearchParams();
  const sosParam = searchParams.get("sos");
  // Beats come from the backend GIS API (GeoJSON → GL layers).
  // Spatial layers — single consolidated fetch (was 5 separate useAsyncData hooks,
  // each triggering re-renders independently even though they shared one network call).
  const spatialData = useAsyncData(() => gis.spatial(), [], { cacheKey: "gis:spatial" });
  const beatsData = { data: spatialData.data?.beats ?? null, loading: spatialData.loading, error: spatialData.error, reload: spatialData.reload };
  const compartmentsData = { data: spatialData.data?.compartments ?? null, loading: spatialData.loading, error: null, reload: spatialData.reload };
  const boundaryData = { data: spatialData.data?.boundary ?? null, loading: spatialData.loading, error: null, reload: spatialData.reload };
  const gridsData = { data: spatialData.data?.grids ?? null, loading: spatialData.loading, error: null, reload: spatialData.reload };
  const extentData = { data: spatialData.data?.extent ?? null, loading: spatialData.loading, error: null, reload: spatialData.reload };

  const assetsData = useAsyncData(() => gis.assets(), [], { cacheKey: "gis:assets" });
  const [rawSelected, setSelected] = useState<string | null>(null);
  // No patrol preselected — play/pause appears only after the admin picks one.
  const [replayPatrol, setReplayPatrol] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  // Layer control state lives HERE (outside the canvas) and is passed down
  // controlled; checkboxes map to real MapLibre visibility switches.
  const [layerState, setLayerState] = useState<ForestLayerState>(DEFAULT_LAYER_STATE);
  // Range → Beat → Compartment filter (division is the fixed context).
  const [regionFilter, setRegionFilter] = useState<GridRegionFilter>({});
  // Analysis grid state — configurable size + deterministic cell selection.
  const [analysisGridSize, setAnalysisGridSize] = useState<GridSizeKey>(DEFAULT_GRID_SIZE);
  const [selectedGridIds, setSelectedGridIds] = useState<ReadonlySet<string>>(new Set());
  const [hoveredGridId, setHoveredGridId] = useState<string | null>(null);

  const markersData = useAsyncData(() => gis.markers(), [], { cacheKey: "gis:markers" });
  // LIVE tracking (GET /api/patrols/live) — ACTIVE patrols, latest valid fix
  // and bounded recent path, polled while this page is mounted only.
  const liveTracking = useLiveTracking();
  const liveFeed = liveTracking.feed;
  const liveSkewMs = liveFeed?.skewMs ?? 0;
  const now = useTicker(5000);
  // Historical patrol routes: deferred until user enables the routes layer
  // (was loaded eagerly on mount — 11 API calls including per-patrol point fetches).
  const routesData = useAsyncData(
    () => layerState.routes ? gis.routes() : Promise.resolve([] as GisRoute[]),
    [layerState.routes],
    { cacheKey: "gis:routes" }
  );
  const rangersData = useAsyncData(() => servicesRangers.list(), [], { cacheKey: "rangers:list" });
  const observationsData = useAsyncData(() => servicesObservations.list(), [], { cacheKey: "observations:list" });
  // Authoritative coverage (GET /api/coverage/grids). Backend computes the
  // scope; the frontend only joins + displays. Non-blocking: the map and the
  // analysis grid stay usable while this loads.
  // Real hierarchy register for the region filters (independent of the map).
  const unitsData = useAsyncData(() => hierarchyService.units(), [], { cacheKey: "hierarchy:units" });

  // Region attribution of beats → compartments → grids over the real
  // polygons (shared projection space — exact within it). Division is
  // implicitly FOREST_CONTEXT.divisionId everywhere. Computed unconditionally
  // (before loading guards) to satisfy the rules of hooks.
  const taggedBeats = useMemo(() => tagBeats(beatsData.data ?? []), [beatsData.data]);
  const taggedCompartments = useMemo(
    () => tagCompartments(compartmentsData.data ?? [], taggedBeats),
    [compartmentsData.data, taggedBeats]
  );
  const taggedGrids = useMemo(
    () => tagGrids(gridsData.data ?? [], taggedBeats, taggedCompartments),
    [gridsData.data, taggedBeats, taggedCompartments]
  );

  // Analysis grid — generated from the REAL beat/boundary geometry at the
  // selected metric size (see lib/gis/grid.ts). Re-generated only when its
  // true inputs change (size / beats / boundary), never on pan/zoom/hover.
  const analysisCells = useMemo(
    () => buildAnalysisGrid({ beats: taggedBeats, boundary: boundaryData.data ?? [], extent: extentData.data ?? null, sizeKey: analysisGridSize }),
    [taggedBeats, boundaryData.data, extentData.data, analysisGridSize]
  );
  const taggedAnalysisGrids = useMemo<TaggedGrid[]>(
    () => tagGrids(analysisCells.cells, taggedBeats, taggedCompartments),
    [analysisCells, taggedBeats, taggedCompartments]
  );

  // Coverage query — authorized scope PLUS the backend Beat id when a Beat
  // region filter is active. GIS beat features carry the backend Beat primary
  // key (OBJECTID_1 ≡ Beat.id), so the derived hierarchy id can be translated
  // to a valid API parameter. Range / Compartment filters have no backend
  // Range / Compartment id catalog in the portal (Range PKs are never
  // exposed), so the request stays division-scoped there and the map applies
  // the region filter visually to the reference grid cells.
  const coverageBeatId = useMemo(() => {
    if (!regionFilter.beatId) return null;
    return taggedBeats.find((b) => b.beatId === regionFilter.beatId)?.id ?? null;
  }, [regionFilter.beatId, taggedBeats]);
  const coverageData = useAsyncData<ApiGridCoverage>(
    () => gis.coverage(coverageBeatId ? { beatId: coverageBeatId } : {}),
    [coverageBeatId]
  );

  // Coverage map keyed by the authoritative ForestGrid id — the join key for
  // both the Mapbox layer styling and the reference-grid detail card.
  const coverageById = useMemo<Record<string, GridCoverageInfo> | null>(() => {
    const cells = coverageData.data?.cells;
    if (!cells) return null;
    const map: Record<string, GridCoverageInfo> = {};
    for (const c of cells) map[c.id] = { covered: c.covered, pointCount: c.pointCount, lastPatrolledAt: c.lastPatrolledAt };
    return map;
  }, [coverageData.data]);
  const coverageSummary = coverageData.data?.summary ?? null;

  // Live SOS alert feed (Part B) — powers the dedicated SOS map layer and
  // the ?sos= deep link. Strict remote; a failure surfaces as an inline
  // note, never as fabricated points.
  const sosCasesData = useAsyncData(() => sosService.cases(), [], { cacheKey: "sos:cases" });
  const sosCases = useMemo(() => sosCasesData.data ?? [], [sosCasesData.data]);
  const sosAlerts = useMemo(
    () =>
      sosCases
        .filter((c) => c.incident.latitude != null && c.incident.longitude != null)
        .map((c) => ({
          id: c.incident.id,
          lng: c.incident.longitude!,
          lat: c.incident.latitude!,
        })),
    [sosCases]
  );

  // Live-tracking view models — real feed data only, re-aged against the
  // ticker so CURRENT/STALE labels track the actual GPS timestamps.
  const livePatrols = useMemo(() => liveFeed?.patrols ?? [], [liveFeed]);
  const locatedLivePatrols = useMemo(
    () => livePatrols.filter((p) => p.latest != null),
    [livePatrols]
  );
  const liveById = useMemo(
    () => new Map(livePatrols.map((p) => [p.patrolId, p] as const)),
    [livePatrols]
  );
  const patrolIsCurrent = (p: GisLivePatrol) =>
    fixFreshness(p.lastPointAt, liveSkewMs, now) === "current";

  const liveRangers = useMemo<LiveRangerFeature[]>(
    () =>
      locatedLivePatrols.map((p) => ({
        id: p.patrolId,
        patrolId: p.patrolId,
        rangerName: p.rangerName,
        patrolLabel: p.name,
        lng: p.latest!.lng,
        lat: p.latest!.lat,
        fixAt: p.latest!.t,
        accuracyM: p.latest!.accuracy,
        speedKmh: p.latest!.speed != null ? Math.round(p.latest!.speed * 36) / 10 : null,
        pointCount: p.pointCount,
        freshness: patrolIsCurrent(p) ? ("current" as const) : ("stale" as const),
        pathWindow: `${LIVE_PATH_WINDOW_MIN} min`,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locatedLivePatrols, liveSkewMs, now]
  );

  const livePaths = useMemo<LivePathFeature[]>(
    () =>
      livePatrols.flatMap((p) => {
        if (p.path.length < 2) return [];
        return [
          {
            id: `live-${p.patrolId}`,
            patrolId: p.patrolId,
            label: p.name,
            rangerName: p.rangerName,
            coordinates: p.path.map((pt) => [pt.lng, pt.lat] as [number, number]),
            startAt: p.path[0].t,
            endAt: p.path[p.path.length - 1].t,
            durationMinutes: p.pathMinutes,
            distanceKm: p.pathDistanceKm,
            pointCount: p.path.length,
            freshness: patrolIsCurrent(p) ? ("current" as const) : ("stale" as const),
          },
        ];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [livePatrols, liveSkewMs, now]
  );

  // ?sos=<id> deep link ("View on Map") — fully derived during render (no
  // effects, no cascading setState): ease the camera to the alert's real
  // coordinates, select its card and force the SOS layer on while the link
  // is active. A SOS without GPS shows the honest banner instead.
  const sosFocusCase = useMemo(
    () => (sosParam ? sosCases.find((c) => c.incident.id === sosParam) ?? null : null),
    [sosParam, sosCases]
  );
  const sosFocus = useMemo(() => {
    if (!sosFocusCase) return null;
    const { latitude, longitude } = sosFocusCase.incident;
    return latitude != null && longitude != null ? { lng: longitude, lat: latitude, zoom: 15 } : null;
  }, [sosFocusCase]);
  // Explicit "Focus" request from a LIVE ranger card — one-shot camera move
  // on click only. The map NEVER auto-follows GPS updates (free navigation).
  const [manualFocus, setManualFocus] = useState<{ lng: number; lat: number; zoom?: number; key: number } | null>(null);
  const focus = manualFocus ?? sosFocus;
  const focusLiveRanger = (lng: number, lat: number) => {
    setManualFocus({ lng, lat, zoom: 15, key: Date.now() });
  };
  const effectiveLayerState = useMemo(
    () => (focus ? { ...layerState, sos: true } : layerState),
    [layerState, focus]
  );
  // Deep-linked SOS stays selected until the admin clicks something else.
  const selected = rawSelected ?? (focus ? sosFocusCase?.incident.id ?? null : null);

  // Name lookups for the grid popup (real register only — never fabricated).
  const unitNames = useMemo(() => {
    const rangeName = new Map<string, string>();
    const beatName = new Map<string, string>();
    for (const list of Object.values(unitsData.data?.ranges ?? {})) {
      for (const r of list) rangeName.set(r.id, r.name);
    }
    for (const list of Object.values(unitsData.data?.beats ?? {})) {
      for (const b of list) beatName.set(b.id, b.name);
    }
    const compNo = new Map<string, string>();
    for (const c of unitsData.data?.compartments ?? []) compNo.set(c.id, c.compNo);
    return {
      rangeName(id?: string) { return id ? rangeName.get(id) : undefined; },
      beatName(id?: string) { return id ? beatName.get(id) : undefined; },
      compNo(id?: string) { return id ? compNo.get(id) : undefined; },
    };
  }, [unitsData.data]);

  const spatialReady = Boolean(spatialData.data);
  const beats = beatsData.data ?? [];
  const compartments = compartmentsData.data ?? [];
  const boundary = boundaryData.data ?? [];
  const grids = gridsData.data ?? [];
  const markers = markersData.data ?? [];
  const routes = routesData.data ?? [];
  const heat: HeatBlock[] = [];
  const units = unitsData.data ?? null;

  // Selecting a patrol route on the map arms the replay for that patrol —
  // EXCEPT a LIVE selection: replaying an active patrol would fight the live
  // feed and filter the historical layer, so it only opens the live card.
  const handleSelect = (id: string | null) => {
    if (!id) {
      setSelected(null);
      return;
    }
    if (!liveById.has(id)) {
      const route = routes.find((r) => r.id === id);
      if (route) setReplayPatrol(route.patrolId);
    }
    setSelected(id);
  };

  const zeroPatrolBeats = beats.filter((b) => beatIsZero(b));
  const coverageLoaded = !coverageData.loading && !coverageData.error && coverageById != null;
  const regionFilterActive =
    regionFilter.rangeId != null || regionFilter.beatId != null || regionFilter.compId != null;
  // Range/Compartment-only selections cannot be sent to the coverage API
  // (no backend id catalog) — surface that honestly next to the summary.
  const coverageMixedScope = regionFilterActive && coverageBeatId == null;
  const detail = selectedDetail(selected, beats, compartments, routes, markers, taggedGrids, unitNames, coverageById, coverageLoaded, liveById);

  // Honest operational status strip inside the map — counts of the ENABLED
  // operational layers, with explicit empty/unavailable wording (never fake).
  const statusBits: string[] = [];
  if (effectiveLayerState.markers) {
    if (markersData.error) statusBits.push("Observation feed unavailable");
    else {
      const n = (markersData.data ?? []).filter(
        (m) => m.kind === "observation" || m.kind === "incident"
      ).length;
      statusBits.push(n > 0 ? `${n} geolocated record${n === 1 ? "" : "s"}` : "No geolocated observations available");
    }
  }
  // LIVE tracking status — derived from REAL GPS timestamps (server-skew
  // adjusted), never from the fetch time. <30s current · ≤90s stale · else
  // offline. An ACTIVE patrol row without a recent fix is never called live.
  if (effectiveLayerState.rangers || effectiveLayerState.routes) {
    if (liveTracking.error) {
      statusBits.push("Live tracking unavailable");
    } else if (!liveFeed) {
      statusBits.push("Loading live tracking…");
    } else if (livePatrols.length === 0) {
      statusBits.push("No active patrols");
    } else if (locatedLivePatrols.length === 0) {
      statusBits.push("Active patrols found, but no current GPS fixes are available");
    } else {
      const currentCount = locatedLivePatrols.filter(patrolIsCurrent).length;
      const newestFixMs = Math.max(
        ...locatedLivePatrols.map((p) => new Date(p.lastPointAt ?? p.latest!.t).getTime())
      );
      const ageS = Math.max(0, Math.round((now - (newestFixMs + liveSkewMs)) / 1000));
      const ageLabel = ageS < 90 ? `${ageS}s` : `${Math.round(ageS / 60)} min`;
      if (currentCount > 0) {
        const fetchAgeS = liveTracking.lastFetchedAt
          ? Math.max(0, Math.round((now - liveTracking.lastFetchedAt) / 1000))
          : null;
        statusBits.push(
          `● Live tracking · ${currentCount}/${locatedLivePatrols.length} updating · last GPS ${ageLabel} ago${
            fetchAgeS != null ? ` · updated ${fetchAgeS}s ago` : ""
          }`
        );
      } else {
        statusBits.push(`Live tracking stale · last GPS ${ageLabel} ago`);
      }
    }
  }
  if (effectiveLayerState.routes) {
    if (routesData.error) statusBits.push("Patrol traces unavailable");
    else statusBits.push(routes.length > 0 ? `${routes.length} patrol trace${routes.length === 1 ? "" : "s"}` : "No GPS traces yet");
  }
  if (effectiveLayerState.sos) {
    statusBits.push(sosCasesData.error ? "SOS feed unavailable" : sosAlerts.length > 0 ? `${sosAlerts.length} live SOS` : "No live SOS");
  }
  const statusChip =
    statusBits.length > 0 ? (
      <p className="inline-block max-w-full truncate rounded-md border border-line bg-white/95 px-2.5 py-1.5 text-[11px] text-ink-soft shadow-card">
        {statusBits.join(" · ")}
      </p>
    ) : undefined;

  const handleExport = (kind: ExportKind) => {
    exportRows(kind, `gis-catalog-${stamp()}`, [
      ...markers.map((m) => ({
        id: m.id,
        kind: m.kind,
        label: m.label,
        x: m.x,
        y: m.y,
      })),
      ...zeroPatrolBeats.map((b) => ({
        id: b.id,
        kind: "zero-patrol-beat",
        label: b.name,
        coveragePct: b.coveragePct,
      })),
      ...compartments.map((c) => ({
        id: c.id,
        kind: "compartment",
        label: c.compNo,
        beat: c.beat,
        areaHa: c.areaHa,
      })),
    ]);
  };

  const toggleGrid = (id: string) => {
    setSelectedGridIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearGridSelection = () => setSelectedGridIds(new Set());

  const deselectAllGrids = () => setSelectedGridIds(new Set());

  // Selects every cell not excluded by the active Range → Beat → Compartment
  // filter (i.e. what the map actually shows).
  const selectAllVisibleGrids = () => {
    const ids = taggedAnalysisGrids
      .filter((g) => {
        if (regionFilter.rangeId && g.rangeId !== regionFilter.rangeId) return false;
        if (regionFilter.beatId && g.beatId !== regionFilter.beatId) return false;
        if (regionFilter.compId && (g.compId ?? null) !== regionFilter.compId) return false;
        return true;
      })
      .map((g) => g.id);
    setSelectedGridIds(new Set(ids));
  };

  const changeGridSize = (size: GridSizeKey) => {
    setAnalysisGridSize(size);
    // Grid topology changed (deterministic ids are size-scoped) — selection
    // cannot be carried over, so it is cleared explicitly.
    setSelectedGridIds(new Set());
  };

  const hoveredGrid = hoveredGridId ? taggedAnalysisGrids.find((g) => g.id === hoveredGridId) : undefined;

  return (
    <div>
      <PageHeader
        title="GIS Intelligence"
        subtitle="Live operational mapping — patrol traces, observations and coverage"
        actions={
          <div className="flex items-center gap-2">
            <ExportButton onExport={handleExport} />
            <ReportButton onClick={() => setReportOpen(true)} />
            <Link
              href="/observations/list"
              className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700"
            >
              Reports on map
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <Card className="overflow-hidden">
            {markersData.error && (
              <p className="border-b border-line px-4 py-2 text-xs text-danger">
                Couldn&apos;t load map markers — showing the map without incident points.
              </p>
            )}
            {sosCasesData.error && (
              <p className="border-b border-line px-4 py-2 text-xs text-danger">
                Couldn&apos;t load the SOS alert feed — {sosCasesData.error.message} The map works
                without the live SOS layer.
              </p>
            )}
            {sosParam && sosCasesData.data && !sosFocusCase && (
              <p className="border-b border-line px-4 py-2 text-xs text-warning">
                The requested SOS is not in your scoped alert feed (it may belong to another range,
                or was reported by a device that has not synced yet).
              </p>
            )}
            {sosFocusCase && (sosFocusCase.incident.latitude == null || sosFocusCase.incident.longitude == null) && (
              <p className="border-b border-line bg-warning-soft px-4 py-2 text-xs font-medium text-[#8a4b00]">
                This SOS was reported without GPS coordinates — location unavailable. It cannot be
                placed on the map; open the report for details instead.
              </p>
            )}
            {liveTracking.error && (
              <div className="flex items-center justify-between gap-3 border-b border-line bg-danger-soft px-4 py-2">
                <p className="text-xs text-danger">
                  Live tracking unavailable — {liveTracking.error.message}. Forest, range, beat,
                  compartment and historical layers continue working without it.
                </p>
                <button
                  onClick={() => void liveTracking.refresh()}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-field border border-line bg-white px-2.5 text-xs font-medium text-ink transition hover:bg-forest-50"
                >
                  <Icon name="refresh" size={12} /> Retry
                </button>
              </div>
            )}
            <MapWorkspace
              mode="workspace"
              heightClass="h-[560px]"
              layerState={layerState}
              onLayerStateChange={setLayerState}
              sosAlerts={sosAlerts}
              focus={focus}
              liveBeats={taggedBeats}
              compartments={taggedCompartments}
              boundary={boundary}
              grids={taggedGrids}
              coverageById={coverageById}
              analysisGrids={taggedAnalysisGrids}
              gridSize={analysisGridSize}
              selectedGridIds={selectedGridIds}
              onGridClick={toggleGrid}
              onGridHover={setHoveredGridId}
              markers={markers}
              routes={routes}
              livePaths={livePaths}
              liveRangers={liveRangers}
              heat={heat}
              selectedId={selected}
              onSelect={handleSelect}
              replayPatrolId={replayPatrol}
              detailCard={
                detail ? (
                  <SelectedCard
                    detail={detail}
                    onClose={() => setSelected(null)}
                    onFocus={
                      detail.kind === "live" && detail.live.lng != null && detail.live.lat != null
                        ? () => focusLiveRanger(detail.live.lng!, detail.live.lat!)
                        : undefined
                    }
                  />
                ) : undefined
              }
              statusChip={spatialData.error ? (
                <p className="inline-block max-w-full truncate rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-[11px] text-danger shadow-card">
                  Spatial layers failed — {spatialData.error.message}
                </p>
              ) : !spatialReady ? (
                <p className="inline-block max-w-full truncate rounded-md border border-line bg-white/95 px-2.5 py-1.5 text-[11px] text-ink-soft shadow-card">
                  Loading spatial layers…
                </p>
              ) : statusChip}
              regionFilter={regionFilter}
            />
          </Card>

          <Card className="mt-4">
            <CardHeader
              title="GIS filters"
              icon="layers"
              subtitle={`${FOREST_CONTEXT.divisionName} is the fixed forest context — filtering starts at Range`}
            />
            <div className="p-4">
              <RegionFilter
                units={units}
                error={unitsData.error?.message ?? null}
                loading={unitsData.loading}
                value={regionFilter}
                onChange={setRegionFilter}
              />
            </div>
          </Card>

          <Card className="mt-4">
            <CardHeader
              title="Analysis Grid"
              icon="grid"
              subtitle={`${gridSizeLabel(analysisGridSize)} cells generated over the real forest geometry (frontend GIS state — not persisted)`}
            />
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="analysis-grid-size" className="text-xs font-medium text-ink">
                  Grid Size
                </label>
                <select
                  id="analysis-grid-size"
                  value={analysisGridSize}
                  onChange={(e) => changeGridSize(e.target.value as GridSizeKey)}
                  className="rounded border border-line bg-white px-2 py-1 text-xs font-medium text-ink"
                  aria-label="Analysis grid size"
                >
                  {GRID_SIZES.map((g) => (
                    <option key={g.key} value={g.key}>{g.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
                <p className="text-sm font-semibold text-ink">
                  Selected: <span className="font-mono">{selectedGridIds.size}</span>
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={selectAllVisibleGrids}
                    className="inline-flex h-7 items-center gap-1 rounded-field border border-line bg-white px-2.5 text-xs font-medium text-ink transition hover:bg-forest-50"
                  >
                    Select All Visible
                  </button>
                  <button
                    onClick={deselectAllGrids}
                    className="inline-flex h-7 items-center gap-1 rounded-field border border-line bg-white px-2.5 text-xs font-medium text-ink transition hover:bg-forest-50"
                  >
                    Deselect All
                  </button>
                  <button
                    onClick={clearGridSelection}
                    disabled={selectedGridIds.size === 0}
                    className="inline-flex h-7 items-center gap-1 rounded-field border border-line bg-white px-2.5 text-xs font-medium text-ink transition hover:bg-forest-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>

              {analysisCells.meta.count > 0 && (
                <p className="flex items-center gap-2 text-xs text-ink-soft">
                  <Badge tone="neutral">{analysisCells.meta.count} cells</Badge>
                  <span>deterministic ids — click a cell to toggle its selection.</span>
                </p>
              )}

              {hoveredGrid && (
                <div className="rounded-field border border-line bg-surface px-3 py-2 text-xs">
                  <p className="font-mono text-ink">{hoveredGrid.gridCode}</p>
                  <dl className="mt-1.5 space-y-1">
                    <InfoRow label="Size" value={gridSizeLabel((hoveredGrid as { sizeKey?: GridSizeKey }).sizeKey ?? analysisGridSize)} />
                    <InfoRow label="Range" value={hoveredGrid.rangeId ? unitNames.rangeName(hoveredGrid.rangeId) ?? "Not available" : "Not available"} />
                    <InfoRow label="Beat" value={hoveredGrid.beatId ? unitNames.beatName(hoveredGrid.beatId) ?? "Not available" : "Not available"} />
                    <InfoRow label="Compartment" value={hoveredGrid.compId ? unitNames.compNo(hoveredGrid.compId) ?? "Not available" : "Not available"} />
                    <InfoRow label="Selection" value={selectedGridIds.has(hoveredGrid.id) ? "Selected — click to deselect" : "Not selected — click to select"} />
                  </dl>
                </div>
              )}

              <p className="flex items-start gap-2 rounded-field border border-line bg-surface px-3 py-2 text-xs text-ink-soft">
                <Icon name="info" size={14} className="mt-0.5 shrink-0 text-forest-700" />
                Analysis cells are a frontend visualization tool for sizing, selection and spatial
                exploration — official patrol coverage belongs to the backend Reference ForestGrid
                (see the Patrol Coverage layer and card).
              </p>
            </div>
          </Card>

          {/* Grid data availability — explicit API GAP states, never fabricated values */}
          <Card className="mt-4">
            <CardHeader
              title="Grid data availability"
              icon="grid"
              subtitle="Reference grid cells from the backend GIS API (ForestGrid)"
            />
            <div className="space-y-2 p-4 text-sm">
              {grids.length > 0 ? (
                <>
                  <p className="flex items-center gap-2 text-ink">
                    <Badge tone="success" dot>{taggedGrids.length} grid cells loaded</Badge>
                    <span className="text-xs text-ink-soft">
                      Range / beat / compartment attribution is resolved from the real GIS polygons.
                    </span>
                  </p>
                  {coverageData.error ? (
                    <p className="flex items-start gap-2 rounded-field border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
                      <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
                      {coverageErrorMessage(coverageData.error)} The Reference Grid stays visible
                      without coverage coloring.
                    </p>
                  ) : coverageSummary ? (
                    <>
                      <p className="flex items-start gap-2 rounded-field border border-success/30 bg-success-soft px-3 py-2 text-xs text-forest-800">
                        <Icon name="check" size={14} className="mt-0.5 shrink-0" />
                        Authoritative coverage is live — Patrolled {coverageSummary.patrolledCells} /{" "}
                        {coverageSummary.totalCells}, Unpatrolled {coverageSummary.unpatrolledCells} /{" "}
                        {coverageSummary.totalCells}, {coverageSummary.coveragePercent}% coverage.
                      </p>
                      <p className="flex items-center gap-2 text-xs text-ink-soft">
                        {coverageData.loading ? "Refreshing coverage…" : "Coverage is computed per request from patrol points ∩ ForestGrid (PostGIS)."}
                      </p>
                    </>
                  ) : (
                    <p className="flex items-start gap-2 rounded-field border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-[#8a4b00]">
                      <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
                      Loading patrol coverage…
                    </p>
                  )}
                </>
              ) : (
                <p className="rounded-field border border-line bg-surface px-3 py-2 text-xs text-ink-soft">
                  No grid data available. The grid layer stays hidden until the backend GIS API
                  returns survey grid polygons.
                </p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="MAP LAYERS"
              icon="layers"
              subtitle="Drives real map visibility — the camera never moves"
            />
            <div className="p-4">
              <MapLayersPanel
                layerState={effectiveLayerState}
                onChange={setLayerState}
                gridSizeLabel={gridSizeLabel(analysisGridSize)}
                gridSize={analysisGridSize}
                onGridSizeChange={changeGridSize}
              />
            </div>
          </Card>

          <MapSidebarFacts rangers={rangersData.data ?? []} observations={observationsData.data ?? []} />

          <Card>
            <CardHeader
              title="Patrol Coverage"
              icon="layers"
              subtitle="Authoritative ForestGrid coverage — computed by the backend (PostGIS)"
              actions={
                coverageData.data && !coverageData.loading && !coverageData.error ? (
                  <button
                    onClick={() => { invalidateCache(); coverageData.reload(); }}
                    aria-label="Refresh patrol coverage"
                    className="inline-flex h-7 items-center gap-1 rounded-field border border-line bg-white px-2.5 text-xs font-medium text-ink transition hover:bg-forest-50"
                  >
                    <Icon name="refresh" size={12} /> Refresh
                  </button>
                ) : undefined
              }
            />
            <div className="space-y-2.5 p-4">
              {coverageData.error ? (
                <>
                  <p className="flex items-start gap-2 rounded-field border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
                    <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
                    {coverageErrorMessage(coverageData.error)}
                  </p>
                  <button
                    onClick={() => { invalidateCache(); coverageData.reload(); }}
                    className="inline-flex h-7 items-center gap-1 rounded-field border border-line bg-white px-2.5 text-xs font-medium text-ink transition hover:bg-forest-50"
                  >
                    <Icon name="refresh" size={12} /> Retry
                  </button>
                </>
              ) : !coverageData.data ? (
                <p className="text-xs text-ink-soft">Loading patrol coverage…</p>
              ) : (
                <>
                  <CoverageSummaryCard summary={coverageSummary!} coverage={coverageData.data!} />
                  {coverageData.loading && (
                    <p className="text-xs text-ink-faint">Refreshing patrol coverage…</p>
                  )}
                  {coverageMixedScope && (
                    <p className="rounded-field border border-line bg-surface px-2.5 py-2 text-[11px] leading-snug text-ink-soft">
                      Region filter active — the summary is the backend division scope (this filter
                      has no backend id in the reference catalog); cells on the map are
                      region-filtered.
                    </p>
                  )}
                </>
              )}
            </div>
          </Card>

          {assetsData.data && assetsData.data.length > 0 && (
            <Card>
              <CardHeader
                title="Map assets"
                icon="layers"
                subtitle={`${assetsData.data.length} file(s) served by the backend GIS API`}
              />
              <div className="space-y-1.5 p-4">
                {assetsData.data.map((a) => (
                  <a
                    key={a.id}
                    href={api.gis.asset(a.resourceKey)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-forest-50"
                  >
                    <Icon name="file" size={15} className="text-forest-700" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{a.resourceKey}</span>
                      <span className="block text-xs text-ink-soft">
                        {a.contentType} · {Math.round(a.sizeBytes / 1024)} KB · v{a.version}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Route playback" icon="play" subtitle="Replay a completed patrol trace" />
            {routesData.error && (
              <p className="px-4 pb-2 text-xs text-danger">
                Couldn&apos;t load patrol routes — {routesData.error.message}
              </p>
            )}
            <div className="space-y-2 p-4">
              {routes.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setReplayPatrol(r.patrolId)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-card border px-3 py-2.5 text-left transition-colors",
                    replayPatrol === r.patrolId
                      ? "border-forest-600 bg-forest-50"
                      : "border-line bg-surface hover:border-forest-600"
                  )}
                >
                  <span className="size-2.5 rounded-full" style={{ background: r.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{r.label}</p>
                    <p className="text-xs text-ink-soft">{r.patrolId} · {r.status}</p>
                  </div>
                  {replayPatrol === r.patrolId && <Badge tone="success">Active</Badge>}
                </button>
              ))}
              {routes.length === 0 && !routesData.error && (
                <p className="py-4 text-center text-sm text-ink-soft">No patrol routes with GPS traces yet.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

<div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Zero-patrol zones" icon="alert" iconTone="danger" subtitle="Beats without patrol coverage in the last 14 days" />
          <DataTable
            rows={zeroPatrolBeats}
            loading={false}
            columns={[
              {
                key: "id", header: "Beat",
                render: (b) => (
                  <div>
                    <p className="font-medium text-ink">{b.name}</p>
                    <p className="font-mono text-xs text-ink-soft">{b.id}</p>
                  </div>
                ),
              },
              {
                key: "lastPatrol", header: "Last patrol",
                render: () => <Badge tone="danger">14+ days</Badge>,
              },
              {
                key: "gap", header: "Coverage gap",
                render: () => <span className="font-semibold text-danger">Critical</span>,
              },
            ]}
            empty={<p className="py-8 text-center text-sm text-ink-soft">No beats flagged.</p>}
          />
        </Card>

        <Card>
          <CardHeader title="Activity heatmap" icon="layers" subtitle="Patrol & incident density blocks (API GAP — backend does not expose heat aggregates)" />
          <div className="grid grid-cols-2 gap-2 p-4">
            {heat.map((h) => (
              <div key={`${h.x}-${h.y}`} className="rounded-card border border-line" style={{ height: 64, background: `rgba(179, 38, 30, ${heatTone(h.intensity)})` }}>
                <span className="block px-3 pt-2 text-[11px] font-medium text-white">
                  {Math.round(h.intensity * 100)}% density
                </span>
                <span className="block px-3 text-[10px] text-white/70">block {h.x},{h.y}</span>
              </div>
            ))}
            {heat.length === 0 && (
              <p className="col-span-2 py-6 text-center text-sm text-ink-soft">
                Heat aggregation is not available from the backend yet.
              </p>
            )}
          </div>
        </Card>
      </div>
      <RegionReportDialog open={reportOpen} onClose={() => setReportOpen(false)} />
    </div>
  );
}

function cn(...args: unknown[]) { return args.filter(Boolean).join(" "); }

type Detail = ReturnType<typeof selectedDetail>;

function SelectedCard({
  detail,
  onClose,
  onFocus,
}: {
  detail: NonNullable<Detail>;
  onClose(): void;
  onFocus?(): void;
}) {
  const isGrid = detail.kind === "grid";
  const isLive = detail.kind === "live";
  return (
    <div className="overflow-hidden rounded-card border border-line bg-white shadow-pop" role="dialog" aria-label={detail.title}>
      <div className="flex items-start justify-between gap-2 border-b border-line bg-surface px-3 py-2">
        <div className="flex items-center gap-2">
          {detail.tag && (
            <Badge tone={isLive ? "success" : isGrid ? "forest" : detail.tone === "danger" ? "danger" : "neutral"} dot={isLive || undefined}>
              {detail.tag}
            </Badge>
          )}
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Map selection</p>
        </div>
        <button onClick={onClose} aria-label="Close popup" className="text-ink-faint hover:text-ink">
          <Icon name="x" size={14} />
        </button>
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-ink">{detail.title}</p>

        {isLive ? (
          <div className="mt-2.5 space-y-1.5 text-xs">
            <InfoRow label="Ranger" value={detail.live.rangerName} />
            <InfoRow label="Beat" value={detail.live.beat ?? "Not available"} />
            <InfoRow
              label="Last GPS"
              value={
                detail.live.fixAt
                  ? formatCoverageTime(detail.live.fixAt) ?? "Not available"
                  : "No GPS fix received"
              }
            />
            <InfoRow label="Accuracy" value={detail.live.accuracyM != null ? `${Math.round(detail.live.accuracyM)} m` : "—"} />
            <InfoRow label="Speed" value={detail.live.speedKmh != null ? `${detail.live.speedKmh.toFixed(1)} km/h` : "—"} />
            <InfoRow label="GPS points (patrol)" value={String(detail.live.pointCount)} />
            <InfoRow label="Path distance" value={detail.live.pathDistanceKm != null ? `${detail.live.pathDistanceKm} km` : "—"} />
            <InfoRow label="Path duration" value={detail.live.pathMinutes != null ? `${detail.live.pathMinutes} min` : "—"} />
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <Link
                href={detail.href}
                onClick={onClose}
                className="inline-flex h-8 items-center gap-1.5 rounded-field bg-forest-800 px-3 text-xs font-medium text-white hover:bg-forest-700"
              >
                <Icon name="chevronRight" size={12} /> {detail.cta}
              </Link>
              {onFocus && (
                <button
                  onClick={() => {
                    onFocus();
                    onClose();
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-field border border-line bg-white px-3 text-xs font-medium text-ink transition hover:bg-forest-50"
                >
                  <Icon name="target" size={12} /> Focus
                </button>
              )}
            </div>
          </div>
        ) : isGrid ? (
          <div className="mt-2.5 space-y-1.5 text-xs">
            <InfoRow label="Division" value={FOREST_CONTEXT.divisionName} />
            <InfoRow label="Range" value={detail.rangeName ?? "Not available"} />
            <InfoRow label="Beat" value={detail.beatName ?? "Not available"} />
            <InfoRow label="Compartment" value={detail.compNo ?? "Not available"} />
            {detail.coverageDetail.coverage ? (
              <>
                <InfoRow
                  label="Coverage"
                  value={detail.coverageDetail.coverage}
                />
                <InfoRow
                  label="Patrol points"
                  value={detail.coverageDetail.pointCount != null ? String(detail.coverageDetail.pointCount) : "Not available"}
                />
                <InfoRow
                  label="Last patrolled"
                  value={
                    detail.coverageDetail.lastPatrolledAt
                      ? formatCoverageTime(detail.coverageDetail.lastPatrolledAt) ?? "Not available"
                      : detail.coverageDetail.available
                        ? "Never"
                        : "Not available"
                  }
                />
              </>
            ) : detail.coverageDetail.available ? (
              <p className="flex items-start gap-2 rounded-field border border-warning/30 bg-warning-soft px-2.5 py-1.5 text-[11px] leading-snug text-[#8a4b00]">
                <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
                No coverage record for this reference cell.
              </p>
            ) : (
              <p className="flex items-start gap-2 rounded-field border border-warning/30 bg-warning-soft px-2.5 py-1.5 text-[11px] leading-snug text-[#8a4b00]">
                <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
                Coverage unavailable — the backend coverage request has not loaded (or failed). This
                reference cell stays visible without coverage coloring.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-0.5 text-xs text-ink-soft">{detail.body}</p>
        )}

        {!isGrid && !isLive && (
          <Link
            href={detail.href}
            onClick={onClose}
            className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-field bg-forest-800 px-3 text-xs font-medium text-white hover:bg-forest-700"
          >
            <Icon name="chevronRight" size={12} /> {detail.cta}
          </Link>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-ink-soft">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}

/** Sidebar summary — displays the backend's authoritative summary verbatim. */
function CoverageSummaryCard({ summary, coverage }: { summary: NonNullable<ApiGridCoverage["summary"]>; coverage: ApiGridCoverage }) {
  const generated = formatCoverageTime(coverage.generatedAt);
  return (
    <>
      <div className="flex items-end justify-between border-b border-line pb-2">
        <span className="text-xs font-medium text-ink-soft">Coverage</span>
        <span className="text-2xl font-semibold tabular-nums text-ink">{summary.coveragePercent}%</span>
      </div>
      <div className="space-y-1.5 pt-1">
        <InfoRow label="Patrolled" value={`${summary.patrolledCells} / ${summary.totalCells}`} />
        <InfoRow label="Unpatrolled" value={`${summary.unpatrolledCells} / ${summary.totalCells}`} />
        <InfoRow label="Patrol points" value={String(summary.pointCount)} />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
        <Badge tone={summary.patrolledCells > 0 ? "success" : "neutral"}>
          {summary.patrolledCells > 0 ? "Patrolled" : "Unpatrolled"}
        </Badge>
        <span className="text-[10px] text-ink-faint">
          {COVERAGE_SCOPE_LABELS[coverage.scope.kind] ?? "Backend scope"} · computed {generated ?? "now"}
        </span>
      </div>
    </>
  );
}