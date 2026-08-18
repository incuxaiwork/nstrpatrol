"use client";

/**
 * Forest MapWorkspace — the single interactive GIS map of the admin portal,
 * modeled 1:1 on the Android app's MapsScreen (mobile/.../ui/screens/MapsScreen.kt):
 *
 *   • the same raster MBTiles basemap (served by the portal /api/tiles proxy)
 *     with the Esri World Imagery satellite overlay on top,
 *   • the same GeoJSON layer model — reserve boundary, forest beats,
 *     ranges, compartments, grids, patrol routes, ranger / sighting / SOS
 *     markers, coverage tint, danger heat — every one of them toggleable
 *     from the built-in Layers checkbox panel,
 *   • the same interactive affordances: pan / zoom / rotate / tilt gestures,
 *     tap-to-select, floating controls (zoom in/out, reset bearing, recenter,
 *     fullscreen), collapsible legend and patrol-track replay.
 *
 * Shared coordinate space lives in lib/map-space.ts (backend GeoJSON →
 * lon/lat). Replaces the old static SVG map across all pages.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Map as MapLibreMap,
  NavigationControl,
  LngLatBounds,
  type MapMouseEvent,
  type ExpressionSpecification,
  type FilterSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { DEFAULT_GRID_SIZE, FOREST_CONTEXT, gridSizeLabel } from "@/lib/forest-context";
import { type BeatPolygon, type GisMarker, type GisRoute, type HeatBlock } from "@/lib/mock/gis";
import type { BoundaryPolygon, CompartmentPolygon, GridPolygon } from "@/lib/backend-adapters";
import { unitName } from "@/lib/mock/hierarchy";
import { categoryMeta } from "@/lib/mock/observations";
import type { Observation, Ranger } from "@/lib/types";
import {
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
  type TimedPoint,
} from "@/lib/map-space";

const TILE_URL = "/api/tiles/{z}/{x}/{y}";
const ESRI_SAT_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const DIVISION_CENTER: [number, number] = [79.15, 15.92];

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
  grids?: GridPolygon[];
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

/** Layer visibility state — the web counterpart of GisLayerState. */
export interface ForestLayerState {
  basemap: boolean;
  satellite: boolean;
  boundary: boolean;
  beats: boolean;
  ranges: boolean;
  compartments: boolean;
  grids: boolean;
  routes: boolean;
  rangers: boolean;
  markers: boolean;
  zeropatrol: boolean;
  coverage: boolean;
  heat: boolean;
}

export const DEFAULT_LAYER_STATE: ForestLayerState = {
  basemap: true,
  satellite: true,
  boundary: true,
  beats: true,
  ranges: true,
  compartments: true,
  grids: false,
  routes: true,
  rangers: true,
  markers: true,
  zeropatrol: true,
  coverage: false,
  heat: false,
};

const LAYER_ROWS: { key: keyof ForestLayerState; title: string; subtitle: string }[] = [
  { key: "basemap", title: "MBTiles Basemap", subtitle: "Offline raster atlas (NSTR.mbtiles)" },
  { key: "satellite", title: "Satellite Imagery", subtitle: "Esri World Imagery (online)" },
  { key: "boundary", title: "Reserve Boundary", subtitle: "Reserve outline & name label" },
  { key: "beats", title: "Forest Beat Boundaries", subtitle: "44 Markapur Division beats" },
  { key: "ranges", title: "Ranges", subtitle: "Range division outlines & labels" },
  { key: "compartments", title: "Forest Compartments", subtitle: "Compartment polygons & labels" },
  { key: "grids", title: `${gridSizeLabel(DEFAULT_GRID_SIZE)} Grid`, subtitle: "Survey grid overlay (backend cells)" },
  { key: "routes", title: "Patrol Routes", subtitle: "Recorded traces & replay track" },
  { key: "rangers", title: "Ranger Positions", subtitle: "Ranger markers on the ground" },
  { key: "markers", title: "Sightings & Incidents", subtitle: "Observation, incident & SOS points" },
  { key: "zeropatrol", title: "Zero Patrol Zones", subtitle: "Beats with no patrols (red dash)" },
  { key: "coverage", title: "Coverage Tint", subtitle: "Orange tint by patrol coverage" },
  { key: "heat", title: "Danger Heat", subtitle: "Incident heat blocks" },
];

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
  "gl-markers-ranger",
  "gl-markers-obs",
  "gl-markers-sos",
  "gl-grids-fill",
];

const TOGGLE_LAYERS: Record<keyof ForestLayerState, string[]> = {  basemap: ["gl-basemap"],
  satellite: ["gl-satellite"],
  boundary: ["gl-boundary-fill", "gl-boundary-line", "gl-boundary-label"],
  beats: ["gl-beats-fill", "gl-beats-outline", "gl-beats-label"],
  ranges: ["gl-ranges-outline", "gl-ranges-label"],
  compartments: ["gl-compartments-fill", "gl-compartments-line", "gl-compartments-label"],
  grids: ["gl-grids-fill", "gl-grids-line", "gl-grids-coverage", "gl-grids-coverage-line"],
  routes: ["gl-routes", "gl-replay-trail", "gl-replay-head"],
  rangers: ["gl-markers-ranger", "gl-markers-ranger-label"],
  markers: ["gl-markers-obs", "gl-markers-sos", "gl-markers-sos-label"],
  zeropatrol: ["gl-beats-zero-dash"],
  coverage: ["gl-beats-coverage"],
  heat: ["gl-heat"],
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
  "gl-ranges-label",
  "gl-grids-fill",
  "gl-grids-line",
  "gl-grids-coverage",
  "gl-grids-coverage-line",
];

function buildLayers(m: MapLibreMap) {
  m.addSource("tiles", {
    type: "raster",
    tiles: [TILE_URL],
    tileSize: 256,
    minzoom: 1,
    maxzoom: 16,
  });
  m.addSource("satellite", {
    type: "raster",
    tiles: [ESRI_SAT_URL],
    tileSize: 256,
    minzoom: 1,
    maxzoom: 19,
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
  ]) {
    m.addSource(id, { type: "geojson", data: emptyFc() });
  }

  // 1. Offline MBTiles basemap (app parity — the portal tile proxy).
  m.addLayer({ id: "gl-basemap", type: "raster", source: "tiles", paint: { "raster-opacity": 0.9 } });

  // 1b. Satellite imagery overlay (app parity — Esri World Imagery).
  m.addLayer({ id: "gl-satellite", type: "raster", source: "satellite", paint: { "raster-opacity": 0.9 } });

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
  // Per-cell coverage tint — data-driven layer that renders NOTHING until a
  // backend coverage aggregation API populates coverageStatus (currently
  // null for every cell → explicit "no data" state, never fabricated).
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

  // 3. Reserve boundary.
  m.addLayer({
    id: "gl-boundary-fill",
    type: "fill",
    source: "boundary",
    paint: { "fill-color": "#C3A24C", "fill-opacity": 0.08 },
  });
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
  m.addLayer({
    id: "gl-beats-coverage",
    type: "fill",
    source: "beats",
    filter: ["!=", ["get", "coveragePct"], null],
    paint: {
      "fill-color": "#FF8F00",
      "fill-opacity": [
        "interpolate",
        ["linear"],
        ["get", "coveragePct"],
        0,
        0.05,
        100,
        0.35,
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

  // 6. Beat polygons (app parity: dark-green tint + bold boundary).
  m.addLayer({
    id: "gl-beats-fill",
    type: "fill",
    source: "beats",
    paint: {
      "fill-color": [
        "case",
        ["boolean", ["get", "isZero"], false],
        "#fbeae9",
        ["case", ["boolean", ["get", "selected"], false], "#dceadc", "#1E4620"],
      ],
      "fill-opacity": 0.14,
    },
  });
  m.addLayer({
    id: "gl-auth-fill",
    type: "fill",
    source: "beats",
    filter: ["==", ["get", "isAuth"], true],
    paint: { "fill-color": "#FF8F00", "fill-opacity": 0.12 },
  });
  m.addLayer({
    id: "gl-auth-line",
    type: "line",
    source: "beats",
    filter: ["==", ["get", "isAuth"], true],
    paint: {
      "line-color": "#FF8F00",
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

  // 7. Compartments (app parity: solid amber).
  m.addLayer({
    id: "gl-compartments-fill",
    type: "fill",
    source: "compartments",
    paint: { "fill-color": "#E65100", "fill-opacity": 0.06 },
  });
  m.addLayer({
    id: "gl-compartments-line",
    type: "line",
    source: "compartments",
    paint: { "line-color": "#E65100", "line-width": 1.2, "line-opacity": 0.75 },
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
      "text-color": "#8a4b00",
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
  markers,
  routes,
  heat,
  detailCard,
  regionFilter,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const didFit = useRef(false);
  const [ready, setReady] = useState(false);

  const [layerState, setLayerState] = useState<ForestLayerState>(DEFAULT_LAYER_STATE);
  const [layersOpen, setLayersOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [isFull, setIsFull] = useState(false);

  const [replayOn, setReplayOn] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [progress, setProgress] = useState(0);

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

  const setLayer = (key: keyof ForestLayerState, value: boolean) =>
    setLayerState((s) => ({ ...s, [key]: value }));
  const setAllLayers = (value: boolean) =>
    setLayerState(
      (Object.keys(DEFAULT_LAYER_STATE) as (keyof ForestLayerState)[]).reduce(
        (acc, k) => ({ ...acc, [k]: value }),
        {} as ForestLayerState
      )
    );

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
      attributionControl: false,
      maxBounds: [
        [78.2, 14.9],
        [80.2, 17.0],
      ],
    });
    map.addControl(new NavigationControl({ showCompass: true }), "top-right");
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
  const markersFc = useMemo(() => markersToFeatures(markers ?? []), [markers]);
  const routesFc = useMemo(() => routesToFeatures(routes ?? []), [routes]);
  const heatFc = useMemo(() => heatToFeatures(heat ?? []), [heat]);
  const rangesFc = useMemo(() => rangesToFeatures(ranges), [ranges]);
  const rangeLabelsFc = useMemo(() => rangeLabelsToFeatures(ranges), [ranges]);
  const compartmentsFc = useMemo(() => compartmentsToFeatures(comps), [comps]);
  const compartmentLabelsFc = useMemo(() => compartmentLabelsToFeatures(comps), [comps]);
  const boundaryFc = useMemo(() => boundariesToFeatures(boundary ?? []), [boundary]);
  const gridsFc = useMemo(() => gridsToFeatures(grids ?? []), [grids]);

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
  }, [ready, beatsFc, markersFc, routesFc, heatFc, rangesFc, rangeLabelsFc, compartmentsFc, compartmentLabelsFc, boundaryFc, gridsFc]);

  // Layer checkbox visibility.
  useEffect(() => {
    if (!ready) return;
    const m = mapRef.current!;
    for (const [key, ids] of Object.entries(TOGGLE_LAYERS)) {
      const v = layerState[key as keyof ForestLayerState] ? "visible" : "none";
      for (const lid of ids) {
        if (!m.getLayer(lid)) continue;
        m.setLayoutProperty(lid, "visibility", v);
      }
    }
  }, [ready, layerState]);

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

  // Feature pick + hover cursor.
  useEffect(() => {
    if (!ready) return;
    const m = mapRef.current!;
    const clickable = [...CLICKABLE];
    const onMove = (e: MapMouseEvent) => {
      const hit = m.queryRenderedFeatures(e.point, { layers: clickable });
      m.getCanvas().style.cursor = hit.length > 0 ? "pointer" : "";
    };
    const onClick = (e: MapMouseEvent) => {
      const hit = m.queryRenderedFeatures(e.point, { layers: clickable })[0];
      const id = hit?.properties?.id;
      onSelect?.(typeof id === "string" ? id : null);
    };
    const onLeave = () => {
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
  }, [ready, onSelect]);

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
            {grids && grids.length > 0 ? ` · ${grids.length} grid cells` : ""}
          </span>
        </div>
        <button
          onClick={() => setLayersOpen((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition",
            layersOpen
              ? "border-forest-700 bg-forest-700 text-white"
              : "border-line bg-white text-ink hover:bg-forest-50"
          )}
        >
          <Icon name="layers" size={13} />
          <span>Layers</span>
          <Icon name={layersOpen ? "chevronUp" : "chevronDown"} size={12} />
        </button>
      </div>

      <div ref={wrapRef} className={cn("relative overflow-hidden", heightClass)}>
        <div ref={containerRef} className="h-full w-full" role="img" aria-label="Forest map with beats, patrol routes and markers" />

        {/* Layers checkbox panel */}
        {layersOpen && (
          <div className="absolute left-3 top-3 z-20 max-h-[75%] w-64 overflow-y-auto rounded-md border border-line bg-white/95 p-2 shadow-card">
            <div className="mb-1 flex items-center justify-between px-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Map layers</p>
              <div className="flex gap-1 text-[11px] font-medium text-forest-700">
                <button onClick={() => setAllLayers(true)} className="hover:underline">All</button>
                <span className="text-ink-faint">/</span>
                <button onClick={() => setAllLayers(false)} className="hover:underline">None</button>
              </div>
            </div>
            <div className="space-y-0.5">
              {LAYER_ROWS.map((row) => (
                <LayerRow
                  key={row.key}
                  title={row.title}
                  subtitle={row.subtitle}
                  checked={layerState[row.key]}
                  onChange={(v) => setLayer(row.key, v)}
                />
              ))}
            </div>
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
        </div>

        {/* Legend (collapsible, like the app) */}
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
              <LegendRow color="#1E4620" label="Forest beat boundary" />
              <LegendRow color="#E65100" label="Compartment boundary" />
              <LegendRow color="#C3A24C" dashed label="Reserve boundary" />
              <LegendRow color="#0E4C92" dashed label="Range boundary" />
              <LegendRow color="#2E7D32" label="Patrol route" />
              <LegendRow color="#1B365D" isPoint label="Ranger position" />
              <LegendRow color="#B3261E" isPoint label="Sighting / incident" />
              <LegendRow color="#FF8F00" isPoint label="SOS / alert" />
              <LegendRow color="#B3261E" dashed label="Zero patrol zone" />
              <LegendRow color="#FF8F00" dashed label="Authorization area" />
              <LegendRow color="#8a8f98" label="Survey grid" />
              <LegendRow color="#2E7D32" label="Grid covered (API)" />
              <LegendRow color="#B3261E" label="Grid uncovered (API)" />
              <LegendRow color="#5b7684" isRaster label="Satellite / offline basemap" />
            </div>
          )}
        </div>

        {/* feature detail popup */}
        {detailCard && <div className="absolute bottom-3 right-3 z-10 max-w-72">{detailCard}</div>}

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

function LayerRow({
  title,
  subtitle,
  checked,
  onChange,
}: {
  title: string;
  subtitle: string;
  checked: boolean;
  onChange(v: boolean): void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-forest-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 shrink-0 accent-forest-800"
      />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-ink">{title}</span>
        <span className="block truncate text-[10px] text-ink-soft">{subtitle}</span>
      </span>
    </label>
  );
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