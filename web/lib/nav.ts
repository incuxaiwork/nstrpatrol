import type { IconName } from "@/components/icons";
import type { BadgeTone } from "@/components/ui";
import type { DutyStatus, ObservationSeverity, ObservationStatus, PatrolStatus } from "@/lib/types";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: IconName;
  children?: { label: string; href: string }[];
}

export const navModules: NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "dashboard" },
  {
    key: "patrols",
    label: "Patrol Operations",
    href: "/patrols",
    icon: "route",
    children: [
      { label: "Patrol Dashboard", href: "/patrols" },
      { label: "All Patrols", href: "/patrols/all" },
      { label: "Ongoing Patrols", href: "/patrols/all?status=ongoing" },
      { label: "Completed Patrols", href: "/patrols/all?status=completed" },
      { label: "Patrol History", href: "/patrols/history" },
      { label: "Patrol Reports", href: "/patrols/reports" },
      { label: "Patrol Permissions", href: "/patrols/permissions" },
    ],
  },
  {
    key: "rangers",
    label: "Ranger Management",
    href: "/rangers",
    icon: "users",
    children: [
      { label: "Ranger Directory", href: "/rangers" },
      { label: "Create Ranger", href: "/rangers/new" },
      { label: "Teams", href: "/rangers/teams" },
      { label: "Vehicles", href: "/rangers/vehicles" },
      { label: "Weapons", href: "/rangers/weapons" },
      { label: "Equipment", href: "/rangers/equipment" },
    ],
  },
  {
    key: "observations",
    label: "Observations & Reports",
    href: "/observations",
    icon: "binoculars",
    children: [
      { label: "Observations Dashboard", href: "/observations" },
      { label: "All Observations", href: "/observations/list" },
    ],
  },
  { key: "gis", label: "GIS Intelligence", href: "/gis", icon: "map" },
  {
    key: "analytics",
    label: "Analytics & Insights",
    href: "/analytics",
    icon: "chart",
    children: [
      { label: "Forest Analytics", href: "/analytics" },
      { label: "Ranger Analytics", href: "/analytics/rangers" },
      { label: "Beat Analytics", href: "/analytics/beats" },
      { label: "Range Analytics", href: "/analytics/ranges" },
      { label: "Division Analytics", href: "/analytics/divisions" },
      { label: "Work Analytics", href: "/work-analytics" },
    ],
  },
  {
    key: "admin",
    label: "Administration",
    href: "/admin",
    icon: "settings",
    children: [
      { label: "Administration Dashboard", href: "/admin" },
      { label: "Users", href: "/admin/users" },
      { label: "Roles & Permissions", href: "/admin/roles" },
      { label: "Master Data", href: "/admin/master-data" },
      { label: "Audit Logs", href: "/admin/audit-logs" },
      { label: "System Settings", href: "/admin/settings" },
    ],
  },
];

export const patrolStatusTone: Record<PatrolStatus, BadgeTone> = {
  planned: "neutral",
  assigned: "info",
  ongoing: "success",
  completed: "forest",
  cancelled: "danger",
  delayed: "warning",
};

export const patrolStatusLabel: Record<PatrolStatus, string> = {
  planned: "Planned",
  assigned: "Assigned",
  ongoing: "Ongoing",
  completed: "Completed",
  cancelled: "Cancelled",
  delayed: "Delayed",
};

export const severityTone: Record<ObservationSeverity, BadgeTone> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
  critical: "danger",
};

export const severityLabel: Record<ObservationSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const observationStatusTone: Record<ObservationStatus, BadgeTone> = {
  open: "info",
  "under-review": "warning",
  resolved: "success",
  escalated: "danger",
};

export const observationStatusLabel: Record<ObservationStatus, string> = {
  open: "Open",
  "under-review": "Under review",
  resolved: "Resolved",
  escalated: "Escalated",
};

export const dutyStatusLabel: Record<DutyStatus, string> = {
  "on-duty": "On duty",
  "off-duty": "Off duty",
  field: "In field",
  leave: "On leave",
  offline: "Offline",
};

export const dutyStatusTone: Record<DutyStatus, BadgeTone> = {
  "on-duty": "forest",
  "off-duty": "neutral",
  field: "success",
  leave: "warning",
  offline: "danger",
};

/** Breadcrumb trail for a path — resolves module + section + record code. */
export function breadcrumbsFor(pathname: string): { label: string; href?: string }[] {
  const segs = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href?: string }[] = [{ label: "NSTR Patrol" }];

  const moduleFor = (seg: string): NavItem | undefined =>
    navModules.find((m) => m.href.split("/")[1] === seg);

  if (segs.length === 0) {
    crumbs.push({ label: "Dashboard", href: "/dashboard" });
    return crumbs;
  }
  const mod = moduleFor(segs[0]);
  crumbs.push({ label: mod ? mod.label : (segs[0] ?? ""), href: `/${segs[0]}` });

  if (segs.length > 1) {
    const child = mod?.children?.find((c) => c.href.split("/")[1] === segs[0] && c.href.split("/")[2] === segs[1]);
    if (child) crumbs.push({ label: child.label, href: child.href });
    else if (segs[1] === "all") crumbs.push({ label: "All Patrols", href: "/patrols/all" });
    else if (segs[1] === "history") crumbs.push({ label: "Patrol History", href: "/patrols/history" });
    else if (segs[1] === "permissions") crumbs.push({ label: "Patrol Permissions", href: "/patrols/permissions" });
    else if (segs[1] === "new") crumbs.push({ label: "Create" });
    else if (segs[1] === "replay") crumbs.push({ label: "Replay" });
    else if (/^[a-z0-9-]+$/.test(segs[1]) && segs[1].length < 24) crumbs.push({ label: decapitalize(segs[1]) });
  }
  return crumbs;
}

function decapitalize(s: string): string {
  const keep = ["team", "teams", "vehicles", "weapons", "equipment", "users", "roles", "master-data", "audit-logs", "settings", "divisions", "ranges", "beats", "rangers"];
  if (keep.includes(s)) {
    return s === "master-data" ? "Master Data" : s === "audit-logs" ? "Audit Logs" : s[0].toUpperCase() + s.slice(1);
  }
  return s.toUpperCase().includes("P-") || s.toUpperCase().includes("OB-") ? s.toUpperCase() : s;
}