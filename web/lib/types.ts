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

export interface RangerRef {
  id: string;
  name: string;
}

export interface Patrol {
  id: string;
  code: string;
  title: string;
  type: PatrolType;
  method?: PatrolMethod;
  status: PatrolStatus;
  objective: string;
  division: string;
  range: string;
  beat: string;
  compartment?: string;
  teamId: string;
  leader: string;
  members: string[];
  startScheduled: string;
  endScheduled?: string;
  startActual?: string;
  endActual?: string;
  distanceKm: number;
  durationMin: number;
  coveragePct: number;
  checkpoints: number;
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
  type: PatrolType;
  division: string;
  range: string;
  beat: string;
  leader: string;
  reportDate: string;
  period: string;
  durationMin: number;
  distanceKm: number;
  coveragePct: number;
  checkpoints: number;
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
  teamId: string;
  emergencyContact?: string;
  bloodGroup?: string;
  stats: {
    patrols: number;
    distanceKm: number;
    fieldHours: number;
    coveragePct: number;
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
export type ObservationStatus = "open" | "under-review" | "resolved" | "escalated";

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
  lat: number;
  lng: number;
  media?: ObservationMedia[];
  actionTaken?: string;
  voiceNoteMin?: number;
  related?: string[];
}

export interface DashboardSummary {
  activePatrols: number;
  completedToday: number;
  openIncidents: number;
  reportsToday: number;
  rangersOnDuty: number;
  rangersTotal: number;
  coveragePct: number;
  zeroPatrolZones: number;
  zeroPatrolList: { beat: string; days: number }[];
  byStatus: { status: PatrolStatus; count: number }[];
  incidentsToday: { title: string; severity: ObservationSeverity; time: string }[];
  recentReports: Observation[];
  todayPatrols: Patrol[];
  activity: { hour: string; patrols: number; reports: number }[];
  alerts: NotificationItem[];
  quickStats?: Record<string, number>;
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
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  roleId: string;
  status: "active" | "invited" | "disabled";
  division: string;
  lastActive?: string;
  created: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  userCount: number;
  system: boolean;
  permissions: Record<string, "full" | "view" | "manage" | "none">;
}

export interface PermissionEntry {
  module: string;
  label: string;
  levels: { label: string; value: "full" | "view" | "manage" | "none" }[];
}

export interface AuditEntry {
  id: string;
  user: string;
  action: string;
  target: string;
  module: string;
  time: string;
  ip: string;
}

export interface SiteSettings {
  siteName: string;
  timezone: string;
  syncWindowHours: number;
  sosWindowMin: number;
  heatmapSensitivity: number;
  offlineGraceHours: number;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  kind: string;
  subject: string;
  body: string;
  enabled: boolean;
}

export interface MasterData {
  species: { id: string; name: string; category: string; status: "present" | "rare" | "introduced" | "threatened" }[];
  categories: { id: string; name: string; mappedTo: string; active: boolean }[];
  waterBodyTypes: { id: string; name: string; active: boolean }[];
  patrolTypes: { id: string; name: string; active: boolean }[];
  patrolObjectives: { id: string; name: string; active: boolean }[];
  vehicleTypes: { id: string; name: string; active: boolean }[];
  weaponTypes: { id: string; name: string; active: boolean }[];
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