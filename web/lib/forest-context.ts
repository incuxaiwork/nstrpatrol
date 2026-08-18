/**
 * Fixed forest context for the Admin Web (GIS Grid + Fixed Division
 * foundation). The Admin Portal operates on ONE division — Markapur Division —
 * as the fixed top-level forest context. Admin screens never require
 * re-selecting the division; this module is the single source of truth.
 *
 * The division id/name mirror the backend hierarchy adapter mapping
 * ("DD MARKAPUR" → d-markapur / Markapur Division) so the fixed context is
 * the same record the GIS layers come from — nothing is duplicated.
 */

export const FOREST_CONTEXT = {
  /** Backend hierarchy id for Markapur Division (see lib/backend-adapters.ts). */
  divisionId: "d-markapur",
  /** Display name of the fixed division. */
  divisionName: "Markapur Division",
} as const;

/* ------------------------------------------------------------------ */
/* Grid scale configuration                                            */
/* ------------------------------------------------------------------ */

/**
 * Grid cell size concept. The DEFAULT is 1 km × 1 km; the frontend is
 * architected so the grid-size concept is configurable (500 m / 1 km / 2 km /
 * 5 km) for a future grid API. The grid GEOMETRY always comes from the
 * backend survey grid polygons (ForestGrid); these definitions are metadata
 * consumed by the layer UI and future API calls — never used to fabricate a
 * second grid in the browser.
 */
export type GridSizeKey = "500m" | "1km" | "2km" | "5km";

export interface GridSizeDef {
  key: GridSizeKey;
  label: string;
  /** Cell edge in metres (geographic grid; not screen space). */
  meters: number;
}

export const GRID_SIZES: GridSizeDef[] = [
  { key: "500m", label: "500 m", meters: 500 },
  { key: "1km", label: "1 km", meters: 1000 },
  { key: "2km", label: "2 km", meters: 2000 },
  { key: "5km", label: "5 km", meters: 5000 },
];

export const DEFAULT_GRID_SIZE: GridSizeKey = "1km";

export function gridSizeLabel(key: GridSizeKey = DEFAULT_GRID_SIZE): string {
  return GRID_SIZES.find((g) => g.key === key)?.label ?? "1 km";
}

/* ------------------------------------------------------------------ */
/* Grid coverage states                                                */
/* ------------------------------------------------------------------ */

/**
 * Coverage state of a grid cell (conceptual model: patrol GPS track →
 * spatial intersection → grid → covered / not covered).
 *
 * No backend API exposes per-grid coverage today (GET /api/gis/grids returns
 * geometry + gridCode only), so the frontend renders "no-data" honestly and
 * never invents coverage. These states are the contract a future backend
 * coverage aggregation API can fill.
 */
export type GridCoverageStatus = "covered" | "uncovered" | "no-data";

export const GRID_COVERAGE_LABELS: Record<GridCoverageStatus, string> = {
  covered: "Covered",
  uncovered: "Uncovered",
  "no-data": "No data",
};