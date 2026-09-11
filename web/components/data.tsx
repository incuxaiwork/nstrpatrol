"use client";

/**
 * Data presentation primitives — DataTable, FilterBar, Pagination,
 * ViewSwitcher, StatCard / KpiCard.
 */

import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { SegmentedControl, type BadgeTone } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* DataTable                                                          */
/* ------------------------------------------------------------------ */

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?(row: T): ReactNode;
  sortValue?(row: T): string | number;
  className?: string;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  onRowClick,
  loading,
  empty,
  dense,
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?(row: T): void;
  loading?: boolean;
  empty?: ReactNode;
  dense?: boolean;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sort.dir;
      return String(av).localeCompare(String(bv)) * sort.dir;
    });
  }, [rows, sort, columns]);

  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-left", dense ? "text-xs" : "text-sm")}>
        <thead>
          <tr className="border-b border-line bg-surface text-xs text-ink-soft">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn("px-4 py-2.5 font-medium whitespace-nowrap", c.className)}
              >
                {c.sortValue ? (
                  <button
                    onClick={() =>
                      setSort((s) =>
                        s?.key === c.key
                          ? s.dir === 1
                            ? { key: c.key, dir: -1 }
                            : null
                          : { key: c.key, dir: 1 }
                      )
                    }
                    className="inline-flex items-center gap-1 hover:text-ink"
                  >
                    {c.header}
                    <Icon
                      name={sort?.key === c.key ? (sort.dir === 1 ? "chevronUp" : "chevronDown") : "chevronsUpDown"}
                      size={12}
                      className={sort?.key === c.key ? "text-forest-700" : "text-ink-faint"}
                    />
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {loading
            ? Array.from({ length: dense ? 5 : 7 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 py-3", c.className)}>
                      <div className="h-3.5 w-24 rounded bg-zinc-200" />
                    </td>
                  ))}
                </tr>
              ))
            : sorted.map((r) => (
                <tr
                  key={r.id}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={cn(
                    "bg-white transition-colors hover:bg-forest-50/40",
                    onRowClick && "cursor-pointer"
                  )}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 py-2.5 text-ink", c.className)}>
                      {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {!loading && sorted.length === 0 && (
        <div className="p-6">{empty ?? <p className="py-8 text-center text-sm text-ink-soft">No records found.</p>}</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FilterBar                                                          */
/* ------------------------------------------------------------------ */

export function FilterBar({
  children,
  onClear,
  className,
}: {
  children: ReactNode;
  onClear?(): void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 rounded-card border border-line bg-white p-3 shadow-card",
        className
      )}
    >
      {children}
      {onClear && (
        <button
          onClick={onClear}
          className="inline-flex h-9 items-center gap-1.5 px-2 text-xs font-medium text-ink-soft hover:text-danger"
        >
          <Icon name="x" size={13} />
          Clear
        </button>
      )}
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-ink-soft">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-field border border-line-strong bg-white px-2 text-xs focus:border-forest-600 focus:outline-none"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Pagination                                                         */
/* ------------------------------------------------------------------ */

export function Pagination({
  page,
  pageSize = 10,
  total,
  onChange,
}: {
  page: number;
  pageSize?: number;
  total: number;
  onChange(p: number): void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
      <p className="text-xs text-ink-soft">
        Showing {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
          className="flex size-7 items-center justify-center rounded-md border border-line bg-white text-ink-soft hover:text-ink disabled:opacity-40"
        >
          <Icon name="chevronLeft" size={14} />
        </button>
        {Array.from({ length: pages }).map((_, i) => (
          <button
            key={i}
            onClick={() => onChange(i + 1)}
            aria-label={`Page ${i + 1}`}
            className={cn(
              "size-7 rounded-md text-xs font-medium",
              page === i + 1 ? "bg-forest-800 text-white" : "text-ink-soft hover:bg-forest-50 hover:text-ink"
            )}
          >
            {i + 1}
          </button>
        ))}
        <button
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
          className="flex size-7 items-center justify-center rounded-md border border-line bg-white text-ink-soft hover:text-ink disabled:opacity-40"
        >
          <Icon name="chevronRight" size={14} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View switcher (table / cards / map / gallery)                      */
/* ------------------------------------------------------------------ */

export type ViewMode = "table" | "cards" | "map" | "gallery";

export function ViewSwitcher({ value, onChange }: { value: ViewMode; onChange(v: ViewMode): void }) {
  const options: { value: ViewMode; label: string; icon: IconName }[] = [
    { value: "table", label: "Table", icon: "list" },
    { value: "cards", label: "Cards", icon: "grid" },
    { value: "map", label: "Map", icon: "map" },
    { value: "gallery", label: "Media", icon: "gallery" },
  ];
  return <SegmentedControl value={value} onChange={onChange} options={options} />;
}

/* ------------------------------------------------------------------ */
/* StatCard / KpiCard                                                 */
/* ------------------------------------------------------------------ */

export function KpiCard({
  label,
  value,
  unit,
  change,
  icon,
  tone = "forest",
  tillDate,
  today,
  onClick,
}: {
  label: string;
  value: string | number;
  unit?: string;
  change?: number;
  icon: IconName;
  tone?: BadgeTone;
  tillDate?: string | number;
  today?: string | number;
  onClick?(): void;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: "bg-zinc-100 text-ink-soft",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-[#8a4b00]",
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
    forest: "bg-forest-100 text-forest-800",
    khaki: "bg-khaki-100 text-khaki-600",
  };
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-card border border-line bg-white p-4 shadow-card",
        onClick && "cursor-pointer transition-shadow hover:shadow-card-hover"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-soft">{label}</span>
        <span className={cn("flex size-8 items-center justify-center rounded-lg", tones[tone])}>
          <Icon name={icon} size={16} />
        </span>
      </div>
      {tillDate !== undefined || today !== undefined ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            { key: "total", label: "Total", value: tillDate },
            { key: "today", label: "Today", value: today },
          ].map((c) => (
            <div key={c.key} className="rounded-md bg-surface px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">{c.label}</p>
              <p className="mt-0.5 truncate text-xl font-semibold tracking-tight text-ink">{c.value ?? "—"}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-2xl font-semibold tracking-tight text-ink">{value}</span>
          {unit && <span className="text-sm text-ink-soft">{unit}</span>}
          {typeof change === "number" && (
            <span
              className={cn(
                "ml-auto inline-flex items-center gap-0.5 text-xs font-medium",
                change >= 0 ? "text-success" : "text-danger"
              )}
            >
              <Icon name={change >= 0 ? "chevronUp" : "chevronDown"} size={12} />
              {Math.abs(change)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function StatRow({ items }: { items: { label: string; value: ReactNode; tone?: BadgeTone }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="rounded-card border border-line bg-white p-3 shadow-card">
          <p className="text-xs text-ink-soft">{it.label}</p>
          <div className="mt-1 text-lg font-semibold text-ink">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline                                                           */
/* ------------------------------------------------------------------ */

export function Timeline({ items }: { items: { time: string; title: string; detail?: string; tone?: BadgeTone; icon?: IconName }[] }) {
  const toneCls: Record<BadgeTone, string> = {
    neutral: "bg-zinc-300",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
    forest: "bg-forest-600",
    khaki: "bg-khaki-500",
  };
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {items.map((it, i) => (
        <li key={i} className="relative">
          <span
            className={cn(
              "absolute -left-[26px] top-1 size-3 rounded-full border-2 border-white",
              toneCls[it.tone ?? "neutral"]
            )}
          />
          <p className="text-xs text-ink-faint">{it.time}</p>
          <p className="text-sm font-medium text-ink">{it.title}</p>
          {it.detail && <p className="mt-0.5 text-xs text-ink-soft">{it.detail}</p>}
        </li>
      ))}
    </ol>
  );
}

/* ---------- Primary action button used in many page headers ---------- */
export function PrimaryLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700"
    >
      <Icon name={icon} size={15} />
      {children}
    </a>
  );
}