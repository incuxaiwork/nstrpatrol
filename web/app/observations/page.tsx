"use client";

/**
 * Observations & Reports — dashboard (PRD §8.1): category mix, severity,
 * status pipeline, recent reports and quick capture entry point.
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState } from "react";
import { observations } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader } from "@/components/ui";
import { KpiCard, FilterBar, FilterSelect, PrimaryLink } from "@/components/data";
import { Icon, type IconName } from "@/components/icons";
import { Donut, DonutLegend } from "@/components/charts";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { severityLabel, severityTone, observationStatusLabel, observationStatusTone } from "@/lib/nav";
import { categoryMeta } from "@/lib/mock/observations";
import { unitName } from "@/lib/mock/hierarchy";
import { timeAgo } from "@/lib/utils";


const categoryIcon: Record<string, IconName> = {
  wildlife: "paw",
  "human-impact": "users",
  "water-body": "droplet",
  mortality: "heart",
  "forest-health": "tree",
  infrastructure: "box",
};

export default function ObservationsDashboardPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useAsyncData(() => observations.list());

  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter(
      (o) =>
        (!category || o.category === category) &&
        (!status || o.status === status) &&
        (!severity || o.severity === severity)
    );
  }, [data, category, status, severity]);

  if (loading || !data) return <SkeletonRows rows={7} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const byCategory = data.reduce<Record<string, number>>((acc, o) => {
    acc[o.category] = (acc[o.category] ?? 0) + 1;
    return acc;
  }, {});

  const critical = data.filter((o) => o.severity === "critical");
  const open = data.filter((o) => o.status === "open" || o.status === "under-review");
  const escalated = data.filter((o) => o.status === "escalated");
  const resolved = data.filter((o) => o.status === "resolved");
  const withMedia = data.filter((o) => o.media?.length);
  const isToday = (t: string) => new Date(t).toDateString() === new Date().toDateString();
  const countToday = (items: { recordedAt: string }[]) => items.filter((o) => isToday(o.recordedAt)).length;

  return (
    <div>
      <PageHeader
        title="Observations & Reports"
        subtitle="Wildlife, incidents and field findings across the forest"
        actions={<PrimaryLink href="/observations/list" icon="binoculars">All observations</PrimaryLink>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <KpiCard label="Total reports" value={data.length} icon="file" tone="forest" tillDate={data.length} today={countToday(data)} onClick={() => router.push("/observations/list")} />
        <KpiCard label="Open / review" value={open.length} icon="clock" tone="info" tillDate={open.length} today={countToday(open)} onClick={() => setStatus("open")} />
        <KpiCard label="Critical" value={critical.length} icon="alert" tone="danger" tillDate={critical.length} today={countToday(critical)} onClick={() => setSeverity("critical")} />
        <KpiCard label="Escalated" value={escalated.length} icon="sos" tone="danger" tillDate={escalated.length} today={countToday(escalated)} />
        <KpiCard label="Resolved" value={resolved.length} icon="check" tone="success" tillDate={resolved.length} today={countToday(resolved)} />
        <KpiCard label="With media" value={withMedia.length} icon="camera" tone="khaki" tillDate={withMedia.length} today={countToday(withMedia)} />
      </div>

      {/* Category cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(["human-impact", "mortality", "wildlife", "water-body"] as const).map((key) => {
          const meta = categoryMeta[key];
          return (
            <button
              key={key}
              onClick={() => router.push(`/observations/list?category=${key}`)}
              className="flex items-center gap-2.5 rounded-card border border-line bg-white p-3.5 shadow-card transition-colors hover:border-forest-600"
            >
              <span className="flex size-9 items-center justify-center rounded-lg text-white" style={{ background: meta.color }}>
                <Icon name={categoryIcon[key] ?? "binoculars"} size={16} />
              </span>
              <span className="min-w-0 text-left">
                <span className="block truncate text-xs font-medium text-ink">{meta.plural}</span>
                <span className="block text-lg font-semibold leading-tight text-ink">{byCategory[key] ?? 0}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="All observations"
              icon="binoculars"
              actions={<Link href="/observations/list" className="text-xs font-medium text-forest-700 hover:underline">Full list →</Link>}
            />
            <FilterBar onClear={() => { setCategory(""); setStatus(""); setSeverity(""); }}>
              <FilterSelect label="Category" value={category} onChange={setCategory}
                options={Object.entries(categoryMeta).map(([v, m]) => ({ value: v, label: m.label }))} />
              <FilterSelect label="Status" value={status} onChange={setStatus}
                options={Object.entries(observationStatusLabel).map(([v, l]) => ({ value: v, label: l }))} />
              <FilterSelect label="Severity" value={severity} onChange={setSeverity}
                options={Object.entries(severityLabel).map(([v, l]) => ({ value: v, label: l }))} />
            </FilterBar>
            <div className="divide-y divide-line">
              {filtered.slice(0, 8).map((o) => (
                <Link key={o.id} href={`/observations/${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-forest-50/40">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: categoryMeta[o.category].color }} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">{o.title}</span>
                      {o.priority === "urgent" && <Badge tone="danger">Urgent</Badge>}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {o.code} · {o.recordedBy} · {timeAgo(o.recordedAt)} · {unitName(o.range)}
                    </p>
                  </div>
                  <Badge tone={severityTone[o.severity]}>{severityLabel[o.severity]}</Badge>
                  <Badge tone={observationStatusTone[o.status]}>{observationStatusLabel[o.status]}</Badge>
                </Link>
              ))}
              {filtered.length === 0 && <p className="py-8 text-center text-sm text-ink-soft">No observations match the filters.</p>}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Severity mix" icon="chart" />
            <div className="flex items-center gap-4 p-4">
              <Donut
                segments={countSeverity(data).map((s) => ({ label: s.label, value: s.count, color: s.color }))}
                centerValue={String(data.length)}
                centerLabel="reports"
              />
              <div className="flex-1">
                <DonutLegend segments={countSeverity(data).map((s) => ({ label: s.label, value: s.count, color: s.color }))} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Category distribution" icon="layers" subtitle="Share of each report category" />
            <div className="space-y-2.5 p-4">
              {(["human-impact", "mortality", "wildlife", "water-body"] as const).map((key) => {
                const n = byCategory[key] ?? 0;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-28 truncate text-xs text-ink-soft">{categoryMeta[key].plural}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                      <div className="h-full rounded-full" style={{ width: `${(n / data.length) * 100}%`, background: categoryMeta[key].color }} />
                    </div>
                    <span className="w-6 text-right text-xs font-medium text-ink">{n}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function countSeverity(data: { severity: string }[]) {
  const order = ["critical", "high", "medium", "low"] as const;
  const colors: Record<string, string> = { critical: "#B3261E", high: "#D9534F", medium: "#FF8F00", low: "#C3B091" };
  const labels: Record<string, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
  return order.map((s) => ({
    label: labels[s],
    count: data.filter((o) => o.severity === s).length,
    color: colors[s],
  }));
}