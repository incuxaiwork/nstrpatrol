import { prisma } from '../db/prisma';

const STALE_DAYS = 7;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Auto-complete ACTIVE patrols that have seen no update in any form
 * (PatrolPoint / Incident (SOS, observation) / StepReading / Movement / etc.)
 * for 7 days. Runs entirely in the background — no UI surface.
 *
 * Idempotent: only touches patrols still ACTIVE and with lastActivity < cutoff.
 * endedAt is set to the last real activity timestamp (never fabricated to `now`)
 * so duration remains truthful; if no point/incident exists, falls back to
 * startedAt (or now if even that is null).
 */
export async function autoCompleteStalePatrols(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_MS);
  // Quick pre-filter: ACTIVE patrols whose own startedAt/updatedAt is already
  // older than cutoff. This keeps the job cheap when thousands of patrols exist.
  const candidates = await prisma.patrol.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { updatedAt: { lt: cutoff } },
        { startedAt: { lt: cutoff } },
      ],
    },
    select: { id: true, startedAt: true, updatedAt: true, userId: true },
    take: 500,
  });

  if (candidates.length === 0) return 0;

  let completed = 0;
  for (const p of candidates) {
    // Latest activity across all patrol-linked tables.
    // Each query is indexed on (patrolId, timestamp/occurredAt).
    const [lastPoint, lastIncident, lastStep, lastMovement] = await Promise.all([
      prisma.patrolPoint.findFirst({
        where: { patrolId: p.id },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      }),
      prisma.incident.findFirst({
        where: { patrolId: p.id },
        orderBy: { occurredAt: 'desc' },
        select: { occurredAt: true, reportedAt: true },
      }),
      prisma.stepReading.findFirst({
        where: { patrolId: p.id },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      }),
      prisma.movementModeReading.findFirst({
        where: { patrolId: p.id },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      }),
    ]);

    const times: number[] = [];
    if (lastPoint?.timestamp) times.push(new Date(lastPoint.timestamp).getTime());
    if (lastIncident?.occurredAt) times.push(new Date(lastIncident.occurredAt).getTime());
    if (lastIncident?.reportedAt) times.push(new Date(lastIncident.reportedAt).getTime());
    if (lastStep?.timestamp) times.push(new Date(lastStep.timestamp).getTime());
    if (lastMovement?.timestamp) times.push(new Date(lastMovement.timestamp).getTime());
    if (p.startedAt) times.push(new Date(p.startedAt).getTime());
    if (p.updatedAt) times.push(new Date(p.updatedAt).getTime());

    const lastActivityMs = times.length ? Math.max(...times) : 0;
    if (!lastActivityMs) continue;
    const lastActivity = new Date(lastActivityMs);
    if (lastActivity >= cutoff) continue; // still fresh — has recent SOS/point/observation

    // Defensive: never set endedAt before startedAt
    let endedAt = lastActivity;
    if (p.startedAt && endedAt < new Date(p.startedAt)) endedAt = new Date(p.startedAt);

    try {
      await prisma.patrol.update({
        where: { id: p.id },
        data: { status: 'COMPLETED', endedAt, syncStatus: 'SYNCED' },
      });
      completed++;
      console.log(`[stale-patrols] auto-completed ${p.id} (last activity ${lastActivity.toISOString()}, endedAt → ${endedAt.toISOString()})`);
    } catch (err: any) {
      console.warn(`[stale-patrols] failed to complete ${p.id}: ${err?.message ?? err}`);
    }
  }

  // Invalidate the in-memory patrol list cache so the next GET reflects new statuses.
  try {
    const { clearPatrolListCache } = await import('../routes/patrols');
    clearPatrolListCache();
  } catch { /* best-effort */ }

  if (completed > 0) console.log(`[stale-patrols] completed ${completed} stale patrol(s)`);
  return completed;
}

let interval: NodeJS.Timeout | null = null;

export function startStalePatrolJob(): void {
  if (interval) return;
  // Run once 30s after boot (lets DB/migrations settle), then hourly.
  setTimeout(() => { void autoCompleteStalePatrols(); }, 30_000);
  interval = setInterval(() => { void autoCompleteStalePatrols(); }, 60 * 60 * 1000);
  // Also run on a daily alignment at startup + 24h via the hourly interval already.
  console.log(`[stale-patrols] job scheduled: auto-complete ACTIVE patrols idle > ${STALE_DAYS} days (hourly)`);
}

export function stopStalePatrolJob(): void {
  if (interval) { clearInterval(interval); interval = null; }
}
