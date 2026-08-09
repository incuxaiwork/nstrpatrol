/**
 * Mock data — forest hierarchy units (frontend-only, replaceable via services).
 */

export interface MockUnit {
  id: string;
  name: string;
  code: string;
  areaKm2: number;
}

export const mockDivisions: MockUnit[] = [
  { id: "d-north", name: "North Division", code: "ND", areaKm2: 4120 },
  { id: "d-central", name: "Central Division", code: "CD", areaKm2: 3890 },
  { id: "d-south", name: "South Division", code: "SD", areaKm2: 4830 },
];

export const mockRanges: Record<string, MockUnit[]> = {
  "d-north": [
    { id: "r-n1", name: "N-1 Range", code: "N1", areaKm2: 2100 },
    { id: "r-n2", name: "N-2 Range", code: "N2", areaKm2: 2020 },
  ],
  "d-central": [
    { id: "r-c1", name: "C-1 Range", code: "C1", areaKm2: 1950 },
    { id: "r-c2", name: "C-2 Range", code: "C2", areaKm2: 1940 },
  ],
  "d-south": [
    { id: "r-s1", name: "S-1 Range", code: "S1", areaKm2: 2380 },
    { id: "r-s2", name: "S-2 Range", code: "S2", areaKm2: 2450 },
  ],
};

export const mockBeats: Record<string, MockUnit[]> = {
  "r-n1": [
    { id: "b-n1a", name: "N1-A", code: "N1A", areaKm2: 690 },
    { id: "b-n1b", name: "N1-B", code: "N1B", areaKm2: 720 },
    { id: "b-n1c", name: "N1-C", code: "N1C", areaKm2: 690 },
  ],
  "r-n2": [
    { id: "b-n2a", name: "N2-A", code: "N2A", areaKm2: 1010 },
    { id: "b-n2b", name: "N2-B", code: "N2B", areaKm2: 1010 },
  ],
  "r-c1": [
    { id: "b-c1a", name: "C1-A", code: "C1A", areaKm2: 650 },
    { id: "b-c1b", name: "C1-B", code: "C1B", areaKm2: 650 },
    { id: "b-c1c", name: "C1-C", code: "C1C", areaKm2: 650 },
  ],
  "r-c2": [
    { id: "b-c2a", name: "C2-A", code: "C2A", areaKm2: 970 },
    { id: "b-c2b", name: "C2-B", code: "C2B", areaKm2: 970 },
  ],
  "r-s1": [
    { id: "b-s1a", name: "S1-A", code: "S1A", areaKm2: 1190 },
    { id: "b-s1b", name: "S1-B", code: "S1B", areaKm2: 1190 },
  ],
  "r-s2": [
    { id: "b-s2a", name: "S2-A", code: "S2A", areaKm2: 820 },
    { id: "b-s2b", name: "S2-B", code: "S2B", areaKm2: 810 },
    { id: "b-s2c", name: "S2-C", code: "S2C", areaKm2: 820 },
  ],
};

/** Human-friendly name lookup from a unit id. */
export const unitName = (id: string | undefined): string => {
  if (!id) return "—";
  const flat = [
    ...mockDivisions,
    ...Object.values(mockRanges).flat(),
    ...Object.values(mockBeats).flat(),
  ];
  return flat.find((u) => u.id === id)?.name ?? id;
};

export const mockBeatsNames = Object.values(mockBeats).flat().map((b) => b.name);