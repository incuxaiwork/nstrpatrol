"use client";

/** Division analytics (PRD §10.7) — division-level scores and standings */

import { analytics } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader } from "@/components/ui";
import { KpiCard, DataTable } from "@/components/data";
import { CoverageBars, GroupBars } from "@/components/charts";
import { ExportButton, type ExportKind } from "@/components/overlays";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { unitName } from "@/lib/mock/hierarchy";
import { exportRows, stamp } from "@/lib/export";

const divisions = [
  { id: "d-markapur", coverage: 79, patrols: 368, observations: 728, incidents: 45, areaKm2: 2453 },
];

export default function DivisionAnalyticsPage() {
  const comparison = useAsyncData(() => analytics.comparison(), [], { cacheKey: "analytics:comparison" });

  if (comparison.loading || !comparison.data) return <SkeletonRows rows={6} />;
  if (comparison.error) return <ErrorState message={comparison.error.message} onRetry={comparison.reload} />;

  const leader = [...divisions].sort((a, b) => b.coverage - a.coverage)[0];

  return (
    <div>
      <PageHeader
        title="Division Analytics"
        subtitle="Comparison across forest divisions"
        actions={
          <ExportButton
            onExport={(kind: ExportKind) =>
              exportRows(kind, `division-register-${stamp()}`, divisions.map((d) => ({
                id: d.id,
                division: unitName(d.id),
                coveragePct: d.coverage,
                patrols: d.patrols,
                observations: d.observations,
                incidents: d.incidents,
                areaKm2: d.areaKm2,
              })))
            }
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Divisions" value={divisions.length} icon="tree" tone="forest" />
        <KpiCard label="Leading" value={unitName(leader.id)} icon="star" tone="success" />
        <KpiCard label="Total patrols" value={divisions.reduce((a, d) => a + d.patrols, 0)} icon="route" tone="info" />
        <KpiCard label="Total incidents" value={divisions.reduce((a, d) => a + d.incidents, 0)} icon="alert" tone="danger" />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {divisions.map((d) => (
          <Card key={d.id}>
            <CardHeader
              title={unitName(d.id)}
              icon="tree"
              actions={<Badge tone={d.coverage >= 80 ? "success" : "warning"}>{d.coverage}%</Badge>}
            />
            <dl className="space-y-2 p-4 text-sm">
              <MiniRow label="Area" value={`${d.areaKm2.toLocaleString("en-IN")} km²`} />
              <MiniRow label="Patrols (30d)" value={String(d.patrols)} />
              <MiniRow label="Observations" value={String(d.observations)} />
              <MiniRow label="Incidents" value={String(d.incidents)} />
            </dl>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Coverage by division" icon="target" subtitle="Last 30 days (mock)" />
          <div className="p-4">
            <CoverageBars labels={divisions.map((d) => unitName(d.id))} values={divisions.map((d) => d.coverage)} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Level comparison" icon="layers" subtitle="Relative activity at each level" />
          <div className="p-4">
            <GroupBars dataset={comparison.data} height={220} />
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Division register" icon="list" />
        <DataTable
          rows={divisions}
          loading={false}
          columns={[
            { key: "id", header: "Division", sortValue: (d) => d.id, render: (d) => <span className="font-medium text-ink">{unitName(d.id)}</span> },
            { key: "coverage", header: "Coverage", sortValue: (d) => d.coverage, render: (d) => <Badge tone={d.coverage >= 80 ? "success" : "warning"}>{d.coverage}%</Badge> },
            { key: "patrols", header: "Patrols", sortValue: (d) => d.patrols, render: (d) => <span className="text-ink">{d.patrols}</span> },
            { key: "obs", header: "Observations", sortValue: (d) => d.observations, render: (d) => <span className="text-ink-soft">{d.observations}</span> },
            { key: "incidents", header: "Incidents", sortValue: (d) => d.incidents, render: (d) => <Badge tone={d.incidents >= 15 ? "danger" : "warning"}>{d.incidents}</Badge> },
            { key: "area", header: "Area", render: (d) => <span className="text-ink-soft">{d.areaKm2.toLocaleString("en-IN")} km²</span> },
          ]}
        />
      </Card>
    </div>
  );
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="text-xs font-medium text-ink">{value}</dd>
    </div>
  );
}