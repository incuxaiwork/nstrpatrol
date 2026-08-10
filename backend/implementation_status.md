# NSTR Patrol — Backend Implementation Status

Tracking document for the backend (`backend/`, Express + TypeScript + Prisma + PostGIS).
It maps every API the platform needs — consumed by the **mobile** (offline-first sync
client) and the **admin web** (management surface) — and tracks build/verify status.
This document is written **before** the bulk of the API is built, so it acts as the
blueprint and the running checklist.

---

## 0. Core principle: all data goes through the API

> **No direct database writes.** Every insert / update / delete on Postgres must happen
> through an API endpoint. No raw `psql` edits, no `prisma` scripts that mutate data,
> no ORM calls outside request handlers.

- The **admin web portal** is the *management surface*: map data (beats, compartments,
  boundaries, grids, routes), forests, rangers, and patrol assignments are created and
  edited there — through the admin API. **Mobile never writes reference/map data.**
- The **mobile** app writes *its own collected data* (patrols, telemetry, incidents)
  through the sync-upload APIs when online. It reads reference/map data through the
  read APIs and caches locally.
- Any one-off data load (e.g. a bulk map import) must be exposed as an API, not a script.
  The one-time `npm run import:gis` bootstrap that seeded the current beat/compartment/
  MBTiles rows **directly is a legacy exception** and must be superseded by the admin
  map-management APIs below (section 5); the script stays only as historical reference.
- Consequence: if a change cannot be made from the admin web, it is a **missing API**,
  not a reason to touch the database directly. File it in the backlog.

### API envelope (shared conventions)

- Base path `/api`; JSON bodies; `application/json` responses.
- Auth: `Authorization: Bearer <JWT>` on protected routes (section 2). Role checks
  (`ADMIN` vs `RANGER`) enforced per route.
- Errors: `{ "error": { "code": "...", "message": "..." } }` with proper HTTP status
  (400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict,
  422 invalid geometry, 503 db).
- Geometry: GeoJSON (RFC 7946, `[lon, lat]`). Backend validates and stores
  `geometry(…,4326)` via `ST_GeomFromGeoJSON`; reads return `ST_AsGeoJSON`.
- Created/updated timestamps: server-side only.

---

## 1. Build & project setup

- `[x]` Express 5 + TypeScript (strict) + Zod validation + pino logging + helmet/cors.
- `[x]` Prisma + PostGIS migrations (hand-written raw SQL for GIST indexes, triggers,
  geometry columns) — baseline applied, schema drift clean (`prisma migrate status`).
- `[x]` `GET /api/health` — DB connectivity (implemented).
- `[x]` Docker Compose for local infra: PostGIS (`postgis/postgis:16-3.4`), Redis, MinIO.
- `[ ]` Jest test harness wired for route tests (supertest) — harness exists, no route tests yet.
- `[x]` Env validation (zod) — JWT secrets/expiry, PORT, STORAGE_DIR; JWT secrets required.
- `[x]` Global error handling for async rejections + Zod validation middleware standardized
  (`{error:{code,message}}` envelope, 422 invalid geometry, Prisma conflict/not-found mapping).

---

## 2. Auth (JWT) — needed by mobile (7.1) & web login

Roles: `ADMIN` (web portal, verify incidents, manage reference data), `RANGER` (mobile).

- `[x]` `POST /api/auth/register` — create user (ADMIN only) `{email, password, fullName, role, phone}`.
- `[x]` `POST /api/auth/login` — `{email, password}` → `{accessToken, refreshToken, user}`.
- `[x]` `POST /api/auth/refresh` — rotate refresh token → new access token.
- `[x]` `POST /api/auth/logout` — revoke refresh token.
- `[x]` `GET /api/auth/me` — current user profile (`fullName`, `role`, `phone`, `isActive`).
- `[x]` `PATCH /api/auth/password` — change own password.
- Backing models: `User` (passwordHash, refreshTokenHash, Role).

**Ordering note:** auth is the **prerequisite** for every protected endpoint below; the
GIS read endpoints (5.0) currently return public data and will gain `auth` protection.

---

## 3. Users & devices

- `[x]` `GET /api/users?role=RANGER` — ranger list for member/team-leader pickers (mobile 7.6).
- `[x]` `PATCH /api/users/:id` — update user (ADMIN).
- `[x]` `POST /api/users/:id/deactivate` + `activate` — enable/disable login (ADMIN).
- `[x]` `POST /api/devices` — register device `{deviceName, deviceModel, deviceId, pushToken}` (mobile).
- `[x]` `GET /api/devices` — device list per user / all (ADMIN).
- `[x]` `PATCH /api/devices/:id` — update push token, lastSeen.
- Backing models: `User`, `Device`.

---

## 4. Forest reference — forests, boundaries, grids

- `[x]` `GET /api/forests` — list forests.
- `[x]` `POST /api/forests` — create forest (ADMIN).
- `[x]` `PATCH /api/forests/:id` — update forest (ADMIN).
- `[x]` `GET /api/forests/:id/boundaries` — boundary polygons as GeoJSON.
- `[x]` `POST /api/forests/:id/boundaries` — add/upsert boundary polygon (ADMIN; GeoJSON body).
- `[x]` `DELETE /api/forests/:id/boundaries/:id` — remove boundary (ADMIN).
- `[x]` `GET /api/forests/:id/grids` — grid polygons + codes (GeoJSON; mobile point-in-polygon cache).
- `[x]` `POST /api/forests/:id/grids` — generate/upsert grid layout (ADMIN; size/offset or uploaded polygons).
- `[x]` `DELETE /api/forests/:id/grids/:id` — remove grid (ADMIN).
- Backing models: `Forest`, `ForestBoundary`, `ForestGrid` (geometry(Polygon,4326), GIST indexed).

---

## 5. Map & GIS management — the admin web's core job

**The main management surface.** Beats, compartments, routes, and the MBTiles atlas are
created/updated **from the admin web only**. Mobile consumes them read-only (10.4 in the
mobile doc) and the one-time import script is superseded here.

### 5.0 GIS reads (mobile) — IMPLEMENTED

- `[x]` `GET /api/gis/beats` — beats as GeoJSON (44 rows; properties Beat/Section/Range/
  Division/Circle/District/Area_ha; `ST_AsGeoJSON`).
- `[x]` `GET /api/gis/compartments` — compartments as GeoJSON (448 rows; Polygon+MultiPolygon).
- `[x]` `GET /api/gis/assets` — map-asset metadata (resourceKey, contentType, sha256, version, sizeBytes).
- `[x]` `GET /api/gis/assets/:resourceKey` — binary download (MBTiles blob from `MapAsset.data`; ETag=sha256).
- `[~]` `npm run import:gis` — one-time direct-DB seed (legacy; superseded by 5.1–5.4 below).

### 5.1 Beats (admin web — IMPLEMENTED)

- `[x]` `GET /api/map/beats` — list beats (id, name, attributes, areaHa, bounds).
- `[x]` `POST /api/map/beats` — create beat `{name, section, rangeName, division, circle, district, areaHa, geometry?}` (GeoJSON or polygon coords).
- `[x]` `PUT /api/map/beats/:id` — update attributes **and/or geometry** (the admin edit flow).
- `[x]` `DELETE /api/map/beats/:id` — remove beat.
- `[x]` `POST /api/map/beats/import` — bulk GeoJSON upload (FeatureCollection) → transaction insert/update (replaces `import:gis` beats path).

### 5.2 Compartments (admin web — IMPLEMENTED)

- `[x]` `GET /api/map/compartments?beatId=` — list compartments.
- `[x]` `POST /api/map/compartments` — create `{compNo, areaHa, beatId?, geometry?}`.
- `[x]` `PUT /api/map/compartments/:id` — update attributes/geometry/linked beat.
- `[x]` `DELETE /api/map/compartments/:id` — remove compartment.
- `[x]` `POST /api/map/compartments/import` — bulk GeoJSON upload (replaces `import:gis` comps path).

### 5.3 Patrol routes (admin web — IMPLEMENTED)

- `[x]` `GET /api/map/routes` — list routes (`name`, `patrolType`, `targetKm`, `active`, `beatId`, geometry).
- `[x]` `POST /api/map/routes` — create route with geometry (LineString).
- `[x]` `PUT /api/map/routes/:id` — update route incl. geometry.
- `[x]` `DELETE /api/map/routes/:id` — remove route.
- Backing models: `Beat`, `Compartment`, `PatrolRoute` (geometry(Geometry,4326)).

### 5.4 Map assets / MBTiles atlas (admin web — IMPLEMENTED)

- `[x]` `POST /api/map/assets` — upload a new map asset (MBTiles or GeoJSON file, multipart) → stores BYTEA in `MapAsset.data`, computes sha256, bumps `version` (replaces `import:gis` MBTiles path).
- `[x]` `PUT /api/map/assets/:resourceKey` — replace file (new version, keeps resourceKey).
- `[x]` `GET /api/map/assets/:resourceKey/meta` — asset metadata (alias of 5.0 list item).
- `[x]` `DELETE /api/map/assets/:resourceKey` — remove asset.
- Backing model: `MapAsset` (sha256-versioned, BYTEA `data`).

---

## 6. Patrols & assignments — mobile creates, admin assigns

Duty (Patrol) vs member (PatrolAssignment) split; member statuses and timestamps drive
the patrol lifecycle.

- `[x]` `POST /api/patrols` — create a duty: `{forestId, name?, description?, type}` (ADMIN creates/assigns; mobile can create solo).
- `[x]` `GET /api/patrols?assignedTo=me` — patrol list for a ranger (mobile 7.4 sync-down).
- `[x]` `GET /api/patrols/:id` — patrol detail (duty + assignments + aggregate stats).
- `[x]` `POST /api/patrols/:id/assignments` — assign members `{userId}` (ADMIN); enforces `@@unique(patrolId,userId)`.
- `[x]` `DELETE /api/patrols/:id/assignments/:id` — unassign member (ADMIN).
- `[x]` `POST /api/patrols/:id/assignments/:id/start` — member starts (mobile; sets status ACTIVE + startedAt; patrol status/startedAt rollup).
- `[x]` `POST /api/patrols/:id/assignments/:id/complete` — member completes (mobile; endedAt from last telemetry, status COMPLETED; patrol endedAt rollup).
- `[x]` `POST /api/patrols/:id/routes` + `DELETE` — bind shared/member routes (`PatrolDutyRoute`).
- `[x]` `POST /api/patrols/:id/waypoints` + `DELETE` — bind patrol waypoints (`PatrolWaypoint`).
- `[x]` `POST /api/patrols/waypoints/:id/checkin` — ranger reaches waypoint (`WaypointCheckin`).
- Backing models: `Patrol`, `PatrolAssignment`, `PatrolDutyRoute`, `PatrolWaypoint`, `WaypointCheckin`.

---

## 7. Telemetry ingestion (mobile sync-up)

Mobile records GPS + sensor rows offline (Room) and batch-uploads them. All writes go
through this API only.

- `[x]` `POST /api/telemetry/points` — batch insert `PatrolPoint[]` `{assignmentId, latitude, longitude, altitude?, speed?, bearing?, accuracy?, gridId?, timestamp}` (geom auto-set by trigger).
- `[x]` `POST /api/telemetry/step-readings` — batch `StepReading[]`.
- `[x]` `POST /api/telemetry/barometer` — batch `BarometerReading[]`.
- `[x]` `POST /api/telemetry/accelerometer` — batch `AccelerometerReading[]`.
- `[x]` `POST /api/telemetry/gyroscope` — batch `GyroscopeReading[]`.
- `[x]` `POST /api/telemetry/magnetometer` — batch `MagnetometerReading[]`.
- `[x]` `POST /api/telemetry/activity-segments` — batch `ActivitySegment[]` (mode, start/end, confidence).
- `[x]` `POST /api/telemetry/coverage-events` — batch `CoverageEvent[]` (type, lat/lon, timestamp).
- `[x]` `POST /api/telemetry/integrity-logs` — batch `TimeIntegrityLog[]`.
- `[x]` `POST /api/telemetry/assignment/:id/aggregates` — server-side recompute of assignment aggregates (distance, move minutes, coverage) from stored points.
- Backing models: `PatrolPoint` (GIST), `StepReading`, `BarometerReading`, `AccelerometerReading`, `GyroscopeReading`, `MagnetometerReading`, `ActivitySegment`, `CoverageEvent`, `TimeIntegrityLog`.

---

## 8. Incidents — mobile reports, admin verifies

- `[x]` `POST /api/incidents` — submit incident (mobile): `{assignmentId?, type, title, description?, severity, details?, latitude?, longitude?, accuracy?, photos[], occurredAt}` (geom auto-set by trigger; status SUBMITTED).
- `[x]` `GET /api/incidents?mine=true` — ranger's own incidents (mobile 7.7/7.12 lists).
- `[x]` `GET /api/incidents?status=&type=&from=&to=` — filtered list (admin).
- `[x]` `GET /api/incidents/:id` — incident detail.
- `[x]` `POST /api/incidents/:id/verify` — set VERIFIED (ADMIN; `verifiedById`, `verifiedAt`).
- `[x]` `POST /api/incidents/:id/resolve` — set RESOLVED + `resolutionNote` (ADMIN).
- `[x]` `POST /api/incidents/:id/reject` — set REJECTED (ADMIN).
- `[x]` `POST /api/incidents/:id/photo-upload` — attach photo (storage key on `photos[]`).
- Backing model: `Incident` (IncidentType/Severity/Status, details JSON, geom trigger).

---

## 9. Sync & audit

- `[x]` `POST /api/sync/upload` — mobile batch upload mixing telemetry/
  incidents; per-batch `SyncLog` (status SYNCED/FAILED, errorMessage). Mobile marks rows accordingly.
- `[x]` `GET /api/sync/changes?since=<cursor>` — server-side changes (assigned patrols, assets,
  open alerts) for mobile to merge; returns next cursor.
- `[x]` `GET /api/sync/status` — last sync + pending counts.
- `[x]` `GET /api/sync/logs` — admin view of `SyncLog` rows.
- Backing models: `SyncLog`; `SyncStatus` enums on every syncable entity.

---

## 10. SOS & alerts

- `[x]` `POST /api/sos` — fire high-priority alert (mobile): stores incident/alert; push wiring pending.
- `[x]` `GET /api/sos/contacts` — emergency contacts (Control Room / Range Officer / Forest Guard) for the ranger's forest/division.
- `[x]` `GET /api/alerts` — admin alert feed (live SOS + tamper/coverage alerts derived from `CoverageEvent`/`TimeIntegrityLog`).
- Backing models: `Incident` (type), `CoverageEvent`, `TimeIntegrityLog`, `User`.

---

## 11. Options / reference data

- `[x]` `GET /api/options/:key` — generic picker lists (patrol-types, human-impact-types,
  action-taken, sighting-types, water-source answers, sync-interval, …) — served from a config/constants source with DB overrides, cached on mobile.
- `[x]` `PUT /api/options/:key` — admin edits an option list (ADMIN).

---

## 12. Files / uploads

- `[x]` `POST /api/uploads` — photo upload (multipart) → dated-key local storage (MinIO/S3 bucket config pending).
- `[x]` `GET /api/uploads/:key` — cached/streamed photo download (admin + mobile verified view).
- `[x]` `DELETE /api/uploads/:key` — remove object.
- Storage: local `STORAGE_DIR` (compose MinIO/S3 pending); metadata on the owning row (e.g. `Incident.photos`). Keys are `YYYYMMDD/<rand>.<ext>` — clients must URL-encode the `/` in the key.

---

## 13. Consumption matrix

| API group                       | Mobile (reads) | Mobile (writes) | Admin web (management) |
| ------------------------------- | -------------- | --------------- | ---------------------- |
| Auth (2)                        | login/refresh  | —               | login, user mgmt       |
| Users & devices (3)             | pickers        | register device | manage rangers/devices |
| Forest reference (4)            | boundaries/grids cache | —          | **create/edit**        |
| Map & GIS (5)                   | beats/comps/assets | —           | **beats/comps/routes/assets CRUD** |
| Patrols & assignments (6)       | assigned patrols | create/start/complete | **assign/monitor**     |
| Telemetry (7)                   | —              | batch upload   | — (ingest via upload)  |
| Incidents (8)                   | own list       | submit         | **verify/resolve**     |
| Sync & audit (9)                | changes        | upload         | logs                   |
| SOS & alerts (10)               | contacts       | fire alert     | alert feed             |
| Options (11)                    | option lists   | —              | **edit lists**         |
| Files (12)                      | photo view     | upload         | view                   |

---

## 14. Build order (recommended)

1. **Auth (2)** — gates everything else.
2. **Map & GIS management (5)** — completes the admin-web core already started by the read endpoints; supersedes `import:gis`.
3. **Forest reference (4)** — supports grids/boundaries management.
4. **Users & devices (3)** — needed by auth/admin + mobile pickers.
5. **Incidents (8)** — mobile's first real write + admin verification workflow.
6. **Patrols & assignments (6)** — duty lifecycle.
7. **Telemetry (7) + Sync (9)** — mobile offline-first upload path.
8. **SOS & alerts (10), Options (11), Files (12)** — supporting.

Each API group is committed and verified (`npm run lint`, `npm run build`, route tests)
before moving to the next.

---

## Backlog & open questions

- `[ ]` Enforce "no direct DB writes" operationally: app DB user granted only `SELECT`/routine
  security, or an audit hook rejecting non-API writes — decision needed.
- `[ ]` Remove/retire `scripts/import-gis.ts` now that 5.1–5.4 landed — keep only as reference.
- `[ ]` Pagination convention for list endpoints (cursor vs offset).
- `[ ]` Rate limiting + lockout on auth endpoints.
- `[ ]` Push notifications: FCM wiring for SOS/alerts/assignment push.
- `[ ]` Batch-size limits on telemetry upload endpoints (tune with mobile buffer sizes) — MAX_BATCH=2000 hardcoded.
- `[ ]` GeoJSON geometry validation library (reject invalid/out-of-bounds rings before `ST_GeomFromGeoJSON`).
- `[ ]` Wire uploads storage to MinIO/S3 (compose MinIO present; backend currently uses local `STORAGE_DIR`).
- `[ ]` Route-level automated tests (supertest harness exists).

---

*Last updated: 2026-08-10. The full backend API surface is implemented and smoke-tested
(auth, users/devices, forests, map management, patrols, telemetry, incidents, sync, SOS,
options, uploads). Remaining work is listed in the backlog (tests, push, S3, rate limiting,
pagination).*
