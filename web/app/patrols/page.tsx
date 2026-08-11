"use client";

/**
 * Patrol Operations — patrol dashboard (PRD §6.1): KPIs, status overview,
 * live patrol queue, planned patrols, recent activity.
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState } from "react";
import { patrols } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader, type BadgeTone } from "@/components/ui";
import { DataTable, FilterBar, FilterSelect, KpiCard, PrimaryLink, Timeline } from "@/components/data";
import type { IconName } from "@/components/icons";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { patrolStatusLabel, patrolStatusTone } from "@/lib/nav";
import { patrolTypeLabels } from "@/lib/mock/patrols";
import { timeAgo, formatMinutes } from "@/lib/utils";
import { unitName } from "@/lib/mock/hierarchy";

export default function PatrolsPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useAsyncData(() => patrols.list());
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [pastOnly, setPastOnly] = useState(false);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter(
      (p) =>
        (!status || p.status === status) &&
        (!type || p.type === type) &&
        (!pastOnly || p.status === "completed" || p.status === "cancelled")
    );
  }, [data, status, type, pastOnly]);

  if (loading || !data) return <SkeletonRows rows={8} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const active = data.filter((p) => p.status === "ongoing" || p.status === "delayed");
  const today = data.filter((p) => new Date(p.startScheduled).toDateString() === new Date().toDateString());

  const statusSeg = data.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="Patrol Operations"
        subtitle="Plan, dispatch and monitor field patrols across beats"
        actions={<PrimaryLink href="/patrols/new" icon="plus">Create patrol</PrimaryLink>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <KpiCard label="Active patrols" value={active.length} icon="route" tone="success" onClick={() => router.push("/patrols")} />
        <KpiCard label="Planned" value={statusSeg.planned ?? 0} icon="calendar" tone="info" onClick={() => setStatus("planned")} />
        <KpiCard label="Completed" value={statusSeg.completed ?? 0} icon="check" tone="forest" onClick={() => setStatus("completed")} />
        <KpiCard label="Delayed" value={statusSeg.delayed ?? 0} icon="clock" tone="warning" onClick={() => setStatus("delayed")} />
        <KpiCard label="Cancelled" value={statusSeg.cancelled ?? 0} icon="x" tone="danger" onClick={() => setStatus("cancelled")} />
        <KpiCard label="Today" value={today.length} icon="calendar" tone="info" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="All patrols"
              icon="route"
              actions={<Link href="/patrols/templates" className="text-xs font-medium text-forest-700 hover:underline">Templates →</Link>}
            />
            <FilterBar onClear={() => { setStatus(""); setType(""); setPastOnly(false); }}>
              <FilterSelect label="Status" value={status} onChange={setStatus}
                options={Object.entries(patrolStatusLabel).map(([v, l]) => ({ value: v, label: l }))} />
              <FilterSelect label="Type" value={type} onChange={setType}
                options={Object.entries(patrolTypeLabels).map(([v, l]) => ({ value: v, label: l }))} />
              <label className="flex items-center gap-1.5 pt-6 text-xs text-ink-soft">
                <input type="checkbox" checked={pastOnly} onChange={(e) => setPastOnly(e.target.checked)} className="accent-forest-700" />
                Past / closed only
              </label>
            </FilterBar>
            <DataTable
              rows={filtered}
              loading={loading}
              onRowClick={(p) => router.push(`/patrols/${p.id}`)}
              columns={[
                { key: "code", header: "Code", sortValue: (p) => p.code,
                  render: (p) => <span className="font-mono text-xs font-medium text-forest-800">{p.code}</span> },
                { key: "title", header: "Patrol", sortValue: (p) => p.title,
                  render: (p) => (
                    <div>
                      <p className="font-medium text-ink">{p.title}</p>
                      <p className="text-xs text-ink-soft">{patrolTypeLabels[p.type]} · {unitName(p.range)} · {p.checkpoints} CPs</p>
                    </div>
                  ) },
                { key: "leader", header: "Leader", render: (p) => <span className="text-ink-soft">{p.leader}</span> },
                { key: "start", header: "Start", sortValue: (p) => new Date(p.startScheduled).getTime(),
                  render: (p) => <span className="text-ink-soft">{timeAgo(p.startScheduled)}</span> },
                { key: "coverage", header: "Coverage", sortValue: (p) => p.coveragePct,
                  render: (p) => <CoveragePct value={p.coveragePct} /> },
                { key: "status", header: "Status", sortValue: (p) => p.status,
                  render: (p) => <Badge tone={patrolStatusTone[p.status]} dot>{patrolStatusLabel[p.status]}</Badge> },
              ]}
              empty={<p className="py-8 text-center text-sm text-ink-soft">No patrols match the filters.</p>}
            />
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Live patrols" icon="activity" iconTone="forest" />
            <div className="space-y-2 p-3">
              {active.length === 0 && <p className="px-2 py-4 text-center text-sm text-ink-soft">No patrols currently in the field.</p>}
              {active.map((p) => (
                <Link
                  key={p.id}
                  href={`/patrols/${p.id}`}
                  className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 transition-colors hover:border-forest-600 hover:bg-forest-50"
                >
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-success" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{p.title}</p>
                    <p className="text-xs text-ink-soft">
                      {patrolTypeLabels[p.type]} · {p.leader} · {p.durationMin > 0 ? formatMinutes(p.durationMin) : "in progress"}
                    </p>
                  </div>
                  <Badge tone={patrolStatusTone[p.status]}>{patrolStatusLabel[p.status]}</Badge>
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Recent activity" icon="history" />
            <div className="p-4">
              <Timeline
                items={data
                  .flatMap((p) =>
                    (p.timeline ?? []).map((t) => ({
                      time: timeAgo(t.time),
                      title: t.label,
                      detail: p.code,
                      tone: timelineTone(t.kind),
                      icon: timelineIcon(t.kind),
                    }))
                  )
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .slice(0, 8)}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function cn(...args: unknown[]) { return args.filter(Boolean).join(" "); }

function timelineTone(kind: string): BadgeTone {
  return kind === "incident" ? "danger" : kind === "observation" ? "warning" : kind === "checkpoint" ? "info" : "forest";
}

function timelineIcon(kind: string) {
  return (kind === "checkpoint" ? "pin" : kind === "observation" ? "binoculars" : kind === "incident" ? "alert" : "check") as IconName;
}

function CoveragePct({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={cn("h-full rounded-full", value >= 80 ? "bg-success" : value >= 40 ? "bg-warning" : "bg-danger")}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs text-ink-soft">{value}%</span>
    </div>
  );
}