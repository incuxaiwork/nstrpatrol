/* Investigate NEKKANTI / DORNAL dissolve self-intersections:
 * are they inherited from the source rings, or produced by dissolveRings? */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const ROOT = 'D:/Incuxai/Forest new';
const mspace = await import(new URL(`file:///${ROOT.replace(/\\/g, '/')}/web/lib/map-space.ts`).href);
const fs = await import('node:fs/promises');
const beats = JSON.parse(await fs.readFile(resolve(ROOT, 'mobile/app/src/main/assets/mark_beat.json'), 'utf8'));
const { SVG_MAP_SPACE, dissolveRings, svgToLngLat } = mspace;

const VIEW = SVG_MAP_SPACE;
const p = ((extent) => { const sl = Math.max(extent.maxLon - extent.minLon, 1e-6), st = Math.max(extent.maxLat - extent.minLat, 1e-6), aw = VIEW.w - VIEW.pad * 2, ah = VIEW.h - VIEW.pad * 2; return (lon, lat) => ({ x: VIEW.pad + ((lon - extent.minLon) / sl) * aw, y: VIEW.pad + ((extent.maxLat - lat) / st) * ah }); })(VIEW);
const outer = (f) => { const g = f.geometry; if (!g) return []; const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; return polys.map((q) => (Array.isArray(q) ? q[0] : [])).filter((x) => x && x.length >= 3); };
const ringSvg = (r) => r.map(([lon, lat]) => `${p(lon, lat).x},${p(lon, lat).y}`).join(' ');
const parse = (s) => s.trim().split(/\s+/).map((x) => { const [a, b] = x.split(',').map(Number); return [a, b]; });

const beatsByRange = {};
for (const f of beats.features) { const r = String(f.properties.Range || '-'); (beatsByRange[r] ??= []).push(f); }

const same = (x, y) => x[0] === y[0] && x[1] === y[1];
function ringSelfIntersections(v, out) {
  const hits = [];
  for (let i = 0; i < v.length - 1; i++) for (let j = i + 1; j < v.length - 1; j++) {
    if (j === i || j === i + 1) continue;
    if (i === 0 && j === v.length - 2) continue;
    const a = v[i], b = v[i + 1], c = v[j], d = v[j + 1];
    if (same(a, c) || same(a, d) || same(b, c) || same(b, d)) continue;
    const o = (q, r, s) => (r[0] - q[0]) * (s[1] - q[1]) - (r[1] - q[1]) * (s[0] - q[0]);
    if (((o(a, b, c) > 0) !== (o(a, b, d) > 0)) && ((o(c, d, a) > 0) !== (o(c, d, b) > 0))) hits.push([i, j]);
  }
  if (out) for (const [i, j] of hits) console.log(`   crossing edges: ${i} ${desc(v[i], v[i + 1])} × ${j} ${desc(v[j], v[j + 1])}`);
  return hits.length;
}
const desc = (a, b) => {
  const [la, oa] = svgToLngLat(a[0], a[1]); const [lb, ob] = svgToLngLat(b[0], b[1]);
  const R = 6371, dLat = (lb - la) * Math.PI / 180, dLon = (ob - oa) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la * Math.PI / 180) * Math.cos(lb * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const km = 2 * R * Math.asin(Math.sqrt(h));
  return `[${Math.round(a[0] * 100) / 100},${Math.round(a[1] * 100) / 100}]→[${Math.round(b[0] * 100) / 100},${Math.round(b[1] * 100) / 100}] (${km.toFixed(2)}km, ${la.toFixed(5)},${oa.toFixed(5)}→${lb.toFixed(5)},${ob.toFixed(5)})`;
};

for (const [rname, feats] of Object.entries(beatsByRange)) {
  const srcRings = feats.flatMap((f) => outer(f).map(ringSvg));
  let srcSI = 0; const srcSIByRing = [];
  for (const ring of srcRings) { const n = ringSelfIntersections(parse(ring), false); srcSIByRing.push(n); srcSI += n; }
  const out = dissolveRings(srcRings.map(parse));
  let outSI = 0; const outParts = out.length;
  console.log(`\n${rname} | feats=${feats.length} srcRings=${srcRings.length} sourceSI=${srcSI} (per ring: ${srcSIByRing.join(',')}) | outParts=${outParts}`);
  for (const ring of out) { const n = ringSelfIntersections(parse(ring), true); outSI += n; }
  console.log(`   → output self-intersections: ${outSI}`);
}