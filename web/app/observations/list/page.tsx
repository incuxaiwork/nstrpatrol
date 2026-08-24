"use client";

/**
 * Observations & Reports — full list (PRD §8.2): searchable, filterable,
 * paginated table with media affordances.
 */

import { useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { observations } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, Badge, PageHeader, SearchInput, Avatar } from "@/components/ui";
import { DataTable, FilterBar, FilterSelect, Pagination, ViewSwitcher, type ViewMode } from "@/components/data";
import { ExportButton, type ExportKind } from "@/components/overlays";
import { Icon } from "@/components/icons";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { severityLabel, severityTone, observationStatusLabel, observationStatusTone } from "@/lib/nav";
import { categoryMeta } from "@/lib/mock/observations";
import { timeAgo } from "@/lib/utils";
import { exportRows, stamp } from "@/lib/export";
import { ReportButton } from "@/components/reports/ReportButton";
import { ObservationsReportDialog } from "@/components/reports/dialogs";

const PERIOD_ANCHOR_MS = Date.now();

export default function ObservationsListPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <ObservationsList />
    </Suspense>
  );
}

function ObservationsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, error, loading, reload } = useAsyncData(() => observations.list());

  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [subcategory, setSubcategory] = useState("");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [ranger, setRanger] = useState("");
  const [period, setPeriod] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("table");
  const [page, setPage] = useState(1);
  const [reportOpen, setReportOpen] = useState(false);

  const pageSize = 8;

  const periodCutoff = useMemo(() => {
    if (!period) return 0;
    const hours: Record<string, number> = { "24h": 24, "7d": 7 * 24, "30d": 30 * 24 };
    return PERIOD_ANCHOR_MS - (hours[period] ?? 0) * 3_600_000;
  }, [period]);

  const subcategoryOptions = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    data.forEach((o) => {
      if (o.subcategory && !seen.has(o.subcategory)) {
        seen.add(o.subcategory);
        out.push({ value: o.subcategory, label: o.subcategory });
      }
    });
    return out;
  }, [data]);

  const rangerOptions = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    data.forEach((o) => {
      if (!seen.has(o.recordedBy)) {
        seen.add(o.recordedBy);
        out.push({ value: o.recordedBy, label: o.recordedBy });
      }
    });
    return out;
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.filter(
      (o) =>
        (!category || o.category === category) &&
        (!subcategory || o.subcategory === subcategory) &&
        (!status || o.status === status) &&
        (!severity || o.severity === severity) &&
        (!ranger || o.recordedBy === ranger) &&
        (!periodCutoff || new Date(o.recordedAt).getTime() >= periodCutoff) &&
        (!q || o.title.toLowerCase().includes(q) || o.code.toLowerCase().includes(q) || o.description.toLowerCase().includes(q))
    );
  }, [data, category, subcategory, status, severity, ranger, periodCutoff, query]);

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleExport = (kind: ExportKind) => {
    exportRows(kind, `observations-${stamp()}`, filtered.map((o) => ({
      code: o.code,
      title: o.title,
      category: categoryMeta[o.category].label,
      subcategory: o.subcategory ?? "",
      severity: severityLabel[o.severity],
      status: observationStatusLabel[o.status],
      recordedBy: o.recordedBy,
      recordedAt: new Date(o.recordedAt).toISOString(),
      division: o.division || "—",
      patrolId: o.patrolId ?? "",
    })));
  };

  if (loading || !data) return <SkeletonRows rows={8} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        title="All Observations"
        subtitle={`${data.length} reports on record · ${filtered.length} after filters`}
        actions={
          <div className="flex items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search reports…" className="w-56" />
            <ViewSwitcher value={view} onChange={setView} />
            <ReportButton onClick={() => setReportOpen(true)} />
            <ExportButton onExport={handleExport} />
          </div>
        }
      />

      <Card>
        <FilterBar onClear={() => { setCategory(""); setSubcategory(""); setStatus(""); setSeverity(""); setRanger(""); setPeriod(""); setPage(1); }}>
          <FilterSelect label="Category" value={category} onChange={(v) => { setCategory(v); setSubcategory(""); setPage(1); }}
            options={Object.entries(categoryMeta).map(([v, m]) => ({ value: v, label: m.label }))} />
          <FilterSelect label="Subcategory" value={subcategory} onChange={(v) => { setSubcategory(v); setPage(1); }}
            options={subcategoryOptions} />
          <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }}
            options={Object.entries(observationStatusLabel).map(([v, l]) => ({ value: v, label: l }))} />
          <FilterSelect label="Severity" value={severity} onChange={(v) => { setSeverity(v); setPage(1); }}
            options={Object.entries(severityLabel).map(([v, l]) => ({ value: v, label: l }))} />
          <FilterSelect label="Ranger" value={ranger} onChange={(v) => { setRanger(v); setPage(1); }}
            options={rangerOptions} />
          <FilterSelect label="Recorded" value={period} onChange={(v) => { setPeriod(v); setPage(1); }}
            options={[
              { value: "24h", label: "Last 24 hours" },
              { value: "7d", label: "Last 7 days" },
              { value: "30d", label: "Last 30 days" },
            ]} />
          <span className="ml-auto self-end text-xs text-ink-soft">{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
        </FilterBar>

        {view === "table" && (
          <>
            <DataTable
              rows={pageRows}
              loading={loading}
              onRowClick={(o) => router.push(`/observations/${o.id}`)}
              columns={[
                {
                  key: "code", header: "Code", sortValue: (o) => o.code,
                  render: (o) => <span className="font-mono text-xs font-medium text-forest-800">{o.code}</span>,
                },
                {
                  key: "title", header: "Report", sortValue: (o) => o.title,
                  render: (o) => (
                    <div>
                      <p className="flex items-center gap-1.5 font-medium text-ink">
                        <span className="size-2 rounded-full" style={{ background: categoryMeta[o.category].color }} />
                        {o.title}
                      </p>
                      <p className="line-clamp-1 max-w-md text-xs text-ink-soft">{o.description}</p>
                    </div>
                  ),
                },
                { key: "category", header: "Category", sortValue: (o) => o.category, render: (o) => <Badge tone="neutral">{categoryMeta[o.category].label}</Badge> },
                { key: "recorded", header: "Recorded", sortValue: (o) => new Date(o.recordedAt).getTime(),
                  render: (o) => (
                    <div className="flex items-center gap-1.5">
                      <Avatar name={o.recordedBy} size={22} />
                      <span className="text-ink-soft">{timeAgo(o.recordedAt)}</span>
                    </div>
                  ) },
                { key: "media", header: "", render: (o) => o.media?.length ? (
                  <span className="flex items-center gap-1 text-xs text-ink-soft">
                    <Icon name="camera" size={13} /> {o.media.length}
                  </span>
                ) : <span className="text-ink-faint">—</span> },
                { key: "severity", header: "Severity", sortValue: (o) => o.severity, render: (o) => <Badge tone={severityTone[o.severity]} dot>{severityLabel[o.severity]}</Badge> },
                { key: "status", header: "Status", sortValue: (o) => o.status, render: (o) => <Badge tone={observationStatusTone[o.status]} dot>{observationStatusLabel[o.status]}</Badge> },
              ]}
              empty={<p className="py-8 text-center text-sm text-ink-soft">No reports match the filters.</p>}
            />
            <Pagination page={page} pageSize={pageSize} total={filtered.length} onChange={setPage} />
          </>
        )}

        {view === "cards" && (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {pageRows.map((o) => (
              <button key={o.id} onClick={() => router.push(`/observations/${o.id}`)}
                className="rounded-card border border-line bg-white p-4 text-left transition-colors hover:border-forest-600 hover:bg-forest-50">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-medium text-forest-800">{o.code}</span>
                  <Badge tone={observationStatusTone[o.status]}>{observationStatusLabel[o.status]}</Badge>
                </div>
                <p className="mt-2 text-sm font-medium text-ink">{o.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{o.description}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-ink-soft">
                  <span>{timeAgo(o.recordedAt)}</span>
                  <Badge tone={severityTone[o.severity]} dot>{severityLabel[o.severity]}</Badge>
                </div>
              </button>
            ))}
          </div>
        )}

        {view === "gallery" && (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-4">
            {pageRows.map((o) => (
              <button key={o.id} onClick={() => router.push(`/observations/${o.id}`)}
                className="group relative aspect-video overflow-hidden rounded-card border border-line bg-zinc-100 text-left">
                <span className="flex h-full items-center justify-center">
                  <Icon name="camera" size={22} className="text-ink-faint" />
                </span>
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5">
                  <span className="line-clamp-1 text-xs font-medium text-white">{o.title}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>
      <ObservationsReportDialog open={reportOpen} onClose={() => setReportOpen(false)} />
    </div>
  );
}