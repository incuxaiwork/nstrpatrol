/**
 * Mock data — administration module (users, roles, permissions, master data).
 */

import {
  AdminUser,
  AuditEntry,
  MasterData,
  NotificationTemplate,
  PermissionEntry,
  Role,
  SiteSettings,
} from "@/lib/types";

export const mockUsers: AdminUser[] = [
  { id: "u1", name: "Suresh Iyer", email: "suresh.iyer@nstr.gov.in", roleId: "admin", status: "active", division: "d-markapur", lastActive: new Date(Date.now() - 12 * 60_000).toISOString(), created: "2023-01-15" },
  { id: "u2", name: "Meena Krishnan", email: "meena.krishnan@nstr.gov.in", roleId: "dfo", status: "active", division: "d-markapur", lastActive: new Date(Date.now() - 45 * 60_000).toISOString(), created: "2023-02-01" },
  { id: "u3", name: "Arjun Mehta", email: "arjun.mehta@nstr.gov.in", roleId: "range-officer", status: "active", division: "d-markapur", lastActive: new Date(Date.now() - 3 * 3_600_000).toISOString(), created: "2023-03-10" },
  { id: "u4", name: "Priya Nair", email: "priya.nair@nstr.gov.in", roleId: "forest-officer", status: "active", division: "d-markapur", lastActive: new Date(Date.now() - 90 * 60_000).toISOString(), created: "2023-04-22" },
  { id: "u5", name: "Vikram Singh", email: "vikram.singh@nstr.gov.in", roleId: "admin", status: "invited", division: "d-markapur", created: "2024-11-02" },
  { id: "u6", name: "Tara Das", email: "tara.das@nstr.gov.in", roleId: "forest-officer", status: "active", division: "d-markapur", lastActive: new Date(Date.now() - 2 * 3_600_000).toISOString(), created: "2023-06-18" },
  { id: "u7", name: "Ravi Kumar", email: "ravi.kumar@nstr.gov.in", roleId: "range-officer", status: "disabled", division: "d-markapur", created: "2023-08-09" },
];

export const mockRoles: Role[] = [
  {
    id: "admin", name: "Administrator", description: "Full system governance: users, roles, permissions, master data, settings.",
    userCount: 2, system: true,
    permissions: {
      dashboard: "full", patrols: "full", rangers: "full", observations: "full", gis: "full", analytics: "full", administration: "full",
    },
  },
  {
    id: "dfo", name: "DFO", description: "Division-level oversight, analytics and reporting.", userCount: 1, system: true,
    permissions: {
      dashboard: "full", patrols: "view", rangers: "view", observations: "view", gis: "view", analytics: "full", administration: "none",
    },
  },
  {
    id: "range-officer", name: "Range Officer", description: "Manages patrols and rangers within assigned range.", userCount: 2, system: true,
    permissions: {
      dashboard: "view", patrols: "manage", rangers: "manage", observations: "manage", gis: "manage", analytics: "view", administration: "none",
    },
  },
  {
    id: "forest-officer", name: "Forest Officer", description: "Operational review of assigned scope.", userCount: 2, system: true,
    permissions: {
      dashboard: "view", patrols: "view", rangers: "view", observations: "view", gis: "view", analytics: "view", administration: "none",
    },
  },
  {
    id: "auditor", name: "Auditor", description: "Read-only review across modules including audit logs.", userCount: 0, system: false,
    permissions: {
      dashboard: "view", patrols: "view", rangers: "view", observations: "view", gis: "view", analytics: "view", administration: "view",
    },
  },
];

export const permissionMatrix: PermissionEntry[] = [
  { module: "dashboard", label: "Dashboard", levels: [{ label: "Full", value: "full" }, { label: "View", value: "view" }, { label: "None", value: "none" }] },
  { module: "patrols", label: "Patrol Operations", levels: [{ label: "Full", value: "full" }, { label: "Manage", value: "manage" }, { label: "View", value: "view" }, { label: "None", value: "none" }] },
  { module: "rangers", label: "Ranger Management", levels: [{ label: "Full", value: "full" }, { label: "Manage", value: "manage" }, { label: "View", value: "view" }, { label: "None", value: "none" }] },
  { module: "observations", label: "Observations & Reports", levels: [{ label: "Full", value: "full" }, { label: "Manage", value: "manage" }, { label: "View", value: "view" }, { label: "None", value: "none" }] },
  { module: "gis", label: "GIS Intelligence", levels: [{ label: "Full", value: "full" }, { label: "Analyze", value: "manage" }, { label: "View", value: "view" }, { label: "None", value: "none" }] },
  { module: "analytics", label: "Analytics & Insights", levels: [{ label: "Full", value: "full" }, { label: "View", value: "view" }, { label: "None", value: "none" }] },
  { module: "administration", label: "Administration", levels: [{ label: "Full", value: "full" }, { label: "View", value: "view" }, { label: "None", value: "none" }] },
];

export const mockAudit: AuditEntry[] = [
  { id: "a1", user: "Suresh Iyer", action: "Created user", target: "Priya Nair", module: "Administration", time: new Date(Date.now() - 40 * 60_000).toISOString(), ip: "10.0.4.12" },
  { id: "a2", user: "Suresh Iyer", action: "Updated role", target: "Range Officer", module: "Administration", time: new Date(Date.now() - 5 * 3_600_000).toISOString(), ip: "10.0.4.12" },
  { id: "a3", user: "Meena Krishnan", action: "Exported analytics", target: "Division summary", module: "Analytics & Insights", time: new Date(Date.now() - 9 * 3_600_000).toISOString(), ip: "10.0.6.7" },
  { id: "a4", user: "Arjun Mehta", action: "Created patrol", target: "P-2026-0112", module: "Patrol Operations", time: new Date(Date.now() - 13 * 3_600_000).toISOString(), ip: "10.0.5.3" },
  { id: "a5", user: "System", action: "Prisma migrate", target: "patrol_telemetry_aggregates", module: "Backend", time: new Date(Date.now() - 30 * 3_600_000).toISOString(), ip: "127.0.0.1" },
  { id: "a6", user: "Priya Nair", action: "Updated master data", target: "Species — Bengal Tiger", module: "Administration", time: new Date(Date.now() - 2 * 86_400_000).toISOString(), ip: "10.0.6.9" },
];

export const mockSettings: SiteSettings = {
  siteName: "NSTR Patrol Admin",
  timezone: "Asia/Kolkata",
  syncWindowHours: 24,
  sosWindowMin: 30,
  heatmapSensitivity: 0.6,
  offlineGraceHours: 48,
};

export const mockNotificationTemplates: NotificationTemplate[] = [
  { id: "nt1", name: "SOS raised", kind: "Critical", subject: "SOS — {ranger} at {beat}", body: "Ranger {ranger} raised an SOS at {beat} at {time}. Immediate response required.", enabled: true },
  { id: "nt2", name: "Patrol delayed", kind: "Warning", subject: "Patrol {code} delayed", body: "Patrol {code} is {minutes} minutes behind schedule.", enabled: true },
  { id: "nt3", name: "Zero patrol reminder", kind: "Warning", subject: "No patrol in {beat}", body: "No patrol coverage in {beat} for {days} days.", enabled: true },
  { id: "nt4", name: "Report escalated", kind: "Info", subject: "Report {code} escalated", body: "Observation {code} was escalated by {user}.", enabled: true },
];

export const mockMasterData: MasterData = {
  species: [
    { id: "sp1", name: "Bengal Tiger", category: "Mammal", status: "threatened" },
    { id: "sp2", name: "Asian Elephant", category: "Mammal", status: "threatened" },
    { id: "sp3", name: "Leopard", category: "Mammal", status: "present" },
    { id: "sp4", name: "Spotted Deer", category: "Mammal", status: "present" },
    { id: "sp5", name: "Wild Boar", category: "Mammal", status: "present" },
    { id: "sp6", name: "Hornbill", category: "Bird", status: "present" },
    { id: "sp7", name: "Gharial", category: "Reptile", status: "rare" },
  ],
  categories: [
    { id: "c1", name: "Wildlife", mappedTo: "wildlife", active: true },
    { id: "c2", name: "Human Impact", mappedTo: "human-impact", active: true },
    { id: "c3", name: "Water Body", mappedTo: "water-body", active: true },
    { id: "c4", name: "Animal Mortality", mappedTo: "mortality", active: true },
    { id: "c5", name: "Forest Health", mappedTo: "forest-health", active: true },
    { id: "c6", name: "Infrastructure", mappedTo: "infrastructure", active: true },
    { id: "c7", name: "Others", mappedTo: "others", active: true },
  ],
  waterBodyTypes: [
    { id: "wb1", name: "Waterhole", active: true },
    { id: "wb2", name: "Stream", active: true },
    { id: "wb3", name: "Seasonal pond", active: true },
    { id: "wb4", name: "Reservoir", active: true },
  ],
  patrolTypes: [
    { id: "pt1", name: "General Duties", active: true },
    { id: "pt2", name: "Combing & Surveillance", active: true },
  ],
  patrolObjectives: [
    { id: "po1", name: "Anti-poaching sweep", active: true },
    { id: "po2", name: "Night foot patrol", active: true },
    { id: "po3", name: "Water body census", active: true },
    { id: "po4", name: "SOC verification", active: true },
    { id: "po5", name: "Track follow-up", active: true },
  ],
  vehicleTypes: [
    { id: "vt1", name: "Patrol Jeep", active: true },
    { id: "vt2", name: "Pickup", active: true },
    { id: "vt3", name: "Motorcycle", active: true },
  ],
  weaponTypes: [
    { id: "wt1", name: "0.315 bolt-action rifle", active: true },
    { id: "wt2", name: "12-gauge shotgun", active: true },
    { id: "wt3", name: "Non-lethal launcher", active: true },
    { id: "wt4", name: "Tranquilizer gun", active: true },
    { id: "wt5", name: "Pump-action shotgun", active: false },
  ],
};