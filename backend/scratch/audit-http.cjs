const fs = require('fs');
(async () => {
  const base = 'http://localhost:3001/api/gis/';
  for (const ep of ['beats', 'compartments', 'boundary', 'ranges', 'blocks', 'grids', 'version']) {
    try {
      const url = base + ep;
      const res = await fetch(url, { method: 'GET' });
      const text = await res.text();
      let j;
      try { j = JSON.parse(text); } catch { j = null; }
      const feats = j && Array.isArray(j.features) ? j.features : null;
      console.log(`\n=== ${ep} HTTP ${res.status} features=${feats ? feats.length : 'n/a'} len=${text.length}`);
      if (feats && feats.length > 0) {
        const types = {};
        for (const f of feats) {
          const t = f.geometry && f.geometry.type;
          types[t] = (types[t] || 0) + 1;
        }
        console.log('geom types:', JSON.stringify(types));
        const f0 = feats[0];
        console.log('feature[0] keys:', Object.keys(f0).join(','));
        if (f0.geometry) {
          console.log('f0 geom type:', f0.geometry.type);
          const c = f0.geometry.coordinates;
          const depth = JSON.stringify(c);
          console.log('f0 coords length:', depth.length);
          // helper to find min/max of first coord pair
          const firstPair = JSON.stringify(c).replace(/^\[\[/,'').split(',');
        }
        console.log('f0 properties:', JSON.stringify(f0.properties));
      }
    } catch (e) {
      console.log(`\n=== ${ep} ERROR: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
})();
