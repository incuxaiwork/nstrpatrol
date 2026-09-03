"use client";

/**
 * Forest MapWorkspace — the single interactive GIS map of the admin portal,
 * modeled on the Android app's MapsScreen (mobile/.../ui/screens/MapsScreen.kt):
 *
 *   • selectable online basemaps — the default OpenFreeMap vector style
 *     (tiles.openfreemap.org) with street / terrain / satellite as raster
 *     overlays — switched without moving the camera,
 *   • a free viewport: pan/zoom is NOT clamped to the forest bounds,
 *   • the same GeoJSON layer model — reserve boundary, forest beats,
 *     ranges, compartments, the analysis grid, patrol routes, ranger /
 *     sighting / incident markers, the live SOS alert feed, coverage tint,
 *     danger heat — every overlay driven by the EXTERNAL layer control panel
 *     via real MapLibre visibility switches (lib/map-layers.ts),
 *   • interactive affordances: pan / zoom / rotate / tilt gestures,
 *     tap-to-select, floating controls (zoom in/out, reset bearing,
 *     recenter, fullscreen), collapsible legend and patrol-track replay.
 *
 * Shared coordinate space lives in lib/map-space.ts (backend GeoJSON →
 * lon/lat). Replaces the old static SVG map across all pages.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Map as MapLibreMap,
  LngLatBounds,
  AJAXError,
  setWorkerUrl,
  type MapMouseEvent,
  type ExpressionSpecification,
  type FilterSpecification,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Next/Turbopack rewrites `import.meta.url` so maplibre-gl v6's
// defaultWorkerUrl() cannot resolve a worker chunk URL and instead spawns a
// dead `new Worker("")` whose messages are silently dropped — the entire map
// data pipeline then never completes. Serve the worker bundle from /public.
if (typeof window !== "undefined") {
  setWorkerUrl(new URL("/maplibre-gl-worker.mjs", window.location.href).href);
}
import { Icon } from "@/components/icons";
import { MapLayersPanel } from "@/components/map-layers-panel";
import { cn } from "@/lib/utils";
import { DEFAULT_GRID_SIZE, FOREST_CONTEXT, gridSizeLabel, type GridSizeKey } from "@/lib/forest-context";
import {
  BASEMAPS,
  RASTER_BASEMAPS,
  BASEMAP_TILE_HOSTS,
  basemapKeyForHost,
  DEFAULT_BASEMAP_KEY,
  basemapStyleUrl,
  type BasemapKey,
} from "@/lib/basemaps";
import { DEFAULT_LAYER_STATE, type ForestLayerState } from "@/lib/map-layers";
import { type BeatPolygon, type GisMarker, type GisRoute, type HeatBlock } from "@/lib/mock/gis";
import type { TaggedGrid } from "@/lib/grid-regions";
import { unitName } from "@/lib/mock/hierarchy";
import { categoryMeta } from "@/lib/mock/observations";
import type { Observation, Ranger } from "@/lib/types";
import type { BoundaryPolygon, CompartmentPolygon } from "@/lib/backend-adapters";
import {
  analysisGridsToFeatures,
  beatsToFeatures,
  boundaryFromBeats,
  boundariesToFeatures,
  compartmentLabelsToFeatures,
  compartmentsToFeatures,
  emptyFc,
  heatToFeatures,
  livePathsToFeatures,
  liveRangersToFeatures,
  markersToFeatures,
  rangeLabelsToFeatures,
  rangesFromBeats,
  rangesToFeatures,
  regionHoverToFeatures,
  replayFeatures,
  routeToTimed,
  routesToFeatures,
  type GeoFeatureCollection,
  type LivePathFeature,
  type LiveRangerFeature,
  type TimedPoint,
} from "@/lib/map-space";

const DIVISION_CENTER: [number, number] = [79.15, 15.92];

/** Neutral offline fallback swapped in only when the Atlas style fails
 *  to load (the operational overlay layers are (re)built on its "load"). */
const FALLBACK_BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "gl-bg", type: "background", paint: { "background-color": "#e8eaed" } }],
};

/** One point of the live SOS alert feed rendered as its own map layer. */
export interface SosAlertPoint {
  /** Backend incident id — doubles as the clickable feature id. */
  id: string;
  lng: number;
  lat: number;
  /** Card title shown on selection (ranger · time). */
  label?: string;
}

/* ------------------------------------------------------------------ */
/* Public props                                                        */
/* ------------------------------------------------------------------ */

export interface MapProps {
  /** "workspace" shows the full control suite (GIS page); "overview" a lighter
   *  header but still every admin overlay; "focus" is a stripped detail mini-map
   *  that renders ONLY the focused content (a single patrol replay trail or a
   *  single incident point) with no admin overlays / controls. */
  mode?: "focus" | "overview" | "workspace";
  heightClass?: string;
  liveBeats?: BeatPolygon[];
  compartments?: CompartmentPolygon[];
  boundary?: BoundaryPolygon[];
  /** Attribute-registered analysis-grid cells (frontend-generated, configurable size). */
  analysisGrids?: TaggedGrid[];
  /** Active analysis-grid cell size (drives label + tooltip). */
  gridSize?: GridSizeKey;
  /** Analysis-grid size label for the fullscreen overlay panel ("1 km"). */
  gridSizeLabel?: string;
  /** Size change handler for the fullscreen overlay panel (regenerates the grid). */
  onGridSizeChange?(size: GridSizeKey): void;
  /** Analysis-grid cells currently selected (deterministic cell ids). */
  selectedGridIds?: ReadonlySet<string>;
  /** A grid cell was clicked (toggle handled by the parent). */
  onGridClick?(id: string): void;
  /** Hover entry/exit on an analysis-grid cell. */
  onGridHover?(id: string | null): void;
  markers?: GisMarker[];
  routes?: GisRoute[];
  /**
   * LIVE patrol windows (GET /api/patrols/live) — drawn above historical
   * routes; toggled by the Patrol Routes switch.
   */
  livePaths?: LivePathFeature[];
  /** Current/stale ranger positions of ACTIVE patrols — Ranger Positions switch. */
  liveRangers?: LiveRangerFeature[];
  heat?: HeatBlock[];
  selectedId?: string | null;
  onSelect?(id: string | null): void;
  replayPatrolId?: string | null;
  replayPoints?: { lat: number; lng: number }[];
  onProgress?(p: number): void;
  seekSignal?: { value: number } | null;
  detailCard?: ReactNode;
  /**
   * Honest operational status strip rendered top-left inside the map (counts
   * of the enabled operational layers, or their empty/unavailable states).
   */
  statusChip?: ReactNode;
  /**
   * Range → Beat → Compartment region filter. Division is NOT part of the
   * filter — Markapur Division is the fixed context (lib/forest-context.ts).
   * Applied to beats / compartments / ranges / grid layers by their region
   * properties; clears to null when empty.
   */
   regionFilter?: GridRegionFilter;
  /**
   * Controlled layer state (owned by the external MAP LAYERS panel). When
   * omitted the map falls back to internal defaults so lightweight embeds
   * (detail-page mini maps) keep working without a panel.
   */
  layerState?: ForestLayerState;
  /** Emitted whenever a checkbox / basemap radio changes the layer state. */
  onLayerStateChange?(next: ForestLayerState): void;
  /**
   * Live SOS alert feed points (GET /api/alerts → SOS events with GPS).
   * Rendered as the dedicated SOS layer; when provided, SOS-kind markers are
   * removed from the generic sightings/incidents layer to avoid duplicates.
   */
  sosAlerts?: SosAlertPoint[];
  /**
   * Camera focus request (deep links, "View on Map"). Applied once per
   * change without touching layer state.
   */
   focus?: { lng: number; lat: number; zoom?: number } | null;
  /**
   * Focused single-point content for detail mini-maps (incident / sighting
   * detail pages). When set in "focus" mode a single pin is drawn at this
   * real-world location and the camera fits to it — nothing else is shown.
   */
  focusedPoint?: { lng: number; lat: number } | null;
  /**
   * Camera fit request when the region filter narrows to a specific
   * Range / Beat / Compartment. Applied via fitBounds whenever the bounds
   * change. Null/omitted fits nothing (clears back to the free camera).
   */
   fitRequest?: { west: number; south: number; east: number; north: number } | null;
}

export interface GridRegionFilter {
  rangeId?: string | null;
  beatId?: string | null;
  compId?: string | null;
}

/** MapLibre expression filtering a layer by the region filter (null = all). */
function regionFilterExpression(v: GridRegionFilter | undefined): FilterSpecification | null {
  if (!v) return null;
  const parts: ExpressionSpecification[] = [];
  if (v.rangeId) parts.push(["==", ["get", "rangeId"], v.rangeId]);
  if (v.beatId) parts.push(["==", ["get", "beatId"], v.beatId]);
  if (v.compId) parts.push(["==", ["get", "compId"], v.compId]);
  return parts.length > 0 ? ["all", ...parts] : null;
}

/* ------------------------------------------------------------------ */
/* Layer stack                                                         */
/* ------------------------------------------------------------------ */

interface ReplayModel {
  id: string;
  patrolId: string;
  label: string;
  color: string;
  timed: TimedPoint[];
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

const CLICKABLE = [
  "gl-beats-fill",
  "gl-beats-outline",
  "gl-compartments-fill",
  "gl-routes",
  "gl-routes-endpoints",
  "gl-live-path",
  "gl-live-ranger-dot",
  "gl-markers-ranger",
  "gl-markers-obs",
  "gl-markers-sos",
  "gl-sos-dot",
];

/** Checkbox → GL layer ids. The basemap radio is handled separately
 *  (BASEMAP_LAYER_IDS below) because it is a single choice, not a toggle. */
const TOGGLE_LAYERS: Record<Exclude<keyof ForestLayerState, "basemap">, string[]> = {
  // NOTE: there is deliberately NO solid forest/boundary fill — the reserve
  // renders as the plain basemap inside its outline. Beats DO carry the
  // Android-app's subtle dark-green tint (#1E4620 @ 0.12, MapsScreen.kt
  // "beats-fill-layer"); sources are untouched beyond that.
boundary: ["gl-boundary-line"],
  // Beat group owns EVERYTHING beat-derived: hit-test fill, outlines, labels
  // AND the authorized-patrol highlight (gl-auth-*) — previously these two
  // were orphaned outside this map and stayed visible with every box off
  // (the reported stray violet lines). Labels are governed by the
  // label-priority effect (LAYER_LABEL_RULES) so a coarser layer's label
  // never overlaps a finer one's.
  beats: ["gl-beats-fill", "gl-beats-outline", "gl-auth-fill", "gl-auth-line"],
  ranges: ["gl-ranges-fill", "gl-ranges-outline"],
  compartments: ["gl-compartments-fill", "gl-compartments-line"],
  analysisGrid: [
    "gl-agrid-fill",
    "gl-agrid-line",
    "gl-agrid-label",
    "gl-agrid-sel-fill",
    "gl-agrid-sel-line",
  ],
  routes: [
    "gl-routes",
    "gl-routes-endpoints",
    "gl-live-path-case",
    "gl-live-path",
    "gl-replay-case",
    "gl-replay-trail",
    "gl-replay-dots",
    "gl-replay-head-halo",
    "gl-replay-head",
  ],
  rangers: [
    "gl-markers-ranger",
    "gl-markers-ranger-label",
    "gl-live-ranger-halo",
    "gl-live-ranger-dot",
    "gl-live-ranger-label",
  ],
  markers: ["gl-markers-obs"],
  sos: ["gl-markers-sos", "gl-markers-sos-label", "gl-sos-dot", "gl-sos-ring", "gl-sos-label"],
  zeropatrol: ["gl-beats-zero-dash"],
  // Coverage group = the per-beat coverage tint (a coverage visualization,
  // not a boundary — so Beat ON stays pure lines).
  coverage: ["gl-beats-coverage"],
  heat: ["gl-heat"],
};

/** Basemap overlay layers — the Atlas vector style is the loaded MapLibre
 *  style; these raster layers sit above it and exactly one becomes visible
 *  when the radio selects street / terrain / satellite (all start hidden
 *  because the default basemap is Atlas). The "atlas" key maps to a layer id
 *  that never exists — the visibility effect skips it cleanly. */
const BASEMAP_LAYER_IDS: Record<BasemapKey, string> = {
  atlas: "gl-basemap-atlas",
  street: "gl-basemap-street",
  terrain: "gl-basemap-terrain",
  satellite: "gl-basemap-satellite",
};

/** Layers whose visibility is constrained by the Range → Beat → Compartment
 *  region filter (division is fixed context, never filtered). */
const REGION_FILTERED_LAYERS = [
  "gl-beats-fill",
  "gl-beats-outline",
  "gl-beats-zero-dash",
  "gl-beats-label",
  "gl-beats-coverage",
  "gl-auth-fill",
  "gl-auth-line",
  "gl-compartments-fill",
  "gl-compartments-line",
  "gl-compartments-label",
  "gl-ranges-outline",
  "gl-ranges-fill",
  "gl-ranges-label",
  "gl-agrid-fill",
  "gl-agrid-line",
  "gl-agrid-label",
  "gl-agrid-sel-fill",
  "gl-agrid-sel-line",
];

function buildLayers(m: MapLibreMap) {
  for (const id of [
    "beats",
    "markers",
    "routes",
    "route-endpoints",
    "heat",
    "replay-trail",
    "replay-head",
    "replay-points",
    "compartments",
    "ranges",
    "range-labels",
    "compartment-labels",
    "boundary",
    "analysis-grid",
    "sos-alerts",
    "focus-point",
    "focus-path",
  ]) {
    m.addSource(id, { type: "geojson", data: emptyFc() });
  }

  // 1. Raster basemap overlays — the Atlas vector style (OpenFreeMap) is the
  //    loaded basemap; these raster layers sit above it and exactly one becomes
  //    visible when the radio selects street / terrain / satellite (all start
  //    hidden because the default basemap is Atlas).
  for (const d of RASTER_BASEMAPS) {
    m.addSource(d.id, {
      type: "raster",
      tiles: d.tileUrls!,
      tileSize: 256,
      minzoom: 1,
      maxzoom: d.maxZoom ?? 19,
      attribution: d.attribution,
    });
    m.addLayer({
      id: `gl-basemap-${d.id}`,
      type: "raster",
      source: d.id,
      paint: { "raster-opacity": 1 },
      layout: { visibility: "none" },
    });
  }

  // 2. Per-beat coverage tint (green ramp where a beat carries a coverage
  //    figure). It is a COVERAGE visualization and follows the Coverage
  //    checkbox — Beat ON alone shows boundaries only.
  m.addLayer({
    id: "gl-beats-coverage",
    type: "fill",
    source: "beats",
    filter: ["!=", ["get", "coveragePct"], null],
    paint: {
      "fill-color": "#2E7D32",
      "fill-opacity": [
        "interpolate",
        ["linear"],
        ["get", "coveragePct"],
        0,
        0.05,
        100,
        0.3,
      ],
    },
  });

  // 3. Danger heat blocks.
  m.addLayer({
    id: "gl-heat",
    type: "fill",
    source: "heat",
    paint: { "fill-color": "#B3261E", "fill-opacity": ["*", ["get", "intensity"], 0.32] },
  });

  // 4. Compartments — bright sky-blue dashed internal lines, zoom-gated so
  //    dense internal boundaries only appear when the admin has zoomed in.
  //    Fill is hit-test only. Drawn BELOW the beats stack (hierarchy
  //    bottom→top: compartments → beats → ranges → boundary) so beats always
  //    render on top of compartment lines.
  m.addLayer({
    id: "gl-compartments-fill",
    type: "fill",
    source: "compartments",
    paint: { "fill-color": "#E65100", "fill-opacity": 0.02 },
  });
  m.addLayer({
    id: "gl-compartments-line",
    type: "line",
    source: "compartments",
    minzoom: 9.0,
    paint: {
      "line-color": [
        "case",
        ["boolean", ["get", "filtered"], false],
        "#FACC15",
        "#38BDF8",
      ],
      "line-width": ["case", ["boolean", ["get", "filtered"], false], 2.5, 1.6],
      "line-dasharray": [
        "case",
        ["boolean", ["get", "filtered"], false],
        ["literal", [1, 0]],
        ["literal", [4, 3]],
      ],
      "line-opacity": ["case", ["boolean", ["get", "filtered"], false], 1, 0.95],
    },
  });
  m.addLayer({
    id: "gl-compartments-label",
    type: "symbol",
    source: "compartment-labels",
    minzoom: 11,
    layout: {
      "text-field": ["get", "compNo"],
      "text-size": 10,
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#0C8BB8",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
    },
  });

  // 5. Beat polygons — boundary-focused: the fill exists ONLY for click
  //    hit-testing (fill-opacity ≈ 0), outlines are a distinct teal so beats
  //    never read as a green bucket and never blend with the deep-green
  //    reserve boundary. Zero-patrol beats keep their red dashed outline;
  //    authorized-patrol highlight is gold (matches the Jurisdiction module).
  m.addLayer({
    id: "gl-beats-fill",
    type: "fill",
    source: "beats",
    paint: { "fill-color": "#1E4620", "fill-opacity": 0.02 },
  });
  m.addLayer({
    id: "gl-auth-fill",
    type: "fill",
    source: "beats",
    filter: ["==", ["get", "isAuth"], true],
    paint: { "fill-color": "#B07D12", "fill-opacity": 0.08 },
  });
  m.addLayer({
    id: "gl-auth-line",
    type: "line",
    source: "beats",
    filter: ["==", ["get", "isAuth"], true],
    paint: {
      "line-color": "#B07D12",
      "line-width": 2.5,
      "line-dasharray": [7, 5],
    },
  });
  m.addLayer({
    id: "gl-beats-outline",
    type: "line",
    source: "beats",
    paint: {
      "line-color": [
        "case",
        ["boolean", ["get", "filtered"], false],
        "#FACC15",
        ["boolean", ["get", "selected"], false],
        "#B4450C",
        ["boolean", ["get", "isZero"], false],
        "#B3261E",
        "#E65100",
      ],
      "line-width": [
        "case",
        ["boolean", ["get", "filtered"], false],
        3,
        ["boolean", ["get", "selected"], false],
        3,
        2.2,
      ],
      "line-opacity": ["case", ["boolean", ["get", "selected"], false], 1, 0.9],
    },
  });
  m.addLayer({
    id: "gl-beats-zero-dash",
    type: "line",
    source: "beats",
    filter: ["==", ["get", "isZero"], true],
    paint: {
      "line-color": "#B3261E",
      "line-width": 3,
      "line-dasharray": [8, 6],
      "line-opacity": 0.85,
    },
  });
  m.addLayer({
    id: "gl-beats-label",
    type: "symbol",
    source: "beats",
    minzoom: 9,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 12,
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": ["case", ["boolean", ["get", "isZero"], false], "#B3261E", "#C2410C"],
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
    },
  });

  // 6. Ranges (derived hulls of each range's beats) — one consistent vivid
  //    bright-pink boundary. Between the beat outlines and the heavy forest
  //    boundary. A rainbow of per-range colors read as random violet/orange
  //    noise; hierarchy needs ONE range color. An invisible fill makes the
  //    range area individually clickable (range selection), hiding with the
  //    same checkbox group.
  m.addLayer({
    id: "gl-ranges-fill",
    type: "fill",
    source: "ranges",
    paint: { "fill-color": "#FF1493", "fill-opacity": 0.02 },
  });
  m.addLayer({
    id: "gl-ranges-outline",
    type: "line",
    source: "ranges",
    paint: {
      "line-color": "#FF1493",
      "line-width": 3,
      "line-opacity": 0.95,
    },
  });
  m.addLayer({
    id: "gl-ranges-label",
    type: "symbol",
    source: "range-labels",
    minzoom: 7.5,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 14,
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#0E4C92",
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
    },
  });

  // 7. Reserve boundary — the STRONGEST administrative line: solid red,
  //    heaviest width. Painted AFTER the unit layers (ranges, …) so the
  //    forest outline always reads on top. Outline only — never a fill.
  m.addLayer({
    id: "gl-boundary-line",
    type: "line",
    source: "boundary",
    paint: {
      "line-color": "#DC2626",
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3.2, 14, 5.5],
      "line-opacity": 0.95,
    },
  });
  m.addLayer({
    id: "gl-boundary-label",
    type: "symbol",
    source: "boundary",
    minzoom: 7,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 13,
      "text-transform": "uppercase",
      "text-letter-spacing": 0.08,
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#143d2b",
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
    },
  });

  // 7b. Analysis grid — frontend-generated metric cells (configurable size).
  //     Placed beneath patrol routes / markers so operational data always
  //     stays on top. Selection is a data-driven highlight on the same cells.
  m.addLayer({
    id: "gl-agrid-fill",
    type: "fill",
    source: "analysis-grid",
    paint: {
      "fill-color": "#8a8f98",
      "fill-opacity": 0.07,
    },
  });
  m.addLayer({
    id: "gl-agrid-line",
    type: "line",
    source: "analysis-grid",
    minzoom: 4.5,
    paint: {
      "line-color": "#8a8f98",
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 14, 1.2],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.25, 12, 0.5],
    },
  });
  m.addLayer({
    id: "gl-agrid-label",
    type: "symbol",
    source: "analysis-grid",
    minzoom: 12.5,
    layout: {
      "text-field": ["get", "gridCode"],
      "text-size": 9,
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#5b636e",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
    },
  });

  // 8. Patrol routes + playback track. The replay visual is the Android
  //    PatrolReportScreen language: white casing under a bold blue line
  //    (#2E7BF6 w 5 @ 0.95, round caps), every recorded GPS fix as a small
  //    blue dot, and the playhead as the app's "current position" marker
  //    (soft blue halo + dot with white ring).
  m.addLayer({
    id: "gl-routes",
    type: "line",
    source: "routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": 4,
      "line-opacity": 0.85,
    },
  });
  // Per-patrol endpoint dots — every patrol keeps a visible, distinct marker
  // at its last GPS fix even when its recorded track is degenerate/co-located
  // (many routes are logged from a stationary device and collapse to a single
  // stacked line, so without this several patrols are invisible in one blob).
  m.addLayer({
    id: "gl-routes-endpoints",
    type: "circle",
    source: "route-endpoints",
    layout: { visibility: "none" },
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        9, 5,
        14, 8,
      ],
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
  m.addLayer({
    id: "gl-replay-case",
    type: "line",
    source: "replay-trail",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#FFFFFF", "line-width": 9, "line-opacity": 0.9 },
  });
  m.addLayer({
    id: "gl-replay-trail",
    type: "line",
    source: "replay-trail",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#2E7BF6", "line-width": 5, "line-opacity": 0.95 },
  });
  m.addLayer({
    id: "gl-replay-dots",
    type: "circle",
    source: "replay-points",
    paint: {
      "circle-radius": 5,
      "circle-color": "#2E7BF6",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
  m.addLayer({
    id: "gl-replay-head-halo",
    type: "circle",
    source: "replay-head",
    paint: { "circle-radius": 16, "circle-color": "#2E7BF6", "circle-opacity": 0.33 },
  });
  m.addLayer({
    id: "gl-replay-head",
    type: "circle",
    source: "replay-head",
    paint: {
      "circle-radius": 7,
      "circle-color": "#2E7BF6",
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 2.5,
    },
  });

  // 9b. LIVE patrol operations (GET /api/patrols/live). Painted AFTER the
  //     historical routes/replay and BEFORE the ground markers/SOS layers,
  //     so the active-patrol window reads on top of recorded traces while an
  //     SOS alert still wins the stack. Amber = live operations color; gray
  //     = stale feed (last fix older than the freshness threshold).
  m.addSource("live-paths", { type: "geojson", data: emptyFc() });
  m.addSource("live-rangers", { type: "geojson", data: emptyFc() });
  m.addLayer({
    id: "gl-live-path-case",
    type: "line",
    source: "live-paths",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#FFFFFF", "line-width": 8, "line-opacity": 0.85 },
  });
  m.addLayer({
    id: "gl-live-path",
    type: "line",
    source: "live-paths",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["case", ["==", ["get", "freshness"], "stale"], "#7D8794", "#FF8F00"],
      "line-width": 4.5,
      "line-opacity": 0.95,
    },
  });
  m.addLayer({
    id: "gl-live-ranger-halo",
    type: "circle",
    source: "live-rangers",
    paint: {
      "circle-radius": 15,
      "circle-color": ["case", ["==", ["get", "freshness"], "stale"], "#7D8794", "#FF8F00"],
      "circle-opacity": 0.28,
    },
  });
  m.addLayer({
    id: "gl-live-ranger-dot",
    type: "circle",
    source: "live-rangers",
    paint: {
      "circle-radius": 7,
      "circle-color": ["case", ["==", ["get", "freshness"], "stale"], "#7D8794", "#FF8F00"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2.5,
    },
  });
  m.addLayer({
    id: "gl-live-ranger-label",
    type: "symbol",
    source: "live-rangers",
    minzoom: 11,
    layout: {
      "text-field": ["get", "rangerName"],
      "text-size": 10,
      "text-offset": [0, 1.3],
      "text-anchor": "top",
      "text-allow-overlap": false,
    },
    paint: { "text-color": "#5B3A00", "text-halo-color": "#ffffff", "text-halo-width": 2 },
  });

  // 10. Ground markers — rangers, sightings/incidents, SOS.
  m.addLayer({
    id: "gl-markers-ranger",
    type: "circle",
    source: "markers",
    filter: ["==", ["get", "kind"], "ranger"],
    paint: {
      "circle-radius": 10,
      "circle-color": "#fff",
      "circle-stroke-color": "#1B365D",
      "circle-stroke-width": 2.5,
    },
  });
  m.addLayer({
    id: "gl-markers-ranger-label",
    type: "symbol",
    source: "markers",
    filter: ["==", ["get", "kind"], "ranger"],
    layout: { "text-field": ["get", "code"], "text-size": 9 },
    paint: { "text-color": "#1B365D" },
  });
  m.addLayer({
    id: "gl-markers-obs",
    type: "circle",
    source: "markers",
    filter: ["in", ["get", "kind"], ["literal", ["observation", "incident"]]],
    paint: {
      "circle-radius": 8,
      "circle-color": ["coalesce", ["get", "tone"], ["get", "color"]],
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 2,
    },
  });
  m.addLayer({
    id: "gl-markers-sos",
    type: "circle",
    source: "markers",
    filter: ["==", ["get", "kind"], "sos"],
    paint: {
      "circle-radius": 12,
      "circle-color": "#B3261E",
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 2,
    },
  });
  m.addLayer({
    id: "gl-markers-sos-label",
    type: "symbol",
    source: "markers",
    filter: ["==", ["get", "kind"], "sos"],
    layout: { "text-field": "SOS", "text-size": 10 },
    paint: { "text-color": "#fff", "text-halo-color": "#B3261E", "text-halo-width": 2 },
  });

  // 11. Analysis-grid selection highlight — above routes/markers so the
  //     choice reads clearly; painted only on selected cells.
  m.addLayer({
    id: "gl-agrid-sel-fill",
    type: "fill",
    source: "analysis-grid",
    filter: ["==", ["get", "selected"], true],
    paint: { "fill-color": "#0E4C92", "fill-opacity": 0.22 },
  });
  m.addLayer({
    id: "gl-agrid-sel-line",
    type: "line",
    source: "analysis-grid",
    filter: ["==", ["get", "selected"], true],
    paint: { "line-color": "#0E4C92", "line-width": 2, "line-opacity": 0.9 },
  });

  // 12. Live SOS alert feed (GET /api/alerts → SOS events). A halo ring +
  //     bold dot + label; sits above everything so an emergency is always
  //     readable regardless of overlay density.
  m.addLayer({
    id: "gl-sos-ring",
    type: "circle",
    source: "sos-alerts",
    paint: {
      "circle-radius": 22,
      "circle-color": "#B3261E",
      "circle-opacity": 0.18,
    },
  });
  m.addLayer({
    id: "gl-sos-dot",
    type: "circle",
    source: "sos-alerts",
    paint: {
      "circle-radius": 13,
      "circle-color": "#B3261E",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 3,
    },
  });
  m.addLayer({
    id: "gl-sos-label",
    type: "symbol",
    source: "sos-alerts",
    layout: { "text-field": "SOS", "text-size": 11 },
    paint: { "text-color": "#ffffff" },
  });

  // 13. Region hover highlight — the TOPMOST boundary layer. Drawn after
  //     every other layer so a hovered Beat / Compartment's COMPLETE boundary
  //     always renders above Forest/Range/Beat/Compartment lines and fills no
  //     matter how dense the map is. Fed with only the hovered geometry via
  //     the "region-hover" source (empty = no highlight). Uses a dark casing
  //     halo so the yellow reads clearly on satellite/terrain basemaps.
  m.addSource("region-hover", { type: "geojson", data: emptyFc() });
  m.addLayer({
    id: "gl-region-hover-case",
    type: "line",
    source: "region-hover",
    paint: {
      "line-color": "#1F2937",
      "line-width": ["interpolate", ["linear"], ["zoom"], 6, 5, 14, 9],
      "line-opacity": 0.55,
    },
  });
  m.addLayer({
    id: "gl-region-hover-line",
    type: "line",
    source: "region-hover",
    paint: {
      "line-color": "#FACC15",
      "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2.5, 14, 4.5],
      "line-opacity": 1,
    },
  });

  // 17. Detail focused point — a single pin used by "focus" mode detail
  //     mini-maps (incident / sighting pages). Hidden until the component's
  //     focus effect feeds a point and sets it visible.
  m.addLayer({
    id: "gl-focus-point-halo",
    type: "circle",
    source: "focus-point",
    layout: { visibility: "none" },
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 14, 14, 24],
      "circle-color": "#B3261E",
      "circle-opacity": 0.22,
      "circle-stroke-color": "#B3261E",
      "circle-stroke-width": 1,
    },
  });
  m.addLayer({
    id: "gl-focus-point",
    type: "circle",
    source: "focus-point",
    layout: { visibility: "none" },
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 7, 14, 11],
      "circle-color": "#B3261E",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 3,
    },
  });

  // 18. Detail focused patrol path — the FULL route of the selected patrol,
  //     drawn at rest (independent of playback progress) so the patrol detail
  //     mini-map shows the complete path immediately. Fed from the
  //     "replay-points" source, visible only in "focus" mode.
  m.addLayer({
    id: "gl-focus-path",
    type: "line",
    source: "focus-path",
    layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
    paint: {
      "line-color": "#0B66C3",
      "line-width": 4,
      "line-opacity": 0.9,
    },
  });
}

function setSourceData(m: MapLibreMap, id: string, data: GeoJSON.FeatureCollection) {
  const src = m.getSource(id);
  if (src && "setData" in src) (src as { setData(d: GeoJSON.FeatureCollection): void }).setData(data);
}

/* ------------------------------------------------------------------ */
/* Hover popup (shared by markers + patrol routes)                     */
/* ------------------------------------------------------------------ */

/** Cursor-anchored hover card. Rows carry ONLY fields that exist on the real
 *  record; anything absent renders as "—" — never invented. */
interface HoverCardState {
  x: number;
  y: number;
  alignRight?: boolean;
  alignBottom?: boolean;
  title: string;
  tag: string;
  rows: [string, string][];
}

const HOVER_KIND_TITLES: Record<string, string> = {
  ranger: "Ranger position",
  observation: "Observation",
  incident: "Incident report",
  sos: "SOS alert",
};

/** Build the hover card from a picked feature's properties. */
function hoverCardFromProps(
  props: Record<string, unknown>,
  pos: { x: number; y: number; alignRight?: boolean; alignBottom?: boolean }
): HoverCardState {
  const str = (v: unknown): string | null => {
    const s = v == null ? "" : String(v).trim();
    return s.length > 0 ? s : null;
  };
  const time = (v: unknown): string | null => {
    const raw = str(v);
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isFinite(d.getTime())
      ? d.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : null;
  };
  const row = (label: string, v: unknown, fmt?: (x: unknown) => string | null): [string, string] => [
    label,
    (fmt ? fmt(v) : str(v)) ?? "—",
  ];
  const numRow = (label: string, v: unknown, suffix: string, digits = 0): [string, string] => [
    label,
    typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(digits)}${suffix}` : "—",
  ];

  // LIVE ranger position (GET /api/patrols/live) — only real feed fields.
  if (str(props.kind) === "live-ranger") {
    return {
      ...pos,
      title: str(props.rangerName) ?? "Ranger on patrol",
      tag: str(props.freshness) === "stale" ? "Live position — stale GPS" : "Live ranger position",
      rows: [
        row("Patrol", props.patrolLabel),
        row("Status", "Active"),
        row("Last GPS", props.fixAt, time),
        numRow("Accuracy", props.accuracyM as number | undefined, " m"),
        numRow("Speed", props.speedKmh as number | undefined, " km/h", 1),
        row("Points", props.pointCount),
        row("Path window", props.pathWindow),
      ],
    };
  }

  // LIVE patrol path — the bounded recent window of an active patrol.
  if (str(props.kind) === "live-patrol") {
    return {
      ...pos,
      title: str(props.label) ?? "Live patrol",
      tag: str(props.freshness) === "stale" ? "Live route — stale GPS" : "Live patrol route",
      rows: [
        row("Ranger", props.rangerName),
        row("Started", props.startedAt, time),
        ["Latest GPS", str(props.endAt) ? time(props.endAt) ?? "—" : "—"],
        numRow("Path duration", props.durationMinutes as number | undefined, " min", 1),
        numRow("Distance", props.distanceKm as number | undefined, " km", 2),
        row("GPS points", props.pointCount),
      ],
    };
  }

  // Patrol route line
  if (str(props.patrolId)) {
    const status = str(props.status);
    return {
      ...pos,
      title: str(props.label) ?? "Patrol track",
      tag: `Patrol route${status ? ` · ${status}` : ""}`,
      rows: [
        row("Type", props.patrolType),
        row("Ranger", props.rangerName),
        row("Start", props.startedAt, time),
        [ "End", str(props.endedAt) ? time(props.endedAt) ?? "—" : "active"],
        numRow("Duration", props.durationMinutes as number | undefined, " min", 1),
        numRow("Distance", props.distanceKm as number | undefined, " km", 2),
        row("GPS fixes", props.pointCount),
      ],
    };
  }

  // Ground marker (ranger / observation / incident / sos)
  const kind = str(props.kind) ?? "incident";
  const title = HOVER_KIND_TITLES[kind] ?? "Map feature";
  const rows: [string, string][] =
    kind === "ranger"
      ? [row("Fix", props.category), row("Time", props.occurredAt, time)]
      : [
          row("Type", props.category),
          row("Severity", props.severity),
          row("Status", props.status),
          row("When", props.occurredAt, time),
          row("Reported by", props.reporter),
          numRow("GPS accuracy", props.accuracyM as number | undefined, " m"),
        ];
  return {
    ...pos,
    title: str(props.label) ?? title,
    tag: title,
    rows,
  };
}

/** Operational layers that show a hover card (grid cells keep their own tooltip). */
const HOVER_LAYERS = [
  "gl-live-path",
  "gl-live-ranger-dot",
  "gl-markers-ranger",
  "gl-markers-obs",
  "gl-markers-sos",
  "gl-sos-dot",
  "gl-routes",
];

/* ------------------------------------------------------------------ */
/* The map                                                             */
/* ------------------------------------------------------------------ */

export function MapWorkspace({
  mode = "workspace",
  heightClass = "h-[560px]",
  selectedId,
  onSelect,
  replayPatrolId,
  replayPoints,
  onProgress,
  seekSignal,
  liveBeats,
  compartments,
  boundary,
  analysisGrids,
  gridSize = DEFAULT_GRID_SIZE,
  gridSizeLabel: gridSizeLabelProp,
  onGridSizeChange,
  selectedGridIds,
  onGridClick,
  onGridHover,
  markers,
  routes,
  livePaths,
  liveRangers,
  heat,
  detailCard,
  statusChip,
  regionFilter,
  layerState: layerStateProp,
  onLayerStateChange,
  sosAlerts,
  focus,
  focusedPoint,
  fitRequest,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const didFit = useRef(false);
  // Previous ops-toggle state, so we can detect an off→on transition and
  // recentre onto the newly enabled layer's data (which can sit far from the
  // default forest view).
  const didFitOps = useRef<Set<string>>(new Set());
  const fedLogRef = useRef(false);
  const [ready, setReady] = useState(false);

  /** Once a raster basemap's tile host fails (403 / "Failed to fetch (0)"), we
   *  record the basemap key here so a one-time "unreachable" notice can show
   *  above the map when that basemap is selected. */
  const [basemapDown, setBasemapDown] = useState<BasemapKey | null>(null);
  /** Failing external-tile URLs already surfaced, so the console stays quiet
   *  after the first occurrence of each. */
  const seenTileErrors = useRef(new Set<string>());

  // Layer state is controlled when a panel owns it (GIS workspace); the
  // internal fallback keeps lightweight embeds working without a panel
  // (fixed defaults — no toggles without an owning panel).
  const [internalLayers] = useState<ForestLayerState>(DEFAULT_LAYER_STATE);
  const layerState = layerStateProp ?? internalLayers;
  const [legendOpen, setLegendOpen] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [layersOverlayOpen, setLayersOverlayOpen] = useState(false);

  // Region hover (beats/compartments) — drives the yellow outline highlight.
  // Kept via a ref so the pointer handler never re-fires per mousemove.
  const regionHoverRef = useRef<{ beatId?: string; compId?: string }>({});
  const [regionHover, setRegionHover] = useState<{ beatId?: string; compId?: string }>({});
  const applyRegionHover = useCallback((next: { beatId?: string; compId?: string }) => {
    const cur = regionHoverRef.current;
    if (next.beatId !== cur.beatId || next.compId !== cur.compId) {
      regionHoverRef.current = next;
      setRegionHover(next);
    }
  }, []);

  const [replayOn, setReplayOn] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [progress, setProgress] = useState(0);

  /** Cursor-positioned tooltip for the hovered analysis-grid cell. */
  const [gridTooltip, setGridTooltip] = useState<{ x: number; y: number; code: string } | null>(null);

  /** Cursor-following hover card for operational features (markers/routes). */
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null);

  const beats = useMemo(() => liveBeats ?? [], [liveBeats]);
  const comps = useMemo(() => compartments ?? [], [compartments]);
  const ranges = useMemo(() => rangesFromBeats(beats), [beats]);

  const [prevSeek, setPrevSeek] = useState(seekSignal);
  if (prevSeek !== seekSignal && seekSignal) {
    setPrevSeek(seekSignal);
    setProgress(seekSignal.value);
    setReplayOn(false);
    onProgress?.(seekSignal.value);
  }
  const [prevPatrol, setPrevPatrol] = useState(replayPatrolId);
  if (prevPatrol !== replayPatrolId) {
    setPrevPatrol(replayPatrolId);
    setProgress(0);
  }

  // Track the browser fullscreen state on the map wrapper.
  useEffect(() => {
    const el = wrapRef.current;
    const onChange = () => setIsFull(Boolean(el && document.fullscreenElement === el));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) void document.exitFullscreen();
      else void el.requestFullscreen();
    } catch {
      /* fullscreen unsupported — ignore */
    }
  };

  // Init the GL map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      // Default basemap = the online OpenFreeMap vector style (lib/basemaps.ts).
      style: basemapStyleUrl(DEFAULT_BASEMAP_KEY),
      center: DIVISION_CENTER,
      zoom: 11.8,
      // Software / virtualized GL (SwiftShader) is accepted out of the box —
      // MapLibre's WebGL2 context defaults to failIfMajorPerformanceCaveat:
      // false, so the map renders without a hardware GPU.
      // Free viewport — pan/zoom is NOT clamped to the forest bounds.
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // Dev / verification handle — lets automated checks drive the live map
    // (single canvas is guaranteed by the mapRef.current double-mount guard).
    if (typeof window !== "undefined") {
      (window as unknown as { __gisMap?: MapLibreMap }).__gisMap = map;
    }
    // Overlay layers are (re)built once per style load — a fallback .setStyle
    // below fires "load" again, so the flag must reset alongside it.
    let overlaysBuilt = false;
    let styleFailed = false;
    map.on("error", (e) => {
      const err = (e as { error?: unknown }).error;
      if (err instanceof AJAXError) {
        const url = /https?:\/\/[^\s)]+/.exec(err.message)?.[0] ?? err.message;
        if (url.includes("tiles.openfreemap.org")) {
          // The Atlas (OpenFreeMap) style is unreachable (offline / blocked) —
          // swap once to the neutral inline base so the operational overlays
          // still render on a flat backdrop instead of a broken map.
          if (!styleFailed) {
            styleFailed = true;
            overlaysBuilt = false;
            console.warn("Atlas style (OpenFreeMap) unreachable — using fallback base style");
            void map.setStyle(FALLBACK_BASE_STYLE, { diff: false });
          }
          return;
        }
        if (BASEMAP_TILE_HOSTS.some((h) => url.includes(h))) {
          // Provider-side refusal (403 without CORS, flaky tile hosts).
          // Log once per failing URL, then go quiet.
          if (!seenTileErrors.current.has(url)) {
            seenTileErrors.current.add(url);
            console.warn("Basemap tile unreachable:", url);
          }
          try {
            const host = new URL(url).hostname;
            const key = basemapKeyForHost(host);
            if (key) setBasemapDown(key);
          } catch { /* malformed URL — ignore */ }
          return;
        }
      }
      console.error("GL map error:", err ?? e);
    });
    map.on("load", () => {
      if (!overlaysBuilt) {
        overlaysBuilt = true;
        buildLayers(map);
      }
      setReady(true);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Feed GeoJSON data into the sources.
  const filterBeatId = regionFilter?.beatId ?? null;
  const filterCompId = regionFilter?.compId ?? null;
  const beatsFc = useMemo(
    () => beatsToFeatures(beats, selectedId, regionHover.beatId ?? null, filterBeatId),
    [beats, selectedId, regionHover.beatId, filterBeatId]
  );
  // When the dedicated SOS layer is fed, drop SOS-kind points from the
  // generic sightings/incidents layer so an alert never renders twice.
  const groundMarkers = useMemo(
    () => (sosAlerts ? (markers ?? []).filter((m) => m.kind !== "sos") : markers ?? []),
    [markers, sosAlerts]
  );
  const markersFc = useMemo(() => markersToFeatures(groundMarkers), [groundMarkers]);
  const sosAlertsFc = useMemo<GeoJSON.FeatureCollection>(
    () =>
      sosAlerts
        ? {
            type: "FeatureCollection",
            features: sosAlerts.map((a) => ({
              type: "Feature" as const,
              id: a.id,
              properties: { id: a.id, label: a.label ?? "SOS alert" },
              geometry: { type: "Point" as const, coordinates: [a.lng, a.lat] },
            })),
          }
        : emptyFc(),
    [sosAlerts]
  );
  const routesFc = useMemo(() => routesToFeatures(routes ?? []), [routes]);
  // One Point feature per patrol at its LAST recorded GPS fix, carrying the
  // same id/color as its route so a degenerate/co-located track still shows a
  // distinct, clickable marker (see gl-routes-endpoints).
  const routeEndpointsFc = useMemo<GeoFeatureCollection>(() => {
    // One Point feature per patrol at its LAST recorded GPS fix. Many routes
    // are recorded from a stationary device, so several share the same fix and
    // would stack into a single (topmost) dot. To keep every patrol visible and
    // individually clickable, co-located endpoints are fanned out into a small
    // ring around their shared fix (a pure visualization declutter — the markers
    // still carry the real patrol ids/colors and remain geo-anchored).
    const pts: {
      id: string | number | undefined;
      props: Record<string, unknown>;
      lng: number;
      lat: number;
    }[] = [];
    for (const f of routesFc.features ?? []) {
      const cc = (f.geometry as { coordinates?: unknown } | null)?.coordinates;
      if (!Array.isArray(cc) || cc.length === 0) continue;
      const coords = Array.isArray(cc[0]) ? (cc as unknown as unknown[][]) : [cc];
      const last = coords[coords.length - 1];
      if (!Array.isArray(last) || typeof last[0] !== "number" || typeof last[1] !== "number") continue;
      pts.push({ id: (f.properties?.id as string | undefined), props: { ...(f.properties ?? {}) }, lng: last[0] as number, lat: last[1] as number });
    }
    // Group by shared fix (bucketed), then fan out each multi-point group.
    const groups = new Map<string, typeof pts>();
    for (const p of pts) {
      const key = `${p.lng.toFixed(4)},${p.lat.toFixed(4)}`;
      const g = groups.get(key) ?? [];
      g.push(p);
      groups.set(key, g);
    }
    const features: GeoJSON.Feature[] = [];
    for (const group of groups.values()) {
      const cx = group.reduce((a, p) => a + p.lng, 0) / group.length;
      const cy = group.reduce((a, p) => a + p.lat, 0) / group.length;
      // Ring radius selected so the spread is visible at auto-fit zoom (~0.0006° ≈ 60m
      // on the ground) while staying tightly regional.
      const radius = group.length > 1 ? 0.0006 * (group.length > 3 ? 1.6 : 1) : 0;
      group.forEach((p, idx) => {
        let lng = p.lng, lat = p.lat;
        if (group.length > 1) {
          const ang = (2 * Math.PI * idx) / group.length;
          lat = cy + radius * Math.cos(ang);
          lng = cx + radius * Math.sin(ang) / Math.cos((cy * Math.PI) / 180);
        }
        features.push({
          type: "Feature" as const,
          id: p.id as string | number | undefined,
          properties: p.props,
          geometry: { type: "Point" as const, coordinates: [lng, lat] },
        });
      });
    }
    return { type: "FeatureCollection" as const, features };
  }, [routesFc]);
  const livePathsFc = useMemo(() => livePathsToFeatures(livePaths ?? []), [livePaths]);
  const liveRangersFc = useMemo(() => liveRangersToFeatures(liveRangers ?? []), [liveRangers]);
  const heatFc = useMemo(() => heatToFeatures(heat ?? []), [heat]);
  const rangesFc = useMemo(() => rangesToFeatures(ranges), [ranges]);
  const rangeLabelsFc = useMemo(() => rangeLabelsToFeatures(ranges), [ranges]);
  const compartmentsFc = useMemo(
    () => compartmentsToFeatures(comps, regionHover.compId ?? null, filterCompId),
    [comps, regionHover.compId, filterCompId]
  );
  const compartmentLabelsFc = useMemo(() => compartmentLabelsToFeatures(comps), [comps]);
  // Topmost hover highlight — the complete boundary of the hovered Beat or
  // Compartment, fed only to the dedicated region-hover source (see
  // buildLayers). Empty when nothing is hovered.
  const regionHoverFc = useMemo(
    () =>
      regionHoverToFeatures(
        regionHover.beatId ?? null,
        regionHover.compId ?? null,
        beats,
        comps,
        (c) => c.compId ?? null
      ),
    [regionHover.beatId, regionHover.compId, beats, comps]
  );
  // Reserved forest boundary. When the backend /boundary endpoint is empty
  // (PostGIS unavailable), derive the boundary from the REAL beat polygons
  // (edge dissolve → ST_Union-equivalent outline) so the Forest Boundary
  // layer still renders genuine geometry instead of nothing.
  const derivedBoundary = useMemo(() => boundaryFromBeats(beats), [beats]);
  const effectiveBoundary =
    boundary && boundary.length > 0 ? boundary : derivedBoundary;
  const boundaryFc = useMemo(() => boundariesToFeatures(effectiveBoundary), [effectiveBoundary]);
  const analysisGridsFc = useMemo(
    () => analysisGridsToFeatures(analysisGrids ?? [], selectedGridIds),
    [analysisGrids, selectedGridIds]
  );

  useEffect(() => {
    if (!ready) return;
    const m = mapRef.current!;
    setSourceData(m, "beats", beatsFc);
    setSourceData(m, "markers", markersFc);
    setSourceData(m, "routes", routesFc);
    setSourceData(m, "route-endpoints", routeEndpointsFc);
    setSourceData(m, "live-paths", livePathsFc);
    setSourceData(m, "live-rangers", liveRangersFc);
    setSourceData(m, "heat", heatFc);
    setSourceData(m, "ranges", rangesFc);
    setSourceData(m, "range-labels", rangeLabelsFc);
    setSourceData(m, "compartments", compartmentsFc);
    setSourceData(m, "compartment-labels", compartmentLabelsFc);
    setSourceData(m, "region-hover", regionHoverFc);
    setSourceData(m, "boundary", boundaryFc);
    setSourceData(m, "analysis-grid", analysisGridsFc);
    setSourceData(m, "sos-alerts", sosAlertsFc);

    if (!didFit.current && beatsFc.features.length > 0 && mode !== "focus") {
      didFit.current = true;
      const bounds = new LngLatBounds();
      for (const f of beatsFc.features) {
        const coords = (f.geometry as unknown as { coordinates: [number, number][][] }).coordinates[0];
        for (const c of coords) bounds.extend(c);
      }
      try {
        m.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 0 });
      } catch {
        // ignore degenerate bounds
      }
    }

    // Dev diagnostics — log the fed feature counts once per map so a fresh
    // browser session can confirm every operational feed reached the GL engine.
    if (!fedLogRef.current) {
      fedLogRef.current = true;
      const feeds: [string, number][] = [
        ["beats", beatsFc.features.length],
        ["markers", markersFc.features.length],
        ["routes", routesFc.features.length],
        ["compartments", compartmentsFc.features.length],
        ["ranges", rangesFc.features.length],
        ["boundary", boundaryFc.features.length],
        ["analysis-grid", analysisGridsFc.features.length],
      ];
      console.info("[gis] fed " + feeds.map(([id, n]) => `${id}:${n}`).join(" "));
    }
  }, [ready, beatsFc, markersFc, routesFc, routeEndpointsFc, livePathsFc, liveRangersFc, heatFc, rangesFc, rangeLabelsFc, compartmentsFc, compartmentLabelsFc, boundaryFc, analysisGridsFc, sosAlertsFc, regionHoverFc]);

  // Ops auto-fit — recentre the camera onto real operational data when a
  // user toggles Patrol Routes / Ranger Positions / Sightings / SOS. Those
  // feeds can live far from the default forest view, so without this the
  // newly-enabled layer renders off-screen and looks empty. Fits once per
  // off→on transition (tracked in didFitOps), to the union of every enabled
  // ops layer that currently carries geometry.
  useEffect(() => {
    if (!ready) return;
    const m = mapRef.current!;
    const ops: { key: string; on: boolean; fc: { features: unknown[] } }[] = [
      { key: "routes", on: layerState.routes, fc: routesFc },
      { key: "markers", on: layerState.markers, fc: markersFc },
      { key: "sos", on: layerState.sos, fc: sosAlertsFc },
      { key: "rangers", on: layerState.rangers, fc: liveRangersFc },
    ];
    const enabledWithData = ops.filter((o) => o.on && o.fc.features.length > 0);
    if (enabledWithData.length === 0) return;
    if (enabledWithData.every((o) => didFitOps.current.has(o.key))) return;

    const bounds = new LngLatBounds();
    let extended = false;
    for (const o of enabledWithData) {
      for (const f of o.fc.features as {
        geometry?: { type?: string; coordinates?: unknown };
      }[]) {
        const g = f.geometry;
        if (!g?.coordinates) continue;
        let coords: [number, number][] = [];
        if (g.type === "Point") coords = [g.coordinates as [number, number]];
        else {
          const c = g.coordinates as unknown[];
          for (const pt of c as [number, number][]) {
            if (Array.isArray(pt) && typeof pt[0] === "number" && typeof pt[1] === "number") {
              coords.push([pt[0] as number, pt[1] as number]);
            }
          }
        }
        for (const pt of coords) {
          if (typeof pt[0] !== "number" || typeof pt[1] !== "number") continue;
          bounds.extend([pt[0], pt[1]]);
          extended = true;
        }
      }
    }
    if (!extended) return;
    for (const o of enabledWithData) didFitOps.current.add(o.key);
    try {
      m.fitBounds(bounds, { padding: 72, maxZoom: 14, duration: 700 });
    } catch {
      // ignore degenerate bounds (single coincident point)
    }
  }, [ready, layerState.routes, layerState.markers, layerState.sos, layerState.rangers, routesFc, markersFc, sosAlertsFc, liveRangersFc]);

  // Layer checkbox visibility (overlay groups).
  useEffect(() => {
    if (!ready) return;
    const m = mapRef.current!;
    for (const [key, ids] of Object.entries(TOGGLE_LAYERS)) {
      const v = layerState[key as Exclude<keyof ForestLayerState, "basemap">] ? "visible" : "none";
      for (const lid of ids) {
        if (!m.getLayer(lid)) continue;
        m.setLayoutProperty(lid, "visibility", v);
      }
    }
  }, [ready, layerState]);

  // Label priority — at most one administrative hierarchy label reads at
  // a time, always the FINEST layer that is visible: the crowd on a dense map
  // comes from beat/range/boundary names overlapping compartment numbers.
  //   • Boundary label — only with boundary ON and none of ranges/beats/
  //     compartments ON (all three finer layers are hidden anyway).
  //   • Range label — only with ranges ON and beats/compartments OFF.
  //   • Beat label — whenever beats OR compartments are ON (compartment
  //     numbers can leave the beat name blank at zoom-out).
  //   • Compartment label — whenever compartments are ON.
  // Labels are NOT in TOGGLE_LAYERS (they never had their own checkbox) and
  // this effect is deliberately independent of the region filter — filtering
  // de-duplicates, it never hides a category the user asked for.
  useEffect(() => {
    if (!ready) return;
    const m = mapRef.current!;
    const rules: { lid: string; on: boolean }[] = [
      { lid: "gl-boundary-label", on: layerState.boundary && !layerState.ranges && !layerState.beats && !layerState.compartments },
      { lid: "gl-ranges-label", on: layerState.ranges && !layerState.beats && !layerState.compartments },
      { lid: "gl-beats-label", on: layerState.beats || layerState.compartments },
      { lid: "gl-compartments-label", on: layerState.compartments },
    ];
    for (const rule of rules) {
      if (!m.getLayer(rule.lid)) continue;
      m.setLayoutProperty(rule.lid, "visibility", rule.on ? "visible" : "none");
    }
  }, [ready, layerState.boundary, layerState.ranges, layerState.beats, layerState.compartments]);

  // Basemap radio — exactly one raster basemap visible; the camera is never
  // touched by a basemap switch.
  useEffect(() => {
    if (!ready) return;
    const m = mapRef.current!;
    for (const [key, lid] of Object.entries(BASEMAP_LAYER_IDS)) {
      if (!m.getLayer(lid)) continue;
      m.setLayoutProperty(lid, "visibility", key === layerState.basemap ? "visible" : "none");
    }
  }, [ready, layerState.basemap]);

  // Camera focus request ("View on Map" deep links). Applied on change only;
  // never mutates layer state.
  useEffect(() => {
    if (!ready || !focus) return;
    mapRef.current?.easeTo({
      center: [focus.lng, focus.lat],
      zoom: focus.zoom ?? 14,
      duration: 1200,
    });
  }, [ready, focus]);

  // Detail mini-map focused point — draws a single pin at the incident /
  // sighting's real-world location and fits the camera to it. Only active in
  // "focus" mode; runs once per point (not on every render).
  const didFitFocus = useRef(false);
  const prevFocusKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || mode !== "focus") return;
    const m = mapRef.current!;
    const key = focusedPoint ? `${focusedPoint.lng},${focusedPoint.lat}` : null;
    const vis = focusedPoint && key ? "visible" : "none";
    for (const lid of ["gl-focus-point", "gl-focus-point-halo"]) {
      if (!m.getLayer(lid)) continue;
      m.setLayoutProperty(lid, "visibility", vis);
    }
    const fc: GeoFeatureCollection = focusedPoint
      ? {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [focusedPoint.lng, focusedPoint.lat] },
              properties: {},
            },
          ],
        }
      : emptyFc();
    setSourceData(m, "focus-point", fc);
    if (
      key &&
      key !== prevFocusKeyRef.current &&
      !didFitFocus.current
    ) {
      prevFocusKeyRef.current = key;
      didFitFocus.current = true;
      m.easeTo({ center: [focusedPoint!.lng, focusedPoint!.lat], zoom: 14, duration: 700 });
    }
  }, [ready, mode, focusedPoint]);

  // Region filter (Range → Beat → Compartment; division is fixed context).
  useEffect(() => {
    if (!ready) return;
    const m = mapRef.current!;
    const expr = regionFilterExpression(regionFilter);
    for (const lid of REGION_FILTERED_LAYERS) {
      if (!m.getLayer(lid)) continue;
      m.setFilter(lid, expr);
    }
  }, [ready, regionFilter]);

  // Region filter camera fit — selecting a Range / Beat / Compartment from
  // GIS filters must actually narrow the visible map to that entity (not just
  // change dropdown values). Re-fits whenever `key` changes so re-selecting
  // the same bounds still animates; free navigation otherwise untouched.
  useEffect(() => {
    if (!ready || !fitRequest) return;
    const m = mapRef.current!;
    try {
      m.fitBounds(
        [
          [fitRequest.west, fitRequest.south],
          [fitRequest.east, fitRequest.north],
        ],
        { padding: 64, maxZoom: 14, duration: 900 }
      );
    } catch {
      // ignore degenerate bounds
    }
  }, [ready, fitRequest]);

  // Feature pick + hover cursor (incl. analysis-grid click/hover).
  useEffect(() => {
    if (!ready) return;
    const m = mapRef.current!;
    const clickable = [...CLICKABLE];
    const gridLayers = ["gl-agrid-fill"];
    let hoveredGridId: string | null = null;
    const clearGridHover = () => {
      if (hoveredGridId !== null) {
        hoveredGridId = null;
        setGridTooltip(null);
        onGridHover?.(null);
      }
    };
    const onMove = (e: MapMouseEvent) => {
      // The Analysis Grid is a VISUAL overlay — it must never preempt the
      // administrative or operations layers, so grid hover/tooltip is only
      // reached after beat/compartment/range and operations features have had
      // their turn. Order: operations hover-card → region (beat/compartment)
      // yellow highlight → grid tooltip last.
      const hoverHit = m.queryRenderedFeatures(e.point, { layers: HOVER_LAYERS })[0];
      if (hoverHit) {
        clearGridHover();
        const rect = m.getContainer().getBoundingClientRect();
        setHoverCard(
          hoverCardFromProps(hoverHit.properties ?? {}, {
            x: e.point.x,
            y: e.point.y,
            alignRight: e.point.x > rect.width - 250,
            alignBottom: e.point.y > rect.height - 240,
          })
        );
        m.getCanvas().style.cursor = "pointer";
        return;
      }
      setHoverCard(null);
      const regionHit = m.queryRenderedFeatures(e.point, {
        layers: ["gl-beats-fill", "gl-compartments-fill"],
      });
      let nextBeatId: string | undefined;
      let nextCompId: string | undefined;
      for (const f of regionHit) {
        const props = f.properties ?? {};
        if (!nextBeatId && typeof props.beatId === "string" && props.beatId) {
          nextBeatId = props.beatId;
        }
        if (!nextCompId && f.layer?.id === "gl-compartments-fill" && typeof props.compId === "string" && props.compId) {
          nextCompId = props.compId;
        }
      }
      if (nextBeatId || nextCompId) {
        clearGridHover();
        applyRegionHover({ beatId: nextBeatId, compId: nextCompId });
        m.getCanvas().style.cursor = "pointer";
        return;
      }
      applyRegionHover({});
      const gridHit = m.queryRenderedFeatures(e.point, { layers: gridLayers })[0];
      if (gridHit) {
        const id = String(gridHit.properties?.id ?? "");
        const code = String(gridHit.properties?.gridCode ?? id);
        hoveredGridId = id || null;
        setGridTooltip({ x: e.point.x, y: e.point.y, code });
        onGridHover?.(hoveredGridId);
        m.getCanvas().style.cursor = "pointer";
        return;
      }
      clearGridHover();
      const hit = m.queryRenderedFeatures(e.point, { layers: clickable });
      m.getCanvas().style.cursor = hit.length > 0 ? "pointer" : "";
    };
    const onClick = (e: MapMouseEvent) => {
      setGridTooltip(null);
      setHoverCard(null);
      onGridHover?.(null);
      // Fine-first selection — every administrative entity is individually
      // selectable and finer entities win:
      //   1) compartment (finest) → 2) beat → 3) range → 4) route/marker/SOS.
      // A compartment always sits geometrically inside a beat, and the beat /
      // range fills are painted ON TOP of the compartment fill — so a single
      // combined query returns the coarser beat/range first and a click inside
      // a compartment would select a whole beat ("a bunch of compartments
      // treated as one group"). Each layer is queried explicitly by its own
      // fill and its exact hit preferred; every compartment feature keeps its
      // own unique id, so only the clicked compartment is selected.
      const compHit = m.queryRenderedFeatures(e.point, { layers: ["gl-compartments-fill"] })[0];
      const compSel = compHit?.properties?.compId ?? compHit?.properties?.id;
      if (compSel) {
        onSelect?.(String(compSel));
        return;
      }
      const beatHit = m.queryRenderedFeatures(e.point, { layers: ["gl-beats-fill"] })[0];
      if (beatHit?.properties?.id) {
        onSelect?.(String(beatHit.properties.id));
        return;
      }
      const rangeHit = m.queryRenderedFeatures(e.point, {
        layers: ["gl-ranges-fill", "gl-ranges-outline"],
      })[0];
      if (rangeHit?.properties?.id) {
        onSelect?.(String(rangeHit.properties.id));
        return;
      }
      const hit = m.queryRenderedFeatures(e.point, { layers: clickable })[0];
      const id = hit?.properties?.id;
      if (typeof id === "string") {
        onSelect?.(id);
        return;
      }
      // Analysis Grid is a VISUAL overlay — it must never consume clicks meant
      // for forest/range/beat/compartment or operations features, so it is
      // only reached when NOTHING else was hit (e.g. sparse grid margins).
      // Grid polygons covering a real feature always let that feature win.
      const gridHit = m.queryRenderedFeatures(e.point, { layers: gridLayers })[0];
      if (gridHit) {
        const gridId = String(gridHit.properties?.id ?? "");
        if (gridId) onGridClick?.(gridId);
        return;
      }
      onSelect?.(null);
    };
    const onLeave = () => {
      clearGridHover();
      setHoverCard(null);
      applyRegionHover({});
      m.getCanvas().style.cursor = "";
    };
    const canvas = m.getCanvas();
    m.on("mousemove", onMove);
    m.on("click", onClick);
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
      m.off("mousemove", onMove);
      m.off("click", onClick);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [ready, onSelect, onGridClick, onGridHover, applyRegionHover]);

  // Replay model (real GIS route or synthesized from real lat/lng points).
  const replayRoute = useMemo<ReplayModel | undefined>(() => {
    if (!replayPatrolId) return undefined;
    const found = (routes ?? []).find(
      (r) => r.patrolId.toLowerCase() === replayPatrolId.toLowerCase()
    );
    if (found) {
      return {
        id: found.id,
        patrolId: found.patrolId,
        label: found.label,
        color: found.color,
        timed: routeToTimed(found),
      };
    }
    if (replayPoints && replayPoints.length >= 2) {
      return {
        id: `${replayPatrolId}-synth`,
        patrolId: replayPatrolId,
        label: "Recorded route",
        color: "#2E7D32",
        timed: replayPoints.map((p, i) => ({
          lon: round6(p.lng),
          lat: round6(p.lat),
          t: i / (replayPoints.length - 1),
        })),
      };
    }
    return undefined;
  }, [replayPatrolId, replayPoints, routes]);

  // Replay playback loop.
  useEffect(() => {
    if (!replayOn || !replayRoute || replayRoute.timed.length < 2) return;
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 1) {
          setReplayOn(false);
          onProgress?.(1);
          return 1;
        }
        const next = Math.min(1, p + 0.01 * replaySpeed);
        onProgress?.(next);
        return next;
      });
    }, 60);
    return () => clearInterval(id);
  }, [replayOn, replaySpeed, replayRoute, onProgress]);

  // Replay geometry + route filtering.
  useEffect(() => {
    if (!ready) return;
    const m = mapRef.current!;
    if (replayRoute) {
      const { trail, head, dots } = replayFeatures(replayRoute.timed, progress);
      setSourceData(m, "replay-trail", trail);
      setSourceData(m, "replay-head", head);
      setSourceData(m, "replay-points", dots);
      m.setFilter("gl-routes", ["==", "patrolId", replayRoute.patrolId]);
    } else {
      setSourceData(m, "replay-trail", emptyFc());
      setSourceData(m, "replay-head", emptyFc());
      setSourceData(m, "replay-points", emptyFc());
      m.setFilter("gl-routes", null);
    }
  }, [ready, replayRoute, progress]);

  // Detail mini-map patrol replay — in "focus" mode the camera fits to the
  // selected patrol's own replay trail so only that path fills the map box.
  const didFocusFitPatrol = useRef(false);
  useEffect(() => {
    if (!ready || mode !== "focus" || !replayRoute) return;
    if (didFocusFitPatrol.current) return;
    const m = mapRef.current!;
    const coords = replayRoute.timed;
    if (coords.length < 2) return;
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const p of coords) {
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
    }
    if (maxLon - minLon === 0 && maxLat - minLat === 0) return;
    didFocusFitPatrol.current = true;
    try {
      m.fitBounds(
        [
          [minLon, minLat],
          [maxLon, maxLat],
        ],
        { padding: 48, maxZoom: 16, duration: 800 }
      );
    } catch {
      // ignore degenerate bounds
    }
  }, [ready, mode, replayRoute]);

  // Detail focused patrol path — show the full route (gl-focus-path) only in
  // "focus" mode with a replay route; keep it hidden everywhere else.
  useEffect(() => {
    if (!ready) return;
    const m = mapRef.current!;
    if (!m.getLayer("gl-focus-path")) return;
    const on = mode === "focus" && !!replayRoute;
    m.setLayoutProperty("gl-focus-path", "visibility", on ? "visible" : "none");
    if (on && replayRoute && replayRoute.timed.length >= 2) {
      const coords = replayRoute.timed.map((p) => [p.lon, p.lat] as [number, number]);
      setSourceData(m, "focus-path", {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: coords },
          },
        ],
      });
    } else {
      setSourceData(m, "focus-path", emptyFc());
    }
  }, [ready, mode, replayRoute]);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-card border border-line bg-[#eef1ea] shadow-card">
      {/* Map header strip */}
      <div className="flex items-center justify-between gap-2 border-b border-line bg-white px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-ink-soft">
          <Icon name="map" size={14} className="shrink-0 text-forest-700" />
          <span className="truncate">
            {mode === "focus"
              ? "NSTR Forest — location reference · " + FOREST_CONTEXT.divisionName
              : `NSTR Forest — operational view · ${FOREST_CONTEXT.divisionName}`}
            {analysisGrids && analysisGrids.length > 0
              ? ` · ${analysisGrids.length} ${gridSizeLabel(gridSize)} grid cells`
              : ""}
          </span>
        </div>
        {mode !== "focus" && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11px] text-ink-soft">
            <Icon name="layers" size={13} className="text-forest-700" />
            Layer controls in the MAP LAYERS panel (Layers button in fullscreen)
          </span>
        )}
      </div>

      <div ref={wrapRef} className={cn("relative overflow-hidden", heightClass)}>
        <div ref={containerRef} className="h-full w-full" role="img" aria-label="Forest map with beats, patrol routes and markers" />

        {/* Honest operational status strip (counts / empty states of enabled ops layers) */}
        {statusChip && <div className="absolute left-3 top-3 z-10 max-w-[min(70%,26rem)]">{statusChip}</div>}

        {/* When a raster basemap's tile host refuses this network, show an
            honest one-line notice instead of silently showing a bare backdrop. */}
        {basemapDown === layerState.basemap && (
          <div className="absolute left-3 top-14 z-20 max-w-[min(80%,24rem)] rounded-md border border-amber-300 bg-amber-50/95 px-3 py-2 text-[11px] leading-relaxed text-amber-900 shadow-card">
            {BASEMAPS[layerState.basemap].label} imagery is unreachable from this network —
            {" "}{BASEMAPS[layerState.basemap].provider} refused tile requests.
            Switch to another basemap in the MAP LAYERS panel for a working map.
          </div>
        )}

        {/* Floating controls (app parity — top right) */}
        <div className="absolute right-3 top-3 z-10 flex flex-col gap-2">
          <MapFloatButton label="Zoom in" icon="zoomIn" onClick={() => mapRef.current?.zoomIn()} />
          <MapFloatButton label="Zoom out" icon="zoomOut" onClick={() => mapRef.current?.zoomOut()} />
          <MapFloatButton
            label="Reset bearing to North"
            icon="compass"
            onClick={() => {
              const m = mapRef.current;
              if (!m) return;
              m.easeTo({ bearing: 0, pitch: 0, duration: 800 });
            }}
          />
          <MapFloatButton
            label="Recenter division"
            icon="locate"
            onClick={() => {
              const m = mapRef.current;
              if (!m) return;
              const target = replayPoints && replayPoints.length > 0
                ? [replayPoints[replayPoints.length - 1].lng, replayPoints[replayPoints.length - 1].lat] as [number, number]
                : DIVISION_CENTER;
              m.easeTo({ center: target, zoom: 12.8, duration: 1000 });
            }}
          />
          <MapFloatButton
            label={isFull ? "Exit fullscreen" : "Full screen"}
            icon={isFull ? "minimize" : "maximize"}
            onClick={toggleFullscreen}
          />
          {isFull && (
            <MapFloatButton
              label={layersOverlayOpen ? "Hide layers panel" : "Show layers panel"}
              icon={"layers"}
              onClick={() => setLayersOverlayOpen((v) => !v)}
            />
          )}
        </div>

        {/* Layer controls overlay — appears ONLY in fullscreen, where the
            MAP LAYERS panel in the page sidebar is off-screen. */}
        {isFull && layersOverlayOpen && (
          <div className="absolute bottom-16 right-3 z-20 flex max-h-[calc(100%-9rem)] w-72 flex-col overflow-y-auto rounded-md border border-line bg-white/95 p-3 shadow-card">
            <MapLayersPanel
              layerState={layerState}
              onChange={(next) => onLayerStateChange?.(next)}
              gridSizeLabel={gridSizeLabelProp}
              gridSize={gridSize}
              onGridSizeChange={onGridSizeChange}
            />
          </div>
        )}

        {/* Legend (collapsible; reflects only the layers currently on) —
            hidden on the stripped "focus" detail mini-map. */}
        {mode !== "focus" && (
        <div className="absolute bottom-3 left-3 z-10 max-w-52 overflow-hidden rounded-md border border-line bg-white/95 shadow-card">
          <button
            onClick={() => setLegendOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-xs font-medium text-ink"
          >
            <span className="flex items-center gap-1.5">
              <Icon name="layers" size={13} className="text-forest-700" />
              Legend
            </span>
            <Icon name={legendOpen ? "chevronUp" : "chevronDown"} size={12} className="text-ink-faint" />
          </button>
          {legendOpen && (
            <div className="space-y-1 border-t border-line px-2.5 py-2 text-[11px] text-ink-soft">
              {activeLegendRows(layerState).map((row) => (
                <LegendRow key={row.label} color={row.color} label={row.label} dashed={row.dashed} isPoint={row.isPoint} />
              ))}
              <LegendRow
                color={
                  layerState.basemap === "satellite"
                    ? "#3f4a45"
                    : layerState.basemap === "street"
                      ? "#cfd6cc"
                      : layerState.basemap === "terrain"
                        ? "#d8cfae"
                        : "#e8e0cd"
                }
                isRaster
                label={`Basemap — ${BASEMAP_LABELS[layerState.basemap]}`}
              />
            </div>
          )}
        </div>
        )}

        {/* feature detail popup */}
        {detailCard && <div className="absolute bottom-3 right-3 z-10 max-w-72">{detailCard}</div>}

        {/* analysis-grid hover tooltip */}
        {gridTooltip && (
          <div
            className="pointer-events-none absolute z-20 max-w-52 rounded-md border border-line bg-white/95 px-2.5 py-1.5 text-[11px] shadow-pop"
            style={{ left: gridTooltip.x + 14, top: gridTooltip.y + 14 }}
          >
            <p className="font-mono font-medium text-ink">{gridTooltip.code}</p>
            <p className="text-ink-soft">{gridSizeLabel(gridSize)} grid cell</p>
          </div>
        )}

        {/* shared operational hover card (observations / incidents / SOS / rangers / routes) */}
        {hoverCard && (
          <div
            className="pointer-events-none absolute z-20 w-60 rounded-md border border-line bg-white/95 px-3 py-2 text-[11px] shadow-pop"
            style={{
              left: hoverCard.x,
              top: hoverCard.y,
              transform: `${hoverCard.alignRight ? "translateX(calc(-100% - 12px))" : "translateX(14px)"} ${
                hoverCard.alignBottom ? "translateY(calc(-100% - 12px))" : "translateY(14px)"
              }`,
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">{hoverCard.tag}</p>
            <p className="truncate text-xs font-semibold text-ink" title={hoverCard.title}>{hoverCard.title}</p>
            <dl className="mt-1 space-y-0.5">
              {hoverCard.rows.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-2">
                  <dt className="shrink-0 text-ink-soft">{k}</dt>
                  <dd className="truncate text-right font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* replay controls — only when a patrol is selected */}
        {replayRoute && layerState.routes && (
          <div className="absolute bottom-3 left-1/2 z-10 flex w-[min(560px,90%)] -translate-x-1/2 items-center gap-3 rounded-lg border border-line bg-white/95 px-3 py-2 shadow-pop">
            <button
              onClick={() => setReplayOn((v) => !v)}
              aria-label={replayOn ? "Pause replay" : "Play replay"}
              className="flex size-8 items-center justify-center rounded-full bg-forest-800 text-white hover:bg-forest-700"
            >
              <Icon name={replayOn ? "pause" : "play"} size={14} />
            </button>
            <span className="text-xs font-medium text-ink">{replayRoute.label}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(progress * 100)}
              onChange={(e) => {
                setReplayOn(false);
                setProgress(Number(e.target.value) / 100);
                onProgress?.(Number(e.target.value) / 100);
              }}
              className="min-w-0 flex-1 accent-forest-800"
              aria-label="Replay position"
            />
            <select
              value={replaySpeed}
              onChange={(e) => setReplaySpeed(Number(e.target.value))}
              className="rounded border border-line bg-white px-1 py-0.5 text-xs text-ink"
              aria-label="Replay speed"
            >
              {[0.5, 1, 2, 4].map((s) => (
                <option key={s} value={s}>{s}×</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

const BASEMAP_LABELS: Record<BasemapKey, string> = {
  atlas: "Atlas (online)",
  street: "Street (OSM)",
  terrain: "Terrain (OpenTopoMap)",
  satellite: "Satellite (Sentinel-2)",
};

/** Legend rows for the layers that are currently switched ON — colors match
 *  the GL paint exactly, so the legend never describes a hidden layer. */
function activeLegendRows(s: ForestLayerState): { color: string; label: string; dashed?: boolean; isPoint?: boolean }[] {
  const rows: { color: string; label: string; dashed?: boolean; isPoint?: boolean }[] = [];
  if (s.boundary) rows.push({ color: "#DC2626", label: "Forest boundary" });
  if (s.ranges) rows.push({ color: "#FF1493", label: "Range boundary" });
  if (s.beats) rows.push({ color: "#E65100", label: "Beat boundary" });
  if (s.compartments) rows.push({ color: "#38BDF8", label: "Compartment boundary", dashed: true });
  if (s.routes) {
    rows.push({ color: "#FF8F00", label: "Live patrol route (active patrol)" });
    rows.push({ color: "#2E7D32", label: "Patrol route" });
    rows.push({ color: "#2E7BF6", label: "Replay track", isPoint: false });
  }
  if (s.rangers) {
    rows.push({ color: "#FF8F00", label: "Ranger position — live GPS", isPoint: true });
  }
  if (s.markers) {
    rows.push({ color: "#B3261E", label: "Observation / sighting", isPoint: true });
    rows.push({ color: "#FF8F00", label: "Incident marker", isPoint: true });
  }
  if (s.sos) rows.push({ color: "#B3261E", label: "SOS alert (live feed)", isPoint: true });
  if (s.zeropatrol) rows.push({ color: "#B3261E", label: "Zero patrol zone", dashed: true });
  if (s.coverage) {
    rows.push({ color: "#2E7D32", label: "Patrol coverage (per-beat tint)" });
  }
  if (s.analysisGrid) {
    rows.push({ color: "#8a8f98", label: "Analysis grid cell" });
    rows.push({ color: "#0E4C92", label: "Analysis grid — selected" });
  }
  if (s.heat) rows.push({ color: "#B3261E", label: "Danger heat block" });
  return rows;
}

function MapFloatButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: "zoomIn" | "zoomOut" | "compass" | "locate" | "maximize" | "minimize" | "layers";
  onClick(): void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="pointer-events-auto flex size-9 items-center justify-center rounded-full border border-line bg-white/95 text-forest-800 shadow-card transition hover:bg-forest-50"
    >
      <Icon name={icon} size={17} />
    </button>
  );
}

function LegendRow({
  color,
  label,
  dashed = false,
  isPoint = false,
  isRaster = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
  isPoint?: boolean;
  isRaster?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {isPoint ? (
        <span className="size-2.5 shrink-0 rounded-full border border-white" style={{ background: color }} />
      ) : isRaster ? (
        <span className="h-2.5 w-3 shrink-0 rounded-[2px]" style={{ background: color }} />
      ) : (
        <span
          className="h-[3px] w-4 shrink-0 rounded-full"
          style={{ background: color, backgroundImage: dashed ? undefined : undefined }}
        />
      )}
      <span className="truncate">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Side panel bits used by the GIS workspace                           */
/* ------------------------------------------------------------------ */

export function MapSidebarFacts({
  rangers = [],
  observations = [],
}: {
  rangers?: Ranger[];
  observations?: Observation[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Rangers in field</p>
        <div className="space-y-1.5">
          {rangers
            .filter((r) => r.dutyStatus === "field")
            .slice(0, 5)
            .map((r) => (
              <Link key={r.id} href={`/rangers/${r.id}`} className="flex items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-forest-50">
                <span className="size-2 rounded-full bg-forest-600" />
                <span className="text-sm text-ink">{r.name}</span>
                <span className="ml-auto text-xs text-ink-soft">{unitName(r.beat)}</span>
              </Link>
            ))}
          {rangers.filter((r) => r.dutyStatus === "field").length === 0 && (
            <p className="px-1.5 py-1 text-xs text-ink-soft">No rangers currently in field</p>
          )}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Recent observations</p>
        <div className="space-y-1.5">
          {observations.slice(0, 4).map((o) => (
            <Link key={o.id} href={`/observations/${o.id}`} className="flex items-start gap-2.5 rounded-md px-1.5 py-1 hover:bg-forest-50">
              <span
                className="mt-1 size-2.5 shrink-0 rounded-full"
                style={{ background: categoryMeta[o.category]?.color ?? "#4A6572" }}
              />
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{o.title}</span>
                <span className="block text-xs text-ink-soft">{o.code} · {unitName(o.beat)}</span>
              </span>
            </Link>
          ))}
          {observations.length === 0 && (
            <p className="px-1.5 py-1 text-xs text-ink-soft">No observations recorded yet</p>
          )}
        </div>
      </div>
    </div>
  );
}