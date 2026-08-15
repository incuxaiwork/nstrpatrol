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
import { MapWorkspace } from "@/components/map";
import { LineChart, Donut, DonutLegend } from "@/components/charts";
import { ErrorState } from "@/components/ui/loading";
import {
  patrolStatusLabel,
  patrolStatusTone,
  severityLabel,
  severityTone,
  observationStatusLabel,
  observationStatusTone,
} from "@/lib/nav";
import { categoryMeta } from "@/lib/mock/observations";
import { mockDivisions, unitName } from "@/lib/mock/hierarchy";
import { timeAgo } from "@/lib/utils";
import type { AnalyticsDataset } from "@/lib/types";

const heatRows = [
  { division: "North", ranges: ["N-1", "N-2"], cells: [87, 45] },
  { division: "Central", ranges: ["C-1", "C-2"], cells: [95, 61] },
  { division: "South", ranges: ["S-1", "S-2"], cells: [70, 44] },
];

export default function DashboardPage() {
  const router = useRouter();
  const { pushToast, scope } = useApp();
  const { data, error, loading, reload } = useAsyncData(() => dashboard.summary());
  // Live boundaries for the GIS overview card (backend GeoJSON, mock fallback).
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

  const activityDataset: AnalyticsDataset = {
    labels: data.activity.map((a) => a.hour),
    series: [
      { name: "Patrols", values: data.activity.map((a) => a.patrols) },
      { name: "Reports", values: data.activity.map((a) => a.reports) },
    ],
  };

  const statusSegments = data.byStatus
    .filter((s) => s.count > 0)
    .map((s) => ({
      label: patrolStatusLabel[s.status],
      value: s.count,
      color:
        s.status === "ongoing"
          ? "#2E7D32"
          : s.status === "completed"
            ? "#1F4626"
            : s.status === "delayed"
              ? "#FF8F00"
              : s.status === "cancelled"
                ? "#B3261E"
                : "#C3B091",
    }));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Operational picture — ${scope.forest} · ${scope.division} · ${scope.range} · ${scope.beat}`}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => pushToast("info", "Live refresh", "Dashboard refreshes every 60 s (mock).")}
              className="inline-flex h-9 items-center gap-2 rounded-field border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800"
            >
              <Icon name="refresh" size={15} />
              Refresh
            </button>
            <button
              onClick={() => router.push("/patrols/permissions/new")}
              className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700"
            >
              <Icon name="lock" size={15} />
              Create authorization
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

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {/* GIS overview */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="GIS overview"
            subtitle="Live patrol activity across the forest"
            icon="map"
            actions={
              <Link href="/gis" className="text-xs font-medium text-forest-700 hover:underline">
                Open GIS Intelligence →
              </Link>
            }
          />
          <div className="p-3">
            <MapWorkspace
              mode="overview"
              heightClass="h-[340px]"
              liveBeats={spatial.data.beats}
              compartments={spatial.data.compartments}
              onSelect={(id) => {
                if (id && id.startsWith("m")) pushToast("info", "Map selection", `Selected map item ${id}`);
              }}
            />
          </div>
        </Card>

        {/* Patrol status + alerts */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Patrol status" icon="route" subtitle="All patrols by lifecycle status" />
            <div className="flex items-center gap-4 px-4 py-4">
              <Donut
                segments={statusSegments}
                centerValue={String(data.byStatus.reduce((a, s) => a + s.count, 0))}
                centerLabel="patrols"
              />
              <div className="flex-1">
                <DonutLegend segments={statusSegments} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Alerts"
              icon="alert"
              iconTone="danger"
              actions={<Badge tone="danger">{data.alerts.length} unread</Badge>}
            />
            <div className="divide-y divide-line">
              {data.alerts.slice(0, 4).map((a) => (
                <div key={a.id} className="flex items-start gap-2.5 px-4 py-2.5">
                  <span
                    className={cn(
                      "mt-1 size-2 shrink-0 rounded-full",
                      a.kind === "critical" ? "bg-danger" : a.kind === "warning" ? "bg-warning" : "bg-info"
                    )}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{a.title}</p>
                    <p className="line-clamp-2 text-xs text-ink-soft">{a.body}</p>
                  </div>
                  <span className="ml-auto shrink-0 text-[11px] text-ink-faint">{timeAgo(a.time)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/* Activity timeline */}
        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader title="Today's activity" icon="activity" subtitle="Patrols and reports by hour" />
          <div className="px-4 py-3">
            <LineChart dataset={activityDataset} height={190} />
          </div>
        </Card>

        {/* Forest hierarchy */}
        <Card className="lg:col-span-2 xl:col-span-2">
          <CardHeader title="Forest hierarchy" icon="tree" subtitle="Distribution across operational units" />
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            {mockDivisions.map((d) => (
              <div key={d.id} className="rounded-card border border-line bg-surface p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">{d.name}</p>
                  <Badge tone="forest">{d.areaKm2} km²</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-ink-soft">
                  <span>Patrols</span>
                  <span className="font-semibold text-ink">42</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-ink-soft">
                  <span>Coverage</span>
                  <span className="font-semibold text-ink">86%</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-ink-soft">
                  <span>Rangers</span>
                  <span className="font-semibold text-ink">8</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Today's incidents */}
        <Card>
          <CardHeader
            title="Today's incidents"
            icon="alert"
            iconTone="danger"
            actions={
              <Link href="/observations" className="text-xs font-medium text-forest-700 hover:underline">
                View all →
              </Link>
            }
          />
          <div className="divide-y divide-line">
            {data.incidentsToday.map((inc) => (
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

        {/* Recent reports */}
        <Card>
          <CardHeader
            title="Recent reports"
            icon="binoculars"
            actions={
              <Link href="/observations/list" className="text-xs font-medium text-forest-700 hover:underline">
                All reports →
              </Link>
            }
          />
          <div className="divide-y divide-line">
            {data.recentReports.slice(0, 6).map((o) => (
              <Link
                key={o.id}
                href={`/observations/${o.id}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-forest-50/40"
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: categoryMeta[o.category].color }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{o.title}</p>
                  <p className="text-xs text-ink-soft">
                    {o.code} · {timeAgo(o.recordedAt)}
                  </p>
                </div>
                <Badge tone={observationStatusTone[o.status]}>{observationStatusLabel[o.status]}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
            {data.todayPatrols.slice(0, 6).map((p) => (
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

        {/* Zero patrol zones */}
        <Card>
          <CardHeader
            title="Zero patrol zones"
            icon="alert"
            iconTone="danger"
            actions={<Badge tone="danger">{data.zeroPatrolZones} beats</Badge>}
          />
          <div className="divide-y divide-line">
            {data.zeroPatrolList.map((z) => (
              <div key={z.beat} className="flex items-center gap-3 px-4 py-2.5">
                <span className="size-2.5 shrink-0 rounded-full bg-danger" />
                <p className="flex-1 text-sm text-ink">{z.beat}</p>
                <p className="text-xs text-ink-soft">No patrol for {z.days} days</p>
                <Link href="/gis" className="text-xs font-medium text-forest-700 hover:underline">
                  View →
                </Link>
              </div>
            ))}
          </div>
          <div className="border-t border-line p-4">
            <p className="text-xs text-ink-soft">
              Beats without patrol coverage for 12+ days. Review in{" "}
              <Link href="/gis" className="font-medium text-forest-700 hover:underline">GIS Intelligence</Link>.
            </p>
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
          <div className="grid gap-1" style={{ gridTemplateColumns: "auto repeat(6, minmax(40px, 1fr))" }}>
            {heatRows.map((row, ri) => (
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
          <p className="mt-2 text-[11px] text-ink-faint">Patrol count per division × range, last 30 days (mock).</p>
        </div>
      </Card>

      {/* Quick actions */}
      <Card className="mt-4">
        <CardHeader title="Quick actions" icon="zap" subtitle="Jump into common workflows" />
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Patrol operations", icon: "route" as const, href: "/patrols" },
            { label: "Patrol permissions", icon: "lock" as const, href: "/patrols/permissions" },
            { label: "Review reports", icon: "binoculars" as const, href: "/observations" },
            { label: "GIS intelligence", icon: "map" as const, href: "/gis" },
            { label: "Ranger management", icon: "users" as const, href: "/rangers" },
            { label: "Analytics", icon: "chart" as const, href: "/analytics" },
          ].map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className="flex flex-col items-center gap-2 rounded-card border border-line bg-surface px-3 py-4 text-center transition-colors hover:border-forest-600 hover:bg-forest-50"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-white text-forest-800 shadow-card">
                <Icon name={a.icon} size={18} />
              </span>
              <span className="text-xs font-medium text-ink">{a.label}</span>
            </Link>
          ))}
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