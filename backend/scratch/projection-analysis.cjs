const fs = require('fs');
const dir = 'D:\\Incuxai\\Forest new\\backend\\assets';
const beat = JSON.parse(fs.readFileSync(dir + '\\mark_beat.json', 'utf8'));
const comp = JSON.parse(fs.readFileSync(dir + '\\mark_comp.json', 'utf8'));

function walk(fc, out) {
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const p of polys) {
      for (const r of p) {
        for (const pt of r) out.push([pt[0], pt[1]]);
      }
    }
  }
}

const all = [];
walk(beat, all);
walk(comp, all);
let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
let maxDec = 0;
for (const [lon, lat] of all) {
  if (lon < minLon) minLon = lon;
  if (lon > maxLon) maxLon = lon;
  if (lat < minLat) minLat = lat;
  if (lat > maxLat) maxLat = lat;
  const dLon = (String(lon).split('.')[1] || '').length;
  const dLat = (String(lat).split('.')[1] || '').length;
  if (dLon > maxDec) maxDec = dLon;
  if (dLat > maxDec) maxDec = dLat;
}

console.log({ beats: beat.features.length, comps: comp.features.length, pts: all.length });
console.log('minLon', minLon, 'maxLon', maxLon, 'minLat', minLat, 'maxLat', maxLat);
console.log('spanDeg', maxLon - minLon, maxLat - minLat);
console.log('maxDecimalPlacesInSource', maxDec);

// Largest compartment (by vertex count) as the test polygon + its true centroid.
let largest = null;
for (const f of comp.features) {
  const n = f.geometry ? (f.geometry.type === 'Polygon' ? f.geometry.coordinates[0].length : f.geometry.coordinates[0][0].length) : 0;
  if (!largest || n > largest.n) largest = { n, f };
}
const ring = largest.f.geometry.coordinates[0];
const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length;
const cy = ring.reduce((a, p) => a + p[1], 0) / ring.length;
const blob = largest.f.properties;
console.log('largest comp', { compNo: blob.COMP_NO, beat: blob.BEAT, block: blob.BLACK ?? blob.BLOCK, n: largest.n });
console.log('centroid', cx, cy);

// The projection pair that was buggy:
//   forward  = adapters' makeProjector over the REAL (shared) union extent
//   reverse  = map-space svgToLngLat over the OLD hardcoded constants
const OLD = { minLon: 78.6, maxLon: 79.7, minLat: 15.4, maxLat: 16.4, pad: 60, w: 1000, h: 700 };
const REAL = { minLon, maxLon, minLat, maxLat };

function haversine(l1, L1, l2, L2) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (l2 - l1) * toR, dLng = (L2 - L1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(l1 * toR) * Math.cos(l2 * toR) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fwd(extent, lon, lat) {
  const availW = 1000 - 120, availH = 700 - 120;
  return {
    x: 60 + ((lon - extent.minLon) / (extent.maxLon - extent.minLon)) * availW,
    y: 60 + ((extent.maxLat - lat) / (extent.maxLat - extent.minLat)) * availH,
  };
}
function inv(extent, x, y) {
  const availW = 1000 - 120, availH = 700 - 120;
  return [
    extent.minLon + ((x - 60) / availW) * (extent.maxLon - extent.minLon),
    extent.maxLat - ((y - 60) / availH) * (extent.maxLat - extent.minLat),
  ];
}

// BUG: forward with REAL box, reverse with OLD box (what the old adapters+map-space did).
const p = fwd(REAL, cx, cy);
const [bLon, bLat] = inv(OLD, p.x, p.y);
console.log('BUG map-space centroid placement:', p, '->', bLon, bLat);

// FIX: forward with union (padded) box, reverse same box.
const PAD = (extent, f) => {
  const dx = (extent.maxLon - extent.minLon) * f, dy = (extent.maxLat - extent.minLat) * f;
  return { minLon: extent.minLon - dx, maxLon: extent.maxLon + dx, minLat: extent.minLat - dy, maxLat: extent.maxLat + dy };
};
const FIXED_REAL = PAD(REAL, 0.06);
const pf = fwd(FIXED_REAL, cx, cy);
const [fLon, fLat] = inv(FIXED_REAL, pf.x, pf.y);
console.log('FIX centroid roundtrip delta km:', haversine(cx, cy, fLon, fLat).toFixed(6));
console.log('FIX un-padded roundtrip delta km:', haversine(cx, cy, ...inv(fwd(REAL, cx, cy), cx, cy) && inv(REAL, fwd(REAL, cx, cy).x, fwd(REAL, cx, cy).y)).toFixed(6));

console.log('FIXED_REAL constants =', JSON.stringify(FIXED_REAL));