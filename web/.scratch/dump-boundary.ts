import { writeFileSync } from "node:fs";
import { beatsFromGeoJson } from "../lib/backend-adapters";
import { boundaryFromBeats, boundariesToFeatures, SVG_MAP_SPACE } from "../lib/map-space";

async function main() {
  const base = "http://localhost:3001/api/gis/";
  const beatsFc = await (await fetch(base + "beats")).json();
  const beats = beatsFromGeoJson(beatsFc, SVG_MAP_SPACE);
  const boundary = boundaryFromBeats(beats);
  const boundaryFc = boundariesToFeatures(boundary);
  const out = "C:/Users/l/AppData/Local/Temp/opencode/diag/data";
  const { mkdirSync } = await import("node:fs");
  mkdirSync(out, { recursive: true });
  writeFileSync(out + "/boundary.geojson", JSON.stringify(boundaryFc));
  writeFileSync(out + "/beats.geojson", JSON.stringify(beatsFc));
  const compFc = await (await fetch(base + "compartments")).json();
  writeFileSync(out + "/compartments.geojson", JSON.stringify(compFc));
  console.log("boundary features:", boundaryFc.features.length, "beats:", beatsFc.features.length, "compartments:", compFc.features.length);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
