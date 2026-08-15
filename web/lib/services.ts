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
  compartmentsMock,
  zeroPatrolZones,
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
import {
  api,
  clearTokens,
  hasSession,
  isRetryableFailure,
  setTokens,
  type ApiUser,
} from "@/lib/api";
import {
  adminUserFromApi,
  beatsFromGeoJson,
  compartmentsFromGeoJson,
  observationFromApi,
  patrolFromApi,
  registerRoleFromWeb,
  unionExtent,
  type CompartmentPolygon,
  type GeoExtent,
} from "@/lib/backend-adapters";
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
import type { ApiMapAsset } from "@/lib/api";
import type { BeatPolygon } from "@/lib/mock/gis";

const delay = (ms = 300) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run the backend call when reachable; fall back to the in-browser mock
 * only on transport-level failures (backend down) or missing session (401).
 * Business errors (403/404/422…) propagate so bugs surface.
 */
const tryRemote = async <T>(remote: () => Promise<T>, fallback: () => Promise<T> | T): Promise<T> => {
  try {
    return await remote();
  } catch (err) {
    if (isRetryableFailure(err)) return fallback();
    throw err;
  }
};

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

export const auth = {
  /** Logs in against the backend and stores access + refresh tokens. */
  login: async (email: string, password: string): Promise<ApiUser> => {
    const res = await api.auth.login(email, password);
    setTokens(res.accessToken, res.refreshToken);
    return res.user;
  },
  logout: async (): Promise<void> => {
    try {
      await api.auth.logout();
    } finally {
      clearTokens();
    }
  },
  me: (): Promise<ApiUser> => api.auth.me(),
  changePassword: (currentPassword: string, newPassword: string): Promise<void> =>
    api.auth.changePassword(currentPassword, newPassword),
  hasSession: (): boolean => hasSession(),
};

/* ------------------------------------------------------------------ */
/* Patrols                                                            */
/* ------------------------------------------------------------------ */

export const patrols = {
  list: async (): Promise<Patrol[]> =>
    tryRemote(
      async () => (await api.patrols.list()).map(patrolFromApi),
      async () => {
        await delay();
        return mockPatrols;
      }
    ),
  get: async (id: string): Promise<Patrol | undefined> =>
    tryRemote(
      async () => {
        const p = await api.patrols.get(id);
        return patrolFromApi(p);
      },
      async () => {
        await delay();
        return mockPatrols.find((p) => p.id === id);
      }
    ),
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
  reject: async (id: string): Promise<PatrolAuthorization | undefined> => {
    await delay();
    const auth = authStore.find((a) => a.id === id);
    if (!auth || auth.status !== "pending") return auth;
    auth.status = "rejected";
    auth.history.push({
      time: new Date().toISOString(),
      user: "V. Kulkarni · Super Admin",
      action: "Rejected",
      description: "Rejected by Super Admin — authorization not granted",
    });
    return { ...auth };
  },
  complete: async (id: string): Promise<PatrolAuthorization | undefined> => {
    await delay();
    const auth = authStore.find((a) => a.id === id);
    if (!auth || auth.status !== "active") return auth;
    auth.status = "completed";
    auth.history.push({
      time: new Date().toISOString(),
      user: "V. Kulkarni · Super Admin",
      action: "Completed",
      description: "Marked complete — all patrols under it concluded",
    });
    return { ...auth };
  },
  update: async (
    id: string,
    patch: Partial<Omit<PatrolAuthorization, "id" | "history">>
  ): Promise<PatrolAuthorization | undefined> => {
    await delay();
    const auth = authStore.find((a) => a.id === id);
    if (!auth) return auth;
    Object.assign(auth, patch);
    auth.history.push({
      time: new Date().toISOString(),
      user: "V. Kulkarni · Super Admin",
      action: "Updated",
      description: "Authorization details amended by Super Admin",
    });
    return { ...auth };
  },
  extend: async (id: string, validUntil: string): Promise<PatrolAuthorization | undefined> => {
    await delay();
    const auth = authStore.find((a) => a.id === id);
    if (!auth || (auth.status !== "active" && auth.status !== "draft")) return auth;
    auth.validUntil = validUntil;
    auth.history.push({
      time: new Date().toISOString(),
      user: "V. Kulkarni · Super Admin",
      action: "Validity extended",
      description: `Valid until extended to ${new Date(validUntil).toLocaleDateString()}`,
    });
    return { ...auth };
  },
};

/* ------------------------------------------------------------------ */
/* Rangers                                                            */
/* ------------------------------------------------------------------ */

const createdRangers: Ranger[] = [];
const rangerUpdates = new Map<string, Partial<Ranger>>();
const removedRangerIds = new Set<string>();

const rangerRecord = (id: string): Ranger | undefined => {
  if (removedRangerIds.has(id)) return undefined;
  const base = mockRangers.find((r) => r.id === id);
  const created = createdRangers.find((r) => r.id === id);
  const src = created ?? base;
  if (!src) return undefined;
  if (created) return created;
  return { ...src, ...rangerUpdates.get(id) };
};

export const rangers = {
  list: async (): Promise<Ranger[]> => {
    await delay();
    return [...mockRangers.filter((r) => !removedRangerIds.has(r.id)).map((r) => ({ ...r, ...rangerUpdates.get(r.id) })), ...createdRangers];
  },
  get: async (id: string): Promise<Ranger | undefined> => {
    await delay();
    return rangerRecord(id);
  },
  create: async (input: Omit<Ranger, "id"> & { id?: string }): Promise<Ranger> => {
    await delay();
    const id = input.id ?? `r-created-${String(createdRangers.length + 1).padStart(3, "0")}`;
    const record: Ranger = { ...input, id, code: input.code ?? `NEW-${id.slice(-3).toUpperCase()}` };
    createdRangers.unshift(record);
    return record;
  },
  update: async (id: string, patch: Partial<Ranger>): Promise<Ranger | undefined> => {
    await delay();
    const existing = rangerRecord(id);
    if (!existing) return undefined;
    rangerUpdates.set(id, { ...rangerUpdates.get(id), ...patch });
    return { ...existing, ...patch };
  },
  remove: async (id: string): Promise<boolean> => {
    await delay();
    if (!rangerRecord(id)) return false;
    removedRangerIds.add(id);
    return true;
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

const observationStatusOverrides = new Map<string, Observation["status"]>();
const observationRecord = (o: Observation): Observation => ({
  ...o,
  status: observationStatusOverrides.get(o.id) ?? o.status,
});

export const observations = {
  list: async (): Promise<Observation[]> =>
    tryRemote(
      async () => (await api.incidents.list()).map(observationFromApi),
      async () => {
        await delay();
        return mockObservations.map(observationRecord);
      }
    ),
  get: async (id: string): Promise<Observation | undefined> =>
    tryRemote(
      async () => observationFromApi(await api.incidents.get(id)),
      async () => {
        await delay();
        const o = mockObservations.find((x) => x.id === id);
        return o ? observationRecord(o) : undefined;
      }
    ),
  setStatus: async (id: string, status: Observation["status"]): Promise<Observation | undefined> => {
    // Backend incident lifecycle: resolved → resolve, escalated/under-review → verify.
    const remote = async () => {
      const updated =
        status === "resolved"
          ? await api.incidents.resolve(id, "Resolved from admin portal")
          : await api.incidents.verify(id);
      return observationFromApi(updated);
    };
    const local = async () => {
      await delay();
      const o = mockObservations.find((x) => x.id === id);
      if (!o) return undefined;
      observationStatusOverrides.set(id, status);
      return observationRecord(o);
    };
    if (status === "open") return local();
    return tryRemote(remote, local);
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
    // GIS figures come from the live beat layer (falls back to the mock grid).
    const beats = await gis.beats();
    const covered = beats.filter((b) => Number.isFinite(b.coveragePct) && b.coveragePct > 0);
    const coveragePct =
      covered.length > 0
        ? Math.round(covered.reduce((a, b) => a + b.coveragePct, 0) / covered.length)
        : 82;
    const zeroPatrolList = beats
      .filter((b) => b.isZeroPatrol ?? zeroPatrolZones.includes(b.id))
      .map((b) => ({ beat: b.name, days: 14 }));
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
      coveragePct,
      coverageToday: Math.min(100, coveragePct + 5),
      patrolsTotal: mockPatrols.length,
      normalTotal: count("normal"),
      authorizedTotal: count("authorized-exception"),
      incidentsTotal: mockObservations.length,
      zeroPatrolZones: zeroPatrolList.length,
      zeroPatrolList,
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
  /**
   * Beats + compartments from the backend GIS API (GeoJSON → SVG polygons,
   * viewBox 1000×700). Both collections project with ONE shared extent so the
   * layers align in the same map space; falls back to mocks/[] when the
   * backend is unreachable or the tables are empty.
   */
  spatial: async (): Promise<{ beats: BeatPolygon[]; compartments: CompartmentPolygon[] }> => {
    const fallback = { beats: [...mapBeatsRaw], compartments: compartmentsMock };
    try {
      const [beatFc, compFc] = await Promise.all([api.gis.beats(), api.gis.compartments()]);
      const extent: GeoExtent | null = unionExtent(beatFc, compFc);
      return {
        beats: beatsFromGeoJson(beatFc, extent),
        compartments: compartmentsFromGeoJson(compFc, extent),
      };
    } catch (err) {
      if (isRetryableFailure(err)) return fallback;
      throw err;
    }
  },
  beats: async (): Promise<BeatPolygon[]> => {
    const s = await gis.spatial();
    return s.beats.length > 0 ? s.beats : [...mapBeatsRaw];
  },
  /** Compartments from the backend GIS API (GeoJSON → SVG polygons). */
  compartments: async (): Promise<CompartmentPolygon[]> => {
    const s = await gis.spatial();
    return s.compartments;
  },
  /** Map asset catalog (MBTiles atlases etc.) from the backend. */
  assets: async (): Promise<ApiMapAsset[]> => {
    try {
      return await api.gis.assets();
    } catch (err) {
      if (isRetryableFailure(err)) return [];
      throw err;
    }
  },
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

const createdUsers: AdminUser[] = [];
const userStatusOverrides = new Map<string, AdminUser["status"]>();
const removedUserIds = new Set<string>();
const createdRoles: Role[] = [];
const roleUpdates = new Map<string, Partial<Role>>();
const removedRoleIds = new Set<string>();
let settingsOverride: SiteSettings | undefined;
const templateEnabledOverride = new Map<string, boolean>();
const createdSpecies: { id: string; name: string; category: string; status: SpeciesStatus }[] = [];

type SpeciesStatus = "present" | "rare" | "introduced" | "threatened";

const userRecord = (id: string): AdminUser | undefined => {
  if (removedUserIds.has(id)) return undefined;
  const base = mockUsers.find((u) => u.id === id) ?? createdUsers.find((u) => u.id === id);
  if (!base) return undefined;
  return { ...base, status: userStatusOverrides.get(id) ?? base.status };
};

const roleRecord = (id: string): Role | undefined => {
  if (removedRoleIds.has(id)) return undefined;
  const created = createdRoles.find((r) => r.id === id);
  if (created) return created;
  const base = mockRoles.find((r) => r.id === id);
  if (!base) return undefined;
  return { ...base, ...roleUpdates.get(id) };
};

export const admin = {
  users: async (): Promise<AdminUser[]> =>
    tryRemote(
      async () => (await api.users.list()).map(adminUserFromApi),
      async () => {
        await delay();
        return [...mockUsers.filter((u) => !removedUserIds.has(u.id)).map((u) => ({ ...u, status: userStatusOverrides.get(u.id) ?? u.status })), ...createdUsers];
      }
    ),
  roles: async (): Promise<Role[]> => {
    await delay();
    return [...mockRoles.filter((r) => !removedRoleIds.has(r.id)).map((r) => ({ ...r, ...roleUpdates.get(r.id) })), ...createdRoles];
  },
  audit: async (): Promise<AuditEntry[]> => {
    await delay();
    return mockAudit;
  },
  masterData: async (): Promise<MasterData> => {
    await delay();
    return { ...mockMasterData, species: [...mockMasterData.species, ...createdSpecies] };
  },
  createSpecies: async (input: { name: string; category: string; status: SpeciesStatus }): Promise<void> => {
    await delay();
    createdSpecies.unshift({ id: `sp-created-${createdSpecies.length + 1}`, ...input });
  },
  settings: async (): Promise<SiteSettings> => {
    await delay();
    return settingsOverride ?? mockSettings;
  },
  saveSettings: async (patch: Partial<SiteSettings>): Promise<SiteSettings> => {
    await delay();
    settingsOverride = { ...(settingsOverride ?? mockSettings), ...patch };
    return settingsOverride;
  },
  notificationTemplates: async (): Promise<NotificationTemplate[]> => {
    await delay();
    return mockNotificationTemplates.map((t) => ({ ...t, enabled: templateEnabledOverride.get(t.id) ?? t.enabled }));
  },
  setTemplateEnabled: async (id: string, enabled: boolean): Promise<void> => {
    await delay();
    templateEnabledOverride.set(id, enabled);
  },
  /**
   * Onboarding: backend has no "invite" concept — the user is created as an
   * active account via the admin-gated register endpoint (temporary password).
   */
  createUser: async (input: { name: string; email: string; roleId: string; division?: string }): Promise<AdminUser> =>
    tryRemote(
      async () => {
        const created = await api.auth.register({
          email: input.email,
          password: `Nstr@${Date.now().toString(36)}`,
          fullName: input.name,
          role: registerRoleFromWeb(input.roleId),
        });
        return adminUserFromApi(created);
      },
      async () => {
        await delay();
        const id = `u-created-${String(createdUsers.length + 1)}`;
        const record: AdminUser = {
          id,
          name: input.name,
          email: input.email,
          roleId: input.roleId,
          status: "invited",
          division: input.division ?? "d-north",
          created: new Date().toISOString().slice(0, 10),
        };
        createdUsers.unshift(record);
        return record;
      }
    ),
  setUserStatus: async (id: string, status: AdminUser["status"]): Promise<AdminUser | undefined> => {
    if (status === "invited") {
      await delay();
      if (!userRecord(id)) return undefined;
      userStatusOverrides.set(id, status);
      return userRecord(id);
    }
    const remote = async () => {
      const updated =
        status === "active" ? await api.users.activate(id) : await api.users.deactivate(id);
      return adminUserFromApi(updated);
    };
    const local = async () => {
      await delay();
      if (!userRecord(id)) return undefined;
      userStatusOverrides.set(id, status);
      return userRecord(id);
    };
    return tryRemote(remote, local);
  },
  removeUser: async (id: string): Promise<boolean> =>
    tryRemote(
      async () => {
        await api.users.deactivate(id);
        return true;
      },
      async () => {
        await delay();
        if (!userRecord(id)) return false;
        removedUserIds.add(id);
        return true;
      }
    ),
  createRole: async (input: { name: string; description: string; permissions: Role["permissions"] }): Promise<Role> => {
    await delay();
    const id = `role-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const record: Role = { id, name: input.name, description: input.description, userCount: 0, system: false, permissions: input.permissions };
    createdRoles.unshift(record);
    return record;
  },
  updateRole: async (id: string, patch: Partial<Role>): Promise<Role | undefined> => {
    await delay();
    if (!roleRecord(id)) return undefined;
    roleUpdates.set(id, { ...roleUpdates.get(id), ...patch });
    return roleRecord(id);
  },
  removeRole: async (id: string): Promise<boolean> => {
    await delay();
    if (!roleRecord(id) || roleRecord(id)?.system) return false;
    removedRoleIds.add(id);
    return true;
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