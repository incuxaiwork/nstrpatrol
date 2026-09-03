import { beatsFromGeoJson } from "../lib/backend-adapters";
import { boundaryFromBeats, boundariesToFeatures, SVG_MAP_SPACE } from "../lib/map-space";

async function main() {
  console.log("SVG_MAP_SPACE:", JSON.stringify(SVG_MAP_SPACE));

  const base = "http://localhost:3001/api/gis/";
  const beatsRes = await fetch(base + "beats");
  const beatsFc = await beatsRes.json();
  console.log("backend beats features:", beatsFc.features.length);

  console.log("\n--- STEP 1: beatsFromGeoJson (lon/lat -> SVG polygons) ---");
  const beats = beatsFromGeoJson(beatsFc, SVG_MAP_SPACE);
  console.log("converted beats (BeatPolygon[]):", beats.length);
  const withPoints = beats.filter((b) => b.points && b.points.trim().length > 0);
  console.log("beats with non-empty points:", withPoints.length);
  const withParts = beats.filter((b) => (b.parts ?? []).length > 0);
  console.log("beats with parts (>1 ring):", withParts.length);
  if (beats[0]) {
    console.log("beat[0] id:", beats[0].id, "name:", beats[0].name);
    console.log("beat[0] points sample:", beats[0].points.slice(0, 60));
    console.log("beat[0] points length (chars):", beats[0].points.length);
  }

  console.log("\n--- STEP 2: boundaryFromBeats (dissolve) ---");
  const boundary = boundaryFromBeats(beats);
  console.log("boundaryFromBeats returned boundaries:", boundary.length);
  if (boundary.length > 0) {
    const b0 = boundary[0];
    console.log("boundary id:", b0.id, "name:", b0.name, "part count:", b0.parts.length);
    const totalVerts = b0.parts.reduce((a, p) => a + p.trim().split(/\s+/).length, 0);
    console.log("boundary total vertices across parts:", totalVerts);
    b0.parts.forEach((p, i) => console.log(`  part[${i}] verts:`, p.trim().split(/\s+/).length, " sample:", p.slice(0, 40)));
  }

  console.log("\n--- STEP 3: boundariesToFeatures (SVG -> lon/lat GeoJSON for MapLibre) ---");
  const fc = boundariesToFeatures(boundary);
  console.log("boundary GeoJSON features:", fc.features.length);
  if (fc.features.length > 0) {
    const g = fc.features[0].geometry;
    console.log("boundary geometry type:", g.type);
    const coords: number[][][] = g.type === "MultiPolygon" ? (g.coordinates as any) : [g.coordinates as any];
    // compute lon/lat range
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    let nRings = 0;
    for (const poly of coords) for (const ring of poly) { nRings++; for (const [lon, lat] of ring) { if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon; if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat; } }
    console.log("boundary lon/lat range: lon", minLon.toFixed(5), "..", maxLon.toFixed(5), "lat", minLat.toFixed(5), "..", maxLat.toFixed(5));
    console.log("boundary rings:", nRings);
    console.log("was valid lon/lat (lon in 78-80, lat in 15-17):", minLon > 70 && maxLon < 90 && minLat > 10 && maxLat < 25);
  } else {
    console.log("!!! BOUNDARY IS EMPTY — this is why nothing renders !!!");
  }

  console.log("\n--- STEP 4: compare to SVG_MAP_SPACE extent (should be ~equal) ---");
  if (fc.features.length > 0) {
    const g = fc.features[0].geometry;
    const coords: number[][][] = g.type === "MultiPolygon" ? (g.coordinates as any) : [g.coordinates as any];
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const poly of coords) for (const ring of poly) for (const [lon, lat] of ring) { if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon; if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat; }
    console.log("SVG_MAP_SPACE minLon:", SVG_MAP_SPACE.minLon, "maxLon:", SVG_MAP_SPACE.maxLon);
    console.log("boundary  minLon:", minLon.toFixed(6), "maxLon:", maxLon.toFixed(6));
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
