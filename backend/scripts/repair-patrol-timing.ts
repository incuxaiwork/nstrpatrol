/**
 * Repairs patrol rows whose endedAt predates their own telemetry.
 *
 * Devices with mixed clock sources have synced patrols that "ended" seconds
 * after starting while their GPS trace spans tens of minutes (e.g. a patrol
 * "ended" 10:18:17 whose last point is 10:45:50). The points are the source
 * of truth, so this script:
 *   1. sets endedAt = MAX(PatrolPoint.timestamp) whenever it is earlier,
 *   2. reports (but does not change) rows where startedAt > MIN(point.ts),
 *      since shifting start could hide real clock problems worth reviewing.
 *
 * Run with:  npx tsx scripts/repair-patrol-timing.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const broken = await prisma.$queryRaw<
    { id: string; startedAt: Date; endedAt: Date | null; lastPt: Date; firstPt: Date; points: bigint }[]
  >`
    SELECT p.id, p."startedAt", p."endedAt",
           MAX(pp.timestamp)::timestamptz AS "lastPt",
           MIN(pp.timestamp)::timestamptz AS "firstPt",
           COUNT(pp.id) AS points
    FROM "Patrol" p
    JOIN "PatrolPoint" pp ON pp."patrolId" = p.id
    GROUP BY p.id
    HAVING p."endedAt" IS NULL OR p."endedAt" < MAX(pp.timestamp)
  `;

  console.log(`Found ${broken.length} patrol(s) with endedAt earlier than their last point`);
  for (const row of broken) {
    const mins = Math.round((row.lastPt.getTime() - (row.endedAt?.getTime() ?? row.startedAt.getTime())) / 60000);
    console.log(
      `  ${row.id}: ended=${row.endedAt?.toISOString() ?? 'null'} last_point=${row.lastPt.toISOString()} (+${mins}m, ${row.points} pts)`
    );
    if (!dryRun) {
      await prisma.patrol.update({ where: { id: row.id }, data: { endedAt: row.lastPt } });
    }
  }

  const earlyStart = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM "Patrol" p
    JOIN "PatrolPoint" pp ON pp."patrolId" = p.id
    GROUP BY p.id
    HAVING p."startedAt" > MIN(pp.timestamp)
  `;
  if (earlyStart.length > 0) {
    console.log(`\n${earlyStart.length} patrol(s) have points before declared startedAt (review manually):`);
    for (const r of earlyStart) console.log(`  ${r.id}`);
  }

  console.log(dryRun ? '\nDry run - no changes written.' : '\nRepair complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
