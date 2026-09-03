#!/usr/bin/env node
/**
 * GIS audit bundle builder — runs the REAL web modules (map-space.ts +
 * backend-adapters.ts + gis/grid.ts, transpiled in-process) against LIVE API
 * GeoJSON and emits every layer FeatureCollection the MapWorkspace would
 * build, plus the analysis-grid count. The browser harness then renders these
 * with real MapLibre + the exact map.tsx layer constants.
 *
 * Usage: node scripts/gis-audit-bundle.mjs <out.json>
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const WEB_LIB = join(ROOT, "web", "lib");
const require = createRequire(join(ROOT, "web", "package.json"));
const ts = require("typescript");

function useLoader() {
  const transpileCache = new Map();
  function transpile(abs) {
    if (transpileCache.has(abs)) return transpileCache.get(abs);
    const out = ts.transpileModule(readFileSync(abs, "utf8"), {
      fileName: abs,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
        skipLibCheck: true,
      },
    }).outputText;
    transpileCache.set(abs, out);
    return out;
  }
  const modules = new Map();
  function loadLib(request) {
    if (!request.startsWith("@/lib/")) return require(request);
    const rel = join(WEB_LIB, request.slice("@/lib/".length) + ".ts");
    if (modules.has(rel)) return modules.get(rel).exports;
    const mod = { exports: {}, require: (r) => loadLib(r) };
    const js = transpile(rel);
    new Function("exports", "require", "module", "__filename", "__dirname", js)(mod.exports, mod.require, mod, rel, dirname(rel));
    modules.set(rel, mod);
    return mod.exports;
  }
  return { mapSpace: loadLib("@/lib/map-space"), adapters: loadLib("@/lib/backend-adapters"), grid: loadLib("@/lib/gis/grid"), ctx: loadLib("@/lib/forest-context") };
}

const { mapSpace, adapters, grid, ctx } = useLoader();
const API = process.env.GIS_API ?? "http://localhost:3001";
const OUT = resolve(process.argv[2] ?? resolve(__dirname, ".audit", "layers-bundle.json"));
mkdirSync(dirname(OUT), { recursive: true });

const fetchJson = async (p) => {
  const r = await fetch(API + p);
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
  return r.json();
};

const [beatFc, compFc, blockFc, boundaryFc, gridFc] = await Promise.all([
  fetchJson("/api/gis/beats"), fetchJson("/api/gis/compartments"),
  fetchJson("/api/gis/blocks"), fetchJson("/api/gis/boundary"), fetchJson("/api/gis/grids"),
]);

const extent = mapSpace.SVG_MAP_SPACE;
const beats = adapters.beatsFromGeoJson(beatFc, extent);
const comps = adapters.compartmentsFromGeoJson(compFc, extent);
const blocks = adapters.blocksFromGeoJson(blockFc, extent);
const apiBoundary = adapters.boundariesFromGeoJson(boundaryFc, extent);
const grids = adapters.gridsFromGeoJson(gridFc, extent);
const ranges = mapSpace.rangesFromBeats(beats);
const derived = mapSpace.boundaryFromBeats(beats);
const effectiveBoundary = apiBoundary.length > 0 ? apiBoundary : derived;

const fcs = {
  beats: mapSpace.beatsToFeatures(beats),
  compartments: mapSpace.compartmentsToFeatures(comps),
  compartmentLabels: mapSpace.compartmentLabelsToFeatures(comps),
  blocks: mapSpace.blocksToFeatures(blocks),
  blockLabels: mapSpace.blockLabelsToFeatures(blocks),
  ranges: mapSpace.rangesToFeatures(ranges),
  rangeLabels: mapSpace.rangeLabelsToFeatures(ranges),
  boundary: mapSpace.boundariesToFeatures(effectiveBoundary),
  grids: mapSpace.gridsToFeatures(grids, undefined),
};

let analysisResult = { cells: [], meta: { count: 0 } };
try {
  analysisResult = grid.buildAnalysisGrid({ beats, boundary: apiBoundary, extent, sizeKey: ctx.DEFAULT_GRID_SIZE });
} catch (e) {
  analysisResult.buildError = String(e && e.message || e);
}

const countFeatures = (fc) => (fc && fc.features ? fc.features.length : 0);
const geomHist = (fc) => {
  const h = {};
  for (const f of (fc?.features ?? [])) h[f.geometry?.type ?? "null"] = (h[f.geometry?.type ?? "null"] ?? 0) + 1;
  return h;
};

console.log(JSON.stringify({
  counts: {
    beats: countFeatures(fcs.beats), compartments: countFeatures(fcs.compartments),
    compartmentLabels: countFeatures(fcs.compartmentLabels), blocks: countFeatures(fcs.blocks),
    blockLabels: countFeatures(fcs.blockLabels), ranges: countFeatures(fcs.ranges),
    rangeLabels: countFeatures(fcs.rangeLabels), boundary: countFeatures(fcs.boundary),
    grids: countFeatures(fcs.grids), apiBoundaryRaw: boundaryFc.features.length,
    apiGridsRaw: gridFc.features.length,
    analysisGrid1km: analysisResult.meta.count,
  },
  geomTypes: Object.fromEntries(Object.entries(fcs).map(([k, v]) => [k, geomHist(v)])),
  boundarySingleFeature: countFeatures(fcs.boundary) === 1,
  analysisBuildError: analysisResult.buildError ?? null,
}, null, 1));

writeFileSync(OUT, JSON.stringify({ ...fcs, meta: { analysisGrid1km: analysisResult.meta.count } }));
console.log("wrote", OUT);