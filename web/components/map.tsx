"use client";

/**
 * Mock GIS workspace — frontend-only SVG map renderer.
 * Replace with a real map library (e.g. MapLibre) behind a thin component
 * boundary when backend GIS data exists. Until then this renders the approved
 * layer model: basemap, beats, routes, markers, coverage, heat, zero-patrol.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import {
  gisHeat,
  gisMarkers,
  gisRoutes,
  mapBeatsRaw,
  zeroPatrolZones,
  type BeatPolygon,
} from "@/lib/mock/gis";
import { rangesFromBeats } from "@/lib/map-space";
import type { CompartmentPolygon } from "@/lib/backend-adapters";
import { unitName } from "@/lib/mock/hierarchy";
import type { MapLayerDef } from "@/lib/types";
import { mockRangers } from "@/lib/mock/people";
import { mockObservations, categoryMeta } from "@/lib/mock/observations";
import { mockAuthorizations } from "@/lib/mock/authorizations";

const VIEW = { w: 1000, h: 700 };

const markerStyle: Record<string, { color: string; icon: IconName }> = {
  ranger: { color: "#1B365D", icon: "users" },
  observation: { color: "#B3261E", icon: "binoculars" },
  patrol: { color: "#2E7D32", icon: "route" },
  incident: { color: "#FF8F00", icon: "alert" },
  sos: { color: "#B3261E", icon: "sos" },
};

export interface MapProps {
  layers?: MapLayerDef[];
  mode?: "overview" | "workspace";
  heightClass?: string;
  selectedId?: string | null;
  onSelect?(id: string | null): void;
  replayPatrolId?: string | null;
  /** Real patrol route (lat/lng) used to synthesize playback when no GIS route exists. */
  replayPoints?: { lat: number; lng: number }[];
  /** Progress of the active replay (0..1) — for timeline sync. */
  onProgress?(p: number): void;
  /** External seek: bump this value to jump the replay to a fraction. */
  seekSignal?: { key: number; value: number } | null;
  liveBeats?: BeatPolygon[];
  /** Compartment boundaries (GeoJSON → SVG polygons from the backend). */
  compartments?: CompartmentPolygon[];
  headerActions?: React.ReactNode;
  /** Popup card rendered over the map (bottom-right) when a feature is selected. */
  detailCard?: React.ReactNode;
}

export function MapWorkspace({
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
  const [zoom, setZoom] = useState(1);
  const [replayOn, setReplayOn] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [legendOpen, setLegendOpen] = useState(false);
  const beats = liveBeats ?? mapBeatsRaw;
  const ranges = useMemo(() => rangesFromBeats(beats), [beats]);
  const comps = compartments ?? [];

  const [prevSeek, setPrevSeek] = useState(seekSignal);
  if (prevSeek !== seekSignal && seekSignal) {
    setPrevSeek(seekSignal);
    setProgress(seekSignal.value);
    setReplayOn(false);
    onProgress?.(seekSignal.value);
  }

  const visible = useMemo(() => {
    const map = new Map((layers ?? []).map((l) => [l.id, l.visible]));
    return (id: string) => (layers ? (map.get(id) ?? true) : true);
  }, [layers]);

  const isZero = (b: BeatPolygon) => b.isZeroPatrol ?? zeroPatrolZones.includes(b.id);

  const replayRoute = useMemo(() => {
    if (!replayPatrolId) return undefined;
    const found = gisRoutes.find(
      (r) => r.patrolId.toLowerCase() === replayPatrolId.toLowerCase()
    );
    if (found) return found;
    if (replayPoints && replayPoints.length >= 2) {
      const svg = fitRouteToSvg(replayPoints);
      return {
        id: `${replayPatrolId}-synth`,
        patrolId: replayPatrolId,
        label: "Recorded route",
        status: "replay",
        color: "#2E7D32",
        points: svg.map((p) => `${p.x},${p.y}`).join(" "),
        timedPoints: svg.map((p, i) => ({
          x: p.x,
          y: p.y,
          t: svg.length > 1 ? i / (svg.length - 1) : 0,
        })),
      };
    }
    return undefined;
  }, [replayPatrolId, replayPoints]);

  const replaySegments = replayRoute?.timedPoints ?? [];

  const replayIndex = Math.floor(progress * Math.max(replaySegments.length - 1, 0));
  const shownPoints = replaySegments.slice(0, replayIndex + 1);

  const emitProgress = useMemo(() => {
    return (p: number) => onProgress?.(p);
  }, [onProgress]);

  useEffect(() => {
    if (!replayOn || replaySegments.length < 2) return;
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 1) {
          setReplayOn(false);
          emitProgress(1);
          return 1;
        }
        const next = Math.min(1, p + 0.01 * replaySpeed);
        emitProgress(next);
        return next;
      });
    }, 60);
    return () => clearInterval(id);
  }, [replayOn, replaySegments.length, replaySpeed, emitProgress]);

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
        {/* layer panel (header actions) — absolute so it never sizes the map */}
        {headerActions && (
          <div className="absolute left-3 top-3 z-10 max-h-[75%] w-56 overflow-y-auto rounded-md border border-line bg-white/95 p-2 shadow-card">
            {headerActions}
          </div>
        )}
        <svg
          viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Mock forest map with beats, patrol routes and markers"
        >
          <g transform={`translate(${VIEW.w / 2} ${VIEW.h / 2}) scale(${zoom}) translate(${-VIEW.w / 2} ${-VIEW.h / 2})`}>
            {/* basemap */}
            <rect x="0" y="0" width={VIEW.w} height={VIEW.h} fill="#eef1ea" />
            <path
              d="M0 60 C 200 90, 260 40, 470 110 S 760 40, 1000 90 L 1000 0 L 0 0 Z"
              fill="#d8e2d4"
            />
            <path
              d="M0 700 C 220 640, 380 720, 600 660 S 860 620, 1000 660 L 1000 700 Z"
              fill="#d4dde4"
            />
            {/* river */}
            {visible("water") && (
              <path
                d="M60 60 C 180 220, 140 420, 260 560 S 420 640, 520 700"
                fill="none"
                stroke="#9db8c9"
                strokeWidth="10"
                strokeLinecap="round"
                opacity="0.9"
              />
            )}
            {/* trails */}
            {visible("roads") && (
              <path
                d="M330 60 L 460 250 L 590 120 M100 260 L 330 470 M340 480 L 590 690 M600 480 L 900 690"
                fill="none"
                stroke="#b3a68b"
                strokeWidth="4"
                strokeDasharray="8 6"
                opacity="0.8"
              />
            )}

            {/* heatmap */}
            {visible("heat") &&
              gisHeat.map((h) => (
                <rect
                  key={`${h.x}-${h.y}`}
                  x={h.x}
                  y={h.y}
                  width={h.w}
                  height={h.h}
                  rx="8"
                  fill="#B3261E"
                  opacity={h.intensity * 0.32}
                />
              ))}

            {/* coverage tint per beat */}
            {visible("coverage") &&
              beats.map((b) => (
                <polygon
                  key={`cov-${b.id}`}
                  points={b.points}
                  fill="#FF8F00"
                  opacity={0.05 + (b.coveragePct / 100) * 0.3}
                  stroke="#FF8F00"
                  strokeOpacity="0.35"
                  strokeWidth="1"
                >
                  <title>{`${b.name} — ${b.coveragePct}% coverage`}</title>
                </polygon>
              ))}

            {/* range boundaries — dashed hull enclosing each range's beats */}
            {visible("ranges") &&
              ranges.map((r) => (
                <g key={r.id} className="pointer-events-none">
                  <polygon
                    points={r.points}
                    fill="none"
                    stroke={r.color}
                    strokeWidth="2.5"
                    strokeDasharray="9 5"
                    opacity="0.9"
                  />
                  <text
                    x={midX(r)}
                    y={midY(r)}
                    textAnchor="middle"
                    fontSize="19"
                    fontWeight="800"
                    fill={r.color}
                    paintOrder="stroke"
                    stroke="#ffffff"
                    strokeWidth="4"
                    strokeLinejoin="round"
                  >
                    {r.name}
                  </text>
                </g>
              ))}

            {/* compartment boundaries */}
            {visible("compartments") &&
              comps.map((c) => (
                <g key={c.id} className="pointer-events-none">
                  <polygon
                    points={c.points}
                    fill="#E65100"
                    opacity="0.1"
                    stroke="#E65100"
                    strokeWidth="1"
                  >
                    <title>{`Compartment ${c.compNo} · ${c.areaHa} ha · ${c.beat}`}</title>
                  </polygon>
                  <text
                    x={midX(c)}
                    y={midY(c)}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#8a4b00"
                    paintOrder="stroke"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  >
                    {c.compNo}
                  </text>
                </g>
              ))}

            {/* beat polygons */}
            {visible("beats") &&
              beats.map((b) => {
                const zero = isZero(b);
                const selected = selectedId === b.id;
                return (
                  <g key={b.id} onClick={() => onSelect?.(selected ? null : b.id)} className="cursor-pointer">
                    <polygon
                      points={b.points}
                      fill={zero ? "#fbeae9" : selected ? "#dceadc" : "#f4f6f2"}
                      stroke={zero ? "#B3261E" : selected ? "#1F4626" : "#9db0a0"}
                      strokeWidth={selected ? 2.5 : 1.2}
                      strokeDasharray={zero ? "6 4" : undefined}
                    />
                    <text
                      x={midX(b)}
                      y={midY(b)}
                      textAnchor="middle"
                      fontSize="16"
                      fontWeight="600"
                      fill={zero ? "#B3261E" : "#4a5d4f"}
                    >
                      {b.name}
                    </text>
                    <text
                      x={midX(b)}
                      y={midY(b) + 20}
                      textAnchor="middle"
                      fontSize="11"
                      fill="#7a8b7d"
                    >
                      {b.coveragePct}%
                    </text>
                  </g>
                );
              })}

            {/* zero patrol hatching */}
            {visible("zeropatrol") &&
              beats.filter(isZero).map((b) => (
                <polygon
                  key={`zp-${b.id}`}
                  points={b.points}
                  fill="none"
                  stroke="#B3261E"
                  strokeWidth="3"
                  strokeDasharray="10 6"
                  opacity="0.85"
                  className="pointer-events-none"
                >
                  <title>Zero patrol zone — no coverage in 14+ days</title>
                </polygon>
              ))}

            {/* patrol authorization areas */}
            {visible("authareas") &&
              authAreaBeats(beats).map(({ b, auth }) => (
                <g key={`auth-${b.id}`}>
                  <polygon
                    points={b.points}
                    fill="#FF8F00"
                    opacity="0.12"
                    stroke="#FF8F00"
                    strokeWidth="2.5"
                    strokeDasharray="7 5"
                    className="pointer-events-none"
                  />
                  <text
                    x={midX(b)}
                    y={midY(b)}
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight="700"
                    fill="#8a4b00"
                  >
                    AUTH
                  </text>
                  <text
                    x={midX(b)}
                    y={midY(b) + 18}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#8a4b00"
                  >
                    {auth.id}
                  </text>
                </g>
              ))}

            {/* patrol routes */}
            {visible("patrols") &&
              gisRoutes.map((r) => {
                if (replayPatrolId && r.patrolId.toLowerCase() !== replayPatrolId.toLowerCase()) return null;
                if (replayOn && replayPatrolId === r.patrolId && shownPoints.length > 1) {
                  const pts = shownPoints.map((p) => `${p.x},${p.y}`).join(" ");
                  return (
                    <g key={r.id}>
                      <polyline points={pts} fill="none" stroke={r.color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx={shownPoints[shownPoints.length - 1].x} cy={shownPoints[shownPoints.length - 1].y} r="7" fill={r.color} stroke="#fff" strokeWidth="2" />
                    </g>
                  );
                }
                return (
                  <polyline
                    key={r.id}
                    points={r.points}
                    fill="none"
                    stroke={r.color}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.85}
                  >
                    <title>{r.label}</title>
                  </polyline>
                );
              })}

            {/* markers */}
            {visible("rangers") &&
              gisMarkers
                .filter((m) => m.kind === "ranger")
                .map((m) => (
                  <g key={m.id} onClick={() => onSelect?.(m.id)} className="cursor-pointer">
                    <circle cx={m.x} cy={m.y} r="10" fill="#fff" stroke="#1B365D" strokeWidth="2.5" />
                    <text x={m.x} y={m.y + 4} textAnchor="middle" fontSize="9" fontWeight="700" fill="#1B365D">
                      {rangerCode(m.label)}
                    </text>
                    <title>{m.label}</title>
                  </g>
                ))}
            {visible("observations") &&
              gisMarkers
                .filter((m) => m.kind === "observation" || m.kind === "incident")
                .map((m) => (
                  <g key={m.id} onClick={() => onSelect?.(m.id)} className="cursor-pointer">
                    <circle cx={m.x} cy={m.y} r="8" fill={m.tone ?? markerStyle[m.kind].color} stroke="#fff" strokeWidth="2" />
                    <text x={m.x} y={m.y + 3.5} textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff">
                      {m.kind === "incident" ? "!" : "•"}
                    </text>
                    <title>{m.label}</title>
                  </g>
                ))}
            {visible("incidents") &&
              gisMarkers
                .filter((m) => m.kind === "sos")
                .map((m) => (
                  <g key={m.id} className="cursor-pointer" onClick={() => onSelect?.(m.id)}>
                    <circle cx={m.x} cy={m.y} r="12" fill="#B3261E" stroke="#fff" strokeWidth="2" />
                    <text x={m.x} y={m.y + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">
                      SOS
                    </text>
                    <title>{m.label}</title>
                  </g>
                ))}
          </g>
        </svg>

        {/* zoom controls */}
        <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-md border border-line bg-white shadow-card">
          <MapToolButton label="Zoom in" icon="zoomIn" onClick={() => setZoom((z) => Math.min(2, z + 0.2))} />
          <MapToolButton label="Zoom out" icon="zoomOut" onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))} />
          <MapToolButton label="Reset view" icon="locate" onClick={() => setZoom(1)} />
        </div>

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
              <LegendRow color="#9db8c9" label="Water body" />
            </div>
          )}
        </div>

        {/* feature detail popup */}
        {detailCard && <div className="absolute bottom-3 right-3 z-10 max-w-72">{detailCard}</div>}

        {/* replay controls */}
        {replayRoute && (
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

function MapToolButton({ label, icon, onClick }: { label: string; icon: IconName; onClick(): void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-8 items-center justify-center border-b border-line text-ink-soft last:border-0 hover:bg-forest-50 hover:text-forest-800"
    >
      <Icon name={icon} size={15} />
    </button>
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

const midX = (b: { points: string }) => {
  const xs = b.points.split(" ").map((p) => Number(p.split(",")[0]));
  return (Math.min(...xs) + Math.max(...xs)) / 2;
};
const midY = (b: { points: string }) => {
  const ys = b.points.split(" ").map((p) => Number(p.split(",")[1]));
  return (Math.min(...ys) + Math.max(...ys)) / 2;
};

const authAreaBeats = (beats: BeatPolygon[]) =>
  mockAuthorizations
    .filter((a) => a.status === "active")
    .map((auth) => ({
      auth,
      b: beats.find((b) => b.id === auth.authBeat),
    }))
    .filter((x): x is { auth: (typeof mockAuthorizations)[number]; b: BeatPolygon } => Boolean(x.b));

const rangerCode = (label: string) => {
  const m = label.match(/^([A-Z]+-\d+)/i);
  return m ? m[1] : label;
};

/**
 * Route-fit helper — maps a lat/lng polyline into the mock SVG viewBox,
 * preserving the relative shape of the route (mock map coordinate space).
 */
function fitRouteToSvg(points: { lat: number; lng: number }[]) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = Math.max(maxLat - minLat, 1e-6);
  const spanLng = Math.max(maxLng - minLng, 1e-6);
  const padX = 110;
  const padY = 90;
  const availW = VIEW.w - padX * 2;
  const availH = VIEW.h - padY * 2;
  return points.map((p) => ({
    x: Math.round(padX + ((p.lng - minLng) / spanLng) * availW),
    y: Math.round(padY + ((maxLat - p.lat) / spanLat) * availH),
  }));
}

/* ------------------------------------------------------------------ */
/* Side panel bits used by the GIS workspace                          */
/* ------------------------------------------------------------------ */

export function LayerManager({
  layers,
  onToggle,
}: {
  layers: MapLayerDef[];
  onToggle(id: string): void;
}) {
  const groups: { key: string; label: string }[] = [
    { key: "basemap", label: "Basemap" },
    { key: "activity", label: "Activity" },
    { key: "analysis", label: "Analysis" },
  ];
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.key}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{g.label}</p>
          <div className="space-y-1">
            {layers
              .filter((l) => l.group === g.key)
              .map((l) => (
                <label key={l.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-forest-50">
                  <input
                    type="checkbox"
                    checked={l.visible}
                    onChange={() => onToggle(l.id)}
                    className="size-4 accent-forest-700"
                  />
                  <span
                    className="size-2.5 rounded-sm border border-black/10"
                    style={{ background: l.color ?? "#1F4626" }}
                  />
                  <span className="flex-1 text-sm text-ink">{l.name}</span>
                </label>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MapSidebarFacts() {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Rangers in field</p>
        <div className="space-y-1.5">
          {mockRangers
            .filter((r) => r.dutyStatus === "field")
            .slice(0, 5)
            .map((r) => (
              <Link key={r.id} href={`/rangers/${r.id}`} className="flex items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-forest-50">
                <span className="size-2 rounded-full bg-forest-600" />
                <span className="text-sm text-ink">{r.name}</span>
                <span className="ml-auto text-xs text-ink-soft">{unitName(r.beat)}</span>
              </Link>
            ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Recent observations</p>
        <div className="space-y-1.5">
          {mockObservations.slice(0, 4).map((o) => (
            <Link key={o.id} href={`/observations/${o.id}`} className="flex items-start gap-2.5 rounded-md px-1.5 py-1 hover:bg-forest-50">
              <span
                className="mt-1 size-2.5 shrink-0 rounded-full"
                style={{ background: categoryMeta[o.category].color }}
              />
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{o.title}</span>
                <span className="block text-xs text-ink-soft">{o.code} · {unitName(o.beat)}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}