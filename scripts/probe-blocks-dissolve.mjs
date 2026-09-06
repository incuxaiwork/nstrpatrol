import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const require = createRequire(join(ROOT, "web", "package.json"));
const ts = require("typescript");
const WEB_LIB = join(ROOT, "web", "lib");

const transpileCache = new Map();
function transpile(abs) {
  if (transpileCache.has(abs)) return transpileCache.get(abs);
  const out = ts.transpileModule(readFileSync(abs, "utf8"), { fileName: abs, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, skipLibCheck: true, } }).outputText;
  transpileCache.set(abs, out); return out;
}
const modules = new Map();
function loadLib(request) {
  if (!request.startsWith("@/lib/")) return require(request);
  const rel = join(WEB_LIB, request.slice("@/lib/".length) + ".ts");
  if (modules.has(rel)) return modules.get(rel).exports;
  const mod = { exports: {}, require: (r) => loadLib(r) };
  const js = transpile(rel);
  new Function("exports", "require", "module", "__filename", "__dirname", js)(mod.exports, mod.require, mod, rel, dirname(rel));
  modules.set(rel, mod); return mod.exports;
}
const mapSpace = loadLib("@/lib/map-space");
const adapters = loadLib("@/lib/backend-adapters");

const blockFc = await (await fetch("http://localhost:3001/api/gis/blocks")).json();
const blocks = adapters.blocksFromGeoJson(blockFc, mapSpace.SVG_MAP_SPACE);
console.log("blocks", blocks.length);
let withParts = 0, emptyParts = 0, totalParts = 0;
const dissolvedCounts = [];
for (const b of blocks) {
  const n = b.parts.length;
  totalParts += n;
  if (n > 0) withParts++; else emptyParts++;
  const rings = b.parts.map((p) => p.trim().split(/\s+/).map((pp) => pp.split(",").map(Number)));
  let parsable = 0; for (const r of rings) { if (r.length >= 3 && r.length <= 20000) parsable++; }
  const out = mapSpace.dissolveRings(b.parts.map((p) => mapSpace && 0).length ? [] : b.parts.map((p) => String(p).trim().split(/\s+/).map((pp) => pp.split(",").map(Number))));
  dissolvedCounts.push(out.length);
}
console.log("blocks with parts:", withParts, " empty:", emptyParts, " totalParts:", totalParts);
console.log("dissolveRings output lengths distribution:", JSON.stringify(dissolvedCounts.slice(0, 20)));

// First block rings sanity
const b0 = blocks.find((b) => b.parts.length) ?? blocks[0];
console.log("sample block:", JSON.stringify({ id: b0.id, name: b0.name, parts: b0.parts.length, ringLen: b0.parts[0]?.split(/\s+/).length, sample: b0.parts[0]?.slice(0, 80) }));

// Labels — valid distinct coords?
const labels = mapSpace.blockLabelsToFeatures(blocks);
const lons = labels.features.map((f) => f.geometry.coordinates[0]);
const lats = labels.features.map((f) => f.geometry.coordinates[1]);
console.log("label coords lon range", Math.min(...lons).toFixed(5), Math.max(...lons).toFixed(5), "lat", Math.min(...lats).toFixed(5), Math.max(...lats).toFixed(5));
const uniq = new Set(labels.features.map((f) => f.geometry.coordinates.join(",")));
console.log("distinct label coords:", uniq.size, "/", labels.features.length);