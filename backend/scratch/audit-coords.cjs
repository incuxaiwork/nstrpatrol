(async () => {
  const res = await fetch('http://localhost:3001/api/gis/beats');
  const j = await res.json();
  const feats = j.features;

  // Collect first coordinate of every ring across all features
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;

  function walk(coord) {
    if (typeof coord[0] === 'number') {
      const lon = coord[0], lat = coord[1];
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const c of coord) walk(c);
  }

  for (const f of feats) walk(f.geometry.coordinates);

  console.log('BEATS coordinate ranges across all features:');
  console.log('  minLon:', minLon.toFixed(6), ' maxLon:', maxLon.toFixed(6));
  console.log('  minLat:', minLat.toFixed(6), ' maxLat:', maxLat.toFixed(6));

  // print one actual coordinate from feature 0
  const f0 = feats[0];
  console.log('\nfeature[0] first ring first 3 points:');
  const c0 = f0.geometry.type === 'Polygon' ? f0.geometry.coordinates[0] : f0.geometry.coordinates[0][0];
  for (let i = 0; i < 3; i++) console.log('  ' + JSON.stringify(c0[i]));

  // Is the centroid around the Markapur area (lon ~79-80, lat ~15-16)?
  console.log('\nMarkapur reference approx lon=79.4 lat=15.6');
})();
