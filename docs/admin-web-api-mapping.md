# Admin Web Portal ↔ Backend API Mapping & Connection Audit

Audit date: 2026-08-13 · Branch: `Veera---Admin-Web`

This document maps every data need of the admin web portal (`web/`, Next.js)
to the backend REST API (`backend/`, Express + Prisma + PostGIS) and records
which endpoints are connected, which are partial, and which are gaps.

## 0. How the connection works

- Backend: `http://localhost:3000` (port from `backend/src/config/env.ts`), all
  routes mounted under `/api` (`backend/src/app.ts`), CORS enabled.
- Web: `web/lib/api.ts` is the typed API client (fetch wrapper, Bearer JWT,
  one-shot refresh-and-retry on 401, `ApiError` shaping). Base URL from
  `NEXT_PUBLIC_API_URL` (default `http://localhost:3000`, see `web/.env.example`).
- `web/lib/backend-adapters.ts` converts backend payloads into the portal's
  domain shapes (`lib/types.ts`) — pure functions, no I/O:
  - `beatsFromGeoJson` / `compartmentsFromGeoJson` (GeoJSON → SVG polygons,
    shared projection into the mock map's 1000×700 viewBox)
  - `patrolFromApi`, `observationFromApi`, `adminUserFromApi`
- `web/lib/services.ts` decides remote-vs-mock per method via `tryRemote`:
  backend first; fall back to the in-memory mock ONLY on transport failure
  (backend down) or missing session (401). Business errors (403/404/422…)
  propagate so bugs surface. This preserves demo mode with zero config.
- **No backend files were modified.** All work is web-side, so this branch
  cannot conflict with mobile/backend work on other branches.

## 1. Web portal → backend mapping matrix

Legend: ✅ **CONNECTED** (services call the backend now) · ◐ PARTIAL ·
⛔ GAP (no backend endpoint — mock remains, future work).

### Auth & session
| Portal need | Backend endpoint | Status | Notes |
|---|---|---|---|
| Login / session | `POST /api/auth/login`, `POST /api/auth/refresh` | ✅ `auth.login` in `lib/services.ts` stores access+refresh tokens (localStorage) | Refresh is automatic in `api.ts` on 401 |
| Logout | `POST /api/auth/logout` | ✅ `auth.logout` | Clears server refresh hash + local tokens |
| Current user | `GET /api/auth/me` | ✅ `auth.me` | |
| Change password | `PATCH /api/auth/password` | ✅ `auth.changePassword` | Profile menu UI wiring is next step |
| First-user bootstrap | `POST /api/auth/register` (no users exist) | ◐ exposed via `auth.register` | Used implicitly by admin user onboarding |

### Patrols
| Portal need | Backend endpoint | Status | Notes |
|---|---|---|---|
| Patrol list (all) | `GET /api/patrols` | ✅ `patrols.list` → `patrolFromApi` | status: ACTIVE→ongoing, COMPLETED→completed, CANCELLED→cancelled; type WALK/BICYCLE/VEHICLE/STATIONARY → method foot/cycle/four-wheeler |
| Patrol detail + stats | `GET /api/patrols/:id` (incl. PostGIS stats) | ✅ `patrols.get` | |
| Replay track points | `GET /api/patrols/:id/points` | ◐ client exists (`api.patrols.points`), UI wiring pending | |
| Start / complete | `POST /api/patrols/:id/start`, `/complete` | ◐ client exists, UI wiring pending | |
| Patrol reports | — (no endpoint; derived from patrols + incidents) | ⛔ mock | |
| Patrol authorizations (permissions module) | — (no authorization entity in backend) | ⛔ mock (`authorizations.*`, jurisdiction engine) | Full PRD §6 flow is web-only for now |
| Active patrol count for dashboard | `GET /api/patrols?status=ACTIVE` | ◐ used indirectly | dashboard.summary stays mock |

### Observations / incidents
| Portal need | Backend endpoint | Status | Notes |
|---|---|---|---|
| Observations list | `GET /api/incidents` | ✅ `observations.list` → `observationFromApi` | type → category: HUMAN_IMPACT→human-impact, ANIMAL_MORTALITY→mortality, SIGHTING→wildlife, WATER_SOURCE→water-body, QUICK_CAPTURE/GENERAL→others |
| Observation detail | `GET /api/incidents/:id` | ✅ `observations.get` | |
| Resolve report | `POST /api/incidents/:id/resolve` | ✅ `observations.setStatus(id, "resolved")` | |
| Escalate / mark for review | `POST /api/incidents/:id/verify` | ✅ `observations.setStatus(id, "escalated"/"under-review")` → verify | |
| Status mapping | SUBMITTED→open, VERIFIED→under-review, RESOLVED/REJECTED→resolved | ✅ adapter | Portal "escalated" has no 1:1 backend status; verify is the closest |
| Media | incident `photos[]` (keys) → `ObservationMedia[]` | ✅ adapter (photo placeholders) | Hotlinking via `GET /api/uploads/:key` is available in `api.uploads.urlFor` |

### GIS & map (the explicit connect request)
| Portal need | Backend endpoint | Status | Notes |
|---|---|---|---|
| Beats layer | `GET /api/gis/beats` (GeoJSON, mobile-compatible properties) | ✅ **CONNECTED** — `gis.beats()` fetches GeoJSON, projects to the map's SVG viewBox, `gis/page.tsx` passes them as `liveBeats` to `MapWorkspace` | Shared bbox projection across the whole layer; empty table → mock fallback; zero-patrol flag derived when backend supplies coverage (else mock flag) |
| Compartments layer | `GET /api/gis/compartments` (GeoJSON) | ✅ client + adapter (`gis.compartments()`); UI render pending | |
| Map assets (MBTiles atlas etc.) | `GET /api/gis/assets` + `GET /api/gis/assets/:resourceKey` (ETag/immutable) | ✅ **CONNECTED** — `gis.assets()`; GIS page shows an asset catalog card with download links | |
| Map admin CRUD (beats/comp/routes/assets) | `GET/POST/PUT/DELETE /api/map/*`, import endpoints | ◐ client exposes `api.map.assets`/`assetMeta`; CRUD client wrappers pending | |
| Patrol routes on map | `GET /api/map/routes` (geometry) | ⛔ UI still uses mock `gisRoutes` | Projection + replay integration is future work |
| Live markers (rangers/obs/SOS) | — (no marker endpoint; derived from users/incidents/telemetry) | ⛔ mock `gisMarkers` | |

### Rangers
| Portal need | Backend endpoint | Status | Notes |
|---|---|---|---|
| Ranger directory | — (backend has `User`, not a Ranger profile entity) | ⛔ mock | Next step could adapt users + cader/designation |
| Ranger CRUD | — | ⛔ mock | |
| Teams / vehicles / weapons / equipment | — | ⛔ mock | |

### Analytics
| Portal need | Backend endpoint | Status | Notes |
|---|---|---|---|
| All analytics datasets | — | ⛔ mock (`analytics.*`) | Backend has per-patrol postgis aggregates (`POST /api/telemetry/patrol/:id/aggregates`) and pending sync counts; a server-side analytics endpoint is future work |
| Per-patrol aggregates | `POST /api/telemetry/patrol/:id/aggregates` | ◐ client exists (`api.telemetry.aggregate`) | |

### Admin
| Portal need | Backend endpoint | Status | Notes |
|---|---|---|---|
| Users list | `GET /api/users` | ✅ `admin.users()` → `adminUserFromApi` | role ADMIN→admin, RANGER→ranger; isActive→active/disabled |
| Invite / create user | `POST /api/auth/register` (admin-gated) | ✅ `admin.createUser()` | Backend has no invite concept: creates an ACTIVE account with a temporary password (returned user maps to "active"; no invite state) |
| Disable / enable | `POST /api/users/:id/deactivate` / `/activate` | ✅ `admin.setUserStatus(id, "disabled"/"active")` | |
| Remove user | (deactivate is the closest) | ✅ `admin.removeUser()` → deactivate | |
| Edit user | `PATCH /api/users/:id` | ◐ client exists (`api.users.update`) | |
| Roles | — (no role entity; permission matrix is frontend config) | ⛔ mock | |
| Settings | `GET/PUT /api/options/:key` | ◐ client exists (`api.options.get/put`) | Registered keys live in `backend/src/config/options.ts`; portal SiteSettings has no matching key yet — sync/pending counts could map to existing keys later |
| Master data / species / audit logs | — | ⛔ mock | |

### Global / shell
| Portal need | Backend endpoint | Status | Notes |
|---|---|---|---|
| Notifications | — (SOS/alerts feed exists) | ◐ `api.alerts.list` client exists; UI wiring pending | `GET /api/alerts` merges SOS + tamper + coverage events |
| Global search | — | ⛔ mock | |
| Sync status (optional shell widget) | `GET /api/sync/status`, `/logs` | ◐ client exists | |
| SOS contacts | `GET /api/sos/contacts` | ◐ client exists | |
| Devices | `GET/POST/PATCH /api/devices` | ◐ client exists | |
| Health | `GET /api/health` | ✅ client exists; may power a connection banner later | |

## 2. Backend endpoint coverage summary (audit output)

17 routers under `/api` — full surface is typed in `web/lib/api.ts`:

`auth` (register/login/refresh/logout/me/password) · `users` (list/update/activate/deactivate)
`patrols` (create/list/get/points/start/complete) · `telemetry` (9 ingest topics + aggregates)
`incidents` (create/list/get/verify/resolve/reject/photo-upload) · `sync` (upload/changes/status/logs)
`sos` + `alerts` (SOS create, contacts, admin alert feed) · `gis` (beats/compartments/assets)
`map` (beats/compartment/route/asset CRUD + import) · `forests` (CRUD + boundaries/grids)
`devices` (register/list/update) · `options` (admin-overridable config) · `uploads` (generic files)
`health` (DB probe)

## 3. Decisions & conventions

1. **Fallback policy**: backend-first with mock fallback on network failure or
   401 only. This keeps the portal fully browsable in demo mode and lets real
   data appear as soon as the backend is reachable — no config flip required.
2. **Shared projection**: GeoJSON beats/compartments are projected into the
   mock map's 1000×700 SVG space with a layer-wide bbox, so the whole dataset
   keeps true relative positions and overlays markers/routes drawn in that space.
3. **Zero-patrol zones**: when the backend supplies coverage, `coverage < 70`
   flags the beat (`isZeroPatrol`); mock beats keep their explicit flags.
   Both render through one code path (`beatIsZero` in `gis/page.tsx`,
   `isZero` in `map.tsx`).
4. **Empty list semantics**: beats fall back to the mock grid when the backend
   table is empty (beats are a basemap, absence is a setup gap, not data).
   Lists of records (observations, patrols, users) do NOT fall back on empty —
   an empty response is treated as real data.
5. **No backend edits** in this branch — merge safety for other branches.

## 4. Running it

```bash
# terminal 1 — backend (Postgres + PostGIS required)
cd backend && npm run dev        # http://localhost:3000

# terminal 2 — admin portal
cd web && npm run dev            # http://localhost:3001 (3000 taken by API)
```

Custom API base: create `web/.env.local` with `NEXT_PUBLIC_API_URL=http://host:port`.
Seed note: `beats`/`compartments` must be imported via `POST /api/map/beats/import`
(or the GIS tables seeded) before the map shows real polygons; empty tables
fall back to the mock grid.

## 5. Known risks / next steps

- Admin web has no login screen yet — tokens are consumed via `auth.login`
  programmatically; a login page + `ProfileMenu` wiring (me/change-password/
  sign-out with real backend) is the highest-value next step.
- Authorizations (permissions module) have no backend entity — needs a new
  endpoint group (`/api/authorizations`) for full-stack CRUD + history.
- `patrols.reports` needs a backend aggregation endpoint (patrols × incidents).
- Live map markers should be derived from backend data (rangers by duty status,
  incidents with coordinates, SOS entries) instead of `gisMarkers` mock.
- Ranger profiles could be served by extending the `User` API (cader/designation)
  or a dedicated `/api/rangers` resource.