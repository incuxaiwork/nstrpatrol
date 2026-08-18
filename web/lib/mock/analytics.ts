/**
 * Mock data — analytics datasets (frontend-only via services).
 */

import { AnalyticsDataset, KpiSeries } from "@/lib/types";

export const weeklyActivity: AnalyticsDataset = {
  labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  series: [
    { name: "Patrols", values: [14, 18, 16, 21, 19, 12, 9] },
    { name: "Observations", values: [6, 9, 7, 12, 8, 5, 3] },
  ],
};

export const monthlyTrend = {
  labels: ["W1", "W2", "W3", "W4", "W5"],
  patrols: [62, 71, 68, 80, 74],
  coverage: [78, 82, 80, 86, 84],
};

export const patrolDurationSeries: AnalyticsDataset = {
  labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"],
  series: [
    { name: "Avg duration (min)", values: [210, 224, 218, 245, 252, 238, 246] },
  ],
};

export const incidentTrend: AnalyticsDataset = {
  labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"],
  series: [
    { name: "Poaching / trapping", values: [8, 6, 5, 4, 3, 2, 1] },
    { name: "Fire hazard", values: [1, 2, 3, 5, 7, 6, 3] },
    { name: "Encroachment", values: [4, 3, 4, 2, 2, 1, 1] },
  ],
};

export const wildlifeSightings: AnalyticsDataset = {
  labels: ["Tiger", "Elephant", "Leopard", "Deer", "Wild boar", "Bear"],
  series: [{ name: "Sightings", values: [23, 41, 12, 96, 58, 17] }],
};

export const humanImpactTrend: AnalyticsDataset = {
  labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"],
  series: [
    { name: "Poaching / trapping", values: [8, 6, 5, 4, 3, 2, 1] },
    { name: "Fire hazard", values: [1, 2, 3, 5, 7, 6, 3] },
    { name: "Encroachment", values: [4, 3, 4, 2, 2, 1, 1] },
  ],
};

export const waterBodyStatus: AnalyticsDataset = {
  labels: ["Waterhole", "Stream", "Seasonal pond", "Reservoir"],
  series: [{ name: "Sites surveyed", values: [14, 9, 7, 3] }],
};

export const mortalityTrend: AnalyticsDataset = {
  labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"],
  series: [
    { name: "Natural death", values: [3, 2, 4, 3, 2, 3, 2] },
    { name: "Poaching / snaring", values: [2, 1, 1, 0, 1, 0, 0] },
    { name: "Road / rail hit", values: [1, 2, 1, 2, 1, 2, 1] },
  ],
};

export const beatCoverage = {
  labels: ["Tummurukota", "Pasuvemula", "Nagulavaram", "Koppunuru", "Kandlgunta", "Zuvuku", "Gottipalli", "Sirigiripadu", "Gangalgunta", "Akkapalem"],
  values: [92, 74, 88, 91, 66, 95, 61, 82, 87, 55],
};

export const scopeKpis: Record<string, KpiSeries[]> = {
  forest: [
    { label: "Patrols (30d)", value: 344, changePct: 8.4 },
    { label: "Coverage", value: 82, unit: "%", changePct: 2.1 },
    { label: "Incidents", value: 58, changePct: -12.6 },
    { label: "Observations", value: 1412, changePct: 5.2 },
    { label: "Distance covered", value: 8420, unit: "km", changePct: 7.8 },
    { label: "Field hours", value: 11840, unit: "h", changePct: 4.3 },
  ],
  division: [
    { label: "Patrols (30d)", value: 113, changePct: 6.9 },
    { label: "Covert", value: 84, unit: "%", changePct: 1.4 },
    { label: "Incidents", value: 21, changePct: -8.2 },
    { label: "Observations", value: 468, changePct: 6.1 },
    { label: "Distance covered", value: 2810, unit: "km", changePct: 5.9 },
    { label: "Field hours", value: 3920, unit: "h", changePct: 3.7 },
  ],
  range: [
    { label: "Patrols (30d)", value: 57, changePct: 5.2 },
    { label: "Covert", value: 86, unit: "%", changePct: 0.9 },
    { label: "Incidents", value: 9, changePct: -3.5 },
    { label: "Observations", value: 221, changePct: 4.4 },
    { label: "Distance covered", value: 1438, unit: "km", changePct: 6.2 },
    { label: "Field hours", value: 2011, unit: "h", changePct: 2.8 },
  ],
  beat: [
    { label: "Patrols (30d)", value: 21, changePct: 3.8 },
    { label: "Covert", value: 88, unit: "%", changePct: 0.5 },
    { label: "Incidents", value: 2, changePct: -1.4 },
    { label: "Observations", value: 84, changePct: 3.1 },
    { label: "Distance covered", value: 540, unit: "km", changePct: 4.6 },
    { label: "Field hours", value: 762, unit: "h", changePct: 1.9 },
  ],
};

export const comparativeSeries: AnalyticsDataset = {
  labels: ["Division", "Range", "Beat"],
  series: [
    { name: "Patrols", values: [113, 57, 21] },
    { name: "Observations", values: [468, 221, 84] },
    { name: "Incidents", values: [21, 9, 2] },
  ],
};

export const heatmapPatrol = {
  divisions: ["Markapur"],
  ranges: ["V.P. South", "Y. Palem", "Nekkanti", "G.V. Palli", "Dornala", "Korraprolu", "Markapur"],
  values: [
    [87],
    [91],
    [95],
    [70],
    [58],
    [44],
    [62],
  ],
};