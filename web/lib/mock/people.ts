/**
 * Mock data — rangers, teams, vehicles, weapons, equipment.
 */

import { AnalyticsDataset, EquipmentItem, Ranger, Team, Vehicle, Weapon } from "@/lib/types";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

export const mockRangers: Ranger[] = [
  {
    id: "r-001", code: "R-001", name: "Aarav Sharma", designation: "Forest Guard",
    dutyStatus: "field", phone: "+91 90001 10001", joinYear: 2018,
    division: "d-markapur", range: "r-vp-south", beat: "b-vp-south-tummurukota", teamId: "t1",
    bloodGroup: "O+",
    stats: { patrols: 142, distanceKm: 1862, fieldHours: 2341, coveragePct: 92, observations: 74, incidents: 0 },
    equipment: [{ item: "Radio Set", serial: "RC-7781", condition: "serviceable" }],
    vehicleId: "v1", weaponId: "w1", lastSync: minutesAgo(4),
  },
  {
    id: "r-002", code: "R-002", name: "Bimla Devi", designation: "Forest Guard",
    dutyStatus: "on-duty", phone: "+91 98222 10002", joinYear: 2016,
    division: "d-markapur", range: "r-y-palem", beat: "b-y-palem-akkapalem", teamId: "t2",
    bloodGroup: "A+",
    stats: { patrols: 201, distanceKm: 2253, fieldHours: 2702, coveragePct: 88, observations: 61, incidents: 1 },
    equipment: [{ item: "GPS Device", serial: "GP-4412", condition: "serviceable" }],
    vehicleId: "v2", weaponId: "w2", lastSync: minutesAgo(9),
  },
  {
    id: "r-003", code: "R-003", name: "Chandra Mohan", designation: "Assistant Forest Ranger",
    dutyStatus: "off-duty", phone: "+91 90000 10003", joinYear: 2013,
    division: "d-markapur", range: "r-y-palem", beat: "b-y-palem-pullalacheruvu", teamId: "t2",
    bloodGroup: "O+",
    stats: { patrols: 240, distanceKm: 2711, fieldHours: 2910, coveragePct: 83, observations: 40, incidents: 2 },
    vehicleId: "v1", lastSync: hoursAgo(26),
  },
  {
    id: "r-004", code: "R-004", name: "Deepa Nair", designation: "Forest Guard",
    dutyStatus: "field", phone: "+91 90000 10004", joinYear: 2019,
    division: "d-markapur", range: "r-nekkanti", beat: "b-nekkanti-guttalachenu", teamId: "t3",
    bloodGroup: "AB+",
    stats: { patrols: 176, distanceKm: 1543, fieldHours: 2214, coveragePct: 90, observations: 88, incidents: 5 },
    weaponId: "w3", lastSync: minutesAgo(12),
  },
  {
    id: "r-006", code: "R-006", name: "Eknath Rao", designation: "Watchman",
    dutyStatus: "off-duty", joinYear: 2020,
    division: "d-markapur", range: "r-dornala", beat: "b-dornala-chintala", teamId: "t3",
    lastSync: hoursAgo(3),
    stats: { patrols: 121, distanceKm: 1310, fieldHours: 1723, coveragePct: 71, observations: 18, incidents: 0 },
  },
  {
    id: "r-007", code: "R-007", name: "Farhan Ali", designation: "Forest Guard",
    dutyStatus: "field", phone: "+91 90000 10007", joinYear: 2020,
    division: "d-markapur", range: "r-gv-palli", beat: "b-gv-palli-burugundala", teamId: "t4",
    bloodGroup: "B-",
    stats: { patrols: 145, distanceKm: 1621, fieldHours: 1982, coveragePct: 87, observations: 52, incidents: 2 },
    weaponId: "w5", lastSync: minutesAgo(7),
  },
  {
    id: "r-008", code: "R-008", name: "Gauri Patil", designation: "Forest Guard",
    dutyStatus: "offline", phone: "+91 90000 10008", joinYear: 2021,
    division: "d-markapur", range: "r-korraprolu", beat: "b-korraprolu-peddachama", teamId: "t4",
    stats: { patrols: 96, distanceKm: 982, fieldHours: 1240, coveragePct: 64, observations: 21, incidents: 0 },
    lastSync: hoursAgo(48),
  },
  {
    id: "r-009", code: "R-009", name: "Harsh Vardhan", designation: "Forest Guard",
    dutyStatus: "field", phone: "+91 90000 10009", joinYear: 2019,
    division: "d-markapur", range: "r-korraprolu", beat: "b-korraprolu-peddamantanala", teamId: "t5",
    stats: { patrols: 154, distanceKm: 1710, fieldHours: 2140, coveragePct: 84, observations: 44, incidents: 1 },
    lastSync: minutesAgo(15),
  },
  {
    id: "r-010", code: "R-010", name: "Ishita Sengupta", designation: "Forest Guard",
    joinYear: 2022, dutyStatus: "on-duty",
    division: "d-markapur", range: "r-nekkanti", beat: "b-nekkanti-nekkanti", teamId: "t3",
    lastSync: minutesAgo(22),
    stats: { patrols: 61, distanceKm: 740, fieldHours: 880, coveragePct: 58, observations: 12, incidents: 0 },
  },
  {
    id: "r-011", code: "R-011", name: "Jitendra Kashyap", designation: "Deputy Ranger",
    dutyStatus: "off-duty", phone: "+91 90000 10011", joinYear: 2015,
    division: "d-markapur", range: "r-vp-south", beat: "b-vp-south-nagulavaram", teamId: "t1",
    stats: { patrols: 312, distanceKm: 3690, fieldHours: 4520, coveragePct: 96, observations: 132, incidents: 11 },
    vehicleId: "v2", lastSync: hoursAgo(3),
  },
];

export const mockTeams: Team[] = [
  { id: "t1", name: "Alpha Response", leader: "Aarav Sharma", size: 6, division: "d-markapur", range: "r-vp-south", beat: "b-vp-south-tummurukota", onDuty: 4, vehicleId: "v1" },
  { id: "t2", name: "Bravo Patrol", leader: "Chandra Mohan", size: 5, division: "d-markapur", range: "r-y-palem", beat: "b-y-palem-akkapalem", onDuty: 5 },
  { id: "t3", name: "Charlie Unit", leader: "Deepa Nair", size: 4, division: "d-markapur", range: "r-nekkanti", beat: "b-nekkanti-guttalachenu", onDuty: 3, vehicleId: "v3" },
  { id: "t4", name: "Delta Squad", leader: "Farhan Ali", size: 4, division: "d-markapur", range: "r-gv-palli", beat: "b-gv-palli-burugundala", onDuty: 4, vehicleId: "v4" },
  { id: "t5", name: "Echo Night", leader: "Harsh Vardhan", size: 3, division: "d-markapur", range: "r-korraprolu", beat: "b-korraprolu-peddamantanala", onDuty: 2 },
];

export const mockVehicles: Vehicle[] = [
  { id: "v1", code: "VH-01", type: "Patrol Jeep", model: "Mahindra Bolero", plate: "MH 01 AB 2301", division: "d-markapur", assignedTo: "t1", status: "deployed", lastService: hoursAgo(240), odometerKm: 48201 },
  { id: "v2", code: "VH-02", type: "Pickup", model: "Tata Yodha", plate: "MH 01 AB 2302", division: "d-markapur", assignedTo: "t2", status: "deployed", lastService: hoursAgo(480), odometerKm: 61223 },
  { id: "v3", code: "VH-03", type: "Patrol Jeep", model: "Maruti Gypsy", plate: "MH 03 C 4401", division: "d-markapur", assignedTo: "t3", status: "deployed", lastService: hoursAgo(120), odometerKm: 35105 },
  { id: "v4", code: "VH-04", type: "Pickup", model: "Mahindra Scorpio", plate: "MH 08 D 5510", division: "d-markapur", assignedTo: "t4", status: "deployed", lastService: hoursAgo(340), odometerKm: 61840 },
  { id: "v5", code: "VH-05", type: "Motorcycle", model: "Royal Enfield B45", plate: "MH 08 D 5515", division: "d-markapur", status: "available", lastService: hoursAgo(72), odometerKm: 12400 },
];

export const mockWeapons: Weapon[] = [
  { id: "w1", code: "WP-01", type: "Rifle", caliber: "INSAS 5.56mm", division: "d-markapur", holderId: "r-001", status: "issued", lastInspection: hoursAgo(300) },
  { id: "w2", code: "WP-02", type: "Rifle", caliber: "SLR 7.62mm", division: "d-markapur", holderId: "r-002", status: "issued", lastInspection: hoursAgo(330) },
  { id: "w3", code: "WP-03", type: "Rifle", caliber: "INSAS 5.56mm", division: "d-markapur", holderId: "r-004", status: "issued", lastInspection: hoursAgo(200) },
  { id: "w4", code: "WP-04", type: "LMG", caliber: "INSAS 5.56mm", division: "d-markapur", status: "armory", lastInspection: hoursAgo(700) },
  { id: "w5", code: "WP-05", type: "Pump-action", caliber: "12 bore", division: "d-markapur", holderId: "r-007", status: "issued", lastInspection: hoursAgo(260) },
];

export const mockEquipment: EquipmentItem[] = [
  { id: "e1", name: "GPS Device", category: "Navigation", quantity: 20, distributed: 18, division: "d-markapur", status: "serviceable" },
  { id: "e2", name: "Radio Set", category: "Communication", quantity: 16, distributed: 13, division: "d-markapur", status: "low" },
  { id: "e3", name: "Binoculars", category: "Observation", quantity: 12, distributed: 12, division: "d-markapur", status: "serviceable" },
  { id: "e4", name: "Camera Trap", category: "Wildlife", quantity: 8, distributed: 3, division: "d-markapur", status: "serviceable" },
  { id: "e5", name: "Flashlight", category: "Field Kit", quantity: 20, distributed: 19, division: "d-markapur", status: "low" },
  { id: "e6", name: "First Aid Kit", category: "Medical", quantity: 6, distributed: 6, division: "d-markapur", status: "maintenance" },
];

/** Monthly performance trend per ranger (PRD §7 — performance trend review). */
export const rangerTrends: Record<string, AnalyticsDataset> = {
  "r-001": {
    labels: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
    series: [
      { name: "Patrols", values: [16, 18, 15, 21, 19, 17] },
      { name: "Coverage %", values: [84, 88, 86, 94, 92, 91] },
    ],
  },
  "r-002": {
    labels: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
    series: [
      { name: "Patrols", values: [19, 22, 18, 20, 24, 21] },
      { name: "Coverage %", values: [82, 86, 84, 90, 91, 88] },
    ],
  },
  "r-003": {
    labels: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
    series: [
      { name: "Patrols", values: [21, 19, 23, 20, 22, 18] },
      { name: "Coverage %", values: [86, 83, 87, 85, 88, 83] },
    ],
  },
  "r-004": {
    labels: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
    series: [
      { name: "Patrols", values: [15, 17, 19, 18, 20, 16] },
      { name: "Coverage %", values: [80, 85, 87, 89, 91, 90] },
    ],
  },
  "r-006": {
    labels: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
    series: [
      { name: "Patrols", values: [11, 13, 12, 15, 14, 12] },
      { name: "Coverage %", values: [62, 66, 64, 72, 70, 71] },
    ],
  },
  "r-007": {
    labels: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
    series: [
      { name: "Patrols", values: [13, 15, 14, 17, 16, 14] },
      { name: "Coverage %", values: [78, 82, 81, 88, 86, 87] },
    ],
  },
  "r-008": {
    labels: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
    series: [
      { name: "Patrols", values: [9, 11, 10, 12, 11, 9] },
      { name: "Coverage %", values: [55, 58, 57, 63, 62, 64] },
    ],
  },
  "r-009": {
    labels: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
    series: [
      { name: "Patrols", values: [14, 16, 15, 18, 17, 15] },
      { name: "Coverage %", values: [76, 80, 79, 85, 84, 84] },
    ],
  },
  "r-010": {
    labels: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
    series: [
      { name: "Patrols", values: [6, 8, 9, 10, 9, 7] },
      { name: "Coverage %", values: [48, 52, 55, 60, 58, 58] },
    ],
  },
  "r-011": {
    labels: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
    series: [
      { name: "Patrols", values: [24, 26, 25, 28, 27, 24] },
      { name: "Coverage %", values: [90, 93, 92, 96, 95, 96] },
    ],
  },
};