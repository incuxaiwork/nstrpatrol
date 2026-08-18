/**
 * Concrete report dialogs — one per report flow. Each dialog owns its
 * data loading (service layer), filter state and the report preview,
 * sharing the phase machine in ReportDialog and the builders in
 * lib/reports/report-utils.
 */

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { gis, observations, patrols, rangers, authorizations } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { jurisdictionLabel as jurisdictionLabelOf, resolveJurisdiction } from "@/lib/jurisdiction";
import { Badge, Field, Select } from "@/components/ui";
import { DataTable, StatRow, Timeline } from "@/components/data";
import { MapWorkspace } from "@/components/map";
import { LoadingState } from "@/components/ui/loading";
import { ReportDialog } from "@/components/reports/ReportDialog";
import { ReportButton } from "@/components/reports/ReportButton";
import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { RegionFilter } from "@/components/reports/RegionFilter";
import { ReportPreview, ReportSection, ReportStat } from "@/components/reports/ReportPreview";
import {
  EMPTY_REGION,
  isValidRange,
  quickRange,
  type DateRange,
  type PatrolReportFilters,
  type ObservationReportFilters,
  type RangerReportFilters,
  type RegionReportFilters,
} from "@/lib/reports/report-types";
import {
  buildPatrolsReport,
  buildObservationsReport,
  buildPatrolReport,
  buildRangerReport,
  buildRegionReport,
  filterObservations,
  filterPatrolRows,
  patrolsReportRows,
  observationsReportRows,
  patrolInfoRows,
  patrolRouteRows,
  patrolTimelineRows,
  patrolObservationRows,
  rangerPatrolRows,
  rangerObservationRows,
  rangerIncidentRows,
  regionPatrolRows,
  regionObservationRows,
  regionRangerRows,
  currentMeta,
  isIncident,
  type PatrolRow,
  type PatrolsReport,
  type ObservationsReport,
  type IndividualPatrolReport,
  type RangerReport,
  type RegionReport,
} from "@/lib/reports/report-utils";
import { categoryMeta } from "@/lib/mock/observations";
import { patrolStatusTone } from "@/lib/nav";
import { patrolTypeLabels, patrolMethodLabels } from "@/lib/mock/patrols";
import { unitName } from "@/lib/mock/hierarchy";
import { severityTone } from "@/lib/nav";
import { regionMatches } from "@/lib/reports/report-types";
import type { Observation, ObservationCategory, Patrol, Ranger } from "@/lib/types";
import type { JurisdictionResolution } from "@/lib/jurisdiction";

/* ------------------------------------------------------------------ */
/* Small shared render helpers                                         */
/* ------------------------------------------------------------------ */

function patrolCodeCell(code: string) {
  return <span className="font-mono text-xs font-medium text-forest-800">{code}</span>;
}

function statusBadge(p: Patrol) {
  return (
    <Badge tone={patrolStatusTone[p.status]} dot>
      {patrolStatusLabelOf(p.status)}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Multiple patrols report                                          */
/* ------------------------------------------------------------------ */

export function PatrolsReportDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const router = useRouter();
  const patrolData = useAsyncData(() => patrols.list());
  const authData = useAsyncData(() => authorizations.list());
  const rangerData = useAsyncData(() => rangers.list());
  const [filters, setFilters] = useState<PatrolReportFilters>({
    range: quickRange("thisMonth"),
    region: { ...EMPTY_REGION },
    status: "",
    type: "",
    method: "",
    leader: "",
  });

  const rows: PatrolRow[] = useMemo(() => {
    if (!patrolData.data || !authData.data) return [];
    return patrolData.data.map((p) => ({ patrol: p, jurisdiction: resolveJurisdiction(p, authData.data!) }));
  }, [patrolData.data, authData.data]);

  const ready = !patrolData.loading && !authData.loading && !rangerData.loading;

  const run = async (): Promise<PatrolsReport | undefined> => {
    const matched = filterPatrolRows(rows, filters);
    if (matched.length === 0) return undefined;
    return buildPatrolsReport(matched, filters, currentMeta(), rangerData.data ?? []);
  };

  const renderFilters = () => (
    <div className="space-y-4">
      <Field label="Date range">
        <DateRangeFilter value={filters.range} onChange={(range) => setFilters((f) => ({ ...f, range }))} />
      </Field>
      <Field label="Region">
        <RegionFilter value={filters.region} onChange={(region) => setFilters((f) => ({ ...f, region }))} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <Select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">All statuses</option>
            <option value="planned">Planned</option>
            <option value="assigned">Assigned</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
            <option value="delayed">Delayed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </Field>
        <Field label="Type">
          <Select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}>
            <option value="">All types</option>
            {Object.entries(patrolTypeLabels).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Method">
          <Select value={filters.method} onChange={(e) => setFilters((f) => ({ ...f, method: e.target.value }))}>
            <option value="">All methods</option>
            {Object.entries(patrolMethodLabels).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Patrol leader">
          <Select value={filters.leader} onChange={(e) => setFilters((f) => ({ ...f, leader: e.target.value }))}>
            <option value="">All leaders</option>
            {(rangerData.data ?? [])
              .filter((r) => rows.some((x) => x.patrol.leader === r.name || x.patrol.rangerId === r.id))
              .map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
          </Select>
        </Field>
      </div>
    </div>
  );

  const renderResult = (report: PatrolsReport) => {
    const s = report.summary;
    return (
      <ReportPreview title={report.title} meta={report.meta} filterSummary={report.filters}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ReportStat label="Total patrols" value={s.total} />
          <ReportStat label="Ongoing" value={s.ongoing} />
          <ReportStat label="Completed" value={s.completed} />
          <ReportStat label="Planned / assigned" value={s.planned + s.assigned} sub={`${s.delayed} delayed · ${s.cancelled} cancelled`} />
          <ReportStat label="Distance" value={`${s.totalKm.toFixed(1)} km`} />
          <ReportStat label="Duration" value={`${s.totalHours.toFixed(1)} h`} />
          <ReportStat label="Avg coverage" value={`${s.avgCoverage}%`} />
          <ReportStat label="Observations / incidents" value={`${s.observations} / ${s.incidents}`} sub={`${s.checkpoints} checkpoints`} />
        </div>
        <ReportSection title={`Patrol summary (${report.rows.length})`}>
          <DataTable
            rows={report.rows.map((r) => ({ ...r, id: r.patrol.id }))}
            dense
            onRowClick={(r) => router.push(`/patrols/${r.patrol.id}`)}
            columns={[
              { key: "code", header: "Patrol", render: (r) => patrolCodeCell(r.patrol.code) },
              { key: "title", header: "Title", render: (r) => <span className="font-medium text-ink">{r.patrol.title}</span> },
              { key: "status", header: "Status", render: (r) => statusBadge(r.patrol) },
              { key: "type", header: "Type", render: (r) => patrolTypeLabels[r.patrol.type] ?? r.patrol.type },
              { key: "method", header: "Method", render: (r) => (r.patrol.method ? patrolMethodLabels[r.patrol.method] ?? r.patrol.method : "—") },
              { key: "leader", header: "Leader", render: (r) => r.patrol.leader },
              { key: "area", header: "Area", render: (r) => `${unitName(r.patrol.range)} / ${unitName(r.patrol.beat)}` },
              { key: "distance", header: "Dist (km)", render: (r) => r.patrol.distanceKm.toFixed(1) },
              { key: "duration", header: "Duration", render: (r) => `${r.patrol.durationMin} min` },
            ]}
          />
        </ReportSection>
      </ReportPreview>
    );
  };

  return (
    <ReportDialog<PatrolsReport>
      open={open}
      onClose={onClose}
      title="Generate patrol report"
      note="Covers patrol records — summary and per-patrol detail for the selected period and area."
      canGenerate={isValidRange(filters.range)}
      renderFilters={ready ? renderFilters : () => <LoadingState label="Loading patrol data…" />}
      run={ready ? run : async () => undefined}
      renderResult={renderResult}
      exportData={(report) => ({ filename: `patrol-report-${stampDate()}`, rows: patrolsReportRows(report, rangerData.data ?? []) })}
    />
  );
}

/* ------------------------------------------------------------------ */
/* 2. Individual patrol report                                         */
/* ------------------------------------------------------------------ */

export function PatrolReportDialog({
  open,
  onClose,
  patrol,
  jurisdiction,
}: {
  open: boolean;
  onClose(): void;
  patrol: Patrol;
  jurisdiction: JurisdictionResolution;
}) {
  const router = useRouter();
  const obsData = useAsyncData(() =>
    observations.list().then((all) => all.filter((o) => o.patrolId === patrol.id))
  );
  const rangerData = useAsyncData(() => rangers.list());
  const ready = !obsData.loading && !rangerData.loading;

  const run = async (): Promise<IndividualPatrolReport | undefined> => {
    if (!ready) return undefined;
    return buildPatrolReport(patrol, jurisdiction, obsData.data ?? [], currentMeta(), rangerData.data ?? []);
  };

  const renderFilters = () => (
    <div className="space-y-3">
      <p className="text-sm text-ink">
        <span className="font-medium">{patrol.code}</span> · {patrol.title}
      </p>
      <p className="text-xs text-ink-soft">
        This report covers the selected patrol record only — date, period and area are taken from the
        patrol itself ({unitName(patrol.division)} / {unitName(patrol.range)} / {unitName(patrol.beat)}).
      </p>
    </div>
  );

  const renderResult = (r: IndividualPatrolReport) => {
    const p = r.patrol;
    const eventTone = (k: string) =>
      k === "incident" || k === "sos" ? "danger" : k === "observation" ? "warning" : k === "checkpoint" ? "info" : "forest";
    return (
      <ReportPreview title={`Patrol Report — ${p.code}`} meta={r.meta} filterSummary={{ Patrol: p.code, Title: p.title, Area: `${unitName(p.division)} / ${unitName(p.range)} / ${unitName(p.beat)}` }}>
        <ReportSection title="Patrol information">
          <StatRow
            items={[
              { label: "Status", value: patrolStatusLabelOf(p.status) },
              { label: "Type", value: patrolTypeLabels[p.type] ?? p.type },
              { label: "Method", value: p.method ? patrolMethodLabels[p.method] ?? p.method : "—" },
              { label: "Leader", value: r.leaderName },
              { label: "Scheduled", value: dateLabel(p.startScheduled) },
              { label: "Started", value: dateLabel(p.startActual) },
              { label: "Jurisdiction", value: jurisdictionLabelOf[r.jurisdiction.state] },
              { label: "Authorization", value: r.jurisdiction.authorization?.id ?? "—" },
            ]}
          />
        </ReportSection>
        <ReportSection title="Performance">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ReportStat label="Distance" value={`${p.distanceKm.toFixed(1)} km`} />
            <ReportStat label="Duration" value={`${p.durationMin} min`} />
            <ReportStat label="Coverage" value={`${p.coveragePct}%`} />
            <ReportStat label="Checkpoints" value={p.checkpoints} />
            <ReportStat label="Observations" value={p.observations} />
            <ReportStat label="Incidents" value={p.incidents} />
            <ReportStat label="Photos" value={p.photos} />
            <ReportStat label="Team size" value={1 + p.members.length} />
          </div>
        </ReportSection>
        <ReportSection title={`Track · ${r.route.length} points`}>
          <DataTable
            rows={r.route.map((pt) => ({ id: `pt-${pt.step}`, ...pt }))}
            dense
            columns={[
              { key: "step", header: "Step", render: (x) => <span className="font-mono text-xs">{x.step}</span> },
              { key: "label", header: "Point", render: (x) => x.label },
              { key: "lat", header: "Latitude", render: (x) => x.lat.toFixed(5) },
              { key: "lng", header: "Longitude", render: (x) => x.lng.toFixed(5) },
            ]}
          />
        </ReportSection>
        <ReportSection title={`Timeline · ${r.timeline.length} events`}>
          <Timeline
            items={r.timeline.map((ev) => ({
              time: dateLabel(ev.time),
              title: ev.label,
              detail: ev.ranger ? `By ${ev.ranger}` : undefined,
              tone: eventTone(ev.kind) as "forest" | "warning" | "info" | "danger",
            }))}
          />
        </ReportSection>
        <ReportSection title={`Observations & reports · ${r.observations.length}`}>
          <DataTable
            rows={r.observations.map((o) => ({ ...o }))}
            dense
            onRowClick={(o) => router.push(`/observations/${o.id}`)}
            columns={[
              { key: "code", header: "Code", render: (o) => patrolCodeCell(o.code) },
              { key: "category", header: "Category", render: (o) => categoryMeta[o.category]?.label ?? o.category },
              { key: "subcategory", header: "Subcategory", render: (o) => o.subcategory ?? "—" },
              { key: "title", header: "Title", render: (o) => o.title },
              { key: "severity", header: "Severity", render: (o) => <Badge tone={severityTone[o.severity]}>{o.severity}</Badge> },
              { key: "recordedBy", header: "Recorder", render: (o) => o.recordedBy },
            ]}
          />
        </ReportSection>
      </ReportPreview>
    );
  };

  return (
    <ReportDialog<IndividualPatrolReport>
      open={open}
      onClose={onClose}
      title="Generate patrol report"
      note="Single-record report for the patrol shown on this page."
      canGenerate
      renderFilters={ready ? renderFilters : () => <LoadingState label="Loading record data…" />}
      run={ready ? run : async () => undefined}
      renderResult={renderResult}
      exportData={(r) => ({
        filename: `patrol-${r.patrol.id}-${stampDate()}`,
        rows: [...patrolInfoRows(r), ...patrolRouteRows(r), ...patrolTimelineRows(r), ...patrolObservationRows(r)],
      })}
    />
  );
}

/* ------------------------------------------------------------------ */
/* 3. Observations & reports                                           */
/* ------------------------------------------------------------------ */

export function ObservationsReportDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const router = useRouter();
  const obsData = useAsyncData(() => observations.list());
  const [filters, setFilters] = useState<ObservationReportFilters>({
    range: quickRange("thisMonth"),
    region: { ...EMPTY_REGION },
    recordedBy: "",
    category: "",
    subcategory: "",
  });

  const subcategoryOptions = useMemo(() => {
    if (!obsData.data) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const o of obsData.data) {
      if (filters.category && o.category !== filters.category) continue;
      if (o.subcategory && !seen.has(o.subcategory)) {
        seen.add(o.subcategory);
        out.push(o.subcategory);
      }
    }
    return out;
  }, [obsData.data, filters.category]);

  const recorderOptions = useMemo(() => {
    if (!obsData.data) return [];
    const seen = new Set<string>();
    for (const o of obsData.data) if (o.recordedBy) seen.add(o.recordedBy);
    return [...seen].sort();
  }, [obsData.data]);

  const ready = !obsData.loading;

  const run = async (): Promise<ObservationsReport | undefined> => {
    const matched = filterObservations(obsData.data ?? [], filters);
    if (matched.length === 0) return undefined;
    return buildObservationsReport(matched, filters, currentMeta());
  };

  const renderFilters = () => (
    <div className="space-y-4">
      <Field label="Date range">
        <DateRangeFilter value={filters.range} onChange={(range) => setFilters((f) => ({ ...f, range }))} />
      </Field>
      <Field label="Region">
        <RegionFilter value={filters.region} onChange={(region) => setFilters((f) => ({ ...f, region }))} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <Select
            value={filters.category}
            onChange={(e) =>
              setFilters((f) => ({ ...f, category: e.target.value as ObservationCategory | "", subcategory: "" }))
            }
          >
            <option value="">All categories</option>
            {Object.entries(categoryMeta).map(([v, m]) => (
              <option key={v} value={v}>{m.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Subcategory">
          <Select
            value={filters.subcategory}
            onChange={(e) => setFilters((f) => ({ ...f, subcategory: e.target.value }))}
            disabled={subcategoryOptions.length === 0}
          >
            <option value="">{filters.category ? "All subcategories" : "Select a category first"}</option>
            {subcategoryOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Recorded by">
          <Select value={filters.recordedBy} onChange={(e) => setFilters((f) => ({ ...f, recordedBy: e.target.value }))}>
            <option value="">All recorders</option>
            {recorderOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </Select>
        </Field>
      </div>
    </div>
  );

  const renderResult = (report: ObservationsReport) => {
    const s = report.summary;
    return (
      <ReportPreview title="Observations & Reports" meta={report.meta} filterSummary={report.filters}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ReportStat label="Total reports" value={s.total} />
          {s.byCategory.map((c) => (
            <ReportStat key={c.key} label={c.label} value={c.count} />
          ))}
          <ReportStat label="Recorders" value={s.rangerCount} />
          <ReportStat label="Urgent" value={s.urgentCount} />
          <ReportStat label="Escalated" value={s.escalatedCount} />
        </div>
        <ReportSection title={`Reports (${report.rows.length})`}>
          <DataTable
            rows={report.rows.map((o) => ({ ...o }))}
            dense
            onRowClick={(o) => router.push(`/observations/${o.id}`)}
            columns={[
              { key: "code", header: "Code", render: (o) => patrolCodeCell(o.code) },
              { key: "category", header: "Category", render: (o) => categoryMeta[o.category]?.label ?? o.category },
              { key: "subcategory", header: "Subcategory", render: (o) => o.subcategory ?? "—" },
              { key: "title", header: "Title", render: (o) => o.title },
              { key: "severity", header: "Severity", render: (o) => <Badge tone={severityTone[o.severity]}>{o.severity}</Badge> },
              { key: "status", header: "Status", render: (o) => o.status },
              { key: "recordedAt", header: "Recorded", render: (o) => dateLabel(o.recordedAt) },
              { key: "recordedBy", header: "Recorder", render: (o) => o.recordedBy },
              { key: "area", header: "Area", render: (o) => `${unitName(o.range)} / ${unitName(o.beat)}` },
            ]}
          />
        </ReportSection>
      </ReportPreview>
    );
  };

  return (
    <ReportDialog<ObservationsReport>
      open={open}
      onClose={onClose}
      title="Generate observations report"
      note="Covers sighting, impact, water-body, mortality and other reports for the selected period and area."
      canGenerate={isValidRange(filters.range)}
      renderFilters={ready ? renderFilters : () => <LoadingState label="Loading report data…" />}
      run={ready ? run : async () => undefined}
      renderResult={renderResult}
      exportData={(report) => ({ filename: `observations-report-${stampDate()}`, rows: observationsReportRows(report) })}
    />
  );
}

/* ------------------------------------------------------------------ */
/* 4. Ranger report                                                    */
/* ------------------------------------------------------------------ */

export function RangerReportDialog({
  open,
  onClose,
  ranger,
}: {
  open: boolean;
  onClose(): void;
  ranger: Ranger;
}) {
  const router = useRouter();
  const patrolData = useAsyncData(() => patrols.list());
  const authData = useAsyncData(() => authorizations.list());
  const obsData = useAsyncData(() => observations.list());
  const [filters, setFilters] = useState<RangerReportFilters>({
    range: quickRange("thisMonth"),
    activity: "",
  });

  const myPatrolRows: { patrol: Patrol; jurisdiction: JurisdictionResolution; observations: Observation[] }[] =
    useMemo(() => {
      if (!patrolData.data || !authData.data || !obsData.data) return [];
      return patrolData.data
        .filter((p) => p.leader === ranger.name || p.rangerId === ranger.id)
        .map((p) => ({
          patrol: p,
          jurisdiction: resolveJurisdiction(p, authData.data!),
          observations: obsData.data!.filter((o) => o.patrolId === p.id),
        }));
    }, [patrolData.data, authData.data, obsData.data, ranger.name, ranger.id]);

  const dateFilteredObs = useMemo(
    () => (obsData.data ?? []).filter((o) => o.recordedBy === ranger.name && inRangePlain(o.recordedAt, filters.range)),
    [obsData.data, ranger.name, filters.range]
  );

  const ready = !patrolData.loading && !authData.loading && !obsData.loading;

  const run = async (): Promise<RangerReport | undefined> => {
    const act = filters.activity;
    const patrolRows = myPatrolRows.filter((r) => {
      if (act === "observation" || act === "incident") return false;
      if (!inRangePlain(r.patrol.startScheduled, filters.range)) return false;
      if (act !== "" && act !== "patrol" && r.patrol.method !== act) return false;
      return true;
    });
    const observationsShown =
      act === "incident" ? [] : dateFilteredObs;
    const incidentsShown =
      act === "observation"
        ? []
        : dateFilteredObs.filter((o) => isIncident(o) && o.patrolId);
    if (patrolRows.length === 0 && observationsShown.length === 0 && incidentsShown.length === 0) return undefined;
    return buildRangerReport(
      ranger,
      patrolRows,
      observationsShown,
      incidentsShown,
      filters,
      currentMeta()
    );
  };

  const renderFilters = () => (
    <div className="space-y-4">
      <Field label="Date range">
        <DateRangeFilter value={filters.range} onChange={(range) => setFilters((f) => ({ ...f, range }))} />
      </Field>
      <Field label="Activity type">
        <Select value={filters.activity} onChange={(e) => setFilters((f) => ({ ...f, activity: e.target.value }))}>
          <option value="">All activity</option>
          <option value="patrol">Patrols</option>
          {Object.entries(patrolMethodLabels).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
          <option value="observation">Observations</option>
          <option value="incident">Incidents</option>
        </Select>
      </Field>
      <p className="text-xs text-ink-soft">
        Covers patrols, observations and incidents recorded by {ranger.name} in the selected period.
      </p>
    </div>
  );

  const renderResult = (report: RangerReport) => {
    const s = report.summary;
    return (
      <ReportPreview
        title={`Ranger Report — ${report.ranger.name}`}
        meta={report.meta}
        filterSummary={{ ...report.filters, Ranger: `${report.ranger.code} · ${report.ranger.designation}`, Area: `${unitName(report.ranger.division)} / ${unitName(report.ranger.range)} / ${unitName(report.ranger.beat)}` }}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ReportStat label="Patrols" value={s.patrols} />
          <ReportStat label="Completed" value={s.completed} sub={`${s.ongoing} ongoing`} />
          <ReportStat label="Distance" value={`${s.totalKm.toFixed(1)} km`} />
          <ReportStat label="Field time" value={`${s.totalHours.toFixed(1)} h`} />
          <ReportStat label="Avg coverage" value={`${s.avgCoverage}%`} />
          <ReportStat label="Observations" value={s.observations} />
          <ReportStat label="Incidents" value={s.incidents} />
          <ReportStat label="Cross-jurisdiction" value={s.crossJurisdiction} />
        </div>
        <ReportSection title={`Patrol history (${report.rows.length})`}>
          <DataTable
            rows={report.rows.map((r) => ({ id: r.patrol.id, ...r }))}
            dense
            onRowClick={(r) => router.push(`/patrols/${r.patrol.id}`)}
            columns={[
              { key: "code", header: "Patrol", render: (r) => patrolCodeCell(r.patrol.code) },
              { key: "title", header: "Title", render: (r) => r.patrol.title },
              { key: "status", header: "Status", render: (r) => statusBadge(r.patrol) },
              { key: "type", header: "Type", render: (r) => patrolTypeLabels[r.patrol.type] ?? r.patrol.type },
              { key: "method", header: "Method", render: (r) => (r.patrol.method ? patrolMethodLabels[r.patrol.method] ?? r.patrol.method : "—") },
              { key: "area", header: "Area", render: (r) => `${unitName(r.patrol.range)} / ${unitName(r.patrol.beat)}` },
              { key: "distance", header: "Dist (km)", render: (r) => r.patrol.distanceKm.toFixed(1) },
              { key: "coverage", header: "Coverage", render: (r) => `${r.patrol.coveragePct}%` },
            ]}
          />
        </ReportSection>
        <ReportSection title={`Observations (${report.observations.length})`}>
          <DataTable
            rows={report.observations.map((o) => ({ ...o }))}
            dense
            onRowClick={(o) => router.push(`/observations/${o.id}`)}
            columns={[
              { key: "code", header: "Code", render: (o) => patrolCodeCell(o.code) },
              { key: "category", header: "Category", render: (o) => categoryMeta[o.category]?.label ?? o.category },
              { key: "subcategory", header: "Subcategory", render: (o) => o.subcategory ?? "—" },
              { key: "title", header: "Title", render: (o) => o.title },
              { key: "severity", header: "Severity", render: (o) => <Badge tone={severityTone[o.severity]}>{o.severity}</Badge> },
              { key: "date", header: "Recorded", render: (o) => dateLabel(o.recordedAt) },
            ]}
          />
        </ReportSection>
        <ReportSection title={`Incidents (${report.incidents.length})`}>
          <DataTable
            rows={report.incidents.map((o) => ({ ...o }))}
            dense
            onRowClick={(o) => router.push(`/observations/${o.id}`)}
            columns={[
              { key: "code", header: "Code", render: (o) => patrolCodeCell(o.code) },
              { key: "category", header: "Category", render: (o) => categoryMeta[o.category]?.label ?? o.category },
              { key: "title", header: "Title", render: (o) => o.title },
              { key: "severity", header: "Severity", render: (o) => <Badge tone={severityTone[o.severity]}>{o.severity}</Badge> },
              { key: "actionTaken", header: "Action taken", render: (o) => o.actionTaken ?? "—" },
            ]}
          />
        </ReportSection>
      </ReportPreview>
    );
  };

  return (
    <ReportDialog<RangerReport>
      open={open}
      onClose={onClose}
      title="Generate ranger report"
      note={`Work record for ${ranger.name} (${ranger.code}) — patrols, observations and incidents.`}
      canGenerate={isValidRange(filters.range)}
      renderFilters={ready ? renderFilters : () => <LoadingState label="Loading ranger data…" />}
      run={ready ? run : async () => undefined}
      renderResult={renderResult}
      exportData={(report) => ({
        filename: `ranger-${report.ranger.code}-${stampDate()}`,
        rows: [...rangerPatrolRows(report), ...rangerObservationRows(report), ...rangerIncidentRows(report)],
      })}
    />
  );
}

/* ------------------------------------------------------------------ */
/* 5. Region report (GIS)                                              */
/* ------------------------------------------------------------------ */

export function RegionReportDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const router = useRouter();
  const patrolData = useAsyncData(() => patrols.list());
  const authData = useAsyncData(() => authorizations.list());
  const obsData = useAsyncData(() => observations.list());
  const rangerData = useAsyncData(() => rangers.list());
  const spatialData = useAsyncData(() => gis.spatial());
  const [filters, setFilters] = useState<RegionReportFilters>({
    range: quickRange("thisMonth"),
    region: { ...EMPTY_REGION },
    rangerIds: [],
    patrolIds: [],
    category: "",
  });

  const rows: PatrolRow[] = useMemo(() => {
    if (!patrolData.data || !authData.data) return [];
    return patrolData.data.map((p) => ({ patrol: p, jurisdiction: resolveJurisdiction(p, authData.data!) }));
  }, [patrolData.data, authData.data]);

  const inRegionPatrols = useMemo(
    () => rows.filter((r) => regionMatches({ division: r.patrol.division, range: r.patrol.range, beat: r.patrol.beat, compartment: r.patrol.compartment }, filters.region)),
    [rows, filters.region]
  );
  const inRegionObs = useMemo(
    () => (obsData.data ?? []).filter((o) => regionMatches({ division: o.division, range: o.range, beat: o.beat }, filters.region)),
    [obsData.data, filters.region]
  );
  const inRegionRangers = useMemo(
    () => (rangerData.data ?? []).filter((r) => regionMatches({ division: r.division, range: r.range, beat: r.beat }, filters.region)),
    [rangerData.data, filters.region]
  );

  const ready = !patrolData.loading && !authData.loading && !obsData.loading && !rangerData.loading && !spatialData.loading;

  const run = async (): Promise<RegionReport | undefined> => {
    const dateOk = (iso: string | null | undefined) => inRangePlain(iso, filters.range);
    const patrolRows = inRegionPatrols.filter(
      (r) =>
        dateOk(r.patrol.startScheduled) &&
        (filters.patrolIds.length === 0 || filters.patrolIds.includes(r.patrol.id)) &&
        (filters.rangerIds.length === 0 || filters.rangerIds.includes(r.patrol.rangerId ?? "") || filters.rangerIds.includes(r.patrol.leader))
    );
    const obsRows = inRegionObs.filter(
      (o) =>
        dateOk(o.recordedAt) &&
        (!filters.category || o.category === filters.category) &&
        (filters.rangerIds.length === 0 || filters.rangerIds.includes(o.recordedBy))
    );
    if (patrolRows.length === 0 && obsRows.length === 0) return undefined;
    return buildRegionReport(patrolRows, obsRows, inRegionRangers, filters, currentMeta());
  };

  const toggleId = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const renderFilters = () => (
    <div className="space-y-4">
      <Field label="Date range">
        <DateRangeFilter value={filters.range} onChange={(range) => setFilters((f) => ({ ...f, range }))} />
      </Field>
      <Field label="Region">
        <RegionFilter
          value={filters.region}
          onChange={(region) => setFilters((f) => ({ ...f, region }))}
          compartments={spatialData.data?.compartments}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Rangers in area (${inRegionRangers.length})`}>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-field border border-line bg-white p-2">
            {inRegionRangers.length === 0 && <p className="px-1 py-1 text-xs text-ink-faint">No rangers posted in this area.</p>}
            {inRegionRangers.map((r) => (
              <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-ink hover:bg-forest-50">
                <input
                  type="checkbox"
                  className="size-3.5 accent-forest-700"
                  checked={filters.rangerIds.includes(r.id)}
                  onChange={() => setFilters((f) => ({ ...f, rangerIds: toggleId(f.rangerIds, r.id) }))}
                />
                {r.name} · {unitName(r.beat)}
              </label>
            ))}
          </div>
        </Field>
        <Field label={`Patrols in area (${inRegionPatrols.length})`}>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-field border border-line bg-white p-2">
            {inRegionPatrols.length === 0 && <p className="px-1 py-1 text-xs text-ink-faint">No patrols recorded in this area.</p>}
            {inRegionPatrols.map((r) => (
              <label key={r.patrol.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-ink hover:bg-forest-50">
                <input
                  type="checkbox"
                  className="size-3.5 accent-forest-700"
                  checked={filters.patrolIds.includes(r.patrol.id)}
                  onChange={() => setFilters((f) => ({ ...f, patrolIds: toggleId(f.patrolIds, r.patrol.id) }))}
                />
                {r.patrol.code} · {r.patrol.title}
              </label>
            ))}
          </div>
        </Field>
      </div>
      <Field label="Observation category">
        <Select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value as ObservationCategory | "" }))}>
          <option value="">All categories</option>
          {Object.entries(categoryMeta).map(([v, m]) => (
            <option key={v} value={v}>{m.label}</option>
          ))}
        </Select>
      </Field>
    </div>
  );

  const renderResult = (report: RegionReport) => {
    const s = report.summary;
    const beatsShown = (spatialData.data?.beats ?? []).filter((b) =>
      regionMatches({ division: b.division, range: b.range, beat: b.id }, filters.region)
    );
    return (
      <ReportPreview title={report.title} meta={report.meta} filterSummary={report.filters}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <ReportStat label="Patrols" value={s.patrols} />
          <ReportStat label="Patrol distance" value={`${s.patrolKm.toFixed(1)} km`} />
          <ReportStat label="Field time" value={`${s.totalHours.toFixed(1)} h`} />
          <ReportStat label="Observations" value={s.observations} />
          <ReportStat label="Incidents" value={s.incidents} />
          <ReportStat label="Active rangers" value={s.activeRangers} />
        </div>
        {beatsShown.length > 0 && (
          <ReportSection title="Coverage map">
            <div className="overflow-hidden rounded-card border border-line">
              <MapWorkspace
                mode="overview"
                heightClass="h-[260px]"
                liveBeats={beatsShown}
                compartments={(spatialData.data?.compartments ?? []).filter((c) =>
                  beatsShown.some((b) => b.id === c.beat)
                )}
                boundary={spatialData.data?.boundary ?? []}
                grids={spatialData.data?.grids ?? []}
                onSelect={() => undefined}
              />
            </div>
          </ReportSection>
        )}
        <ReportSection title={`Patrol activity (${report.patrolRows.length})`}>
          <DataTable
            rows={report.patrolRows.map((r) => ({ id: r.patrol.id, ...r }))}
            dense
            onRowClick={(r) => router.push(`/patrols/${r.patrol.id}`)}
            columns={[
              { key: "code", header: "Patrol", render: (r) => patrolCodeCell(r.patrol.code) },
              { key: "title", header: "Title", render: (r) => r.patrol.title },
              { key: "status", header: "Status", render: (r) => statusBadge(r.patrol) },
              { key: "leader", header: "Leader", render: (r) => r.patrol.leader },
              { key: "beat", header: "Beat", render: (r) => unitName(r.patrol.beat) },
              { key: "distance", header: "Dist (km)", render: (r) => r.patrol.distanceKm.toFixed(1) },
              { key: "coverage", header: "Coverage", render: (r) => `${r.patrol.coveragePct}%` },
            ]}
          />
        </ReportSection>
        <ReportSection title={`Observation reports (${report.observationRows.length})`}>
          <DataTable
            rows={report.observationRows.map((o) => ({ ...o }))}
            dense
            onRowClick={(o) => router.push(`/observations/${o.id}`)}
            columns={[
              { key: "code", header: "Code", render: (o) => patrolCodeCell(o.code) },
              { key: "category", header: "Category", render: (o) => categoryMeta[o.category]?.label ?? o.category },
              { key: "title", header: "Title", render: (o) => o.title },
              { key: "severity", header: "Severity", render: (o) => <Badge tone={severityTone[o.severity]}>{o.severity}</Badge> },
              { key: "recordedBy", header: "Recorder", render: (o) => o.recordedBy },
              { key: "beat", header: "Beat", render: (o) => unitName(o.beat) },
            ]}
          />
        </ReportSection>
        <ReportSection title={`Ranger activity (${report.rangerRows.length})`}>
          <DataTable
            rows={report.rangerRows.map((r) => ({ id: r.ranger.id, ...r }))}
            dense
            onRowClick={(r) => router.push(`/rangers/${r.ranger.id}`)}
            columns={[
              { key: "name", header: "Ranger", render: (r) => <span className="font-medium text-ink">{r.ranger.name}</span> },
              { key: "beat", header: "Beat", render: (r) => unitName(r.ranger.beat) },
              { key: "patrols", header: "Patrols", render: (r) => r.patrols },
              { key: "observations", header: "Observations", render: (r) => r.observations },
              { key: "incidents", header: "Incidents", render: (r) => r.incidents },
              { key: "distance", header: "Dist (km)", render: (r) => r.totalKm.toFixed(1) },
              { key: "hours", header: "Hours", render: (r) => r.totalHours.toFixed(1) },
            ]}
          />
        </ReportSection>
      </ReportPreview>
    );
  };

  return (
    <ReportDialog<RegionReport>
      open={open}
      onClose={onClose}
      title="Generate region report"
      note="Patrol, observation and ranger activity for the selected area — with coverage map."
      canGenerate={isValidRange(filters.range)}
      renderFilters={ready ? renderFilters : () => <LoadingState label="Loading GIS data…" />}
      run={ready ? run : async () => undefined}
      renderResult={renderResult}
      exportData={(report) => ({
        filename: `region-report-${stampDate()}`,
        rows: [...regionPatrolRows(report), ...regionObservationRows(report), ...regionRangerRows(report)],
      })}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Tiny helpers                                                        */
/* ------------------------------------------------------------------ */

function inRangePlain(iso: string | null | undefined, r: DateRange | null): boolean {
  if (!r) return true;
  if (!iso) return false;
  const dd = iso.slice(0, 10);
  return dd >= r.from && dd <= r.to;
}

function stampDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateLabel(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export { ReportButton };

function patrolStatusLabelOf(status: string): string {
  const map: Record<string, string> = {
    planned: "Planned", assigned: "Assigned", ongoing: "Ongoing", completed: "Completed", cancelled: "Cancelled", delayed: "Delayed",
  };
  return map[status] ?? status;
}