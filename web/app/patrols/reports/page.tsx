"use client";

/**
 * Patrol reports (PRD §6 — Patrol Reports): closed patrols distilled into
 * review-ready summaries with export. Mock — wire to the backend reports
 * endpoint when available.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { patrols } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader } from "@/components/ui";
import { DataTable, FilterBar, FilterSelect, KpiCard } from "@/components/data";
import { ExportButton } from "@/components/overlays";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { patrolTypeLabels } from "@/lib/mock/patrols";
import { unitName } from "@/lib/mock/hierarchy";
import { formatKm, formatMinutes, formatDate } from "@/lib/utils";

export default function PatrolReportsPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useAsyncData(() => patrols.reports());
  const [type, setType] = useState("");

  if (loading || !data) return <SkeletonRows rows={7} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const filtered = data.filter((r) => !type || r.type === type);
  const avgCoverage = Math.round(filtered.reduce((a, r) => a + r.coveragePct, 0) / Math.max(filtered.length, 1));
  const totalDistance = filtered.reduce((a, r) => a + r.distanceKm, 0);
  const totalIncidents = filtered.reduce((a, r) => a + r.incidents, 0);

  return (
    <div>
      <PageHeader
        title="Patrol Reports"
        subtitle="Review-ready summaries of closed patrols"
        actions={<ExportButton />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Reports" value={data.length} icon="file" tone="forest" />
        <KpiCard label="Avg coverage" value={avgCoverage} unit="%" icon="target" tone="info" />
        <KpiCard label="Distance covered" value={formatKm(totalDistance)} icon="route" tone="khaki" />
        <KpiCard label="Incidents logged" value={totalIncidents} icon="alert" tone="danger" />
      </div>

      <Card className="mt-4">
        <FilterBar onClear={() => setType("")}>
          <FilterSelect label="Type" value={type} onChange={setType}
            options={Object.entries(patrolTypeLabels).map(([v, l]) => ({ value: v, label: l }))} />
        </FilterBar>
        <DataTable
          rows={filtered}
          loading={loading}
          onRowClick={(r) => router.push(`/patrols/${r.patrolId}`)}
          columns={[
            { key: "code", header: "Report", sortValue: (r) => r.code,
              render: (r) => (
                <div>
                  <p className="font-mono text-xs font-medium text-forest-800">{r.code}</p>
                  <p className="text-xs text-ink-faint">{formatDate(r.reportDate)} · {r.period}</p>
                </div>
              ) },
            { key: "title", header: "Patrol", sortValue: (r) => r.title,
              render: (r) => (
                <div>
                  <p className="font-medium text-ink">{r.title}</p>
                  <p className="text-xs text-ink-soft">{patrolTypeLabels[r.type]} · {unitName(r.range)} · {unitName(r.beat)}</p>
                </div>
              ) },
            { key: "leader", header: "Leader", render: (r) => <span className="text-ink-soft">{r.leader}</span> },
            { key: "duration", header: "Duration", sortValue: (r) => r.durationMin,
              render: (r) => <span className="text-ink-soft">{r.durationMin > 0 ? formatMinutes(r.durationMin) : "—"}</span> },
            { key: "coverage", header: "Coverage", sortValue: (r) => r.coveragePct,
              render: (r) => <Badge tone={r.coveragePct >= 80 ? "success" : r.coveragePct >= 40 ? "warning" : "danger"}>{r.coveragePct}%</Badge> },
            { key: "incidents", header: "Incidents", sortValue: (r) => r.incidents,
              render: (r) => (r.incidents > 0 ? <Badge tone="danger">{r.incidents}</Badge> : <span className="text-ink-faint">0</span>) },
          ]}
          empty={<p className="py-8 text-center text-sm text-ink-soft">No reports match the filters.</p>}
        />
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {filtered.map((r) => (
          <Card key={r.id}>
            <CardHeader
              title={`${r.code} — ${r.title}`}
              icon="file"
              actions={<Badge tone="forest">{patrolTypeLabels[r.type]}</Badge>}
            />
            <div className="space-y-3 p-4">
              <p className="text-sm text-ink-soft">{r.summary}</p>
              <div className="grid grid-cols-4 gap-2 border-t border-line pt-3 text-center">
                <ReportStat label="Distance" value={formatKm(r.distanceKm)} />
                <ReportStat label="Checkpoints" value={r.checkpoints} />
                <ReportStat label="Observations" value={r.observations} />
                <ReportStat label="Photos" value={r.photos} />
              </div>
              <p className="text-xs text-ink-faint">
                {unitName(r.division)} · {unitName(r.range)} · {unitName(r.beat)} — led by {r.leader}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ReportStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-base font-semibold text-ink">{value}</p>
      <p className="text-[11px] text-ink-faint">{label}</p>
    </div>
  );
}