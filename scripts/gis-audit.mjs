/* Deterministic GIS audit — reproduces the EXACT frontend pipeline against the
 * real bundled assets (mark_beat.json / mark_comp.json) with the ACTUAL
 * production functions imported from web/lib/map-space.ts (runtime-clean).
 * No production data is modified. Read-only diagnosis.                  */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = resolve('D:/Incuxai/Forest new');
const ASSETS = resolve(ROOT, 'mobile/app/src/main/assets');

// sharp ships with the Next.js toolchain under web/node_modules — resolve it
// from there so this standalone audit script needs no new dependency.
const require = createRequire(new URL(`file:///${ROOT.replace(/\\/g, '/')}/web/`));
const sharp = require('sharp');

const mspace = await import(new URL(`file:///${ROOT.replace(/\\/g, '/')}/web/lib/map-space.ts`).href);
const { SVG_MAP_SPACE, boundaryFromBeats, rangesFromBeats, blocksToFeatures, compartmentsToFeatures,
        boundariesToFeatures, svgRingToLngLat, svgToLngLat, beatsToFeatures, rangeLabelsToFeatures } = mspace;

const canonicalBlock = (await import(new URL(`file:///${ROOT.replace(/\\/g, '/')}/backend/src/gis/block-registry.ts`).href)).canonicalBlock;

const loadJson = async (f) => JSON.parse(await readFile(resolve(ASSETS, f), 'utf8'));

/* ── adapter mirror (identical logic to web/lib/backend-adapters.ts) ────── */
const VIEW = SVG_MAP_SPACE;
function makeProjector(extent) {
  const spanLon = Math.max(extent.maxLon - extent.minLon, 1e-6);
  const spanLat = Math.max(extent.maxLat - extent.minLat, 1e-6);
  const availW = VIEW.w - VIEW.pad * 2;
  const availH = VIEW.h - VIEW.pad * 2;
  return (lon, lat) => ({
    x: VIEW.pad + ((lon - extent.minLon) / spanLon) * availW,
    y: VIEW.pad + ((extent.maxLat - lat) / spanLat) * availH,
  });
}
const proj = makeProjector(SVG_MAP_SPACE);
const svgRing = (ring) => ring.map((p) => `${proj(p.lon, p.lat).x},${proj(p.lon, p.lat).y}`).join(' ');
const outerRingsOf = (feature) => {
  const g = feature.geometry;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return [];
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.map((poly) => {
    const outer = Array.isArray(poly) ? poly[0] : poly;
    return Array.isArray(outer) ? outer.map(([lon, lat]) => ({ lon, lat })) : [];
  }).filter((r) => r.length >= 3);
};
/* raw [lon,lat] outer rings (for the blocks path, which is number-based) */
const outerRingsNum = (feature) => {
  const g = feature.geometry;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return [];
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.map((poly) => {
    const outer = Array.isArray(poly) ? poly[0] : poly;
    return Array.isArray(outer) ? outer.filter((p) => Array.isArray(p) && p.length >= 2) : [];
  }).filter((r) => r.length >= 3);
};

const beatsFromGeoJson = (fc) => fc.features.filter((f) =>
  (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') && Array.isArray(f.geometry.coordinates?.[0]))
  .map((f, i) => {
    const rings = outerRingsOf(f).map((r) => r.map((p) => `${proj(p.lon, p.lat).x},${proj(p.lon, p.lat).y}`).join(' '));
    return {
      id: String(f.id ?? `api-beat-${i}`), name: String(f.properties.Beat ?? `Beat ${i + 1}`),
      division: String(f.properties.Division ?? ''), range: String(f.properties.Range ?? ''),
      points: rings[0] ?? '', parts: rings.length > 1 ? rings : undefined, coveragePct: null,
    };
  });

const compartmentsFromGeoJson = (fc) => fc.features
  .filter((f) => (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') && Array.isArray(f.geometry.coordinates?.[0]))
  .flatMap((f, i) => {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    return polys.map((poly, pIdx) => {
      const outer = poly[0];
      const holes = poly.slice(1).filter((r) => Array.isArray(r) && r.length >= 3);
      return {
        id: pIdx === 0 ? String(f.id ?? `api-comp-${i}`) : `${f.id}-p${pIdx + 1}`,
        compNo: String(f.properties.COMP_NO ?? `C${i + 1}`), beat: String(f.properties.BEAT ?? ''),
        block: String(f.properties.BLOCK ?? '') || undefined,
        points: outer.map(([lon, lat]) => `${proj(lon, lat).x},${proj(lon, lat).y}`).join(' '),
        ...(holes.length ? { holes: holes.map((r) => r.map(([lon, lat]) => `${proj(lon, lat).x},${proj(lon, lat).y}`).join(' ')) } : {}),
        areaHa: Number(f.properties.AREA_HA) || 0,
      };
    });
  });

/* ── geometry utilities ─────────────────────────────────────────────────── */
const parseRing = (s) => s.trim().split(/\s+/).map((p) => { const [x, y] = p.split(',').map(Number); return [x, y]; });
const KM2_PER_SVG2 = 0.0253;
const ringAreaKm2 = (ring) => { const v = parseRing(ring); let a = 0; for (let i = 0; i < v.length - 1; i++) a += v[i][0] * v[i + 1][1] - v[i + 1][0] * v[i][1]; return Math.abs(a / 2) * KM2_PER_SVG2; };
const ringLengthKm = (ring) => { const v = parseRing(ring); let km = 0; for (let i = 0; i < v.length - 1; i++) km += geodesicKm(v[i], v[i + 1]); return km; };
const geodesicKm = (a, b) => {
  const [la, loa] = svgToLngLat(a[0], a[1]); const [lb, lob] = svgToLngLat(b[0], b[1]);
  const R = 6371; const dLat = (lb - la) * Math.PI / 180; const dLon = (lob - loa) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la * Math.PI / 180) * Math.cos(lb * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const isClosed = (ring) => { const v = parseRing(ring); return v.length >= 4 && v[0][0] === v[v.length - 1][0] && v[0][1] === v[v.length - 1][1]; };
function segsIntersect(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const on = (p, q, r) => Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  if (((o1 > 0) !== (o2 > 0)) && ((o3 > 0) !== (o4 > 0))) return true;
  if (o1 === 0 && on(a, b, c)) return true; if (o2 === 0 && on(a, b, d)) return true;
  if (o3 === 0 && on(c, d, a)) return true; if (o4 === 0 && on(c, d, b)) return true;
  return false;
}
function selfIntersections(ring) {
  const v = parseRing(ring); const bad = [];
  for (let i = 0; i < v.length - 1; i++) for (let j = i + 1; j < v.length - 1; j++) {
    if (j === i || (j === i + 1)) continue;
    if ((i === 0 && j === v.length - 2)) continue;
    if (segsIntersect(v[i], v[i + 1], v[j], v[j + 1]) && !(samePt(v[i], v[j]) || samePt(v[i], v[j + 1]) || samePt(v[i + 1], v[j]) || samePt(v[i + 1], v[j + 1]))) bad.push([i, j]);
  }
  return bad;
}
const samePt = (a, b) => a[0] === b[0] && a[1] === b[1];
const EPS = 2e-3;
const qk = (p) => `${Math.round(p[0] / EPS)},${Math.round(p[1] / EPS)}`;

/* source edge inventory across the ring set fed into dissolveRings */
function edgeInventory(rings) {
  const owners = new Map(); const counts = new Map();
  for (let ri = 0; ri < rings.length; ri++) {
    const v = parseRing(rings[ri]); const seen = new Set();
    for (let i = 0; i < v.length - 1; i++) {
      const a = v[i], b = v[i + 1];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      const qa = qk(a), qb = qk(b); if (qa === qb) continue;
      const key = qa < qb ? `${qa}|${qb}` : `${qb}|${qa}`;
      if (seen.has(key)) continue; seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!owners.has(key)) owners.set(key, []);
      owners.get(key).push(ri);
    }
  }
  return { counts, owners };
}

function pointInRing(x, y, ring) {
  const v = parseRing(ring); let inside = false;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const [xi, yi] = v[i], [xj, yj] = v[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* true union area of a set of polygons by rasterisation against their bbox */
function unionAreaKm2(rings, step) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of parseRing(rings[0])) { minX = Math.min(minX, r[0]); maxX = Math.max(maxX, r[0]); minY = Math.min(minY, r[1]); maxY = Math.max(maxY, r[1]); }
  const parsed = rings.map(parseRing);
  for (const v of parsed) for (const [x, y] of v) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  let covered = 0; let total = 0;
  for (let x = minX; x <= maxX; x += step) for (let y = minY; y <= maxY; y += step) {
    total++;
    if (parsed.some((v) => pointInRing(x, y, v.length ? rings : rings[0]) && pointInPolygonPoints(x, y, v))) covered++;
  }
  return covered * step * step * KM2_PER_SVG2, { covered, total, cellM2: step * step * KM2_PER_SVG2 * 1e6 };
}
function pointInPolygonPoints(x, y, v) {
  let inside = false;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const [xi, yi] = v[i], [xj, yj] = v[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function analyzeGroup(label, sourceRings, outputParts, longThresholdKm) {
  const inv = edgeInventory(sourceRings);
  let outEdge = 0, artifact = 0, sharedRetained = 0, longEdges = [];
  const parts = outputParts.filter(Boolean);
  for (const part of parts) {
    const v = parseRing(part);
    for (let i = 0; i < v.length - 1; i++) {
      outEdge++;
      const qa = qk(v[i]), qb = qk(v[i + 1]);
      const key = qa < qb ? `${qa}|${qb}` : `${qb}|${qa}`;
      const cnt = inv.counts.get(key) ?? 0;
      if (cnt === 0) artifact++;
      else if (cnt > 1) sharedRetained++;
      const km = geodesicKm(v[i], v[i + 1]);
      if (km >= longThresholdKm) longEdges.push({ i, key, km, a: v[i], b: v[i + 1], ownerCount: cnt, unqA: qa, unqB: qb });
    }
  }
  const closures = parts.filter((p) => !isClosed(p)).length;
  let selfInt = 0;
  for (const part of parts) selfInt += selfIntersections(part).length;
  const outArea = parts.reduce((s, p) => s + ringAreaKm2(p), 0);
  const outKm = parts.reduce((s, p) => s + ringLengthKm(p), 0);
  console.log(`  [${label}] sourceRings=${sourceRings.length} outputParts=${parts.length} outEdges=${outEdge} closureFail=${closures} selfIntersections=${selfInt} areaKm2=${outArea.toFixed(3)} perimeterKm=${outKm.toFixed(1)}`);
  if (artifact) console.log(`  [${label}] *** DISSOLVE ARTIFACT edges (not in any source ring): ${artifact}`);
  if (sharedRetained) console.log(`  [${label}] *** shared source edges retained in output: ${sharedRetained}`);
  for (const e of longEdges) {
    const [la, loa] = svgToLngLat(e.a[0], e.a[1]); const [lb, lob] = svgToLngLat(e.b[0], e.b[1]);
    console.log(`    LONG ${e.km.toFixed(2)}km edge ${e.a}→${e.b}  lng/lat ${la.toFixed(5)},${loa.toFixed(5)} → ${lb.toFixed(5)},${lob.toFixed(5)}  ownerRings=${e.ownerCount}`);
  }
  return { parts, artifact, sharedRetained, outArea, longEdges };
}

/* ⚠ the ownerNames expression above was a placeholder; fix printing inside caller */
async function main() {
  const beatsFC = await loadJson('mark_beat.json');
  const compsFC = await loadJson('mark_comp.json');

  /* ============ PHASE 1–2, 4: FOREST BOUNDARY ============ */
  console.log('\n========== FOREST BOUNDARY (boundaryFromBeats → dissolveRings) ==========');
  const beats = beatsFromGeoJson(beatsFC);
  console.log('fallback beat polygons fed in (features→ring-less?):', beats.length);
  const beatAllRings = beats.flatMap((b) => [b.points, ...(b.parts ?? [])].filter((r) => r));
  const boundary = boundaryFromBeats(beats);
  const boundaryParts = boundary?.[0]?.parts ?? [];
  console.log('source beat ring count:', beatAllRings.length, '| forest parts (islands):', boundaryParts.length);
  console.log('forest total area (shoelace output):', boundaryParts.reduce((s, p) => s + ringAreaKm2(p), 0).toFixed(3), 'km²');
  console.log('all boundary parts closed:', boundaryParts.every(isClosed));
  let totalSelfInt = 0; for (const p of boundaryParts) totalSelfInt += selfIntersections(p).length;
  console.log('forest self-intersections (across all parts):', totalSelfInt);

  const invF = edgeInventory(beatAllRings);
  const artifactF = []; const sharedF = []; const longF = [];
  for (const part of boundaryParts) {
    const v = parseRing(part);
    for (let i = 0; i < v.length - 1; i++) {
      const qa = qk(v[i]), qb = qk(v[i + 1]);
      const key = qa < qb ? `${qa}|${qb}` : `${qb}|${qa}`;
      const cnt = invF.counts.get(key) ?? 0;
      const km = geodesicKm(v[i], v[i + 1]);
      const rec = { key, cnt, km, a: v[i], b: v[i + 1], ownerRings: cnt ? (invF.owners.get(key) ?? []) : [] };
      if (cnt === 0) artifactF.push(rec); else if (cnt > 1) sharedF.push(rec);
      if (km >= 2.0) longF.push(rec);
    }
  }
  const ringOwnerName = (ri) => { const keep = []; let idx = 0; for (const b of beats) for (const r of [b.points, ...(b.parts ?? [])]) { if (!r) continue; if (idx === ri) keep.push(b.name); idx++; } return keep.length ? keep.join(',') : `ring#${ri}`; };
  const describe = (e) => {
    const [la, loa] = svgToLngLat(e.a[0], e.a[1]); const [lb, lob] = svgToLngLat(e.b[0], e.b[1]);
    return `${e.km.toFixed(2)}km [${e.a}]→[${e.b}] (lng/lat ${la.toFixed(5)},${loa.toFixed(5)} → ${lb.toFixed(5)},${lob.toFixed(5)}) owners=${e.ownerRings.length}`;
  };
  console.log('\n--- PHASE 2: suspicious forest edges classified ---');
  console.log('ARTIFACT edges (qkey not in ANY source ring):', artifactF.length);
  artifactF.forEach((e) => console.log('   ', describe(e)));
  console.log('retained SHARED internal edges (qkey owned by >1 ring):', sharedF.length);
  sharedF.forEach((e) => console.log('   ', describe(e), '| source rings:', [...new Set(e.ownerRings.map(ringOwnerName))].join(', ')));
  console.log('LONG edges ≥ 2 km (verify each):', longF.length);
  for (const e of longF) {
    const owners = e.ownerRings.length ? [...new Set(e.ownerRings.map(ringOwnerName))] : ['** NOT IN SOURCE **'];
    console.log('   long:', describe(e), '| contributing source beat(s):', owners.join(', '));
  }

  /* union area (raster) vs output area (shoelace) */
  console.log('\n--- PHASE 4: true union area vs dissolved area ---');
  const step = 0.75;
  {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const parsed = beatAllRings.map(parseRing);
    for (const v of parsed) for (const [x, y] of v) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    let covered = 0;
    for (let x = minX; x <= maxX; x += step) for (let y = minY; y <= maxY; y += step) if (parsed.some((v) => pointInPolygonPoints(x, y, v))) covered++;
    const union = covered * step * step * KM2_PER_SVG2;
    const out = boundaryParts.reduce((s, p) => s + ringAreaKm2(p), 0);
    console.log(`raster union area (step ${step} svg): ${union.toFixed(3)} km²  | dissolved output: ${out.toFixed(3)} km²  | diff ${(union - out).toFixed(3)} km² (${((union - out) / union * 100).toFixed(2)}%)`);
  }
  /* centroid containment */
  {
    let misses = 0;
    for (const b of beats) {
      const r = parseRing(b.points); let cx = 0, cy = 0; for (const [x, y] of r) { cx += x; cy += y; } cx /= r.length; cy /= r.length;
      if (!boundaryParts.some((p) => pointInRing(cx, cy, p))) misses++;
    }
    console.log('beat centroids NOT inside forest union:', misses, '/', beats.length);
  }

  /* ============ PHASE 5: MULTIPOLYGON BEAT AUDIT ============ */
  console.log('\n========== PHASE 5: BEATS ==========');
  const beatFeatures = beatsToFeatures(beats, null);
  console.log('Beat features emitted to MapLibre:', beatFeatures.features.length, '| duplicate ids:', beatFeatures.features.length - new Set(beatFeatures.features.map((f) => f.id)).size);
  console.log('geometry types:', beatFeatures.features.reduce((m, f) => (m[f.geometry.type] = (m[f.geometry.type] ?? 0) + 1, m), {}));
  const multiBeats = beats.filter((b) => (b.parts?.length ?? 0) > 0);
  console.log('beats with >1 outer ring (MultiPolygon-equivalent):', multiBeats.length);
  for (const b of multiBeats) console.log('   MP beat:', b.name, 'id:', b.id, 'rings:', 1 + (b.parts?.length ?? 0));
  const nameCounts = beats.reduce((m, b) => (m[b.name] = (m[b.name] ?? 0) + 1, m), {});
  console.log('duplicate-name beats (same name, N features):', Object.entries(nameCounts).filter(([, n]) => n > 1).map(([n, c]) => `${n}×${c}`).join(', ') || 'none');
  console.log('asset-level MultiPolygon beat features:', beatsFC.features.filter((f) => f.geometry?.type === 'MultiPolygon').length);

  /* ============ PHASE 6: RANGES ============ */
  console.log('\n========== PHASE 6: RANGES (rangesFromBeats) ==========');
  const ranges = rangesFromBeats(beats);
  console.log('ranges:', ranges.length);
  for (const r of ranges) {
    const ringList = [r.points, ...(r.parts ?? [])];
    const srcRings = beats.filter((b) => b.range === r.name).flatMap((b) => [b.points, ...(b.parts ?? [])].filter((x) => x));
    const a = analyzeGroup(`range ${r.name} (${srcRings.length} source rings)`, srcRings, ringList, 3.0);
    if (a.parts.length > 1) console.log(`    → ${a.parts.length} disconnected parts (islands, expected if fragmented)`);
  }

  /* ============ PHASE 7: BLOCKS ============ */
  console.log('\n========== PHASE 7: BLOCKS (compartment BLOCK dissolve) ==========');
  const byBlock = new Map();
  for (const f of compsFC.features) {
    if (!f.geometry || f.properties?.COMP_NO == null) continue;
    const blk = canonicalBlock(f.properties.BLOCK); if (!blk) continue;
    if (!byBlock.has(blk)) byBlock.set(blk, { rings: [], count: 0 });
    const e = byBlock.get(blk); e.rings.push(...outerRingsNum(f)); e.count++;
  }
  const blockFc = { type: 'FeatureCollection', features: [...byBlock.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([blk, e], i) => ({
    id: `block-${blk}`, properties: { BLOCK: blk, COMPARTMENT_COUNT: e.count, AREA_HA: 0 }, geometry: { type: 'MultiPolygon', coordinates: e.rings },
  })) };
  console.log('canonical blocks in asset:', byBlock.size);
  const blockPolys = blockFc.features.map((f, i) => ({ id: String(f.id), name: String(f.properties.BLOCK), compartmentCount: Number(f.properties.COMPARTMENT_COUNT), areaHa: 0, parts: f.geometry.coordinates.map((poly) => poly[0].map(([lon, lat]) => `${proj(lon, lat).x},${proj(lon, lat).y}`).join(' ')) }));
  const blocksOut = blocksToFeatures(blockPolys);
  console.log('block features after dissolve render:', blocksOut.features.length, '| 0-dissolve blocks (dropped):', blockPolys.length - blocksOut.features.length);
  const multiBlocks = blocksOut.features.filter((f) => f.geometry.type === 'MultiPolygon');
  console.log('MultiPolygon block features:', multiBlocks.length);
  for (const bf of blocksOut.features) {
    const rings = bf.geometry.type === 'Polygon' ? [bf.geometry.coordinates] : bf.geometry.coordinates;
    const svgRings = rings.map((r) => r[0].map(([lon, lat]) => `${proj(lon, lat).x},${proj(lon, lat).y}`).join(' '));
    const src = outerRingsOf({ geometry: { type: bf.geometry.type, coordinates: bf.geometry.coordinates } });
    const a = analyzeGroup(`block ${bf.properties.name}`, blockPolys.find((mp) => mp.name === bf.properties.name)?.parts ?? [], svgRings, 3.0);
  }
  if (blocksOut.features.length !== 39) console.log('   ⚠ block features ≠ 39');

  /* ============ PHASE 8: COMPARTMENT RENDER PROOF ============ */
  console.log('\n========== PHASE 8: COMPARTMENTS (MapLibre input) ==========');
  const comps = compartmentsFromGeoJson(compsFC);
  const bigUnits = compsFC.features.filter((f) => f.geometry?.type === 'MultiPolygon');
  const mpParts = bigUnits.reduce((s, f) => s + f.geometry.coordinates.length, 0);
  console.log('asset features:', compsFC.features.length, '| MultiPolygon features:', bigUnits.length, '| total parts inside them:', mpParts, '→ adapter expansion adds', mpParts - bigUnits.length);
  const compOut = compartmentsToFeatures(comps);
  const compFeats = compOut.features;
  const ids = new Set(compFeats.map((f) => f.id));
  console.log('MapLibre compartment features:', compFeats.length, '| duplicate ids:', compFeats.length - ids.size);
  console.log('geometry types:', compFeats.reduce((m, f) => (m[f.geometry.type] = (m[f.geometry.type] ?? 0) + 1, m), {}));
  console.log('features dropped (0):', compFeats.length - comps.length);
  let closed = 0, unclosed = 0, nan = 0, coordBad = 0; let holesTotal = 0, holeFeats = 0;
  for (const f of compFeats) {
    const g = f.geometry; const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) for (const ring of poly) {
      const ok = ring.length >= 4 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
      ok ? closed++ : unclosed++;
      for (const [lon, lat] of ring) { if (!Number.isFinite(lon) || !Number.isFinite(lat)) nan++; if (lon < -180 || lon > 180 || lat < -90 || lat > 90) coordBad++; }
      if (poly.indexOf(ring) > 0) { holesTotal++; }
    }
    if ((g.type === 'Polygon' && g.coordinates.length > 1) || (g.type === 'MultiPolygon' && g.coordinates.some((p) => p.length > 1))) holeFeats++;
  }
  console.log(`rings closed: ${closed}  unclosed: ${unclosed}  NaN/Inf coords: ${nan}  out-of-range [lng,lat]: ${coordBad}`);
  console.log(`holes preserved: ${holesTotal} across ${holeFeats} features`);

  /* ============ RENDER PROOF ============ */
  console.log('\n========== RENDER PROOF (SVG → PNG via sharp) ==========');
  const w = 1000, h = 700;
  const layers = [];
  layers.push({ d: 'M0 0H1000V700H0Z', fill: '#e8eaed' });
  const ringPath = (svg) => 'M' + parseRing(svg).map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L') + ' Z';
  const compGD = (svg, holes) => ringPath(svg) + (holes ?? []).map((hh) => ringPath(hh)).join('');
  for (const c of comps) layers.push({ d: compGD(c.points, c.holes ?? []), stroke: '#B3261E', sw: 0.55, dash: '7 5', op: 0.62, fill: 'none' });
  for (const bf of blocksOut.features) {
    const rings = bf.geometry.type === 'Polygon' ? [bf.geometry.coordinates] : bf.geometry.coordinates;
    for (const r of rings) { const svg = r[0].map(([lon, lat]) => `${proj(lon, lat).x},${proj(lon, lat).y}`).join(' '); layers.push({ d: ringPath(svg), stroke: '#5B2C6F', sw: 1.1, op: 0.9, fill: 'none' }); }
  }
  for (const b of beats) { const svg = [b.points, ...(b.parts ?? [])].filter(Boolean).map((r) => ringPath(r)).join(''); layers.push({ d: svg, stroke: '#E65100', sw: 1.25, op: 0.9, fill: '#1E4620', fo: 0.02 }); }
  for (const r of ranges) for (const part of [r.points, ...(r.parts ?? [])]) layers.push({ d: ringPath(part), stroke: '#0E4C92', sw: 1.5, op: 0.95, fill: 'none' });
  for (const part of boundaryParts) layers.push({ d: ringPath(part), stroke: '#1B4332', sw: 2.4, op: 0.95, fill: 'none' });
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
  for (const L of layers) svg += `<path d="${L.d}" fill="${L.fill ?? 'none'}" ${L.fill !== 'none' && L.fill ? `fill-opacity="${L.fo ?? 0.02}"` : ''} stroke="${L.stroke ?? 'none'}" stroke-width="${L.sw ?? 1}" stroke-opacity="${L.op ?? 1}" ${L.dash ? `stroke-dasharray="${L.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
  svg += '</svg>';
  const outPath = resolve(ROOT, 'scripts/gis-audit-render.png');
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  console.log('rendered:', outPath);

  console.log('\nDONE');
}

main().catch((e) => { console.error(e); process.exit(1); });