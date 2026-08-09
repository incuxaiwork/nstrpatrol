/**
 * Mock data — observations/reports + notification center + global search index.
 */

import {
  NotificationItem,
  Observation,
  PatrolStatus,
  SearchResult,
} from "@/lib/types";
import { mockPatrols } from "@/lib/mock/patrols";
import { mockRangers, mockTeams } from "@/lib/mock/people";

export const patrolStatusLabel = (s: PatrolStatus): string =>
  ({ planned: "Planned", assigned: "Assigned", ongoing: "Ongoing", completed: "Completed", cancelled: "Cancelled", delayed: "Delayed" })[s];

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

export const categoryMeta: Record<
  Observation["category"],
  { label: string; plural: string; color: string }
> = {
  wildlife: { label: "Wildlife", plural: "Wildlife sightings", color: "#2E7D32" },
  "human-impact": { label: "Human Impact", plural: "Human impact reports", color: "#B3261E" },
  "water-body": { label: "Water Body", plural: "Water body surveys", color: "#1B365D" },
  mortality: { label: "Animal Mortality", plural: "Mortality cases", color: "#6d4c41" },
  "forest-health": { label: "Forest Health", plural: "Forest health checks", color: "#1F4626" },
  infrastructure: { label: "Infrastructure", plural: "Infrastructure issues", color: "#FF8F00" },
};

export const mockObservations: Observation[] = [
  {
    id: "ob-9001", code: "OB-9001", category: "wildlife", subcategory: "Indirect sign",
    title: "Tiger pugmarks near N1-A waterhole",
    description: "Fresh pugmarks (approx. 5 x 4.5 cm) found on the eastern bank of the N1-A waterhole. Estimated 1-2 days old. Direction of travel north-east towards N1-B.",
    severity: "high", status: "under-review", priority: "urgent",
    division: "d-north", range: "r-n1", beat: "b-n1a",
    recordedBy: "Aarav Sharma", recordedAt: minutesAgo(36), patrolId: "p-2026-0118",
    species: "Bengal Tiger", lat: 27.431, lng: 84.196,
    media: [{ type: "photo", label: "Pug marks", captureTime: minutesAgo(38) }],
    actionTaken: "Advisory issued to villages N-1 cluster B", related: ["ob-9004"],
  },
  {
    id: "ob-9002", code: "OB-9002", category: "human-impact", subcategory: "Poaching / trapping",
    title: "Snare found at N2-A riverine belt",
    description: "Wire snare discovered near the riverine belt with bait. Snare confiscated and reported. Suspected poaching activity in area.",
    severity: "critical", status: "escalated", priority: "urgent",
    division: "d-north", range: "r-n2", beat: "b-n2a",
    recordedBy: "Chandra Mohan", recordedAt: hoursAgo(7), patrolId: "p-2026-0117",
    lat: 27.462, lng: 84.351,
    media: [{ type: "photo", label: "Snare", captureTime: hoursAgo(7.4) }],
    actionTaken: "Snare removed; area combed twice", voiceNoteMin: 42,
  },
  {
    id: "ob-9003", code: "OB-9003", category: "water-body", severity: "low",
    title: "N1-A waterhole partially dry",
    description: "Seasonal regression observed; water slightly turbid. Bank usage by khakhar visible.",
    subcategory: "Water hole",
    division: "d-north", range: "r-n1", beat: "b-n1a",
    recordedBy: "Bimla Devi", recordedAt: hoursAgo(20), patrolId: "p-2026-0116",
    lat: 27.44, lng: 84.2, status: "open",
    media: [{ type: "photo", label: "Waterhole", captureTime: hoursAgo(20) }],
  },
  {
    id: "ob-9004", code: "OB-9004", category: "wildlife", subcategory: "Direct sighting",
    title: "Herd of 6 elephants near S2-B",
    description: "Herd moving along western boundary road, causing traffic advisories. Follows previous track identified in the region.",
    severity: "high", status: "open", priority: "urgent",
    division: "d-south", range: "r-s2", beat: "b-s2b",
    recordedBy: "Harsh Vardhan", recordedAt: hoursAgo(3), patrolId: "p-2026-0114",
    lat: 27.364, lng: 84.05,
    media: [{ type: "photo", label: "Herd", captureTime: hoursAgo(3.2) }, { type: "audio", label: "Village alert", captureTime: hoursAgo(3.1) }],
    related: ["ob-9001"],
  },
  {
    id: "ob-9005", code: "OB-9005", category: "mortality", subcategory: "Natural death",
    title: "Deer carcass reported",
    description: "Carcass of adult spotted deer found. No external injuries; suspected poisoning yet to be confirmed with forest veterinary team.",
    severity: "medium", status: "under-review",
    division: "d-central", range: "r-c1", beat: "b-c1b",
    recordedBy: "Ishita Sengupta", recordedAt: hoursAgo(26),
    lat: 27.12, lng: 83.87,
    media: [{ type: "photo", label: "Carcass site", captureTime: hoursAgo(26) }],
  },
  {
    id: "ob-9006", code: "OB-9006", category: "forest-health", subcategory: "Infestation",
    title: "Borer damage in C2 teak plantation",
    description: "Leaf borer damage affecting young plantation. Spot treatment campaign recommended.",
    severity: "medium", status: "under-review",
    division: "d-central", range: "r-c2", beat: "b-c2a",
    recordedBy: "Meera Joshi", recordedAt: hoursAgo(8),
    lat: 26.93, lng: 84.14,
    media: [{ type: "photo", label: "Leaf sample", captureTime: hoursAgo(8) }],
  },
  {
    id: "ob-9007", code: "OB-9007", category: "infrastructure", subcategory: "Road condition",
    title: "S1-A patrol trail blocked",
    description: "Treefall blocking trail near S1 beat boundary. Access to S2 affected.",
    severity: "low", status: "open",
    division: "d-south", range: "r-s1", beat: "b-s1a",
    recordedBy: "Farhan Ali", recordedAt: hoursAgo(1),
    lat: 27.28, lng: 84.01,
  },
  {
    id: "ob-9008", code: "OB-9008", category: "human-impact", subcategory: "Fire hazard",
    title: "Drunken party trace near N1 road",
    description: "Cigarette butts and liquor bottles found near the N1 road edge. Silviculture zone at risk from fire outbreak.",
    severity: "high", status: "escalated", priority: "urgent",
    division: "d-north", range: "r-n1", beat: "b-n1b",
    recordedBy: "Ram Verma", recordedAt: hoursAgo(5),
    lat: 27.39, lng: 84.16,
    media: [{ type: "photo", label: "Debris", captureTime: hoursAgo(5.1) }],
    actionTaken: "Complaint filed with local police; fire line created",
  },
];

export const mockNotifications: NotificationItem[] = [
  { id: "n1", kind: "critical", title: "SOS received — S2-C", body: "Gauri Patil triggered SOS from S2-C boundary. Response team dispatched.", time: minutesAgo(12), module: "Patrol Operations", read: false },
  { id: "n2", kind: "warning", title: "Patrol P-2026-0111 delayed", body: "East fringe SOC check has not departed on schedule.", time: minutesAgo(25), module: "Patrol Operations", read: false },
  { id: "n3", kind: "warning", title: "Zero patrol zone flagged", body: "C2-B beat shows no patrol coverage in 14 days.", time: minutesAgo(40), module: "GIS Intelligence", read: false },
  { id: "n4", kind: "info", title: "New observation OB-9001", body: "Tiger pock marks logged by Aarav Sharma.", time: minutesAgo(36), module: "Observations & Reports", read: false },
  { id: "n5", kind: "success", title: "Patrol completed", body: "N2-A combing operation completed with 92% coverage.", time: hoursAgo(6), module: "Patrol Operations", read: true },
  { id: "n6", kind: "info", title: "Team Alpha went on duty", body: "4 of 6 members checked in at N1-A.", time: hoursAgo(8), module: "Ranger Management", read: true },
];

export const searchIndex: SearchResult[] = [
  ...mockPatrols.map((p) => ({
    kind: "patrol" as const, id: p.id, title: `${p.code} — ${p.title}`,
    subtitle: `${patrolStatusLabel(p.status)} · ${p.beat} · ${p.leader}`,
    href: `/patrols/${p.id}`,
  })),
  ...mockRangers.map((r) => ({
    kind: "ranger" as const, id: r.id, title: r.name,
    subtitle: `${r.code} · ${r.designation}`,
    href: `/rangers/${r.id}`,
  })),
  ...mockObservations.map((o) => ({
    kind: "observation" as const, id: o.id, title: `${o.code} — ${o.title}`,
    subtitle: `${categoryMeta[o.category].label} · ${o.beat}`,
    href: `/observations/${o.id}`,
  })),
  ...mockTeams.map((t) => ({
    kind: "team" as const, id: t.id, title: t.name,
    subtitle: `Team · ${t.size} members`,
    href: `/rangers/teams`,
  })),
] as SearchResult[];