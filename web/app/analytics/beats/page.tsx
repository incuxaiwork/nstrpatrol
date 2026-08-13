"use client";

/** Beat analytics (PRD §10.5) — per-beat coverage and activity */

import { analytics } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader } from "@/components/ui";
import { KpiCard, DataTable } from "@/components/data";
import { CoverageBars, BarChart } from "@/components/charts";
import { ExportButton, type ExportKind } from "@/components/overlays";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { unitName } from "@/lib/mock/hierarchy";
import { zeroPatrolZones } from "@/lib/mock/gis";
import { exportRows, stamp } from "@/lib/export";

export default function BeatAnalyticsPage() {
  const coverage = useAsyncData(() => analytics.beatCoverage());
  const wildlife = useAsyncData(() => analytics.wildlife());

  if (coverage.loading || !coverage.data) return <SkeletonRows rows={6} />;
  if (coverage.error) return <ErrorState message={coverage.error.message} onRetry={coverage.reload} />;

  const data = coverage.data;
  const rows = data.labels
    .map((b, i) => ({ id: b, beat: b, coverage: data.values[i] ?? 0 }))
    .sort((a, b) => a.coverage - b.coverage);

  return (
    <div>
      <PageHeader
        title="Beat Analytics"
        subtitle="Coverage and activity by operational beat"
        actions={
          <ExportButton
            onExport={(kind: ExportKind) =>
              exportRows(kind, `beat-register-${stamp()}`, rows.map((r) => ({
                id: r.id,
                beat: r.beat,
                coveragePct: r.coverage,
                status: zeroPatrolZones.includes(r.beat)
                  ? "zero-patrol"
                  : r.coverage >= 80
                    ? "healthy"
                    : r.coverage >= 70
                      ? "at-risk"
                      : "needs-attention",
              })))
            }
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Beats tracked" value={data.labels.length} icon="pin" tone="forest" />
        <KpiCard label="Healthy (≥80%)" value={rows.filter((r) => r.coverage >= 80).length} icon="check" tone="success" />
        <KpiCard label="At risk (<70%)" value={rows.filter((r) => r.coverage < 70).length} icon="alert" tone="warning" />
        <KpiCard label="Zero-patrol zones" value={zeroPatrolZones.length} icon="sos" tone="danger" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Coverage by beat" icon="target" subtitle="Last 30 days, sorted ascending" />
          <div className="p-4">
            <CoverageBars labels={rows.map((r) => r.beat)} values={rows.map((r) => r.coverage)} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Wildlife sighting mix" icon="paw" subtitle="Sightings by species (mock)" />
          <div className="p-4">
            <BarChart dataset={wildlife.data ?? { labels: [], series: [] }} />
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Beat coverage table" icon="list" />
        <DataTable
          rows={rows}
          loading={false}
          columns={[
            { key: "beat", header: "Beat", sortValue: (r) => r.beat, render: (r) => (
              <span className="font-medium text-ink">{r.beat}</span>
            ) },
            { key: "unit", header: "Unit", render: (r) => <span className="text-ink-soft">{unitName(r.beat)}</span> },
            { key: "coverage", header: "Coverage", sortValue: (r) => r.coverage, render: (r) => <CoverageBadge pct={r.coverage} /> },
            { key: "status", header: "Status", render: (r) =>
              zeroPatrolZones.includes(r.beat) ? <Badge tone="danger">Zero patrol</Badge> : r.coverage >= 80 ? <Badge tone="success">Healthy</Badge> : r.coverage >= 70 ? <Badge tone="warning">At risk</Badge> : <Badge tone="danger">Needs attention</Badge>
            },
          ]}
        />
      </Card>
    </div>
  );
}

function CoverageBadge({ pct }: { pct: number }) {
  return <Badge tone={pct >= 80 ? "success" : pct >= 70 ? "warning" : "danger"}>{pct}%</Badge>;
}