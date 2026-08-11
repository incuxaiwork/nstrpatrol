/**
 * Service / repository abstraction — the ONLY data entry point for UI code.
 *
 * Currently backed by mock data (lib/mock/*). When the backend API exists,
 * swap each implementation for a fetch-based call WITHOUT changing the UI.
 *
 * Simulated latency lets loading/skeleton states exercise the same code path
 * that real network requests will use.
 */

import { mockPatrols, mockPatrolReports, patrolMethodLabels, patrolTypeLabels } from "@/lib/mock/patrols";
import { mockAuthorizations } from "@/lib/mock/authorizations";
import { resolveJurisdiction } from "@/lib/jurisdiction";
import {
  mockEquipment,
  mockRangers,
  mockTeams,
  mockVehicles,
  mockWeapons,
  rangerTrends,
} from "@/lib/mock/people";
import {
  categoryMeta,
  mockNotifications,
  mockObservations,
  searchIndex,
} from "@/lib/mock/observations";
import {
  defaultLayers,
  gisHeat,
  gisMarkers,
  gisRoutes,
  mapBeatsRaw,
} from "@/lib/mock/gis";
import {
  beatCoverage,
  comparativeSeries,
  heatmapPatrol,
  humanImpactTrend,
  incidentTrend,
  monthlyTrend,
  mortalityTrend,
  scopeKpis,
  waterBodyStatus,
  weeklyActivity,
  wildlifeSightings,
} from "@/lib/mock/analytics";
import {
  mockAudit,
  mockMasterData,
  mockNotificationTemplates,
  mockRoles,
  mockSettings,
  mockUsers,
} from "@/lib/mock/admin";
import { mockDivisions, mockRanges } from "@/lib/mock/hierarchy";
import type {
  AnalyticsDataset,
  AdminUser,
  AuditEntry,
  AuthorizationStatus,
  DashboardSummary,
  EquipmentItem,
  JurisdictionState,
  KpiSeries,
  MapLayerDef,
  MasterData,
  NotificationItem,
  NotificationTemplate,
  Observation,
  Patrol,
  PatrolAuthorization,
  PatrolReport,
  PatrolStatus,
  Ranger,
  Role,
  SearchResult,
  SiteSettings,
  Team,
  Vehicle,
  Weapon,
} from "@/lib/types";

const delay = (ms = 300) => new Promise<void>((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Patrols                                                            */
/* ------------------------------------------------------------------ */

export const patrols = {
  list: async (): Promise<Patrol[]> => {
    await delay();
    return mockPatrols;
  },
  get: async (id: string): Promise<Patrol | undefined> => {
    await delay();
    return mockPatrols.find((p) => p.id === id);
  },
  byStatus: async (status: PatrolStatus): Promise<Patrol[]> => {
    await delay();
    return mockPatrols.filter((p) => p.status === status);
  },
  reports: async (): Promise<PatrolReport[]> => {
    await delay();
    return mockPatrolReports;
  },
  typeLabels: patrolTypeLabels,
  methodLabels: patrolMethodLabels,
};

/* ------------------------------------------------------------------ */
/* Patrol authorizations (special patrol permissions)                 */
/* ------------------------------------------------------------------ */

/** In-session store so create / approve / revoke work without a backend. */
let authStore: PatrolAuthorization[] = [...mockAuthorizations];

let authSeq = 125;

export const authorizations = {
  list: async (): Promise<PatrolAuthorization[]> => {
    await delay();
    return [...authStore];
  },
  get: async (id: string): Promise<PatrolAuthorization | undefined> => {
    await delay();
    return authStore.find((a) => a.id === id);
  },
  /** Related patrols performed under an authorization (PRD §18). */
  relatedPatrols: async (id: string): Promise<Patrol[]> => {
    await delay();
    return mockPatrols.filter((p) => p.authorizationId === id);
  },
  create: async (
    input: Omit<PatrolAuthorization, "id" | "status" | "createdDate" | "history"> & { status?: AuthorizationStatus }
  ): Promise<PatrolAuthorization> => {
    await delay();
    const auth: PatrolAuthorization = {
      ...input,
      id: `AUTH-2026-${String(authSeq++).padStart(5, "0")}`,
      status: input.status ?? "draft",
      createdDate: new Date().toISOString(),
      history: [
        {
          time: new Date().toISOString(),
          user: "V. Kulkarni · Super Admin",
          action: "Created",
          description: `Authorization ${input.status === "active" ? "created and approved" : "created as draft"}`,
        },
      ],
    };
    if (auth.status === "active") {
      auth.approvedBy = "V. Kulkarni · Super Admin";
      auth.approvalDate = auth.createdDate;
      auth.history.push({
        time: auth.createdDate,
        user: "V. Kulkarni · Super Admin",
        action: "Approved",
        description: "Approved by Super Admin; authorization activated",
      });
    }
    authStore = [auth, ...authStore];
    return auth;
  },
  approve: async (id: string): Promise<PatrolAuthorization | undefined> => {
    await delay();
    const auth = authStore.find((a) => a.id === id);
    if (!auth || auth.status !== "pending") return auth;
    auth.status = "active";
    auth.approvedBy = "V. Kulkarni · Super Admin";
    auth.approvalDate = new Date().toISOString();
    auth.history.push({
      time: new Date().toISOString(),
      user: "V. Kulkarni · Super Admin",
      action: "Approved",
      description: "Approved by Super Admin; authorization activated",
    });
    return { ...auth };
  },
  revoke: async (id: string): Promise<PatrolAuthorization | undefined> => {
    await delay();
    const auth = authStore.find((a) => a.id === id);
    if (!auth || auth.status !== "active") return auth;
    auth.status = "revoked";
    auth.history.push({
      time: new Date().toISOString(),
      user: "V. Kulkarni · Super Admin",
      action: "Revoked",
      description: "Revoked by Super Admin",
    });
    return { ...auth };
  },
};

/* ------------------------------------------------------------------ */
/* Rangers                                                            */
/* ------------------------------------------------------------------ */

export const rangers = {
  list: async (): Promise<Ranger[]> => {
    await delay();
    return mockRangers;
  },
  get: async (id: string): Promise<Ranger | undefined> => {
    await delay();
    return mockRangers.find((r) => r.id === id);
  },
  trend: async (id: string): Promise<AnalyticsDataset> => {
    await delay();
    return (
      rangerTrends[id] ?? {
        labels: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
        series: [{ name: "Patrols", values: [10, 11, 10, 12, 11, 10] }],
      }
    );
  },
  teams: async (): Promise<Team[]> => {
    await delay();
    return mockTeams;
  },
  vehicles: async (): Promise<Vehicle[]> => {
    await delay();
    return mockVehicles;
  },
  weapons: async (): Promise<Weapon[]> => {
    await delay();
    return mockWeapons;
  },
  equipment: async (): Promise<EquipmentItem[]> => {
    await delay();
    return mockEquipment;
  },
};

/* ------------------------------------------------------------------ */
/* Observations                                                       */
/* ------------------------------------------------------------------ */

export const observations = {
  list: async (): Promise<Observation[]> => {
    await delay();
    return mockObservations;
  },
  get: async (id: string): Promise<Observation | undefined> => {
    await delay();
    return mockObservations.find((o) => o.id === id);
  },
  categoryMeta,
};

/* ------------------------------------------------------------------ */
/* Dashboard                                                          */
/* ------------------------------------------------------------------ */

export const dashboard = {
  summary: async (): Promise<DashboardSummary> => {
    await delay(420);
    const active = mockPatrols.filter((p) => p.status === "ongoing").length;
    const today = mockPatrols.filter(
      (p) => new Date(p.startScheduled).toDateString() === new Date().toDateString()
    );
    const patrolsStartedToday = today.length;
    const patrolsCompletedToday = mockPatrols.filter(
      (p) => p.status === "completed" && new Date(p.endActual ?? p.startScheduled).toDateString() === new Date().toDateString()
    ).length;
    const openIncidents = mockObservations.filter(
      (o) => o.severity === "critical" || o.severity === "high"
    ).length;
    const jurisdiction = mockPatrols.map((p) => resolveJurisdiction(p, authStore).state);
    const count = (s: JurisdictionState) => jurisdiction.filter((x) => x === s).length;
    const todayJurisdiction = today.map((p) => resolveJurisdiction(p, authStore).state);
    const activeAuthorizations = authStore.filter((a) => a.status === "active").length;
    return {
      activePatrols: active,
      patrolsStartedToday,
      patrolsCompletedToday,
      rangersPatrolling: mockRangers.filter((r) => r.dutyStatus === "field").length,
      activeAuthorizations,
      crossJurisdictionPatrols: count("authorized-exception"),
      requiringReview: count("requires-review") + count("pending-review"),
      normalToday: todayJurisdiction.filter((x) => x === "normal").length,
      authorizedToday: todayJurisdiction.filter((x) => x === "authorized-exception").length,
      openIncidents,
      reportsToday: mockObservations.length,
      rangersOnDuty: mockRangers.filter(
        (r) => r.dutyStatus === "field" || r.dutyStatus === "on-duty"
      ).length,
      rangersTotal: mockRangers.length,
      coveragePct: 82,
      zeroPatrolZones: 3,
      zeroPatrolList: [
        { beat: "C1-B", days: 16 },
        { beat: "S1-B", days: 21 },
        { beat: "N2-B", days: 13 },
      ],
      byStatus: [
        { status: "planned", count: 2 },
        { status: "assigned", count: 0 },
        { status: "ongoing", count: active },
        { status: "completed", count: mockPatrols.filter((p) => p.status === "completed").length },
        { status: "cancelled", count: 1 },
        { status: "delayed", count: 1 },
      ],
      incidentsToday: [
        { title: "Snare found at N2-A riverine belt", severity: "critical", time: "07:12" },
        { title: "Tiger pugmarks near N1-A waterhole", severity: "high", time: "09:24" },
        { title: "Elephant herd near village road", severity: "high", time: "10:05" },
      ],
      recentReports: mockObservations.slice(0, 5),
      todayPatrols: today,
      activity: [
        { hour: "06", patrols: 2, reports: 1 },
        { hour: "07", patrols: 4, reports: 2 },
        { hour: "08", patrols: 5, reports: 3 },
        { hour: "09", patrols: 3, reports: 4 },
        { hour: "10", patrols: 6, reports: 2 },
        { hour: "11", patrols: 4, reports: 5 },
        { hour: "12", patrols: 2, reports: 1 },
      ],
      alerts: mockNotifications.filter((n) => !n.read),
    };
  },
};

/* ------------------------------------------------------------------ */
/* GIS                                                               */
/* ------------------------------------------------------------------ */

export const gis = {
  layers: async (): Promise<MapLayerDef[]> => {
    await delay();
    return defaultLayers.map((l) => ({ ...l }));
  },
  beats: () => [...mapBeatsRaw],
  markers: () => [...gisMarkers],
  routes: () => [...gisRoutes],
  heat: () => [...gisHeat],
};

/* ------------------------------------------------------------------ */
/* Analytics                                                          */
/* ------------------------------------------------------------------ */

export const analytics = {
  weeklyTrend: async (): Promise<AnalyticsDataset> => {
    await delay();
    return weeklyActivity;
  },
  monthly: async () => {
    await delay();
    return monthlyTrend;
  },
  incidents: async (): Promise<AnalyticsDataset> => {
    await delay();
    return incidentTrend;
  },
  wildlife: async (): Promise<AnalyticsDataset> => {
    await delay();
    return wildlifeSightings;
  },
  humanImpact: async (): Promise<AnalyticsDataset> => {
    await delay();
    return humanImpactTrend;
  },
  waterBodies: async (): Promise<AnalyticsDataset> => {
    await delay();
    return waterBodyStatus;
  },
  mortality: async (): Promise<AnalyticsDataset> => {
    await delay();
    return mortalityTrend;
  },
  beatCoverage: async () => {
    await delay();
    return beatCoverage;
  },
  comparison: async (): Promise<AnalyticsDataset> => {
    await delay();
    return comparativeSeries;
  },
  kpisBy: (scope: string): KpiSeries[] => scopeKpis[scope] ?? scopeKpis.forest,
  scopeKpis,
  heatmap: async () => {
    await delay();
    return heatmapPatrol;
  },
  jurisdiction: async () => {
    await delay();
    const states = mockPatrols.map((p) => resolveJurisdiction(p, authStore).state);
    const count = (s: JurisdictionState) => states.filter((x) => x === s).length;
    const total = Math.max(states.length, 1);
    return {
      normal: count("normal"),
      authorized: count("authorized-exception"),
      pending: count("pending-review"),
      review: count("requires-review"),
      total,
      normalPct: Math.round((count("normal") / total) * 100),
      authorizedPct: Math.round((count("authorized-exception") / total) * 100),
      reviewPct: Math.round(((count("requires-review") + count("pending-review")) / total) * 100),
    };
  },
};

/* ------------------------------------------------------------------ */
/* Administration                                                     */
/* ------------------------------------------------------------------ */

export const admin = {
  users: async (): Promise<AdminUser[]> => {
    await delay();
    return mockUsers;
  },
  roles: async (): Promise<Role[]> => {
    await delay();
    return mockRoles;
  },
  audit: async (): Promise<AuditEntry[]> => {
    await delay();
    return mockAudit;
  },
  masterData: async (): Promise<MasterData> => {
    await delay();
    return mockMasterData;
  },
  settings: async (): Promise<SiteSettings> => {
    await delay();
    return mockSettings;
  },
  notificationTemplates: async (): Promise<NotificationTemplate[]> => {
    await delay();
    return mockNotificationTemplates;
  },
};

/* ------------------------------------------------------------------ */
/* Global                                                            */
/* ------------------------------------------------------------------ */

export const global = {
  notifications: async (): Promise<NotificationItem[]> => {
    await delay(150);
    return mockNotifications;
  },
  search: async (q: string): Promise<SearchResult[]> => {
    await delay(120);
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return searchIndex.filter(
      (r) => r.title.toLowerCase().includes(t) || r.subtitle.toLowerCase().includes(t)
    );
  },
  units: () => ({ divisions: mockDivisions, ranges: mockRanges }),
};