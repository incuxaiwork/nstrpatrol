/**
 * Region filter — forest hierarchy cascade: Division → Range → Beat →
 * Compartment (compartment level appears only when compartment data is
 * provided, e.g. for GIS-backed reports). Every level resets the ones
 * below it, mirroring the permission-create form.
 *
 * Hierarchy + compartments come from the backend GIS API (GET /api/gis/beats,
 * /api/gis/compartments) with a mobile-derived register as offline fallback,
 * so the filter always lists the exact units/compartments of the division.
 */

"use client";

import { useAsyncData } from "@/lib/use-async";
import { hierarchy } from "@/lib/services";
import type { CompartmentPolygon } from "@/lib/backend-adapters";
import { EMPTY_REGION, type RegionSelection } from "@/lib/reports/report-types";
import { Select, Button } from "@/components/ui";

export function RegionFilter({
  value,
  onChange,
  compartments,
}: {
  value: RegionSelection;
  onChange(sel: RegionSelection): void;
  compartments?: CompartmentPolygon[];
}) {
  const units = useAsyncData(() => hierarchy.units(), []);
  const divisions = units.data?.divisions ?? [];
  const ranges = value.division ? (units.data?.ranges ?? {})[value.division] ?? [] : [];
  const beats = value.range ? (units.data?.beats ?? {})[value.range] ?? [] : [];
  const compSource =
    compartments && compartments.length > 0
      ? compartments
      : units.data?.compartments ?? [];
  const comps = compSource.filter((c) => {
    if (value.beat) return c.beat === value.beat;
    if (value.range) return beats.some((b) => b.id === c.beat);
    return true;
  });
  const dirty = Boolean(value.division || value.range || value.beat || value.compartment);
  const loading = units.loading;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint">Division</p>
          <Select
            value={value.division}
            onChange={(e) =>
              onChange({ ...EMPTY_REGION, division: e.target.value })
            }
            className="h-8"
            aria-label="Division"
            disabled={loading}
          >
            <option value="">{loading ? "Loading…" : "All divisions"}</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint">Range</p>
          <Select
            value={value.range}
            onChange={(e) =>
              onChange({ ...value, range: e.target.value, beat: "", compartment: "" })
            }
            disabled={!value.division || loading}
            className="h-8"
            aria-label="Range"
          >
            <option value="">All ranges{value.division ? "" : " (select division)"}</option>
            {ranges.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint">Beat</p>
          <Select
            value={value.beat}
            onChange={(e) =>
              onChange({ ...value, beat: e.target.value, compartment: "" })
            }
            disabled={!value.range || loading}
            className="h-8"
            aria-label="Beat"
          >
            <option value="">All beats{value.range ? "" : " (select range)"}</option>
            {beats.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint">Compartment</p>
          <Select
            value={value.compartment}
            onChange={(e) => onChange({ ...value, compartment: e.target.value })}
            disabled={!value.beat || comps.length === 0 || loading}
            className="h-8"
            aria-label="Compartment"
          >
            <option value="">
              {!value.beat
                ? "All compartments (select beat)"
                : comps.length === 0
                  ? "No compartments"
                  : "All compartments"}
            </option>
            {comps.map((c) => (
              <option key={c.id} value={c.id}>
                {c.compNo} · {c.areaHa} ha
              </option>
            ))}
          </Select>
        </div>
      </div>
      {dirty && (
        <Button variant="ghost" onClick={() => onChange({ ...EMPTY_REGION })} className="h-7 text-xs">
          Clear region
        </Button>
      )}
    </div>
  );
}