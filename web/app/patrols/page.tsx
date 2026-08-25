"use client";

/**
 * Patrols — operational patrol list with filtering, search, and pagination.
 *
 * Filter order: Status → Range → Beat → Date → Ranger
 * All filters default to "All". Pagination resets on filter change.
 * Date options: All / Today / This Month / Custom Date Range
 * Status options: All / Ongoing / Completed
 *
 * Ranges and beats are derived from the real backend geography
 * enrichment (Beat → Range chain), never from mock data.
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import { patrols, rangers, hierarchy } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, Badge, PageHeader } from "@/components/ui";
import { DataTable, FilterBar, FilterSelect, Pagination } from "@/components/data";
import { Icon } from "@/components/icons";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { patrolStatusLabel, patrolStatusTone } from "@/lib/nav";
import { patrolMethodLabels } from "@/lib/mock/patrols";
import { timeAgo, formatMinutes, formatKm } from "@/lib/utils";
import type { Patrol } from "@/lib/types";

const PAGE_SIZE = 15;

/** IST offset: UTC+5:30 in milliseconds. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Get today's date in IST as a YYYY-MM-DD string. */
function todayIST(): string {
  const utc = Date.now() + new Date().getTimezoneOffset() * 60_000;
  const ist = utc + IST_OFFSET_MS;
  return new Date(ist).toISOString().slice(0, 10);
}

/** Get the first day of the current month in IST as YYYY-MM-DD. */
function monthStartIST(): string {
  const utc = Date.now() + new Date().getTimezoneOffset() * 60_000;
  const ist = new Date(utc + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Get the last day of the current month in IST as YYYY-MM-DD. */
function monthEndIST(): string {
  const utc = Date.now() + new Date().getTimezoneOffset() * 60_000;
  const ist = new Date(utc + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth() + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

export default function PatrolsPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useAsyncData(() => patrols.list());
  const roster = useAsyncData(() => rangers.list());
  const hierarchyData = useAsyncData(() => hierarchy.units());

  /* ── Filter state — all default to "" (= All) ── */
  const [status, setStatus] = useState("");
  const [range, setRange] = useState("");
  const [beat, setBeat] = useState("");
  const [dateMode, setDateMode] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [ranger, setRanger] = useState("");
  const [page, setPage] = useState(1);

  /* ── Derive ranges from authoritative hierarchy (not patrol data) ── */
  const rangeOptions = useMemo(() => {
    if (!hierarchyData.data) return [];
    const tree = hierarchyData.data;
    const names: string[] = [];
    for (const div of tree.divisions) {
      const ranges = tree.ranges[div.id] ?? [];
      for (const rng of ranges) names.push(rng.name);
    }
    return names.sort();
  }, [hierarchyData.data]);

  /* ── Derive beats from hierarchy, filtered by selected range ── */
  const beatOptions = useMemo(() => {
    if (!hierarchyData.data) return [];
    const tree = hierarchyData.data;
    if (range) {
      // Find range unit by name → get beats under it
      for (const div of tree.divisions) {
        const ranges = tree.ranges[div.id] ?? [];
        const match = ranges.find((rng) => rng.name === range);
        if (match) {
          const beats = tree.beats[match.id] ?? [];
          return beats.map((b) => b.name).sort();
        }
      }
      return [];
    }
    // No range selected — show all beats
    const allBeats: string[] = [];
    for (const div of tree.divisions) {
      const ranges = tree.ranges[div.id] ?? [];
      for (const rng of ranges) {
        const beats = tree.beats[rng.id] ?? [];
        for (const b of beats) allBeats.push(b.name);
      }
    }
    return allBeats.sort();
  }, [hierarchyData.data, range]);

  /* ── Clear stale beat if no longer in filtered set ── */
  const effectiveBeat = beat && beatOptions.includes(beat) ? beat : "";
  useEffect(() => {
    if (beat && !beatOptions.includes(beat)) setBeat("");
  }, [beat, beatOptions]);

  /* ── Ranger options from real roster ── */
  const rangerOptions = useMemo(
    () => (roster.data ?? []).map((r) => ({ value: r.id, label: r.name })),
    [roster.data]
  );

  /* ── Date range calculation (IST-aware) ── */
  const dateFilter = useMemo(() => {
    if (dateMode === "today") {
      const d = todayIST();
      return { from: d, to: d };
    }
    if (dateMode === "month") {
      return { from: monthStartIST(), to: monthEndIST() };
    }
    if (dateMode === "custom" && dateFrom) {
      return { from: dateFrom, to: dateTo || dateFrom };
    }
    return null;
  }, [dateMode, dateFrom, dateTo]);

  /* ── Client-side filtering (AND semantics) ── */
  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((p) => {
      if (status && p.status !== status) return false;
      if (range && p.range !== range) return false;
      if (effectiveBeat && p.beat !== effectiveBeat) return false;
      if (ranger && p.rangerId !== ranger && p.leader !== ranger) return false;
      if (dateFilter) {
        const patrolDate = p.startScheduled?.slice(0, 10);
        if (!patrolDate) return false;
        if (patrolDate < dateFilter.from || patrolDate > dateFilter.to) return false;
      }
      return true;
    });
  }, [data, status, range, effectiveBeat, ranger, dateFilter]);

  /* ── Pagination ── */
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* ── Active filter count ── */
  const activeFilters = [status, range, effectiveBeat, dateMode, ranger].filter(Boolean).length;

  /* ── Clear all filters ── */
  const clearFilters = useCallback(() => {
    setStatus("");
    setRange("");
    setBeat("");
    setDateMode("");
    setDateFrom("");
    setDateTo("");
    setRanger("");
    setPage(1);
  }, []);

  /* ── Loading / error states ── */
  if (loading || !data) return <SkeletonRows rows={8} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        title="Patrols"
        subtitle="Monitor and filter all patrol activity"
        actions={
          <Link
            href="/patrols/permissions"
            className="inline-flex h-9 items-center gap-2 rounded-field border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800"
          >
            <Icon name="lock" size={15} /> Permissions
          </Link>
        }
      />

      <Card>
        {/* Search + record count */}
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-3">
            {activeFilters > 0 && (
              <button onClick={clearFilters} className="text-xs text-forest-700 hover:underline">
                Clear all ({activeFilters})
              </button>
            )}
          </div>
          <p className="text-xs text-ink-soft">
            {filtered.length} patrol{filtered.length === 1 ? "" : "s"}
            {filtered.length !== data.length && ` of ${data.length}`}
          </p>
        </div>

        {/* Filters — order: Status → Range → Beat → Date → Ranger */}
        <FilterBar onClear={clearFilters}>
          <FilterSelect
            label="Status"
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            options={[
              { value: "ongoing", label: "Ongoing" },
              { value: "completed", label: "Completed" },
            ]}
          />
          <FilterSelect
            label="Range"
            value={range}
            onChange={(v) => { setRange(v); setBeat(""); setPage(1); }}
            options={rangeOptions.map((r) => ({ value: r, label: r }))}
          />
          <FilterSelect
            label="Beat"
            value={effectiveBeat}
            onChange={(v) => { setBeat(v); setPage(1); }}
            options={beatOptions.map((b) => ({ value: b, label: b }))}
          />

          {/* Date filter with custom date range */}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-soft">Date</span>
            <div className="flex gap-1">
              <select
                value={dateMode}
                onChange={(e) => {
                  setDateMode(e.target.value);
                  setPage(1);
                  if (e.target.value !== "custom") {
                    setDateFrom("");
                    setDateTo("");
                  }
                }}
                className="h-8 rounded-field border border-line-strong bg-white px-2 text-xs focus:border-forest-600 focus:outline-none"
              >
                <option value="">All</option>
                <option value="today">Today</option>
                <option value="month">This Month</option>
                <option value="custom">Custom</option>
              </select>
              {dateMode === "custom" && (
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                    className="h-8 rounded-field border border-line-strong bg-white px-2 text-xs focus:border-forest-600 focus:outline-none"
                  />
                  <span className="text-xs text-ink-soft">to</span>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom}
                    onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                    className="h-8 rounded-field border border-line-strong bg-white px-2 text-xs focus:border-forest-600 focus:outline-none"
                  />
                </div>
              )}
            </div>
          </label>

          <FilterSelect
            label="Ranger"
            value={ranger}
            onChange={(v) => { setRanger(v); setPage(1); }}
            options={rangerOptions}
          />
        </FilterBar>

        {/* Table */}
        <DataTable
          rows={pageRows}
          loading={loading}
          onRowClick={(r) => router.push(`/patrols/${r.id}`)}
          columns={[
            {
              key: "code", header: "Patrol",
              sortValue: (r) => r.code,
              render: (r) => (
                <div>
                  <span className="font-mono text-xs font-medium text-forest-800">{r.code}</span>
                  {r.title && <p className="truncate text-xs text-ink-soft">{r.title}</p>}
                </div>
              ),
            },
            {
              key: "ranger", header: "Ranger",
              sortValue: (r) => r.leader,
              render: (r) => <span className="text-sm text-ink">{r.leader || "—"}</span>,
            },
            { key: "range", header: "Range", sortValue: (r) => r.range, render: (r) => <span className="text-ink-soft">{r.range || "—"}</span> },
            { key: "beat", header: "Beat", sortValue: (r) => r.beat, render: (r) => <span className="text-ink-soft">{r.beat || "—"}</span> },
            { key: "method", header: "Method", sortValue: (r) => r.method ?? "", render: (r) => <span className="text-ink-soft">{r.method ? (patrolMethodLabels[r.method] ?? r.method) : "—"}</span> },
            {
              key: "start", header: "Start",
              sortValue: (r) => new Date(r.startScheduled).getTime(),
              render: (r) => <span className="text-ink-soft">{r.startScheduled ? timeAgo(r.startScheduled) : "—"}</span>,
            },
            {
              key: "end", header: "End",
              sortValue: (r) => new Date(r.endActual ?? 0).getTime(),
              render: (r) => <span className="text-ink-soft">{r.endActual ? timeAgo(r.endActual) : "—"}</span>,
            },
            {
              key: "duration", header: "Duration",
              sortValue: (r) => r.durationMin,
              render: (r) => <span className="text-ink-soft">{r.durationMin > 0 ? formatMinutes(r.durationMin) : "—"}</span>,
            },
            {
              key: "distance", header: "Distance",
              sortValue: (r) => r.distanceKm ?? -1,
              render: (r) => <span className="text-ink-soft">{r.distanceKm != null ? formatKm(r.distanceKm) : "—"}</span>,
            },
            {
              key: "observations", header: "Obs.",
              sortValue: (r) => r.observations,
              render: (r) => <span className="text-ink-soft">{r.observations > 0 ? r.observations : "—"}</span>,
            },
            {
              key: "status", header: "Status",
              sortValue: (r) => r.status,
              render: (r) => <Badge tone={patrolStatusTone[r.status]} dot>{patrolStatusLabel[r.status]}</Badge>,
            },
            {
              key: "actions", header: "",
              render: (r) => (
                <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Link
                    href={`/patrols/${r.id}`}
                    title="View patrol"
                    className="flex size-7 items-center justify-center rounded-md border border-line bg-white text-ink-soft transition-colors hover:border-forest-600 hover:text-forest-800"
                  >
                    <Icon name="eye" size={13} />
                  </Link>
                  <Link
                    href={`/patrols/${r.id}/replay`}
                    title="Replay"
                    className="flex size-7 items-center justify-center rounded-md border border-line bg-white text-ink-soft transition-colors hover:border-forest-600 hover:text-forest-800"
                  >
                    <Icon name="play" size={13} />
                  </Link>
                </span>
              ),
            },
          ]}
          empty={
            <div className="py-12 text-center">
              <Icon name="route" size={32} className="mx-auto mb-3 text-ink-faint" />
              <p className="text-sm text-ink-soft">
                {data.length === 0
                  ? "No patrols available."
                  : "No patrols found for the selected filters."}
              </p>
              {activeFilters > 0 && (
                <button onClick={clearFilters} className="mt-2 text-xs text-forest-700 hover:underline">Clear filters</button>
              )}
            </div>
          }
        />

        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
      </Card>
    </div>
  );
}
