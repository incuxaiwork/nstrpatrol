"use client";

/**
 * Analytics & Insights — forest view (PRD §10): KPI series, weekly
 * activity, monthly trend, incident trend, wildlife mix, heatmap grid
 * and comparative view across hierarchy levels.
 */

import { useMemo, useState } from "react";
import { analytics } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { KpiCard, DataTable } from "@/components/data";
import { LineChart, BarChart, GroupBars, DonutLegend, GridHeatmap, CoverageBars } from "@/components/charts";
import { ExportButton } from "@/components/overlays";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";

export default function AnalyticsPage() {
  const { scope } = useApp();
  const [level, setLevel] = useState<"forest" | "division" | "range" | "beat">("forest");

  const weekly = useAsyncData(() => analytics.weeklyTrend());
  const durations = useAsyncData(() => analytics.monthly());
  const incidents = useAsyncData(() => analytics.incidents());
  const wildlife = useAsyncData(() => analytics.wildlife());
  const coverage = useAsyncData(() => analytics.beatCoverage());
  const comparison = useAsyncData(() => analytics.comparison());
  const heatmap = useAsyncData(() => analytics.heatmap());

  const loading = weekly.loading || wildlife.loading;
  if (loading) return <SkeletonRows rows={7} />;

  const kpis = analytics.kpisBy(level);

  return (
    <div>
      <PageHeader
        title="Analytics & Insights"
        subtitle={`Operational analytics — scope ${scope.forest} / ${level}`}
        actions={<ExportButton />}
      />

      <ScopeTabs level={level} onChange={setLevel} />

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} unit={k.unit ?? ""} change={k.changePct} icon="chart" tone="forest" />
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Weekly patrols & observations" icon="activity" subtitle="Last 7 days (mock)" />
          <div className="p-4">
            <GroupBars
              dataset={
                weekly.data ?? {
                  labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
                  series: [
                    { name: "Patrols", values: [] },
                    { name: "Observations", values: [] },
                  ],
                }
              }
              height={230}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Monthly coverage trend" icon="chart" subtitle="Weekly % of beat coverage this month" />
          <div className="p-4">
            <BarChart
              dataset={{
                labels: durations.data?.labels ?? [],
                series: [{ name: "Coverage %", values: durations.data?.coverage ?? [] }],
              }}
              height={230}
            />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Incident trend" icon="fire" subtitle="Reported incidents by type, last 7 months" />
          <div className="p-4">
            <LineChart dataset={incidents.data ?? emptyDataset("incidents")} height={230} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Wildlife sightings" icon="paw" subtitle="Sightings by species, YTD (mock)" />
          <div className="p-4">
            <BarChart dataset={wildlife.data ?? emptyDataset("wildlife")} height={230} />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader title="Beat coverage" icon="target" subtitle="Coverage by beat (last 30 days)" />
            <div className="p-4">
              <CoverageBars labels={coverage.data?.labels ?? []} values={coverage.data?.values ?? []} />
            </div>
          </Card>
        </div>

<Card>
          <CardHeader title="Patrol activity heatmap" icon="grid" subtitle="Patrol counts per division × range (mock)" />
          <div className="p-4">
            <GridHeatmap
              rowLabels={heatmap.data?.divisions ?? []}
              colLabels={heatmap.data?.ranges ?? []}
              values={heatmap.data?.values ?? []}
            />
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Patrol activity heatmap" icon="grid" subtitle="Patrol counts per division × range (mock)" />
        <div className="p-4">
          <GridHeatmap
            rowLabels={heatmap.data?.divisions ?? []}
            colLabels={heatmap.data?.ranges ?? []}
            values={heatmap.data?.values ?? []}
          />
        </div>
      </Card>
    </div>
  );
}

/* Tabs for the operational level */
function ScopeTabs({ level, onChange }: { level: string; onChange(l: "forest" | "division" | "range" | "beat"): void }) {
  const options: { value: "forest" | "division" | "range" | "beat"; label: string }[] = [
    { value: "forest", label: "Forest" },
    { value: "division", label: "Division" },
    { value: "range", label: "Range" },
    { value: "beat", label: "Beat" },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-field border border-line bg-white p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={[
            "rounded px-3.5 py-1.5 text-sm font-medium transition-colors",
            level === o.value ? "bg-forest-800 text-white" : "text-ink-soft hover:bg-forest-50 hover:text-ink",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function emptyDataset(name: string) {
  return { labels: ["Jan", "Feb", "Mar"], series: [{ name, values: [] }] };
}