"use client";

/**
 * Officer Management — directory (PRD §7.1): search, duty-status filter,
 * table/grid views, KPIs and team overview.
 */

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { rangers, hierarchy } from "@/lib/services";
import { api } from "@/lib/api";
import { useAsyncData } from "@/lib/use-async";
import { formatKm } from "@/lib/utils";
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
  const { data, error, loading, reload } = useAsyncData(() => rangers.list(), [], { cacheKey: "rangers:list", pollInterval: 15000 });
  // Backend per-ranger coverage aggregate (#27) powers the Avg Coverage KPI.
  const cov = useAsyncData(() => api.coverage.rangers().catch(() => null), [], { cacheKey: "rangers:coverage", pollInterval: 30000 });
  // Real-time patrols for per-officer distance & last sync (poll every 15s)
  const patrolsData = useAsyncData(() => api.patrols.list().catch(() => [] as any[]), [], { cacheKey: "rangers:patrols", pollInterval: 15000 });
  // Hierarchy for resolving beat/range names from assignedBeatId/rangeId
  const hierarchyData = useAsyncData(() => hierarchy.units().catch(() => null), [], { cacheKey: "hierarchy:units", pollInterval: 60000 });
  // Raw users for beatId/rangeId/divisionId resolution (real IDs)
  const rawUsers = useAsyncData(() => api.users.list({ role: "RANGER" }).catch(() => [] as any[]), [], { cacheKey: "rangers:rawUsers", pollInterval: 15000 });

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

  // Helpers for real-time Area / Coverage / Last Sync
  const beatIdToName = useMemo(() => {
    const m = new Map<string, string>();
    const users = (rawUsers.data ?? []) as any[];
    const tree = hierarchyData.data as any;
    if (!tree) return m;
    // Build beatId -> beatName from hierarchy
    for (const div of tree.divisions ?? []) {
      for (const rng of tree.ranges[div.id] ?? []) {
        for (const b of tree.beats[rng.id] ?? []) {
          m.set(b.id, b.name);
        }
      }
    }
    // Also map raw user beatId if hierarchy misses (fallback)
    for (const u of users) if (u.beatId && !m.has(u.beatId)) m.set(u.beatId, u.beatId);
    return m;
  }, [rawUsers.data, hierarchyData.data]);

  const rangeIdToName = useMemo(() => {
    const m = new Map<string, string>();
    const tree = hierarchyData.data as any;
    if (!tree) return m;
    for (const div of tree.divisions ?? []) {
      for (const rng of tree.ranges[div.id] ?? []) {
        m.set(rng.id, rng.name);
      }
    }
    return m;
  }, [hierarchyData.data]);

  const userIdToArea = useMemo(() => {
    const m = new Map<string, string>();
    const users = (rawUsers.data ?? []) as any[];
    for (const u of users) {
      const cader = (u.cader ?? "").toUpperCase();
      if (cader === "ABO" || cader === "FBO") {
        const beatName = u.beatId ? (beatIdToName.get(u.beatId) ?? "—") : "—";
        m.set(u.id, beatName);
      } else if (cader === "FRO") {
        const rangeName = u.rangeId ? (rangeIdToName.get(u.rangeId) ?? "—") : "—";
        m.set(u.id, rangeName);
      } else if (cader === "FSO") {
        m.set(u.id, "Special");
      } else {
        // Fallback: beat > range > division > —
        const beatName = u.beatId ? beatIdToName.get(u.beatId) : null;
        const rangeName = u.rangeId ? rangeIdToName.get(u.rangeId) : null;
        m.set(u.id, beatName ?? rangeName ?? "—");
      }
    }
    // For mock rangers without raw user entry, fallback to ranger's own range/beat
    for (const r of data ?? []) {
      if (!m.has(r.id)) {
        const cader = (r.designation ?? "").toUpperCase();
        if (cader === "ABO" || cader === "FBO") m.set(r.id, (r as any).beat || r.range || "—");
        else if (cader === "FRO") m.set(r.id, r.range || "—");
        else if (cader === "FSO") m.set(r.id, "Special");
        else m.set(r.id, r.range || r.beat || "—");
      }
    }
    return m;
  }, [rawUsers.data, beatIdToName, rangeIdToName, data]);

  const userIdToCoverage = useMemo(() => {
    const m = new Map<string, { coverage: number | null; distanceKm: number | null }>();
    // From coverage API rows
    for (const row of cov.data?.rows ?? []) {
      m.set(row.userId, { coverage: row.coveragePercent, distanceKm: null });
    }
    // Overlay distance from patrols (real-time sum per officer)
    const patrols = (patrolsData.data ?? []) as any[];
    const distByUser = new Map<string, number>();
    for (const p of patrols) {
      const d = typeof p.stats?.distanceKm === "number" ? p.stats.distanceKm : 0;
      distByUser.set(p.userId, (distByUser.get(p.userId) ?? 0) + d);
    }
    for (const [uid, dist] of distByUser.entries()) {
      const cur = m.get(uid) ?? { coverage: null, distanceKm: null };
      m.set(uid, { coverage: cur.coverage, distanceKm: Math.round(dist * 100) / 100 });
    }
    // Fallback to ranger stats if no coverage row
    for (const r of data ?? []) {
      if (!m.has(r.id)) {
        m.set(r.id, { coverage: r.stats.coveragePct ?? null, distanceKm: r.stats.distanceKm ?? null });
      } else {
        const cur = m.get(r.id)!;
        if (cur.distanceKm == null && r.stats.distanceKm != null) cur.distanceKm = r.stats.distanceKm;
        if (cur.coverage == null && r.stats.coveragePct != null) cur.coverage = r.stats.coveragePct;
      }
    }
    return m;
  }, [cov.data, patrolsData.data, data]);

  const userIdToLastSync = useMemo(() => {
    const m = new Map<string, string | null>();
    const patrols = (patrolsData.data ?? []) as any[];
    // Group latest patrol timestamp per user
    const latestByUser = new Map<string, number>();
    for (const p of patrols) {
      const t = p.startedAt ?? p.createdAt;
      if (!t) continue;
      const ms = new Date(t).getTime();
      if (!Number.isFinite(ms)) continue;
      const prev = latestByUser.get(p.userId) ?? 0;
      if (ms > prev) latestByUser.set(p.userId, ms);
      // Also consider last point timestamp via stats? Use updatedAt as fallback
      const upd = p.updatedAt ? new Date(p.updatedAt).getTime() : 0;
      if (upd > (latestByUser.get(p.userId) ?? 0)) latestByUser.set(p.userId, upd);
    }
    for (const r of data ?? []) {
      const ms = latestByUser.get(r.id);
      if (ms) m.set(r.id, new Date(ms).toISOString());
      else if ((r as any).lastSync) m.set(r.id, (r as any).lastSync);
      else m.set(r.id, null);
    }
    return m;
  }, [patrolsData.data, data]);

  const handleExport = (kind: ExportKind) => {
    exportRows(kind, `officers-${stamp()}`, filtered.map((r) => ({
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
        title="Officer Management"
        subtitle="Roster, duty status and field performance of all officers"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/rangers/new" className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700">
              <Icon name="plus" size={15} />
              Create officer
            </Link>
            <ExportButton onExport={handleExport} />
            <Link href="/rangers/teams" className="inline-flex h-9 items-center gap-2 rounded-field border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800">
              Teams & assets
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
<KpiCard label="Total officers" value={data.length} icon="users" tone="forest" />
        <KpiCard label="In field" value={inField} icon="activity" tone="success" onClick={() => setStatus("field")} />
        <KpiCard label="On duty" value={onDuty} icon="check" tone="info" onClick={() => setStatus("on-duty")} />
        <KpiCard label="Off duty" value={data.filter((r) => r.dutyStatus === "off-duty").length} icon="clock" tone="neutral" onClick={() => setStatus("off-duty")} />
        <KpiCard label="Offline" value={data.filter((r) => r.dutyStatus === "offline").length} icon="wifi" tone="danger" onClick={() => setStatus("offline")} />
        <KpiCard label="Avg coverage" value={avgCoverage ?? "—"} unit={avgCoverage != null ? "%" : undefined} icon="target" tone="khaki" />
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader
            title="Officer directory"
            icon="users"
            actions={
              <div className="flex items-center gap-2">
                <SearchInput value={query} onChange={setQuery} placeholder="Search officers…" className="w-48" />
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
                  key: "ranger", header: "Officer", sortValue: (r) => r.name,
                  render: (r) => (
                    <div className="flex items-center gap-2.5">
                      <Avatar name={r.name} size={30} />
                      <div>
                        <p className="font-medium text-ink">{r.name}</p>
                        <p className="text-xs text-ink-soft">{r.code} · {r.designation.toUpperCase()}</p>
                      </div>
                    </div>
                  ),
                },
                {
                  key: "area", header: "Area", sortValue: (r) => userIdToArea.get(r.id) ?? "",
                  render: (r) => <span className="text-ink-soft">{userIdToArea.get(r.id) ?? "—"}</span>,
                },
                {
                  key: "coverage", header: "Coverage", sortValue: (r) => userIdToCoverage.get(r.id)?.coverage ?? -1,
                  render: (r) => {
                    const c = userIdToCoverage.get(r.id);
                    const cov = c?.coverage;
                    const dist = c?.distanceKm;
                    return (
                      <span className="text-ink-soft">
                        {cov != null ? `${cov}%` : "—"}
                        {dist != null && dist > 0 ? <span className="ml-1.5 text-xs text-ink-faint">· {formatKm(dist)}</span> : null}
                      </span>
                    );
                  },
                },
                {
                  key: "patrols", header: "Patrols", sortValue: (r) => r.stats.patrols,
                  render: (r) => <span className="text-ink-soft">{r.stats.patrols}</span>,
                },
                {
                  key: "sync", header: "Last sync",
                  render: (r) => {
                    const ls = userIdToLastSync.get(r.id) ?? (r as any).lastSync;
                    return (
                      <span className={cn("text-ink-soft", isStale(ls) && "font-medium text-warning")}>
                        {ls ? timeAgo(ls) : "—"}
                      </span>
                    );
                  },
                },
                {
                  key: "status", header: "Status", sortValue: (r) => r.dutyStatus,
                  render: (r) => <Badge tone={dutyStatusTone[r.dutyStatus]} dot>{dutyStatusLabel[r.dutyStatus]}</Badge>,
                },
              ]}
              empty={<p className="py-8 text-center text-sm text-ink-soft">No officers match the filters.</p>}
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
              Map view for officer positions links into the GIS workspace — see{" "}
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
            <p className="text-xs text-ink-soft">{r.code} · {r.designation.toUpperCase()}</p>
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
          <p className="text-xs text-ink-soft">{r.designation.toUpperCase()}</p>
          <Badge tone={dutyStatusTone[r.dutyStatus]} dot>{dutyStatusLabel[r.dutyStatus]}</Badge>
        </button>
      ))}
    </div>
  );
}