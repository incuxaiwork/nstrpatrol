# Real Map Integration Plan — Web Admin Portal

Status: plan (no code written yet) · Branch: `Veera---Admin-Web` · Date: 2026-08-13

Companion to `docs/admin-web-api-mapping.md`. This plan replaces the portal's
inline-SVG mock renderer with a real raster+GeoJSON map engine on the same
data pipeline the Android app already uses (MapLibre + backend GeoJSON +
backend MBTiles atlas), then wires every map touchpoint of the admin portal
to it.

## 1. Current state recap

| Component | Today |
|---|---|
| Mobile app | MapLibre Android SDK 11.8.0 — embedded `MbtilesServer` (SQLite MBTiles → `127.0.0.1:8888/tiles/{z}/{x}/{y}.png`), raster offline basemap, Esri online satellite, GeoJSON layers for beats (fill/outline/labels), compartments (fill/outline), incidents (circles/labels), patrol track (line/dots). Data: `GET /api/gis/beats`, `GET /api/gis/compartments`, `GET /api/gis/assets/NSTR.mbtiles`; fallbacks bundled assets → cache → backend. |
| Backend | `/api/gis` serves GeoJSON FeatureCollections (`/beats`, `/compartments`) + asset metadata/blob (`/assets`, `/assets/:resourceKey`, ETag=sha256, immutable). `/api/map` is admin CRUD/import for beats/compartments/routes/assets. `npm run import:gis` seeded 44 beats, 448 compartments, 18 MB `NSTR.mbtiles` into PostGIS. |
| Web portal | Custom inline-SVG renderer (viewBox 1000×700) with mock beats/routes/markers; `gis.beats()` fetches backend GeoJSON and projects it into the SVG box (no lib, no tiles, no pan/zoom beyond transform, no click hit-testing beyond id matching). |

## 2. Direction

Same map engine family, same data, per surface:

- **Mobile**: MapLibre GL (Android SDK 11.8.0).
- **Web**: MapLibre GL JS (v5.x, Apache-2.0) — identical renderer semantics, no Mapbox token needed, works with raster tiles + GeoJSON sources exactly like the app.
- **Backend**: unchanged — already the canonical source for basemap tiles + GIS vectors.

## 3. Implementation plan (phases)

### Phase 0 — Prerequisites (backend, no changes)
- Atlas must be reachable: `GET /api/gis/assets/NSTR.mbtiles` (BTYE blob download) — already served.
- Optional correctness fix: in `backend/src/routes/map.ts` `guessContentType()`, `.mbtiles` currently maps to `application/vnd.mapbox-vector-tile` but the atlas is a raster-png MBTiles file; correct guess = `application/vnd.sqlite3` (or octet-stream). Small, low-risk fix to propose.

### Phase 1 — Add MapLibre GL JS to the portal
- `web/` deps: `maplibre-gl` (^5). No keys/tokens required.
- New component `web/components/gl-map.tsx`:
  - Props: `beats?: GeoJSON`, `compartments?: GeoJSON`, `routes?: GeoJSON`, `markers?: GeoJSON`, `tileUrl?(z,x,y)` (default `API_BASE/api/gis/assets/NSTR.mbtiles` via a local tile proxy or MapLibre `tileUrlBuilder`), `onSelect(feature)`, `replayPatrolId`, `heightClass`, `layers` visibility.
  - Uses `maplibregl.Map` + `NavigationControl`, `ScaleControl`.
  - Sources/layers cloned from the mobile style (NSTR Offline Style mapping):
    - Raster offline basemap (MBTiles proxy) − toggleable
    - Esri satellite (optional, online) − toggleable
    - Beats fill `#1E4620` 0.12 + outline 2.8 + label `{Beat}` minZoom 9
    - Compartments fill `#E65100` 0.04 + outline 1.2
    - Zero-patrol beats: separate fill/line filter (`coverage < 70` / feature property) in red dashed
    - Authorization areas (from authorizations service, polygon) — dashed outline source
    - Patrol routes `LineLayer` + `CircleLayer`
    - Markers (rangers/observations/incidents/SOS) `CircleLayer`/`SymbolLayer` + `queryRenderedFeatures` click → `onSelect` popup
    - Patrol replay: animate a point along the route (reuse existing timed-point logic)
  - Keep the existing `MapWorkspace` name/API as the component boundary? Recommendation: introduce `GLMapWorkspace` and swap usage in the GIS page behind `liveBeats`-style data props; keep `MapWorkspace` for small overview previews (`/observations/[id]`, `AuthAreaMap`) until Phase 3.

### Phase 1b — MBTiles serving for the browser
- MBTiles is SQLite; browsers cannot read it directly. Options:
  1. **`tile-http-server` npm package** (component of MapLibre ecosystem) — served as a Next.js route handler `app/api/tiles/[z]/[x]/[y]/route.ts` that reads the MBTiles from a local file (or from the backend blob downloaded/cached to `web/.data/NSTR.mbtiles`) and streams PNG tiles with TMS Y-flip, mirroring `MbtilesServer.kt`.
  2. Backend-proxied: add `/api/gis/tiles/{z}/{x}/{y}.png` on the backend (small change to `gis.ts`) so both mobile and web can later drop the embedded server.
- Recommendation: option 1 (web-only, zero backend changes, matches "no conflicts" rule); record option 2 as backlog for the backend team.

### Phase 2 — Data wiring (mostly done from the API-mapping work)
- `gis.beats()` / `gis.compartments()` already fetch backend GeoJSON → feed the GeoJSON sources directly (no SVG projection needed anymore).
- `gis.assets()` already lists catalog → "Download atlas" button + auto-refresh of the cached MBTiles file when `version`/`sha256` changes.
- Add `gis.routes()` remote: `GET /api/map/routes` (LineString GeoJSON) with fallback to mock `gisRoutes`.
- Add markers from real data (backlog MVP alternative: keep mock markers as a layer until incidents/rangers endpoints are wired):
  - Incidents markers → `GET /api/incidents` (lat/lng) — available now.
  - Ranger markers → needs a duty-status API (gap; phase 4).
- Zero-patrol zones → compute from beats coverage (already in adapter).

### Phase 3 — Replace portal map surfaces
1. `app/gis/page.tsx` — full workspace on `GLMapWorkspace` (layers control, zero-patrol board, route playback, detail card on `queryRenderedFeatures` click).
2. `app/patrols/[id]/replay/page.tsx` — replay on the GL map: route polyline from `GET /api/patrols/:id/points` (lat/lng GeoJSON), playback slider/seek reuses existing `seekSignal`/progress plumbing.
3. `app/rangers/[id]/page.tsx` + `app/patrols/[id]/page.tsx` overview m maps → static `GLMapWorkspace` (no interaction bar).
4. `components/jurisdiction.tsx` `AuthAreaMap` — render authorization polygons over real beats.
5. `app/observations/[id]/page.tsx` location preview → map with incident point.

### Phase 4 — Remaining data gaps (backend additions needed, separate branch)
- Ranger positions/live markers: new endpoint (e.g. `GET /api/gis/live` aggregating device/telemetry) or reuse `/api/telemetry` latest point per active patrol.
- Heat layer: derive from coverage-events per beat (`GET /api/sync` aggregates or new `/api/gis/heat`).
- Offline tiles for the admin console (rarely needed): optional Electron/PWA caching via the same MBTiles route.

## 4. Risks & notes
- MapLibre GL JS v5 + React 19: use `maplibre-gl` directly in a client component (`"use client"`), init in `useEffect`, destroy on unmount; no wrapper lib needed (fewer deps).
- Next 16: do not SSR the map — always client component; tiles endpoint must be under `app/**/route.ts` (static handler reads file; acceptable in dev/prod).
- MBTiles file serving: the 18 MB blob downloads once to `web/.data/`; re-download only when `sha256`/`version` changes (ETag check).
- Raster tiles are PNG (256 px) — crisp enough at forest-scale zoom (≤ level 14 per `MbtilesServer`).
- Mobile compatibility: geometry/property shapes are identical (`mark_beat.json` schema) → same GeoJSON feeds both clients with the same styles, so visual parity is achievable.
- Conflicts: phases 1–3 touch only `web/` + this doc (backend fix in Phase 0 is optional & isolated).

## 5. Definition of done
- GIS workspace renders real beats/compartments over the offline raster atlas with layer toggles and click-detail.
- Replay/overview/jurisdiction/location maps render on the same engine.
- `npm run lint` + `tsc --noEmit` + `npm run build` green; mock fallbacks intact when backend is down.