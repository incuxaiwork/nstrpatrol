/**
 * Map layer control model — shared between the MapWorkspace renderer
 * (components/map.tsx) and the external MAP LAYERS panel. Kept free of any
 * maplibre-gl import so control panels stay lightweight.
 *
 * Semantics: every checkbox drives REAL MapLibre layer visibility
 * (setLayoutProperty visibility) — there are no decorative toggles. The
 * basemap is a single-choice radio (atlas / street / terrain / satellite);
 * switching it never moves the camera.
 *
 * The basemap registry lives in lib/basemaps.ts; this module re-exports the
 * shared `BasemapKey` type and the radio `BASEMAP_OPTIONS` so control panels
 * stay import-light.
 */

import type { BasemapKey } from "@/lib/basemaps";

export { BASEMAP_OPTIONS, type BasemapKey } from "@/lib/basemaps";

/**
 * Visibility state of every map layer group. The web counterpart of the
 * mobile GisLayerState. Overlay groups are independent checkboxes; `basemap`
 * is the radio selection.
 */
export interface ForestLayerState {
  basemap: BasemapKey;
  boundary: boolean;
  beats: boolean;
  ranges: boolean;
  compartments: boolean;
  analysisGrid: boolean;
  routes: boolean;
  rangers: boolean;
  markers: boolean;
  /** Dedicated SOS alert feed layer (GET /api/alerts → SOS events). */
  sos: boolean;
  zeropatrol: boolean;
  coverage: boolean;
  heat: boolean;
}

export const DEFAULT_LAYER_STATE: ForestLayerState = {
  // Atlas (OpenFreeMap online vector basemap) is the default GIS basemap —
  // it scales cleanly to every zoom. Satellite is EOX Sentinel-2 cloudless
  // (open-access, keyless — no 403 traps). Administrative boundaries and the
  // analysis grid ship OFF by default so a fresh GIS page stays clean — the
  // admin reveals them via the MAP LAYERS panel as needed.
  basemap: "atlas",
  boundary: false,
  beats: false,
  ranges: false,
  compartments: false,
  analysisGrid: false,
  routes: false,
  rangers: false,
  markers: false,
  sos: false,
  zeropatrol: false,
  coverage: false,
  heat: false,
};

/** One checkbox row of the external MAP LAYERS panel. */
export interface OverlayRow {
  key: keyof Omit<ForestLayerState, "basemap">;
  title: string;
  subtitle: string;
}

/** Panel sections: administrative boundaries, grids, then operational feeds. */
export interface OverlayGroup {
  label: string;
  rows: OverlayRow[];
}

/**
 * Grouped overlay rows for the MAP LAYERS panel. The Analysis Grid row title
 * always carries the ACTIVE cell size (never a stale hard-coded one).
 */
export function overlayGroups(gridSizeLabelStr: string): OverlayGroup[] {
  return [
    {
      label: "Forest & administrative",
      rows: [
        { key: "boundary", title: "Forest Boundary", subtitle: "Strongest boundary — solid red reserve outline & label" },
        { key: "ranges", title: "Range Boundaries", subtitle: "Vivid pink range hulls & labels" },
        { key: "beats", title: "Beat Boundaries", subtitle: "Orange beat outlines & labels — no fill" },
        { key: "compartments", title: "Compartment Boundaries", subtitle: "Bright sky-blue dashed internal lines (zoom in) & labels" },
      ],
    },
    {
      label: "Grid",
      rows: [
        { key: "analysisGrid", title: `Analysis Grid — ${gridSizeLabelStr}`, subtitle: "Configurable cells over the forest area" },
      ],
    },
    {
      label: "Operations",
      rows: [
        { key: "routes", title: "Patrol Routes", subtitle: "Recorded traces, replay track & the LIVE window of active patrols" },
        { key: "rangers", title: "Ranger Positions", subtitle: "Latest GPS fix per ranger on an ACTIVE patrol (GET /api/patrols/live)" },
        { key: "markers", title: "Sightings & Incidents", subtitle: "Observation & incident points" },
        { key: "sos", title: "SOS Alerts", subtitle: "Live emergency feed (GET /api/alerts)" },
        { key: "zeropatrol", title: "Zero Patrol Zones", subtitle: "Beats with no patrols (red dash)" },
        { key: "coverage", title: "Patrol Coverage", subtitle: "Per-beat coverage tint" },
        { key: "heat", title: "Danger Heat", subtitle: "Incident heat blocks" },
      ],
    },
  ];
}

/** Flat overlay rows (panel list order). */
export function overlayLayerRows(gridSizeLabelStr: string): OverlayRow[] {
  return overlayGroups(gridSizeLabelStr).flatMap((g) => g.rows);
}

/** Overlay keys only — Select All / Clear All must never touch the basemap radio. */
export const OVERLAY_KEYS = overlayLayerRows("").map((r) => r.key);

export function setAllOverlays(value: boolean, base: ForestLayerState): ForestLayerState {
  const next = { ...base };
  for (const k of OVERLAY_KEYS) next[k] = value;
  return next;
}
