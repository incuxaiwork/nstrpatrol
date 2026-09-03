"use client";

/**
 * Ranger Management — directory (PRD §7.1): search, duty-status filter,
 * table/grid views, KPIs and team overview.
 */

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { rangers } from "@/lib/services";
import { api } from "@/lib/api";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader, Avatar, SearchInput } from "@/components/ui";
import { DataTable, FilterBar, FilterSelect, KpiCard, ViewSwitcher, Pagination, type ViewMode } from "@/components/data";
import { ExportButton, type ExportKind } from "@/components/overlays";
import { Icon } from "@/components/icons";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { dutyStatusLabel, dutyStatusTone } from "@/lib/nav";
import { timeAgo } from "@/lib/utils";
import { exportRows, stamp } from "@/lib/export";
import type { DutyStatus } from "@/lib/types";

export default function RangersPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useAsyncData(() => rangers.list(), [], { cacheKey: "rangers:list" });
  // Backend per-ranger coverage aggregate (#27) powers the Avg Coverage KPI.
  const cov = useAsyncData(() => api.coverage.rangers().catch(() => null), [], { cacheKey: "rangers:coverage" });

  const [status, setStatus] = useState("");
  const [division, setDivision] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("table");
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 12;

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.filter(
      (r) =>
        (!status || r.dutyStatus === status) &&
        (!division || r.division === division) &&
        (!q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q))
    );
  }, [data, status, division, query]);

  // Reset to first page whenever the filter/search roster changes.
  useEffect(() => { setPage(1); }, [filtered]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading || !data) return <SkeletonRows rows={8} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const inField = data.filter((r) => r.dutyStatus === "field").length;
  const onDuty = data.filter((r) => r.dutyStatus === "on-duty").length;
  // Avg Coverage KPI: prefer the backend coverage/rangers aggregate (#27) so
  // the number reflects real GPS/PostGIS attribution; fall back to averaging
  // whatever per-ranger coverage the roster carries, else "—".
  const backendAvg = cov.data?.summary?.avgCoverage ?? null;
  const coverageValues = data.map((r) => r.stats.coveragePct).filter((c): c is number => c != null);
  const avgCoverage =
    backendAvg != null
      ? backendAvg
      : coverageValues.length
        ? Math.round(coverageValues.reduce((a, c) => a + c, 0) / coverageValues.length)
        : null;

  const handleExport = (kind: ExportKind) => {
    exportRows(kind, `rangers-${stamp()}`, filtered.map((r) => ({
      code: r.code,
      name: r.name,
      designation: r.designation,
      dutyStatus: dutyStatusLabel[r.dutyStatus],
      division: r.division || "",
      range: r.range || "",
      beat: r.beat || "",
      team: r.teamId,
      phone: r.phone ?? "",
      bloodGroup: r.bloodGroup ?? "",
      joinYear: r.joinYear,
      coveragePct: r.stats.coveragePct,
      patrols: r.stats.patrols,
      distanceKm: r.stats.distanceKm,
      fieldHours: r.stats.fieldHours,
      lastSync: r.lastSync ?? "",
    })));
  };

  return (
    <div>
      <PageHeader
        title="Ranger Management"
        subtitle="Roster, duty status and field performance of all rangers"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/rangers/new" className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700">
              <Icon name="plus" size={15} />
              Create ranger
            </Link>
            <ExportButton onExport={handleExport} />
            <Link href="/rangers/teams" className="inline-flex h-9 items-center gap-2 rounded-field border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800">
              Teams & assets
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
<KpiCard label="Total rangers" value={data.length} icon="users" tone="forest" />
        <KpiCard label="In field" value={inField} icon="activity" tone="success" onClick={() => setStatus("field")} />
        <KpiCard label="On duty" value={onDuty} icon="check" tone="info" onClick={() => setStatus("on-duty")} />
        <KpiCard label="Off duty" value={data.filter((r) => r.dutyStatus === "off-duty").length} icon="clock" tone="neutral" onClick={() => setStatus("off-duty")} />
        <KpiCard label="Offline" value={data.filter((r) => r.dutyStatus === "offline").length} icon="wifi" tone="danger" onClick={() => setStatus("offline")} />
        <KpiCard label="Avg coverage" value={avgCoverage ?? "—"} unit={avgCoverage != null ? "%" : undefined} icon="target" tone="khaki" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Ranger directory"
            icon="users"
            actions={
              <div className="flex items-center gap-2">
                <SearchInput value={query} onChange={setQuery} placeholder="Search rangers…" className="w-48" />
                <ViewSwitcher value={view} onChange={setView} />
              </div>
            }
          />
          <FilterBar onClear={() => { setStatus(""); setDivision(""); }}>
            <FilterSelect label="Duty status" value={status} onChange={setStatus}
              options={Object.entries(dutyStatusLabel).map(([v, l]) => ({ value: v, label: l }))} />
            <FilterSelect label="Division" value={division} onChange={setDivision}
              options={[...new Set(data.map((r) => r.division).filter(Boolean))].map((d) => ({ value: d, label: d }))} />
          </FilterBar>
          {view === "table" && (
            <>
              <DataTable
                rows={pageRows}
                loading={loading}
              onRowClick={(r) => router.push(`/rangers/${r.id}`)}
              columns={[
                {
                  key: "ranger", header: "Ranger", sortValue: (r) => r.name,
                  render: (r) => (
                    <div className="flex items-center gap-2.5">
                      <Avatar name={r.name} size={30} />
                      <div>
                        <p className="font-medium text-ink">{r.name}</p>
                        <p className="text-xs text-ink-soft">{r.code} · {r.designation}</p>
                      </div>
                    </div>
                  ),
                },
                {
                  key: "unit", header: "Unit", sortValue: (r) => r.range,
                  render: (r) => <span className="text-ink-soft">{r.range || "—"}</span>,
                },
                {
                  key: "coverage", header: "Coverage", sortValue: (r) => r.stats.coveragePct ?? -1,
                  render: (r) => <span className="text-ink-soft">{r.stats.coveragePct != null ? `${r.stats.coveragePct}%` : "—"}</span>,
                },
                {
                  key: "patrols", header: "Patrols", sortValue: (r) => r.stats.patrols,
                  render: (r) => <span className="text-ink-soft">{r.stats.patrols}</span>,
                },
                {
                  key: "sync", header: "Last sync",
                  render: (r) => (
                    <span className={cn("text-ink-soft", isStale(r.lastSync) && "font-medium text-warning")}>
                      {r.lastSync ? timeAgo(r.lastSync) : "—"}
                    </span>
                  ),
                },
                {
                  key: "status", header: "Status", sortValue: (r) => r.dutyStatus,
                  render: (r) => <Badge tone={dutyStatusTone[r.dutyStatus]} dot>{dutyStatusLabel[r.dutyStatus]}</Badge>,
                },
              ]}
              empty={<p className="py-8 text-center text-sm text-ink-soft">No rangers match the filters.</p>}
              />
              {filtered.length > PAGE_SIZE && (
                <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
              )}
            </>
          )}
          {view === "cards" && (
            <>
              <RangerCards rangers={pageRows} onOpen={(r) => router.push(`/rangers/${r.id}`)} />
              {filtered.length > PAGE_SIZE && (
                <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
              )}
            </>
          )}
          {view === "map" && (
            <p className="px-4 py-8 text-center text-sm text-ink-soft">
              Map view for ranger positions links into the GIS workspace — see{" "}
              <Link href="/gis" className="text-forest-700 hover:underline">GIS Intelligence</Link>.
            </p>
          )}
          {view === "gallery" && (
            <>
              <RangerGrid rangers={pageRows} onOpen={(r) => router.push(`/rangers/${r.id}`)} />
              {filtered.length > PAGE_SIZE && (
                <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
              )}
            </>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Top performers" icon="star" subtitle="By field coverage this quarter" />
            <div className="divide-y divide-line">
              {[...data]
                .filter((r) => r.stats.coveragePct != null)
                .sort((a, b) => (b.stats.coveragePct ?? 0) - (a.stats.coveragePct ?? 0))
                .slice(0, 5)
                .map((r, i) => (
                  <Link key={r.id} href={`/rangers/${r.id}`} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-forest-50/40">
                    <span className="w-4 text-xs font-semibold text-ink-faint">{i + 1}</span>
                    <Avatar name={r.name} size={26} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{r.name}</p>
                      <p className="text-xs text-ink-soft">{r.range || "—"}</p>
                    </div>
                    <span className="text-sm font-semibold text-forest-800">{r.stats.coveragePct}%</span>
                  </Link>
                ))}
              {data.every((r) => r.stats.coveragePct == null) && (
                <p className="px-4 py-4 text-xs text-ink-soft">No coverage data available yet.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// -- helpers -----------------------------------------------------------

function cn(...args: unknown[]) { return args.filter(Boolean).join(" "); }

function isStale(lastSync?: string): boolean {
  if (!lastSync) return false;
  return Date.now() - new Date(lastSync).getTime() > 21 * 3_600_000;
}

interface RangerLike {
  id: string;
  code: string;
  name: string;
  designation: string;
  dutyStatus: DutyStatus;
  range: string;
  stats: { patrols: number; distanceKm: number; fieldHours: number; coveragePct?: number };
}

function RangerCards({ rangers: rs, onOpen }: { rangers: RangerLike[]; onOpen(r: RangerLike): void }) {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2">
      {rs.map((r) => (
        <button key={r.id} onClick={() => onOpen(r)} className="flex items-center gap-2.5 rounded-card border border-line bg-surface p-4 text-left transition-colors hover:border-forest-600 hover:bg-forest-50">
          <Avatar name={r.name} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{r.name}</p>
            <p className="text-xs text-ink-soft">{r.code} · {r.designation}</p>
          </div>
          <Badge tone={dutyStatusTone[r.dutyStatus]} dot>{dutyStatusLabel[r.dutyStatus]}</Badge>
        </button>
      ))}
    </div>
  );
}

function RangerGrid({ rangers: rs, onOpen }: { rangers: RangerLike[]; onOpen(r: RangerLike): void }) {
  return (
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-4">
      {rs.map((r) => (
        <button key={r.id} onClick={() => onOpen(r)} className="flex flex-col items-center gap-2 rounded-card border border-line bg-white p-4 text-center transition-colors hover:border-forest-600 hover:bg-forest-50">
          <Avatar name={r.name} size={44} />
          <p className="text-sm font-medium text-ink">{r.name}</p>
          <p className="text-xs text-ink-soft">{r.designation}</p>
          <Badge tone={dutyStatusTone[r.dutyStatus]} dot>{dutyStatusLabel[r.dutyStatus]}</Badge>
        </button>
      ))}
    </div>
  );
}