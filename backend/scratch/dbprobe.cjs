const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    const beatCols = await p.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name='Beat' ORDER BY ordinal_position`;
    console.log('Beat columns:', beatCols.map((r) => r.column_name).join(', '));
    const compCols = await p.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name='Compartment' ORDER BY ordinal_position`;
    console.log('Compartment columns:', compCols.map((r) => r.column_name).join(', '));
    const fbCols = await p.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name='ForestBoundary' ORDER BY ordinal_position`;
    console.log('ForestBoundary columns:', fbCols.map((r) => r.column_name).join(', '));
    const beatCnt = await p.$queryRaw`SELECT COUNT(*)::int AS c FROM "Beat"`;
    const compCnt = await p.$queryRaw`SELECT COUNT(*)::int AS c FROM "Compartment"`;
    const fbCnt = await p.$queryRaw`SELECT COUNT(*)::int AS c FROM "ForestBoundary"`;
    console.log('counts:', JSON.stringify({ beat: beatCnt[0].c, comp: compCnt[0].c, fb: fbCnt[0].c }));
  } catch (e) {
    console.error('PROBE FAIL:', e.message);
  } finally {
    await p.$disconnect();
  }
})();
