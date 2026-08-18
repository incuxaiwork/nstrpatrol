# NSTR Patrol — Admin Web Portal API Endpoint Audit

**Scope:** `web/` (Next.js App Router), API client surface (`web/lib/api.ts`), service consumption (`web/lib/services.ts`), portal-served route handlers, and their backend counterparts (`backend/src/routes/*`).
**Backend mount:** `/api` (Express). **Base URL:** `NEXT_PUBLIC_API_URL` (default `http://localhost:3000`).

**Tiers:** `A` = actively consumed by the web UI · `B` = defined in the web client but not wired to any screen · `C` = backend-only (mobile/tooling-owned, no web client wrapper)
**Source markers:** `▲` backend source confirmed · `▪` web-served (Next route, no backend) · `✖` no backend source found

| Serial | Tier | Module | Method | API endpoint | Purpose | Backend source | Remarks |
|-------:|:---:|--------|--------|--------------|---------|----------------|---------|
| 1 | A | GIS Intelligence | GET | `/api/tiles/{z}/{x}/{y}` | Raster PNG tiles from the NSTR MBTiles atlas for the MapLibre GL basemap (browsers can't read SQLite MBTiles) | `▪` web route `web/app/api/tiles/[z]/[x]/[y]/route.ts`; data source = backend `GET /api/gis/assets/NSTR.mbtiles` (downloaded once → `web/.data`) | XYZ→TMS Y-flip (mirrors Android `MbtilesServer.kt`); z 0–16; 400 invalid coords, 404 missing tile, 503 atlas unavailable; `Cache-Control: max-age=86400` |
| 2 | A | Auth & Session | POST | `/api/auth/login` | Admin sign-in; returns `{accessToken, refreshToken, user}` | `▲` `auth.ts:61` | Body `{email, password}`; `auth:false`; tokens persisted in localStorage (`nstr.auth.*`) |
| 3 | A | Auth & Session | POST | `/api/auth/logout` | Ends the session / invalidates the token | `▲` `auth.ts:104` | Fired from the shell sign-out flow |
| 4 | A | Auth & Session | GET | `/api/auth/me` | Current authenticated user profile (`ApiUser`) | `▲` `auth.ts:112` | Hydrates app store / `hasSession()` |
| 5 | A | Auth & Session | PATCH | `/api/auth/password` | Change own password | `▲` `auth.ts:125` | Body `{currentPassword, newPassword}` |
| 6 | A | Admin — Users | POST | `/api/auth/register` | Create a new user (ranger/admin) from the portal | `▲` `auth.ts:25` | Reused by `services.admin.createUser`; body `{email,password,fullName,role?,cader?,phone?}`; `auth:false` |
| 7 | A | Patrol Operations | GET | `/api/patrols` | List patrols (dashboard, `/patrols`, `/patrols/all`, `/patrols/history`) | `▲` `patrols.ts:28/55` | Query `{mine?, status?, forestId?}`; adapted via `patrolFromApi`; strict remote — no mock fallback |
| 8 | A | Patrol Operations | GET | `/api/patrols/:id` | Patrol detail + stats `{points, distanceKm, durationSeconds}` | `▲` `patrols.ts:75` | Used by `/patrols/[id]` and `/patrols/[id]/replay` |
| 9 | A | Observations | GET | `/api/incidents` | List observations/incidents | `▲` `incidents.ts:33/66` | Query `{mine?, status?, type?, from?, to?}`; reshaped via `observationFromApi`; strict remote |
| 10 | A | Observations | GET | `/api/incidents/:id` | Observation/incident detail (photos, reporter) | `▲` `incidents.ts:87` | Used by `/observations/[id]` |
| 11 | A | Observations | POST | `/api/incidents/:id/verify` | Mark an observation verified | `▲` `incidents.ts:96` | Triggered by observation status change in the portal |
| 12 | A | Observations | POST | `/api/incidents/:id/resolve` | Resolve an observation | `▲` `incidents.ts:108` | Body `{resolutionNote?}` |
| 13 | A | GIS Intelligence | GET | `/api/gis/beats` | Beat boundaries as GeoJSON (props `OBJECTID_1`, `Beat`, `Section`, `Range`, `Division`, `Circle`, `District`, `Area_ha`) | `▲` `gis.ts:12` | `auth:false`; → `beatsFromGeoJson` (SVG viewBox 1000×700); strict remote; feeds `/gis` map, dashboard overview. **No coverage props** (`Coverage_pct`/`isZeroPatrol` absent) → `coveragePct` stays `null`, zero-patrol board empty until the backend supplies coverage |
| 14 | A | GIS Intelligence | GET | `/api/gis/compartments` | Compartment boundaries as GeoJSON (props `COMP_NO`, `BEAT`, `AREA_HA`) | `▲` `gis.ts:50` | `auth:false`; → `compartmentsFromGeoJson`; shares `unionExtent` projection with beats so both layers align; strict remote |
| 15 | A | GIS Intelligence | GET | `/api/gis/assets` | Map asset catalog (MBTiles atlases, versioned) | `▲` `gis.ts:87` | `auth:false`; shown in `/gis` "Map assets" card |
| 16 | A | GIS Intelligence | GET | `/api/gis/assets/:resourceKey` | Download raw asset (e.g. `NSTR.mbtiles`) | `▲` `gis.ts:108` | `auth:false`; also the tile proxy's atlas source (#1) |
| 17 | A | Admin — Users | GET | `/api/users` | List portal users | `▲` `users.ts:20` | Query `{role?, q?}`; → `adminUserFromApi`; `/admin/users` |
| 18 | A | Admin — Users | POST | `/api/users/:id/activate` | Re-enable a disabled user | `▲` `users.ts:77` | `setUserStatus` in `/admin/users` |
| 19 | A | Admin — Users | POST | `/api/users/:id/deactivate` | Disable a user | `▲` `users.ts:72` | `setUserStatus` in `/admin/users` |
| 20 | B | Auth & Session | POST | `/api/auth/refresh` | Rotate the JWT pair on expiry | `▲` `auth.ts:86` | Internal: called by `request()` on 401 with one retry; not a page action |
| 21 | B | Admin — Users | PATCH | `/api/users/:id` | Update user profile/role/cader/phone/password | `▲` `users.ts:48` | Defined in `api.users.update`; no screen uses it |
| 22 | B | Patrol Operations | GET | `/api/patrols/:id/points` | GPS trace points `{lat,lng,altitude?,speed?,t}` | `▲` `patrols.ts:114` | Real GPS traces feed both `/patrols/[id]/replay` and the `/gis` route overlay |
| 23 | B | Patrol Operations | POST | `/api/patrols/:id/start` | Start a patrol recording | `▲` `patrols.ts:143` | Mobile-owned; web client stub |
| 24 | B | Patrol Operations | POST | `/api/patrols/:id/complete` | Complete a patrol | `▲` `patrols.ts:161` | Mobile-owned; web client stub |
| 25 | B | Observations | POST | `/api/incidents` | Create an incident | `▲` `incidents.ts:66` | Mobile-owned; web client stub |
| 26 | B | Observations | POST | `/api/incidents/:id/reject` | Reject an incident with note | `▲` `incidents.ts:116` | Client surface only; UI exposes verify/resolve only |
| 27 | B | Map / GIS admin | GET | `/api/map/assets` | Asset catalog under the admin map namespace | `▲` `map.ts:446` | Defined, unused by UI |
| 28 | B | Map / GIS admin | GET | `/api/map/assets/:resourceKey/meta` | Asset metadata (version, size, sha256) | `▲` `map.ts:451` | Defined, unused by UI |
| 29 | B | Analytics / Settings | GET | `/api/options/:key` | Read a runtime option (`ApiOption` list/value) | `▲` `options.ts:16` | Client exists; analytics page currently uses local mocks |
| 30 | B | Analytics / Settings | PUT | `/api/options/:key` | Update a runtime option | `▲` `options.ts:33` | Defined, unused |
| 31 | B | Telemetry | POST | `/api/telemetry/patrol/:id/aggregates` | Patrol aggregates (points, km, moving time, grids touched) | `▲` `telemetry.ts:153` | Defined, unused |
| 32 | B | Sync | GET | `/api/sync/status` | Device sync status (`lastSyncAt`, `pending` counts) | `▲` `sync.ts:146` | Defined, unused |
| 33 | B | Sync | GET | `/api/sync/logs` | Sync history log entries | `▲` `sync.ts:194` | Query `{limit?}`; defined, unused |
| 34 | B | SOS / Emergency | GET | `/api/sos/contacts` | Emergency (SOS) ranger contacts | `▲` `sos.ts:51` | Defined, unused |
| 35 | A | Platform — Alerts | GET | `/api/alerts` | SOS / tamper / coverage alert feed | `▲` `sos.ts:64` | `requireAdmin`; query `{since?, limit?}`; → `alertFromApi` → notification bell. Verified live: returns `[]` with no alert records yet (NO DATA, not a gap) |
| 36 | B | Devices | GET | `/api/devices` | List devices for a user | `▲` `devices.ts:21` | Query `{userId?}`; defined, unused |
| 37 | B | Forests | GET | `/api/forests` | Forest list (`name, code, _count.boundaries/grids`) | `▲` `forests.ts:25` | Defined, unused |
| 38 | B | Uploads | GET | `/api/uploads/:key` | Media/signed URL (returned as a string) | `▲` `uploads.ts:40` | `uploads.urlFor(key)` builds the link only; no fetch |
| 39 | B | Platform — Health | GET | `/api/health` | Backend health + DB status `{status, database}` | `▲` `health.ts:6` | `auth:false`; unused in UI currently |
| 40 | C | Map / GIS admin | GET/POST | `/api/map/beats` · `/api/map/beats/:id` · `/api/map/beats/import` | Beat CRUD (list/create/update/delete) + GeoJSON import (replace-by-name) | `▲` `map.ts:69–182` | Import body `{features: GeoJSON}`; admin/tooling only; no web wrapper |
| 41 | C | Map / GIS admin | GET/POST | `/api/map/compartments` · `/:id` · `/import` | Compartment CRUD + import (links to beats) | `▲` `map.ts:217–328` | `beatId` filter on list; admin-only mutations; no web wrapper |
| 42 | C | Map / GIS admin | GET/POST | `/api/map/routes` · `/api/map/routes/:id` | Patrol route admin (CRUD) | `▲` `map.ts:369–428` | No web wrapper |
| 43 | C | Map / GIS admin | POST/DELETE | `/api/map/assets` · `/api/map/assets/:resourceKey` | Map asset upload/delete (versioned) | `▲` `map.ts:459–511` | No web wrapper |
| 44 | C | Forests | GET/POST | `/api/forests/:id/boundaries` · `/boundaries/:boundaryId` · `/:id/grids` · `/grids/:gridId` | Forest boundary & grid admin (CRUD) | `▲` `forests.ts:57–164` | No web wrapper |
| 45 | C | Sync | POST / GET | `/api/sync/upload` · `/api/sync/changes` | Mobile device sync (upload local changes, pull changes) | `▲` `sync.ts:42/111` | Android-app owned |
| 46 | C | SOS | POST | `/api/sos` · `/api/sos/:id` | SOS creation/handling (details, contacts) | `▲` `sos.ts:20/64` | Android-app owned |
| 47 | C | Uploads | POST/DELETE | `/api/uploads` · `/api/uploads/:key` | Upload management | `▲` `uploads.ts:16/31` | Android-app owned |
| 48 | C | Observations | POST | `/api/incidents/:id/photo-upload` | Incident photo upload | `▲` `incidents.ts:126` | Android-app owned |

---

## Summary

- **A — Live:** 20 endpoints (auth 5, patrols 2, observations 4, GIS 5 incl. web tile proxy, admin users 3, alerts 1)
- **B — Client-defined, unwired:** 19 endpoints (no orphans — `/api/alerts` verified live, see row 35)
- **C — Backend-only:** 9 endpoint groups (mobile / GIS import tooling)
- **Architecture rule:** UI talks only to `lib/services.ts`. Since pass 2, operational functions are **strict remote** (`remoteOnly`): any transport/401/404/≥500 failure surfaces as an error state — no silent mock fallback. `lib/mock/*` remains only for documented **API GAP** surfaces (roles/permissions, audit logs, settings, master data, notification templates, beat-coverage analytics, special-permission flows, GIS heat, monthly aggregates)
- **Runtime-verified (pass 3):** live backend on `:3000` + seeded DB — login (200/401/403), rangers (2), patrols (0 — none recorded yet), incidents (0), alerts (0), GIS beats 44 / compartments 240→231 mapped / boundary 1 / grids 501 / assets 1; hierarchy tree 1 division · 7 ranges · 44 beats · 226 compartments; strict 401 propagation confirmed
- **Tile proxy coupling:** `/api/tiles/*` hard-depends on `GET /api/gis/assets/NSTR.mbtiles`; 503 until the atlas is cached (`web/.data`)
- **Alignment guarantee:** beats & compartments project through one shared extent (`unionExtent`, backend-adapters.ts) so boundary layers align in the SVG viewBox