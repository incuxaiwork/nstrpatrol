/**
 * Region filter — forest hierarchy cascade: Division → Range → Beat →
 * Compartment (compartment level appears only when compartment data is
 * provided, e.g. for GIS-backed reports). Every level resets the ones
 * below it, mirroring the permission-create form.
 *
 * Compartments come from the backend GIS API when available; otherwise the
 * real compartment register (mockCompartments) is used so the filter always
 * lists the exact compartments of the division.
 */

import { mockDivisions, mockRanges, mockBeats, mockCompartments } from "@/lib/mock/hierarchy";
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
  const ranges = value.division ? mockRanges[value.division] ?? [] : [];
  const beats = value.range ? mockBeats[value.range] ?? [] : [];
  const compSource = compartments && compartments.length > 0 ? compartments : mockCompartments;
  const comps = compSource.filter((c) => {
    if (value.beat) return c.beat === value.beat;
    if (value.range) return beats.some((b) => b.id === c.beat);
    return true;
  });
  const dirty = Boolean(value.division || value.range || value.beat || value.compartment);

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
          >
            <option value="">All divisions</option>
            {mockDivisions.map((d) => (
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
            disabled={!value.division}
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
            disabled={!value.range}
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
            disabled={!value.beat || comps.length === 0}
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