"use client";

/**
 * MapLibre GL GIS workspace — the web counterpart of the Android app's
 * MapsScreen layer stack (mobile/.../ui/screens/MapsScreen.kt): the same
 * raster MBTiles basemap (served by the portal's /api/tiles proxy), the same
 * GeoJSON layer model as the SVG MapWorkspace (beats, coverage, zero-patrol,
 * auth areas, routes, markers, heat) and the same interaction affordances
 * (legend, replay, detail card). Drop-in for MapWorkspace behind MapProps.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  LngLatBounds,
  GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { MapProps } from "@/components/map";
import { gisHeat, gisMarkers, gisRoutes, mapBeatsRaw } from "@/lib/mock/gis";
import {
  beatsToFeatures,
  compartmentLabelsToFeatures,
  compartmentsToFeatures,
  emptyFc,
  heatToFeatures,
  markersToFeatures,
  rangeLabelsToFeatures,
  rangesFromBeats,
  rangesToFeatures,
  replayFeatures,
  routesToFeatures,
  routeToTimed,
  type TimedPoint,
} from "@/lib/map-space";

const TILE_URL = "/api/tiles/{z}/{x}/{y}";
const DEMO_CENTER: [number, number] = [79.15, 15.92];

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
];

function buildLayers(m: MapLibreMap) {
  m.addSource("tiles", {
    type: "raster",
    tiles: [TILE_URL],
    tileSize: 256,
    minzoom: 1,
    maxzoom: 16,
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
  ]) {
    m.addSource(id, { type: "geojson", data: emptyFc() });
  }

  m.addLayer({ id: "gl-basemap", type: "raster", source: "tiles", paint: { "raster-opacity": 0.9 } });

  m.addLayer({
    id: "gl-beats-coverage",
    type: "fill",
    source: "beats",
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
  m.addLayer({
    id: "gl-heat",
    type: "fill",
    source: "heat",
    paint: { "fill-color": "#B3261E", "fill-opacity": ["*", ["get", "intensity"], 0.32] },
  });
  m.addLayer({
    id: "gl-beats-fill",
    type: "fill",
    source: "beats",
    paint: {
      "fill-color": [
        "case",
        ["boolean", ["get", "isZero"], false],
        "#fbeae9",
        ["case", ["boolean", ["get", "selected"], false], "#dceadc", "#f4f6f2"],
      ],
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
        ["case", ["boolean", ["get", "selected"], false], "#1F4626", "#9db0a0"],
      ],
      "line-width": ["case", ["boolean", ["get", "selected"], false], 2.5, 1.2],
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
    id: "gl-compartments-fill",
    type: "fill",
    source: "compartments",
    paint: { "fill-color": "#E65100", "fill-opacity": 0.12 },
  });
  m.addLayer({
    id: "gl-compartments-line",
    type: "line",
    source: "compartments",
    paint: { "line-color": "#E65100", "line-width": 1 },
  });
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
      "text-color": ["case", ["boolean", ["get", "isZero"], false], "#B3261E", "#4a5d4f"],
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
    },
  });
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

const TOGGLE_LAYERS: Record<string, string[]> = {
  basemap: ["gl-basemap"],
  beats: ["gl-beats-fill", "gl-beats-outline", "gl-beats-label"],
  ranges: ["gl-ranges-outline", "gl-ranges-label"],
  compartments: ["gl-compartments-fill", "gl-compartments-line", "gl-compartments-label"],
  coverage: ["gl-beats-coverage"],
  heat: ["gl-heat"],
  authareas: ["gl-auth-fill", "gl-auth-line"],
  zeropatrol: ["gl-beats-zero-dash"],
  patrols: ["gl-routes", "gl-replay-trail", "gl-replay-head"],
  rangers: ["gl-markers-ranger", "gl-markers-ranger-label"],
  observations: ["gl-markers-obs"],
  incidents: ["gl-markers-sos", "gl-markers-sos-label"],
};

export function GLMapWorkspace({
  layers,
  heightClass = "h-[560px]",
  selectedId,
  onSelect,
  replayPatrolId,
  replayPoints,
  onProgress,
  seekSignal,
  liveBeats,
  compartments,
  headerActions,
  detailCard,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const didFit = useRef(false);
  const [ready, setReady] = useState(false);

  const [replayOn, setReplayOn] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [legendOpen, setLegendOpen] = useState(false);

  const beats = liveBeats ?? mapBeatsRaw;
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

  const visible = useMemo(() => {
    const map = new Map((layers ?? []).map((l) => [l.id, l.visible]));
    return (id: string) => (layers ? (map.get(id) ?? true) : true);
  }, [layers]);

  // Init the GL map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "gl-bg", type: "background", paint: { "background-color": "#eef1ea" } }],
      },
      center: DEMO_CENTER,
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
  const markersFc = useMemo(() => markersToFeatures(gisMarkers), []);
  const routesFc = useMemo(() => routesToFeatures(gisRoutes), []);
  const heatFc = useMemo(() => heatToFeatures(gisHeat), []);
  const rangesFc = useMemo(() => rangesToFeatures(ranges), [ranges]);
  const rangeLabelsFc = useMemo(() => rangeLabelsToFeatures(ranges), [ranges]);
  const compartmentsFc = useMemo(() => compartmentsToFeatures(comps), [comps]);
  const compartmentLabelsFc = useMemo(() => compartmentLabelsToFeatures(comps), [comps]);

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
  }, [ready, beatsFc, markersFc, routesFc, heatFc, rangesFc, rangeLabelsFc, compartmentsFc, compartmentLabelsFc]);

  // Layer visibility toggles.
  useEffect(() => {
    if (!ready) return;
    const m = mapRef.current!;
    for (const [toggleId, layerIds] of Object.entries(TOGGLE_LAYERS)) {
      const v = visible(toggleId) ? "visible" : "none";
      for (const lid of layerIds) {
        if (!m.getLayer(lid)) continue;
        m.setLayoutProperty(lid, "visibility", v);
      }
    }
  }, [ready, visible]);

  // Feature pick + hover cursor.
  useEffect(() => {
    if (!ready) return;
    const m = mapRef.current!;
    const clickable = CLICKABLE.filter((lid) => visible(lid.replace("gl-", "")) || true);
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
  }, [ready, onSelect, visible]);

  // Replay model (demo GIS route or synthesized from real lat/lng points).
  const replayRoute = useMemo<ReplayModel | undefined>(() => {
    if (!replayPatrolId) return undefined;
    const found = gisRoutes.find(
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
  }, [replayPatrolId, replayPoints]);

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
        <div className="flex items-center gap-2 text-xs text-ink-soft">
          <Icon name="map" size={14} className="text-forest-700" />
          <span>NSTR Forest — operational view</span>
        </div>
      </div>

      <div className={cn("relative overflow-hidden", heightClass)}>
        <div ref={containerRef} className="h-full w-full" role="img" aria-label="Forest map with beats, patrol routes and markers" />

        {/* layer panel (header actions) — absolute so it never sizes the map */}
        {headerActions && (
          <div className="absolute left-3 top-3 z-10 max-h-[75%] w-56 overflow-y-auto rounded-md border border-line bg-white/95 p-2 shadow-card">
            {headerActions}
          </div>
        )}

        {/* legend */}
        <div className="absolute bottom-3 left-3 max-w-52 overflow-hidden rounded-md border border-line bg-white/95 shadow-card">
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
              <LegendRow color="#2E7D32" label="Patrol route" />
              <LegendRow color="#1B365D" label="Ranger position" />
              <LegendRow color="#B3261E" label="Observation" />
              <LegendRow color="#FF8F00" label="Incident" />
              <LegendRow color="#B3261E" dashed label="Zero patrol zone" />
              <LegendRow color="#FF8F00" dashed label="Authorization area" />
              <LegendRow color="#0E4C92" dashed label="Range boundary" />
              <LegendRow color="#E65100" label="Compartment boundary" />
            </div>
          )}
        </div>

        {/* feature detail popup */}
        {detailCard && <div className="absolute bottom-3 right-3 z-10 max-w-72">{detailCard}</div>}

        {/* replay controls — only when the patrols layer is on and a patrol is selected */}
        {replayRoute && visible("patrols") && (
          <div className="absolute bottom-3 left-1/2 flex w-[min(560px,90%)] -translate-x-1/2 items-center gap-3 rounded-lg border border-line bg-white/95 px-3 py-2 shadow-pop">
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
                setProgress(Number(e.target.value) / 100);
                setReplayOn(false);
              }}
              aria-label="Replay progress"
              className="flex-1 accent-forest-700"
            />
            <span className="w-12 text-right text-xs tabular-nums text-ink-soft">
              {Math.round(progress * 100)}%
            </span>
            <ReplaySpeed onSpeed={setReplaySpeed} />
          </div>
        )}
      </div>
    </div>
  );
}

function setSourceData(m: MapLibreMap, id: string, data: GeoJSON.FeatureCollection) {
  if (!m.getSource(id)) return;
  (m.getSource(id) as GeoJSONSource).setData(data);
}

function ReplaySpeed({ onSpeed }: { onSpeed(s: number): void }) {
  const [speed, setSpeed] = useState(1);
  return (
    <select
      value={speed}
      onChange={(e) => {
        setSpeed(Number(e.target.value));
        onSpeed(Number(e.target.value));
      }}
      aria-label="Replay speed"
      className="rounded border border-line bg-white px-1.5 py-1 text-xs text-ink-soft"
    >
      {[1, 2, 4, 8].map((s) => (
        <option key={s} value={s}>
          {s}×
        </option>
      ))}
    </select>
  );
}

function LegendRow({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-2.5 w-5 rounded-sm"
        style={{ background: dashed ? "none" : color, border: dashed ? `2px dashed ${color}` : undefined }}
      />
      {label}
    </div>
  );
}