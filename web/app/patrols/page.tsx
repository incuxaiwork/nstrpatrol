"use client";

/**
 * Patrol Dashboard (PRD §6.1) — answers
 * "what patrol activity is happening across the forest?".
 *
 * 3-Column Operational Layout: Ongoing, Completed, Planned.
 * Surfacing Exceptional Patrols and Active Authorizations.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
import { timeAgo, formatMinutes } from "@/lib/utils";
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
  const ongoing = rows.filter((r) => r.patrol.status === "ongoing" || r.patrol.status === "delayed");
  const completed = rows.filter((r) => r.patrol.status === "completed");
  const planned = rows.filter((r) => r.patrol.status === "planned");
  const today = rows.filter((r) => new Date(r.patrol.startScheduled).toDateString() === new Date().toDateString());
  const exceptional = rows.filter((r) => r.jurisdiction.state !== "normal");
  const crossJurisdiction = rows.filter((r) => r.jurisdiction.state === "authorized-exception");
  const review = rows.filter((r) => r.jurisdiction.state === "requires-review" || r.jurisdiction.state === "pending-review");
  const activeAuths = auths.data.filter((a) => a.status === "active");

  const completedToday = completed.filter(
    (r) => new Date(r.patrol.endActual ?? r.patrol.startScheduled).toDateString() === new Date().toDateString()
  ).length;
  const todayCross = today.filter((r) => r.jurisdiction.state === "authorized-exception").length;
  const todayReview = today.filter(
    (r) => r.jurisdiction.state === "requires-review" || r.jurisdiction.state === "pending-review"
  ).length;

  return (
    <div>
      <PageHeader
        title="Patrol Dashboard"
        actions={
          <div className="flex items-center gap-2">
            {/* Round Arrow Refresh Icon Button */}
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
              Patrol permissions
            </Link>
          </div>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Active patrols" value={active.length} icon="route" tone="success" tillDate={rows.length} today={active.length} onClick={() => router.push("/patrols/all?status=ongoing")} />
        <KpiCard label="Started today" value={today.length} icon="play" tone="info" tillDate={rows.length} today={today.length} onClick={() => router.push("/patrols/all")} />
        <KpiCard label="Completed (7d)" value={completed.length} icon="check" tone="forest" tillDate={completed.length} today={completedToday} onClick={() => router.push("/patrols/all?status=completed")} />
        <KpiCard label="Rangers patrolling" value={ongoing.length ? ongoing.length : 0} icon="users" tone="khaki" tillDate={rangersTotal} today={ongoing.length} onClick={() => router.push("/rangers")} />
        <KpiCard label="Cross-jurisdiction" value={crossJurisdiction.length} icon="map" tone="warning" tillDate={crossJurisdiction.length} today={todayCross} onClick={() => router.push("/patrols/all?jurisdiction=authorized")} />
        <KpiCard label="Requiring review" value={review.length} icon="alert" tone="danger" tillDate={review.length} today={todayReview} onClick={() => router.push("/patrols/all?jurisdiction=review")} />
      </div>

      {/* 3 Operational Columns: 1. Ongoing | 2. Completed | 3. Planned */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Column 1: Ongoing Patrols */}
        <Card>
          <CardHeader
            title="Ongoing patrols"
            icon="activity"
            iconTone="success"
            actions={<Badge tone="success" dot>{ongoing.length} Active</Badge>}
          />
          <div className="divide-y divide-line">
            {ongoing.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-soft">No active patrols in the field.</p>
            ) : (
              ongoing.map(({ patrol, jurisdiction }) => (
                <Link
                  key={patrol.id}
                  href={`/patrols/${patrol.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-forest-50/40"
                >
                  <span className="relative flex size-2.5 shrink-0">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-success" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{patrol.title}</p>
                    <p className="text-xs text-ink-soft">
                      {patrol.code} · {patrol.leader} · {unitName(patrol.beat)}
                    </p>
                    <p className="text-xs text-ink-faint">
                      {patrolTypeLabels[patrol.type]} · {patrol.durationMin > 0 ? formatMinutes(patrol.durationMin) : "in progress"}
                    </p>
                    {jurisdiction.state !== "normal" && (
                      <p className="mt-1"><JurisdictionBadge state={jurisdiction.state} /></p>
                    )}
                  </div>
                  <Badge tone={patrolStatusTone[patrol.status]}>{patrolStatusLabel[patrol.status]}</Badge>
                </Link>
              ))
            )}
          </div>
        </Card>

        {/* Column 2: Completed Patrols */}
        <Card>
          <CardHeader
            title="Completed patrols"
            icon="check"
            iconTone="forest"
            actions={
              <Link href="/patrols/all?status=completed" className="text-xs font-medium text-forest-700 hover:underline">
                View all →
              </Link>
            }
          />
          <div className="divide-y divide-line">
            {completed.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-soft">No completed patrols recorded.</p>
            ) : (
              completed.slice(0, 6).map(({ patrol }) => (
                <Link
                  key={patrol.id}
                  href={`/patrols/${patrol.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-forest-50/40"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-forest-50 text-forest-800">
                    <Icon name="check" size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{patrol.title}</p>
                    <p className="text-xs text-ink-soft">
                      {patrol.code} · {patrol.leader} · {unitName(patrol.beat)}
                    </p>
                    <p className="text-xs text-forest-700 font-medium">
                      {patrol.coveragePct}% coverage · {timeAgo(patrol.endActual ?? patrol.startScheduled)}
                    </p>
                  </div>
                  <Badge tone="forest">Completed</Badge>
                </Link>
              ))
            )}
          </div>
        </Card>

        {/* Column 3: Planned Patrols */}
        <Card>
          <CardHeader
            title="Planned patrols"
            icon="route"
            iconTone="khaki"
            actions={
              <Link href="/patrols/all?status=planned" className="text-xs font-medium text-forest-700 hover:underline">
                View all →
              </Link>
            }
          />
          <div className="divide-y divide-line">
            {planned.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-soft">No planned patrols scheduled.</p>
            ) : (
              planned.slice(0, 6).map(({ patrol }) => (
                <Link
                  key={patrol.id}
                  href={`/patrols/${patrol.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-forest-50/40"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-khaki-100 text-khaki-700">
                    <Icon name="route" size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{patrol.title}</p>
                    <p className="text-xs text-ink-soft">
                      {patrol.code} · {patrol.leader} · {unitName(patrol.beat)}
                    </p>
                    <p className="text-xs text-ink-faint">
                      Scheduled: {new Date(patrol.startScheduled).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge tone="khaki">Planned</Badge>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Exceptional Patrols & Active Authorizations Grid */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Exceptional patrols */}
        <Card>
          <CardHeader
            title="Exceptional patrols"
            icon="alert"
            iconTone="khaki"
            subtitle="Patrols outside normal jurisdiction requiring signoff"
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
            {exceptional.slice(0, 5).map(({ patrol, jurisdiction }) => (
              <button
                key={patrol.id}
                onClick={() => router.push(`/patrols/${patrol.id}`)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-forest-50/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{patrol.title}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {patrol.leader} · {unitName(patrol.beat)} · {timeAgo(patrol.startScheduled)}
                  </p>
                </div>
                <JurisdictionBadge state={jurisdiction.state} />
              </button>
            ))}
          </div>
        </Card>

        {/* Active authorizations */}
        <Card>
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
