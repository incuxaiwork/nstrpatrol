# NSTR Patrol — Mobile App Implementation Status

Tracking document for the Android (Kotlin + Jetpack Compose) app under `mobile/`.
Use it to record what is done, what is pending, and what has been replaced, grouped
by functionality and screen. Each screen is covered from its navigation flow to its
data source and API wiring.

---

## Status legend

- `[x]` — **Completed** (implemented, builds, verified on emulator)
- `[ ]` — **Pending** (not started / to do)
- `[~]` — **Replaced / reverted** (superseded by another approach; keep for history)

## How to add / update tasks

1. Pick the section that matches the functionality (or add a new one).
2. Mark each line with the appropriate status marker.
3. When a task is replaced by a better approach, mark the old one `[~]` and add a
   `[x]` line for the replacement, noting what replaced it.
4. At the end, append new work items under **Backlog & next tasks** with a date.

---

## 1. Build & project setup

- `[x]` Android app module (`app/`) with `com.nstrpatrol.app` namespace.
- `[x]` minSdk 24, targetSdk 36, compileSdk 37, Java 17, Kotlin 2.2.10.
- `[x]` Jetpack Compose BOM 2026.02.01 + Material3.
- `[x]` `./gradlew :app:assembleDebug` builds successfully.
- `[x]` Debug APK produced at `app/build/outputs/apk/debug/app-debug.apk`.
- `[x]` `material-icons-core` 1.7.8 (pinned, BOM does not expose it).
- `[x]` `material-icons-extended` 1.7.8 added for full icon set.
- `[x]` App installs and runs on Pixel 10 emulator (API 36).
- `[ ]` Release build (`assembleRelease`) verified.
- `[ ]` Automated unit/instrumentation tests for screens and navigation.

## 2. Design system & theme

- `[x]` Palette in `ui/theme/Color.kt` from Penpot design (ForestGreen #1E4620, Background #F8F9FA, Surface #FFFFFF, TextPrimary #212121, TextSecondary #757575, severity/status colors, etc.).
- `[x]` Typography in `ui/theme/Type.kt` (custom semantics: titleLarge/titleMedium headers, bodyLarge field values, etc.).
- `[x]` Light color scheme in `ui/theme/Theme.kt` (`NstrpatrolTheme`).
- `[x]` Edge-to-edge support with `safeDrawingPadding()` — content clears status bar, punch-hole camera, and bottom gesture bar on all screens.

## 3. Icons

- `[x]` Bottom nav: Home / Maps / Patrol(list) / Reports / Settings.
- `[x]` Reports bottom-nav tab uses warning/danger icon (`Icons.Filled.Warning`).
  - `[~]` Previously the Reports tab used a pencil (`Icons.Filled.Create`) — replaced per request.
- `[x]` Reports category cards use Material icons: Person (Human Impact), Pets (Animal Mortality), Visibility (Sightings), WaterDrop (Water Source).
  - `[~]` Previously used hand-drawn vectors `NstrIcons.Camera/Tracks/WaterDrop` — replaced with `material-icons-extended` glyphs.
- `[x]` Photo placeholders use `Icons.Filled.PhotoCamera`.
  - `[~]` Previously used hand-drawn `NstrIcons.Camera` — replaced.
- `[x]` Stepper uses text glyphs "−" and "+".
  - `[~]` Previously used `Icons.Filled.Remove/Add` — `Remove` does not exist in icons-core, so swapped to text glyphs.
- `[x]` `NstrIcons.Paw` (brand logo) kept on the Login screen.
  - `[~]` `NstrIcons.Camera` vector removed (unused after icon swap).

## 4. Shared UI components

- `[x]` `NstrAppBar` — title + subtitle + optional avatar / back button.
- `[x]` `NstrBottomBar` — 5 slots, active-tab underline.
- `[x]` `NstrScaffold` — app bar + scrollable content + optional bottom nav.
- `[x]` Buttons: `PrimaryButton`, `SecondaryButton`, `DangerButton`, `TextButton`.
- `[x]` Form controls: `SectionHeader`, `FieldLabel` (+required `*`), `SelectField`, `PhotoPlaceholder`, `RemarksField`, `SegmentedControl`, `RadioRow`, `Stepper`.
- `[x]` `OptionSheet` / `FormSheet` — modal bottom-sheet pickers with option lists.
- `[x]` All cards & chips have a 1dp outline border (`OutlineCard` #DADCE0) for visibility.
- `[x]` Photo placeholders use a **dotted** border (drawn with `PathEffect.dashPathEffect`) instead of solid.
- `[x]` Typed text in inputs renders black (TextPrimary #212121), green cursor, grey placeholder.
- `[x]` Password fields include a show/hide eye toggle (`Visibility` / `VisibilityOff`).

## 5. Navigation

- `[x]` Sealed `Route` set (14 routes) in `ui/navigation/NstrNav.kt`.
- `[x]` `BottomTab` enum (5 tabs) mapped to tab-root routes.
- `[x]` `NstrNavState` — back-stack navigator: `navigateTo`, `selectTab`, `popBack`, `resetTo`.
- `[x]` System back button handling via `BackHandler`.
- `[x]` Login → Dashboard flow.
- `[ ]` Deep-link / route arguments (e.g., passing selected patrol ID) — not needed yet.

## 6. Data layer

**Architecture: offline-first.** SQLite (Room) is the app's **primary storage** for all
collected data (patrols, points, sensor readings, incidents/reports, logs). Everything is
written locally first; Postgres is only the **sync target** — records are uploaded to the
backend when internet is available (and the backend's Postgres/PostGIS is the server-side
store + map/grid source).

- `[x]` Mock data in `data/MockData.kt`: `Options` (all picker option lists), `Patrols.list`, `LogsData.entries`, `Contacts.list`, `AutoDetails`, `SettingsData`.
- `[x]` Mock `LocalDataSource` / repository layer used by screens.
- `[ ]` Room database — entities mirror the Postgres models (Patrol, PatrolPoint, SensorReading, Incident, SyncQueue), each row carries a sync state (PENDING / SYNCED / FAILED).
- `[x]` Minimal HTTP client (`data/map/BackendApiClient.kt`, built-in `HttpURLConnection`, no extra deps) + `INTERNET` permission + configurable `API_BASE_URL` (BuildConfig field, default `http://10.0.2.2:3000`, override `-PapiBaseUrl=...`). Currently used for **reference-data download** (map/grid GeoJSON + MBTiles atlas).
- `[ ]` Full API client (Retrofit/Ktor) for the sync worker — not built yet.
- `[ ]` Sync worker (WorkManager): upload PENDING rows to Postgres when online, mark SYNCED, pull changes down.
- `[x]` **Map/grid reference data downloaded from the backend & cached locally** (offline-first): beats + compartments GeoJSON cached in `filesDir/gis/`, MBTiles atlas cached in `filesDir/NSTR.mbtiles`; bundled assets kept as last-resort fallback (see 10.4).
- `[ ]` Pickers/option lists (backend-owned) downloaded & cached locally.

---

## 7. Screen-by-screen status

> Each screen: **flow** (how it is reached) · **UI** (what is rendered) ·
> **data** (source) · **API** (backend wiring) · **working** (verified).

### 7.1 Login
- Flow: initial route; `Login` button → Dashboard; `LOG OUT` resets back here.
- UI: brand logo (paw), title, email + password fields (password has show/hide eye toggle), Login button ("Signing in…" while in flight, inline error text on failure), "For official use only".
- Data: **real backend auth** via `AuthSession.login()` → `POST /api/auth/login`; access/refresh tokens + user profile persisted in SharedPreferences (`nstr_auth`) and restored on app start.
- API: `[x]` `POST /api/auth/login` wired; device auto-registered via `POST /api/devices` on login; errors surface the backend message (e.g. "Invalid email or password").
- Working: `[x]` verified on device (Moto G45 5G) with `admin@nstr.local` / `password123`; session survives app restart.

### 7.2 Dashboard (Home tab)
- Flow: tab root / after login.
- UI: large title + **real user greeting/avatar** (first name + initial from `AuthUser`), **assigned-patrol banner (real patrol name from backend, or "No assigned patrol")**, stat cards (distance, duration), Logs & alerts card, quick actions (Start Patrol, Sync Queue, SOS, Quick Capture, 2× future).
- Data: user profile from the auth session; **Patrol duration stat → live `PatrolTimer` count-up (10.3)**; **time-tamper warning banner when `TrustedTimeManager.tamperDetected` (10.3)**; assigned patrol from `GET /api/patrols?assignedTo=me` (best-effort, picks first ACTIVE/ASSIGNED).
- API: `[x]` `GET /api/patrols?assignedTo=me` wired for the assigned-patrol banner.
- Working: `[x]` quick actions navigate correctly; SOS opens SOS screen.

### 7.3 Maps (Maps tab)
- Flow: tab root.
- UI: **MapLibre GL** map with (a) raster basemap served by the embedded `MbtilesServer` (`http://127.0.0.1:8888/tiles/{z}/{x}/{y}.png`), (b) beat polygons (fill + outline + labels), (c) compartment boundaries (outline), (d) layer-toggle dialog (Beats / Compartments / Incidents / MBTiles), "Offline Map (MBTiles)" chip, beat search/selection. **Full-screen mode** (mini + full-screen dual-map reference, expand/collapse), 12 live sighting/incident markers, multi-touch gestures (from the ali PR).
- Data: map/grid GeoJSON + MBTiles atlas fetched from the backend API, cached locally, with bundled assets as offline fallback (see 10.4); sighting/incident markers seeded locally (`seedIncidents()`).
- API: `[x]` `GET /api/gis/beats`, `GET /api/gis/compartments` (GeoJSON), `GET /api/gis/assets/NSTR.mbtiles` (atlas download) — wired.
- Working: `[x]` renders basemap + beat/compartment overlays; layer toggles verified; full-screen + markers from merged ali branch build clean.

### 7.4 All Patrols (Patrol tab)
- Flow: tab root.
- UI: filter chips (with counts), patrol cards with status chips (In Progress / Completed / Scheduled), progress bars parsed from `Target: (X%)`.
- Data: `Patrols.list` (mock).
- API: `[ ]` none — needs patrol list/filter endpoint.
- Working: `[x]` filtering + card rendering verified.

### 7.5 Logs
- Flow: Dashboard → "Logs & alerts".
- UI: stat chips (Total logs 124, Open alerts 3, Synced 98%), recent-activity list with level dots.
- Data: `LogsData.entries` (mock); **prepends an `alert` entry when time tampering is detected (10.3)**.
- API: `[ ]` none — needs logs/alerts endpoint + sync status.
- Working: `[x]` renders; entry taps not wired.

### 7.6 Patrol Start
- Flow: Dashboard → "Start Patrol".
- UI: patrol-type selector, member name, team leader, designation display, member-count stepper, photo placeholder, save button.
- Data: `Options` (mock picker lists), local form state; **photo slot via CameraX (10.1); SAVE DETAILS starts `PatrolTimer` with trusted start (10.3)**.
- API: `[ ]` none — needs patrol create endpoint.
- Working: `[x]` form renders, pickers open; `Save` pops back (not persisted).

### 7.7 Reports (list/new report)
- Flow: tab root; category cards navigate to the 4 category forms.
- UI: **category grid only** (4 filled Material-icon cards + 2 empty placeholders). The full report composition (severity selector, description, add-photo, auto-captured details card, Save Draft + Submit Report) lives on each category form page (7.8–7.11).
- Data: local state; **photo slot via CameraX (10.1)**; `AutoDetails` (mock) on the category forms.
- API: `[ ]` none — needs report create + auto-capture endpoint.
- Working: `[x]` category navigation verified.
- `[ ]` **Reported Incidents section** — below the category grid, list incidents this ranger has reported previously (type, date, severity/status); tap → incident detail view. Needs a Penpot screen design + a data source (mock until Room/sync exists).

### 7.8 Human Impact form
- Flow: Reports → "Human Impact".
- UI: photo placeholder, Human Impact Type (required), Action Taken (required), Time Elapsed (optional), remarks; sheet pickers.
- Data: `Options` lists; **photo slot via CameraX (10.1)**.
- API: `[ ]` none.
- Working: `[x]` renders; required markers shown.

### 7.9 Animal Mortality form
- Flow: Reports → "Animal Mortality".
- UI: photo placeholder, sex segmented control, count steppers (Adult / Sub-adult / Young male & female), remarks.
- Data: `Options` lists; steppers local state; **photo slot via CameraX (10.1)**.
- API: `[ ]` none.
- Working: `[x]` steppers + segmented control render.

### 7.10 Sighting form (Direct & Indirect)
- Flow: Reports → "Sightings".
- UI: photo placeholder, sighting fields + pickers.
- Data: `Options` lists; **photo slot via CameraX (10.1)**.
- API: `[ ]` none.
- Working: `[x]` renders.

### 7.11 Water Source form
- Flow: Reports → "Water Source".
- UI: photo placeholder, radio rows (Yes/No) + 7 selectors (Dry, Percent Filled, Quality, Unwanted Human Presence, Human Sign Observed, Animal Presence, Animal Sign Observed).
- Data: `Options` lists; **photo slot via CameraX (10.1)**.
- API: `[ ]` none.
- Working: `[x]` renders.

### 7.12 Quick Capture
- Flow: Dashboard → "Quick Capture".
- UI: photo placeholder, Sign Type selector, remarks, Save Details (no-op).
- Capturing: `[ ]` Implementing the device camera usage to capture and store images with GeoLocation + Timestamp (date + time) — see 10.1 (CameraX photo capture).
- Data: `Options` lists.
- API: `[ ]` none.
- Working: `[x]` renders.

### 7.13 SOS
- Flow: Dashboard → "SOS".
- UI: large red SOS circle (220dp) + "tap to send" hint, emergency contacts list (Control Room, Range Officer, Forest Guard).
- Data: `Contacts.list` (mock).
- API: `[ ]` none — needs SOS/alert endpoint + actual call/SMS actions.
- Working: `[x]` renders; **send is a no-op** (no actual alert).

### 7.14 Settings
- Flow: tab root.
- UI: profile section (**real user**: name, designation derived from role/cader, email, phone), general settings rows (Language, Sync Interval, Map Layer), LOG OUT (wired).
- Data: user profile from the auth session; `SettingsData` (mock) for general rows.
- API: `[x]` profile from the stored `AuthUser` (from `/api/auth/login` + `/api/auth/me`).
- Working: `[x]` logout clears auth session + returns to Login; profile shows the signed-in user.

---

## 8. Backend / API integration

Backend lives at repo root `backend/` (Express + Prisma + PostGIS). Per the offline-first
architecture, the mobile app is a SQLite-first client; the backend/Postgres is the sync
target + source for shared reference data (forests, grids, option lists). **Map reference
data is the first wired slice** — see 10.4 for the full data flow.

- `[x]` **Map reference data sync (GIS):** backend serves beats + compartments GeoJSON and the
  MBTiles atlas from PostGIS; mobile downloads & caches them (10.4). Backend ingestion via
  `npm run import:gis` (reads the former mobile assets → PostGIS tables).
- `[x]` **Auth (login + session):** `AuthSession` logs in via `POST /api/auth/login`, persists
  tokens + user in SharedPreferences, restores on app start, registers the device via
  `POST /api/devices`. `BackendApiClient` carries the bearer token on authenticated calls.
- `[ ]` Shared API contract (endpoints, DTOs, error format, sync semantics) for the remaining domains (patrols, incidents, sync).
- `[ ]` Room entities + sync-state columns; backend models already exist (Patrol, PatrolPoint, SensorReading, Incident, SyncLog).
- `[ ]` Reference-data download: forests, boundaries, grids, option lists → cached in SQLite.
- `[ ]` Sync worker: batch upload PENDING patrols/points/sensor readings/incidents to Postgres; mark SYNCED.
- `[ ]` Download of server-side changes (e.g. assigned patrols, incoming alerts) back into SQLite.
- `[ ]` SOS: send alert; wire real calls/SMS to contacts.
- `[ ]` Error/loading/empty states across screens.

---

## 9. API inventory needed (per screen / option)

> What kind of endpoints the mobile app needs. Grounded in the backend models
> (Prisma `backend/prisma/schema.prisma`): User, Device, Forest, ForestBoundary,
> ForestGrid, Patrol, PatrolPoint, SensorReading, Incident, SyncLog.
> Endpoints are described; the **GIS endpoints are implemented** (`GET /api/gis/*`,
> see 9.3/10.4), the rest remain to be built. Backend has `/health` + `/gis` today.
> "Auto" = captured on device (GPS/timestamp), no endpoint required.
>
> **Reading order matters:** the app writes to SQLite first; live CRUD endpoints are
> **not** used for data collection. Endpoints exist for (a) reference-data downloads,
> (b) one-time server-side actions (login, SOS), and (c) **batch sync upload/download**.
> Each screen's "read" below is a local SQLite query; "API" is only sync/reference.

### 9.1 Auth (Login 7.1, Settings 7.14)

- `[x]` `POST /api/auth/login` — body `{email, password}` → `{accessToken, refreshToken, user}` (User model). Wired via `AuthSession`.
- `[x]` `GET /api/auth/me` — current user profile (fullName, role, phone). Used by Settings profile + auto-details (available via `AuthSession`).
- `[ ]` `POST /api/auth/logout` — invalidate token (mobile currently clears the local session only; backend endpoint exists).
- `[x]` `POST /api/devices` — register device for push/sync (`deviceId`, `deviceName`, `deviceModel`; Device model) — auto-called on login.

### 9.2 Dashboard 7.2

- **Read (SQLite):** current patrol row (status ASSIGNED/ACTIVE), distance/duration/progress computed from
  local PatrolPoint + Incident rows. No live read endpoint.
- **Sync down:** assigned patrols pushed from server → `GET /api/patrols?assignedTo=me` (Patrol model) during sync.
- Quick actions "Sync Queue" → 9.10 sync; "SOS" → 9.9; "Quick Capture" → 9.8.

### 9.3 Maps 7.3

- **Reference (downloaded, cached locally — IMPLEMENTED):**
  - `[x]` `GET /api/gis/beats` — beat polygons + attributes (Beat/Section/Range/Division/Circle/District/Area_ha). Backend: PostGIS `Beat` table → `ST_AsGeoJSON`.
  - `[x]` `GET /api/gis/compartments` — compartment boundaries (Polygon + MultiPolygon). Backend: PostGIS `Compartment` table → `ST_AsGeoJSON`.
  - `[x]` `GET /api/gis/assets` — map-asset metadata list (resourceKey, sha256, version, sizeBytes).
  - `[x]` `GET /api/gis/assets/:resourceKey` — binary download (the `NSTR.mbtiles` raster atlas stored as a BYTEA blob in `MapAsset.data`; ETag = sha256, `X-Asset-Version`).
  - `[ ]` `GET /api/forests` + boundaries (Forest, ForestBoundary).
  - `[ ]` `GET /api/forests/:id/grids` — grid polygons + codes (ForestGrid).
- **Read (SQLite):** patrol route drawn from local PatrolPoint rows; sighting/incident markers from local Incident rows.
- Satellite/imagery tiles — external provider (Google Maps / MapLibre tiles), not our API.

### 9.4 All Patrols 7.4

- **Read (SQLite):** patrol list + status chips (Patrol table, PatrolStatus enum).
- **Sync down:** `GET /api/patrols?assignedTo=me` — server-assigned patrols into SQLite; local patrols are
  uploaded (9.10). No live list endpoint.

### 9.5 Logs 7.5

- **Read (SQLite):** recent incidents/activities + totals from the Incident table; synced % from sync-status column.
- **Sync down:** `GET /api/logs?since=<lastSyncId>` — server-side incidents/alerts not on the device.

### 9.6 Patrol Start 7.6

- **Write (SQLite):** `Save` inserts a Patrol row locally (status ACTIVE, startedAt=now) + any member/designation
  data. Marked PENDING → queued for sync. GPS fixes + sensor samples during the patrol also go to SQLite first.
- **Reference (downloaded):** `GET /api/users?role=RANGER` (member/team-leader pickers, User model),
  `GET /api/forests` (beat/forest picker).
- **Sync up (9.10):** the patrol row, its PatrolPoint fixes, and SensorReading rows.
- Photo upload for patrol — see 9.11.

### 9.7 Reports & category forms 7.7–7.11

Shared create path (Incident model), with a category-specific payload:

- **Write (SQLite):** "Save Draft" → Incident row with `status=DRAFT` (local only, never synced).
  "Submit Report" → Incident row `status=PENDING`, queued for sync.
  - Type per form: `HUMAN_IMPACT` / `ANIMAL_MORTALITY` / `SIGHTING` / `WATER_SOURCE` / quick capture.
  - Extra fields: mortality counts, cause of death, sign type, water-source answers, etc. (need a `details JSON`
    column or related table).
- **Reference (downloaded):** `GET /api/options/:key` — **one generic picker endpoint** for every option list
  used by forms & overlays, cached in SQLite, e.g.:
  - patrol-types, human-impact-types, action-taken, time-elapsed,
  - sex, species, cause-of-death, carcass-state, age-class,
  - sighting-types, sign-types (direct/indirect),
  - water-source types, dry/percent-filled/quality answers, presence answers,
  - languages, sync-interval, map-layer.
  - No model exists for these yet — needs a config/enum table or a constants endpoint.
- Auto-captured details (Reports 7.7) are **Auto**: GPS, timestamp, officer name, badge — filled from device +
  local profile (from `GET /api/auth/me` at login); beat = reverse-geocode of GPS against **downloaded**
  ForestGrid polygons (local query, no endpoint).
- **Sync up (9.10):** the Incident row + photo keys.

### 9.8 Quick Capture 7.12

- **Write (SQLite):** minimal report (sign type + photo + remarks) → Incident row, PENDING, queued for sync.
- **Reference (downloaded):** `GET /api/options/sign-types`.

### 9.9 SOS 7.13

- **Live (server-side action, not queued):** `POST /api/sos` — fire high-priority alert immediately
  (Incident or dedicated table) + trigger push notifications to contacts. Also stored locally.
- **Reference (downloaded):** `GET /api/sos/contacts` — emergency contacts (Control Room, Range Officer,
  Forest Guard) — config or User lookup.
- Real call/SMS to contacts — native `Intent`/`ACTION_CALL`/SMS on device, not an API.

### 9.10 Sync / offline (Logs, Dashboard, forms)

Core of the offline-first model:

- `POST /api/sync/upload` — batch upload of PENDING SQLite rows
  `{patrols[], patrolPoints[], sensorReadings[], incidents[], photos[]}` → backend writes to Postgres,
  replies with per-record `id` mapping + SyncLog (status SYNCED/FAILED). Client marks rows accordingly.
- `GET /api/sync/changes?since=<cursor>` — server-side changes (assigned patrols, alerts, reference data)
  to merge into SQLite; returns next cursor.
- `GET /api/sync/status` — last sync time + synced %.
- Triggered by WorkManager on connectivity; "Sync Queue" quick action triggers a manual run.
- Drafts (`status=DRAFT`) are local-only and never sent.

### 9.11 Photos

- Stored locally first (local file path on the Incident/patrol photo row); upload when syncing:
  `POST /api/uploads` — multipart photo upload → MinIO/S3 key; keys stored on Incident.photos (String[]).

## 10. On-device features — photo capture + trusted time (no DB)

Client-side features that can be built **before** any database/backend wiring. These are
the step-by-step features currently being implemented.

### 10.1 Photo capture (CameraX)

- `[x]` CameraX deps (camera-core / camera2 / lifecycle / view) + `CAMERA` permission in manifest.
- `[x]` `PhotoStore` (no DB) — saves captured photos to app-internal `filesDir/captures/`, keyed by form slot.
  - **Multi-photo per slot:** a slot holds a *list* of photos; `set(slot, files)` replaces, `add(slot, file)` appends; files named `{slot}_{epoch}.jpg`; `init()` re-hydrates the map from the captures dir on app start.
- `[x]` `PhotoUtils` — `decodeScaled(file, maxDim)` downscales and applies EXIF rotation/flip so captured photos render upright.
- `[x]` `CameraScreen` — full-screen CameraX `PreviewView`; runtime CAMERA permission; camera stays live after each shot.
  - **Multi-photo session:** thumbnail strip of the session's photos with per-photo remove; **back/front camera toggle** (`FlipCameraAndroid`); target rotation set from the display (correct EXIF orientation); **Done** writes all session photos to the slot and pops back (closing discards the session).
- `[x]` `Route.Camera` added to navigation + wired in `MainActivity`.
- `[x]` `PhotoPlaceholder` upgraded: **thumbnail LazyRow** (per-photo aspect-ratio tiles + "Retake" chip) plus a dashed "Add photo" tile when photos exist, else the dashed placeholder; tap opens camera.
- `[x]` Wire photo slots into the 7 screens: Quick Capture, Reports, Patrol Start, Human Impact, Animal Mortality, Sighting, Water Source.
  - Verified on emulator: multi-photo saved per slot (`quick_capture_*.jpg`, `sighting_*.jpg`, ...), thumbnail strip + Retake shown after capture; **EXIF orientation fix confirmed via pixel-MSE** — portrait photo renders upright (MSE 490) vs raw landscape decode (MSE 6712).

### 10.2 Trusted time (GNSS satellite time — anti-cheat)

Two methods considered for stopping rangers faking timings:
1. **BE-verified start** — ranger's device verifies patrol start against the backend, then timer runs (needs DB/API; deferred to sync phase).
2. **GNSS satellite time** (chosen, fully client-side) — read true UTC from the GPS receiver and anchor all timestamps to it.

- `[x]` `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` permissions in manifest.
- `[x]` `TrustedTimeManager` — parses `$GPRMC` NMEA via `LocationManager`; computes `gnssUtcMillis`.
- `[x]` Monotonic-clock anchoring: `trustedUtc = anchorUtc + (elapsedRealtime − anchorElapsed)` so time keeps ticking correctly even if the ranger changes the device clock.
- `[x]` Tamper detection: `AUTO_TIME` off, device-clock vs trusted-time divergence > 60 s, `ACTION_TIME_CHANGED`/`TIMEZONE`/`DATE` broadcast receivers.
- `[x]` Fallback when no GNSS fix (e.g. emulator/indoors): anchor to device time, expose `gnssTimeAvailable=false`.
- `[x]` Expose `StateFlow<TimeIntegrityState>` consumed by UI.

### 10.3 Patrol timer + tamper alerts

- `[x]` `PatrolTimer` — records trusted start time + start `elapsedRealtime`; elapsed formatted from the monotonic clock (cannot be cheated).
- `[x]` Patrol Start "SAVE DETAILS" starts the timer with the trusted start.
- `[x]` Dashboard "Patrol duration" stat card shows live count-up instead of mock `3h 12m`.
- `[x]` Dashboard warning banner when `tamperDetected` (device clock differs from satellite time).
- `[x]` Logs screen prepends an `alert` entry when tampering is detected.
  - Verified on emulator: `settings put global auto_time 0` → banner + Logs alert entry appear; restore `auto_time 1` → banner clears; Patrol Start save → duration counts up (3s → 14s → 28s).

### 10.4 Map data from backend (PostGIS) — beats, compartments, MBTiles

Moves the hardcoded maps out of the APK into the PostGIS database. The bundled assets
(`mark_beat.json`, `mark_comp.json`, `NSTR.mbtiles`) now act only as an offline fallback.

- `[x]` Backend: `scripts/import-gis.ts` (`npm run import:gis`, idempotent) ingests the former
  mobile assets into PostGIS — `mark_beat.json` → `Beat` (44 rows, Polygon), `mark_comp.json` →
  `Compartment` (448 rows, Polygon + MultiPolygon, linked to Beat by name), `NSTR.mbtiles` →
  `MapAsset.data` BYTEA blob (18 MB, sha256-keyed, versioned). SQL lives in raw migrations
  (GIST indexes + generic `geometry(Geometry,4326)` columns).
- `[x]` Backend API (`backend/src/routes/gis.ts`): beats + compartments GeoJSON built with
  `ST_AsGeoJSON` (property names kept identical to the original files so the existing mobile
  parser works unchanged); asset metadata + binary download with `ETag`/`X-Asset-Version`.
- `[x]` `ForestGisRepository` — source priority **backend → local cache → bundled assets**:
  fetches `/api/gis/beats` + `/api/gis/compartments`, writes them to `filesDir/gis/`, exposes
  `source` ("backend"/"cache"/"assets"); parsing unchanged (same property names).
- `[x]` `MbtilesServer` — `prepareMbtilesFile()` now downloads `/api/gis/assets/NSTR.mbtiles`
  into `filesDir/` before falling back to copying the bundled asset; still serves tiles locally
  via `http://127.0.0.1:8888`.
- `[x]` `MapsScreen` runs tile-server startup + GIS load on `Dispatchers.IO` (the atlas download
  is network I/O); map creation still waits on `gisRepo.isDataLoaded`.
- Verified: `./gradlew :app:compileDebugKotlin` passes; backend `lint` + `build` pass; endpoint
  counts match the source files (44 / 448) and the downloaded MBTiles sha256 equals the source.

---

## Backlog & next tasks

- `[ ]` Backend: seed `Forest`/`ForestBoundary`/`ForestGrid` reference rows (grid point-in-polygon source) + `GET /api/forests`, `GET /api/forests/:id/grids` endpoints.
- `[ ]` Mobile: drop the bundled assets (`mark_beat.json`, `mark_comp.json`, `NSTR.mbtiles`) from the APK once backend fetch is proven on device (shrinks APK ~22 MB).
- `[ ]` Mobile: surface data source in the map UI (e.g. chip shows "Backend" / "Cache" / "Offline assets") and a "Refresh map data" action.
- `[ ]` Reports screen: add **"Reported Incidents"** section below the category grid (list of previously reported incidents; tap → incident detail). Design in Penpot first, then app UI code; mock data until persistence exists.
- `[ ]` Replace mock layer with Room + repository pattern (SQLite-first storage).
- `[ ]` Persist Patrol Start to SQLite (save actually inserts a local patrol).
- `[ ]` Make Save Draft / Submit Report write to SQLite (DRAFT vs PENDING rows).
- `[ ]` Implement sync worker (WorkManager): upload PENDING rows, download server changes.
- `[ ]` Make SOS button send a live alert.
- `[ ]` Add pull-to-refresh and loading indicators.
- `[ ]` Verify screens on a range of devices (e.g., small 390dp and large screens).
- `[ ]` Release build + R8 shrinking check.
- `[ ]` Add unit tests (navigation, mock data) and Compose UI tests.
- `[ ]` BE-verified patrol start anchor (method 1 of anti-cheat) once sync exists.
- `[ ]` Surface auth error states (401 on stale token → re-login), token refresh via `POST /api/auth/refresh`.

---

*Last updated: 2026-08-10. Auth wired to the backend: `AuthSession` login (`POST /api/auth/login`), token+user persistence, device registration (`POST /api/devices`), session restore on app start; Login/Dashboard/Settings show real user data; assigned-patrol banner from `GET /api/patrols?assignedTo=me`. Merged the ali PR full-screen maps UI (mini+full dual-map, 12 sighting/incident markers, multi-touch) into `main`; `API_BASE_URL` fixed (provider `.get()`). 2026-08-08: map reference data moved into PostGIS — backend ingests beats/compartments/MBTiles via `npm run import:gis`, exposes `GET /api/gis/*`; mobile downloads & caches them with bundled assets as offline fallback (10.4). 2026-08-07: multi-photo capture per slot + camera flip + EXIF-upright decode (10.1); Reports screen to gain a "Reported Incidents" section (7.7/backlog); Penpot MCP configured as a remote HTTP stream server in opencode.*
