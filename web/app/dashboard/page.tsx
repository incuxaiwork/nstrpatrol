"use client";

/**
 * Dashboard — One-Stop Operational Command Center for NSTR Forest Reserve.
 * Includes Directorate Ticker, Active SOS Banner, Weather & Fire Risk,
 * Ranger Device Health, Wildlife Tracker, Map Quick Filters, High-Risk Beats,
 * Pending Authorizations & Range Readiness Gauges.
 */

import { useState } from "react";
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
  const spatial = useAsyncData(() => gis.spatial());
  const [mapFilter, setMapFilter] = useState<"all" | "tigers" | "incidents" | "patrols">("all");
  const [pendingApprovals, setPendingApprovals] = useState([
    { id: "auth-101", ranger: "Ranger M. Rama", beat: "Tummurukota", type: "Special Night Patrol", time: "25 mins ago" },
    { id: "auth-102", ranger: "Ranger S. Rao", beat: "Gotlagattu", type: "Cross-Boundary Surveillance", time: "1 hour ago" },
  ]);

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

  const handleApprove = (id: string, name: string) => {
    setPendingApprovals((prev) => prev.filter((a) => a.id !== id));
    pushToast("success", "Authorization Granted", `Approved request for ${name}`);
  };

  return (
    <div className="space-y-4">
      {/* 1. Directorate Command Broadcast Ticker */}
      <div className="flex items-center gap-3 rounded-card border border-forest-600/30 bg-forest-800 px-4 py-2.5 text-xs text-white shadow-card">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-forest-700 text-khaki-400">
          <Icon name="alert" size={14} />
        </span>
        <div className="flex-1 truncate">
          <strong className="font-semibold text-khaki-300">DIRECTORATE ADVISORY:</strong> High Alert issued for Fringe Beats due to reported timber smuggling activity near VP South Range. All night patrols require authorization.
        </div>
        <Badge tone="khaki">Official Notice</Badge>
      </div>

      {/* 2. Active SOS Emergency Response Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger/40 bg-danger-soft/20 px-4 py-3 shadow-card">
        <div className="flex items-center gap-3">
          <span className="relative flex size-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-danger" />
          </span>
          <div>
            <p className="text-xs font-semibold text-danger">🚨 ACTIVE FIELD EMERGENCY (SOS ALERT)</p>
            <p className="text-xs text-ink">Ranger K. Ali · Beat 14 (Tummurukota) · Signal received 12 mins ago</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/sos"
            className="rounded-field bg-danger px-3.5 py-1.5 text-xs font-medium text-white shadow-card hover:bg-danger/90"
          >
            Dispatch Response Unit →
          </Link>
        </div>
      </div>

      {/* Page Header with Weather & Fire Index */}
      <PageHeader
        title="Dashboard"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Weather & Fire Risk Badge */}
            <div className="flex items-center gap-2 rounded-field border border-line-strong bg-white px-3 py-1.5 text-xs shadow-card">
              <span className="font-medium text-ink-soft">Forest Weather:</span>
              <span className="font-semibold text-ink">🌤️ 32°C Clear</span>
              <span className="text-ink-faint">|</span>
              <Badge tone="warning" dot>Fire Risk: Moderate</Badge>
            </div>

            {/* Compact Patrol Status Box */}
            <div className="flex items-center gap-2 rounded-field border border-line-strong bg-white px-3 py-1.5 text-xs shadow-card">
              <span className="font-medium text-ink-soft">Patrol Status:</span>
              <Badge tone="success" dot>Ongoing ({ongoingCount})</Badge>
              <Badge tone="forest" dot>Completed ({completedCount})</Badge>
            </div>

            <button
              onClick={() => pushToast("info", "Live refresh", "Dashboard refreshed with live telemetry.")}
              aria-label="Refresh dashboard"
              title="Refresh dashboard"
              className="flex size-9 items-center justify-center rounded-field border border-line-strong bg-white text-ink hover:border-forest-600 hover:text-forest-800"
            >
              <Icon name="refresh" size={15} />
            </button>
          </div>
        }
      />

      {/* Executive KPI Row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <KpiCard label="Active patrols" value={data.activePatrols} icon="route" tone="success" tillDate={data.patrolsTotal} today={data.activePatrols} onClick={() => router.push("/patrols")} />
        <KpiCard label="Normal patrols" value={data.normalToday} icon="check" tone="forest" tillDate={data.normalTotal} today={data.normalToday} onClick={() => router.push("/patrols?area=normal")} />
        <KpiCard label="Authorized patrols" value={data.authorizedToday} icon="lock" tone="info" tillDate={data.authorizedTotal} today={data.authorizedToday} onClick={() => router.push("/patrols?area=authorized")} />
        <KpiCard label="Open incidents" value={data.openIncidents} icon="alert" tone="danger" tillDate={data.incidentsTotal} today={data.openIncidents} onClick={() => router.push("/observations")} />
        <KpiCard label="Rangers on duty" value={data.rangersOnDuty} unit={`/${data.rangersTotal}`} icon="users" tone="khaki" tillDate={data.rangersTotal} today={data.rangersOnDuty} onClick={() => router.push("/rangers")} />
        <KpiCard label="Coverage" value={data.coveragePct} unit="%" icon="target" tone="warning" tillDate={`${data.coveragePct}%`} today={`${data.coverageToday}%`} onClick={() => router.push("/gis")} />
        <KpiCard label="Foot distance" value="148.5" unit="km" icon="route" tone="forest" tillDate="1,420 km" today="148.5 km" onClick={() => router.push("/analytics")} />
        <KpiCard label="Tiger & Sightings" value="3 Tigers" unit=" / 2 Leopards" icon="binoculars" tone="success" tillDate="42 total" today="5 species" onClick={() => router.push("/observations")} />
      </div>

      {/* Ranger Device Health & Connectivity Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-white px-4 py-2.5 shadow-card text-xs">
        <div className="flex items-center gap-2">
          <Icon name="users" size={15} className="text-forest-700" />
          <span className="font-semibold text-ink">Ranger Device Health & Signal Status:</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-medium text-ink-soft">
            <span className="size-2 rounded-full bg-success" />
            GPS Connected: <strong className="text-ink">{Math.max(0, data.rangersOnDuty - 2)}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-ink-soft">
            <span className="size-2 rounded-full bg-warning" />
            Low Battery (&lt;20%): <strong className="text-ink">1</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-ink-soft">
            <span className="size-2 rounded-full bg-danger" />
            Offline / No Signal: <strong className="text-ink">1</strong>
          </span>
        </div>
      </div>

      {/* Map Quick-Filter Buttons & Map Workspace */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-ink">
            <Icon name="map" size={15} className="text-forest-700" />
            <span>Map Layers Quick Filter:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "All Layers" },
              { id: "tigers", label: "🐾 Tigers & Wildlife" },
              { id: "incidents", label: "⚠️ Incidents Only" },
              { id: "patrols", label: "🥾 Active Patrols" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setMapFilter(f.id as typeof mapFilter);
                  pushToast("info", "Filter applied", `Showing ${f.label}`);
                }}
                className={`rounded-field px-3 py-1 text-xs font-medium transition ${
                  mapFilter === f.id
                    ? "bg-forest-800 text-white shadow-card"
                    : "border border-line bg-white text-ink-soft hover:bg-forest-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <MapWorkspace
          mode="overview"
          heightClass="h-[400px]"
          liveBeats={spatial.data.beats}
          compartments={spatial.data.compartments}
          boundary={spatial.data.boundary}
          grids={spatial.data.grids}
          onSelect={(id) => {
            if (id && id.startsWith("m")) pushToast("info", "Map selection", `Selected map item ${id}`);
          }}
        />
      </Card>

      {/* High-Risk Threatened Beats Warning Card */}
      <Card className="border-danger/30 bg-danger-soft/10">
        <CardHeader
          title="High-risk threatened beats"
          subtitle="Vulnerable reserve fringe beats requiring urgent patrol coverage"
          icon="alert"
          iconTone="danger"
          actions={<Badge tone="danger">2 Unpatrolled Beats</Badge>}
        />
        <div className="divide-y divide-line">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="size-2.5 shrink-0 rounded-full bg-danger animate-pulse" />
              <div>
                <p className="text-sm font-semibold text-ink">
                  Tummurukota Beat <span className="text-xs font-normal text-ink-soft">(V.P. South Range)</span>
                </p>
                <p className="text-xs font-medium text-danger">
                  ⚠️ Threat: High Poaching Corridor &amp; Snare Risk · Unpatrolled for 14 days
                </p>
              </div>
            </div>
            <Link
              href="/gis"
              className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium text-forest-700 shadow-card hover:bg-forest-50"
            >
              View on Map →
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="size-2.5 shrink-0 rounded-full bg-danger" />
              <div>
                <p className="text-sm font-semibold text-ink">
                  Gotlagattu Beat <span className="text-xs font-normal text-ink-soft">(Markapur Range)</span>
                </p>
                <p className="text-xs font-medium text-danger">
                  ⚠️ Threat: Timber Smuggling Vulnerability · Unpatrolled for 12 days
                </p>
              </div>
            </div>
            <Link
              href="/gis"
              className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium text-forest-700 shadow-card hover:bg-forest-50"
            >
              View on Map →
            </Link>
          </div>
        </div>
      </Card>

      {/* Grid: Incidents, Patrols, Pending Approvals, Range Readiness */}
      <div className="grid gap-4 lg:grid-cols-2">
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

        {/* Pending Patrol Authorization Approvals */}
        <Card>
          <CardHeader
            title="Pending patrol authorizations"
            subtitle="Special night patrols & exception requests awaiting officer signoff"
            icon="lock"
            actions={<Badge tone="warning">{pendingApprovals.length} Pending</Badge>}
          />
          <div className="divide-y divide-line">
            {pendingApprovals.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-soft">All authorization requests approved!</p>
            ) : (
              pendingApprovals.map((req) => (
                <div key={req.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{req.ranger}</p>
                    <p className="text-xs text-ink-soft">
                      {req.type} · {req.beat} Beat · {req.time}
                    </p>
                  </div>
                  <button
                    onClick={() => handleApprove(req.id, req.ranger)}
                    className="rounded-field bg-forest-800 px-3 py-1 text-xs font-medium text-white shadow-card hover:bg-forest-700"
                  >
                    Grant Authorization
                  </button>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Range Coverage Readiness Gauge */}
        <Card>
          <CardHeader
            title="Range coverage readiness"
            subtitle="Patrol health across operational forest ranges"
            icon="target"
            actions={
              <Link href="/analytics" className="text-xs font-medium text-forest-700 hover:underline">
                Full analytics →
              </Link>
            }
          />
          <div className="space-y-3 p-4">
            {[
              { range: "Markapur Range", pct: 92, status: "High Coverage", tone: "bg-success" },
              { range: "Srisailam Range", pct: 85, status: "Good Coverage", tone: "bg-forest-600" },
              { range: "V.P. South Range", pct: 78, status: "Moderate Coverage", tone: "bg-warning" },
            ].map((r) => (
              <div key={r.range} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-ink">{r.range}</span>
                  <span className="font-semibold text-ink">{r.pct}% ({r.status})</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                  <div className={`h-full ${r.tone}`} style={{ width: `${r.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Heatmap preview */}
      <Card>
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-card border border-line bg-white" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-card border border-line bg-white" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-card border border-line bg-white" />
        <div className="h-64 animate-pulse rounded-card border border-line bg-white" />
      </div>
    </div>
  );
}