/**
 * Service / repository abstraction — the ONLY data entry point for UI code.
 *
 * Currently backed by mock data (lib/mock/*). When the backend API exists,
 * swap each implementation for a fetch-based call WITHOUT changing the UI.
 *
 * Simulated latency lets loading/skeleton states exercise the same code path
 * that real network requests will use.
 */

import { mockPatrols, mockPatrolReports, mockPatrolTemplates, patrolMethodLabels, patrolTypeLabels } from "@/lib/mock/patrols";
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
  DashboardSummary,
  EquipmentItem,
  KpiSeries,
  MapLayerDef,
  MasterData,
  NotificationItem,
  NotificationTemplate,
  Observation,
  Patrol,
  PatrolReport,
  PatrolStatus,
  PatrolTemplate,
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
  templates: async (): Promise<PatrolTemplate[]> => {
    await delay();
    return mockPatrolTemplates;
  },
  reports: async (): Promise<PatrolReport[]> => {
    await delay();
    return mockPatrolReports;
  },
  typeLabels: patrolTypeLabels,
  methodLabels: patrolMethodLabels,
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
    const completed = mockPatrols.filter((p) => p.status === "completed").length;
    const openIncidents = mockObservations.filter(
      (o) => o.severity === "critical" || o.severity === "high"
    ).length;
    return {
      activePatrols: active,
      completedToday: completed,
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
        { status: "assigned", count: 1 },
        { status: "ongoing", count: active },
        { status: "completed", count: completed },
        { status: "cancelled", count: 1 },
        { status: "delayed", count: 1 },
      ],
      incidentsToday: [
        { title: "Snare found at N2-A riverine belt", severity: "critical", time: "07:12" },
        { title: "Tiger pugmarks near N1-A waterhole", severity: "high", time: "09:24" },
        { title: "Elephant herd near village road", severity: "high", time: "10:05" },
      ],
      recentReports: mockObservations.slice(0, 5),
      todayPatrols: mockPatrols.filter(
        (p) => new Date(p.startScheduled).toDateString() === new Date().toDateString()
      ),
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