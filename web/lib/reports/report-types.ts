/**
 * Shared report-generation types and helpers — the contract used by every
 * report flow (patrols, observations, rangers, regions). All dates are
 * YYYY-MM-DD strings; times stay ISO in record data.
 */

import type { ObservationCategory } from "@/lib/types";
import { unitName } from "@/lib/mock/hierarchy";

/* ------------------------------------------------------------------ */
/* Date range                                                          */
/* ------------------------------------------------------------------ */

export interface DateRange {
  /** Inclusive, YYYY-MM-DD. */
  from: string;
  /** Inclusive, YYYY-MM-DD. */
  to: string;
}

export type QuickRangeKey =
  | "all"
  | "today"
  | "yesterday"
  | "thisWeek"
  | "thisMonth"
  | "lastMonth";

export const QUICK_RANGES: { key: QuickRangeKey; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
];

/** Resolves a quick range to concrete dates, or null for "all time". */
export function quickRange(key: QuickRangeKey, now: Date = new Date()): DateRange | null {
  const d = (offset: (x: Date) => Date) => {
    const t = offset(now);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  };
  switch (key) {
    case "all":
      return null;
    case "today":
      return { from: d((x) => x), to: d((x) => x) };
    case "yesterday": {
      const y = new Date(now.getTime() - 86_400_000);
      return { from: d(() => y), to: d(() => y) };
    }
    case "thisWeek": {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      return { from: d(() => start), to: d((x) => x) };
    }
    case "thisMonth": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: d(() => start), to: d((x) => x) };
    }
    case "lastMonth": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: d(() => start), to: d(() => end) };
    }
  }
}

/** True when the range is present and valid (from <= to). */
export function isValidRange(r: DateRange | null): boolean {
  return Boolean(r && r.from && r.to && r.from <= r.to);
}

/** True when an ISO timestamp falls inside the range (inclusive). */
export function inRange(iso: string | null | undefined, r: DateRange | null): boolean {
  if (!r) return true;
  if (!iso) return false;
  const dd = iso.slice(0, 10);
  return dd >= r.from && dd <= r.to;
}

function friendly(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(day).padStart(2, "0")} ${months[(m ?? 1) - 1] ?? ""} ${y}`;
}

/** Human label for the active range, e.g. "01 Aug 2026 – 15 Aug 2026". */
export function dateRangeLabel(r: DateRange | null): string {
  if (!r) return "All time";
  if (r.from === r.to) return friendly(r.from);
  return `${friendly(r.from)} – ${friendly(r.to)}`;
}

/** Short label for a date picker input value (from/to). */
export function dateLabel(d: string | null | undefined): string {
  return d && d.length === 10 ? friendly(d) : "—";
}

/* ------------------------------------------------------------------ */
/* Region selection                                                    */
/* ------------------------------------------------------------------ */

export interface RegionSelection {
  /** Forest hierarchy ids; empty string = "All". */
  division: string;
  range: string;
  beat: string;
  compartment: string;
}

export const EMPTY_REGION: RegionSelection = { division: "", range: "", beat: "", compartment: "" };

/** Human label for the selected region. */
export function regionLabel(sel: RegionSelection): string {
  const parts: string[] = [];
  if (sel.division) parts.push(unitName(sel.division));
  if (sel.range) parts.push(unitName(sel.range));
  if (sel.beat) parts.push(unitName(sel.beat));
  if (sel.compartment) parts.push(`Compartment ${sel.compartment}`);
  return parts.length > 0 ? parts.join(" / ") : "All regions";
}

/** True when a { division, range, beat, compartment } record matches the selection (empty = any). */
export function regionMatches(
  unit: { division: string; range?: string | null; beat?: string | null; compartment?: string | null },
  sel: RegionSelection
): boolean {
  if (sel.division && unit.division !== sel.division) return false;
  if (sel.range && (unit.range ?? "") !== sel.range) return false;
  if (sel.beat && (unit.beat ?? "") !== sel.beat) return false;
  if (sel.compartment && (unit.compartment ?? "") !== sel.compartment) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Shared filter / result contracts                                    */
/* ------------------------------------------------------------------ */

export interface PatrolReportFilters {
  range: DateRange | null;
  region: RegionSelection;
  status: string; // "" = all statuses
  type: string; // "" = all patrol types
  method: string; // "" = all methods
  leader: string; // "" = all patrol leaders
}

export interface ObservationReportFilters {
  range: DateRange | null;
  region: RegionSelection;
  recordedBy: string; // "" = all
  category: ObservationCategory | ""; // "" = all categories
  subcategory: string; // "" = all subcategories of the active category
}

export interface RangerReportFilters {
  range: DateRange | null;
  /** Activity key: "" | "patrol" | "foot" | "motorcycle" | "four-wheeler" | "boat" | "observation" | "incident". */
  activity: string;
}

export interface RegionReportFilters {
  range: DateRange | null;
  region: RegionSelection;
  rangerIds: string[]; // empty = all
  patrolIds: string[]; // empty = all
  category: ObservationCategory | ""; // "" = all observation categories
}