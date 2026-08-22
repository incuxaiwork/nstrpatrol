"use client";

/**
 * Patrol reports (PRD §6 — Patrol Reports): closed patrols distilled into
 * review-ready summaries with export. Mock — wire to the backend reports
 * endpoint when available.
 */

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { patrols } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Card, CardHeader, Badge, PageHeader, SearchInput } from "@/components/ui";
import { DataTable, FilterBar, FilterSelect, KpiCard, Pagination } from "@/components/data";
import { Icon } from "@/components/icons";
import { ExportButton } from "@/components/overlays";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { patrolTypeLabels } from "@/lib/mock/patrols";
import { unitName } from "@/lib/mock/hierarchy";
import { formatKm, formatMinutes, formatDate } from "@/lib/utils";
import { downloadJson, downloadCsv } from "@/lib/export";
import { ReportButton } from "@/components/reports/ReportButton";
import { PatrolsReportDialog } from "@/components/reports/dialogs";

const PAGE_SIZE = 8;

export default function PatrolReportsPage() {
  const router = useRouter();
  const { pushToast } = useApp();
  const { data, error, loading, reload } = useAsyncData(() => patrols.reports());
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [reportOpen, setReportOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.filter(
      (r) =>
        (!type || r.type === type) &&
        (!q || r.code.toLowerCase().includes(q) || r.title.toLowerCase().includes(q) || r.leader.toLowerCase().includes(q))
    );
  }, [data, type, query]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading || !data) return <SkeletonRows rows={7} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  // Only average over reports that actually carry coverage.
  const coverageValues = filtered.map((r) => r.coveragePct).filter((c): c is number => c != null);
  const avgCoverage = coverageValues.length
    ? Math.round(coverageValues.reduce((a, c) => a + c, 0) / coverageValues.length)
    : null;
  const totalDistance = filtered.reduce((a, r) => a + r.distanceKm, 0);
  const totalIncidents = filtered.reduce((a, r) => a + r.incidents, 0);

  const exportRows = filtered.map((r) => ({
    code: r.code,
    patrolId: r.patrolId,
    title: r.title,
    type: r.type ? patrolTypeLabels[r.type] : "",
    division: r.division,
    range: r.range,
    beat: r.beat,
    leader: r.leader,
    reportDate: r.reportDate,
    period: r.period,
    durationMin: r.durationMin,
    distanceKm: r.distanceKm,
    coveragePct: r.coveragePct,
    checkpoints: r.checkpoints,
    observations: r.observations,
    incidents: r.incidents,
    photos: r.photos,
  }));

  const downloadReport = (r: (typeof data)[number]) => {
    downloadJson(`report-${r.code}.json`, {
      code: r.code,
      title: r.title,
      type: r.type,
      division: r.division,
      range: r.range,
      beat: r.beat,
      leader: r.leader,
      reportDate: r.reportDate,
      period: r.period,
      durationMin: r.durationMin,
      distanceKm: r.distanceKm,
      coveragePct: r.coveragePct,
      checkpoints: r.checkpoints,
      observations: r.observations,
      incidents: r.incidents,
      photos: r.photos,
      summary: r.summary,
    });
    downloadCsv(`report-${r.code}.csv`, [
      { field: "Report", value: r.code },
      { field: "Patrol", value: r.title },
      { field: "Date", value: r.reportDate },
      { field: "Period", value: r.period },
      { field: "Distance (km)", value: r.distanceKm },
      { field: "Coverage (%)", value: r.coveragePct },
      { field: "Incidents", value: r.incidents },
      { field: "Observations", value: r.observations },
      { field: "Checkpoints", value: r.checkpoints },
      { field: "Summary", value: r.summary },
    ]);
    pushToast("success", "Report downloaded", `${r.code} saved as CSV + JSON`);
  };

  return (
    <div>
      <PageHeader
        title="Patrol Reports"
        subtitle="Review-ready summaries of closed patrols"
        actions={
          <div className="flex items-center gap-2">
            <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search reports…" className="w-56" />
            <ReportButton onClick={() => setReportOpen(true)} />
            <ExportButton
              rows={exportRows}
              filename="patrol-reports"
            />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Reports" value={filtered.length} icon="file" tone="forest" />
        <KpiCard label="Avg coverage" value={avgCoverage ?? "—"} unit={avgCoverage != null ? "%" : undefined} icon="target" tone="info" />
        <KpiCard label="Distance covered" value={formatKm(totalDistance)} icon="route" tone="khaki" />
        <KpiCard label="Incidents logged" value={totalIncidents} icon="alert" tone="danger" />
      </div>

      <Card className="mt-4">
        <FilterBar onClear={() => { setType(""); setPage(1); }}>
          <FilterSelect label="Type" value={type} onChange={(v) => { setType(v); setPage(1); }}
            options={Object.entries(patrolTypeLabels).map(([v, l]) => ({ value: v, label: l }))} />
        </FilterBar>
        <DataTable
          rows={pageRows}
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
                  <p className="text-xs text-ink-soft">{r.type ? patrolTypeLabels[r.type] : "Field"} · {unitName(r.range)} · {unitName(r.beat)}</p>
                </div>
              ) },
            { key: "leader", header: "Leader", render: (r) => <span className="text-ink-soft">{r.leader}</span> },
            { key: "duration", header: "Duration", sortValue: (r) => r.durationMin,
              render: (r) => <span className="text-ink-soft">{r.durationMin > 0 ? formatMinutes(r.durationMin) : "—"}</span> },
            { key: "coverage", header: "Coverage", sortValue: (r) => r.coveragePct ?? -1,
              render: (r) => (r.coveragePct != null
                ? <Badge tone={r.coveragePct >= 80 ? "success" : r.coveragePct >= 40 ? "warning" : "danger"}>{r.coveragePct}%</Badge>
                : <span className="text-xs text-ink-faint">—</span>) },
            { key: "incidents", header: "Incidents", sortValue: (r) => r.incidents,
              render: (r) => (r.incidents > 0 ? <Badge tone="danger">{r.incidents}</Badge> : <span className="text-ink-faint">0</span>) },
            {
              key: "download", header: "",
              render: (r) => (
                <button
                  onClick={(e) => { e.stopPropagation(); downloadReport(r); }}
                  title="Download report (CSV + JSON)"
                  aria-label={`Download ${r.code}`}
                  className="flex size-7 items-center justify-center rounded-md border border-line bg-white text-ink-soft transition-colors hover:border-forest-600 hover:text-forest-800"
                >
                  <Icon name="download" size={13} />
                </button>
              ),
            },
          ]}
          empty={<p className="py-8 text-center text-sm text-ink-soft">No reports match the filters.</p>}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {pageRows.map((r) => (
          <Card key={r.id}>
            <CardHeader
              title={`${r.code} — ${r.title}`}
              icon="file"
              actions={
                <div className="flex items-center gap-2">
                  <Badge tone="forest">{r.type ? patrolTypeLabels[r.type] : "Field"}</Badge>
                  <button
                    onClick={() => downloadReport(r)}
                    aria-label={`Download ${r.code}`}
                    className="inline-flex h-7 items-center gap-1 rounded-field border border-line bg-white px-2 text-xs font-medium text-ink-soft hover:border-forest-600 hover:text-forest-800"
                  >
                    <Icon name="download" size={12} /> Download
                  </button>
                </div>
              }
            />
            <div className="space-y-3 p-4">
              <p className="text-sm text-ink-soft">{r.summary}</p>
              <div className="grid grid-cols-4 gap-2 border-t border-line pt-3 text-center">
                <ReportStat label="Distance" value={formatKm(r.distanceKm)} />
                <ReportStat label="Checkpoints" value={r.checkpoints ?? "—"} />
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
      <PatrolsReportDialog open={reportOpen} onClose={() => setReportOpen(false)} />
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