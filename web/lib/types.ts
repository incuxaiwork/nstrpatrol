/**
 * NSTR Patrol Admin Portal — domain types.
 * Frontend-only types mirroring the PRD (docs/web-admin-prd.md). Swappable with
 * real backend types once the API exists.
 */

export type ScopeLevel = "forest" | "division" | "range" | "beat";

/** Operational scope selected in the global scope picker. */
export interface Scope {
  forest: string;
  division: string;
  range: string;
  beat: string;
}

export interface Unit {
  id: string;
  name: string;
  level: ScopeLevel;
  parentId?: string;
  code: string;
  areaKm2: number;
  children?: Unit[];
}

export type PatrolStatus =
  | "planned"
  | "assigned"
  | "ongoing"
  | "completed"
  | "cancelled"
  | "delayed";

export type PatrolType = "general-duties" | "combing-surveillance";

export type PatrolMethod =
  | "foot"
  | "motorcycle"
  | "four-wheeler"
  | "boat"
  | "cycle"
  | "aerial"
  | "elephant"
  | "horse"
  | "camel";

/**
 * Lifecycle of a special patrol authorization (PRD §6 — Patrol Permissions).
 * Rangers patrol their normal jurisdiction freely; anything outside it must
 * be covered by an authorization in one of these states.
 */
export type AuthorizationStatus =
  | "draft"
  | "pending"
  | "active"
  | "expired"
  | "revoked"
  | "completed"
  | "rejected";

/**
 * Jurisdiction validation of a patrol against the ranger's home area and any
 * special authorization that covers the patrol.
 *
 * `unknown` — the ranger's organizational home could not be resolved from
 * real data (no roster match / no assignment). This is a neutral data-gap
 * state, NOT a violation.
 */
export type JurisdictionState =
  | "normal"
  | "authorized-exception"
  | "pending-review"
  | "requires-review"
  | "unknown";

/**
 * Jurisdiction foundation (frontend data/context only — NOT enforcement).
 *
 * The operational rule to be enforced later: a beat officer / subordinate
 * normally patrols their assigned beat; cross-beat / cross-range patrols
 * require explicit administrative permission. This record is the shape the
 * frontend can carry today — `assignedBeatId` when that data exists — without
 * implementing final RBAC, roles or permission workflows.
 */
export interface BeatJurisdiction {
  rangerId: string;
  rangerName?: string;
  divisionId?: string;
  rangeId?: string;
  /** Beat the ranger normally patrols (assignedBeatId ?? beat fallback). */
  beatId?: string;
  /** Explicit assignment id, only when the data source provides it. */
  assignedBeatId?: string;
}

export interface AuthorizationEvent {
  time: string;
  user: string;
  action: string;
  description: string;
}

/** Special patrol authorization granted by a Super Admin / senior officer. */
export interface PatrolAuthorization {
  id: string;
  rangerId: string;
  homeDivision: string;
  homeRange: string;
  homeBeat: string;
  authDivision: string;
  authRange: string;
  authBeat: string;
  reason: string;
  instruction: string;
  patrolType: PatrolType;
  objective?: string;
  validFrom: string;
  validUntil: string;
  priority: "low" | "medium" | "high" | "critical";
  restrictions?: string;
  notes?: string;
  approvedBy?: string;
  approvalDate?: string;
  status: AuthorizationStatus;
  createdDate: string;
  history: AuthorizationEvent[];
}

export interface RangerRef {
  id: string;
  name: string;
}

export interface Patrol {
  id: string;
  code: string;
  title: string;
  /**
   * Semantic patrol type. No backend entity exists yet — always undefined
   * from real data (never a fabricated default). Movement mode lives in
   * `method` (WALK/BICYCLE/VEHICLE/STATIONARY).
   */
  type?: PatrolType;
  method?: PatrolMethod;
  status: PatrolStatus;
  objective: string;
  division: string;
  subDivision: string;
  range: string;
  beat: string;
  compartment?: string;
  teamId: string;
  leader: string;
  rangerId?: string;
  authorizationId?: string;
  members: string[];
  startScheduled: string;
  endScheduled?: string;
  startActual?: string;
  endActual?: string;
  distanceKm: number | null;
  durationMin: number;
  /** Real ForestGrid coverage (patrol detail only). null = PostGIS unavailable; absent = no data. */
  coveragePct?: number | null;
  /** No checkpoint entity/API exists — undefined from real data, never 0. */
  checkpoints?: number;
  incidents: number;
  observations: number;
  photos: number;
  notes?: string;
  route: { lat: number; lng: number }[];
  timeline: PatrolEvent[];
  templateId?: string;
}

export interface PatrolEvent {
  time: string;
  kind: "start" | "checkpoint" | "observation" | "incident" | "sos" | "end";
  label: string;
  ranger?: string;
  detail?: string;
}

export interface PatrolTemplate {
  id: string;
  name: string;
  type: PatrolType;
  objective: string;
  durationMin: number;
  checkpoints: number;
  areas: string;
  usedCount: number;
}

export interface PatrolReport {
  id: string;
  patrolId: string;
  code: string;
  title: string;
  type?: PatrolType;
  division: string;
  range: string;
  beat: string;
  leader: string;
  reportDate: string;
  period: string;
  durationMin: number;
  /** null = unavailable; 0 = genuinely zero distance. */
  distanceKm: number | null;
  /** Real value when available; absent (never 0) otherwise. */
  coveragePct?: number;
  checkpoints?: number;
  observations: number;
  incidents: number;
  photos: number;
  summary: string;
}

export type DutyStatus = "on-duty" | "off-duty" | "field" | "leave" | "offline";

export interface RangerEquipment {
  item: string;
  serial: string;
  condition: "serviceable" | "needs-maintenance" | "lost";
}

export interface Ranger {
  id: string;
  code: string;
  name: string;
  designation: string;
  dutyStatus: DutyStatus;
  phone?: string;
  joinYear: number;
  division: string;
  range: string;
  beat: string;
  /**
   * Jurisdiction foundation (not enforcement): the beat a ranger is assigned
   * to, when the data source provides it. Absent until the backend exposes
   * beat assignments; UI must treat absence as "unknown", never guess.
   */
  assignedBeatId?: string;
  teamId: string;
  emergencyContact?: string;
  bloodGroup?: string;
  stats: {
    patrols: number;
    distanceKm: number;
    fieldHours: number;
    /** Per-ranger coverage has no backend aggregate — undefined, never 0. */
    coveragePct?: number;
    observations: number;
    incidents: number;
  };
  equipment?: RangerEquipment[];
  vehicleId?: string;
  weaponId?: string;
  lastSync?: string;
}

export interface Team {
  id: string;
  name: string;
  leader: string;
  size: number;
  division: string;
  range: string;
  beat: string;
  onDuty: number;
  vehicleId?: string;
}

export interface Vehicle {
  id: string;
  code: string;
  type: string;
  model: string;
  plate: string;
  division: string;
  assignedTo?: string;
  status: "available" | "deployed" | "maintenance";
  lastService?: string;
  odometerKm: number;
}

export interface Weapon {
  id: string;
  code: string;
  type: string;
  caliber: string;
  division: string;
  holderId?: string;
  status: "issued" | "armory" | "maintenance";
  lastInspection?: string;
}

export interface EquipmentItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  distributed: number;
  division: string;
  status: "serviceable" | "low" | "depleted" | "maintenance";
}

export type ObservationCategory =
  | "wildlife"
  | "human-impact"
  | "water-body"
  | "mortality"
  | "forest-health"
  | "infrastructure"
  | "others";

export type ObservationSeverity = "low" | "medium" | "high" | "critical";
export type ObservationStatus = "open" | "under-review" | "resolved" | "escalated" | "rejected";

export interface ObservationMedia {
  type: "photo" | "audio";
  label: string;
  captureTime: string;
}

export interface Observation {
  id: string;
  code: string;
  category: ObservationCategory;
  subcategory: string;
  title: string;
  description: string;
  severity: ObservationSeverity;
  status: ObservationStatus;
  priority?: "normal" | "urgent";
  division: string;
  range: string;
  beat: string;
  recordedBy: string;
  recordedAt: string;
  patrolId?: string;
  groupSize?: string;
  species?: string;
  /** Real device coordinates; null when the field fix was unavailable (never 0,0). */
  lat: number | null;
  lng: number | null;
  media?: ObservationMedia[];
  actionTaken?: string;
  voiceNoteMin?: number;
  related?: string[];
}

export interface DashboardSummary {
  activePatrols: number;
  patrolsStartedToday: number;
  patrolsCompletedToday: number;
  rangersPatrolling: number;
  activeAuthorizations: number;
  crossJurisdictionPatrols: number;
  requiringReview: number;
  normalToday: number;
  authorizedToday: number;
  openIncidents: number;
  reportsToday: number;
  rangersOnDuty: number;
  rangersTotal: number;
  /** Division coverage — null when no authoritative source is available. */
  coveragePct: number | null;
  coverageToday: number | null;
  patrolsTotal: number;
  normalTotal: number;
  authorizedTotal: number;
  incidentsTotal: number;
  zeroPatrolZones: number;
  /** `days` only when the data source actually provides it (never fabricated). */
  zeroPatrolList: { beat: string; days?: number }[];
  byStatus: { status: PatrolStatus; count: number }[];
  incidentsToday: { id: string; title: string; severity: ObservationSeverity; time: string }[];
  recentReports: Observation[];
  todayPatrols: Patrol[];
  activity: { hour: string; patrols: number; reports: number }[];
  alerts: NotificationItem[];
  quickStats?: Record<string, number>;
  /** Range-level patrol density (division × ranges × cell values), real data. */
  heatmap?: { division: string; ranges: string[]; cells: number[] }[];
}

export type NotificationKind = "critical" | "warning" | "info" | "success";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  time: string;
  module: string;
  read: boolean;
  /** Real deep link when one exists (e.g. SOS → /sos#<incidentId>). */
  href?: string;
}

export interface SearchResult {
  kind: "patrol" | "ranger" | "observation" | "team" | "user" | "template";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export interface MapLayerDef {
  id: string;
  name: string;
  group: "basemap" | "activity" | "analysis";
  visible: boolean;
  color?: string;
  description?: string;
}

export interface TeamAnalytics {
  scope: string;
  patrols: number;
  activePatrols: number;
  coveragePct: number;
  incidents: number;
  observations: number;
  distanceKm: number;
  trend: number[];
}

export interface AnalyticsDataset {
  labels: string[];
  series: { name: string; values: number[] }[];
}

export interface KpiSeries {
  label: string;
  value: number;
  unit?: string;
  changePct: number;
}