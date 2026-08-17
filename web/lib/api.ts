/**
 * Backend API client for the admin portal.
 *
 * Full typed surface of the NSTR Patrol backend (Express, mounted under
 * `/api` on the API base). Consumed by `lib/services.ts`, which decides
 * remote-vs-mock per method so the UI keeps working without the backend.
 *
 * Auth: JWT access token (short-lived) + rotating refresh token. Both are
 * kept in localStorage; on a 401 the client refreshes once and retries.
 *
 * Base URL: `NEXT_PUBLIC_API_URL` (default http://localhost:3000).
 */

const STORAGE_ACCESS = "nstr.auth.accessToken";
const STORAGE_REFRESH = "nstr.auth.refreshToken";

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/* ------------------------------------------------------------------ */
/* Errors                                                             */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** True when the failure is transport-level (backend down), session-level (no valid token),
 *  or the API base is occupied by a non-API server (404 on /api/* — e.g. when only the
 *  portal's own dev server is running on the default port). Such cases fall back to mocks. */
export function isRetryableFailure(err: unknown): boolean {
  if (err instanceof TypeError) return true; // network / CORS / fetch failure
  if (err instanceof ApiError) {
    return err.status === 401 || err.status === 404 || err.status >= 500;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Token store                                                         */
/* ------------------------------------------------------------------ */

let accessToken: string | null = null;
let refreshToken: string | null = null;

if (typeof window !== "undefined") {
  try {
    accessToken = window.localStorage.getItem(STORAGE_ACCESS);
    refreshToken = window.localStorage.getItem(STORAGE_REFRESH);
  } catch {
    /* storage unavailable (SSR / privacy mode) — stay anonymous */
  }
}

export function setTokens(access: string, refresh?: string): void {
  accessToken = access;
  if (refresh) refreshToken = refresh;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_ACCESS, access);
      if (refresh) window.localStorage.setItem(STORAGE_REFRESH, refresh);
    } catch { /* ignore */ }
  }
}

export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_ACCESS);
      window.localStorage.removeItem(STORAGE_REFRESH);
    } catch { /* ignore */ }
  }
}

export function hasSession(): boolean {
  return Boolean(accessToken);
}

/* ------------------------------------------------------------------ */
/* Core request                                                        */
/* ------------------------------------------------------------------ */

interface RequestOpts {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  auth?: boolean;
}

async function rawRequest(path: string, opts: RequestOpts): Promise<Response> {
  const url = new URL(`${API_BASE}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  return fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  let res = await rawRequest(path, opts);

  // One-shot refresh-and-retry on session expiry.
  if (res.status === 401 && refreshToken && opts.auth !== false) {
    try {
      const refreshed = await rawRequest("/api/auth/refresh", {
        method: "POST",
        body: { refreshToken },
      });
      if (refreshed.ok) {
        const data = (await parseBody(refreshed)) as { accessToken: string; refreshToken?: string };
        setTokens(data.accessToken, data.refreshToken);
        res = await rawRequest(path, opts);
      } else {
        clearTokens();
      }
    } catch {
      clearTokens();
    }
  }

  if (!res.ok) {
    let code = "http_error";
    let message = `Request failed (${res.status})`;
    try {
      const payload = (await res.json()) as { error?: { code?: string; message?: string } };
      if (payload?.error) {
        code = payload.error.code ?? code;
        message = payload.error.message ?? message;
      }
    } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, code, message);
  }
  return (await parseBody(res)) as T;
}

/* ------------------------------------------------------------------ */
/* Backend response shapes                                             */
/* ------------------------------------------------------------------ */

export interface ApiUser {
  id: string;
  email: string;
  fullName: string;
  role: "ADMIN" | "RANGER";
  cader: string | null;
  phone: string | null;
  isActive: boolean;
  isAdmin: boolean;
}

export interface ApiLoginResponse {
  accessToken: string;
  refreshToken: string;
  user: ApiUser;
}

export interface ApiPatrol {
  id: string;
  forestId: string;
  name: string | null;
  description: string | null;
  type: "WALK" | "BICYCLE" | "VEHICLE" | "STATIONARY";
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  startedAt: string | null;
  endedAt: string | null;
  syncStatus: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  user?: { id: string; fullName: string; email: string; phone?: string | null; cader?: string | null; role?: string };
  forest?: { id: string; name: string; code: string };
}

export interface ApiPatrolStats {
  points: number;
  distanceKm: number;
  durationSeconds: number;
}

export interface ApiIncident {
  id: string;
  userId: string;
  patrolId?: string | null;
  type:
    | "HUMAN_IMPACT"
    | "ANIMAL_MORTALITY"
    | "SIGHTING"
    | "WATER_SOURCE"
    | "QUICK_CAPTURE"
    | "GENERAL";
  title: string;
  description: string | null;
  severity: "LOW" | "MEDIUM" | "HIGH";
  status: "SUBMITTED" | "VERIFIED" | "RESOLVED" | "REJECTED";
  details: Record<string, unknown> | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  photos: string[];
  occurredAt: string;
  reportedAt: string;
  verifiedById?: string | null;
  verifiedAt?: string | null;
  resolutionNote?: string | null;
  user?: { id: string; fullName: string };
}

export interface ApiMapAsset {
  id: string;
  resourceKey: string;
  contentType: string;
  storagePath: string | null;
  sizeBytes: number;
  sha256: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiOption {
  key: string;
  kind: "list" | "value";
  value: unknown;
  overridden: boolean;
  updatedAt: string | null;
}

export interface ApiSyncStatus {
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  pending: Record<string, number>;
  asOf: string;
}

export interface ApiSyncLog {
  id: string;
  deviceId: string | null;
  patrolId: string | null;
  recordsCount: number;
  status: string;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ApiAlert {
  type: "SOS" | "TAMPER" | "COVERAGE";
  timestamp: string;
  incidentId?: string;
  patrolId?: string;
  rangerId?: string;
  ranger?: string;
  latitude?: number | null;
  longitude?: number | null;
  eventType?: string;
  details?: string | null;
}

export interface ApiDevice {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  pushToken: string | null;
  lastSeenAt: string | null;
}

export interface ApiForest {
  id: string;
  name: string;
  code: string;
  description: string | null;
  _count: { boundaries: number; grids: number };
}

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

export interface GeoJsonFeature {
  type: "Feature";
  id?: string | number;
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown>;
}

export interface ApiHealth {
  status: "ok" | "degraded";
  database: string;
}

export interface ApiTelemetryAggregate {
  patrolId: string;
  points: number;
  distanceKm: number;
  movingSeconds: number;
  totalSeconds: number;
  gridsTouched: number;
  computedAt: string;
}

/* ------------------------------------------------------------------ */
/* Endpoint groups (mirror backend/src/routes)                         */
/* ------------------------------------------------------------------ */

export const auth = {
  login: (email: string, password: string) =>
    request<ApiLoginResponse>("/api/auth/login", { method: "POST", body: { email, password }, auth: false }),
  register: (input: { email: string; password: string; fullName: string; role?: string; cader?: string; phone?: string }) =>
    request<ApiUser>("/api/auth/register", { method: "POST", body: input, auth: false }),
  refresh: () =>
    request<{ accessToken: string; refreshToken: string }>("/api/auth/refresh", {
      method: "POST",
      body: { refreshToken },
      auth: false,
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  me: () => request<ApiUser>("/api/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("/api/auth/password", { method: "PATCH", body: { currentPassword, newPassword } }),
};

export const users = {
  list: (query: { role?: string; q?: string } = {}) =>
    request<ApiUser[]>("/api/users", { query }),
  update: (id: string, patch: Partial<Pick<ApiUser, "fullName" | "role" | "cader" | "phone">> & { password?: string }) =>
    request<ApiUser>(`/api/users/${id}`, { method: "PATCH", body: patch }),
  activate: (id: string) => request<ApiUser>(`/api/users/${id}/activate`, { method: "POST" }),
  deactivate: (id: string) => request<ApiUser>(`/api/users/${id}/deactivate`, { method: "POST" }),
};

export const patrols = {
  list: (query: { mine?: boolean; status?: string; forestId?: string } = {}) =>
    request<ApiPatrol[]>("/api/patrols", { query: { ...query, mine: query.mine ? "true" : undefined } }),
  get: (id: string) => request<ApiPatrol & { stats: ApiPatrolStats }>(`/api/patrols/${id}`),
  points: (id: string) =>
    request<{ lat: number; lng: number; altitude?: number | null; speed?: number | null; t: string }[]>(`/api/patrols/${id}/points`),
  start: (id: string, startedAt?: string) => request<{ status: string; startedAt: string }>(`/api/patrols/${id}/start`, { method: "POST", body: { startedAt } }),
  complete: (id: string, endedAt?: string) =>
    request<{ status: string; endedAt: string }>(`/api/patrols/${id}/complete`, { method: "POST", body: { endedAt } }),
};

export const incidents = {
  list: (query: { mine?: boolean; status?: string; type?: string; from?: string; to?: string } = {}) =>
    request<ApiIncident[]>("/api/incidents", {
      query: { ...query, mine: query.mine ? "true" : undefined },
    }),
  get: (id: string) => request<ApiIncident>(`/api/incidents/${id}`),
  create: (input: {
    patrolId?: string | null;
    type: ApiIncident["type"];
    title: string;
    description?: string | null;
    severity?: ApiIncident["severity"];
    details?: Record<string, unknown> | null;
    latitude?: number | null;
    longitude?: number | null;
    accuracy?: number | null;
    photos?: string[];
    occurredAt: string;
  }) => request<ApiIncident>("/api/incidents", { method: "POST", body: input }),
  verify: (id: string) => request<ApiIncident>(`/api/incidents/${id}/verify`, { method: "POST" }),
  resolve: (id: string, resolutionNote?: string | null) =>
    request<ApiIncident>(`/api/incidents/${id}/resolve`, { method: "POST", body: { resolutionNote } }),
  reject: (id: string, resolutionNote?: string | null) =>
    request<ApiIncident>(`/api/incidents/${id}/reject`, { method: "POST", body: { resolutionNote } }),
};

export const gis = {
  beats: () => request<GeoJsonFeatureCollection>("/api/gis/beats", { auth: false }),
  compartments: () => request<GeoJsonFeatureCollection>("/api/gis/compartments", { auth: false }),
  boundary: () => request<GeoJsonFeatureCollection>("/api/gis/boundary", { auth: false }),
  grids: () => request<GeoJsonFeatureCollection>("/api/gis/grids", { auth: false }),
  assets: () => request<ApiMapAsset[]>("/api/gis/assets", { auth: false }),
  asset: (resourceKey: string) => `${API_BASE}/api/gis/assets/${encodeURIComponent(resourceKey)}`,
};

export const map = {
  assets: () => request<ApiMapAsset[]>("/api/map/assets"),
  assetMeta: (resourceKey: string) => request<ApiMapAsset>(`/api/map/assets/${encodeURIComponent(resourceKey)}/meta`),
};

export const options = {
  get: (key: string) => request<ApiOption>(`/api/options/${key}`),
  put: (key: string, value: unknown) => request<ApiOption>(`/api/options/${key}`, { method: "PUT", body: { value } }),
};

export const telemetry = {
  aggregate: (patrolId: string) =>
    request<ApiTelemetryAggregate>(`/api/telemetry/patrol/${patrolId}/aggregates`, { method: "POST" }),
};

export const sync = {
  status: () => request<ApiSyncStatus>("/api/sync/status"),
  logs: (limit?: number) => request<ApiSyncLog[]>("/api/sync/logs", { query: { limit } }),
};

export const sos = {
  contacts: () => request<{ id: string; fullName: string; phone: string | null; role: string; cader: string | null }[]>("/api/sos/contacts"),
};

export const alerts = {
  list: (query: { since?: string; limit?: number } = {}) =>
    request<ApiAlert[]>("/api/alerts", { query: { ...query, limit: query.limit } }),
};

export const devices = {
  list: (userId?: string) => request<ApiDevice[]>("/api/devices", { query: { userId } }),
};

export const forests = {
  list: () => request<ApiForest[]>("/api/forests"),
};

export const uploads = {
  urlFor: (key: string) => `${API_BASE}/api/uploads/${encodeURIComponent(key)}`,
};

export const health = {
  check: () => request<ApiHealth>("/api/health", { auth: false }),
};

/** Aggregate client mirroring the backend router tree (for discoverability + tooling). */
export const api = { auth, users, patrols, incidents, gis, map, options, telemetry, sync, sos, alerts, devices, forests, uploads, health };
export default api;