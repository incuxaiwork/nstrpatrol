/**
 * Organizational audit — divisions / sub-divisions / ranges / beats and the
 * officers assigned to each. Read-only. Run: npx tsx scripts/audit-org.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SEEDED_SUB_DIVISIONS = ['DORNALA'];
const SEEDED_RANGES = ['DORNAL', 'G.V.PALLI', 'KORRAPROLU', 'NEKKANTI', 'MARKAPUR', 'Y.PALEM', 'V.P.SOUTH'];

async function main() {
  console.log('=== 1. DIVISIONS ===');
  const beatDivisions = await prisma.$queryRaw<{ division: string; beats: bigint }[]>`
    SELECT COALESCE(division, '(none)') AS division, COUNT(*)::bigint AS beats
    FROM "Beat" GROUP BY division ORDER BY division
  `;
  for (const d of beatDivisions) console.log(`  division="${d.division}" → ${d.beats} beats`);
  const usersWithDivision = await prisma.user.findMany({ where: { divisionId: { not: null } }, select: { email: true, divisionId: true } });
  console.log(`  users carrying divisionId: ${usersWithDivision.length} (constant "${usersWithDivision[0]?.divisionId ?? 'PT_MARKAPUR'}")`);

  console.log('\n=== 2. SUB-DIVISIONS ===');
  const subDivisions = await prisma.subDivision.findMany({ orderBy: { code: 'asc' } });
  console.log(`  table rows: ${subDivisions.length}`);
  for (const s of subDivisions) console.log(`  ${s.code} — ${s.name} (${s.id})`);
  for (const code of SEEDED_SUB_DIVISIONS) {
    if (!subDivisions.some((s) => s.code === code)) console.warn(`  ⚠ missing sub-division: ${code}`);
  }

  console.log('\n=== 3. RANGES (Range table) vs BEAT.rangeName ===');
  const ranges = await prisma.range.findMany({ orderBy: { name: 'asc' } });
  const beatsByRangeName = await prisma.beat.groupBy({
    by: ['rangeName'],
    _count: { _all: true },
    orderBy: { rangeName: 'asc' },
  });
  const byName = new Map(beatsByRangeName.map((b) => [b.rangeName ?? '', b._count._all]));
  console.log(`  Range table rows: ${ranges.length}`);
  const rangeOfficers = await prisma.user.groupBy({ by: ['rangeId'], _count: { _all: true } });
  const officerByRange = new Map(rangeOfficers.map((r) => [r.rangeId ?? '', r._count._all]));
  for (const r of ranges) {
    const beats = byName.get(r.name) ?? 0;
    const officers = officerByRange.get(r.id) ?? 0;
    const sub = subDivisions.find((s) => s.id === r.subDivisionId)?.code ?? '(direct)';
    console.log(`  ${r.name.padEnd(12)} sub=${sub.padEnd(9)} beats=${String(beats).padStart(4)}  officers=${String(officers).padStart(3)}`);
  }
  for (const [name, count] of byName) {
    if (!SEEDED_RANGES.includes(name)) console.warn(`  ⚠ Beat.rangeName not in Range table: "${name}" (${count} beats)`);
  }
  const noRange = await prisma.beat.count({ where: { rangeName: { equals: null } } });
  if (noRange > 0) console.warn(`  ⚠ beats with NULL rangeName: ${noRange}`);

  console.log('\n=== 4. BEATS ===');
  const beatTotal = await prisma.beat.count();
  const [geo] = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "Beat" WHERE geom IS NOT NULL`;
  console.log(`  total beats: ${beatTotal} (with geometry: ${geo.count})`);
  const sample = await prisma.beat.findMany({ orderBy: { name: 'asc' }, take: 8, select: { name: true, rangeName: true } });
  console.log('  sample:', sample.map((b) => `${b.name}@${b.rangeName}`).join(', '));

  console.log('\n=== 5. OFFICERS (users) BY CADER → ASSIGNED UNIT ===');
  const users = await prisma.user.findMany({ orderBy: { email: 'asc' } });
  for (const u of users) {
    const range = ranges.find((r) => r.id === u.rangeId)?.name ?? null;
    const sub = subDivisions.find((s) => s.id === u.subDivisionId)?.code ?? null;
    const beat = u.beatId ? (await prisma.beat.findUnique({ where: { id: u.beatId }, select: { name: true } }))?.name ?? '?' : null;
    console.log(
      `  [${u.cader ?? u.role}] ${u.email.padEnd(32)} div=${u.divisionId ?? '-'} sub=${sub ?? '-'} range=${range ?? '-'} beat=${beat ?? '-'}`
    );
  }

  console.log('\n=== 6. COVERAGE GAPS ===');
  const unassignedRanges = ranges.filter((r) => (officerByRange.get(r.id) ?? 0) === 0);
  console.log(`  ranges with NO assigned officer: ${unassignedRanges.length}`);
  for (const r of unassignedRanges) console.log(`    - ${r.name}`);
  const ops = await prisma.user.findMany({ where: { cader: { in: ['DyRO', 'FSO'] } }, select: { email: true, cader: true } });
  console.log(`  operational-fix users (DyRO/FSO, no fixed boundary): ${ops.length}`);
  for (const o of ops) console.log(`    - ${o.cader} ${o.email}`);
}

main()
  .catch((e) => {
    console.error('Audit failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });