const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const section = (t) => {
    console.log(`\n=== ${t} ===`);
  };
  try {
    section('GIS-related tables');
    const tables = await p.$queryRaw`SELECT table_name, table_type FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%beat%' OR table_name ILIKE '%comp%' OR table_name ILIKE '%range%' OR table_name ILIKE '%forest%' OR table_name ILIKE '%block%' OR table_name ILIKE '%gis%' OR table_name ILIKE '%boundary%') ORDER BY table_name`;
    console.log(JSON.stringify(tables));

    for (const t of tables) {
      const tname = t.table_name;
      if (t.table_type !== 'BASE TABLE') continue;
      try {
        const cols = await p.$queryRaw`SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name=${tname} ORDER BY ordinal_position`;
        console.log(`\n-- ${tname} columns:`);
        console.log(JSON.stringify(cols, null, 1));
      } catch (e) {
        console.log(`  (col inspect err ${tname}: ${e.message})`);
      }
    }

    section('Beat table geom columns + counts');
    try {
      const info = await p.$queryRaw`SELECT
        COUNT(*)::int AS total,
        COUNT(name)::int AS with_name,
        COUNT(geom)::int AS with_geom,
        COUNT(CASE WHEN areaHa IS NOT NULL THEN 1 END)::int AS with_area
        FROM "Beat"`;
      console.log(JSON.stringify(info[0]));
    } catch (e) { console.log('Beat probe err: ' + e.message); }

    section('Compartment geom columns + counts');
    try {
      const info = await p.$queryRaw`SELECT
        COUNT(*)::int AS total,
        COUNT("compNo")::int AS with_compno,
        COUNT(geom)::int AS with_geom,
        COUNT("beatId")::int AS with_beatid,
        COUNT(areaHa)::int AS with_area
        FROM "Compartment"`;
      console.log(JSON.stringify(info[0]));
    } catch (e) { console.log('Comp probe err: ' + e.message); }

    section('ForestBoundary geom columns + counts');
    try {
      const info = await p.$queryRaw`SELECT
        COUNT(*)::int AS total,
        COUNT(name)::int AS with_name,
        COUNT("forestId")::int AS with_forestid,
        COUNT(geom)::int AS with_geom
        FROM "ForestBoundary"`;
      console.log(JSON.stringify(info[0]));
    } catch (e) { console.log('FB probe err: ' + e.message); }

    section('all tables list (public schema)');
    try {
      const all = await p.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`;
      console.log(JSON.stringify(all.map((r) => r.table_name)));
    } catch (e) { console.log('all tables err: ' + e.message); }

    section('PostGIS availability (read-only)');
    try {
      const hasGeomCol = await p.$queryRaw`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE column_name='geom') AS has_geom`;
      console.log('any geom column exists: ' + hasGeomCol[0].has_geom);
    } catch (e) { console.log('err: ' + e.message); }
    try {
      const ext = await p.$queryRaw`SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name LIKE '%postgis%' ORDER BY name`;
      console.log('postgis extensions (available): ' + JSON.stringify(ext));
    } catch (e) { console.log('ext err: ' + e.message); }
    try {
      const installed = await p.$queryRaw`SELECT * FROM pg_extension WHERE extname LIKE '%postgis%'`;
      console.log('postgis installed: ' + JSON.stringify(installed));
    } catch (e) { console.log('installed err: ' + e.message); }
  } catch (e) {
    console.error('FATAL:', e.message);
  } finally {
    await p.$disconnect();
  }
})();
