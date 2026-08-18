"use client";

/**
 * Fixed division context indicator (GIS Grid + Fixed Division foundation).
 *
 * Markapur Division is the FIXED top-level forest context of the Admin Web.
 * This chip is the ONE place the division is rendered as contextual
 * information — it is deliberately non-editable (no dropdown, no switcher)
 * and reads from the centralized lib/forest-context.ts config, so the name
 * is never hard-coded in dozens of components.
 */

import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { FOREST_CONTEXT } from "@/lib/forest-context";

export function DivisionContextChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-forest-200 bg-forest-50 px-2.5 py-1 text-xs font-medium text-forest-800",
        className
      )}
      title={`Fixed forest context — ${FOREST_CONTEXT.divisionName}`}
      aria-label={`Fixed forest context — ${FOREST_CONTEXT.divisionName}`}
    >
      <Icon name="map" size={13} className="shrink-0 text-forest-700" />
      <span className="truncate">{FOREST_CONTEXT.divisionName}</span>
    </span>
  );
}