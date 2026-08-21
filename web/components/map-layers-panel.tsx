"use client";

/**
 * External MAP LAYERS panel (Part C) — lives OUTSIDE the map canvas.
 *
 * Every control maps to a REAL MapLibre visibility switch through
 * lib/map-layers.ts; the basemap radio swaps raster sources without moving
 * the camera. Nothing here fabricates data: toggles only change what the
 * backend-fed layers render.
 */

import {
  BASEMAP_OPTIONS,
  overlayLayerRows,
  setAllOverlays,
  type ForestLayerState,
} from "@/lib/map-layers";

export function MapLayersPanel({
  layerState,
  onChange,
  gridSizeLabel,
}: {
  layerState: ForestLayerState;
  onChange(next: ForestLayerState): void;
  /** Dynamic label for the analysis-grid row (e.g. "500 m"). */
  gridSizeLabel?: string;
}) {
  const rows = overlayLayerRows(gridSizeLabel ?? "Analysis grid");
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
        <ul className="mt-2 space-y-1">
          {rows.map((r) => (
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
            </li>
          ))}
        </ul>
      </fieldset>
    </div>
  );
}
