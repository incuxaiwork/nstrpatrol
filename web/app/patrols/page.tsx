"use client";

/**
 * Patrol Dashboard (PRD §6.1, new operating model) — answers
 * "what patrol activity is happening across the forest?".
 *
 * Rangers decide and conduct their patrols within their authorized
 * operational area. This dashboard MONITORS that activity — it does not
 * create or assign patrols. Exceptional (cross-jurisdiction) patrols are
 * surfaced for review and linked to their special authorizations.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { authorizations, patrols, rangers } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader } from "@/components/ui";
import { KpiCard } from "@/components/data";
import { Donut, DonutLegend } from "@/components/charts";
import { Icon } from "@/components/icons";
import { JurisdictionBadge } from "@/components/jurisdiction";
import { resolveJurisdiction } from "@/lib/jurisdiction";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { patrolStatusLabel, patrolStatusTone } from "@/lib/nav";
import { patrolTypeLabels } from "@/lib/mock/patrols";
import { unitName } from "@/lib/mock/hierarchy";
import { timeAgo, formatKm, formatMinutes } from "@/lib/utils";
import { ReportButton } from "@/components/reports/ReportButton";
import { PatrolsReportDialog } from "@/components/reports/dialogs";

export default function PatrolsDashboardPage() {
  const router = useRouter();
  const [reportOpen, setReportOpen] = useState(false);
  const { data: patrolData, error, loading, reload } = useAsyncData(() => patrols.list());
  const auths = useAsyncData(() => authorizations.list());
  const rangersData = useAsyncData(() => rangers.list());
  const rangersTotal = rangersData.data?.length ?? 0;

  const rows = useMemo(() => {
    if (!patrolData || !auths.data) return [];
    return patrolData.map((p) => ({ patrol: p, jurisdiction: resolveJurisdiction(p, auths.data ?? []) }));
  }, [patrolData, auths.data]);

  if (loading || !patrolData || auths.loading || !auths.data) return <SkeletonRows rows={8} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const active = rows.filter((r) => r.patrol.status === "ongoing" || r.patrol.status === "delayed");
  const ongoing = rows.filter((r) => r.patrol.status === "ongoing");
  const completed = rows.filter((r) => r.patrol.status === "completed");
  const today = rows.filter((r) => new Date(r.patrol.startScheduled).toDateString() === new Date().toDateString());
  const exceptional = rows.filter((r) => r.jurisdiction.state !== "normal");
  const crossJurisdiction = rows.filter((r) => r.jurisdiction.state === "authorized-exception");
  const review = rows.filter((r) => r.jurisdiction.state === "requires-review" || r.jurisdiction.state === "pending-review");
  const activeAuths = auths.data.filter((a) => a.status === "active");

  const totalDistance = completed.reduce((a, r) => a + r.patrol.distanceKm, 0);
  const totalDuration = completed.reduce((a, r) => a + r.patrol.durationMin, 0);
  // Coverage is detail-only — list-level average is shown only when the
  // backend actually provides per-patrol values.
  const coverageValues = completed.map((r) => r.patrol.coveragePct).filter((c): c is number => c != null);
  const avgCoverage = coverageValues.length
    ? Math.round(coverageValues.reduce((a, c) => a + c, 0) / coverageValues.length)
    : null;
  const completedToday = completed.filter(
    (r) => new Date(r.patrol.endActual ?? r.patrol.startScheduled).toDateString() === new Date().toDateString()
  ).length;
  const todayCross = today.filter((r) => r.jurisdiction.state === "authorized-exception").length;
  const todayReview = today.filter(
    (r) => r.jurisdiction.state === "requires-review" || r.jurisdiction.state === "pending-review"
  ).length;

  const statusSegments = [
    { label: "Ongoing", value: ongoing.length, color: "#2E7D32" },
    { label: "Completed", value: completed.length, color: "#1F4626" },
    { label: "Delayed", value: rows.filter((r) => r.patrol.status === "delayed").length, color: "#FF8F00" },
    { label: "Planned", value: rows.filter((r) => r.patrol.status === "planned").length, color: "#C3B091" },
    { label: "Cancelled", value: rows.filter((r) => r.patrol.status === "cancelled").length, color: "#B3261E" },
  ].filter((s) => s.value > 0);

  return (
    <div>
      <PageHeader
        title="Patrol Dashboard"
        subtitle="Monitoring patrol activity across the forest — rangers decide and conduct patrols within their authorized areas"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => reload()}
              className="inline-flex h-9 items-center gap-2 rounded-field border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800"
            >
              Refresh
            </button>
            <ReportButton onClick={() => setReportOpen(true)} />
            <Link
              href="/patrols/permissions"
              className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700"
            >
              Patrol permissions
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Active patrols" value={active.length} icon="route" tone="success" tillDate={rows.length} today={active.length} onClick={() => router.push("/patrols/all?status=ongoing")} />
        <KpiCard label="Started today" value={today.length} icon="play" tone="info" tillDate={rows.length} today={today.length} onClick={() => router.push("/patrols/all")} />
        <KpiCard label="Completed (7d)" value={completed.length} icon="check" tone="forest" tillDate={completed.length} today={completedToday} onClick={() => router.push("/patrols/all?status=completed")} />
        <KpiCard label="Rangers patrolling" value={ongoing.length ? ongoing.length : 0} icon="users" tone="khaki" tillDate={rangersTotal} today={ongoing.length} onClick={() => router.push("/rangers")} />
        <KpiCard label="Cross-jurisdiction" value={crossJurisdiction.length} icon="map" tone="warning" tillDate={crossJurisdiction.length} today={todayCross} onClick={() => router.push("/patrols/all?jurisdiction=authorized")} />
        <KpiCard label="Requiring review" value={review.length} icon="alert" tone="danger" tillDate={review.length} today={todayReview} onClick={() => router.push("/patrols/all?jurisdiction=review")} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {/* Exceptional patrols */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Exceptional patrols"
            icon="alert"
            iconTone="khaki"
            subtitle="Patrols outside the ranger's normal jurisdiction — authorized, pending or requiring review"
            actions={
              <Link href="/patrols/permissions" className="text-xs font-medium text-forest-700 hover:underline">
                Manage permissions →
              </Link>
            }
          />
          <div className="divide-y divide-line">
            {exceptional.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-ink-soft">No exceptional patrols. All activity is within normal jurisdiction.</p>
            )}
            {exceptional.slice(0, 6).map(({ patrol, jurisdiction }) => (
              <button
                key={patrol.id}
                onClick={() => router.push(`/patrols/${patrol.id}`)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-forest-50/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{patrol.title}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {patrol.leader} · {unitName(patrol.division)} / {unitName(patrol.range)} / {unitName(patrol.beat)} · {timeAgo(patrol.startScheduled)}
                  </p>
                  {jurisdiction.authorization && (
                    <p className="mt-0.5 font-mono text-[11px] text-forest-800">
                      {jurisdiction.authorization.id} · {jurisdiction.authorization.approvedBy ?? "—"}
                    </p>
                  )}
                </div>
                <JurisdictionBadge state={jurisdiction.state} />
              </button>
            ))}
          </div>
        </Card>

        {/* Live patrols */}
        <Card>
          <CardHeader title="Ongoing patrols" icon="activity" iconTone="forest" subtitle="Rangers currently in the field" />
          <div className="space-y-2 p-3">
            {ongoing.length === 0 && <p className="px-2 py-4 text-center text-sm text-ink-soft">No patrols currently in the field.</p>}
            {ongoing.map(({ patrol, jurisdiction }) => (
              <Link
                key={patrol.id}
                href={`/patrols/${patrol.id}`}
                className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 transition-colors hover:border-forest-600 hover:bg-forest-50"
              >
                <span className="relative flex size-2.5 shrink-0">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-success" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{patrol.title}</p>
                  <p className="text-xs text-ink-soft">
                    {patrol.type ? patrolTypeLabels[patrol.type] : "Field"} · {patrol.leader} · {patrol.durationMin > 0 ? formatMinutes(patrol.durationMin) : "in progress"}
                  </p>
                  {jurisdiction.state !== "normal" && (
                    <p className="mt-1"><JurisdictionBadge state={jurisdiction.state} /></p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/* Recent completed */}
        <Card className="xl:col-span-1">
          <CardHeader
            title="Recent completed patrols"
            icon="history"
            actions={
              <Link href="/patrols/all?status=completed" className="text-xs font-medium text-forest-700 hover:underline">
                All completed →
              </Link>
            }
          />
          <div className="divide-y divide-line">
            {completed.slice(0, 5).map(({ patrol }) => (
              <Link
                key={patrol.id}
                href={`/patrols/${patrol.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-forest-50/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{patrol.title}</p>
                  <p className="text-xs text-ink-soft">
                    {patrol.code} · {patrol.coveragePct}% coverage · {timeAgo(patrol.endActual ?? patrol.startScheduled)}
                  </p>
                </div>
                <Badge tone={patrolStatusTone[patrol.status]}>{patrolStatusLabel[patrol.status]}</Badge>
              </Link>
            ))}
          </div>
        </Card>

        {/* Patrol mix + operational stats */}
        <Card className="xl:col-span-1">
          <CardHeader title="Patrol mix" icon="chart" subtitle="Status distribution and operational totals" />
          <div className="flex items-center gap-4 px-4 py-4">
            <Donut segments={statusSegments} centerValue={String(rows.length)} centerLabel="patrols" />
            <div className="flex-1 space-y-2">
              <DonutLegend segments={statusSegments} />
              <dl className="space-y-1.5 border-t border-line pt-2 text-xs">
                <div className="flex justify-between"><dt className="text-ink-soft">Distance (completed)</dt><dd className="font-semibold text-ink">{formatKm(totalDistance)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-soft">Field time (completed)</dt><dd className="font-semibold text-ink">{formatMinutes(totalDuration)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-soft">Avg coverage</dt><dd className="font-semibold text-ink">{avgCoverage != null ? `${avgCoverage}%` : "—"}</dd></div>
              </dl>
            </div>
          </div>
        </Card>

        {/* Active authorizations */}
        <Card className="xl:col-span-1">
          <CardHeader
            title="Active authorizations"
            icon="lock"
            iconTone="navy"
            subtitle="Special patrol permissions currently valid"
            actions={
              <Link href="/patrols/permissions" className="text-xs font-medium text-forest-700 hover:underline">
                All permissions →
              </Link>
            }
          />
          <div className="divide-y divide-line">
            {activeAuths.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-soft">No active authorizations.</p>}
            {activeAuths.slice(0, 5).map((a) => (
              <Link
                key={a.id}
                href={`/patrols/permissions/${a.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-forest-50/40"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-info-soft text-info">
                  <Icon name="lock" size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{a.id}</p>
                  <p className="text-xs text-ink-soft">
                    {unitName(a.homeBeat)} → {unitName(a.authBeat)} · until {new Date(a.validUntil).toLocaleDateString()}
                  </p>
                </div>
                <Badge tone="success">Active</Badge>
              </Link>
            ))}
          </div>
        </Card>
      </div>
      <PatrolsReportDialog open={reportOpen} onClose={() => setReportOpen(false)} />
    </div>
  );
}
