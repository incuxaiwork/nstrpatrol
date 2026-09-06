const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    const cnt = await p.$queryRaw`SELECT COUNT(*)::int c FROM "Beat"`;
    console.log('Beat rows:', cnt[0].c);
    const sample = await p.$queryRaw`SELECT id, name, "rangeName", division FROM "Beat" ORDER BY name LIMIT 8`;
    console.log('sample beats:', JSON.stringify(sample, null, 1));

    const r = await p.$queryRaw`SELECT COUNT(*)::int c FROM "Range"`;
    console.log('Range rows:', r[0].c);
    const rs = await p.$queryRaw`SELECT name FROM "Range" ORDER BY name LIMIT 8`;
    console.log('sample ranges:', JSON.stringify(rs));

    const rangesInB = await p.$queryRaw`SELECT DISTINCT "rangeName" FROM "Beat" WHERE "rangeName" IS NOT NULL ORDER BY "rangeName"`;
    console.log('distinct rangeName in Beat:', JSON.stringify(rangesInB));

    const c = await p.$queryRaw`SELECT COUNT(*)::int c FROM "Compartment"`;
    console.log('Compartment rows:', c[0].c);
    const nullBeat = await p.$queryRaw`SELECT COUNT(*)::int c FROM "Compartment" WHERE "beatId" IS NULL`;
    console.log('compartments with NULL beatId:', nullBeat[0].c);
  } catch (e) {
    console.error('FATAL:', e.message);
  } finally {
    await p.$disconnect();
  }
})();
