"use client";

/**
 * Patrols — operational patrol list with filtering, search, and pagination.
 * Replaces the previous dashboard-style page with a clean data table.
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState, useCallback } from "react";
import { patrols, rangers } from "@/lib/services";
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

export default function PatrolsPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useAsyncData(() => patrols.list());
  const roster = useAsyncData(() => rangers.list());

  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [division, setDivision] = useState("");
  const [subDivision, setSubDivision] = useState("");
  const [range, setRange] = useState("");
  const [beat, setBeat] = useState("");
  const [ranger, setRanger] = useState("");
  const [dateRange, setDateRange] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const cutoff =
    dateRange === "today" ? todayStart
      : dateRange === "week" ? now.getTime() - 7 * 86_400_000
        : dateRange === "month" ? now.getTime() - 30 * 86_400_000
          : 0;

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.filter((p) => {
      if (status && p.status !== status) return false;
      if (method && p.method !== method) return false;
      if (division && p.division !== division) return false;
      if (subDivision && p.subDivision !== subDivision) return false;
      if (range && p.range !== range) return false;
      if (beat && p.beat !== beat) return false;
      if (ranger && p.rangerId !== ranger && p.leader !== ranger) return false;
      if (cutoff && new Date(p.startScheduled).getTime() < cutoff) return false;
      if (q) {
        const hay = [p.code, p.title, p.leader, p.beat, p.range, p.division].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, status, method, division, subDivision, range, beat, ranger, dateRange, query, cutoff]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const clearFilters = useCallback(() => {
    setStatus(""); setMethod(""); setDivision(""); setSubDivision("");
    setRange(""); setBeat(""); setRanger(""); setDateRange(""); setQuery(""); setPage(1);
  }, []);

  if (loading || !data || roster.loading || !roster.data) return <SkeletonRows rows={8} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  // Derive filter options from real data only
  const divisionOptions = [...new Set(data.map((p) => p.division).filter(Boolean))];
  const subDivisionOptions = [
    ...new Set(data.filter((p) => !division || p.division === division).map((p) => p.subDivision).filter(Boolean)),
  ];
  const rangeOptions = [
    ...new Set(data.filter((p) => (!division || p.division === division) && (!subDivision || p.subDivision === subDivision)).map((p) => p.range).filter(Boolean)),
  ];
  const beatOptions = [
    ...new Set(data.filter((p) => (!division || p.division === division) && (!subDivision || p.subDivision === subDivision) && (!range || p.range === range)).map((p) => p.beat).filter(Boolean)),
  ];
  const methodOptions = [...new Set(data.map((p) => p.method).filter((m): m is NonNullable<Patrol["method"]> => Boolean(m)))];
  const rangerOptions = roster.data.map((r) => ({ value: r.id, label: r.name }));

  const activeFilters = [status, method, division, subDivision, range, beat, ranger, dateRange, query].filter(Boolean).length;

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
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search patrols…"
              className="h-9 w-56 rounded-field border border-line bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-forest-600"
            />
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

        {/* Filters */}
        <FilterBar onClear={clearFilters}>
          <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }}
            options={[{ value: "", label: "All" }, ...Object.entries(patrolStatusLabel).map(([v, l]) => ({ value: v, label: l }))]} />
          <FilterSelect label="Ranger" value={ranger} onChange={(v) => { setRanger(v); setPage(1); }}
            options={[{ value: "", label: "All" }, ...rangerOptions]} />
          <FilterSelect label="Division" value={division} onChange={(v) => { setDivision(v); setSubDivision(""); setRange(""); setBeat(""); setPage(1); }}
            options={[{ value: "", label: "All" }, ...divisionOptions.map((d) => ({ value: d, label: d }))]} />
          <FilterSelect label="Sub-Division" value={subDivision} onChange={(v) => { setSubDivision(v); setRange(""); setBeat(""); setPage(1); }}
            options={[{ value: "", label: "All" }, ...subDivisionOptions.map((d) => ({ value: d, label: d }))]} />
          <FilterSelect label="Range" value={range} onChange={(v) => { setRange(v); setBeat(""); setPage(1); }}
            options={[{ value: "", label: "All" }, ...rangeOptions.map((r) => ({ value: r, label: r }))]} />
          <FilterSelect label="Beat" value={beat} onChange={(v) => { setBeat(v); setPage(1); }}
            options={[{ value: "", label: "All" }, ...beatOptions.map((b) => ({ value: b, label: b }))]} />
          <FilterSelect label="Method" value={method} onChange={(v) => { setMethod(v); setPage(1); }}
            options={[{ value: "", label: "All" }, ...methodOptions.map((m) => ({ value: m, label: patrolMethodLabels[m] ?? m }))]} />
          <FilterSelect label="Date" value={dateRange} onChange={(v) => { setDateRange(v); setPage(1); }}
            options={[
              { value: "", label: "All time" },
              { value: "today", label: "Today" },
              { value: "week", label: "Last 7 days" },
              { value: "month", label: "Last 30 days" },
            ]} />
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
            { key: "division", header: "Division", sortValue: (r) => r.division, render: (r) => <span className="text-ink-soft">{r.division || "—"}</span> },
            { key: "subDivision", header: "Sub-Div.", sortValue: (r) => r.subDivision, render: (r) => <span className="text-ink-soft">{r.subDivision || "—"}</span> },
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
              sortValue: (r) => r.distanceKm,
              render: (r) => <span className="text-ink-soft">{r.distanceKm > 0 ? formatKm(r.distanceKm) : "—"}</span>,
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
              <p className="text-sm text-ink-soft">No patrols found for the selected filters.</p>
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
