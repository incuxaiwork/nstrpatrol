"use client";

/**
 * GIS region filter — Range → Beat → Compartment dependent selects.
 *
 * Division is intentionally NOT part of the filter: Markapur Division is the
 * fixed top-level forest context (lib/forest-context.ts), so filtering begins
 * at Range. Changing a higher level clears invalid lower-level selections.
 * Options come from the real hierarchy register (backend GIS layers) — no
 * names are hard-coded.
 */

import { Field, Select } from "@/components/ui";
import { FOREST_CONTEXT } from "@/lib/forest-context";
import type { HierarchyTree } from "@/lib/backend-adapters";
import type { GridRegionFilter } from "@/components/map";

export interface RegionFilterProps {
  units: HierarchyTree | null | undefined;
  /** Error from the hierarchy fetch (filters disabled, API GAP shown). */
  error?: string | null;
  loading?: boolean;
  value: GridRegionFilter;
  onChange(v: GridRegionFilter): void;
}

const ALL = "__all__";

export function RegionFilter({ units, error, loading, value, onChange }: RegionFilterProps) {
  const divisionId = FOREST_CONTEXT.divisionId;

  const ranges = units?.ranges[divisionId] ?? [];
  const range = value.rangeId ?? null;
  const beats = range ? units?.beats[range] ?? [] : [];
  const beat = value.beatId ?? null;
  const comps = beat
    ? (units?.compartments ?? []).filter((c) => c.beat === beat)
    : [];

  const selectClass =
    "h-9 rounded-field border border-line-strong bg-white px-2.5 text-sm text-ink outline-none focus:border-forest-600 disabled:bg-zinc-50 disabled:text-ink-soft";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Range" id="gis-filter-range" hint="Division is fixed to Markapur Division">
        <Select
          id="gis-filter-range"
          className={selectClass}
          disabled={loading || !!error || ranges.length === 0}
          value={range ?? ALL}
          aria-label="Range filter"
          onChange={(e) => {
            const next = e.target.value === ALL ? null : e.target.value;
            onChange({ rangeId: next, beatId: null, compId: null });
          }}
        >
          <option value={ALL}>All</option>
          {ranges.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </Select>
      </Field>

      <Field label="Beat" id="gis-filter-beat">
        <Select
          id="gis-filter-beat"
          className={selectClass}
          disabled={loading || !!error || !range || beats.length === 0}
          value={beat ?? ALL}
          aria-label="Beat filter"
          onChange={(e) => {
            const next = e.target.value === ALL ? null : e.target.value;
            onChange({ rangeId: range, beatId: next, compId: null });
          }}
        >
          <option value={ALL}>All</option>
          {beats.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
      </Field>

      <Field label="Compartment" id="gis-filter-compartment">
        <Select
          id="gis-filter-compartment"
          className={selectClass}
          disabled={loading || !!error || !beat || comps.length === 0}
          value={value.compId ?? ALL}
          aria-label="Compartment filter"
          onChange={(e) => {
            const next = e.target.value === ALL ? null : e.target.value;
            onChange({ rangeId: range, beatId: beat, compId: next });
          }}
        >
          <option value={ALL}>All</option>
          {comps.map((c) => (
            <option key={c.id} value={c.id}>{c.compNo}</option>
          ))}
        </Select>
      </Field>

      {(error || loading) && (
        <p className="pb-1.5 text-xs text-ink-soft">
          {error ? "Hierarchy unavailable — filters disabled." : "Loading hierarchy…"}
        </p>
      )}
      {!error && !loading && ranges.length === 0 && (
        <p className="pb-1.5 text-xs text-ink-soft">No hierarchy data available.</p>
      )}
    </div>
  );
}