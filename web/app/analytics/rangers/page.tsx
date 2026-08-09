"use client";

/** Ranger analytics (PRD §10.4) — crew performance leaderboards */

import { useMemo } from "react";
import Link from "next/link";
import { rangers, analytics } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader, Avatar } from "@/components/ui";
import { KpiCard, DataTable } from "@/components/data";
import { BarChart } from "@/components/charts";
import { ExportButton } from "@/components/overlays";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { dutyStatusLabel, dutyStatusTone } from "@/lib/nav";
import { unitName } from "@/lib/mock/hierarchy";
import { formatKm } from "@/lib/utils";
import type { Ranger } from "@/lib/types";

export default function RangerAnalyticsPage() {
  const { data, error, loading, reload } = useAsyncData(() => rangers.list());
  const patrolStats = useAsyncData(() => analytics.monthly());

  if (loading || !data) return <SkeletonRows rows={7} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const byPatrols = [...data].sort((a, b) => b.stats.patrols - a.stats.patrols);
  const byDistance = [...data].sort((a, b) => b.stats.distanceKm - a.stats.distanceKm);
  const byHours = [...data].sort((a, b) => b.stats.fieldHours - a.stats.fieldHours);

  return (
    <div>
      <PageHeader
        title="Ranger Analytics"
        subtitle="Individual contribution: patrols, distance, field hours and cover"
        actions={<ExportButton />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Rangers" value={data.length} icon="users" tone="forest" />
        <KpiCard label="Total patrols" value={data.reduce((a, r) => a + r.stats.patrols, 0)} icon="route" tone="info" />
        <KpiCard label="Total distance" value={fmt(data.reduce((a, r) => a + r.stats.distanceKm, 0))} icon="target" tone="khaki" />
        <KpiCard label="Best coverage" value={Math.max(...data.map((r) => r.stats.coveragePct))} unit="%" icon="check" tone="success" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <LeaderCard title="Top by patrols" subtitle="Career patrol count" rows={byPatrols.slice(0, 6).map((r) => ({ r, v: r.stats.patrols, unit: "patrols" }))} />
        <LeaderCard title="Top by distance" subtitle="Km covered in the field" rows={byDistance.slice(0, 6).map((r) => ({ r, v: r.stats.distanceKm, unit: "km" }))} />
        <LeaderCard title="Top by field hours" subtitle="Total in-forest time" rows={byHours.slice(0, 6).map((r) => ({ r, v: r.stats.fieldHours, unit: "h" }))} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Patrol duration trend" icon="chart" subtitle="Avg duration by month (mock)" />
          <div className="p-4">
            <BarChart
              dataset={{
                labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"],
                series: [{ name: "Avg duration (min)", values: [210, 224, 218, 245, 252, 238, 246] }],
              }}
              height={220}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Monthly output" icon="activity" subtitle="Patrols & coverage per week (mock)" />
          <div className="p-4">
            <BarChart
              dataset={{
                labels: patrolStats.data?.labels ?? [],
                series: [
                  { name: "Patrols", values: patrolStats.data?.patrols ?? [] },
                  { name: "Coverage %", values: patrolStats.data?.coverage ?? [] },
                ],
              }}
              height={220}
            />
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="All rangers (ranking)" icon="list" />
        <DataTable
          rows={data}
          loading={loading}
          onRowClick={(r) => undefined}
          columns={[
            { key: "code", header: "Code", sortValue: (r) => r.code, render: (r) => <span className="font-mono text-xs text-forest-800">{r.code}</span> },
            { key: "name", header: "Ranger", sortValue: (r) => r.name, render: (r) => (
              <Link href={`/rangers/${r.id}`} className="flex items-center gap-2.5">
                <Avatar name={r.name} size={26} />
                <span className="font-medium text-ink">{r.name}</span>
              </Link>
            ) },
            { key: "unit", header: "Unit", render: (r) => <span className="text-ink-soft">{unitName(r.range)}</span> },
            { key: "patrols", header: "Patrols", sortValue: (r) => r.stats.patrols, render: (r) => <span className="text-ink">{r.stats.patrols}</span> },
            { key: "distance", header: "Distance", sortValue: (r) => r.stats.distanceKm, render: (r) => <span className="text-ink-soft">{formatKm(r.stats.distanceKm)}</span> },
            { key: "hours", header: "Field hours", sortValue: (r) => r.stats.fieldHours, render: (r) => <span className="text-ink-soft">{formatHours(r.stats.fieldHours)}</span> },
            { key: "coverage", header: "Coverage", sortValue: (r) => r.stats.coveragePct, render: (r) => <CoverageBadge pct={r.stats.coveragePct} /> },
            { key: "status", header: "Duty", sortValue: (r) => r.dutyStatus, render: (r) => <Badge tone={dutyStatusTone[r.dutyStatus]} dot>{dutyStatusLabel[r.dutyStatus]}</Badge> },
          ]}
          empty={<p className="py-8 text-center text-sm text-ink-soft">No rangers on record.</p>}
        />
      </Card>
    </div>
  );
}

function LeaderCard({ title, subtitle, rows }: { title: string; subtitle: string; rows: { r: Ranger; v: number; unit: string }[] }) {
  return (
    <Card>
      <CardHeader title={title} icon="star" subtitle={subtitle} />
      <div className="divide-y divide-line">
        {rows.map((x, i) => (
          <div key={x.r.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-5 text-xs font-semibold text-ink-faint">{i + 1}</span>
            <Avatar name={x.r.name} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{x.r.name}</p>
              <p className="text-xs text-ink-soft">{x.r.designation}</p>
            </div>
            <span className="text-sm font-semibold text-forest-800">
              {x.v.toLocaleString("en-IN")} <span className="text-xs font-normal text-ink-soft">{x.unit}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CoverageBadge({ pct }: { pct: number }) {
  return <Badge tone={pct >= 80 ? "success" : pct >= 60 ? "warning" : "danger"}>{pct}%</Badge>;
}

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
function formatHours(h: number) {
  if (h >= 1000) return `${(h / 1000).toFixed(1)}k h`;
  return `${Math.round(h)} h`;
}