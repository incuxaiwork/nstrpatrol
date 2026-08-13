/**
 * Mock spatial data for the GIS Intelligence workspace.
 * Beats are laid out on a grid (viewBox 0 0 1000 700) for the mock map.
 */

import { MapLayerDef } from "@/lib/types";

export interface BeatPolygon {
  id: string;
  name: string;
  division: string;
  range: string;
  points: string; // SVG polygon points
  coveragePct: number;
  isZeroPatrol?: boolean;
}

export interface GisMarker {
  id: string;
  kind: "ranger" | "observation" | "patrol" | "sos" | "incident";
  label: string;
  x: number;
  y: number;
  tone?: string;
}

export interface GisRoute {
  id: string;
  patrolId: string;
  label: string;
  status: string;
  points: string; // SVG polyline points
  color: string;
  timedPoints?: { x: number; y: number; t: number }[];
}

export interface HeatBlock {
  x: number;
  y: number;
  w: number;
  h: number;
  intensity: number; // 0..1
}

export const mapBeatsRaw: BeatPolygon[] = [
  { id: "b-n1a", name: "N1-A", division: "d-north", range: "r-n1", coveragePct: 92, points: "60,60 330,60 330,250 60,250" },
  { id: "b-n1b", name: "N1-B", division: "d-north", range: "r-n1", coveragePct: 74, points: "340,60 590,60 590,250 340,250" },
  { id: "b-n1c", name: "N1-C", division: "d-north", range: "r-n1", coveragePct: 88, points: "600,60 900,60 900,250 600,250" },
  { id: "b-n2a", name: "N2-A", division: "d-north", range: "r-n2", coveragePct: 91, points: "100,260 330,260 330,470 100,470" },
  { id: "b-n2b", name: "N2-B", division: "d-north", range: "r-n2", coveragePct: 66, points: "340,260 590,260 590,470 340,470" },
  { id: "b-c1a", name: "C1-A", division: "d-central", range: "r-c1", coveragePct: 95, points: "100,480 330,480 330,690 100,690" },
  { id: "b-c1b", name: "C1-B", division: "d-central", range: "r-c1", coveragePct: 61, points: "340,480 590,480 590,690 340,690", isZeroPatrol: true },
  { id: "b-c1c", name: "C1-C", division: "d-central", range: "r-c1", coveragePct: 82, points: "600,480 900,480 900,690 600,690" },
  { id: "b-s1a", name: "S1-A", division: "d-south", range: "r-s1", coveragePct: 87, points: "100,700 330,700 330,910 100,910" },
  { id: "b-s1b", name: "S1-B", division: "d-south", range: "r-s1", coveragePct: 55, points: "340,700 590,700 590,910 340,910", isZeroPatrol: true },
  { id: "b-s2a", name: "S2-A", division: "d-south", range: "r-s2", coveragePct: 64, points: "600,700 900,700 900,910 600,910" },
  { id: "b-s2b", name: "S2-B", division: "d-south", range: "r-s2", coveragePct: 88, points: "60,60 100,60 100,910 60,910" },
];

export const gisMarkers: GisMarker[] = [
  { id: "m1", kind: "ranger", label: "R-001 · Aarav", x: 205, y: 150 },
  { id: "m2", kind: "ranger", label: "R-002 · Bimla", x: 460, y: 360 },
  { id: "m3", kind: "ranger", label: "R-004 · Deepa", x: 260, y: 560 },
  { id: "m4", kind: "ranger", label: "R-006 · Farhan", x: 780, y: 760 },
  { id: "m5", kind: "observation", label: "OB-9001 pugmarks", x: 240, y: 130 },
  { id: "m6", kind: "observation", label: "OB-9002 snare", x: 450, y: 380 },
  { id: "m7", kind: "observation", label: "OB-9004 elephant herd", x: 720, y: 820 },
  { id: "m8", kind: "incident", label: "Fire hazard N1 road", x: 400, y: 210 },
  { id: "m9", kind: "sos", label: "SOS S2-C", x: 800, y: 240, tone: "#B3261E" },
];

export const gisRoutes: GisRoute[] = [
  {
    id: "rt1", patrolId: "p-2026-0118", label: "N1-A sweep", status: "ongoing", color: "#2E7D32",
    points: "150,140 205,180 270,120 330,150",
    timedPoints: [
      { x: 150, y: 140, t: 0 },
      { x: 205, y: 178, t: 0.45 },
      { x: 270, y: 122, t: 0.8 },
      { x: 330, y: 150, t: 1 },
    ],
  },
  {
    id: "rt2", patrolId: "p-2026-0117", label: "N2-A combing", status: "completed", color: "#1B365D",
    points: "120,300 260,330 360,290 470,380",
  },
  {
    id: "rt3", patrolId: "p-2026-0116", label: "C1 water census", status: "completed", color: "#4A6572",
    points: "110,520 220,490 260,560 330,520",
  },
  {
    id: "rt4", patrolId: "p-2026-0114", label: "S2-B track follow", status: "completed", color: "#8A7755",
    points: "620,760 720,780 830,840",
  },
];

export const gisHeat: HeatBlock[] = [
  { x: 100, y: 110, w: 240, h: 140, intensity: 0.85 },
  { x: 350, y: 260, w: 240, h: 200, intensity: 0.55 },
  { x: 350, y: 480, w: 240, h: 200, intensity: 0.7 },
  { x: 100, y: 480, w: 240, h: 200, intensity: 0.3 },
  { x: 600, y: 700, w: 290, h: 200, intensity: 0.75 },
  { x: 100, y: 700, w: 230, h: 200, intensity: 0.15 },
  { x: 340, y: 700, w: 240, h: 200, intensity: 0.2 },
];

export const zeroPatrolZones = ["b-c1b", "b-s1b", "b-n2b"];

export const defaultLayers: MapLayerDef[] = [
  { id: "basemap", name: "Basemap / boundaries", group: "basemap", visible: true, color: "#1F4626" },
  { id: "beats", name: "Beat boundaries", group: "basemap", visible: true, color: "#37554a" },
  { id: "water", name: "Water bodies", group: "basemap", visible: true, color: "#1B365D" },
  { id: "roads", name: "Patrol trails", group: "basemap", visible: true, color: "#8A7755" },
  { id: "patrols", name: "Active patrols", group: "activity", visible: true, color: "#2E7D32" },
  { id: "rangers", name: "Ranger positions", group: "activity", visible: true, color: "#1B365D" },
  { id: "observations", name: "Observations", group: "activity", visible: true, color: "#B3261E" },
  { id: "incidents", name: "Incidents / SOS", group: "activity", visible: true, color: "#B3261E" },
  { id: "authareas", name: "Patrol authorization areas", group: "analysis", visible: false, color: "#FF8F00", description: "Active special patrol authorizations outside the normal jurisdiction" },
  { id: "coverage", name: "Coverage density", group: "analysis", visible: false, color: "#FF8F00" },
  { id: "heat", name: "Activity heatmap", group: "analysis", visible: false, color: "#B3261E" },
  { id: "zeropatrol", name: "Zero patrol zones", group: "analysis", visible: true, color: "#B3261E" },
];