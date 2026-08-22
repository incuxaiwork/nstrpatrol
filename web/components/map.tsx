"use client";

/**
 * Forest MapWorkspace — the single interactive GIS map of the admin portal,
 * modeled on the Android app's MapsScreen (mobile/.../ui/screens/MapsScreen.kt):
 *
 *   • selectable raster basemaps — the offline MBTiles atlas (served by the
 *     portal /api/tiles proxy), OpenStreetMap street tiles, Esri World
 *     Imagery satellite and OpenTopoMap terrain — switched without moving
 *     the camera,
 *   • a free viewport: pan/zoom is NOT clamped to the forest bounds,
 *   • the same GeoJSON layer model — reserve boundary, forest beats,
 *     ranges, compartments, grids, patrol routes, ranger / sighting /
 *     incident markers, the live SOS alert feed, coverage tint, danger heat
 *     — every overlay driven by the EXTERNAL layer control panel via real
 *     MapLibre visibility switches (lib/map-layers.ts),
 *   • interactive affordances: pan / zoom / rotate / tilt gestures,
 *     tap-to-select, floating controls (zoom in/out, reset bearing,
 *     recenter, fullscreen), collapsible legend and patrol-track replay.
 *
 * Shared coordinate space lives in lib/map-space.ts (backend GeoJSON →
 * lon/lat). Replaces the old static SVG map across all pages.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Map as MapLibreMap,
  LngLatBounds,
  setWorkerUrl,
  type MapMouseEvent,
  type ExpressionSpecification,
  type FilterSpecification,
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
import { cn } from "@/lib/utils";
import { DEFAULT_GRID_SIZE, FOREST_CONTEXT, gridSizeLabel, type GridSizeKey } from "@/lib/forest-context";
import { DEFAULT_LAYER_STATE, type BasemapKey, type ForestLayerState } from "@/lib/map-layers";
import { type BeatPolygon, type GisMarker, type GisRoute, type HeatBlock } from "@/lib/mock/gis";
import type { BoundaryPolygon, CompartmentPolygon, GridPolygon } from "@/lib/backend-adapters";
import type { TaggedGrid } from "@/lib/grid-regions";
import { unitName } from "@/lib/mock/hierarchy";
import { categoryMeta } from "@/lib/mock/observations";
import type { Observation, Ranger } from "@/lib/types";
import {
  analysisGridsToFeatures,
  beatsToFeatures,
  boundariesToFeatures,
  compartmentLabelsToFeatures,
  compartmentsToFeatures,
  emptyFc,
  gridsToFeatures,
  heatToFeatures,
  markersToFeatures,
  rangeLabelsToFeatures,
  rangesFromBeats,
  rangesToFeatures,
  replayFeatures,
  routeToTimed,
  routesToFeatures,
  type GridCoverageInfo,
  type TimedPoint,
} from "@/lib/map-space";

const ATLAS_TILE_URL = "/api/tiles/{z}/{x}/{y}";
const STREET_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ESRI_SAT_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const TERRAIN_TILE_URL = "https://a.tile.opentopomap.org/{z}/{x}/{y}.png";
const DIVISION_CENTER: [number, number] = [79.15, 15.92];

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
  /** "workspace" shows the full control suite (GIS page); "overview" a lighter header. */
  mode?: "overview" | "workspace";
  heightClass?: string;
  liveBeats?: BeatPolygon[];
  compartments?: CompartmentPolygon[];
  boundary?: BoundaryPolygon[];
  /** Reference backend ForestGrid cells (survey grid, ~3.3 km). */
  grids?: GridPolygon[];
  /**
   * Authoritative coverage per ForestGrid id (from GET /api/coverage/grids,
   * joined by grid id). Feeds the patrolled/unpatrolled data-driven styling
   * on the reference grid. Cells without a record keep the neutral style.
   */
  coverageById?: Record<string, GridCoverageInfo> | null;
  /** Attribute-registered analysis-grid cells (frontend-generated, configurable size). */
  analysisGrids?: TaggedGrid[];
  /** Active analysis-grid cell size (drives label + tooltip). */
  gridSize?: GridSizeKey;
  /** Analysis-grid cells currently selected (deterministic cell ids). */
  selectedGridIds?: ReadonlySet<string>;
  /** A grid cell was clicked (toggle handled by the parent). */
  onGridClick?(id: string): void;
  /** Hover entry/exit on an analysis-grid cell. */
  onGridHover?(id: string | null): void;
  markers?: GisMarker[];
  routes?: GisRoute[];
  heat?: HeatBlock[];
  selectedId?: string | null;
  onSelect?(id: string | null): void;
  replayPatrolId?: string | null;
  replayPoints?: { lat: number; lng: number }[];
  onProgress?(p: number): void;
  seekSignal?: { value: number } | null;
  detailCard?: ReactNode;
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
  "gl-beats-outline",
  "gl-compartments-fill",
  "gl-routes",
  "gl-markers-ranger",
  "gl-markers-obs",
  "gl-markers-sos",
  "gl-sos-dot",
  "gl-grids-fill",
];

/** Checkbox → GL layer ids. The basemap radio is handled separately
 *  (BASEMAP_LAYER_IDS below) because it is a single choice, not a toggle. */
const TOGGLE_LAYERS: Record<Exclude<keyof ForestLayerState, "basemap">, string[]> = {
  // NOTE: the former solid forest/beat fills (gl-boundary-fill, gl-beats-fill)
  // were removed by design — the forest renders as the plain basemap with
  // boundary OUTLINES only. Sources are untouched; do not re-add fills.
  boundary: ["gl-boundary-line", "gl-boundary-label"],
  beats: ["gl-beats-outline", "gl-beats-label", "gl-beats-coverage"],
  ranges: ["gl-ranges-outline", "gl-ranges-label"],
  compartments: ["gl-compartments-fill", "gl-compartments-line", "gl-compartments-label"],
  analysisGrid: ["gl-agrid-fill", "gl-agrid-line", "gl-agrid-label", "gl-agrid-sel-fill", "gl-agrid-sel-line"],
  grids: ["gl-grids-fill", "gl-grids-line"],
  routes: ["gl-routes", "gl-replay-trail", "gl-replay-head"],
  rangers: ["gl-markers-ranger", "gl-markers-ranger-label"],
  markers: ["gl-markers-obs"],
  sos: ["gl-markers-sos", "gl-markers-sos-label", "gl-sos-dot", "gl-sos-ring", "gl-sos-label"],
  zeropatrol: ["gl-beats-zero-dash"],
  coverage: ["gl-grids-coverage", "gl-grids-coverage-line"],
  heat: ["gl-heat"],
};

const BASEMAP_LAYER_IDS: Record<BasemapKey, string> = {
  atlas: "gl-basemap-atlas",
  street: "gl-basemap-street",
  satellite: "gl-basemap-satellite",
  terrain: "gl-basemap-terrain",
};

/** Layers whose visibility is constrained by the Range → Beat → Compartment
 *  region filter (division is fixed context, never filtered). */
const REGION_FILTERED_LAYERS = [
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
  "gl-ranges-label",
  "gl-grids-fill",
  "gl-grids-line",
  "gl-grids-coverage",
  "gl-grids-coverage-line",
  "gl-agrid-fill",
  "gl-agrid-line",
  "gl-agrid-label",
  "gl-agrid-sel-fill",
  "gl-agrid-sel-line",
];

function buildLayers(m: MapLibreMap) {
  m.addSource("tiles", {
    type: "raster",
    tiles: [ATLAS_TILE_URL],
    tileSize: 256,
    minzoom: 1,
    maxzoom: 16,
  });
  m.addSource("street", {
    type: "raster",
    tiles: [STREET_TILE_URL],
    tileSize: 256,
    minzoom: 1,
    maxzoom: 19,
    attribution: "© OpenStreetMap contributors",
  });
  m.addSource("satellite", {
    type: "raster",
    tiles: [ESRI_SAT_URL],
    tileSize: 256,
    minzoom: 1,
    maxzoom: 19,
    attribution: "Imagery © Esri",
  });
  m.addSource("terrain", {
    type: "raster",
    tiles: [TERRAIN_TILE_URL],
    tileSize: 256,
    minzoom: 1,
    maxzoom: 17,
    attribution: "© OpenTopoMap (CC-BY-SA)",
  });
  for (const id of [
    "beats",
    "markers",
    "routes",
    "heat",
    "replay-trail",
    "replay-head",
    "compartments",
    "ranges",
    "range-labels",
    "compartment-labels",
    "boundary",
    "grids",
    "analysis-grid",
    "sos-alerts",
  ]) {
    m.addSource(id, { type: "geojson", data: emptyFc() });
  }

  // 1. Basemaps — single-choice radio (lib/map-layers.ts). All four raster
  //    layers exist in the style; exactly one is visible at a time and
  //    switching never moves the camera.
  m.addLayer({ id: "gl-basemap-atlas", type: "raster", source: "tiles", paint: { "raster-opacity": 0.9 } });
  m.addLayer({
    id: "gl-basemap-street",
    type: "raster",
    source: "street",
    paint: { "raster-opacity": 1 },
    layout: { visibility: "none" },
  });
  m.addLayer({ id: "gl-basemap-satellite", type: "raster", source: "satellite", paint: { "raster-opacity": 0.92 } });
  m.addLayer({
    id: "gl-basemap-terrain",
    type: "raster",
    source: "terrain",
    paint: { "raster-opacity": 1 },
    layout: { visibility: "none" },
  });

  // 2. Survey grids — geographic grid cells from the backend GIS API.
  //    Subtle by design: lines must never overpower patrol routes, incidents,
  //    observations or forest boundaries (zoomed out → lighter/simplified,
  //    zoomed in → clearer). Geometry is the backend's real grid — this
  //    frontend never generates a second grid in the browser.
  m.addLayer({
    id: "gl-grids-fill",
    type: "fill",
    source: "grids",
    paint: { "fill-color": "#8a8f98", "fill-opacity": 0.05 },
  });
  m.addLayer({
    id: "gl-grids-line",
    type: "line",
    source: "grids",
    minzoom: 5.5,
    paint: {
      "line-color": "#8a8f98",
      "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.5, 13, 1.1, 16, 1.6],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.2, 10, 0.45, 14, 0.75],
    },
  });
  // Per-cell coverage tint — data-driven fill fed by the authoritative
  // coverage API (joined by ForestGrid id). coverageStatus ∈ covered /
  // uncovered; a cell without a coverage record stays neutral (no data).
  // Colors re-use the established GIS palette (see legend rows below).
  m.addLayer({
    id: "gl-grids-coverage",
    type: "fill",
    source: "grids",
    filter: ["!=", ["get", "coverageStatus"], null],
    paint: {
      "fill-color": [
        "case",
        ["==", ["get", "coverageStatus"], "covered"],
        "#2E7D32",
        ["==", ["get", "coverageStatus"], "uncovered"],
        "#B3261E",
        "#8a8f98",
      ],
      "fill-opacity": 0.18,
    },
  });
  m.addLayer({
    id: "gl-grids-coverage-line",
    type: "line",
    source: "grids",
    filter: ["!=", ["get", "coverageStatus"], null],
    paint: {
      "line-color": [
        "case",
        ["==", ["get", "coverageStatus"], "covered"],
        "#2E7D32",
        ["==", ["get", "coverageStatus"], "uncovered"],
        "#B3261E",
        "#8a8f98",
      ],
      "line-width": 1.6,
    },
  });

  // 3. Reserve boundary — OUTLINE ONLY. The solid polygon fill was removed
  //    deliberately so the reserve reads as normal basemap inside its
  //    boundary; the outline + label carry the extent instead.
  m.addLayer({
    id: "gl-boundary-line",
    type: "line",
    source: "boundary",
    paint: {
      "line-color": "#C3A24C",
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2.5, 14, 5],
      "line-dasharray": [6, 3],
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
      "text-color": "#8a6d1f",
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
    },
  });

  // 4. Patrol coverage tint (only beats that carry a coverage figure).
  //    Green ramp — coverage is a patrol-positive metric; orange is reserved
  //    for incident markers only.
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

  // 5. Danger heat blocks.
  m.addLayer({
    id: "gl-heat",
    type: "fill",
    source: "heat",
    paint: { "fill-color": "#B3261E", "fill-opacity": ["*", ["get", "intensity"], 0.32] },
  });

  // 6. Beat polygons — OUTLINE ONLY (app-parity dark-green boundary). The
  //    beat FILL (dark green over every beat = a solid green wash across the
  //    whole forest) was removed on purpose; zero-patrol beats keep their red
  //    dashed outline and authorized beats keep the purple highlight below.
  m.addLayer({
    id: "gl-auth-fill",
    type: "fill",
    source: "beats",
    filter: ["==", ["get", "isAuth"], true],
    paint: { "fill-color": "#7B1FA2", "fill-opacity": 0.1 },
  });
  m.addLayer({
    id: "gl-auth-line",
    type: "line",
    source: "beats",
    filter: ["==", ["get", "isAuth"], true],
    paint: {
      "line-color": "#7B1FA2",
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
        ["boolean", ["get", "isZero"], false],
        "#B3261E",
        ["case", ["boolean", ["get", "selected"], false], "#1F4626", "#1E4620"],
      ],
      "line-width": ["case", ["boolean", ["get", "selected"], false], 3, 2.2],
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
    minzoom: 8.5,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 12,
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": ["case", ["boolean", ["get", "isZero"], false], "#B3261E", "#1E4620"],
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
    },
  });

  // 7. Compartments — quiet blue-gray so amber/orange stays unique to
  //    incident markers and never competes with beats or routes.
  m.addLayer({
    id: "gl-compartments-fill",
    type: "fill",
    source: "compartments",
    paint: { "fill-color": "#5B7684", "fill-opacity": 0.05 },
  });
  m.addLayer({
    id: "gl-compartments-line",
    type: "line",
    source: "compartments",
    paint: { "line-color": "#5B7684", "line-width": 1.2, "line-opacity": 0.75 },
  });
  m.addLayer({
    id: "gl-compartments-label",
    type: "symbol",
    source: "compartment-labels",
    minzoom: 10.5,
    layout: {
      "text-field": ["get", "compNo"],
      "text-size": 10,
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#41586b",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
    },
  });

  // 8. Ranges (derived hulls of each range's beats).
  m.addLayer({
    id: "gl-ranges-outline",
    type: "line",
    source: "ranges",
    paint: {
      "line-color": ["get", "color"],
      "line-width": 2.5,
      "line-dasharray": [9, 5],
      "line-opacity": 0.9,
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
      "text-color": ["get", "color"],
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
    },
  });

  // 8b. Analysis grid — frontend-generated metric cells (configurable size).
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

  // 9. Patrol routes + playback track.
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
  m.addLayer({
    id: "gl-replay-trail",
    type: "line",
    source: "replay-trail",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#2E7D32", "line-width": 5 },
  });
  m.addLayer({
    id: "gl-replay-head",
    type: "circle",
    source: "replay-head",
    paint: { "circle-radius": 7, "circle-color": "#2E7D32", "circle-stroke-color": "#fff", "circle-stroke-width": 2 },
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
}

function setSourceData(m: MapLibreMap, id: string, data: GeoJSON.FeatureCollection) {
  const src = m.getSource(id);
  if (src && "setData" in src) (src as { setData(d: GeoJSON.FeatureCollection): void }).setData(data);
}

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
  grids,
  coverageById,
  analysisGrids,
  gridSize = DEFAULT_GRID_SIZE,
  selectedGridIds,
  onGridClick,
  onGridHover,
  markers,
  routes,
  heat,
  detailCard,
  regionFilter,
  layerState: layerStateProp,
  onLayerStateChange,
  sosAlerts,
  focus,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const didFit = useRef(false);
  const [ready, setReady] = useState(false);

  // Layer state is controlled when a panel owns it (GIS workspace); the
  // internal fallback keeps lightweight embeds working without a panel
  // (fixed defaults — no toggles without an owning panel).
  const [internalLayers] = useState<ForestLayerState>(DEFAULT_LAYER_STATE);
  const layerState = layerStateProp ?? internalLayers;
  const [legendOpen, setLegendOpen] = useState(false);
  const [isFull, setIsFull] = useState(false);

  const [replayOn, setReplayOn] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [progress, setProgress] = useState(0);

  /** Cursor-positioned tooltip for the hovered analysis-grid cell. */
  const [gridTooltip, setGridTooltip] = useState<{ x: number; y: number; code: string } | null>(null);

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
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "gl-bg", type: "background", paint: { "background-color": "#f5eedc" } }],
      },
      center: DIVISION_CENTER,
      zoom: 11.2,
      // Free viewport — pan/zoom is NOT clamped to the forest bounds.
      attributionControl: { compact: true },
    });
    map.on("error", (e) => {
      console.error("GL map error:", (e as { error?: unknown }).error ?? e);
    });
    map.on("load", () => {
      buildLayers(map);
      setReady(true);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Feed GeoJSON data into the sources.
  const beatsFc = useMemo(() => beatsToFeatures(beats, selectedId), [beats, selectedId]);
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
  const heatFc = useMemo(() => heatToFeatures(heat ?? []), [heat]);
  const rangesFc = useMemo(() => rangesToFeatures(ranges), [ranges]);
  const rangeLabelsFc = useMemo(() => rangeLabelsToFeatures(ranges), [ranges]);
  const compartmentsFc = useMemo(() => compartmentsToFeatures(comps), [comps]);
  const compartmentLabelsFc = useMemo(() => compartmentLabelsToFeatures(comps), [comps]);
  const boundaryFc = useMemo(() => boundariesToFeatures(boundary ?? []), [boundary]);
  const gridsFc = useMemo(() => gridsToFeatures(grids ?? [], coverageById), [grids, coverageById]);
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
    setSourceData(m, "heat", heatFc);
    setSourceData(m, "ranges", rangesFc);
    setSourceData(m, "range-labels", rangeLabelsFc);
    setSourceData(m, "compartments", compartmentsFc);
    setSourceData(m, "compartment-labels", compartmentLabelsFc);
    setSourceData(m, "boundary", boundaryFc);
    setSourceData(m, "grids", gridsFc);
    setSourceData(m, "analysis-grid", analysisGridsFc);
    setSourceData(m, "sos-alerts", sosAlertsFc);

    if (!didFit.current && beatsFc.features.length > 0) {
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
  }, [ready, beatsFc, markersFc, routesFc, heatFc, rangesFc, rangeLabelsFc, compartmentsFc, compartmentLabelsFc, boundaryFc, gridsFc, analysisGridsFc, sosAlertsFc]);

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
      const gridHit = m.queryRenderedFeatures(e.point, { layers: gridLayers })[0];
      if (gridHit) {
        const id = String(gridHit.properties?.id ?? "");
        if (id) onGridClick?.(id);
        return;
      }
      setGridTooltip(null);
      onGridHover?.(null);
      const hit = m.queryRenderedFeatures(e.point, { layers: clickable })[0];
      const id = hit?.properties?.id;
      onSelect?.(typeof id === "string" ? id : null);
    };
    const onLeave = () => {
      clearGridHover();
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
  }, [ready, onSelect, onGridClick, onGridHover]);

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
      const { trail, head } = replayFeatures(replayRoute.timed, progress);
      setSourceData(m, "replay-trail", trail);
      setSourceData(m, "replay-head", head);
      m.setFilter("gl-routes", ["==", "patrolId", replayRoute.patrolId]);
    } else {
      setSourceData(m, "replay-trail", emptyFc());
      setSourceData(m, "replay-head", emptyFc());
      m.setFilter("gl-routes", null);
    }
  }, [ready, replayRoute, progress]);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-card border border-line bg-[#eef1ea] shadow-card">
      {/* Map header strip */}
      <div className="flex items-center justify-between gap-2 border-b border-line bg-white px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-ink-soft">
          <Icon name="map" size={14} className="shrink-0 text-forest-700" />
          <span className="truncate">
            NSTR Forest — operational view · {FOREST_CONTEXT.divisionName}
            {analysisGrids && analysisGrids.length > 0
              ? ` · ${analysisGrids.length} ${gridSizeLabel(gridSize)} grid cells`
              : grids && grids.length > 0
                ? ` · ${grids.length} reference cells`
                : ""}
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11px] text-ink-soft">
          <Icon name="layers" size={13} className="text-forest-700" />
          Layer controls live in the MAP LAYERS panel
        </span>
      </div>

      <div ref={wrapRef} className={cn("relative overflow-hidden", heightClass)}>
        <div ref={containerRef} className="h-full w-full" role="img" aria-label="Forest map with beats, patrol routes and markers" />

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
        </div>

        {/* Legend (collapsible; reflects only the layers currently on) */}
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
  atlas: "Atlas (offline)",
  street: "Street",
  satellite: "Satellite",
  terrain: "Terrain",
};

/** Legend rows for the layers that are currently switched ON — colors match
 *  the GL paint exactly, so the legend never describes a hidden layer. */
function activeLegendRows(s: ForestLayerState): { color: string; label: string; dashed?: boolean; isPoint?: boolean }[] {
  const rows: { color: string; label: string; dashed?: boolean; isPoint?: boolean }[] = [];
  if (s.boundary) rows.push({ color: "#C3A24C", label: "Reserve boundary", dashed: true });
  if (s.beats) rows.push({ color: "#1E4620", label: "Forest beat boundary" });
  if (s.ranges) rows.push({ color: "#0E4C92", label: "Range boundary", dashed: true });
  if (s.compartments) rows.push({ color: "#5B7684", label: "Compartment boundary" });
  if (s.routes) rows.push({ color: "#2E7D32", label: "Patrol route" });
  if (s.rangers) rows.push({ color: "#1B365D", label: "Ranger position", isPoint: true });
  if (s.markers) {
    rows.push({ color: "#B3261E", label: "Observation / sighting", isPoint: true });
    rows.push({ color: "#FF8F00", label: "Incident marker", isPoint: true });
  }
  if (s.sos) rows.push({ color: "#B3261E", label: "SOS alert (live feed)", isPoint: true });
  if (s.zeropatrol) rows.push({ color: "#B3261E", label: "Zero patrol zone", dashed: true });
  if (s.coverage) {
    rows.push({ color: "#2E7D32", label: "Coverage — patrolled cell" });
    rows.push({ color: "#B3261E", label: "Coverage — unpatrolled cell" });
  }
  if (s.analysisGrid) {
    rows.push({ color: "#8a8f98", label: "Analysis grid cell" });
    rows.push({ color: "#0E4C92", label: "Analysis grid — selected" });
  }
  if (s.grids) rows.push({ color: "#8a8f98", label: "Reference grid (backend)" });
  if (s.heat) rows.push({ color: "#B3261E", label: "Danger heat block" });
  return rows;
}

function MapFloatButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: "zoomIn" | "zoomOut" | "compass" | "locate" | "maximize" | "minimize";
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