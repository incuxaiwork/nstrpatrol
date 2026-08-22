# NSTR Patrol — Organizational, Roles, Scope & Architecture Reference

> **Purpose:** Canonical reference for developers and OpenCode. Use this document to understand the current forest hierarchy, officer responsibilities, application access, jurisdiction model, GIS structure, and planned schema direction.
>
> **Latest organizational update (2026-08-19):** DFO is responsible for the entire PT Markapur Division. DyDFO is specifically responsible for Dornal(a) Sub-Division. Under FROs, DyFRO is responsible for a group of Beats. FSO is responsible for a Section/group of Beats. DyFRO has no Admin Web portal yet. DyFRO and FSO geographic boundaries are intentionally not fixed yet.

## 1. System Context

NSTR Patrol is an offline-first forest patrol platform for **PT Markapur Division**.

```text
mobile/     Android + Kotlin + Jetpack Compose
backend/    Express + TypeScript + Prisma REST API
web/        Next.js + TypeScript + Tailwind Admin Web
database/   PostgreSQL + PostGIS
```

**Web-only rule:** when working on Admin Web, do not modify `mobile/`, `backend/`, or database code unless explicitly requested.

---

# 2. Official Organizational Hierarchy

```text
PT MARKAPUR DIVISION
│
├── DFO
│   │
│   ├── Direct Ranges
│   │   ├── Markapur Range
│   │   ├── Yerragondapalem Range
│   │   └── Vijayapuri South Range
│   │
│   └── DORNALA SUB-DIVISION
│       │
│       └── DyDFO
│           │
│           ├── Dornal Range
│           ├── Ganjivaripalli Range
│           ├── Korraprolu Range
│           └── Nekkanti Range
```

Current known hierarchy:

```text
1 Division
1 Sub-Division
7 Ranges
```

### Geographic hierarchy

```text
Division
  ↓
Sub-Division (where applicable)
  ↓
Range
  ↓
Beat
  ↓
Compartment
  ↓
1 km × 1 km Grid
```

### Important

The division is currently fixed as:

```text
PT Markapur Division
```

The DFO should not repeatedly select or enter the division in Admin Web workflows.

---

# 3. Roles and Responsibilities

## 3.1 DFO — Division Forest Officer

**Scope:** Entire PT Markapur Division.

The DFO is the superior authority for:

```text
PT Markapur Division
├── Direct Ranges
└── Dornal(a) Sub-Division
    └── All ranges under it
```

### DFO responsibilities

- Manage and visualize the entire division
- Monitor all ranges
- Monitor Dornal(a) Sub-Division
- Monitor beats and compartments
- Monitor patrols
- Monitor observations/incidents
- View GIS
- View division-wide analytics
- Generate reports
- Manage/monitor operational information according to finalized responsibilities

### Application

```text
Admin Web
```

---

## 3.2 DyDFO — Deputy Division Forest Officer

**Scope:** Dornal(a) Sub-Division only.

The DyDFO is **not division-wide**.

```text
DFO
└── Dornal(a) Sub-Division
    └── DyDFO
```

### DyDFO responsibilities

- Manage and visualize Dornal(a) Sub-Division
- Monitor ranges within Dornal(a)
- Monitor personnel within Dornal(a)
- Monitor patrols
- Monitor observations/incidents
- View GIS
- View Sub-Division analytics
- Generate Sub-Division reports

### Application

```text
Admin Web
```

---

## 3.3 FRO — Forest Range Officer

**Scope:** One Range.

FRO is the head of a Range.

```text
Range
└── FRO
```

### FRO responsibilities

- Manage and visualize the Range
- Monitor Range patrols
- Monitor Range personnel
- View Range observations
- View Range GIS
- View Range analytics
- Generate Range reports
- Patrol using the Mobile App

### Application

```text
Mobile App
+
Future Admin Web
```

The FRO Admin Web is **not the current implementation priority**.

Cross-jurisdiction permissions for FRO are also deferred.

---

## 3.4 DyFRO — Deputy Forest Range Officer

**Organizational responsibility:** Group of Beats under an FRO.

```text
FRO
└── DyFRO
    └── Group of Beats
```

### Current rules

- DyFRO uses the Mobile App.
- Do **not** create a DyFRO Admin Web portal yet.
- Do **not** permanently fix DyFRO geographic boundaries yet.
- DyFRO must be able to patrol and record operational data.
- The exact group-of-Beats assignment will be defined later.

### Important

For now:

```text
DyFRO role = known
DyFRO operational work = allowed
DyFRO exact geographic boundary = not fixed
```

---

## 3.5 FSO — Forest Special Officer

**Organizational responsibility:** Section / group of Beats.

```text
FSO
└── Section
    └── Group of Beats
```

### Current rules

- FSO uses the Mobile App.
- No FSO Admin Web portal.
- Do **not** permanently fix FSO geographic boundaries yet.
- FSO must be able to patrol and record operational data.
- The exact Section/Beat geography will be finalized later.

### Important

For now:

```text
FSO role = known
FSO operational work = allowed
FSO exact geographic boundary = not fixed
```

---

## 3.6 FBO — Beat-level Field Officer

**Normal scope:** One assigned Beat.

Uses:

```text
Mobile App only
```

Responsibilities:

- Conduct patrols
- Track GPS/sensors
- Record observations
- Capture evidence
- Report incidents
- View own patrol history
- View own observations
- View own work analytics
- Use map/GIS for field assistance

---

## 3.7 ABO — Assistant Beat-level Officer

**Normal scope:** One assigned Beat.

Uses:

```text
Mobile App only
```

Responsibilities:

- Conduct patrols
- Track GPS/sensors
- Record observations
- Capture evidence
- View own patrol history
- View own observations
- View own work analytics
- Use map/GIS for field assistance

---

# 4. Application Access Matrix

| Role | Application | Current Scope |
|---|---|---|
| DFO | Admin Web | Entire PT Markapur Division |
| DyDFO | Admin Web | Dornal(a) Sub-Division only |
| FRO | Mobile App; Admin Web later | Own Range |
| DyFRO | Mobile App only | Group of Beats; exact geography not fixed |
| FSO | Mobile App only | Section/group of Beats; exact geography not fixed |
| FBO | Mobile App only | Own Beat |
| ABO | Mobile App only | Own Beat |

---

# 5. Patrol Operating Model

Routine patrols are **self-initiated by field personnel**.

```text
FBO / ABO / FSO / DyFRO / FRO
        ↓
Decides to patrol
        ↓
Start Patrol
        ↓
GPS + sensor tracking
        ↓
Observations / incidents / photos
        ↓
End Patrol
        ↓
Offline storage
        ↓
Synchronization
```

Do **not** assume that every patrol is created or assigned by an administrator.

Administrative instructions or exceptional permissions may exist later, but they are not the normal patrol lifecycle.

### Deferred

Do not implement speculative:

- Cross-Beat permissions
- Cross-Range permissions
- FRO cross-jurisdiction permissions
- Special patrol authorization workflows

until officially defined.

---

# 6. Authorization Model

Keep these concepts separate:

```text
Role/Cadre = WHO the user is / organizational responsibility

Scope = WHERE the user is authorized to operate/see data

Permission = WHAT actions the user may perform
```

Conceptually:

```text
User
 ├── Role / Cadre
 └── Scope
       ├── Division
       ├── Sub-Division
       ├── Range
       ├── Beat
       └── Operational Area
```

### Current role/scope model

```text
DFO
  Role  = DFO
  Scope = Division / PT Markapur

DyDFO
  Role  = DyDFO
  Scope = Sub-Division / Dornal(a)

FRO
  Role  = FRO
  Scope = Range

DyFRO
  Role  = DyFRO
  Scope = Group of Beats
          (not geographically fixed yet)

FSO
  Role  = FSO
  Scope = Section / Group of Beats
          (not geographically fixed yet)

FBO
  Role  = FBO
  Scope = Beat

ABO
  Role  = ABO
  Scope = Beat
```

Backend authorization must enforce finalized scope. Frontend visibility is not a security mechanism.

---

# 7. Admin Web Architecture

## DFO Admin Web

The DFO portal is the **Division Command Center**.

```text
Dashboard
Patrol Operations
Ranger Management
Observations & Reports
GIS Intelligence
Analytics & Insights
Administration
```

DFO can visualize/manage:

```text
PT Markapur Division
├── Ranges
├── Dornal(a) Sub-Division
│   └── Ranges
├── Beats
├── Compartments
├── Patrols
├── Observations
├── Wildlife
├── Water Bodies
├── Animal Mortality
└── Human Impact
```

## DyDFO Admin Web

Same architecture, but scoped to:

```text
Dornal(a) Sub-Division
```

The DyDFO must not automatically see unrelated ranges outside Dornal(a).

## Future FRO Admin Web

Reuse the same Admin Web architecture.

```text
DFO
→ Division scope

DyDFO
→ Dornal(a) Sub-Division scope

FRO
→ Range scope
```

Do not create separate codebases for individual FROs.

## No DyFRO Portal

Do not create a DyFRO Admin Web portal at this stage.

## No FSO Portal

FSO remains Mobile App only.

---

# 8. Field User Data Visibility

Field users should be able to access:

```text
My Patrols
My Observations
My Analytics
My History
My Map
```

Personal analytics may include:

- Patrol count
- Patrol hours
- Distance
- Walking/bike/vehicle activity where available
- Own observations by category
- Own patrol history

Do not automatically expose division-wide operational analytics to field users.

### DyFRO / FSO exception

Because their exact geographic boundaries are not finalized:

- Do not invent geographic restrictions.
- Do not block operational recording because the future boundary is unknown.
- Allow patrol and data recording.
- Finalize geographic scope later.

---

# 9. GIS Architecture

```text
Division Boundary
       ↓
Sub-Division
       ↓
Range Boundary
       ↓
Beat Boundary
       ↓
Compartment Boundary
       ↓
1 km × 1 km Grid
       ↓
Patrol GPS Points
       ↓
Coverage Analytics
```

## Grid requirement

Default grid:

```text
1 km × 1 km
```

The grid is static spatial reference data.

Coverage is dynamic and should be derived from patrol activity:

```text
PatrolPoint
    ↓
PostGIS spatial relationship
    ↓
ForestGrid
    ↓
Patrolled / Unpatrolled
    ↓
Coverage %
```

Do not permanently store `grid.covered = true`.

This supports:

- Date-wise coverage
- Beat coverage
- Range coverage
- Patrolled grids
- Unpatrolled grids
- Zero-patrol areas

---

# 10. Personnel-to-Beat Mapping

Personnel names may be used during controlled import/migration.

Example:

```text
FBO_KALANUTHALA
        ↓
Kalanuthala Beat
```

However, after import the database must store:

```text
officer.beatId
```

or an assignment relationship.

Do not repeatedly parse names at runtime.

---

# 11. Recommended Schema Changes

The existing database already contains the core entities. Prefer targeted changes instead of a rewrite.

## 11.1 Division

Recommended:

```text
Division
- id
- code
- name
- boundary
- dfoId
- status
```

Current deployment:

```text
code = PT_MARKAPUR
name = PT Markapur Division
```

## 11.2 Range

Recommended:

```text
Range
- id
- divisionId
- name
- boundary
- froOfficerId
```

Relationship:

```text
Division 1 ─── N Range
Range    1 ─── 1 FRO
```

## 11.3 Beat

Prefer:

```text
Beat
- id
- rangeId
- name
- code
- boundary
```

Avoid treating one `beatOfficerId` as the permanent officer relationship.

## 11.4 Beat Officer Assignment

Recommended:

```text
BeatOfficerAssignment
- id
- beatId
- officerId
- assignmentType
- startDate
- endDate
- isActive
```

Where:

```text
assignmentType = FBO | ABO
```

This preserves assignment history.

## 11.5 Officer Scope

Recommended concept:

```text
OfficerScope
- id
- officerId
- scopeType
- divisionId
- subDivisionId
- rangeId
- beatId
- startDate
- endDate
- isActive
```

Possible `scopeType`:

```text
DIVISION
SUB_DIVISION
RANGE
BEAT
OPERATIONAL_AREA
```

For DyFRO and FSO, the exact operational-area relationship should remain flexible until official geography is finalized.

## 11.6 Patrol

Retain:

```text
officerId
divisionId
beatId
startedAt
endedAt
status
```

Recommended:

```text
rangeId
```

Target:

```text
Patrol
├── officerId
├── divisionId
├── rangeId
└── beatId
```

## 11.7 ForestGrid

Recommended:

```text
ForestGrid
- id
- divisionId
- rangeId
- beatId
- gridCode
- geometry
- area
- isActive
```

Use PostGIS geometry for spatial operations.

---

# 12. Patrol Jurisdiction Validation

Normal patrol:

```text
Authenticated User
        ↓
Current role/scope
        ↓
Requested patrol area
        ↓
Scope validation
        ↓
Allow / Deny
```

Example:

```text
FBO Kalanuthala
    ↓
Beat scope = Kalanuthala
    ↓
Patrol Kalanuthala
    ↓
Allowed
```

For DyFRO and FSO, do not apply speculative geographic restrictions until their areas are finalized.

---

# 13. Grid Coverage Architecture

```text
                 Patrol
                   │
                   ▼
              PatrolPoint
                   │
                   ▼
          PostGIS spatial query
                   │
                   ▼
               ForestGrid
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
   Patrolled Grid        Unpatrolled Grid
        │                     │
        └──────────┬──────────┘
                   ▼
              Coverage %
```

Coverage can then be aggregated by:

```text
Division
Sub-Division
Range
Beat
Date / Date Range
```

---

# 14. Analytics Architecture

Do not initially create physical tables such as:

```text
RangerAnalytics
BeatAnalytics
RangeAnalytics
DivisionAnalytics
```

Derive analytics from operational data:

```text
Ranger Analytics
  ← Patrol
  ← PatrolPoint
  ← Observation

Beat Coverage
  ← PatrolPoint
  ← ForestGrid

Range Analytics
  ← Patrol
  ← Observation
  ← Grid Coverage

Division Analytics
  ← Range-level data
```

If performance later requires it, use optimized queries, materialized views, or aggregate tables.

---

# 15. Deferred Work

Do not implement these until official responsibilities are finalized:

- Final role/permission matrix
- FRO Admin Web
- FRO cross-jurisdiction authorization
- Cross-Beat authorization
- Cross-Range authorization
- Special patrol authorization
- DyFRO Admin Web
- Fixed DyFRO geographic boundaries
- Fixed FSO geographic boundaries
- Final FSO operational-area model
- Exact DFO vs DyDFO permission differences
- Audit-log behavior tied to finalized permissions
- Master-data rules tied to finalized roles

Potential future entities:

```text
Role
Permission
RolePermission
UserRole
PatrolAuthorization
OperationalArea
AuditLog
```

Do not create these merely from assumptions.

---

# 16. Current Implementation Priorities

## Implement now

### DFO Admin Web

- Fixed PT Markapur Division context
- Division dashboard
- Division GIS
- Range/Beat/Compartment hierarchy
- 1 km grid
- Patrol monitoring
- Observation monitoring
- Ranger management
- Division analytics
- Reports
- Grid coverage
- Zero-patrol analysis
- Real backend data

### DyDFO Admin Web

- Same architecture as DFO
- Scope restricted to Dornal(a) Sub-Division
- Dornal(a) GIS
- Dornal(a) patrol monitoring
- Dornal(a) observations
- Dornal(a) analytics
- Dornal(a) reports

### Mobile field users

- FBO
- ABO
- FSO
- DyFRO
- Personal/work history
- Patrol recording
- Observation recording
- Map assistance
- Offline synchronization

## Later

### FRO Admin Web

- Same Admin Web architecture
- Range-scoped data
- Range GIS
- Range analytics
- Range reports

## Wait

- DyFRO portal
- Fixed DyFRO geography
- Fixed FSO geography
- Cross-jurisdiction permissions
- Final detailed role/permission matrix

---

# 17. Developer / OpenCode Rules

### MUST

1. Treat PT Markapur Division as the fixed current division.
2. Treat DFO as responsible for the entire PT Markapur Division.
3. Treat DyDFO as responsible for Dornal(a) Sub-Division only.
4. Treat FRO as Range Head.
5. Treat DyFRO as responsible for a group of Beats, without hardcoding geography yet.
6. Treat FSO as responsible for a Section/group of Beats, without hardcoding geography yet.
7. Treat FBO/ABO as Beat-level field users.
8. Keep DFO/DyDFO as current Admin Web users.
9. Keep FRO Admin Web as future work.
10. Keep DyFRO/FSO mobile field operations available.
11. Enforce finalized authorization scope in the backend.
12. Use GIS/backend data as the source of truth for Beat and Compartment boundaries.
13. Use 1 km × 1 km as the default grid.
14. Derive analytics from operational data initially.
15. Prefer targeted schema changes over database rewrites.
16. Preserve the existing working architecture.

### MUST NOT

1. Do not create a DyFRO Admin Web portal.
2. Do not create separate Admin Web applications for individual FROs.
3. Do not give FBO/ABO/FSO/DyFRO Admin Web access unless explicitly changed later.
4. Do not assume every patrol is admin-created or admin-assigned.
5. Do not implement FRO cross-jurisdiction permissions yet.
6. Do not invent DyFRO geographic boundaries.
7. Do not invent FSO geographic boundaries.
8. Do not block DyFRO/FSO field data collection because their final areas are not defined.
9. Do not derive Beat jurisdiction from personnel names at runtime.
10. Do not create speculative permissions.
11. Do not invent backend APIs or database fields.
12. Do not use mock operational data as a production fallback.
13. Do not modify `mobile/`, `backend/`, or database code during a Web-only task unless explicitly requested.

---

# 18. Canonical Architecture Summary

```text
                     PT MARKAPUR DIVISION
                              │
                             DFO
                              │
               ┌──────────────┴──────────────┐
               │                             │
        Direct Ranges                 DORNALA SUB-DIVISION
               │                             │
              FRO                           DyDFO
               │                             │
        ┌──────┴──────┐               Dornal(a) Ranges
        │             │
      DyFRO          FSO
        │             │
 Group of Beats   Section /
                  Group of Beats
        │             │
        └──────┬──────┘
               │
           FBO / ABO
               │
              Beat
```

### Portal model

```text
DFO
 ↓
Admin Web
 ↓
Entire PT Markapur Division


DyDFO
 ↓
Admin Web
 ↓
Dornal(a) Sub-Division only


FRO
 ↓
Mobile App
 +
Future Admin Web
 ↓
Own Range


DyFRO
 ↓
Mobile App
 ↓
Group of Beats
(boundary not fixed yet)


FSO
 ↓
Mobile App
 ↓
Section / Group of Beats
(boundary not fixed yet)


FBO / ABO
 ↓
Mobile App
 ↓
Own Beat
```

### Core rules

```text
Role/Cadre = WHO the user is / organizational responsibility

Scope = WHERE authority/visibility applies

Permission = WHAT actions the user may perform
```

```text
Routine patrol
→ self-initiated by field personnel

Administrative instruction/permission
→ exceptional workflow
→ not finalized yet
```

```text
Division
→ Sub-Division
→ Range
→ Beat
→ Compartment
→ 1 km Grid
→ Patrol Points
→ Coverage
```

**This document is the project reference for future clarification and AI coding-agent work. Update it before implementing changes caused by new official role, responsibility, hierarchy, authorization, or geographic-scope decisions.**
