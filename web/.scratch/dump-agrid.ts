import { writeFileSync, mkdirSync } from "node:fs";
import { beatsFromGeoJson, compartmentsFromGeoJson } from "../lib/backend-adapters";
import { tagBeats, tagCompartments, tagGrids } from "../lib/grid-regions";
import { buildAnalysisGrid } from "../lib/gis/grid";
import { analysisGridsToFeatures, SVG_MAP_SPACE } from "../lib/map-space";

const base = "http://localhost:3001/api/gis/";
async function fc(u: string) {
  const r = await fetch(base + u);
  return r.json();
}

async function main() {
  const beatFc = await fc("beats");
  const compFc = await fc("compartments");
  const boundFc = await fc("boundary");

  const beats = beatsFromGeoJson(beatFc, SVG_MAP_SPACE);
  const comps = compartmentsFromGeoJson(compFc, SVG_MAP_SPACE);
  const taggedBeats = tagBeats(beats);
  const taggedComps = tagCompartments(comps, taggedBeats);

  const cells = buildAnalysisGrid({
    beats: taggedBeats,
    boundary: boundFc && boundFc.features && boundFc.features.length > 0 ? boundFc.features : [],
    extent: SVG_MAP_SPACE,
    sizeKey: "1km",
  });

  const taggedGrids = tagGrids(cells.cells, taggedBeats, taggedComps);
  const fcOut = analysisGridsToFeatures(taggedGrids, new Set<string>());

  const outDir = "C:/Users/l/AppData/Local/Temp/opencode/diag/data2";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outDir + "/agrid.geojson", JSON.stringify(fcOut));

  console.log("AG-GRID-CELLS", cells.meta.count);
  console.log("AG-FEATURES", fcOut.features.length);
  const first = fcOut.features[0];
  console.log("AG-GEOM", first && first.geometry.type);
  const pc = first && first.properties;
  console.log("AG-PROPS", JSON.stringify(pc));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});