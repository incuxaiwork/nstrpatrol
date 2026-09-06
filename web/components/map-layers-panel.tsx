"use client";

/**
 * External MAP LAYERS panel (Part C) — lives OUTSIDE the map canvas.
 *
 * Every control maps to a REAL MapLibre visibility switch through
 * lib/map-layers.ts; the basemap radio swaps raster sources without moving
 * the camera. Nothing here fabricates data: toggles only change what the
 * backend-fed layers render.
 *
 * Sections (lib/map-layers.ts): Forest & administrative → Grid → Operations.
 * The Analysis Grid row carries an inline size selector (500 m / 1 km / 2 km
 * / 5 km) that drives the EXISTING grid generator through the page's state —
 * it never touches visibility, so Grid OFF + size change stays OFF.
 */

import {
  BASEMAP_OPTIONS,
  overlayGroups,
  setAllOverlays,
  type ForestLayerState,
} from "@/lib/map-layers";
import { GRID_SIZES, type GridSizeKey } from "@/lib/forest-context";

export function MapLayersPanel({
  layerState,
  onChange,
  gridSizeLabel,
  gridSize,
  onGridSizeChange,
}: {
  layerState: ForestLayerState;
  onChange(next: ForestLayerState): void;
  /** Active analysis-grid size label, shown in the grid row title (e.g. "1 km"). */
  gridSizeLabel?: string;
  /** Active analysis-grid size — drives the inline size selector value. */
  gridSize?: GridSizeKey;
  /**
   * Size change handler — regenerates the EXISTING analysis grid at the new
   * resolution (selection clearing is owned by the page). Omitted on
   * lightweight embeds, which then show no size selector.
   */
  onGridSizeChange?(size: GridSizeKey): void;
}) {
  const groups = overlayGroups(gridSizeLabel ?? "1 km");
  const rows = groups.flatMap((g) => g.rows);
  const allOn = rows.every((r) => layerState[r.key]);
  const allOff = rows.every((r) => !layerState[r.key]);

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Basemap
        </legend>
        <div className="mt-2 space-y-1">
          {BASEMAP_OPTIONS.map((b) => (
            <label
              key={b.key}
              title={b.subtitle}
              className={`flex cursor-pointer items-center gap-2 rounded-field border px-2.5 py-1.5 text-xs font-medium transition ${
                layerState.basemap === b.key
                  ? "border-forest-700 bg-forest-50 text-forest-800"
                  : "border-line bg-white text-ink hover:bg-surface"
              }`}
            >
              <input
                type="radio"
                name="map-basemap"
                className="accent-[var(--color-forest-700)]"
                checked={layerState.basemap === b.key}
                onChange={() => onChange({ ...layerState, basemap: b.key })}
              />
              {b.label}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
          Switching basemaps keeps the current center, zoom and bearing.
        </p>
      </fieldset>

      <fieldset className="border-t border-line pt-3">
        <div className="flex items-center justify-between">
          <legend className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Overlays
          </legend>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={allOn}
              onClick={() => onChange(setAllOverlays(true, layerState))}
              className="rounded border border-line bg-white px-1.5 py-0.5 text-[11px] font-medium text-ink transition hover:bg-forest-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Select All
            </button>
            <button
              type="button"
              disabled={allOff}
              onClick={() => onChange(setAllOverlays(false, layerState))}
              className="rounded border border-line bg-white px-1.5 py-0.5 text-[11px] font-medium text-ink transition hover:bg-forest-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear All
            </button>
          </div>
        </div>

        {groups.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? "mt-3 border-t border-line/60 pt-2.5" : "mt-2"}>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              {group.label}
            </p>
            <ul className="space-y-1">
              {group.rows.map((r) => (
                <li key={r.key}>
                  <label
                    title={r.subtitle}
                    className="flex cursor-pointer items-center justify-between rounded px-1 py-1 text-xs text-ink transition hover:bg-surface"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="accent-[var(--color-forest-700)]"
                        checked={layerState[r.key]}
                        onChange={(e) => onChange({ ...layerState, [r.key]: e.target.checked })}
                      />
                      {r.title}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`size-1.5 rounded-full ${layerState[r.key] ? "bg-forest-700" : "bg-line"}`}
                    />
                  </label>
                  {r.key === "analysisGrid" && onGridSizeChange && (
                    <div className="mb-1 ml-6 flex items-center gap-2 pb-0.5">
                      <label
                        htmlFor="panel-grid-size"
                        className="shrink-0 text-[11px] text-ink-soft"
                      >
                        Grid Size
                      </label>
                      <select
                        id="panel-grid-size"
                        value={gridSize}
                        onChange={(e) => onGridSizeChange(e.target.value as GridSizeKey)}
                        className="w-24 rounded border border-line bg-white px-1.5 py-0.5 text-[11px] font-medium text-ink"
                        aria-label="Analysis grid size"
                      >
                        {GRID_SIZES.map((g) => (
                          <option key={g.key} value={g.key}>{g.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </fieldset>
    </div>
  );
}
