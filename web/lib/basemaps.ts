/**
 * Basemap registry for the Forest MapWorkspace.
 *
 * THE single source of truth for every basemap the GIS page can select:
 * labels, provider, style/raster config, attribution and failure hosts all
 * live here — components (map.tsx / map-layers-panel.tsx) never scatter
 * provider URLs.
 *
 * Providers (all online HTTPS, MapLibre-compatible, open / open-access):
 *   • atlas     — OpenFreeMap vector style (Liberty) @ tiles.openfreemap.org
 *   • street    — OpenStreetMap standard raster tiles @ tile.openstreetmap.org
 *   • terrain   — OpenTopoMap topographic relief raster (contours + hillshade)
 *   • satellite — EOX Sentinel-2 cloudless mosaic (natural color), keyless
 *
 * The default base STYLE is `atlas`. street / terrain / satellite are online
 * RASTER overlays that sit above the atlas vector style when the basemap
 * radio selects them; switching only flips layer visibility — it never
 * touches the camera or the application GIS overlay sources/layers.
 *
 * Replaces the old offline "atlas" (NSTR.mbtiles served by /api/tiles) — the
 * Admin Portal web GIS has no MBTiles or /api/tiles dependency.
 */

export type BasemapKey = "atlas" | "street" | "terrain" | "satellite";

export interface BasemapDefinition {
  id: BasemapKey;
  /** Radio label shown in the MAP LAYERS panel. */
  label: string;
  /** Panel subtitle describing what the provider actually shows. */
  subtitle: string;
  /** Short provider name (used in the unreachable notice). */
  provider: string;
  /** "style" = a full MapLibre style JSON (vector); "raster" = raster overlay. */
  type: "style" | "raster";
  /** MapLibre style JSON URL (only for type === "style"). */
  styleUrl?: string;
  /** Raster XYZ tile templates (only for type === "raster"). */
  tileUrls?: string[];
  /** Provider-native maximum zoom (informational; raster layers aren't gated). */
  maxZoom?: number;
  /** Full HTML attribution required by the provider (attribution control). */
  attributionHtml: string;
  /** Short text attribution for compact UI. */
  attribution?: string;
}

export const DEFAULT_BASEMAP_KEY: BasemapKey = "atlas";

export const ATLAS_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export const ATLAS_ATTRIBUTION_HTML = "© OpenFreeMap · © OpenStreetMap contributors";

export const BASEMAPS: Record<BasemapKey, BasemapDefinition> = {
  atlas: {
    id: "atlas",
    label: "Atlas",
    subtitle: "OpenFreeMap vector (Liberty) — labels, roads & relief",
    provider: "OpenFreeMap",
    type: "style",
    styleUrl: ATLAS_STYLE_URL,
    attributionHtml: ATLAS_ATTRIBUTION_HTML,
    attribution: "© OpenFreeMap",
  },
  street: {
    id: "street",
    label: "Street",
    subtitle: "OpenStreetMap raster — roads & labels",
    provider: "OpenStreetMap",
    type: "raster",
    tileUrls: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    maxZoom: 19,
    attributionHtml: "© OpenStreetMap contributors",
    attribution: "© OpenStreetMap contributors",
  },
  terrain: {
    id: "terrain",
    label: "Terrain",
    subtitle: "OpenTopoMap topographic relief — contours & hillshade",
    provider: "OpenTopoMap",
    type: "raster",
    tileUrls: [
      "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
      "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
      "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
    ],
    maxZoom: 17,
    attributionHtml: "© OpenTopoMap (CC-BY-SA) · © OpenStreetMap contributors",
    attribution: "© OpenTopoMap (CC-BY-SA)",
  },
  satellite: {
    id: "satellite",
    label: "Satellite",
    subtitle: "Sentinel-2 cloudless (EOX) — natural-color imagery",
    provider: "EOX Sentinel-2",
    type: "raster",
    tileUrls: [
      "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg",
    ],
    maxZoom: 13,
    attributionHtml: "Contains modified Copernicus Sentinel data 2020",
    attribution: "© EOX · Copernicus Sentinel data 2020",
  },
};

/** Radio order — Atlas first (the default GIS basemap). */
export const BASEMAP_ORDER: BasemapKey[] = ["atlas", "street", "terrain", "satellite"];

export const BASEMAPS_LIST: BasemapDefinition[] = BASEMAP_ORDER.map((k) => BASEMAPS[k]);

/** Raster-overlay basemaps rendered above the atlas base style. */
export const RASTER_BASEMAPS: BasemapDefinition[] = BASEMAPS_LIST.filter((d) => d.type === "raster");

/** Host names the browser hits for basemap tiles (error-throttling set). */
export const BASEMAP_TILE_HOSTS: string[] = [
  ...new Set(
    RASTER_BASEMAPS.flatMap((d) => d.tileUrls ?? []).map((u) => new URL(u).hostname)
  ),
];

/** Map a failing tile host back to the basemap that owns it (for notices). */
export function basemapKeyForHost(host: string): BasemapKey | null {
  const h = host.toLowerCase();
  for (const d of RASTER_BASEMAPS) {
    if ((d.tileUrls ?? []).some((u) => new URL(u).hostname === h)) return d.id;
  }
  return null;
}

/**
 * Style URL that initializes the map. Atlas carries a real style JSON; the
 * raster basemaps share the atlas base style and render as overlays above it.
 */
export function basemapStyleUrl(key: BasemapKey): string {
  return BASEMAPS[key].styleUrl ?? ATLAS_STYLE_URL;
}

export const BASEMAP_OPTIONS: { key: BasemapKey; label: string; subtitle: string }[] =
  BASEMAPS_LIST.map((d) => ({ key: d.id, label: d.label, subtitle: d.subtitle }));