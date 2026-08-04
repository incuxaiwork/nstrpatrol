# NSTR Patrol — Offline-First GIS Tracking Platform

An **offline-first GIS tracking platform** where the Android app collects data, the backend handles synchronization and analytics, and the web portal provides monitoring and management.

## System Overview

```
                Forest Department
                     │
                     ▼
          Admin Portal (Next.js)
                     │
                     ▼
        REST API (Express Backend)
                     │
                     ▼
        PostgreSQL + PostGIS Database
                     ▲
                     │
              Synchronization API
                     ▲
                     │
          Android App (Kotlin)
        ┌─────────────────────────┐
        │ Foreground Service       │
        │ GPS / GNSS              │
        │ Accelerometer           │
        │ Gyroscope               │
        │ Compass                 │
        │ Step Counter            │
        │ Point-in-Polygon        │
        │ Room Database           │
        │ WorkManager Sync        │
        └─────────────────────────┘
```

## Monorepo Layout

Single git repo, three independently developed/built/deployed applications:

| Path       | Project            | Toolchain                       |
| ---------- | ------------------ | ------------------------------- |
| `mobile/`  | Android app        | Kotlin + Jetpack Compose (Gradle) |
| `backend/` | REST API           | Express + TypeScript + Prisma   |
| `web/`     | Admin portal       | Next.js + TypeScript + Tailwind |

The API contract is fully decoupled — each project defines and consumes its own contract; no shared spec or generated types.

---

## 1. Mobile Application (Forest Ranger)

- **Language:** Kotlin
- **UI:** Jetpack Compose
- **Architecture:** MVVM + Clean Architecture
- **DI:** Hilt
- **Local DB:** Room
- **Background:** WorkManager
- **Continuous tracking:** Foreground Service
- **Location:** FusedLocationProviderClient (Google Play Services)
- **Sensors:** SensorManager
- **Networking:** Retrofit + OkHttp
- **Serialization:** Kotlin Serialization / Moshi
- **Maps:** Mapbox SDK (preferred) or Google Maps SDK

### Device components used

| Component   | Purpose                                         |
| ----------- | ----------------------------------------------- |
| GPS / GNSS  | lat/lon/altitude/speed/bearing/accuracy         |
| Accelerometer | movement, walking, stationary detection       |
| Gyroscope   | rotation, orientation, motion smoothing         |
| Magnetometer | heading, north orientation                     |
| Step counter | steps, distance estimation                     |
| Barometer   | elevation changes (optional)                   |

### Offline patrol flow

1. Ranger logs in.
2. Download forest boundary, grid information, assigned patrol.
3. Start patrol → foreground tracking service starts.
4. Every 5s: read GPS → store lat/lon/altitude/speed/bearing/accuracy → determine grid → save to Room.
5. Read sensors (accelerometer, gyroscope, compass) → store sensor data.
6. Continue until patrol ends.
7. Wait offline → when internet available, sync pending records → server → mark synced.

### Local storage (Room)

Tables: `Users`, `Devices`, `Patrols`, `PatrolPoints`, `SensorReadings`, `GridCache`, `SyncQueue`.

Example `PatrolPoint`: id, patrol_id, timestamp, latitude, longitude, altitude, speed, bearing, accuracy, grid_id, sync_status.

### Grid system

Forest divided into fixed-size grids (e.g. A1, B3). App contains grid polygons offline; every GPS point runs a point-in-polygon check to determine the current grid without internet.

### Sync process

```
Room DB → Pending Records → REST API → Backend → PostgreSQL → Mark Synced
```

No data is deleted until synchronization succeeds.

---

## 2. Centralized Backend

- **Framework:** Express
- **Language:** TypeScript
- **Auth:** JWT
- **Database:** PostgreSQL + PostGIS
- **ORM:** Prisma
- **Caching:** Redis (optional)
- **Storage:** S3 / MinIO
- **API:** REST
- **Deployment:** Docker + NGINX + Ubuntu

### Responsibilities

Authentication, user management, device management, forest management, grid generation, patrol management, location storage, sensor storage, analytics, reporting, synchronization, notifications.

### Database tables

`Users`, `Roles`, `Devices`, `Forests`, `ForestBoundaries`, `ForestGrids`, `Patrols`, `PatrolPoints`, `SensorReadings`, `Incidents`, `SyncLogs`.

Example `ForestGrid`: id, forest_id, grid_code, polygon.
Example `PatrolPoint`: id, patrol_id, latitude, longitude, speed, bearing, accuracy, grid_id, timestamp.

---

## 3. Admin Web Portal

- **Framework:** Next.js
- **Language:** TypeScript
- **UI:** Tailwind CSS
- **Maps:** Mapbox GL
- **State:** TanStack Query
- **Auth:** JWT
- **Charts:** Recharts

### Features

Dashboard, forest management, grid management, ranger management, device management, patrol assignment, live ranger tracking, historical patrol replay, grid coverage, incident reporting, reports, analytics, heat maps, export reports.

---

## 4. Typical Patrol Lifecycle

1. Admin creates forest and grid layout.
2. Ranger logs in.
3. Assigned forest, grids, and offline map data are downloaded.
4. Ranger enters forest; mobile network is lost.
5. GPS continues providing location.
6. App records GPS and sensor data, determines current grid locally.
7. Patrol data stored in Room.
8. Ranger completes patrol; internet becomes available.
9. WorkManager uploads all pending records.
10. Backend stores data in PostgreSQL/PostGIS.
11. Admin views route, grid coverage, duration, distance, time-per-grid, analytics.

## Final Recommended Architecture

| Layer            | Technology                                                                      |
| ---------------- | ------------------------------------------------------------------------------- |
| Mobile App       | Kotlin + Jetpack Compose                                                        |
| Local Storage    | Room                                                                            |
| Background Tasks | Foreground Service + WorkManager                                                |
| Location         | FusedLocationProviderClient (GNSS)                                              |
| Sensors          | SensorManager (Accelerometer, Gyroscope, Magnetometer, Step Counter, Barometer) |
| Maps (Mobile)    | Mapbox SDK with Offline Tiles                                                   |
| Backend          | Express (TypeScript)                                                           |
| Database         | PostgreSQL + PostGIS                                                            |
| ORM              | Prisma                                                                          |
| Cache (Optional) | Redis                                                                           |
| File Storage     | MinIO or S3                                                                     |
| Authentication   | JWT                                                                             |
| Admin Portal     | Next.js + TypeScript + Tailwind CSS                                             |
| Maps (Web)       | Mapbox GL JS                                                                    |
| Deployment       | Docker + NGINX + Ubuntu                                                         |
