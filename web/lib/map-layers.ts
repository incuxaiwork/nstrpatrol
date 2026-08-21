/**
 * Map layer control model — shared between the MapWorkspace renderer
 * (components/map.tsx) and the external MAP LAYERS panel. Kept free of any
 * maplibre-gl import so control panels stay lightweight.
 *
 * Semantics: every checkbox drives REAL MapLibre layer visibility
 * (setLayoutProperty visibility) — there are no decorative toggles. The
 * basemap is a single-choice radio (atlas / street / satellite / terrain);
 * switching it never moves the camera.
 */

/** Single-choice basemap. "atlas" is the offline NSTR.mbtiles raster. */
export type BasemapKey = "atlas" | "street" | "satellite" | "terrain";

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
  grids: boolean;
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
  basemap: "satellite",
  boundary: true,
  beats: true,
  ranges: true,
  compartments: true,
  analysisGrid: true,
  grids: true,
  routes: true,
  rangers: true,
  markers: true,
  sos: true,
  zeropatrol: true,
  coverage: true,
  heat: false,
};

export const BASEMAP_OPTIONS: { key: BasemapKey; label: string; subtitle: string }[] = [
  { key: "atlas", label: "Atlas (offline)", subtitle: "NSTR.mbtiles raster atlas via the portal tile proxy" },
  { key: "street", label: "Street", subtitle: "OpenStreetMap raster tiles (online)" },
  { key: "satellite", label: "Satellite", subtitle: "Esri World Imagery (online)" },
  { key: "terrain", label: "Terrain", subtitle: "OpenTopoMap topographic relief (online)" },
];

/** Overlay checkbox rows (everything except the basemap radio). */
export function overlayLayerRows(
  gridSizeLabelStr: string
): { key: keyof Omit<ForestLayerState, "basemap">; title: string; subtitle: string }[] {
  return [
    { key: "boundary", title: "Reserve Boundary", subtitle: "Reserve outline & name label" },
    { key: "beats", title: "Forest Beat Boundaries", subtitle: "Markapur Division beat polygons" },
    { key: "ranges", title: "Ranges", subtitle: "Range outlines & labels" },
    { key: "compartments", title: "Forest Compartments", subtitle: "Compartment polygons & labels" },
    { key: "analysisGrid", title: `${gridSizeLabelStr} Analysis Grid`, subtitle: "Configurable cells over the forest area" },
    { key: "grids", title: "Reference Grid", subtitle: "Backend ForestGrid survey cells (~3.3 km)" },
    { key: "routes", title: "Patrol Routes", subtitle: "Recorded traces & replay track" },
    { key: "rangers", title: "Ranger Positions", subtitle: "Ranger markers on the ground" },
    { key: "markers", title: "Sightings & Incidents", subtitle: "Observation & incident points" },
    { key: "sos", title: "SOS Alerts", subtitle: "Live emergency feed (GET /api/alerts)" },
    { key: "zeropatrol", title: "Zero Patrol Zones", subtitle: "Beats with no patrols (red dash)" },
    { key: "coverage", title: "Patrol Coverage", subtitle: "Patrolled / unpatrolled on the reference grid" },
    { key: "heat", title: "Danger Heat", subtitle: "Incident heat blocks" },
  ];
}

/** Overlay keys only — Select All / Clear All must never touch the basemap radio. */
export const OVERLAY_KEYS = overlayLayerRows("").map((r) => r.key);

export function setAllOverlays(value: boolean, base: ForestLayerState): ForestLayerState {
  const next = { ...base };
  for (const k of OVERLAY_KEYS) next[k] = value;
  return next;
}
