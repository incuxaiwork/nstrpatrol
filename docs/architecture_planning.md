Yes — with the level of detail you've provided, **NSTR Patrol should have more than one architecture diagram**. A single diagram would become too crowded.

I’d recommend a **4-diagram architecture set**:

1. **System / deployment architecture** — how Mobile, Backend, Web, DB, storage, and external services interact.
2. **Mobile offline-first architecture** — how GPS/sensors → Room → WorkManager → API work.
3. **Backend architecture** — API modules, services, PostGIS, Redis, storage.
4. **Data synchronization flow** — especially important because offline-first is the core architectural decision.

### 1. NSTR Patrol — Overall Architecture

This is the diagram I would put first in your project documentation:

```text
                              ┌──────────────────────────┐
                              │     Forest Department    │
                              │      Admin / Officers     │
                              └────────────┬─────────────┘
                                           │
                                           │ HTTPS
                                           ▼
                              ┌──────────────────────────┐
                              │      Admin Web Portal     │
                              │                          │
                              │ Next.js + TypeScript     │
                              │ Tailwind + Mapbox GL JS  │
                              │ TanStack Query + Recharts │
                              └────────────┬─────────────┘
                                           │
                                           │ REST / JSON
                                           ▼
┌──────────────────────┐       ┌──────────────────────────┐
│   Forest Rangers     │       │       NSTR Backend       │
│                      │       │                          │
│ Android + Kotlin     │       │ Express + TypeScript     │
│ Jetpack Compose      │       │ JWT Authentication       │
│                      │       │ REST API                  │
└──────────┬───────────┘       │                          │
           │                   │ ┌──────────────────────┐ │
           │ HTTPS             │ │ Auth                 │ │
           │ when online       │ │ Users / Devices      │ │
           └──────────────────►│ │ Forest / GIS         │ │
                               │ │ Patrols / Assignments │ │
                               │ │ Telemetry             │ │
                               │ │ Incidents             │ │
                               │ │ Sync / Alerts         │ │
                               │ └──────────┬───────────┘ │
                               └────────────┼─────────────┘
                                            │
                              ┌─────────────┼─────────────┐
                              │             │             │
                              ▼             ▼             ▼
                    ┌──────────────┐ ┌───────────┐ ┌──────────────┐
                    │ PostgreSQL   │ │   Redis   │ │ MinIO / S3  │
                    │ + PostGIS    │ │  Cache    │ │ Photos/Files │
                    │              │ │           │ │              │
                    │ GIS geometry │ │ optional  │ │              │
                    │ Patrol data  │ │           │ │              │
                    │ Telemetry    │ │           │ │              │
                    │ Incidents    │ │           │ │              │
                    └──────────────┘ └───────────┘ └──────────────┘
```

The **most important architectural boundary** is the one between the Android app and backend:

```text
             ONLINE                         OFFLINE
               │                              │
               ▼                              ▼
       ┌───────────────┐              ┌────────────────┐
       │ REST API      │              │ Room / SQLite  │
       └───────┬───────┘              └───────┬────────┘
               │                              │
               ▼                              │
       ┌───────────────┐                      │
       │ PostgreSQL    │◄──── WorkManager ────┘
       │ + PostGIS     │      when online
       └───────────────┘
```

That distinction is central to your architecture.

---

## 2. Mobile Architecture

Your Android architecture is actually more detailed than the original diagram suggests.

I'd represent it like this:

```text
                         ANDROID APPLICATION
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    Jetpack Compose UI                       │
│                                                             │
│  Login │ Dashboard │ Maps │ Patrols │ Reports │ Settings  │
│                                                             │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │    ViewModels       │
                  │       MVVM          │
                  └──────────┬──────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │     Use Cases       │
                  │ Clean Architecture  │
                  └──────────┬──────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │    Repositories     │
                  └──────┬────────┬─────┘
                         │        │
             ┌───────────┘        └──────────────┐
             ▼                                   ▼
   ┌─────────────────────┐             ┌─────────────────────┐
   │ Local Data Source   │             │ Remote Data Source  │
   │                     │             │                     │
   │ Room / SQLite       │             │ Retrofit / HTTP     │
   └──────────┬──────────┘             └──────────┬──────────┘
              │                                   │
              ▼                                   ▼
   ┌─────────────────────┐              ┌─────────────────────┐
   │ Local Database      │              │ NSTR REST API       │
   │                     │              │                     │
   │ Patrols             │              │ Auth                │
   │ PatrolPoints        │              │ Reference Data      │
   │ SensorReadings      │              │ Sync                │
   │ Incidents           │              │ SOS                 │
   │ SyncQueue           │              │ Uploads             │
   └─────────────────────┘              └─────────────────────┘


       DEVICE SERVICES
       ─────────────────

   ┌───────────────┐
   │ Foreground    │
   │ Tracking      │
   │ Service       │
   └───────┬───────┘
           │
     ┌─────┼───────────────────────────────┐
     │     │       │       │       │       │
     ▼     ▼       ▼       ▼       ▼       ▼
    GNSS  Accel  Gyro   Compass  Steps  Barometer
     │     │       │       │       │       │
     └─────┴───────┴───────┴───────┴───────┘
                         │
                         ▼
                    Room / SQLite
                         │
                         ▼
                    SyncQueue
                         │
                         ▼
                    WorkManager
                         │
                         ▼
                     REST API
```

One important detail I'd explicitly show in the architecture documentation:

**The UI should not directly talk to Retrofit or Room.**

Instead:

```text
Compose
   ↓
ViewModel
   ↓
Use Case
   ↓
Repository
   ├── Room
   └── API
```

That makes your Clean Architecture/MVVM claim concrete.

---

# 3. Offline-First Data Architecture

This is probably the **most important diagram in the entire NSTR project**.

```text
                       FOREST RANGER
                            │
                            ▼
                    ┌───────────────┐
                    │ GPS / Sensors │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ Tracking      │
                    │ Foreground    │
                    │ Service       │
                    └───────┬───────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │ Local Processing      │
                 │                      │
                 │ • Point-in-Polygon  │
                 │ • Grid detection     │
                 │ • Activity detection │
                 │ • Trusted timestamp   │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │     Room / SQLite    │
                 │                      │
                 │ Patrol               │
                 │ PatrolPoint          │
                 │ SensorReading        │
                 │ Incident             │
                 │ Photos               │
                 │ SyncQueue            │
                 └──────────┬───────────┘
                            │
                     PENDING records
                            │
                            ▼
                 ┌──────────────────────┐
                 │     WorkManager      │
                 │                      │
                 │ Connectivity trigger │
                 │ Retry / backoff      │
                 │ Batch upload         │
                 └──────────┬───────────┘
                            │
                      INTERNET AVAILABLE
                            │
                            ▼
                 ┌──────────────────────┐
                 │      REST API        │
                 │                      │
                 │ /sync/upload         │
                 │ /sync/changes        │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │ PostgreSQL + PostGIS │
                 └──────────┬───────────┘
                            │
                     sync response
                            │
                            ▼
                 ┌──────────────────────┐
                 │ Update local state   │
                 │                      │
                 │ PENDING → SYNCED     │
                 │ FAILED → retry       │
                 └──────────────────────┘
```

The key architectural rule is:

> **Room is the source of truth for the mobile application's collected data. PostgreSQL is the centralized synchronization target.**

That's a much stronger description than simply saying "the app has offline support."

---

# 4. Backend Architecture

Your backend should be represented as a set of domain modules rather than simply one giant "Express Backend" box.

```text
                         REST CLIENTS
                              │
                ┌─────────────┴─────────────┐
                │                           │
                ▼                           ▼
          Android App                 Admin Portal
                │                           │
                └─────────────┬─────────────┘
                              │
                         HTTPS / REST
                              │
                              ▼
                 ┌─────────────────────────┐
                 │       Express API       │
                 │                         │
                 │ Authentication / JWT    │
                 │ Validation / Zod        │
                 │ Error Handling          │
                 │ Logging / Pino          │
                 │ Authorization / RBAC    │
                 └────────────┬────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
 ┌────────────┐       ┌──────────────┐      ┌──────────────┐
 │ Auth       │       │ GIS / Forest │      │ Patrol       │
 │ Users      │       │ Management   │      │ Assignment   │
 │ Devices    │       │              │      │              │
 └────────────┘       └──────────────┘      └──────────────┘

        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
 ┌────────────┐       ┌──────────────┐      ┌──────────────┐
 │ Telemetry  │       │ Incidents    │      │ Sync / Audit │
 │            │       │              │      │              │
 │ GPS        │       │ Reports      │      │ Upload       │
 │ Sensors    │       │ Verification │      │ Changes      │
 │ Coverage   │       │ Resolution   │      │ Sync Logs    │
 └────────────┘       └──────────────┘      └──────────────┘

        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
 ┌────────────┐       ┌──────────────┐      ┌──────────────┐
 │ SOS        │       │ Options      │      │ Uploads      │
 │ Alerts     │       │ Reference    │      │ Photos       │
 └────────────┘       │ Data         │      │ Files        │
                      └──────────────┘      └──────────────┘

                              │
                              ▼
                       ┌──────────────┐
                       │   Prisma     │
                       │ Data Access  │
                       └──────┬───────┘
                              │
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
       ┌──────────────┐ ┌───────────┐ ┌──────────────┐
       │ PostgreSQL   │ │   Redis   │ │ MinIO / S3  │
       │ + PostGIS    │ │  Optional │ │   Storage    │
       └──────────────┘ └───────────┘ └──────────────┘
```

This diagram also makes your **"no direct database writes"** rule visible:

```text
Client
  ↓
API
  ↓
Domain / Route Handler
  ↓
Prisma
  ↓
PostgreSQL
```

rather than:

```text
Client ────────────────► Database
```

---

# 5. GIS Architecture

Because GIS is a major part of NSTR Patrol, I'd also document it separately.

```text
                    ADMIN WEB
                       │
                       │ Create / Edit
                       ▼
               ┌──────────────────┐
               │ GIS Management   │
               │                  │
               │ Beats            │
               │ Compartments     │
               │ Forest Boundaries│
               │ Grids             │
               │ Patrol Routes    │
               │ MBTiles          │
               └────────┬─────────┘
                        │
                        ▼
                ┌───────────────┐
                │   PostGIS     │
                │               │
                │ Polygon       │
                │ MultiPolygon  │
                │ LineString    │
                │ GIST indexes  │
                └───────┬───────┘
                        │
              ┌─────────┴─────────┐
              │                   │
              ▼                   ▼
       GeoJSON API          MBTiles API
              │                   │
              └─────────┬─────────┘
                        │
                        ▼
                 Android Mobile
                        │
             ┌──────────┴──────────┐
             ▼                     ▼
       Local GeoJSON            MBTiles
             │                     │
             ▼                     ▼
     Point-in-Polygon        Offline Map
             │
             ▼
         Grid ID
```

So when the ranger is offline:

```text
GPS coordinate
      │
      ▼
Local ForestGrid polygons
      │
      ▼
Point-in-Polygon
      │
      ▼
Current Grid = "B3"
```

**No API call is required for that operation.**

---

## 6. The architecture I would actually put in your README

For the repository's main README, I wouldn't put all of those diagrams.

I'd use a simplified **C4-style system context/container diagram**:

```text
                         ┌──────────────────────┐
                         │   Forest Department  │
                         │      Administrators  │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │   NSTR Admin Portal  │
                         │ Next.js + Mapbox GL  │
                         └──────────┬───────────┘
                                    │
                                    │ REST / HTTPS
                                    ▼
┌──────────────────────┐   ┌──────────────────────┐
│                      │   │                      │
│    NSTR Patrol       │   │    NSTR Backend      │
│    Android App       │◄─►│    Express API       │
│                      │   │                      │
│ Kotlin / Compose     │   │ TypeScript           │
│ Room / SQLite        │   │ JWT / REST           │
│ GNSS / Sensors       │   │ Prisma               │
│ WorkManager          │   │                      │
│ Offline Maps         │   │                      │
│ Local GIS            │   │                      │
└──────────────────────┘   └──────────┬───────────┘
                                      │
                         ┌────────────┼────────────┐
                         │            │            │
                         ▼            ▼            ▼
                  ┌────────────┐ ┌─────────┐ ┌──────────┐
                  │ PostgreSQL │ │  Redis  │ │ MinIO/S3 │
                  │ + PostGIS  │ │ Cache   │ │ Photos   │
                  └────────────┘ └─────────┘ └──────────┘
```

Then underneath it, I'd have three small diagrams titled:

* **Mobile Offline-First Architecture**
* **Backend Service Architecture**
* **Synchronization & Data Flow**

That would give you a professional architecture section without turning the README into a wall of boxes.

### One architectural correction I'd make

Your documentation currently uses both **`FusedLocationProviderClient`** and wording like **"GPS/GNSS"**. Those aren't exactly the same layer. `FusedLocationProviderClient` is the Android location API that can combine available location providers; GNSS is the underlying satellite positioning technology. Your trusted-time implementation specifically reads GNSS/NMEA data.

So I'd document it as:

```text
Android Location Layer
        │
        ├── FusedLocationProviderClient
        │      └── patrol location fixes
        │
        └── LocationManager / GNSS NMEA
               └── trusted UTC time
```

That makes the implementation architecture much more precise.

**Overall, your project is best described as a three-client architecture with an offline-first edge:**

**Android mobile → local SQLite/GIS → synchronization API → centralized PostGIS → Admin Web Portal.**

That is the architectural story I would make visually dominant.
