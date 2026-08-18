/**
 * Pure report builders — turn service-layer records into official report
 * models (summary, rows, metadata). No UI, no I/O; every function is
 * side-effect free so the same builders power preview and file export.
 */

import { patrolStatusLabel } from "@/lib/nav";
import { patrolTypeLabels, patrolMethodLabels } from "@/lib/mock/patrols";
import { categoryMeta } from "@/lib/mock/observations";
import { jurisdictionLabel } from "@/lib/jurisdiction";
import type { JurisdictionResolution } from "@/lib/jurisdiction";
import type { Observation, Patrol, Ranger } from "@/lib/types";
import type {
  ObservationReportFilters,
  PatrolReportFilters,
  RangerReportFilters,
  RegionReportFilters,
  RegionSelection,
} from "@/lib/reports/report-types";
import { inRange, regionMatches } from "@/lib/reports/report-types";

/** Canonical portal author used in generated report metadata. */
export const DEFAULT_AUTHOR = "V. Kulkarni · Super Admin";

export interface ReportMeta {
  generatedAt: string;
  generatedBy: string;
  generatedByDesignation?: string;
}

export function currentMeta(author?: { name?: string; designation?: string } | null): ReportMeta {
  return {
    generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    generatedBy: author?.name ?? DEFAULT_AUTHOR,
    generatedByDesignation: author?.designation,
  };
}

export type PatrolRow = {
  patrol: Patrol;
  jurisdiction: JurisdictionResolution;
};

/* ------------------------------------------------------------------ */
/* Shared filtering helpers                                            */
/* ------------------------------------------------------------------ */

/** Best-effort recorded date for a patrol record. */
function patrolDate(p: Patrol): string {
  return p.startActual ?? p.startScheduled ?? p.endActual ?? "";
}

export function filterPatrolRows(rows: PatrolRow[], f: PatrolReportFilters): PatrolRow[] {
  return rows.filter((r) => {
    const p = r.patrol;
    if (!inRange(patrolDate(p), f.range)) return false;
    if (!regionMatches({ division: p.division, range: p.range, beat: p.beat, compartment: p.compartment }, f.region)) return false;
    if (f.status && p.status !== f.status) return false;
    if (f.type && p.type !== f.type) return false;
    if (f.method && p.method !== f.method) return false;
    if (f.leader && p.leader !== f.leader && p.rangerId !== f.leader) return false;
    return true;
  });
}

export function filterObservations(
  obs: Observation[],
  f: ObservationReportFilters
): Observation[] {
  return obs.filter((o) => {
    if (!inRange(o.recordedAt, f.range)) return false;
    if (!regionMatches({ division: o.division, range: o.range, beat: o.beat }, f.region)) return false;
    if (f.recordedBy && o.recordedBy !== f.recordedBy) return false;
    if (f.category && o.category !== f.category) return false;
    if (f.subcategory && o.subcategory !== f.subcategory) return false;
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Report 1A — individual patrol report                                */
/* ------------------------------------------------------------------ */

export interface IndividualPatrolReport {
  meta: ReportMeta;
  patrol: Patrol;
  jurisdiction: JurisdictionResolution;
  observations: Observation[];
  timeline: Patrol["timeline"];
  route: { step: number; label: string; lat: number; lng: number }[];
  leaderName: string;
}

export function buildPatrolReport(
  patrol: Patrol,
  jurisdiction: JurisdictionResolution,
  observationsOfPatrol: Observation[],
  meta: ReportMeta,
  rangers: Ranger[]
): IndividualPatrolReport {
  const leaderRanger = rangers.find((r) => r.name === patrol.leader || r.id === patrol.rangerId);
  return {
    meta,
    patrol,
    jurisdiction,
    observations: observationsOfPatrol,
    timeline: patrol.timeline ?? [],
    route: (patrol.route ?? []).map((pt, i) => ({
      step: i + 1,
      label: i === 0 ? "Start" : i === (patrol.route?.length ?? 0) - 1 ? "End" : `Point ${i + 1}`,
      lat: pt.lat,
      lng: pt.lng,
    })),
    leaderName: leaderRanger?.name ?? patrol.leader,
  };
}

export function patrolInfoRows(r: IndividualPatrolReport): Record<string, unknown>[] {
  const p = r.patrol;
  return [
    {
      "Patrol": p.code,
      "Code": p.code,
      "Title": p.title,
      "Type": patrolTypeLabels[p.type] ?? p.type,
      "Method": p.method ? patrolMethodLabels[p.method] ?? p.method : "—",
      "Status": patrolStatusLabel[p.status] ?? p.status,
      "Objective": p.objective,
      "Division": p.division,
      "Range": p.range,
      "Beat": p.beat,
      "Compartment": p.compartment ?? "—",
      "Leader": r.leaderName,
      "Members": p.members.join("; "),
      "Team": p.teamId,
      "Scheduled start": p.startScheduled,
      "Actual start": p.startActual ?? "—",
      "Actual end": p.endActual ?? "—",
      "Jurisdiction": jurisdictionLabel[r.jurisdiction.state],
      "Authorization": r.jurisdiction.authorization?.id ?? "—",
      "Distance (km)": p.distanceKm,
      "Duration (min)": p.durationMin,
      "Coverage (%)": p.coveragePct,
      "Checkpoints": p.checkpoints,
      "Observations": p.observations,
      "Incidents": p.incidents,
      "Photos": p.photos,
    },
  ];
}

export function patrolRouteRows(r: IndividualPatrolReport): Record<string, unknown>[] {
  return r.route.map((pt) => ({
    Step: pt.step,
    Label: pt.label,
    "Latitude": pt.lat.toFixed(5),
    "Longitude": pt.lng.toFixed(5),
  }));
}

export function patrolTimelineRows(r: IndividualPatrolReport): Record<string, unknown>[] {
  return r.timeline.map((ev, i) => ({
    Step: i + 1,
    Time: ev.time,
    Kind: ev.kind,
    Event: ev.label,
    Ranger: ev.ranger ?? "—",
    Detail: ev.detail ?? "—",
  }));
}

export function patrolObservationRows(r: IndividualPatrolReport): Record<string, unknown>[] {
  return r.observations.map((o) => ({
    "Obs. ID": o.id,
    Code: o.code,
    Category: categoryMeta[o.category].label,
    Subcategory: o.subcategory ?? "—",
    Title: o.title,
    Severity: o.severity,
    "Recorded at": o.recordedAt,
    "Recorded by": o.recordedBy,
  }));
}

/* ------------------------------------------------------------------ */
/* Report 1B — multiple patrols report (summary + table)               */
/* ------------------------------------------------------------------ */

export interface PatrolSummary {
  total: number;
  ongoing: number;
  completed: number;
  planned: number;
  cancelled: number;
  delayed: number;
  assigned: number;
  totalKm: number;
  totalHours: number;
  avgCoverage: number;
  checkpoints: number;
  observations: number;
  incidents: number;
}

export function patrolsSummary(rows: PatrolRow[]): PatrolSummary {
  const s: PatrolSummary = { total: 0, ongoing: 0, completed: 0, planned: 0, cancelled: 0, delayed: 0, assigned: 0, totalKm: 0, totalHours: 0, avgCoverage: 0, checkpoints: 0, observations: 0, incidents: 0 };
  for (const r of rows) {
    const p = r.patrol;
    s.total += 1;
    if (p.status === "ongoing") s.ongoing += 1;
    else if (p.status === "completed") s.completed += 1;
    else if (p.status === "planned") s.planned += 1;
    else if (p.status === "cancelled") s.cancelled += 1;
    else if (p.status === "delayed") s.delayed += 1;
    else if (p.status === "assigned") s.assigned += 1;
    s.totalKm += p.distanceKm || 0;
    s.totalHours += (p.durationMin || 0) / 60;
    s.checkpoints += p.checkpoints;
    s.observations += p.observations;
    s.incidents += p.incidents;
    s.avgCoverage += p.coveragePct;
  }
  s.avgCoverage = rows.length ? Math.round(s.avgCoverage / rows.length) : 0;
  return s;
}

export interface PatrolsReport {
  meta: ReportMeta;
  title: string;
  filters: Record<string, string>;
  summary: PatrolSummary;
  rows: PatrolRow[];
}

export function buildPatrolsReport(
  rows: PatrolRow[],
  filters: PatrolReportFilters,
  meta: ReportMeta,
  rangers: Ranger[]
): PatrolsReport {
  const nameOf = (idOrName: string) => rangers.find((r) => r.name === idOrName || r.id === idOrName)?.name ?? idOrName;
  return {
    meta,
    title: "Patrol Report",
    filters: {
      date: filters.range ? `${filters.range.from} – ${filters.range.to}` : "All time",
      region: regionLabelText(filters.region),
      status: filters.status ? patrolStatusLabel[filters.status as keyof typeof patrolStatusLabel] ?? filters.status : "All statuses",
      type: filters.type ? patrolTypeLabels[filters.type] ?? filters.type : "All types",
      method: filters.method ? patrolMethodLabels[filters.method as keyof typeof patrolMethodLabels] ?? filters.method : "All methods",
      leader: filters.leader ? nameOf(filters.leader) : "All patrol leaders",
    },
    summary: patrolsSummary(rows),
    rows,
  };
}

export function regionLabelText(sel: RegionSelection): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const id of [sel.division, sel.range, sel.beat]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    parts.push(id);
  }
  if (sel.compartment) parts.push(`Compartment ${sel.compartment}`);
  return parts.join(" / ") || "All regions";
}

export function patrolsReportRows(report: PatrolsReport, rangers: Ranger[]): Record<string, unknown>[] {
  const nameOf = (idOrName: string) => rangers.find((r) => r.name === idOrName || r.id === idOrName)?.name ?? idOrName;
  return report.rows.map((r) => {
    const p = r.patrol;
    return {
      "Patrol": p.code,
      Title: p.title,
      Status: patrolStatusLabel[p.status] ?? p.status,
      Type: patrolTypeLabels[p.type] ?? p.type,
      Method: p.method ? patrolMethodLabels[p.method] ?? p.method : "—",
      Leader: nameOf(p.leader),
      "Division": p.division,
      "Range": p.range,
      Beat: p.beat,
      Compartment: p.compartment ?? "—",
      "Scheduled": p.startScheduled,
      "Actual start": p.startActual ?? "—",
      "Actual end": p.endActual ?? "—",
      "Duration (min)": p.durationMin,
      "Distance (km)": p.distanceKm,
      "Coverage (%)": p.coveragePct,
      Checkpoints: p.checkpoints,
      Observations: p.observations,
      Incidents: p.incidents,
      Photos: p.photos,
      Jurisdiction: jurisdictionLabel[r.jurisdiction.state],
    };
  });
}

/* ------------------------------------------------------------------ */
/* Report 2 — observations / reports                                   */
/* ------------------------------------------------------------------ */

export interface ObservationSummary {
  total: number;
  byCategory: { key: Observation["category"]; label: string; count: number }[];
  rangerCount: number;
  urgentCount: number;
  escalatedCount: number;
}

export function observationsSummary(obs: Observation[]): ObservationSummary {
  const s: ObservationSummary = {
    total: 0,
    byCategory: Object.entries(categoryMeta).map(([key, m]) => ({ key: key as Observation["category"], label: m.label, count: 0 })),
    rangerCount: 0,
    urgentCount: 0,
    escalatedCount: 0,
  };
  const rangers = new Set<string>();
  for (const o of obs) {
    s.total += 1;
    const b = s.byCategory.find((x) => x.key === o.category);
    if (b) b.count += 1;
    if (o.recordedBy) rangers.add(o.recordedBy);
    if (o.priority === "urgent") s.urgentCount += 1;
    if (o.status === "escalated") s.escalatedCount += 1;
  }
  s.rangerCount = rangers.size;
  return s;
}

export interface ObservationsReport {
  meta: ReportMeta;
  filters: Record<string, string>;
  summary: ObservationSummary;
  rows: Observation[];
}

export function buildObservationsReport(
  obs: Observation[],
  filters: ObservationReportFilters,
  meta: ReportMeta
): ObservationsReport {
  return {
    meta,
    filters: {
      date: filters.range ? `${filters.range.from} – ${filters.range.to}` : "All time",
      region: regionLabelText(filters.region),
      recordedBy: filters.recordedBy || "All recorders",
      category: filters.category ? categoryMeta[filters.category].label : "All categories",
      subcategory: filters.subcategory || "All subcategories",
    },
    summary: observationsSummary(obs),
    rows: obs,
  };
}

export function observationsReportRows(report: ObservationsReport): Record<string, unknown>[] {
  return report.rows.map((o) => ({
    "Obs. ID": o.id,
    Code: o.code,
    Category: categoryMeta[o.category].label,
    Subcategory: o.subcategory ?? "—",
    Title: o.title,
    Description: o.description,
    Severity: o.severity,
    Status: o.status,
    Priority: o.priority ?? "—",
    "Recorded at": o.recordedAt,
    "Recorded by": o.recordedBy,
    "Division": o.division,
    "Range": o.range,
    Beat: o.beat,
    "Patrol": o.patrolId ?? "—",
    "Latitude": o.lat,
    "Longitude": o.lng,
    Species: o.species ?? "—",
    "Group size": o.groupSize ?? "—",
    "Action taken": o.actionTaken ?? "—",
    Media: (o.media?.length ?? 0) > 0 ? o.media!.map((m) => m.type).join(" + ") : "—",
  }));
}

/* ------------------------------------------------------------------ */
/* Report 3 — ranger report                                            */
/* ------------------------------------------------------------------ */

export interface RangerActivityRow {
  patrol: Patrol;
  jurisdiction: JurisdictionResolution;
  observations: Observation[];
}

export interface RangerWorkSummary {
  patrols: number;
  completed: number;
  ongoing: number;
  totalKm: number;
  totalHours: number;
  avgCoverage: number;
  observations: number;
  incidents: number;
  photos: number;
  crossJurisdiction: number;
}

export function rangerSummary(rows: RangerActivityRow[]): RangerWorkSummary {
  const s: RangerWorkSummary = { patrols: 0, completed: 0, ongoing: 0, totalKm: 0, totalHours: 0, avgCoverage: 0, observations: 0, incidents: 0, photos: 0, crossJurisdiction: 0 };
  for (const r of rows) {
    const p = r.patrol;
    s.patrols += 1;
    if (p.status === "completed") s.completed += 1;
    else if (p.status === "ongoing") s.ongoing += 1;
    s.totalKm += p.distanceKm || 0;
    s.totalHours += (p.durationMin || 0) / 60;
    s.avgCoverage += p.coveragePct;
    s.observations += p.observations;
    s.incidents += p.incidents;
    s.photos += p.photos;
    if (r.jurisdiction.state !== "normal") s.crossJurisdiction += 1;
  }
  s.avgCoverage = rows.length ? Math.round(s.avgCoverage / rows.length) : 0;
  return s;
}

export interface RangerReport {
  meta: ReportMeta;
  ranger: Ranger;
  filters: Record<string, string>;
  summary: RangerWorkSummary;
  rows: RangerActivityRow[];
  observations: Observation[];
  incidents: Observation[];
}

export function buildRangerReport(
  ranger: Ranger,
  rows: RangerActivityRow[],
  observations: Observation[],
  incidents: Observation[],
  filters: RangerReportFilters,
  meta: ReportMeta
): RangerReport {
  return {
    meta,
    ranger,
    filters: {
      date: filters.range ? `${filters.range.from} – ${filters.range.to}` : "All time",
      activity: filters.activity ? activityLabel(filters.activity) : "All activity",
    },
    summary: rangerSummary(rows),
    rows,
    observations,
    incidents,
  };
}

export function activityLabel(key: string): string {
  const map: Record<string, string> = {
    patrol: "All patrols",
    foot: "Foot",
    motorcycle: "Motor Cycle",
    "four-wheeler": "Four Wheeler",
    boat: "Boat",
    cycle: "Cycle",
    observation: "Observations",
    incident: "Incidents",
  };
  return map[key] ?? key;
}

export function rangerPatrolRows(report: RangerReport): Record<string, unknown>[] {
  return report.rows.map((r) => {
    const p = r.patrol;
    return {
      "Patrol": p.code,
      Title: p.title,
      Status: patrolStatusLabel[p.status] ?? p.status,
      Type: patrolTypeLabels[p.type] ?? p.type,
      Method: p.method ? patrolMethodLabels[p.method] ?? p.method : "—",
      "Division": p.division,
      "Range": p.range,
      Beat: p.beat,
      "Scheduled": p.startScheduled,
      "Actual start": p.startActual ?? "—",
      "Actual end": p.endActual ?? "—",
      "Duration (min)": p.durationMin,
      "Distance (km)": p.distanceKm,
      "Coverage (%)": p.coveragePct,
      Checkpoints: p.checkpoints,
      Observations: p.observations,
      Incidents: p.incidents,
      Jurisdiction: jurisdictionLabel[r.jurisdiction.state],
    };
  });
}

export function rangerObservationRows(report: RangerReport): Record<string, unknown>[] {
  return report.observations.map((o) => ({
    "Obs. ID": o.id,
    Code: o.code,
    Category: categoryMeta[o.category].label,
    Subcategory: o.subcategory ?? "—",
    Title: o.title,
    Severity: o.severity,
    Status: o.status,
    "Recorded at": o.recordedAt,
    "Patrol": o.patrolId ?? "—",
    "Division": o.division,
    "Range": o.range,
    Beat: o.beat,
  }));
}

export function rangerIncidentRows(report: RangerReport): Record<string, unknown>[] {
  return report.incidents.map((o) => ({
    "Obs. ID": o.id,
    Code: o.code,
    Category: categoryMeta[o.category].label,
    Subcategory: o.subcategory ?? "—",
    Title: o.title,
    Severity: o.severity,
    "Recorded at": o.recordedAt,
    "Patrol": o.patrolId ?? "—",
    "Action taken": o.actionTaken ?? "—",
  }));
}

/* ------------------------------------------------------------------ */
/* Report 4 — region report                                            */
/* ------------------------------------------------------------------ */

export interface RegionRangerRow {
  ranger: Ranger;
  patrols: number;
  observations: number;
  incidents: number;
  totalKm: number;
  totalHours: number;
}

export interface RegionReport {
  meta: ReportMeta;
  title: string;
  filters: Record<string, string>;
  patrolRows: PatrolRow[];
  observationRows: Observation[];
  rangerRows: RegionRangerRow[];
  summary: { patrols: number; patrolKm: number; totalHours: number; observations: number; incidents: number; activeRangers: number };
}

const INCIDENT_CATEGORIES: Observation["category"][] = ["human-impact", "mortality"];

export function isIncident(o: Observation): boolean {
  return INCIDENT_CATEGORIES.includes(o.category);
}

export function buildRegionReport(
  patrolRows: PatrolRow[],
  observationRows: Observation[],
  rangers: Ranger[],
  filters: RegionReportFilters,
  meta: ReportMeta
): RegionReport {
  const incidents = observationRows.filter((o) => isIncident(o));
  const rangerRows: RegionRangerRow[] = rangers
    .map((r) => {
      const patrolsHere = patrolRows.filter((x) => x.patrol.leader === r.name || x.patrol.rangerId === r.id);
      const obsHere = observationRows.filter((o) => o.recordedBy === r.name);
      return {
        ranger: r,
        patrols: patrolsHere.length,
        observations: obsHere.length,
        incidents: obsHere.filter((o) => isIncident(o)).length,
        totalKm: patrolsHere.reduce((a, x) => a + (x.patrol.distanceKm || 0), 0),
        totalHours: patrolsHere.reduce((a, x) => a + (x.patrol.durationMin || 0) / 60, 0),
      };
    })
    .filter((r) => r.patrols > 0 || r.observations > 0);
  return {
    meta,
    title: "Region Report",
    filters: {
      date: filters.range ? `${filters.range.from} – ${filters.range.to}` : "All time",
      region: regionLabelText(filters.region),
      rangers: filters.rangerIds.length ? `Selected (${filters.rangerIds.length})` : "All rangers",
      patrols: filters.patrolIds.length ? `Selected (${filters.patrolIds.length})` : "All patrols",
      category: filters.category ? categoryMeta[filters.category].label : "All categories",
    },
    patrolRows,
    observationRows,
    rangerRows,
    summary: {
      patrols: patrolRows.length,
      patrolKm: patrolRows.reduce((a, x) => a + (x.patrol.distanceKm || 0), 0),
      totalHours: patrolRows.reduce((a, x) => a + (x.patrol.durationMin || 0) / 60, 0),
      observations: observationRows.length,
      incidents: incidents.length,
      activeRangers: rangerRows.length,
    },
  };
}

export function regionPatrolRows(report: RegionReport): Record<string, unknown>[] {
  return report.patrolRows.map((r) => {
    const p = r.patrol;
    return {
      "Patrol": p.code,
      Title: p.title,
      Status: patrolStatusLabel[p.status] ?? p.status,
      Leader: p.leader,
      "Division": p.division,
      "Range": p.range,
      Beat: p.beat,
      "Scheduled": p.startScheduled,
      "Duration (min)": p.durationMin,
      "Distance (km)": p.distanceKm,
      "Coverage (%)": p.coveragePct,
      Observations: p.observations,
      Incidents: p.incidents,
    };
  });
}

export function regionObservationRows(report: RegionReport): Record<string, unknown>[] {
  return report.observationRows.map((o) => ({
    "Obs. ID": o.id,
    Code: o.code,
    Category: categoryMeta[o.category].label,
    Subcategory: o.subcategory ?? "—",
    Title: o.title,
    Severity: o.severity,
    Status: o.status,
    "Recorded at": o.recordedAt,
    "Recorded by": o.recordedBy,
    "Division": o.division,
    "Range": o.range,
    Beat: o.beat,
    "Patrol": o.patrolId ?? "—",
  }));
}

export function regionRangerRows(report: RegionReport): Record<string, unknown>[] {
  return report.rangerRows.map((r) => ({
    Ranger: r.ranger.name,
    Code: r.ranger.code,
    Designation: r.ranger.designation,
    "Division": r.ranger.division,
    "Range": r.ranger.range,
    Beat: r.ranger.beat,
    Patrols: r.patrols,
    Observations: r.observations,
    Incidents: r.incidents,
    "Distance (km)": Number(r.totalKm.toFixed(1)),
    Hours: Number(r.totalHours.toFixed(1)),
  }));
}

export type {
  DateRange,
  ObservationReportFilters,
  PatrolReportFilters,
  RangerReportFilters,
  RegionReportFilters,
  RegionSelection,
} from "@/lib/reports/report-types";