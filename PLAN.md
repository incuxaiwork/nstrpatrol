# NSTR Patrol — Feature Implementation Plan

## Context

The app currently has:
- GPS telemetry recording (every 5s) with Room DB persistence
- Movement mode classification (Google AR + heuristic fallback)
- Patrol timer (in-memory, no persistence)
- Mock patrol cards in AllPatrolsScreen (hardcoded, no click handler)
- No fitness/activity analytics
- No patrol detail/report screen
- GPS Diagnostics has a Movement Detection card that adds no value

All key health/activity metrics (steps, distance, speed, move minutes) are computable from existing sensor data — no Health Connect or Google Fit API needed. Calories and heart points can be approximated with MET models.

---

## Feature 1: Activity Analytics (Google Fit-style)

### Goal
Show ranger activity data similar to Google Fit: steps, distance, speed, move minutes, calories (estimated), and a circular progress UI.

### What to build

**1a. New Room entity: `DailyActivityEntity`**
- `date` (TEXT, PK — "2026-08-07")
- `steps` (INTEGER)
- `distanceMeters` (REAL)
- `moveMinutes` (INTEGER)
- `caloriesEstimate` (REAL)
- `heartPointsEstimate` (REAL)
- `patrolIds` (TEXT — JSON array of patrol IDs contributing to this day)
- `computedAt` (INTEGER — timestamp of last computation)

**1b. New DAO queries for aggregation**
- `stepsForPatrol(patrolId)` — SUM of STEP_COUNTER deltas
- `distanceForPatrol(patrolId)` — Haversine over PatrolPointEntity lat/lon pairs
- `moveMinutesForPatrol(patrolId)` — COUNT of MOVEMENT_MODE readings where mode ∈ {WALKING, RUNNING, CYCLING} × 5s
- `averageSpeedForPatrol(patrolId)` — distance / elapsed time
- `dailyActivity(date)` — Flow<DailyActivityEntity?> for the dashboard

**1c. `ActivitySummary` utility object**
- Pure functions that compute each metric from DB queries
- MET-based calorie estimation: `calories = Σ(MET_mode × weight_kg × Δt_hours)`
  - Default weight: 70kg (configurable in settings later)
  - MET values: STILL=1.0, WALKING=3.5, RUNNING=9.0, CYCLING=7.0, VEHICLE=1.3
- Heart point estimation: WALKING=1pt/min, RUNNING/CYCLING=2pt/min
- Called on patrol stop and on app open to refresh daily totals

**1d. `ActivityRings` composable**
- Circular progress rings (like Google Fit): steps ring, calories ring, move min ring
- Reusable component for dashboard and patrol report

**1e. Dashboard integration**
- Replace hardcoded "Total dist. covered" and "Patrol duration" cards with live `ActivityRings` + today's stats

### Files to create/modify
- CREATE: `data/db/ActivityEntities.kt`
- MODIFY: `data/db/TelemetryDao.kt` — add aggregation queries
- MODIFY: `data/db/NstrDatabase.kt` — add DailyActivityEntity, bump version
- CREATE: `time/ActivitySummary.kt`
- CREATE: `ui/components/ActivityRings.kt`
- MODIFY: `ui/screens/DashboardScreen.kt` — replace stat cards

---

## Feature 2: Active Patrol Analytics (Map Overlay)

### Goal
During an active patrol, show live analytics on the map: coverage distance, speed, mode, remaining distance, route visualization.

### What to build

**2a. `PatrolSession` model (persisted)**
- New Room entity: `PatrolSessionEntity`
  - `patrolId`, `startTime`, `endTime?`, `status` (ACTIVE/COMPLETED/CANCELLED)
  - `patrolType`, `patrolMethod`, `beat`, `teamLeader`, `armedStatus`
  - `totalMembers`, `memberNames`
  - `targetDistanceKm?` (if assigned a specific route)
  - `totalDistanceMeters` (computed on stop)
  - `totalSteps` (computed on stop)
  - `moveMinutes` (computed on stop)
- On patrol start: insert ACTIVE session
- On patrol stop: compute aggregates, update session to COMPLETED

**2b. Active patrol analytics overlay (on Maps screen)**
- When `PatrolTimer.running`, show a bottom sheet or overlay card on the map with:
  - Live distance covered (haversine, updated every GPS fix)
  - Current speed / average speed
  - Current movement mode icon (walking/running/cycling/vehicle)
  - Elapsed time
  - If target distance set: progress bar + remaining distance
- Route polyline drawn on map from `PatrolPointEntity` locations

**2c. Route visualization**
- Draw polyline from recorded patrol points on the map
- Different color for covered route vs remaining (if target route exists)
- If no predefined route: show the traveled coordinates with a marker at current position

**2d. Stop patrol action**
- Add "Stop Patrol" button (currently only debug broadcast works)
- On stop: compute final stats, persist `PatrolSessionEntity`, navigate to report

### Files to create/modify
- CREATE: `data/db/PatrolSessionEntities.kt`
- MODIFY: `data/db/TelemetryDao.kt` — add patrol session queries
- MODIFY: `data/db/NstrDatabase.kt` — add entity, bump version
- CREATE: `ui/components/ActivePatrolOverlay.kt`
- MODIFY: `ui/screens/MapsScreen.kt` — integrate overlay + polyline
- MODIFY: `ui/screens/PatrolStartScreen.kt` — persist session on save
- MODIFY: `data/PatrolTimer.kt` — add stop callback, persist session
- MODIFY: `MainActivity.kt` — add stop patrol action, wire navigation

---

## Feature 3: Patrol Report Screen

### Goal
When tapping a patrol card in AllPatrolsScreen, open a detailed report screen showing the map, route, stats, team info, and motion data.

### What to build

**3a. `PatrolReportScreen` composable**
- Top section: Map with route polyline (static, completed route)
- Stats section:
  - Distance covered, target (if any), progress %
  - Duration (start → end)
  - Average speed, max speed
  - Steps taken
  - Move minutes breakdown (walking/running/cycling/vehicle/still pie or bar)
  - Calories estimate, heart points estimate
- Team section:
  - Patrol type, method, beat
  - Team leader, armed status
  - Member count, member names
- Activity section:
  - Movement mode timeline (colored bar showing mode transitions over time)
  - Sensor summary (accelerometer/gyroscope/magnetometer data highlights)
- Footer: sync status, recorded at timestamp

**3b. Wire navigation**
- Add route: `PatrolReport(patrolId: String)` to `NstrNav.kt`
- `AllPatrolsScreen` — make patrol cards tappable, navigate to `PatrolReport(patrolId)`
- `AllPatrolsScreen` — fetch real `PatrolSessionEntity` list from Room instead of mock data
- Filter chips (All/Active/Completed/Scheduled) — actually filter by session status

**3c. Mock data replacement**
- `Patrols.list` in MockData.kt — keep as fallback but read from Room when available
- For historical patrols without Room data, show mock data gracefully

### Files to create/modify
- CREATE: `ui/screens/PatrolReportScreen.kt`
- MODIFY: `ui/navigation/NstrNav.kt` — add PatrolReport route
- MODIFY: `ui/screens/AllPatrolsScreen.kt` — add onClick, real data, filtering
- MODIFY: `MainActivity.kt` — add PatrolReport composable in nav graph

---

## Feature 4: GPS Diagnostics Cleanup

### Goal
Remove the Movement Detection card from GPS Diagnostics (it duplicates what's shown elsewhere and adds noise). Replace with useful information.

### What to replace with

**4a. Patrol Telemetry Summary card (new)**
- Points recorded in current patrol
- Total distance covered
- Average GPS accuracy
- Sensor health status (all sensors registering OK?)
- Last sample timestamp

**4b. Time Integrity card (new)**
- Trusted time status (from TrustedTimeManager)
- Last GNSS time sync
- Clock drift from wall time
- Anti-tamper status

### Files to modify
- MODIFY: `ui/screens/GpsDiagnosticsScreen.kt` — remove MovementModeCard, add PatrolTelemetryCard + TimeIntegrityCard

---

## Implementation Order

1. **Feature 4: GPS Diagnostics cleanup** — smallest, standalone, immediate value
2. **Feature 1: Activity Analytics** — foundation for features 2 and 3
3. **Feature 2: Active Patrol Analytics** — builds on Feature 1's data layer
4. **Feature 3: Patrol Report Screen** — consumes all the data from 1 + 2

Each feature will be committed separately so you can test incrementally.
