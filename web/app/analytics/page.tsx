"use client";

/**
 * Analytics & Insights — forest view (PRD §10): KPI series, weekly
 * activity, monthly trend, incident trend, wildlife mix, heatmap grid
 * and comparative view across hierarchy levels.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { analytics } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { KpiCard } from "@/components/data";
import { LineChart, BarChart, GroupBars, DonutLegend, GridHeatmap, CoverageBars, Donut } from "@/components/charts";
import { Icon } from "@/components/icons";
import { ExportButton } from "@/components/overlays";
import { SkeletonRows } from "@/components/ui/loading";

export default function AnalyticsPage() {
  const { scope } = useApp();
  const router = useRouter();
  const [level, setLevel] = useState<"forest" | "division" | "range" | "beat">("forest");

  const weekly = useAsyncData(() => analytics.weeklyTrend());
  const durations = useAsyncData(() => analytics.monthly());
  const wildlife = useAsyncData(() => analytics.wildlife());
  const humanImpact = useAsyncData(() => analytics.humanImpact());
  const waterBodies = useAsyncData(() => analytics.waterBodies());
  const mortality = useAsyncData(() => analytics.mortality());
  const coverage = useAsyncData(() => analytics.beatCoverage());
  const heatmap = useAsyncData(() => analytics.heatmap());
  const jurisdiction = useAsyncData(() => analytics.jurisdiction());

  const loading = weekly.loading || wildlife.loading;
  if (loading) return <SkeletonRows rows={7} />;

  const kpis = analytics.kpisBy(level);
  const j = jurisdiction.data;

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

      {j && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Normal patrols" value={j.normal} unit={`of ${j.total}`} icon="check" tone="forest" onClick={() => router.push("/patrols?area=normal")} />
          <KpiCard label="Authorized patrols" value={j.authorized} unit={`of ${j.total}`} icon="lock" tone="info" onClick={() => router.push("/patrols?area=authorized")} />
          <KpiCard label="Pending review" value={j.pending} icon="clock" tone="warning" onClick={() => router.push("/patrols?area=review")} />
          <KpiCard label="Out-of-authorization" value={j.review} icon="alert" tone="danger" onClick={() => router.push("/patrols?area=review")} />
        </div>
      )}

      {j && (
        <Card className="mt-4">
          <CardHeader
            title="Patrol jurisdiction compliance"
            icon="map"
            subtitle="Every patrol is normal, authorized, pending review or out-of-authorization"
            actions={
              <Link href="/patrols?area=review" className="text-xs font-medium text-forest-700 hover:underline">
                Flagged patrols →
              </Link>
            }
          />
          <div className="grid gap-6 p-5 lg:grid-cols-2">
            <div className="flex items-center gap-4">
              <Donut
                segments={[
                  { label: "Normal", value: j.normal, color: "#1F4626" },
                  { label: "Authorized", value: j.authorized, color: "#2E7D32" },
                  { label: "Pending review", value: j.pending, color: "#FF8F00" },
                  { label: "Out-of-authorization", value: j.review, color: "#B3261E" },
                ]}
                centerValue={`${j.normalPct + j.authorizedPct}%`}
                centerLabel="within jurisdiction"
              />
              <div className="flex-1">
                <DonutLegend
                  segments={[
                    { label: "Normal", value: j.normal, color: "#1F4626" },
                    { label: "Authorized", value: j.authorized, color: "#2E7D32" },
                    { label: "Pending review", value: j.pending, color: "#FF8F00" },
                    { label: "Out-of-authorization", value: j.review, color: "#B3261E" },
                  ]}
                />
              </div>
            </div>
            <div className="space-y-2.5 text-sm">
              <p className="text-ink-soft">
                <strong className="text-ink">{j.normalPct}%</strong> of patrols run entirely within the ranger&apos;s normal jurisdiction.
              </p>
              <p className="text-ink-soft">
                <strong className="text-ink">{j.authorizedPct}%</strong> run outside the home jurisdiction under an approved authorization.
              </p>
              <p className="text-ink-soft">
                <strong className="text-ink">{j.reviewPct}%</strong> are flagged for review — they may be out-of-authorization or pending approval.
              </p>
              <Link href="/patrols/permissions" className="inline-flex items-center gap-1.5 pt-1 text-xs font-medium text-forest-700 hover:underline">
                Manage patrol permissions <Icon name="chevronRight" size={12} />
              </Link>
            </div>
          </div>
        </Card>
      )}

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
          <CardHeader title="Human impact trend" icon="fire" subtitle="Poaching, fire hazards and encroachment, last 7 months" />
          <div className="p-4">
            <LineChart dataset={humanImpact.data ?? emptyDataset("human impact")} height={230} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Water body status" icon="droplet" subtitle="Surveyed water sites by type, YTD (mock)" />
          <div className="p-4">
            <BarChart dataset={waterBodies.data ?? emptyDataset("water bodies")} height={230} />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Animal mortality" icon="paw" subtitle="Mortality by cause, last 7 months" />
          <div className="p-4">
            <LineChart dataset={mortality.data ?? emptyDataset("mortality")} height={230} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Wildlife sightings" icon="binoculars" subtitle="Sightings by species, YTD (mock)" />
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