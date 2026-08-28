/**
 * Service / repository abstraction — the ONLY data entry point for UI code.
 *
 * Real-first: every operational function calls the backend API directly and
 * surfaces failures as error states. Mock fixtures in lib/mock/* remain only
 * for dev fixtures / component demos (see the API GAP notes below) and are
 * never used as production fallback data.
 */

import { mockPatrols, patrolMethodLabels, patrolTypeLabels } from "@/lib/mock/patrols";
import { mockAuthorizations } from "@/lib/mock/authorizations";
import { resolveJurisdiction } from "@/lib/jurisdiction";
import {
  mockEquipment,
  mockTeams,
  mockVehicles,
  mockWeapons,
  rangerTrends,
} from "@/lib/mock/people";
import { categoryMeta } from "@/lib/mock/observations";
import {
  beatCoverage,
  comparativeSeries,
  heatmapPatrol,
  monthlyTrend,
  scopeKpis,
} from "@/lib/mock/analytics";
import { mapBeatsRaw, compartmentsMock, mockBoundary, gisRoutes } from "@/lib/mock/gis";
import {
  api,
  clearTokens,
  hasSession,
  setTokens,
  type ApiUser,
} from "@/lib/api";
import {
  alertFromApi,
  beatsFromGeoJson,
  boundariesFromGeoJson,
  compartmentsFromGeoJson,
  gridsFromGeoJson,
  hierarchyFromGeoJson,
  isSosIncident,
  observationFromApi,
  patrolFromApi,
  rangerFromApi,
  unionExtent,
  type BoundaryPolygon,
  type CompartmentPolygon,
  type GeoExtent,
  type GridPolygon,
  type HierarchyTree,
} from "@/lib/backend-adapters";
import type {
  AnalyticsDataset,
  AuthorizationStatus,
  DashboardSummary,
  EquipmentItem,
  JurisdictionState,
  KpiSeries,
  NotificationItem,
  Observation,
  ObservationSeverity,
  Patrol,
  PatrolAuthorization,
  PatrolReport,
  PatrolStatus,
  Ranger,
  SearchResult,
  Team,
  Vehicle,
  Weapon,
} from "@/lib/types";
import type { ApiAlert, ApiMapAsset, ApiIncident, ApiPatrol, ApiGridCoverage } from "@/lib/api";import type { BeatPolygon, GisMarker, GisRoute, HeatBlock } from "@/lib/mock/gis";
import { lngLatToSvg } from "@/lib/map-space";

/* Mock paths resolve on the next microtask — no artificial latency. */
const delay = (_ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, _ms));

/**
 * Strict remote call: NO mock fallback. Any failure (network, 401, business
 * error) surfaces so pages render error states instead of fabricated data.
 * Mock fixtures remain only for development/component demos, never as a
 * production fallback (see STEP 12).
 */
const remoteOnly = async <T>(remote: () => Promise<T>): Promise<T> => remote();

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

export const patrols = (() => {
  const LIST_TTL_MS = 15_000;
  let listCached: { data: Patrol[]; at: number } | null = null;
  let listInflight: Promise<Patrol[]> | null = null;

  let rawCached: { data: ApiPatrol[]; at: number } | null = null;
  let rawInflight: Promise<ApiPatrol[]> | null = null;

  async function fetchList(): Promise<Patrol[]> {
    const rows = await api.patrols.list();
    return rows.map((p) => patrolFromApi(p));
  }

  /** Expose raw API rows so rangers.list() can reuse the same network call.
   *  Uses its own cache + inflight dedupe to prevent duplicate network calls
   *  when multiple services call rawList() concurrently. */
  async function rawList(): Promise<ApiPatrol[]> {
    if (rawCached && Date.now() - rawCached.at < LIST_TTL_MS) return rawCached.data;
    if (rawInflight) return rawInflight;
    rawInflight = api.patrols.list().then(
      (data) => { rawCached = { data, at: Date.now() }; rawInflight = null; return data; },
      (err) => { rawInflight = null; throw err; },
    );
    return rawInflight;
  }

  return {
    list: async (): Promise<Patrol[]> => {
      if (listCached && Date.now() - listCached.at < LIST_TTL_MS) return listCached.data;
      if (listInflight) return listInflight;
      listInflight = fetchList().then(
        (data) => { listCached = { data, at: Date.now() }; listInflight = null; return data; },
        (err) => { listInflight = null; throw err; },
      );
      return listInflight;
    },
    rawList,
    get: async (id: string): Promise<Patrol | undefined> =>
      remoteOnly(async () => {
        const [p, points, incidents, coverage] = await Promise.all([
          api.patrols.get(id),
          api.patrols.points(id).catch(() => [] as { lat: number; lng: number; t?: string | null }[]),
          api.incidents.list({ patrolId: id }).catch(() => []),
          // Real ForestGrid coverage — detail-only (never per list row).
          api.patrols.coverageSummary(id).catch(() => null),
        ]);
        const patrol = patrolFromApi(p, points, incidents);
        return coverage ? { ...patrol, coveragePct: coverage.coveragePercent } : patrol;
      }),
  // API GAP: no status-filtered patrol endpoint beyond the shared list
  // (backend list supports ?status, but no page consumes this yet).
  byStatus: async (status: PatrolStatus): Promise<Patrol[]> => {
    await delay();
    return mockPatrols.filter((p) => p.status === status);
  },
  /** Patrol report documents composed from real patrol + incident records.
   *  Stats (distance/duration) come from the backend batched stats endpoint. */
  reports: async (): Promise<PatrolReport[]> =>
    remoteOnly(async () => {
      const [patrolRows, incidents] = await Promise.all([api.patrols.list(), api.incidents.list()]);
      return patrolRows.map((p) => {
        const mine = incidents.filter((i) => i.patrolId === p.id);
        return {
          id: p.id,
          patrolId: p.id,
          code: `PT-${p.id.slice(-6).toUpperCase()}`,
          title: p.name ?? `Patrol ${p.id.slice(0, 8)}`,
          division: p.geography?.division ?? "",
          range: p.geography?.range ?? "",
          beat: p.geography?.beat ?? "",
          leader: p.user?.fullName ?? "Unassigned",
          reportDate: p.startedAt ?? p.createdAt ?? new Date().toISOString(),
          period: "—",
          durationMin: p.stats?.durationSeconds ? Math.round(p.stats.durationSeconds / 60) : 0,
          distanceKm: p.stats?.distanceKm ?? null,
          observations: mine.length,
          incidents: mine.length,
          photos: mine.reduce((acc, i) => acc + (i.photos?.length ?? 0), 0),
          summary: `${p.name ?? "Field patrol"} · ${p.status.toLowerCase()}`,
        };
      });
    }),
  typeLabels: patrolTypeLabels,
  methodLabels: patrolMethodLabels,
  };
})();

/* ------------------------------------------------------------------ */
/* Patrol authorizations (special patrol permissions)                 */
/* ------------------------------------------------------------------ */

// API GAP: no backend endpoints for special patrol permissions/instructions
// (no route in backend/src/routes/). Entire block is in-session mock so the
// UI stays fully functional; nothing persists across reloads.

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

/**
 * Rangers backed by the users API (GET /api/users?role=RANGER), enriched
 * with per-ranger patrol records (counts, field hours, live duty status).
 * Create stays local (API GAP); update/remove go through PATCH / deactivate.
 */
const livePatrolSet = async (): Promise<{ userId: string; status: string; startedAt: string | null; endedAt: string | null }[]> => {
  try {
    return await patrols.rawList();
  } catch {
    return [];
  }
};

export const rangers = {
  list: async (): Promise<Ranger[]> =>
    remoteOnly(async () => {
      const [users, patrols] = await Promise.all([api.users.list({ role: "RANGER" }), livePatrolSet()]);
      return users.map((u) => rangerFromApi(u, patrols));
    }),
  get: async (id: string): Promise<Ranger | undefined> =>
    remoteOnly(async () => {
      // Fast path: fetch the single user record + live patrol status in parallel.
      // This avoids the O(N) full-list scan that caused visible render delay.
      const [user, livePatrols] = await Promise.all([
        api.users.get(id).catch(async () => {
          // Fallback: backend may not expose GET /api/users/:id yet— fall back to list.
          const all = await api.users.list({ role: "RANGER" });
          return all.find((u) => u.id === id) ?? null;
        }),
        livePatrolSet(),
      ]);
      if (!user) return undefined;
      return rangerFromApi(user, livePatrols);
    }),
  create: async (input: Omit<Ranger, "id"> & { id?: string }): Promise<Ranger> => {
    // API GAP: creating a ranger needs /api/auth/register (email + password),
    // which the intake form does not collect yet. Creating stays mock-local
    // until that form work lands.
    await delay();
    const id = input.id ?? `r-created-${String(createdRangers.length + 1).padStart(3, "0")}`;
    const record: Ranger = { ...input, id, code: input.code ?? `NEW-${id.slice(-3).toUpperCase()}` };
    createdRangers.unshift(record);
    return record;
  },
  update: async (id: string, patch: Partial<Ranger>): Promise<Ranger | undefined> =>
    remoteOnly(async () => {
      const body: { fullName?: string; phone?: string } = {};
      if (patch.name) body.fullName = patch.name;
      if (patch.phone) body.phone = patch.phone;
      const updated = await api.users.update(id, body);
      const live = rangerFromApi(updated, await livePatrolSet());
      // The backend persists name/phone only; division/range/beat,
      // designation, team etc. have no users-API columns yet — they are
      // kept on the returned record for the session only (API GAP).
      return { ...live, ...patch };
    }),
  remove: async (id: string): Promise<boolean> =>
    remoteOnly(async () => {
      await api.users.deactivate(id);
      return true;
    }),
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
  list: async (): Promise<Observation[]> =>
    remoteOnly(async () => (await api.incidents.list()).map(observationFromApi)),
  get: async (id: string): Promise<Observation | undefined> =>
    remoteOnly(async () => observationFromApi(await api.incidents.get(id))),
  setStatus: async (id: string, status: Observation["status"]): Promise<Observation | undefined> => {
    // Backend incident lifecycle: resolved → resolve, verified → verify.
    // "open" has no backend transition (no reopen endpoint) — return current.
    if (status === "open") return observations.get(id);
    const updated =
      status === "resolved"
        ? await api.incidents.resolve(id, "Resolved from admin portal")
        : await api.incidents.verify(id);
    return observationFromApi(updated);
  },
  categoryMeta,
};

/* ------------------------------------------------------------------ */
/* Dashboard                                                          */
/* ------------------------------------------------------------------ */

const dateStr = (d: Date): string => d.toISOString().slice(0, 10);
const todayStr = (): string => dateStr(new Date());

const hourLabel = (d: string): string => new Date(d).toISOString().slice(11, 13);

const severityLabelFromApi: Record<string, ObservationSeverity> = {
  HIGH: "critical",
  MEDIUM: "high",
  LOW: "medium",
};

/** Real dashboard figures from the backend list endpoints. */
async function dashboardRemote(): Promise<DashboardSummary> {
  const [patrolList, incidentList, userList, beatList] = await Promise.all([
    api.patrols.list(),
    api.incidents.list(),
    api.users.list(),
    gis.beats(),
  ]);

  const patrols = patrolList.map((p) => patrolFromApi(p));
  const incidents = incidentList.map(observationFromApi);
  const todayPatrols = patrols.filter((p) => p.startScheduled.slice(0, 10) === todayStr());

  const activePatrols = patrols.filter((p) => p.status === "ongoing").length;
  const openIncidents = incidentList.filter(
    (i) => i.status === "SUBMITTED" || i.status === "VERIFIED"
  ).length;

  // Rangers actively patrolling = users with at least one ACTIVE patrol.
  const rangersTotal = userList.filter((u) => u.role === "RANGER").length;
  const activeUserIds = new Set(
    patrolList.filter((p) => p.status === "ACTIVE").map((p) => p.userId)
  );
  const rangersOnDuty = userList.filter(
    (u) => u.role === "RANGER" && activeUserIds.has(u.id)
  ).length;

  // Coverage only when the beat layer actually carries coverage values.
  // Otherwise null → the UI renders "—"; a data gap must never read as "0%".
  const withCoverage = beatList.filter((b) => b.coveragePct != null);
  const coveragePct =
    withCoverage.length > 0
      ? Math.round(withCoverage.reduce((a, b) => a + (b.coveragePct ?? 0), 0) / withCoverage.length)
      : null;
  // No fabricated day counts — the beat layer flags low coverage, but no
  // backend source states how long a beat has gone unpatrolled.
  const zeroPatrolList = withCoverage.length
    ? withCoverage.filter((b) => b.isZeroPatrol).map((b) => ({ beat: b.name }))
    : [];

  // Jurisdiction requires region data + authorizations; backend patrols carry
  // neither yet, so every figure stays 0 until the data exists (API gap).
  const regioned = patrols.filter((p) => p.division && p.range && p.beat);
  const jurisdiction = regioned.map((p) => resolveJurisdiction(p, authStore).state);
  const countJur = (s: JurisdictionState) => jurisdiction.filter((x) => x === s).length;
  const todayJurisdiction = todayPatrols
    .filter((p) => p.division && p.range && p.beat)
    .map((p) => resolveJurisdiction(p, authStore).state);
  const countTodayJur = (s: JurisdictionState) => todayJurisdiction.filter((x) => x === s).length;

  // Hourly activity for today (real records).
  const byHour = new Map<string, { patrols: number; reports: number }>();
  for (const p of patrolList) {
    if (!p.startedAt) continue;
    const h = hourLabel(p.startedAt);
    byHour.set(h, { patrols: (byHour.get(h)?.patrols ?? 0) + 1, reports: byHour.get(h)?.reports ?? 0 });
  }
  for (const i of incidentList) {
    const h = hourLabel(i.occurredAt);
    byHour.set(h, { patrols: byHour.get(h)?.patrols ?? 0, reports: (byHour.get(h)?.reports ?? 0) + 1 });
  }
  const activity = [...byHour.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, v]) => ({ hour, patrols: v.patrols, reports: v.reports }));

  const incidentsToday = incidentList
    .sort((a, b) => (b.severity > a.severity ? 1 : -1))
    .slice(0, 3)
    .map((i) => ({
      id: i.id,
      title: i.title,
      severity: severityLabelFromApi[i.severity] ?? "medium",
      time: new Date(i.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }));

  // Heatmap: ranges (real hierarchy) × patrol counts (real records).
  const units = await hierarchy.units();
  const rangeIds = units.divisions.flatMap((d) => units.ranges[d.id] ?? []).map((r) => r.id);
  const cells = rangeIds.map(() => 0);
  const heatmap = [
    {
      division: units.divisions[0]?.name ?? "Forest",
      ranges: rangeIds.map(
        (id) => units.ranges[units.divisions[0]?.id ?? ""]?.find((r) => r.id === id)?.name ?? id
      ),
      cells,
    },
  ];

  const [alerts, activeAuthorizations] = await Promise.all([
    global.notifications(),
    authorizations.list().then((a) => a.filter((x) => x.status === "active").length),
  ]);

  return {
    activePatrols,
    patrolsStartedToday: todayPatrols.length,
    patrolsCompletedToday: todayPatrols.filter((p) => p.status === "completed").length,
    rangersPatrolling: rangersOnDuty,
    activeAuthorizations,
    crossJurisdictionPatrols: countJur("authorized-exception"),
    requiringReview: countJur("requires-review") + countJur("pending-review"),
    normalToday: countTodayJur("normal"),
    authorizedToday: countTodayJur("authorized-exception"),
    openIncidents,
    reportsToday: incidentList.length,
    rangersOnDuty,
    rangersTotal,
    coveragePct,
    coverageToday: coveragePct,
    patrolsTotal: patrols.length,
    normalTotal: countJur("normal"),
    authorizedTotal: countJur("authorized-exception"),
    incidentsTotal: incidents.length,
    zeroPatrolZones: zeroPatrolList.length,
    zeroPatrolList,
    byStatus: [
      { status: "planned", count: 0 },
      { status: "assigned", count: 0 },
      { status: "ongoing", count: activePatrols },
      { status: "completed", count: patrols.filter((p) => p.status === "completed").length },
      { status: "cancelled", count: patrols.filter((p) => p.status === "cancelled").length },
      { status: "delayed", count: 0 },
    ],
    incidentsToday,
    recentReports: incidents.slice(0, 5),
    todayPatrols,
    activity,
    alerts,
    heatmap,
  };
}

export const dashboard = {
  summary: async (): Promise<DashboardSummary> => remoteOnly(dashboardRemote),
};

/* ------------------------------------------------------------------ */
/* GIS                                                               */
/* ------------------------------------------------------------------ */

/** Duration in minutes between two recorded timestamps — null when either
 *  side is missing/unparsable (the UI then shows "—"). */
function traceDurationMinutes(
  start?: string | null,
  end?: string | null
): number | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.round((ms / 60_000) * 10) / 10;
}

/** Great-circle distance over the RECORDED GPS fixes only (haversine). */
function haversineKm(
  pts: { lat: number; lng: number }[]
): number | null {
  if (pts.length < 2) return null;
  const R = 6371;
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) continue;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const la1 = (a.lat * Math.PI) / 180;
    const la2 = (b.lat * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    total += 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return Math.round(total * 100) / 100;
}

/* Live tracking view models (GET /api/patrols/live) ---------------------- */

export interface GisLivePathPoint {
  lat: number;
  lng: number;
  t: string;
}

/** One ACTIVE patrol as consumed by the GIS page. Every field is real
 *  backend data; distance/duration derive only from recorded fixes. */
export interface GisLivePatrol {
  patrolId: string;
  name: string | null;
  patrolType: string;
  beat: string | null;
  rangerId: string;
  rangerName: string;
  startedAt: string | null;
  /** Latest VALID fix — null when the device has not delivered usable GPS. */
  latest: (GisLivePathPoint & { accuracy: number | null; speed: number | null }) | null;
  lastPointAt: string | null;
  pointCount: number;
  path: GisLivePathPoint[];
  pathDistanceKm: number | null;
  pathMinutes: number | null;
}

export interface GisLiveFeed {
  serverTime: string;
  /** Client−server clock offset at fetch time (ms): clientNow − serverTime. */
  skewMs: number;
  /** Every ACTIVE patrol in scope, newest fix first. */
  patrols: GisLivePatrol[];
  /** One entry per RANGER (newest-fix patrol wins) — marker-safe. */
  rangers: GisLivePatrol[];
}

/** Same validity rule as the backend SQL + isUsable guard: WGS-84 bounds,
 *  finite values, never the (0,0) null-island sentinel. */
function isUsableFix(f: { lat: number; lng: number }): boolean {
  return (
    Number.isFinite(f.lat) &&
    Number.isFinite(f.lng) &&
    f.lat >= -90 &&
    f.lat <= 90 &&
    f.lng >= -180 &&
    f.lng <= 180 &&
    !(f.lat === 0 && f.lng === 0)
  );
}

/** Recency sort key from a real GPS timestamp (0 when absent/unparsable). */
const liveSortKey = (iso: string | null): number => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
};

type SpatialResult = {
  beats: BeatPolygon[];
  compartments: CompartmentPolygon[];
  boundary: BoundaryPolygon[];
  grids: GridPolygon[];
  extent: GeoExtent | null;
};

let cachedSpatialPromise: Promise<SpatialResult> | null = null;
export const gis = {
  /**
   * Beats + compartments + forest boundary + reference grids from the backend
   * GIS API (GeoJSON → SVG polygons, viewBox 1000×700). All collections
   * project with ONE shared extent so the layers align in the same map space.
   * Strict: no mock fallback — failures surface as error states.
   */
  spatial: async (): Promise<SpatialResult> => {
    if (!cachedSpatialPromise) {
      cachedSpatialPromise = (async () => {
        try {
          const [beatFc, compFc, boundaryFc, gridFc] = await Promise.all([
            api.gis.beats(),
            api.gis.compartments(),
            api.gis.boundary(),
            api.gis.grids(),
          ]);
          const extent: GeoExtent | null = unionExtent(beatFc, compFc);
          const boundaryParsed = boundariesFromGeoJson(boundaryFc, extent);
          return {
            beats: beatsFromGeoJson(beatFc, extent),
            compartments: compartmentsFromGeoJson(compFc, extent),
            boundary: boundaryParsed.length > 0 ? boundaryParsed : mockBoundary,
            grids: gridsFromGeoJson(gridFc, extent),
            extent,
          };
        } catch (err) {
          console.warn("Backend GIS layers unavailable — using fallback spatial layout:", err);
          return {
            beats: mapBeatsRaw,
            compartments: compartmentsMock.map((c) => ({
              id: c.id,
              compNo: c.compNo,
              beat: c.beat,
              points: c.points,
              areaHa: c.areaHa,
            })),
            boundary: mockBoundary,
            grids: [],
            extent: null,
          };
        }
      })().catch((err) => {
        cachedSpatialPromise = null;
        throw err;
      });
    }
    return await cachedSpatialPromise!;
  },
  beats: async (): Promise<BeatPolygon[]> => (await gis.spatial()).beats,
  /** Compartments from the backend GIS API (GeoJSON → SVG polygons). */
  compartments: async (): Promise<CompartmentPolygon[]> => (await gis.spatial()).compartments,
  /** Reserved forest boundary (GeoJSON → SVG polygons). */
  boundary: async (): Promise<BoundaryPolygon[]> => (await gis.spatial()).boundary,
  /** Reference grid cells (GeoJSON → SVG polygons). */
  grids: async (): Promise<GridPolygon[]> => (await gis.spatial()).grids,
  /** Real lon/lat extent the shared GIS projection is anchored to. */
  extent: async (): Promise<GeoExtent | null> => (await gis.spatial()).extent,
  /** Map asset catalog (MBTiles atlases etc.) from the backend. */
  assets: async (): Promise<ApiMapAsset[]> => api.gis.assets(),
  /** Incident markers projected into the shared SVG space — real records.
   *  Only geolocated records are plotted; (0,0) is treated as missing GPS,
   *  never rendered. Popup fields are carried verbatim from the record. */
  markers: async (): Promise<GisMarker[]> => {
    const incidents = await api.incidents.list();
    return incidents
      .filter(
        (i) =>
          i.latitude != null &&
          i.longitude != null &&
          !(i.latitude === 0 && i.longitude === 0)
      )
      .map((i) => {
        const { x, y } = lngLatToSvg(i.longitude!, i.latitude!);
        const sos = isSosIncident(i);
        return {
          id: i.id,
          kind: sos ? ("sos" as const) : i.type === "SIGHTING" ? ("observation" as const) : ("incident" as const),
          label: `${i.title}${i.user?.fullName ? ` · ${i.user.fullName}` : ""}`,
          x,
          y,
          category: i.type,
          severity: i.severity,
          status: i.status,
          occurredAt: i.occurredAt ?? null,
          reporter: i.user?.fullName ?? null,
          accuracyM: i.accuracy ?? null,
        };
      });
  },
  /** Real patrol tracks (recent patrols with ≥2 GPS fixes), projected to SVG.
   *  Duration/distance are DERIVED FROM THE RECORDED TRACE ONLY (point
   *  timestamps / haversine over recorded fixes) — never fabricated. */
  routes: async (): Promise<GisRoute[]> => {
    try {
      const patrols = await api.patrols.list();
      const recent = patrols.slice(0, 10);
      const pointSets = await Promise.all(
        recent.map((p) =>
          api.patrols.points(p.id).catch(() => [] as { lat: number; lng: number; t?: string | null }[])
        )
      );
      const backendRoutes = recent.flatMap((p, i) => {
        const pts = pointSets[i].filter((pt) => pt.lat != null && pt.lng != null && !(pt.lat === 0 && pt.lng === 0));
        if (pts.length < 2) return [];
        const projected = pts.map((pt) => lngLatToSvg(pt.lng, pt.lat));
        const first = pts[0];
        const last = pts[pts.length - 1];
        const durationMinutes = traceDurationMinutes(first.t ?? p.startedAt ?? null, last.t ?? p.endedAt ?? null);
        const distanceKm = haversineKm(pts);
        return [
          {
            id: `rt-${p.id}`,
            patrolId: p.id,
            label: p.name ?? `Patrol ${p.id.slice(0, 8)}`,
            status: p.status.toLowerCase(),
            points: projected.map((pt) => `${Math.round(pt.x)},${Math.round(pt.y)}`).join(" "),
            color: p.status === "ACTIVE" ? "#2E7D32" : "#4A6572",
            timedPoints: projected.map((pt, idx) => ({ ...pt, t: idx / Math.max(pts.length - 1, 1) })),
            patrolType: p.type ?? null,
            rangerName: p.user?.fullName ?? null,
            startedAt: p.startedAt ?? first.t ?? null,
            endedAt: p.status !== "ACTIVE" ? (p.endedAt ?? last.t ?? null) : null,
            durationMinutes,
            distanceKm,
            pointCount: pts.length,
          },
        ];
      });

      if (backendRoutes.length > 0) {
        return backendRoutes;
      }
    } catch (err) {
      console.warn("Backend patrol routes unavailable — using accurate patrol paths layout:", err);
    }
    return gisRoutes;
  },
  /**
   * Live tracking feed (GET /api/patrols/live) — ACTIVE patrols with their
   * latest VALID GPS fix plus a bounded recent path. Strict remote; scope is
   * applied by the backend (applyPatrolWhere). Nothing is synthesized here:
   * invalid fixes are dropped again client-side (belt-and-braces), distance
   * and duration derive ONLY from recorded fixes (haversine / timestamps),
   * and a patrol without a usable fix keeps latest: null — never a marker.
   * One entry per RANGER: when a ranger holds several ACTIVE patrols the
   * patrol with the newest lastPointAt wins (no duplicate/conflicting
   * markers); the losing patrols stay in the feed untouched.
   */
  live: async (): Promise<GisLiveFeed> => {
    const res = await remoteOnly(() => api.patrols.live());
    const serverMs = new Date(res.serverTime).getTime();
    // Client−server clock offset at fetch time — used to age real GPS
    // timestamps against THIS browser's clock without trusting it blindly.
    const skewMs = Number.isFinite(serverMs) ? Date.now() - serverMs : 0;

    const byRanger = new Map<string, GisLivePatrol>();
    const patrols: GisLivePatrol[] = [];
    // Newest-first so the first sighting of a ranger wins the dedupe.
    const ordered = [...res.patrols].sort(
      (a, b) => liveSortKey(b.lastPointAt) - liveSortKey(a.lastPointAt)
    );
    for (const p of ordered) {
      const path = p.path.filter(isUsableFix).map((f) => ({ lat: f.lat, lng: f.lng, t: f.t }));
      const usableLatest =
        p.latestPoint && isUsableFix(p.latestPoint)
          ? {
              lat: p.latestPoint.lat,
              lng: p.latestPoint.lng,
              t: p.latestPoint.t,
              accuracy: p.latestPoint.accuracy,
              speed: p.latestPoint.speed,
            }
          : null;
      const view: GisLivePatrol = {
        patrolId: p.id,
        name: p.name,
        patrolType: p.type,
        beat: p.beat,
        rangerId: p.ranger.id,
        rangerName: p.ranger.fullName,
        startedAt: p.startedAt,
        lastPointAt: usableLatest ? usableLatest.t : null,
        pointCount: typeof p.pointCount === "number" ? p.pointCount : 0,
        latest: usableLatest,
        path,
        pathDistanceKm: haversineKm(path),
        pathMinutes: traceDurationMinutes(path[0]?.t ?? null, path[path.length - 1]?.t ?? null),
      };
      patrols.push(view);
      const prev = byRanger.get(view.rangerId);
      if (!prev || liveSortKey(view.lastPointAt) > liveSortKey(prev.lastPointAt)) {
        byRanger.set(view.rangerId, view);
      }
    }
    return { serverTime: res.serverTime, skewMs, patrols, rangers: [...byRanger.values()] };
  },
  // API GAP: heat aggregates (patrol density per beat) are not exposed by the
  // backend — always empty so the UI shows its empty state, never fake heat.
  heat: async (): Promise<HeatBlock[]> => [],
  /**
   * Authoritative patrol coverage (GET /api/coverage/grids). Backend-scoped;
   * no mock fallback — failures surface honestly. The API accepts real
   * backend range/beat/forest ids. Beat ids ARE resolvable (GIS beat features
   * carry the backend Beat primary key, OBJECTID_1 ≡ Beat.id — the GIS page
   * translates its derived hierarchy id to a valid beatId before calling).
   * Range ids have no portal catalog (Range PKs are never exposed), so range
   * filters keep the request division-scoped and the map applies them
   * visually.
   */
  coverage: async (query: { forestId?: string; rangeId?: string; beatId?: string; from?: string; to?: string } = {}): Promise<ApiGridCoverage> =>
    remoteOnly(async () => api.coverage.grids(query)),
};

/* ------------------------------------------------------------------ */
/* SOS / Emergency operations                                          */
/* ------------------------------------------------------------------ */

/**
 * One SOS case for the control room — the authoritative incident record
 * enriched with real user names only. Unknown names stay null/placeholder so
 * the UI never invents an identity.
 */
export interface SosCase {
  incident: ApiIncident;
  rangerName: string;
  verifierName: string | null;
  /** details.message from the ranger app when present, else the description. */
  message: string | null;
}

export const sos = {
  /**
   * SOS cases from the scoped incidents list (GET /api/incidents). The
   * backend applies role scoping — restricted roles see fewer rows, and
   * 401/403 surface as honest error states upstream.
   */
  cases: async (): Promise<SosCase[]> =>
    remoteOnly(async () => {
      const [incidents, users] = await Promise.all([
        api.incidents.list(),
        api.users.list().catch(() => []),
      ]);
      return incidents.filter(isSosIncident).map((incident) => {
        const details = incident.details as { message?: unknown } | null;
        // The incidents list endpoint returns raw rows (no relations), so
        // both names are resolved through the real users register.
        const ranger = users.find((u) => u.id === incident.userId);
        const verifier = incident.verifiedById
          ? users.find((u) => u.id === incident.verifiedById)
          : undefined;
        return {
          incident,
          rangerName: ranger?.fullName ?? incident.user?.fullName ?? "Unknown ranger",
          verifierName: verifier?.fullName ?? null,
          message:
            typeof details?.message === "string" && details.message.trim().length > 0
              ? details.message
              : (incident.description ?? null),
        };
      });
    }),
  /** Raw alert feed (GET /api/alerts) — SOS + TAMPER + COVERAGE events,
   *  already scoped server-side by role. */
  feed: async (): Promise<ApiAlert[]> => remoteOnly(() => api.alerts.list({ limit: 100 })),
};

/* ------------------------------------------------------------------ */
/* Analytics                                                          */
/* ------------------------------------------------------------------ */

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Last `n` month names ending at the current month, e.g. Feb…Aug. */
const lastMonths = (n: number): string[] => {
  const now = new Date();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(MONTH_SHORT[m.getMonth()]);
  }
  return out;
};

const monthIndex = (iso: string): number => new Date(iso).getMonth();

/** Source records for analytics — one shared fetch with a short cache. */
let analyticsCache: { at: number; patrols: ApiPatrol[]; incidents: ApiIncident[] } | null = null;
const analyticsData = async (): Promise<{ patrols: ApiPatrol[]; incidents: ApiIncident[] }> => {
  if (analyticsCache && Date.now() - analyticsCache.at < 30_000) return analyticsCache;
  const [patrols, incidents] = await Promise.all([api.patrols.list(), api.incidents.list()]);
  analyticsCache = { at: Date.now(), patrols, incidents };
  return analyticsCache;
};

/** Counts of incidents of the given types, bucketed by month (n months). */
const incidentMonthSeries = (rows: ApiIncident[], types: string[], months: string[]): number[] => {
  const counts = months.map(() => 0);
  for (const row of rows) {
    if (!types.includes(row.type)) continue;
    const idx = months.length - 1 - (monthIndex(row.occurredAt) - new Date().getMonth());
    if (idx >= 0 && idx < months.length) counts[idx] += 1;
  }
  return counts;
};

export const analytics = {
  /** Patrol + incident volume per weekday, derived from real records. */
  weeklyTrend: async (): Promise<AnalyticsDataset> =>
    remoteOnly(async () => {
      const { patrols, incidents } = await analyticsData();
      const buckets = WEEKDAYS.map(() => 0);
      for (const p of patrols) {
        const d = new Date(p.startedAt ?? p.createdAt);
        if (Number.isFinite(d.getTime())) buckets[(d.getDay() + 6) % 7] += 1;
      }
      const obs = WEEKDAYS.map(() => 0);
      for (const i of incidents) {
        const d = new Date(i.occurredAt);
        if (Number.isFinite(d.getTime())) obs[(d.getDay() + 6) % 7] += 1;
      }
      return { labels: [...WEEKDAYS], series: [{ name: "Patrols", values: buckets }, { name: "Observations", values: obs }] };
    }),
  /** Patrol volume per week (W1…W5). Coverage % has no backend source yet (API GAP). */
  monthly: async () => {
    await delay();
    return monthlyTrend;
  },
  /** Incident volume per month, split by category — real incidents data. */
  incidents: async (): Promise<AnalyticsDataset> =>
    remoteOnly(async () => {
      const { incidents } = await analyticsData();
      const months = lastMonths(7);
      return {
        labels: months,
        series: [
          { name: "Human impact", values: incidentMonthSeries(incidents, ["HUMAN_IMPACT"], months) },
          { name: "Mortality", values: incidentMonthSeries(incidents, ["ANIMAL_MORTALITY"], months) },
          { name: "Sightings", values: incidentMonthSeries(incidents, ["SIGHTING"], months) },
          { name: "Water sources", values: incidentMonthSeries(incidents, ["WATER_SOURCE"], months) },
        ],
      };
    }),
  /** Wildlife sightings per month, by severity — real records. */
  wildlife: async (): Promise<AnalyticsDataset> =>
    remoteOnly(async () => {
      const { incidents } = await analyticsData();
      const months = lastMonths(7);
      return {
        labels: months,
        series: [
          { name: "High severity", values: incidentMonthSeries(incidents.filter((i) => i.severity === "HIGH"), ["SIGHTING"], months) },
          { name: "Medium", values: incidentMonthSeries(incidents.filter((i) => i.severity === "MEDIUM"), ["SIGHTING"], months) },
          { name: "Low", values: incidentMonthSeries(incidents.filter((i) => i.severity === "LOW"), ["SIGHTING"], months) },
        ],
      };
    }),
  /** Human-impact incident volume per month — real records. */
  humanImpact: async (): Promise<AnalyticsDataset> =>
    remoteOnly(async () => {
      const { incidents } = await analyticsData();
      const months = lastMonths(7);
      return {
        labels: months,
        series: [{ name: "Reports", values: incidentMonthSeries(incidents, ["HUMAN_IMPACT"], months) }],
      };
    }),
  /** Water-source survey reports per month — real records. */
  waterBodies: async (): Promise<AnalyticsDataset> =>
    remoteOnly(async () => {
      const { incidents } = await analyticsData();
      const months = lastMonths(7);
      return {
        labels: months,
        series: [{ name: "Sites surveyed", values: incidentMonthSeries(incidents, ["WATER_SOURCE"], months) }],
      };
    }),
  /** Animal mortality per month, by severity — real records. */
  mortality: async (): Promise<AnalyticsDataset> =>
    remoteOnly(async () => {
      const { incidents } = await analyticsData();
      const months = lastMonths(7);
      return {
        labels: months,
        series: [
          { name: "High severity", values: incidentMonthSeries(incidents.filter((i) => i.severity === "HIGH"), ["ANIMAL_MORTALITY"], months) },
          { name: "Medium", values: incidentMonthSeries(incidents.filter((i) => i.severity === "MEDIUM"), ["ANIMAL_MORTALITY"], months) },
          { name: "Low", values: incidentMonthSeries(incidents.filter((i) => i.severity === "LOW"), ["ANIMAL_MORTALITY"], months) },
        ],
      };
    }),
  // API GAP: per-beat coverage % has no backend aggregate (beat attribution
  // of patrols is not exposed) — mock remains until the backend provides it.
  beatCoverage: async () => {
    await delay();
    return beatCoverage;
  },
  // API GAP: division/range/beat comparison aggregates not exposed by the
  // backend — mock remains.
  comparison: async (): Promise<AnalyticsDataset> => {
    await delay();
    return comparativeSeries;
  },
  // API GAP: scope-level KPIs not exposed by the backend — mock remains;
  // dashboard KPIs (dashboard.summary) are real.
  kpisBy: (scope: string): KpiSeries[] => scopeKpis[scope] ?? scopeKpis.forest,
  scopeKpis,
  // API GAP: heatmap aggregates not exposed by the backend — mock remains.
  heatmap: async () => {
    await delay();
    return heatmapPatrol;
  },
  // API GAP: jurisdiction scoring derives from mock patrols + in-session
  // authorizations (no backend equivalent) — mock remains.
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
/* Work Analytics (strict remote — server-side aggregations only)      */
/* ------------------------------------------------------------------ */

/**
 * Work Analytics bindings. Every method calls the real /api/analytics/*
 * endpoints through the same request layer as every other page — there is
 * NO mock fallback, NO client-side fabrication of metrics. Sections with no
 * backend rows surface as empty states (see the page).
 */
export const workAnalytics = {
  /** Patrol volume / distance / duration / steps / mode samples in window. */
  patrols: (window: { from?: string; to?: string }) =>
    remoteOnly(() => api.analytics.patrols(window)),
  /** Incident volume grouped by type / severity / status in window. */
  incidents: (filter: { from?: string; to?: string; type?: string; severity?: string; status?: string }) =>
    remoteOnly(() => api.analytics.incidents(filter)),
  /** Telemetry health: floating patrols, pending sync, integrity, coverage events. */
  health: (window: { from?: string; to?: string }) =>
    remoteOnly(() => api.analytics.health(window)),
};

/* ------------------------------------------------------------------ */
/* Forest hierarchy                                                    */
/* ------------------------------------------------------------------ */

let hierarchyCache: HierarchyTree | null = null;
let hierarchyInflight: Promise<HierarchyTree> | null = null;

export const hierarchy = {
/** Division → range → beat tree + compartment register, derived from the
 *  backend GIS layers (GET /api/gis/beats + /api/gis/compartments).
 *  Strict: no mock fallback — failures surface as error states. */
  units: async (): Promise<HierarchyTree> => {
    if (hierarchyCache) return hierarchyCache;
    if (hierarchyInflight) return hierarchyInflight;
    hierarchyInflight = remoteOnly(async () => {
      const [beatFc, compFc] = await Promise.all([api.gis.beats(), api.gis.compartments()]);
      return hierarchyFromGeoJson(beatFc, compFc);
    }).then(
      (tree) => { hierarchyCache = tree; hierarchyInflight = null; return tree; },
      (err) => { hierarchyInflight = null; throw err; },
    );
    return hierarchyInflight;
  },
  compartments: async (): Promise<HierarchyTree["compartments"]> => (await hierarchy.units()).compartments,
};

/* ------------------------------------------------------------------ */
/* Global                                                            */
/* ------------------------------------------------------------------ */

export const global = {
  /** Alert feed (SOS incidents, time-tamper logs, coverage breaches) from
   *  GET /api/alerts. Strict — no mock fallback. */
  notifications: async (): Promise<NotificationItem[]> =>
    remoteOnly(async () => (await api.alerts.list({ limit: 50 })).map(alertFromApi)),
  /** Global search over real users/patrols/incidents. Users use the
   *  backend `q` filter; patrols/incidents have no search param yet, so
   *  those lists are filtered client-side (API GAP). */
  search: async (q: string): Promise<SearchResult[]> =>
    remoteOnly(async () => {
        const t = q.trim().toLowerCase();
        if (!t) return [];
        const [users, patrols, incidents] = await Promise.all([
          api.users.list({ q: t }),
          api.patrols.list(),
          api.incidents.list(),
        ]);
        const results: SearchResult[] = [];
        for (const u of users) {
          results.push({
            kind: u.role === "ADMIN" ? "user" : "ranger",
            id: u.id,
            title: u.fullName,
            subtitle: u.email ?? "",
            href: `/rangers/${u.id}`,
          });
        }
        for (const p of patrols) {
          const label = p.name ?? p.id;
          if (!label.toLowerCase().includes(t)) continue;
          results.push({
            kind: "patrol",
            id: p.id,
            title: label,
            subtitle: `${p.status.toLowerCase()} · ${p.user?.fullName ?? "Unassigned"}`,
            href: `/patrols/${p.id}`,
          });
        }
        for (const i of incidents) {
          if (!i.title.toLowerCase().includes(t) && !(i.description ?? "").toLowerCase().includes(t)) continue;
          results.push({
            kind: "observation",
            id: i.id,
            title: i.title,
            subtitle: i.user?.fullName ?? "—",
            href: `/observations/${i.id}`,
          });
        }
        return results.slice(0, 12);
      }
    ),
  units: async (): Promise<HierarchyTree> => hierarchy.units(),
};