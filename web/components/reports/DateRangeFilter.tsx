/**
 * Date range filter — quick presets plus a custom from/to picker.
 * The active selection surfaces a small "Range" summary for the report.
 */

import {
  QUICK_RANGES,
  quickRange,
  isValidRange,
  type DateRange,
} from "@/lib/reports/report-types";
import { Input } from "@/components/ui";

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange | null;
  onChange(r: DateRange | null): void;
}) {
  const activeKey = presetMatch(value);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {QUICK_RANGES.map((q) => {
          const active = activeKey === q.key;
          return (
            <button
              key={q.key}
              onClick={() => onChange(quickRange(q.key))}
              className={`h-7 rounded-full border px-2.5 text-xs font-medium ${
                active
                  ? "border-forest-800 bg-forest-800 text-white"
                  : "border-line-strong bg-white text-ink-soft hover:border-forest-600 hover:text-forest-800"
              }`}
            >
              {q.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint">From</p>
          <Input
            type="date"
            value={value?.from ?? ""}
            onChange={(e) => onChange({ from: e.target.value, to: value?.to ?? "" })}
            className="h-8 w-40"
          />
        </div>
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint">To</p>
          <Input
            type="date"
            value={value?.to ?? ""}
            onChange={(e) => onChange({ from: value?.from ?? "", to: e.target.value })}
            className="h-8 w-40"
          />
        </div>
      </div>
      {value && !isValidRange(value) && (
        <p className="text-xs text-red-600">“From” must be on or before “To”.</p>
      )}
    </div>
  );
}

/** "all" for null; a preset key when the custom range equals that preset; else "custom". */
function presetMatch(value: DateRange | null): string {
  if (!value) return "all";
  for (const q of QUICK_RANGES) {
    const r = quickRange(q.key);
    if (r && r.from === value.from && r.to === value.to) return q.key;
  }
  return "custom";
}