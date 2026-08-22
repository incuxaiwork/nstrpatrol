"use client";

/**
 * Dashboard (PRD §5) — operational picture: KPIs, GIS overview, forest
 * hierarchy, today's patrols, incidents, recent reports, activity timeline,
 * quick actions and alerts.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { dashboard, gis } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader } from "@/components/ui";
import { KpiCard } from "@/components/data";
import { Icon } from "@/components/icons";
import { MapWorkspace } from "@/components/map-loader";
import { ErrorState } from "@/components/ui/loading";
import {
  patrolStatusLabel,
  patrolStatusTone,
  severityLabel,
  severityTone,
} from "@/lib/nav";
import { unitName } from "@/lib/mock/hierarchy";

export default function DashboardPage() {
  const router = useRouter();
  const { pushToast } = useApp();
  const { data, error, loading, reload } = useAsyncData(() => dashboard.summary());
  // Live boundaries for the GIS overview card (backend GeoJSON).
  const spatial = useAsyncData(() => gis.spatial());

  if (loading || !data || spatial.loading || !spatial.data) {
    return <DashboardSkeleton />;
  }
  if (error) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <ErrorState message={error.message} onRetry={reload} />
      </div>
    );
  }
  if (spatial.error) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <ErrorState message={spatial.error.message} onRetry={spatial.reload} />
      </div>
    );
  }

  const ongoingCount = data.byStatus.find((s) => s.status === "ongoing")?.count ?? 0;
  const completedCount = data.byStatus.find((s) => s.status === "completed")?.count ?? 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Compact Patrol Status Box in Header */}
            <div className="flex items-center gap-2 rounded-field border border-line-strong bg-white px-3 py-1.5 text-xs shadow-card">
              <span className="font-medium text-ink-soft">Patrol Status:</span>
              <Badge tone="success" dot>Ongoing ({ongoingCount})</Badge>
              <Badge tone="forest" dot>Completed ({completedCount})</Badge>
            </div>
            <button
              onClick={() => pushToast("info", "Live refresh", "Dashboard refreshes every 60 s (mock).")}
              aria-label="Refresh dashboard"
              title="Refresh dashboard"
              className="flex size-9 items-center justify-center rounded-field border border-line-strong bg-white text-ink hover:border-forest-600 hover:text-forest-800"
            >
              <Icon name="refresh" size={15} />
            </button>
          </div>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Active patrols" value={data.activePatrols} icon="route" tone="success" tillDate={data.patrolsTotal} today={data.activePatrols} onClick={() => router.push("/patrols")} />
        <KpiCard label="Normal patrols" value={data.normalToday} icon="check" tone="forest" tillDate={data.normalTotal} today={data.normalToday} onClick={() => router.push("/patrols?area=normal")} />
        <KpiCard label="Authorized patrols" value={data.authorizedToday} icon="lock" tone="info" tillDate={data.authorizedTotal} today={data.authorizedToday} onClick={() => router.push("/patrols?area=authorized")} />
        <KpiCard label="Open incidents" value={data.openIncidents} icon="alert" tone="danger" tillDate={data.incidentsTotal} today={data.openIncidents} onClick={() => router.push("/observations")} />
        <KpiCard label="Rangers on duty" value={data.rangersOnDuty} unit={`/${data.rangersTotal}`} icon="users" tone="khaki" tillDate={data.rangersTotal} today={data.rangersOnDuty} onClick={() => router.push("/rangers")} />
        <KpiCard label="Coverage" value={data.coveragePct} unit="%" icon="target" tone="warning" tillDate={`${data.coveragePct}%`} today={`${data.coverageToday}%`} onClick={() => router.push("/gis")} />
      </div>

      {/* Live patrol map */}
      <div className="mt-4">
        <MapWorkspace
          mode="overview"
          heightClass="h-[380px]"
          liveBeats={spatial.data.beats}
          compartments={spatial.data.compartments}
          boundary={spatial.data.boundary}
          grids={spatial.data.grids}
          onSelect={(id) => {
            if (id && id.startsWith("m")) pushToast("info", "Map selection", `Selected map item ${id}`);
          }}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Recent incidents */}
        <Card>
          <CardHeader
            title="Recent incidents"
            icon="alert"
            iconTone="danger"
            actions={
              <Link href="/observations" className="text-xs font-medium text-forest-700 hover:underline">
                View all →
              </Link>
            }
          />
          <div className="divide-y divide-line">
            {data.incidentsToday.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-ink-soft">No incidents recorded today.</p>
            )}
            {data.incidentsToday.slice(0, 2).map((inc) => (
              <div key={inc.title} className="flex items-center gap-3 px-4 py-2.5">
                <Badge tone={severityTone[inc.severity]} dot>
                  {severityLabel[inc.severity]}
                </Badge>
                <p className="flex-1 truncate text-sm text-ink">{inc.title}</p>
                <span className="text-xs text-ink-faint">{inc.time}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Today's patrols */}
        <Card>
          <CardHeader
            title="Today's patrols"
            icon="route"
            actions={
              <Link href="/patrols" className="text-xs font-medium text-forest-700 hover:underline">
                All patrols →
              </Link>
            }
          />
          <div className="divide-y divide-line">
            {data.todayPatrols.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-ink-soft">No patrols scheduled today.</p>
            )}
            {data.todayPatrols.slice(0, 2).map((p) => (
              <Link
                key={p.id}
                href={`/patrols/${p.id}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-forest-50/40"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-forest-50 text-forest-800">
                  <Icon name="route" size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{p.title}</p>
                  <p className="text-xs text-ink-soft">
                    {p.code} · {unitName(p.beat)} · {p.leader}
                  </p>
                </div>
                <Badge tone={patrolStatusTone[p.status]}>{patrolStatusLabel[p.status]}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* Heatmap preview */}
      <Card className="mt-4">
        <CardHeader
          title="Patrol heatmap preview"
          icon="grid"
          subtitle="Activity density across divisions × ranges"
          actions={
            <Link href="/analytics" className="text-xs font-medium text-forest-700 hover:underline">
              Open analytics →
            </Link>
          }
        />
        <div className="p-4">
          {data.heatmap && data.heatmap.length > 0 ? (
            <div className="grid gap-1" style={{ gridTemplateColumns: "auto repeat(7, minmax(40px, 1fr))" }}>
              {data.heatmap.map((row, ri) => (
                <div key={row.division} className="contents">
                  <div className="pr-2 text-[11px] font-medium text-ink-soft">{row.division}</div>
                  {row.cells.map((c, ci) => (
                    <div
                      key={`${ri}-${ci}`}
                      className="flex h-9 items-center justify-center rounded text-[11px] font-medium"
                      style={{ background: `rgba(29, 70, 38, ${0.12 + c * 0.55})`, color: c > 0.45 ? "#fff" : "#1F4626" }}
                      title={`${row.ranges[ci]}: ${c}`}
                    >
                      {c}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-ink-soft">
              No patrol density data yet — start patrols to populate the heatmap.
            </p>
          )}
          <p className="mt-2 text-[11px] text-ink-faint">Patrol count per division × range, last 30 days.</p>
        </div>
      </Card>
    </div>
  );
}

function cn(...args: unknown[]) {
  return args.filter(Boolean).join(" ");
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded bg-zinc-200" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-card border border-line bg-white" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="h-96 animate-pulse rounded-card border border-line bg-white xl:col-span-2" />
        <div className="h-96 animate-pulse rounded-card border border-line bg-white" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-card border border-line bg-white" />
        <div className="h-64 animate-pulse rounded-card border border-line bg-white" />
      </div>
    </div>
  );
}