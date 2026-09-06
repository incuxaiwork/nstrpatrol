"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, LngLatBounds, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { api, type ApiBeatCoverage, type ApiIncident } from "@/lib/api";
import { basemapStyleUrl, DEFAULT_BASEMAP_KEY } from "@/lib/basemaps";

if (typeof window !== "undefined") {
  setWorkerUrl(new URL("/maplibre-gl-worker.mjs", window.location.href).href);
}

const DIVISION_CENTER: [number, number] = [79.15, 15.92];

const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "hm-bg", type: "background", paint: { "background-color": "#e8eaed" } }],
};

type HeatmapMode = "patrols" | "incidents" | "sos";

interface HeatmapMiniMapProps {
  mode: HeatmapMode;
  beats?: import("@/lib/mock/gis").BeatPolygon[]; // kept for compatibility, not used for MapLibre (fetches GeoJSON)
  boundary?: import("@/lib/backend-adapters").BoundaryPolygon[];
  beatCoverage?: ApiBeatCoverage | null;
  incidents?: ApiIncident[];
  sosPoints?: { lng: number; lat: number; id: string }[];
  heightClass?: string;
}

function emptyFc(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function incidentColor(type: string, severity?: string): string {
  switch (type) {
    case "HUMAN_IMPACT":
      return "#B3261E";
    case "ANIMAL_MORTALITY":
      return "#6D4C41";
    case "SIGHTING":
      return "#2E7D32";
    case "WATER_SOURCE":
      return "#1B365D";
    case "QUICK_CAPTURE":
      return "#B3261E";
    default:
      return severity === "HIGH" ? "#B3261E" : severity === "MEDIUM" ? "#E65100" : "#757575";
  }
}

export function HeatmapMiniMap({
  mode,
  beatCoverage,
  incidents,
  sosPoints,
  heightClass = "h-[320px]",
}: HeatmapMiniMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const didFit = useRef(false);
  const [ready, setReady] = useState(false);
  const [beatsFc, setBeatsFc] = useState<GeoJSON.FeatureCollection | null>(null);
  const [boundaryFc, setBoundaryFc] = useState<GeoJSON.FeatureCollection | null>(null);
  // Debug: log when beats load
  useEffect(() => {
    if (beatsFc) console.log(`[heatmap] beats loaded: ${beatsFc.features.length}`);
  }, [beatsFc]);

  // Fetch base geometry once — actual forest GeoJSON (lon/lat), not SVG
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [b, bd] = await Promise.all([
          api.gis.beats().catch(() => ({ type: "FeatureCollection" as const, features: [] })),
          api.gis.boundary().catch(() => ({ type: "FeatureCollection" as const, features: [] })),
        ]);
        if (!cancelled) {
          setBeatsFc(b as unknown as GeoJSON.FeatureCollection);
          setBoundaryFc(bd as unknown as GeoJSON.FeatureCollection);
        }
      } catch {
        if (!cancelled) {
          setBeatsFc(emptyFc());
          setBoundaryFc(emptyFc());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Init actual MapLibre map with real tiles — isolated instance, never touches main map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: basemapStyleUrl(DEFAULT_BASEMAP_KEY),
      center: DIVISION_CENTER,
      zoom: 10.2,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    let overlaysBuilt = false;
    let styleFailed = false;
    map.on("error", (e) => {
      const err = (e as { error?: unknown }).error as { message?: string } | undefined;
      const msg = err?.message ?? "";
      // If OpenFreeMap style/tiles unreachable, fall back to plain background so beats still show
      if (msg.includes("tiles.openfreemap.org") && !styleFailed) {
        styleFailed = true;
        overlaysBuilt = false;
        void map.setStyle(FALLBACK_STYLE, { diff: false });
      }
    });
    const onLoad = () => {
      if (!overlaysBuilt) {
        overlaysBuilt = true;
        buildLayers(map);
      }
      setReady(true);
      requestAnimationFrame(() => map.resize());
    };
    map.on("load", onLoad);
    if (map.isStyleLoaded()) setTimeout(onLoad, 0);
    return () => {
      map.off("load", onLoad);
      map.remove();
      mapRef.current = null;
      setReady(false);
      didFit.current = false;
    };
  }, []);

  function buildLayers(m: MapLibreMap) {
    m.addSource("hm-beats", { type: "geojson", data: emptyFc() });
    m.addSource("hm-boundary", { type: "geojson", data: emptyFc() });
    m.addSource("hm-incidents", { type: "geojson", data: emptyFc() });
    m.addSource("hm-sos", { type: "geojson", data: emptyFc() });

    // Forest beats — transparent base (forest as basemap), heat tints only where coverage exists
    m.addLayer({
      id: "hm-beats-fill",
      type: "fill",
      source: "hm-beats",
      paint: {
        "fill-color": [
          "case",
          ["!=", ["get", "coveragePct"], null],
          ["interpolate", ["linear"], ["get", "coveragePct"], 0, "#B3261E", 30, "#E65100", 60, "#FACC15", 80, "#4CAF50", 100, "#1B5E20"],
          "#000000",
        ],
        "fill-opacity": ["case", ["!=", ["get", "coveragePct"], null], ["case", ["==", ["get", "mode"], "patrols"], 0.55, 0.35], 0],
      },
    });
    m.addLayer({
      id: "hm-beats-line",
      type: "line",
      source: "hm-beats",
      paint: { "line-color": "#1B5E20", "line-width": 1.6, "line-opacity": 0.95 },
    });
    m.addLayer({
      id: "hm-boundary-line",
      type: "line",
      source: "hm-boundary",
      paint: { "line-color": "#DC2626", "line-width": 3, "line-opacity": 0.95 },
    });
    m.addLayer({
      id: "hm-incidents-halo",
      type: "circle",
      source: "hm-incidents",
      paint: { "circle-radius": 12, "circle-color": ["get", "color"], "circle-opacity": 0.22 },
    });
    m.addLayer({
      id: "hm-incidents-circle",
      type: "circle",
      source: "hm-incidents",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 6, 14, 10],
        "circle-color": ["get", "color"],
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 2,
        "circle-opacity": 0.95,
      },
    });
    m.addLayer({
      id: "hm-sos-halo",
      type: "circle",
      source: "hm-sos",
      paint: { "circle-radius": 18, "circle-color": "#B3261E", "circle-opacity": 0.18 },
    });
    m.addLayer({
      id: "hm-sos-circle",
      type: "circle",
      source: "hm-sos",
      paint: { "circle-radius": 10, "circle-color": "#B3261E", "circle-stroke-color": "#fff", "circle-stroke-width": 3 },
    });
  }

  function setData(id: string, data: GeoJSON.FeatureCollection) {
    const m = mapRef.current;
    if (!m) return;
    const src = m.getSource(id) as { setData?: (d: GeoJSON.FeatureCollection) => void } | undefined;
    if (src && typeof src.setData === "function") src.setData(data);
  }

  // Enrich beats with coverage + mode and fit bounds
  useEffect(() => {
    if (!ready || !beatsFc) return;
    const coverageMap = new Map<string, number | null>();
    if (beatCoverage?.rows) for (const r of beatCoverage.rows) coverageMap.set(r.beat, r.coveragePercent);
    const enriched: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: (beatsFc.features as GeoJSON.Feature[]).map((f, idx) => {
        const props = (f.properties as Record<string, unknown>) ?? {};
        const beatName = String(props.Beat ?? props.name ?? "");
        return {
          ...f,
          id: (f.id as string | number | undefined) ?? idx,
          properties: { ...props, coveragePct: coverageMap.get(beatName) ?? null, mode },
        } as GeoJSON.Feature;
      }),
    };
    setData("hm-beats", enriched);
    if (!didFit.current && enriched.features.length > 0) {
      didFit.current = true;
      const bounds = new LngLatBounds();
      for (const f of enriched.features) {
        const geom = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
        if (!geom) continue;
        const rings: number[][][] =
          geom.type === "Polygon" ? [geom.coordinates[0] as number[][]] : (geom.coordinates as number[][][][]).map((p) => p[0] as number[][]);
        for (const ring of rings) for (const c of ring) bounds.extend(c as [number, number]);
      }
      try {
        mapRef.current?.fitBounds(bounds, { padding: 28, maxZoom: 12.2, duration: 0 });
      } catch {}
    }
    if (boundaryFc) setData("hm-boundary", boundaryFc as GeoJSON.FeatureCollection);
  }, [ready, beatsFc, boundaryFc, beatCoverage, mode]);

  useEffect(() => {
    if (!ready) return;
    const pts = (incidents ?? []).filter((i) => i.latitude != null && i.longitude != null && !(i.latitude === 0 && i.longitude === 0));
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: pts.map((i) => ({
        type: "Feature" as const,
        properties: { id: i.id, color: incidentColor(i.type, i.severity) },
        geometry: { type: "Point" as const, coordinates: [i.longitude!, i.latitude!] },
      })),
    };
    setData("hm-incidents", fc);
    const vis = mode === "incidents" ? "visible" : "none";
    try {
      mapRef.current?.setLayoutProperty("hm-incidents-halo", "visibility", vis);
      mapRef.current?.setLayoutProperty("hm-incidents-circle", "visibility", vis);
    } catch {}
  }, [ready, incidents, mode]);

  useEffect(() => {
    if (!ready) return;
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: (sosPoints ?? []).map((p) => ({
        type: "Feature" as const,
        properties: { id: p.id },
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      })),
    };
    setData("hm-sos", fc);
    const vis = mode === "sos" ? "visible" : "none";
    try {
      mapRef.current?.setLayoutProperty("hm-sos-halo", "visibility", vis);
      mapRef.current?.setLayoutProperty("hm-sos-circle", "visibility", vis);
    } catch {}
  }, [ready, sosPoints, mode]);

  useEffect(() => {
    if (!containerRef.current || !mapRef.current) return;
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [ready]);

  // Fallback SVG beats for when MapLibre is still loading — ensures forest diagram is always visible
  const [svgBeats, setSvgBeats] = useState<GeoJSON.FeatureCollection | null>(null);
  useEffect(() => {
    if (beatsFc && beatsFc.features.length > 0) setSvgBeats(beatsFc);
  }, [beatsFc]);

  return (
    <div className={`relative overflow-hidden rounded-card border-2 border-forest-200 bg-white ${heightClass}`}>
      <div ref={containerRef} className="absolute inset-0 z-0 bg-zinc-100" style={{ minHeight: 320 }} />
      <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-ink shadow-card border border-line">
        {mode === "patrols" ? "Patrol coverage" : mode === "incidents" ? "Incident density" : "SOS alerts"} — actual forest map
      </div>
      {!ready && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/70">
          <span className="rounded-full bg-forest-800 px-3 py-1 text-xs text-white shadow-card">Loading actual map…</span>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
        {mode === "patrols" ? (
          <div className="rounded-md bg-white/95 px-2 py-1 text-[10px] leading-tight text-ink-soft shadow-card">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-[#1B5E20]" /> 80-100%</span>{" "}
            <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-[#4CAF50]" /> 60-80%</span>{" "}
            <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-[#FACC15]" /> 30-60%</span>{" "}
            <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-[#E65100]" /> &lt;30%</span>{" "}
            <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-[#B3261E]" /> 0%</span>{" "}
            <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-[#A5D6A7]" /> no data</span>
          </div>
        ) : mode === "incidents" ? (
          <div className="rounded-md bg-white/95 px-2 py-1 text-[10px] leading-tight text-ink-soft shadow-card">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#B3261E]" /> Human</span>{" "}
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#6D4C41]" /> Mortality</span>{" "}
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#2E7D32]" /> Sighting</span>{" "}
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#1B365D]" /> Water</span>
          </div>
        ) : (
          <div className="rounded-md bg-white/95 px-2 py-1 text-[10px] leading-tight text-ink-soft shadow-card">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#B3261E]" /> SOS</span> · live alerts with GPS
          </div>
        )}
      </div>
    </div>
  );
}
