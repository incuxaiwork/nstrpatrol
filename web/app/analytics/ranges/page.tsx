"use client";

/** Range analytics (PRD §10.6) — range-level KPIs and comparison */

import { analytics } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Card, CardHeader, Badge, PageHeader } from "@/components/ui";
import { KpiCard, DataTable } from "@/components/data";
import { CoverageBars, GroupBars } from "@/components/charts";
import { ExportButton } from "@/components/overlays";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { unitName } from "@/lib/mock/hierarchy";

const rangesData = [
  { id: "r-n1", coverage: 88, patrols: 64, incidents: 6, observations: 132 },
  { id: "r-n2", coverage: 76, patrols: 52, incidents: 9, observations: 98 },
  { id: "r-c1", coverage: 91, patrols: 71, incidents: 4, observations: 156 },
  { id: "r-c2", coverage: 68, patrols: 41, incidents: 7, observations: 74 },
  { id: "r-s1", coverage: 83, patrols: 58, incidents: 5, observations: 112 },
  { id: "r-s2", coverage: 71, patrols: 44, incidents: 11, observations: 89 },
];

export default function RangeAnalyticsPage() {
  const { scope } = useApp();
  const comparison = useAsyncData(() => analytics.comparison());

  if (comparison.loading || !comparison.data) return <SkeletonRows rows={6} />;
  if (comparison.error) return <ErrorState message={comparison.error.message} onRetry={comparison.reload} />;

  const best = [...rangesData].sort((a, b) => b.coverage - a.coverage)[0];

  return (
    <div>
      <PageHeader title="Range Analytics" subtitle={`Range-level performance — ${scope.forest}`} actions={<ExportButton />} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Ranges" value={rangesData.length} icon="map" tone="forest" />
        <KpiCard label="Best coverage" value={`${best.coverage}%`} icon="check" tone="success" />
        <KpiCard label="Avg coverage" value={Math.round(rangesData.reduce((a, r) => a + r.coverage, 0) / rangesData.length)} unit="%" icon="target" tone="info" />
        <KpiCard label="Open incidents" value={rangesData.reduce((a, r) => a + r.incidents, 0)} icon="alert" tone="danger" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Coverage by range" icon="target" subtitle="Last 30 days (mock)" />
          <div className="p-4">
            <CoverageBars
              labels={rangesData.map((r) => unitName(r.id))}
              values={rangesData.map((r) => r.coverage)}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="patrols · observations · incidents" icon="chart" subtitle="Comparison across staff levels (mock)" />
          <div className="p-4">
            <GroupBars dataset={comparison.data} height={220} />
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Range register" icon="list" />
        <DataTable
          rows={rangesData}
          loading={false}
          columns={[
            { key: "id", header: "Range", sortValue: (r) => r.id, render: (r) => (
              <div>
                <p className="font-medium text-ink">{unitName(r.id)}</p>
                <p className="font-mono text-xs text-ink-soft">{r.id}</p>
              </div>
            ) },
            { key: "coverage", header: "Coverage", sortValue: (r) => r.coverage, render: (r) => <Badge tone={r.coverage >= 80 ? "success" : r.coverage >= 70 ? "warning" : "danger"}>{r.coverage}%</Badge> },
            { key: "patrols", header: "Patrols", sortValue: (r) => r.patrols, render: (r) => <span className="text-ink">{r.patrols}</span> },
            { key: "observations", header: "Observations", sortValue: (r) => r.observations, render: (r) => <span className="text-ink-soft">{r.observations}</span> },
            { key: "incidents", header: "Incidents", sortValue: (r) => r.incidents, render: (r) => <Badge tone={r.incidents >= 10 ? "danger" : "warning"}>{r.incidents}</Badge> },
          ]}
        />
      </Card>
    </div>
  );
}