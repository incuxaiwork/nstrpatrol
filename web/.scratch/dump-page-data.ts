import { writeFileSync, mkdirSync } from "node:fs";
import { beatsFromGeoJson, compartmentsFromGeoJson } from "../lib/backend-adapters";
import { tagBeats, tagCompartments } from "../lib/grid-regions";
import { rangesFromBeats, beatsToFeatures, compartmentsToFeatures, rangesToFeatures, boundaryFromBeats, boundariesToFeatures, SVG_MAP_SPACE } from "../lib/map-space";

const base = "http://localhost:3001/api/gis/";
async function fc(u: string) { const r = await fetch(base + u); return r.json(); }

async function main() {
  const beatFc = await fc("beats");
  const compFc = await fc("compartments");
  const boundFc = await fc("boundary"); // EMPTY from backend

  const beats = beatsFromGeoJson(beatFc, SVG_MAP_SPACE);
  const comps = compartmentsFromGeoJson(compFc, SVG_MAP_SPACE);
  const taggedBeats = tagBeats(beats);
  const taggedComps = tagCompartments(comps, taggedBeats);
  const ranges = rangesFromBeats(taggedBeats);

  // EXACT page-grade transforms the map consumes:
  const beatsFc = beatsToFeatures(taggedBeats, null, null, null);
  const compsFc = compartmentsToFeatures(taggedComps, null, null);
  const rangesFc = rangesToFeatures(ranges);
  // Page (fixed) derives the boundary from the tagged beats when the backend
  // boundary is empty — mirror the exact page.tsx logic:
  const boundaryFc = boundariesToFeatures(boundaryFromBeats(taggedBeats));

  const report = {
    beats: beatsFc.features.length,
    compartments: compsFc.features.length,
    ranges: rangesFc.features.length,
    boundary: boundaryFc.features.length,
  };
  console.log("PAGE-GRADE FEATURE COUNTS:", JSON.stringify(report));

  const b0 = beatsFc.features[0];
  if (b0) {
    console.log("beat[0] geom:", b0.geometry.type, "ringPts:", (b0.geometry as any).coordinates[0]?.length);
    console.log("beat[0] lon/lat sample:", JSON.stringify((b0.geometry as any).coordinates[0]?.[0]));
  }
  const c0 = compsFc.features[0];
  if (c0) {
    console.log("comp[0] geom:", c0.geometry.type, "ringPts:", (c0.geometry as any).coordinates[0]?.length);
  }
  const r0 = rangesFc.features[0];
  if (r0) {
    console.log("range[0] geom:", r0.geometry.type, "ringPts:", (r0.geometry as any).coordinates[0]?.length);
  }

  const out = "C:/Users/l/AppData/Local/Temp/opencode/diag/data2";
  mkdirSync(out, { recursive: true });
  writeFileSync(out + "/beats.geojson", JSON.stringify(beatsFc));
  writeFileSync(out + "/compartments.geojson", JSON.stringify(compsFc));
  writeFileSync(out + "/ranges.geojson", JSON.stringify(rangesFc));
  writeFileSync(out + "/boundary.geojson", JSON.stringify(boundaryFc));
  console.log("wrote to " + out);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
