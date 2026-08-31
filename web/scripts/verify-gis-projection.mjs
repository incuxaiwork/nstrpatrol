#!/usr/bin/env node
/**
 * Numeric verification of the GIS projection invertibility contract.
 *
 * Runs the REAL web projection modules (lib/map-space.ts + lib/backend-adapters.ts,
 * transpiled in-process — no ts-node/tsx needed) against the REAL survey assets
 * (backend/assets/mark_beat.json + mark_comp.json) and asserts, with numbers:
 *
 *   1. The shared SVG_MAP_SPACE box IS the real union extent of the survey.
 *   2. Every compartment survives the forward+inverse pipeline exactly
 *      (round-trip ≤ 1e-9 km — the old code lost 26.07 km here).
 *   3. The largest compartment (compNo 63, beat SIRIGIRIPADU) reproduces the
 *      audited centroid exactly (79.33173340575463, 16.264677603689186)
 *      instead of the old displaced point.
 *   4. Inverting the SAME projected ring against the OLD hardcoded box
 *      (78.6–79.7 / 15.4–16.4) reproduces the 26.07 km displacement
 *      (79.36450079118896, 16.0453618530395) — the bug being fixed.
 *   5. Point (marker) round-trips stay exact.
 *   6. The real beat polygons dissolve to exactly one clean forest outline.
 *
 * Run: node scripts/verify-gis-projection.mjs   (or: npm run verify:gis)
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_LIB = join(__dirname, "..", "lib");
const WEB_ROOT = join(__dirname, "..");
const ASSETS = join(WEB_ROOT, "..", "backend", "assets");

/* ------------------------------------------------------------------ */
/* In-process TS loader: transpile to CommonJS, alias @/lib/* → files  */
/* ------------------------------------------------------------------ */

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
  const fn = new Function("exports", "require", "module", "__filename", "__dirname", js);
  fn(mod.exports, mod.require, mod, rel, dirname(rel));
  modules.set(rel, mod);
  return mod.exports;
}

const mapSpace = loadLib("@/lib/map-space");
const adapters = loadLib("@/lib/backend-adapters");

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const EARTH_KM = 6371.0088;
/** a, b are [lon, lat]. */
function haversineKm(a, b) {
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return EARTH_KM * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Outer rings of a Polygon/MultiPolygon feature — the same flattening the
 * backend adapters use (ringsOf in lib/backend-adapters.ts), so each returned
 * ring pairs 1:1 (in order) with the compartmentsFromGeoJson output.
 */
function sourceParts(f) {
  const g = f.geometry;
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) return [];
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys
    .map((poly) => {
      const outer = Array.isArray(poly) ? poly[0] : poly;
      if (!Array.isArray(outer)) return [];
      return outer.filter(
        (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])
      );
    })
    .filter((ring) => ring.length > 0);
}

/** Arithmetic mean of a [[lon, lat], ...] ring (plain vertex centroid). */
function ringMean(ring) {
  let mlon = 0;
  let mlat = 0;
  for (const [lon, lat] of ring) {
    mlon += lon;
    mlat += lat;
  }
  return [mlon / ring.length, mlat / ring.length];
}

/** The OLD (buggy) constant box the inverse map used before the fix. */
function oldSvgToLngLat(x, y) {
  const pad = 60;
  const w = 1000;
  const h = 700;
  const minLon = 78.6;
  const maxLon = 79.7;
  const minLat = 15.4;
  const maxLat = 16.4;
  const lon = minLon + ((x - pad) / (w - pad * 2)) * (maxLon - minLon);
  const lat = maxLat - ((y - pad) / (h - pad * 2)) * (maxLat - minLat);
  return [lon, lat];
}

/** Parse an SVG point-string ring -> [[lon, lat], ...] via a given inverse. */
function ringToLngLat(points, inverse = mapSpace.svgToLngLat) {
  return points
    .trim()
    .split(/\s+/)
    .map((p) => {
      const [x, y] = p.split(",").map(Number);
      return inverse(x, y);
    });
}

let failures = 0;
function check(cond, label, detail) {
  const mark = cond ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${label}${detail != null ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

/* ------------------------------------------------------------------ */
/* Load the real survey assets                                        */
/* ------------------------------------------------------------------ */

const beatsFc = JSON.parse(readFileSync(join(ASSETS, "mark_beat.json"), "utf8"));
const compsFc = JSON.parse(readFileSync(join(ASSETS, "mark_comp.json"), "utf8"));

console.log("verify-gis-projection — real-assets numeric check\n");

check(
  beatsFc.type === "FeatureCollection" && beatsFc.features.length === 44,
  "mark_beat.json is a FeatureCollection",
  `${beatsFc.features.length} beats`
);
check(
  compsFc.type === "FeatureCollection" && compsFc.features.length === 448,
  "mark_comp.json is a FeatureCollection",
  `${compsFc.features.length} compartments`
);

/* ------------------------------------------------------------------ */
/* 1. Shared box === real union extent of the survey                   */
/* ------------------------------------------------------------------ */

console.log("\n1. Shared projection box is the real union extent");

const realExtent = adapters.unionExtent(beatsFc, compsFc);
check(realExtent != null, "unionExtent(beats, comps) computes", JSON.stringify(realExtent));
if (realExtent) {
  const s = mapSpace.SVG_MAP_SPACE;
  check(
    realExtent.minLon === s.minLon &&
      realExtent.maxLon === s.maxLon &&
      realExtent.minLat === s.minLat &&
      realExtent.maxLat === s.maxLat,
    "SVG_MAP_SPACE constants equal the real union extent (bit-exact)"
  );
}

/* ------------------------------------------------------------------ */
/* 2 + 3. Full pipeline round-trip — every compartment, + largest      */
/* ------------------------------------------------------------------ */

console.log("\n2. Forward (adapters) + inverse (map-space) round-trip per compartment");

const comps = adapters.compartmentsFromGeoJson(compsFc, realExtent);
check(
  comps.length === compsFc.features.reduce((acc, f) => acc + sourceParts(f).length, 0),
  "compartmentsFromGeoJson keeps all original parts",
  `${comps.length} polygons`
);

/* Every REAL compartment must carry a beat name — the hierarchy worksheet
 * is beat-keyed (no block level). The only exceptions are the two Enclosure
 * features (COMP_NO "0", no beat/range) which are intentionally not part of
 * the beat-keyed compartment census. */
const beatless = comps.filter((c) => !c.beat);
check(
  beatless.length === 2 && beatless.every((c) => c.compNo === "0"),
  "every real compartment carries a BEAT property",
  `${beatless.length} beatless, all Enclosure (compNo 0)`
);

/* Pair each adapter polygon with its source outer ring (same flatten order). */
let idx = 0;
let worst = 0;
for (const f of compsFc.features) {
  for (const srcRing of sourceParts(f)) {
    const c = comps[idx++];
    const a = ringMean(srcRing);
    const b = ringMean(ringToLngLat(c.points));
    worst = Math.max(worst, haversineKm(a, b));
  }
}
check(
  worst < 1e-9,
  "worst round-trip displacement across all 448 compartments ≤ 1e-9 km",
  `${worst.toExponential(3)} km`
);

/* Largest compartment — the audited 436-vertex ring (compNo 63). */
let largest = null;
for (const f of compsFc.features) {
  const n = f.geometry.coordinates[0].length;
  if (!largest || n > largest.n) largest = { n, f };
}
const L = largest.f;
const largestComp = comps.find((c) => c.compNo === String(L.properties.COMP_NO));
console.log("\n3. Largest compartment (the audit anchor)");
check(
  largest.n === 436 && String(L.properties.COMP_NO) === "63",
  "largest compartment selected",
  `compNo ${L.properties.COMP_NO}, beat ${L.properties.BEAT}, ${largest.n} vertices`
);
check(
  largestComp?.beat === "SIRIGIRIPADU",
  "backend adapter preserves the beat",
  largestComp ? `${largestComp.beat}` : "missing"
);

const srcMean = ringMean(L.geometry.coordinates[0]);
const fixedMean = ringMean(ringToLngLat(largestComp.points));
const EXPECTED_FIXED = [79.33173340575463, 16.264677603689186];
check(
  Math.abs(fixedMean[0] - EXPECTED_FIXED[0]) < 1e-9 && Math.abs(fixedMean[1] - EXPECTED_FIXED[1]) < 1e-9,
  "projected centroid reproduces the audited centroid exactly",
  `(${fixedMean[0]}, ${fixedMean[1]})`
);
check(
  haversineKm(fixedMean, srcMean) < 1e-9,
  "projected centroid equals the source mean (invertibility)",
  `${haversineKm(fixedMean, srcMean).toExponential(3)} km`
);

/* ------------------------------------------------------------------ */
/* 4. The OLD box oracle — the 26.07 km bug being fixed                */
/* ------------------------------------------------------------------ */

console.log("\n4. Oracle: OLD hardcoded box displaces the same ring by 26.07 km");

const bugMean = ringMean(ringToLngLat(largestComp.points, oldSvgToLngLat));
const EXPECTED_BUG = [79.36450079118896, 16.0453618530395];
check(
  Math.abs(bugMean[0] - EXPECTED_BUG[0]) < 1e-9 && Math.abs(bugMean[1] - EXPECTED_BUG[1]) < 1e-9,
  "OLD-box inversion reproduces the displaced point",
  `(${bugMean[0]}, ${bugMean[1]})`
);
const bugKm = haversineKm(bugMean, fixedMean);
check(
  bugKm > 24 && bugKm < 28,
  "OLD-box displacement of the audited centroid is tens of km",
  `${bugKm.toFixed(2)} km great-circle of the two fixed points`
);
/* The 26.07 km audit headline: how far north the OLD box pulls the map.
 * The REAL union's top edge projects to SVG y=pad and the OLD inverse maps
 * that to OLD.maxLat=16.4 — a 0.23465° lat shift ≈ 26.07 km. */
const northPullDeg = mapSpace.SVG_MAP_SPACE.maxLat - 16.4;
const northPullKm = northPullDeg * 111.195;
check(
  northPullKm >= 26.0 && northPullKm <= 26.2,
  "OLD box pulls the map's north edge 26.07 km (the audit reproduction)",
  `${northPullKm.toFixed(2)} km`
);

/* ------------------------------------------------------------------ */
/* 5. Point (marker) round-trip                                        */
/* ------------------------------------------------------------------ */

console.log("\n5. Point markers stay exact");

let worstPoint = 0;
for (let i = 0; i < 8; i++) {
  const x = 60 + i * 113;
  const y = 80 + i * 71;
  const [lon, lat] = mapSpace.svgToLngLat(x, y);
  const back = mapSpace.lngLatToSvg(lon, lat);
  worstPoint = Math.max(worstPoint, Math.hypot(back.x - x, back.y - y));
}
check(
  worstPoint < 1e-9,
  "svgToLngLat -> lngLatToSvg -> svgToLngLat round-trip ≤ 1e-9",
  `${worstPoint.toExponential(3)} SVG units`
);

/* ------------------------------------------------------------------ */
/* 6. The real forest boundary dissolves to ONE outline                */
/* ------------------------------------------------------------------ */

console.log("\n6. Real mark_beat.json dissolves to a single clean outline");

const beats = adapters.beatsFromGeoJson(beatsFc, realExtent);
const boundary = mapSpace.boundaryFromBeats(beats);
check(
  boundary.length === 1 && boundary[0].parts.length === 1,
  "44 beats dissolve into exactly one forest outline",
  `${boundary[0]?.parts.length} outline part`
);

const OUTLINE = boundary[0].parts[0];

function isInsideRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const outRingSvg = OUTLINE
  .trim()
  .split(/\s+/)
  .map((p) => p.split(",").map(Number));

let outside = 0;
for (const b of beats) {
  const [cx, cy] = ringMean(ringToLngLat(b.points));
  const { x, y } = mapSpace.lngLatToSvg(cx, cy);
  if (!isInsideRing([x, y], outRingSvg)) outside++;
}
check(outside === 0, "every beat's centroid is inside the forest outline", `${outside} outside`);

/** Geodesic area (m³/km² via trapezoidal projection rule). */
function geodesicAreaKm2(ringSvg) {
  const ring = ringSvg
    .trim()
    .split(/\s+/)
    .map((p) => mapSpace.svgToLngLat(...p.split(",").map(Number)));
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];
    sum +=
      ((lon2 - lon1) * Math.PI) / 180 *
      (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
  }
  return Math.abs((sum * EARTH_KM * EARTH_KM) / 2);
}

const unionKm2 = geodesicAreaKm2(OUTLINE);
let beatsKm2 = 0;
for (const b of beats) {
  for (const ringStr of [b.points, ...(b.parts ?? [])]) beatsKm2 += geodesicAreaKm2(ringStr);
}
check(
  unionKm2 > 4300 && unionKm2 < 4600,
  "forest outline geodesic area is plausible",
  `${unionKm2.toFixed(1)} km²`
);
check(
  Math.abs(unionKm2 - beatsKm2) / beatsKm2 < 0.01,
  "outline area equals the sum of its beat polygons (no gaps, no doubles)",
  `union ${unionKm2.toFixed(1)} km² vs ${beatsKm2.toFixed(1)} km²`
);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log(failures === 0 ? "\nALL PROJECTION CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);