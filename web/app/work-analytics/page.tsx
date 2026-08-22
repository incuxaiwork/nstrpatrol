"use client";

/**
 * Work Analytics — the field-work metrics dashboard (§18).
 *
 * Every figure on this page comes from strict remote aggregations:
 *   GET /api/analytics/patrols   — patrol volume, distance, duration, steps
 *   GET /api/analytics/incidents — incident mix by type / severity / status
 *   GET /api/analytics/health    — telemetry health, pending sync, integrity
 *   GET /api/coverage/grids      — authoritative grid coverage (reused)
 *
 * No mock fallback, no client-side fabrication. Sections with no backend
 * rows surface as empty states; failures surface as error states with retry.
 */

import { useState } from "react";
import { workAnalytics, gis } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Card, CardHeader, PageHeader, SegmentedControl, Badge } from "@/components/ui";
import { KpiCard, StatRow, DataTable, type Column } from "@/components/data";
import { LineChart, BarChart, Donut, DonutLegend } from "@/components/charts";
import { SkeletonRows, ErrorState, EmptyState } from "@/components/ui/loading";
import type { ApiPatrolAnalytics, ApiIncidentAnalytics, ApiHealthAnalytics, ApiGridCoverage } from "@/lib/api";

type PeriodKey = "7d" | "30d" | "90d" | "custom";

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "custom", label: "Custom" },
];

const PALETTE = ["#1F4626", "#C3B091", "#1B365D", "#B3261E", "#4A6572", "#FF8F00"];

const iso = (d: Date): string => d.toISOString();

function fmtKm(km: number): string {
  return km >= 100 ? km.toFixed(0) : km.toFixed(1);
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h >= 100 ? `${h}h` : `${h}h ${m}m`;
}

function fmtCount(v: number): string {
  return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 10_000 ? `${(v / 1000).toFixed(1)}k` : String(v);
}

const INCIDENT_TYPE_LABEL: Record<string, string> = {
  HUMAN_IMPACT: "Human impact",
  ANIMAL_MORTALITY: "Animal mortality",
  SIGHTING: "Sighting",
  WATER_SOURCE: "Water source",
  QUICK_CAPTURE: "Quick capture",
  GENERAL: "General",
};

const SEVERITY_COLOR: Record<string, string> = {
  LOW: "#4A6572",
  MEDIUM: "#FF8F00",
  HIGH: "#B3261E",
};

const dateField = "h-8 rounded-[5px] border border-line bg-white px-2 text-xs text-ink";

/** Half-open analytics window; impure by design — call from effects only. */
function analyticsWindow(period: PeriodKey, customFrom: string, customTo: string): { from: string; to: string } {
  const to = new Date();
  let from: Date;
  if (period === "custom" && customFrom) from = new Date(customFrom);
  else {
    const days = period === "7d" ? -7 : period === "90d" ? -90 : -30;
    from = new Date(to.getTime() + days * 24 * 60 * 60 * 1000);
  }
  const toRaw = customTo ? new Date(customTo) : to;
  return { from: iso(from), to: iso(toRaw) };
}

export default function WorkAnalyticsPage() {
  const { scope } = useApp();
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);

  const deps = [period, customFrom, customTo, reloadKey];

  const patrols = useAsyncData(() => workAnalytics.patrols(analyticsWindow(period, customFrom, customTo)), deps);
  const incidents = useAsyncData(() => workAnalytics.incidents(analyticsWindow(period, customFrom, customTo)), deps);
  const health = useAsyncData(() => workAnalytics.health(analyticsWindow(period, customFrom, customTo)), deps);
  const coverage = useAsyncData(() => gis.coverage(analyticsWindow(period, customFrom, customTo)), deps);

  if (patrols.loading && !patrols.data) return <SkeletonRows rows={8} />;

  const refresh = () => setReloadKey((k) => k + 1);

  const windowLabel =
    period === "custom"
      ? `${customFrom || "—"} → ${customTo || "now"}`
      : PERIODS.find((p) => p.value === period)?.label ?? period;

  return (
    <div>
      <PageHeader
        title="Work Analytics"
        subtitle={`Field-work metrics for ${scope.forest} — last ${windowLabel} (IST)`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl<PeriodKey> value={period} onChange={setPeriod} options={PERIODS} />
            {period === "custom" && (
              <>
                <input type="date" aria-label="From" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={dateField} />
                <input type="date" aria-label="To" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={dateField} />
              </>
            )}
            <button
              onClick={refresh}
              className="rounded-field border border-line-strong bg-white px-3 py-1.5 text-sm font-medium text-ink hover:text-forest-800"
            >
              Refresh
            </button>
          </div>
        }
      />

      <PatrolVolumeSection data={patrols.data} error={patrols.error} onRetry={refresh} />

      <IncidentSection data={incidents.data} error={incidents.error} onRetry={refresh} />

      <CoverageSection data={coverage.data} error={coverage.error} onRetry={refresh} />

      <HealthSection data={health.data} error={health.error} onRetry={refresh} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section 1 — Patrol volume                                          */
/* ------------------------------------------------------------------ */

function PatrolVolumeSection({
  data,
  error,
  onRetry,
}: {
  data: ApiPatrolAnalytics | undefined;
  error?: Error;
  onRetry(): void;
}) {
  if (error) {
    return (
      <Card className="mt-4">
        <CardHeader title="Patrol volume" icon="route" />
        <ErrorState message="Could not load patrol analytics." onRetry={onRetry} />
      </Card>
    );
  }
  if (!data) return null;
  const m = data.metrics;

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Patrols" value={m.count} icon="route" tone="forest" />
        <KpiCard label="Working days" value={m.patrolDays} icon="calendar" tone="info" />
        <KpiCard label="GPS distance" value={fmtKm(m.gpsTrackedDistanceKm)} unit="km" icon="map" tone="success" />
        <KpiCard
          label="Tracked duration"
          value={fmtDuration(m.gpsTrackedDurationSeconds)}
          icon="clock"
          tone="warning"
        />
        <KpiCard label="Points recorded" value={fmtCount(m.pointCount)} icon="pin" tone="khaki" />
        <KpiCard label="Steps" value={fmtCount(m.steps)} icon="activity" tone="forest" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Patrols per day"
            icon="chart"
            subtitle={`${m.countByStatus.ACTIVE ?? 0} active · ${m.completedCount} completed · ${m.countByStatus.CANCELLED ?? 0} cancelled`}
          />
          <div className="p-4">
            {data.byDay.length === 0 ? (
              <NoActivity label="No patrol records in this window." />
            ) : (
              <LineChart
                dataset={{
                  labels: data.byDay.map((d) => d.day.slice(5)),
                  series: [{ name: "Patrols", values: data.byDay.map((d) => d.count) }],
                }}
                height={220}
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Mode samples" icon="activity" subtitle="Movement-mode readings (device-detected)" />
          <div className="p-4">
            {Object.keys(m.modeSamples).length === 0 ? (
              <NoActivity label="No movement-mode samples in this window." />
            ) : (
              <BarChart
                dataset={{
                  labels: Object.keys(m.modeSamples),
                  series: [{ name: "Samples", values: Object.values(m.modeSamples) }],
                }}
                valueFormatter={fmtCount}
              />
            )}
          </div>
        </Card>
      </div>

      {data.byUser.length > 0 && <RangerLeaderboard rows={data.byUser} />}
    </div>
  );
}

function RangerLeaderboard({
  rows,
}: {
  rows: { userId: string; fullName: string; count: number; distanceKm: number; points: number }[];
}) {
  const columns: Column<{ id: string; fullName: string; count: number; distanceKm: number; points: number }>[] = [
    { key: "fullName", header: "Ranger" },
    { key: "count", header: "Patrols", sortValue: (r) => r.count },
    { key: "distanceKm", header: "Distance (km)", sortValue: (r) => r.distanceKm, render: (r) => fmtKm(r.distanceKm) },
    { key: "points", header: "Points", sortValue: (r) => r.points, render: (r) => fmtCount(r.points) },
  ];
  return (
    <Card className="mt-4">
      <CardHeader title="Ranger activity" icon="users" subtitle="By patrol count in window" />
      <DataTable
        columns={columns}
        rows={rows.map((r) => ({ id: r.userId, fullName: r.fullName, count: r.count, distanceKm: r.distanceKm, points: r.points }))}
        empty={<NoActivity label="No ranger activity in this window." />}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Section 2 — Incidents                                              */
/* ------------------------------------------------------------------ */

function IncidentSection({
  data,
  error,
  onRetry,
}: {
  data: ApiIncidentAnalytics | undefined;
  error?: Error;
  onRetry(): void;
}) {
  if (error) {
    return (
      <Card className="mt-4">
        <CardHeader title="Incident load" icon="alert" />
        <ErrorState message="Could not load incident analytics." onRetry={onRetry} />
      </Card>
    );
  }
  if (!data) return null;
  const m = data.metrics;

  const typeSegments = Object.entries(m.byType).map(([k, v], i) => ({
    label: INCIDENT_TYPE_LABEL[k] ?? k,
    value: v,
    color: PALETTE[i % PALETTE.length],
  }));
  const severitySegments = Object.entries(m.bySeverity).map(([k, v]) => ({
    label: k,
    value: v,
    color: SEVERITY_COLOR[k] ?? PALETTE[0],
  }));

  return (
    <div className="mt-4">
      <Card>
        <CardHeader
          title="Incident load"
          icon="alert"
          subtitle={`${m.withLocation} of ${m.total} with GPS location`}
        />
        <div className="p-4">
          {m.total === 0 ? (
            <NoActivity label="No incidents in this window." />
          ) : (
            <div className="flex flex-wrap items-center gap-8">
              <Donut segments={typeSegments} centerValue={String(m.total)} centerLabel="incidents" />
              <div className="min-w-40 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">By type</p>
                <DonutLegend segments={typeSegments} />
              </div>
              <div className="min-w-40 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">By severity</p>
                <DonutLegend segments={severitySegments} />
              </div>
            </div>
          )}
        </div>
      </Card>

      {m.byDay.length > 0 && (
        <Card className="mt-4">
          <CardHeader
            title="Incidents per day"
            icon="chart"
            subtitle={`${m.byStatus.SUBMITTED ?? 0} submitted · ${m.byStatus.VERIFIED ?? 0} verified · ${m.byStatus.RESOLVED ?? 0} resolved`}
          />
          <div className="p-4">
            <BarChart
              dataset={{
                labels: m.byDay.map((d) => d.day.slice(5)),
                series: [{ name: "Incidents", values: m.byDay.map((d) => d.count) }],
              }}
              valueFormatter={fmtCount}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section 3 — Coverage (authoritative grid coverage, reused)         */
/* ------------------------------------------------------------------ */

function CoverageSection({
  data,
  error,
  onRetry,
}: {
  data: ApiGridCoverage | undefined;
  error?: Error;
  onRetry(): void;
}) {
  if (error) {
    return (
      <Card className="mt-4">
        <CardHeader title="Coverage" icon="target" />
        <ErrorState message="Could not load coverage." onRetry={onRetry} />
      </Card>
    );
  }
  if (!data) return null;
  const s = data.summary;

  return (
    <Card className="mt-4">
      <CardHeader
        title="Grid coverage"
        icon="target"
        subtitle="Authoritative ForestGrid coverage — cells with patrol points in window"
        actions={
          <Badge tone="forest">
            {s.totalCells > 0 ? `${s.coveragePercent}% covered` : "no cells"}
          </Badge>
        }
      />
      <div className="p-4">
        {s.totalCells === 0 ? (
          <NoActivity label="No grid cells in this forest." />
        ) : (
          <StatRow
            items={[
              { label: "Total cells", value: s.totalCells },
              { label: "Patrolled", value: s.patrolledCells, tone: "forest" },
              { label: "Unpatrolled", value: s.unpatrolledCells, tone: "warning" },
              { label: "Points in window", value: fmtCount(s.pointCount), tone: "info" },
            ]}
          />
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Section 4 — Health                                                 */
/* ------------------------------------------------------------------ */

function HealthSection({
  data,
  error,
  onRetry,
}: {
  data: ApiHealthAnalytics | undefined;
  error?: Error;
  onRetry(): void;
}) {
  if (error) {
    return (
      <Card className="mt-4">
        <CardHeader title="Telemetry health" icon="shield" />
        <ErrorState message="Could not load telemetry health." onRetry={onRetry} />
      </Card>
    );
  }
  if (!data) return null;
  const m = data.metrics;
  const pendingRows = Object.values(m.pending ?? {}).reduce((a, b) => a + b, 0);

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Patrols w/o GPS points" value={m.patrolsWithoutPoints} icon="alert" tone="warning" />
        <KpiCard label="Pending sync rows" value={pendingRows} icon="upload" tone="info" />
        <KpiCard label="Sync failure rate" value={`${m.syncFailureRate}%`} icon="radio" tone={m.syncFailureRate > 10 ? "danger" : "success"} />
        <KpiCard label="Time-tamper logs" value={m.integrity.tamperTrue} icon="shield" tone="danger" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Sync activity per day"
            icon="upload"
            subtitle={`Last sync ${m.lastSyncStatus ?? "—"} · ${m.lastSyncAt ? new Date(m.lastSyncAt).toLocaleString() : "never"}`}
          />
          <div className="p-4">
            {m.syncByDay.length === 0 ? (
              <NoActivity label="No sync activity in this window." />
            ) : (
              <BarChart
                dataset={{
                  labels: m.syncByDay.map((d) => d.day.slice(5)),
                  series: [
                    { name: "Syncs", values: m.syncByDay.map((d) => d.total) },
                    { name: "Failed", values: m.syncByDay.map((d) => d.failed) },
                  ],
                }}
                valueFormatter={fmtCount}
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Integrity & coverage events" icon="shield" subtitle="Time-tamper detection and grid breach events" />
          <div className="p-4">
            <StatRow
              items={[
                { label: "Integrity logs", value: m.integrity.logs },
                { label: "Tamper detected", value: m.integrity.tamperTrue, tone: "danger" },
                { label: "Divergence > 60s", value: m.integrity.divergenceOver60, tone: "warning" },
                { label: "Coverage events", value: Object.values(m.coverageEventsByType ?? {}).reduce((a, b) => a + b, 0), tone: "info" },
              ]}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared empty state                                                 */
/* ------------------------------------------------------------------ */

function NoActivity({ label }: { label: string }) {
  return <EmptyState icon="filter" title="Nothing to show" description={label} />;
}