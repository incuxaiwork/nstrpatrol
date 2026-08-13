# Forest Welfare System

## Web Admin Portal Product Requirements Document

### 1 Introduction

#### Purpose
The Admin Portal is the operational command center for Forest Officers and supervisory staff. It provides a single place to plan field operations, monitor active patrols, review observations, analyze forest activity, and manage administrative controls for the Forest Welfare System.

#### Objectives
- Provide a reliable and authoritative workspace for forest operations oversight.
- Support daily planning, monitoring, review, and reporting workflows.
- Present field activity in a GIS-first operational view.
- Standardize how forest operations are reviewed across roles and regions.
- Reduce fragmentation between planning, supervision, and reporting tasks.

#### Scope
This document defines the product requirements for the Admin Web Portal only.

It covers:
- Functional scope of the Admin Portal
- Information architecture
- Module-level responsibilities
- Navigation and access expectations
- Permission boundaries
- Acceptance criteria

It does not cover:
- Mobile application behavior
- Backend implementation details
- APIs
- Database schema
- Frontend implementation specifics

#### Target Users
- Forest Officer
- Range Officer
- DFO
- Administrator

#### Expected Outcomes
- Faster operational oversight of patrol activity.
- Better visibility into observations, incidents, and forest conditions.
- Consistent handling of ranger management and administrative governance.
- Improved decision-making through analytics and GIS intelligence.

### 2 Product Vision

The Admin Portal exists to give forest leadership an operational command center that supports day-to-day supervision and long-range management of forest activity.

Forest Officers use the portal to understand what is happening across forests, beats, ranges, and divisions without needing to inspect raw field records. The system should present patrol status, ranger performance, reports, GIS overlays, and analytical trends in a form that supports action, not just review.

The operational goal is to make the Forest Welfare System usable as a coordinated management platform rather than a collection of isolated screens. The portal must support planning, monitoring, management, analysis, and reporting with clear navigation and strong spatial awareness.

### 3 User Roles

#### Forest Officer
Responsible for operational review at the forest level.
- Reviews patrol activity
- Reviews observations and reports
- Monitors GIS activity and coverage
- Supports local operational decisions

#### Range Officer
Responsible for supervision across a range.
- Reviews patrol operations across assigned areas
- Monitors ranger activity and compliance
- Reviews incidents, reports, and exceptions
- Tracks coverage and operational gaps

#### DFO
Responsible for division-level oversight.
- Reviews cross-range performance
- Monitors trends, KPIs, and reporting output
- Oversees administrative and operational health
- Uses analytics to guide decisions

#### Administrator
Responsible for system governance.
- Manages users, roles, permissions, and master data
- Maintains reference data and configuration
- Reviews audit activity and system settings

#### Permissions
Permissions must be role-based and aligned to supervisory responsibility.
- Higher-level roles inherit broader read access across subordinate operational units.
- Administrative privileges are restricted to governance modules.
- Sensitive actions such as master data updates and permission changes require elevated access.

#### Responsibilities
- Forest Officer: operational awareness and field review
- Range Officer: supervision and exception handling
- DFO: strategic oversight and analytics review
- Administrator: system governance and configuration

### 4 Information Architecture

The Admin Portal must keep exactly the following module structure:
- Dashboard
- Patrol Operations
- Ranger Management
- Observations & Reports
- GIS Intelligence
- Analytics & Insights
- Administration

#### Module Relationships
- Dashboard provides the entry point into all major operational modules.
- Patrol Operations and Ranger Management support day-to-day execution and staff oversight.
- Observations & Reports and GIS Intelligence provide field evidence and spatial context.
- Analytics & Insights summarizes cross-module trends for decision-making.
- Administration governs users, roles, permissions, and master data used throughout the portal.

#### Navigation Hierarchy
- Global shell
  - Top navigation
  - Persistent left sidebar
  - Global search
  - Notifications
  - Profile
  - Breadcrumbs
- Primary modules
  - Dashboard
  - Patrol Operations
  - Ranger Management
  - Observations & Reports
  - GIS Intelligence
  - Analytics & Insights
  - Administration
- Secondary views and workflows
  - Module-specific list views
  - Detail views
  - Create and edit workflows
  - Replay and review modes
  - Reports and exports

### 5 Dashboard

#### Purpose
Provide the current operational picture of the forest system.

#### Business Objective
Enable Forest Officers and supervisors to answer: "What is happening in the forest right now?"

#### Responsibilities
- Surface active patrol activity
- Present current operational KPIs
- Summarize forest hierarchy and coverage context
- Highlight urgent or notable events
- Provide entry points to major workflows

#### Widgets
- KPI cards
- GIS overview
- Forest hierarchy summary
- Today’s patrols
- Recent reports
- Incident summary
- Quick actions
- Charts
- Mini map preview
- Heatmap preview

#### KPIs
- Active patrols
- Completed patrols
- Open incidents
- Reports submitted today
- Rangers on duty
- Coverage percentage
- Zero patrol zones

#### GIS Overview
- Show the operational geography of forests, beats, ranges, and divisions.
- Make spatial context visible without requiring navigation away from the dashboard.
- Support identification of coverage gaps and activity hotspots.

#### Forest Hierarchy Summary
- Surface forest structure in a condensed summary.
- Allow supervisors to understand activity by administrative hierarchy.
- Show distribution across forests, beats, ranges, and divisions where applicable.

#### Quick Actions
- Open patrol operations
- Review reports
- Open GIS intelligence
- Open ranger management
- Export a summary view

#### Business Rules
- The dashboard must prioritize current operational status over historical data.
- Critical alerts must be visually and behaviorally prominent.
- GIS information must remain visible as a first-class context, not a secondary detail.
- Data displayed on the dashboard must reflect the currently selected operational scope.

#### Acceptance Criteria
- The dashboard presents current operational status at a glance.
- KPI values are visible without requiring drill-down.
- A GIS summary is present in the default view.
- Quick actions provide direct access to key modules.
- Recent reports and incidents are visible from the landing view.

#### Permissions
- Forest Officer: full dashboard access for assigned scope
- Range Officer: full dashboard access for assigned scope
- DFO: full dashboard access for divisional scope
- Administrator: full dashboard access across system scope

#### Dependencies
- Patrol status data
- Ranger assignment data
- Incident and report summaries
- GIS coverage context

### 6 Patrol Operations

#### Purpose
Support patrol planning, assignment, monitoring, and review.

#### Business Objective
Enable supervisors to manage the patrol lifecycle from assignment through replay and reporting.

#### Responsibilities
- Plan and create patrols
- Review assigned, ongoing, and completed patrols
- Inspect patrol details and outcomes
- Replay patrol movement and event timelines
- Review patrol templates and reports

#### Features
- Patrol Dashboard
- Create Patrol
- Assigned Patrols
- Ongoing Patrols
- Completed Patrols
- Patrol Replay
- Patrol Reports
- Patrol Templates
- Patrol Details

#### Sub Modules
- Patrol list and status views
- Patrol creation workflow
- Patrol detail and evidence review
- Replay and timeline review
- Template management

#### Navigation
- Accessible from the persistent sidebar.
- Drill-down from dashboard alerts and patrol KPIs.
- Supports direct entry into create, detail, or replay views.

#### Workflow
1. User opens Patrol Operations.
2. User reviews patrol dashboard.
3. User selects existing patrols or creates a new patrol.
4. User reviews assignment, status, and field outcomes.
5. User opens patrol replay or reports as needed.

#### Business Rules
- Patrols must be categorized by status.
- Patrol replay must preserve the original patrol sequence and timeline.
- Patrol details must provide sufficient context for operational review.
- Templates must support repeatable operational planning.

#### Permissions
- Forest Officer: view and review assigned scope
- Range Officer: view, assign, and monitor within scope
- DFO: view all patrols within division scope
- Administrator: full access

#### Dependencies
- Patrol assignment records
- Ranger assignment context
- Patrol reports and replay data
- GIS route context

#### Acceptance Criteria
- Users can view patrols by status.
- Users can create a patrol.
- Users can inspect assigned, ongoing, and completed patrols.
- Users can review patrol replay and patrol details.
- Users can access patrol reports and templates from the same module.

### 7 Ranger Management

#### Purpose
Manage ranger personnel, team structure, and operational resources.

#### Business Objective
Provide supervisors with a clear operational view of staff readiness and resource assignment.

#### Responsibilities
- Maintain ranger records
- Review ranger profiles and performance
- Manage teams and allocations
- Track vehicles, weapons, and equipment

#### Features
- Ranger List
- Create Ranger
- Profile
- Performance
- Teams
- Vehicles
- Weapons
- Equipment

#### Sub Modules
- Ranger directory
- Ranger detail view
- Team assignment view
- Resource inventory views

#### Navigation
- Accessible from the sidebar.
- Direct links from patrol assignment and dashboard summaries.

#### Workflow
1. User opens Ranger Management.
2. User searches or filters the ranger list.
3. User opens a ranger profile or creates a new ranger.
4. User reviews performance, team membership, and assigned resources.

#### Business Rules
- Ranger records must support supervisory review.
- Operational resource assignments must be visible in the ranger profile.
- Team membership must remain current and consistent.
- Performance views must support trend review, not only static status.

#### Permissions
- Forest Officer: view only within scope
- Range Officer: view and manage within scope
- DFO: view cross-range data
- Administrator: full create/edit access

#### Dependencies
- Ranger identity data
- Team structure
- Vehicle, weapon, and equipment assignments
- Performance summaries

#### Acceptance Criteria
- Ranger records are searchable and reviewable.
- Ranger profile includes performance and resource context.
- Teams, vehicles, weapons, and equipment are accessible from the same module.
- Role-based access is enforced by responsibility level.

### 8 Observations & Reports

#### Purpose
Review operational observations, incident reports, and evidence submitted from the field.

#### Business Objective
Provide a structured workspace for reviewing field evidence and report categories.

#### Responsibilities
- Review submitted observations
- Classify reports by category
- Inspect supporting evidence
- Support export and report retrieval

#### Features
- Wildlife
- Human Impact
- Water Bodies
- Animal Mortality
- Forest Health
- Infrastructure
- Others
- Filters
- Report Viewer
- Downloads

#### Sub Modules
- Category-based report browsing
- Report detail review
- Evidence and attachments review
- Export/download view

#### Navigation
- Accessible from the sidebar.
- Linked from dashboard alerts and analytics summaries.

#### Workflow
1. User opens Observations & Reports.
2. User selects a category or applies filters.
3. User opens a report in the viewer.
4. User reviews evidence, metadata, and supporting materials.
5. User downloads reports as needed.

#### Business Rules
- Reports must be filterable by category and operational scope.
- Evidence must remain associated with the source report.
- Downloads must reflect the current filtered or selected context.
- The report viewer must support quick inspection and comparison.

#### Permissions
- Forest Officer: view assigned scope
- Range Officer: view assigned and subordinate scope
- DFO: view division-wide reports
- Administrator: view all and manage report-related governance

#### Dependencies
- Submitted reports
- Supporting evidence
- Category taxonomy
- Export outputs

#### Acceptance Criteria
- Users can browse reports by category.
- Users can apply filters to narrow report sets.
- Users can review individual reports with evidence context.
- Users can download report outputs.

### 9 GIS Intelligence

#### Purpose
Provide the primary spatial workspace for operational review and route intelligence.

#### Business Objective
Enable supervisors to understand forest activity spatially and identify gaps, patterns, and anomalies.

#### Responsibilities
- Show interactive forest maps
- Manage map layers
- Review patrol replay
- Analyze coverage density
- Visualize heatmaps
- Identify zero patrol zones

#### Features
- Interactive Map
- Layer Manager
- Patrol Replay
- Coverage Density
- Heatmaps
- Zero Patrol
- Layer Controls

#### Sub Modules
- Map workspace
- Layer visibility controls
- Replay and route playback
- Coverage and density analysis
- Exception zone review

#### Navigation
- Accessible from the sidebar.
- Cross-linked from patrol details, dashboard summaries, and analytics.

#### Workflow
1. User opens GIS Intelligence.
2. User selects layers and context.
3. User explores patrols, heatmaps, or coverage output.
4. User reviews zero patrol and other spatial exceptions.

#### Business Rules
- Spatial intelligence must be the central focus of this module.
- Layer controls must support rapid operational inspection.
- Patrol replay must align with the spatial timeline.
- Zero patrol zones must be easy to identify.

#### Permissions
- Forest Officer: view assigned spatial scope
- Range Officer: view and analyze assigned range scope
- DFO: view cross-range spatial intelligence
- Administrator: full access

#### Dependencies
- Map and layer context
- Patrol route data
- Coverage metrics
- Heatmap and exception data

#### Acceptance Criteria
- Interactive map is available by default.
- Users can toggle layers.
- Users can review patrol replay.
- Coverage density and heatmap views are available.
- Zero patrol zones are identifiable.

### 10 Analytics & Insights

#### Purpose
Present operational metrics, trends, and comparative analysis across forestry units.

#### Business Objective
Support evidence-based decision-making at ranger, beat, range, division, and forest levels.

#### Responsibilities
- Present analytical summaries
- Compare performance across scopes
- Surface trends and exceptions
- Support reporting and export

#### Features
- Ranger Analytics
- Beat Analytics
- Range Analytics
- Division Analytics
- Human Impact
- Wildlife
- Water Bodies
- Animal Mortality
- Overall Forest Analytics
- KPIs
- Reports

#### Sub Modules
- Comparative analytics views
- Trend review views
- KPI summary views
- Downloadable reporting views

#### Navigation
- Accessible from the sidebar.
- Cross-linked from dashboard and reports modules.

#### Workflow
1. User opens Analytics & Insights.
2. User selects the analytical scope.
3. User reviews KPIs, trends, and comparisons.
4. User exports or shares summary outputs if needed.

#### Business Rules
- Analytics must be available by operational hierarchy.
- Comparison views must support trend interpretation.
- KPI definitions must remain consistent across scopes.
- Reporting outputs must align with the selected analytical context.

#### Permissions
- Forest Officer: view assigned scope
- Range Officer: view assigned scope
- DFO: view broader comparative scopes
- Administrator: full access

#### Dependencies
- Patrol and report data
- Coverage and spatial summaries
- Operational hierarchy context
- Reporting outputs

#### Acceptance Criteria
- Users can review analytics by scope.
- KPI summaries are available.
- Trend comparisons are visible.
- Report outputs are available from the module.

### 11 Administration

#### Purpose
Govern users, roles, permissions, and master data for the portal.

#### Business Objective
Ensure the portal remains controlled, auditable, and consistent across the organization.

#### Responsibilities
- Manage user accounts
- Manage roles and permissions
- Maintain master data
- Manage species, vehicles, weapons, and categories
- Maintain system settings

#### Features
- Users
- Roles
- Permissions
- Master Data
- Species
- Vehicles
- Weapons
- Categories
- Settings

#### Sub Modules
- Identity and access management
- Reference data management
- System configuration

#### Navigation
- Accessible from the sidebar.
- Restricted to users with administrative privileges.

#### Workflow
1. Administrator opens Administration.
2. Administrator selects a governance area.
3. Administrator updates users, roles, permissions, or master data.
4. Administrator reviews settings and confirms the change set.

#### Business Rules
- Administrative actions must be restricted to authorized roles.
- Master data changes must remain consistent across the portal.
- Permissions must be understandable and auditable.
- Settings must support operational consistency.

#### Permissions
- Forest Officer: limited or no access, depending on governance policy
- Range Officer: limited or no access, depending on governance policy
- DFO: limited access where policy allows
- Administrator: full access

#### Dependencies
- User directory
- Role definitions
- Permission model
- Master data definitions

#### Acceptance Criteria
- Authorized users can manage users, roles, permissions, and master data.
- Unauthorized users cannot access restricted administrative views.
- System settings are reviewable and editable by administrators.

### 12 Global Features

#### Global Search
- Search across modules, records, and operational entities.
- Support quick access to people, patrols, reports, and spatial items.

#### Notifications
- Surface operational alerts, exceptions, and important updates.
- Support prioritization by severity and relevance.

#### Global Filters
- Enable consistent filtering across module views where applicable.
- Preserve selected operational scope.

#### Profile
- Provide current user context.
- Support account review and session-level actions.

#### Report Export
- Support export of reports, summaries, and analytical outputs.
- Respect the currently selected module context and permissions.

### 13 Navigation Flow

The Admin Portal must use a persistent navigation structure that keeps the primary modules always accessible.

#### Primary flow
Dashboard -> module selection -> detail or workflow views -> return to module summary

#### Cross-module flow
- Dashboard can route into any major module.
- Patrol Operations can route to GIS Intelligence and Analytics.
- Ranger Management can route into Patrol Operations for assignment review.
- Observations & Reports can route into GIS Intelligence and Analytics for spatial and trend review.
- Administration remains isolated from operational workflows except where governance context is needed.

#### Rules
- The left sidebar must remain persistent across the portal.
- Breadcrumbs must reflect the current module and nested view.
- Global search must be accessible from the primary shell.
- Notifications and profile access must remain available across all modules.

### 14 Permission Matrix

| Module | Forest Officer | Range Officer | DFO | Administrator |
| --- | --- | --- | --- | --- |
| Dashboard | Access assigned scope | Access assigned scope | Access divisional scope | Full access |
| Patrol Operations | View/review assigned scope | Manage assigned scope | View divisional scope | Full access |
| Ranger Management | View assigned scope | Manage assigned scope | View broader scope | Full access |
| Observations & Reports | View assigned scope | View/manage assigned scope | View divisional scope | Full access |
| GIS Intelligence | View assigned scope | Analyze assigned scope | View broader scope | Full access |
| Analytics & Insights | View assigned scope | View assigned scope | View broader scope | Full access |
| Administration | Restricted | Restricted or limited | Restricted or limited | Full access |

### 15 Acceptance Criteria

#### Dashboard
- Users can understand current operational status without drilling into other modules.
- The dashboard displays KPIs, GIS context, and quick actions.

#### Patrol Operations
- Users can create, review, replay, and report on patrols.
- Patrols are visible by lifecycle status.

#### Ranger Management
- Users can find ranger records and review operational context.
- Ranger profiles include performance and resource visibility.

#### Observations & Reports
- Users can browse, filter, and review reports by category.
- Download access is supported.

#### GIS Intelligence
- Users can inspect map-based operational intelligence.
- Layers, replay, coverage, and zero patrol visibility are available.

#### Analytics & Insights
- Users can review KPIs and trends by operational scope.
- Comparative analysis is available across hierarchy levels.

#### Administration
- Users with permission can manage users, roles, permissions, master data, and settings.
- Restricted access is enforced for non-administrative roles.

#### Global Features
- Global search, notifications, filters, profile access, and export are available across the portal where applicable.

#### General Portal Criteria
- The module structure remains unchanged.
- The portal supports operational review and management at enterprise level.
- The portal remains focused on planning, monitoring, managing, analyzing, and reporting.
