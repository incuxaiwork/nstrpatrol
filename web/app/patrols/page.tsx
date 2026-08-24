"use client";

/**
 * Patrol Operations Page — High-Density Operational Dashboard & Patrol Registry.
 * Features KPI Cards followed by the full List of All Patrols with status filter chips.
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authorizations, patrols, rangers } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader } from "@/components/ui";
import { KpiCard } from "@/components/data";
import { Icon } from "@/components/icons";
import { JurisdictionBadge } from "@/components/jurisdiction";
import { resolveJurisdiction } from "@/lib/jurisdiction";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { patrolStatusLabel, patrolStatusTone } from "@/lib/nav";
import { patrolTypeLabels } from "@/lib/mock/patrols";
import { unitName } from "@/lib/mock/hierarchy";
import { timeAgo, formatMinutes, formatKm } from "@/lib/utils";
import { ReportButton } from "@/components/reports/ReportButton";
import { PatrolsReportDialog } from "@/components/reports/dialogs";

export default function PatrolsDashboardPage() {
  const router = useRouter();
  const [reportOpen, setReportOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: patrolData, error, loading, reload } = useAsyncData(() => patrols.list());
  const auths = useAsyncData(() => authorizations.list());
  const rangersData = useAsyncData(() => rangers.list());
  const rangersTotal = rangersData.data?.length ?? 0;

  const rows = useMemo(() => {
    if (!patrolData || !auths.data) return [];
    return patrolData.map((p) => ({ patrol: p, jurisdiction: resolveJurisdiction(p, auths.data ?? []) }));
  }, [patrolData, auths.data]);

  const active = rows.filter((r) => r.patrol.status === "ongoing" || r.patrol.status === "delayed");
  const ongoing = rows.filter((r) => r.patrol.status === "ongoing");
  const completed = rows.filter((r) => r.patrol.status === "completed");
  const planned = rows.filter((r) => r.patrol.status === "planned");
  const today = rows.filter((r) => new Date(r.patrol.startScheduled).toDateString() === new Date().toDateString());
  const crossJurisdiction = rows.filter((r) => r.jurisdiction.state === "authorized-exception");
  const review = rows.filter((r) => r.jurisdiction.state === "requires-review" || r.jurisdiction.state === "pending-review");

  const filteredRows = useMemo(() => {
    return rows.filter(({ patrol, jurisdiction }) => {
      if (statusFilter !== "all") {
        if (statusFilter === "authorized") {
          if (jurisdiction.state !== "authorized-exception") return false;
        } else if (statusFilter === "review") {
          if (jurisdiction.state !== "requires-review" && jurisdiction.state !== "pending-review") return false;
        } else if (patrol.status !== statusFilter) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = patrol.title.toLowerCase().includes(q);
        const matchCode = patrol.code.toLowerCase().includes(q);
        const matchLeader = patrol.leader.toLowerCase().includes(q);
        if (!matchTitle && !matchCode && !matchLeader) return false;
      }
      return true;
    });
  }, [rows, statusFilter, searchQuery]);

  if (loading || !patrolData || auths.loading || !auths.data) return <SkeletonRows rows={8} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const completedToday = completed.filter(
    (r) => new Date(r.patrol.endActual ?? r.patrol.startScheduled).toDateString() === new Date().toDateString()
  ).length;
  const todayCross = today.filter((r) => r.jurisdiction.state === "authorized-exception").length;
  const todayReview = today.filter(
    (r) => r.jurisdiction.state === "requires-review" || r.jurisdiction.state === "pending-review"
  ).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Patrol Dashboard"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => reload()}
              aria-label="Refresh patrols"
              title="Refresh patrols"
              className="flex size-9 items-center justify-center rounded-field border border-line-strong bg-white text-ink hover:border-forest-600 hover:text-forest-800 shadow-card"
            >
              <Icon name="refresh" size={15} />
            </button>
            <ReportButton onClick={() => setReportOpen(true)} />
            <Link
              href="/patrols/permissions"
              className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700"
            >
              <Icon name="lock" size={15} /> Patrol permissions
            </Link>
          </div>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Active patrols" value={active.length} icon="route" tone="success" tillDate={rows.length} today={active.length} onClick={() => setStatusFilter("ongoing")} />
        <KpiCard label="Started today" value={today.length} icon="play" tone="info" tillDate={rows.length} today={today.length} onClick={() => setStatusFilter("all")} />
        <KpiCard label="Completed (7d)" value={completed.length} icon="check" tone="forest" tillDate={completed.length} today={completedToday} onClick={() => setStatusFilter("completed")} />
        <KpiCard label="Rangers patrolling" value={ongoing.length ? ongoing.length : 0} icon="users" tone="khaki" tillDate={rangersTotal} today={ongoing.length} onClick={() => router.push("/rangers")} />
        <KpiCard label="Cross-jurisdiction" value={crossJurisdiction.length} icon="map" tone="warning" tillDate={crossJurisdiction.length} today={todayCross} onClick={() => setStatusFilter("authorized")} />
        <KpiCard label="Requiring review" value={review.length} icon="alert" tone="danger" tillDate={review.length} today={todayReview} onClick={() => setStatusFilter("review")} />
      </div>

      {/* Main Patrol Registry with Filter Chips */}
      <Card>
        {/* Small Filter Chips Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
            <Icon name="filter" size={13} />
            <span>Filter Patrol Status:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "All Patrols", count: rows.length },
              { id: "ongoing", label: "Ongoing", count: ongoing.length },
              { id: "completed", label: "Completed", count: completed.length },
              { id: "planned", label: "Planned", count: planned.length },
              { id: "authorized", label: "Authorized Exception", count: crossJurisdiction.length },
              { id: "review", label: "Requires Review", count: review.length },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`flex items-center gap-1.5 rounded-field px-3 py-1 text-xs font-medium transition ${
                  statusFilter === f.id
                    ? "bg-forest-800 text-white shadow-card"
                    : "border border-line bg-white text-ink-soft hover:bg-forest-50 hover:text-ink"
                }`}
              >
                <span>{f.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    statusFilter === f.id ? "bg-white/20 text-white" : "bg-surface text-ink-soft"
                  }`}
                >
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Patrol List Table */}
        <div className="divide-y divide-line">
          {filteredRows.length === 0 ? (
            <div className="py-12 text-center">
              <Icon name="route" size={24} className="mx-auto text-ink-faint" />
              <p className="mt-2 text-sm font-medium text-ink">No patrols match the selected filter.</p>
              <button
                onClick={() => { setStatusFilter("all"); setSearchQuery(""); }}
                className="mt-3 text-xs font-medium text-forest-700 underline"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            filteredRows.map(({ patrol, jurisdiction }) => (
              <div
                key={patrol.id}
                onClick={() => router.push(`/patrols/${patrol.id}`)}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-forest-50/50"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-lg border border-line ${
                      patrol.status === "ongoing"
                        ? "bg-success-soft text-success"
                        : patrol.status === "completed"
                        ? "bg-forest-50 text-forest-800"
                        : "bg-khaki-100 text-khaki-700"
                    }`}
                  >
                    <Icon name={patrol.status === "ongoing" ? "activity" : patrol.status === "completed" ? "check" : "route"} size={16} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-forest-800">{patrol.code}</span>
                      <p className="truncate text-sm font-semibold text-ink">{patrol.title}</p>
                    </div>
                    <p className="text-xs text-ink-soft mt-0.5">
                      Ranger: <strong className="font-medium text-ink">{patrol.leader}</strong> · Location: {unitName(patrol.division)} / {unitName(patrol.range)} / {unitName(patrol.beat)}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-ink-faint">
                      <span>Type: {patrolTypeLabels[patrol.type] ?? patrol.type}</span>
                      {patrol.durationMin > 0 && <span>Duration: {formatMinutes(patrol.durationMin)}</span>}
                      {patrol.distanceKm > 0 && <span>Distance: {formatKm(patrol.distanceKm)}</span>}
                      {patrol.coveragePct > 0 && <span>Coverage: {patrol.coveragePct}%</span>}
                      <span>Scheduled: {timeAgo(patrol.startScheduled)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge tone={patrolStatusTone[patrol.status]} dot>
                    {patrolStatusLabel[patrol.status]}
                  </Badge>
                  <JurisdictionBadge state={jurisdiction.state} />
                  <Link
                    href={`/patrols/${patrol.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex size-7 items-center justify-center rounded-md border border-line bg-white text-ink-soft hover:border-forest-600 hover:text-forest-800"
                    title="View Patrol Details"
                  >
                    <Icon name="chevronRight" size={14} />
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <PatrolsReportDialog open={reportOpen} onClose={() => setReportOpen(false)} />
    </div>
  );
}
