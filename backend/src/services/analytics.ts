import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import {
  beatNamesForRanges,
  getUserScope,
  incidentScopeFilter,
  isDivisionWide,
  patrolScopeFilter,
  rangeNamesInScope,
  userIdsInScope,
  type ScopeUser,
  type UserScope,
} from '../lib/scope';

/**
 * Work Analytics aggregation service.
 *
 * Every number here is computed from real backend rows via explicit SQL or
 * scoped Prisma counts. No estimates, no fabricated denominators, no
 * performance scores. Domains with no data source (attendance, tasks,
 * projects, leaves, meetings) are not represented.
 */

/** Analytics calendar timezone — all day bucketing uses IST. */
export const ANALYTICS_TIMEZONE = 'Asia/Kolkata';

/** Synthetic-data exclusion rule (contract §5): patrol/incident rows whose id carries the test prefix. */
const TEST_ID_PREFIX = 'test-';

/** id NOT LIKE 'test-%' fragment for a table alias (alias is source-controlled, safe to raw). */
function testIdExclusion(alias: string): Prisma.Sql {
  return Prisma.sql`${Prisma.raw(alias)}.id NOT LIKE ${TEST_ID_PREFIX + '%'}`;
}

/** ALL/ANY membership over a non-empty array, or a never-match clause when empty. */
function inSql(column: string, values: string[]): Prisma.Sql {
  return values.length > 0
    ? Prisma.sql`${Prisma.raw(column)} = ANY(${values})`
    : Prisma.sql`1 = 0`;
}

/**
 * Resolve the SQL predicate that mirrors this user's patrol/incident scope
 * (identical semantics to the Prisma filters in scope.ts). Field users
 * (OPERATIONAL) see their own records; admin-web roles see their
 * organizational unit; division-wide accounts see everything.
 */
async function scopedPredicates(user: ScopeUser): Promise<{ patrol: Prisma.Sql; incident: Prisma.Sql }> {
  if (isDivisionWide(user)) {
    // Division-wide: a real predicate (never Prisma.empty) so every
    // `WHERE ${scope} AND …` site stays valid SQL.
    return { patrol: Prisma.sql`1 = 1`, incident: Prisma.sql`1 = 1` };
  }
  const scope = getUserScope(user);
  if (scope.kind === 'OPERATIONAL') {
    return {
      patrol: Prisma.sql`p."userId" = ${user.id}`,
      incident: Prisma.sql`i."userId" = ${user.id}`,
    };
  }

  const userIds = await userIdsInScope(scope);
  let beatNames: string[] = [];
  if (scope.kind === 'SUB_DIVISION') {
    beatNames = await beatNamesForRanges(await rangeNamesInScope(scope));
  } else if (scope.kind === 'RANGE' && scope.rangeId) {
    const range = await prisma.range.findUnique({ where: { id: scope.rangeId }, select: { name: true } });
    if (range) beatNames = await beatNamesForRanges([range.name]);
  } else if (scope.kind === 'BEAT' && scope.beatId) {
    const beat = await prisma.beat.findUnique({ where: { id: scope.beatId }, select: { name: true } });
    if (beat) beatNames = [beat.name];
  }

  const patrolParts: Prisma.Sql[] = [];
  if (beatNames.length > 0) patrolParts.push(Prisma.sql`p."beat" = ANY(${beatNames})`);
  if (userIds.length > 0) patrolParts.push(Prisma.sql`p."userId" = ANY(${userIds})`);
  const patrol = patrolParts.length > 0 ? Prisma.sql`(${Prisma.join(patrolParts, ' OR ')})` : Prisma.sql`1 = 0`;

  const incidentParts: Prisma.Sql[] = [];
  if (userIds.length > 0) incidentParts.push(Prisma.sql`i."userId" = ANY(${userIds})`);
  if (beatNames.length > 0) {
    const patrolIds = (await prisma.patrol.findMany({ where: { beat: { in: beatNames } }, select: { id: true } })).map((p) => p.id);
    if (patrolIds.length > 0) incidentParts.push(Prisma.sql`i."patrolId" = ANY(${patrolIds})`);
  }
  const incident = incidentParts.length > 0
    ? Prisma.sql`(${Prisma.join(incidentParts, ' OR ')})`
    : Prisma.sql`1 = 0`;

  return { patrol, incident };
}

interface TimeWindow {
  from?: Date;
  to?: Date;
}

/** [from, to) window with a sane default (rolling 30 days) when omitted. */
function resolveWindow(window: TimeWindow): { from: Date; to: Date } {
  return {
    from: window.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: window.to ?? new Date(),
  };
}

export interface PatrolAnalyticsResult {
  generatedAt: string;
  timezone: string;
  from: string | null;
  to: string | null;
  scope: UserScope;
  metrics: {
    count: number;
    countByStatus: Record<string, number>;
    patrolDays: number;
    clockDurationSeconds: number;
    completedCount: number;
    gpsTrackedDistanceKm: number;
    gpsTrackedDurationSeconds: number;
    pointCount: number;
    patrolsWithPoints: number;
    steps: number;
    patrolsWithStepReadings: number;
    modeSamples: Record<string, number>;
  };
  byDay: { day: string; count: number }[];
  byUser: { userId: string; fullName: string; count: number; distanceKm: number; points: number }[];
}

export async function patrolAnalytics(user: ScopeUser, window: TimeWindow): Promise<PatrolAnalyticsResult> {
  const scope = getUserScope(user);
  const { patrol: patrolScope } = await scopedPredicates(user);
  const { from: windowFrom, to: windowTo } = resolveWindow(window);

  const patrolsCte = Prisma.sql`
    SELECT p.id AS id, p."userId", p.status, p."startedAt", p."endedAt", p."createdAt"
    FROM "Patrol" p
    WHERE ${patrolScope}
      AND ${testIdExclusion('p')}
      AND COALESCE(p."startedAt", p."createdAt") >= ${windowFrom}
      AND COALESCE(p."startedAt", p."createdAt") < ${windowTo}
  `;

  const [summary, byDay, byUser, steps, modeSamples, points] = await Promise.all([
    prisma.$queryRaw<{
      count: number;
      active: number;
      completed: number;
      cancelled: number;
      patrolDays: number;
      clockCompleted: number;
      clockDuration: string | number;
    }[]>`
      WITH patrols AS (${patrolsCte})
      SELECT
        (SELECT count(*)::int FROM patrols) AS count,
        (SELECT count(*) FILTER (WHERE status = 'ACTIVE')::int FROM patrols) AS active,
        (SELECT count(*) FILTER (WHERE status = 'COMPLETED')::int FROM patrols) AS completed,
        (SELECT count(*) FILTER (WHERE status = 'CANCELLED')::int FROM patrols) AS cancelled,
        (SELECT count(DISTINCT d)::int FROM (
          SELECT to_char(date_trunc('day', COALESCE("startedAt", "createdAt") AT TIME ZONE ${ANALYTICS_TIMEZONE}), 'YYYY-MM-DD') AS d
          FROM patrols
        ) z) AS "patrolDays",
        (SELECT count(*) FILTER (WHERE status = 'COMPLETED' AND "startedAt" IS NOT NULL AND "endedAt" IS NOT NULL)::int FROM patrols) AS "clockCompleted",
        (SELECT COALESCE(SUM(
          CASE WHEN status = 'COMPLETED' AND "startedAt" IS NOT NULL AND "endedAt" IS NOT NULL
            THEN EXTRACT(EPOCH FROM ("endedAt" - "startedAt"))
          END
        ), 0)::bigint FROM patrols) AS "clockDuration"
    `,
    prisma.$queryRaw<{ day: string; count: number }[]>`
      WITH patrols AS (${patrolsCte})
      SELECT to_char(date_trunc('day', COALESCE("startedAt", "createdAt") AT TIME ZONE ${ANALYTICS_TIMEZONE}), 'YYYY-MM-DD') AS day,
             count(*)::int AS count
      FROM patrols
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.$queryRaw<{ userId: string; fullName: string; count: number; distanceKm: number; points: number }[]>`
      WITH patrols AS (${patrolsCte}),
      points AS (
        SELECT pt."patrolId",
               count(*)::int AS pts,
               COALESCE(ST_Length(ST_MakeLine(ST_SetSRID(ST_MakePoint(pt.longitude, pt.latitude), 4326) ORDER BY pt.timestamp, pt.id)::geography) / 1000, 0)::float8 AS dist
        FROM "PatrolPoint" pt
        WHERE pt."patrolId" IN (SELECT id FROM patrols)
          AND pt.timestamp >= ${windowFrom}
          AND pt.timestamp < ${windowTo}
        GROUP BY pt."patrolId"
      )
      SELECT p."userId",
             u."fullName",
             count(DISTINCT p.id)::int AS count,
             COALESCE(SUM(pt.dist), 0)::float8 AS "distanceKm",
             COALESCE(SUM(pt.pts), 0)::int AS points
      FROM patrols p
      JOIN "User" u ON u.id = p."userId"
      LEFT JOIN points pt ON pt."patrolId" = p.id
      GROUP BY p."userId", u."fullName"
      ORDER BY count DESC
      LIMIT 20
    `,
    prisma.$queryRaw<{ steps: number; patrols: number }[]>`
      SELECT COALESCE(SUM(s.steps), 0)::bigint AS steps,
             count(DISTINCT s."patrolId")::int AS patrols
      FROM "StepReading" s
      JOIN "Patrol" p ON p.id = s."patrolId"
      WHERE ${patrolScope}
        AND ${testIdExclusion('p')}
        AND s.timestamp >= ${windowFrom}
        AND s.timestamp < ${windowTo}
    `,
    prisma.$queryRaw<{ mode: string; n: number }[]>`
      SELECT r.mode::text AS mode, count(*)::int AS n
      FROM "MovementModeReading" r
      JOIN "Patrol" p ON p.id = r."patrolId"
      WHERE ${patrolScope}
        AND ${testIdExclusion('p')}
        AND r.timestamp >= ${windowFrom}
        AND r.timestamp < ${windowTo}
      GROUP BY r.mode
      ORDER BY n DESC
    `,
    prisma.$queryRaw<{ distanceKm: number | string; durationSeconds: number | string; pointCount: number; patrolsWithPoints: number }[]>`
      WITH patrols AS (${patrolsCte}),
      points AS (
        SELECT pt."patrolId",
               count(*)::int AS pts,
               COALESCE(ST_Length(ST_MakeLine(ST_SetSRID(ST_MakePoint(pt.longitude, pt.latitude), 4326) ORDER BY pt.timestamp, pt.id)::geography) / 1000, 0)::float8 AS dist,
               COALESCE(EXTRACT(EPOCH FROM (MAX(pt.timestamp) - MIN(pt.timestamp))), 0)::float8 AS duration_secs
        FROM "PatrolPoint" pt
        WHERE pt."patrolId" IN (SELECT id FROM patrols)
          AND pt.timestamp >= ${windowFrom}
          AND pt.timestamp < ${windowTo}
        GROUP BY pt."patrolId"
      )
      SELECT COALESCE(SUM(dist), 0) AS "distanceKm",
             COALESCE(SUM(duration_secs), 0) AS "durationSeconds",
             COALESCE(SUM(pts), 0)::int AS "pointCount",
             count(*)::int AS "patrolsWithPoints"
      FROM points
    `,
  ]);

  const s = summary[0] ?? {};
  const p = points[0] ?? {};
  const st = steps[0] ?? {};

  return {
    generatedAt: new Date().toISOString(),
    timezone: ANALYTICS_TIMEZONE,
    from: window.from?.toISOString() ?? null,
    to: window.to?.toISOString() ?? null,
    scope,
    metrics: {
      count: Number(s.count ?? 0),
      countByStatus: {
        ACTIVE: Number(s.active ?? 0),
        COMPLETED: Number(s.completed ?? 0),
        CANCELLED: Number(s.cancelled ?? 0),
      },
      patrolDays: Number(s.patrolDays ?? 0),
      clockDurationSeconds: Number(s.clockDuration ?? 0),
      completedCount: Number(s.clockCompleted ?? 0),
      gpsTrackedDistanceKm: Number(p.distanceKm ?? 0),
      gpsTrackedDurationSeconds: Number(p.durationSeconds ?? 0),
      pointCount: Number(p.pointCount ?? 0),
      patrolsWithPoints: Number(p.patrolsWithPoints ?? 0),
      steps: Number(st.steps ?? 0),
      patrolsWithStepReadings: Number(st.patrols ?? 0),
      modeSamples: Object.fromEntries(modeSamples.map((m) => [m.mode, Number(m.n)])),
    },
    byDay,
    byUser: byUser.map((u) => ({
      userId: u.userId,
      fullName: u.fullName,
      count: Number(u.count ?? 0),
      distanceKm: Number(u.distanceKm ?? 0),
      points: Number(u.points ?? 0),
    })),
  };
}

export interface IncidentAnalyticsResult {
  generatedAt: string;
  timezone: string;
  from: string | null;
  to: string | null;
  scope: UserScope;
  metrics: {
    total: number;
    withLocation: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
    byDay: { day: string; count: number }[];
  };
}

export async function incidentAnalytics(
  user: ScopeUser,
  window: TimeWindow,
  filters: { type?: string; severity?: string; status?: string } = {},
): Promise<IncidentAnalyticsResult> {
  const scope = getUserScope(user);
  const { incident: incidentScope } = await scopedPredicates(user);
  const { from: windowFrom, to: windowTo } = resolveWindow(window);

  const filterSql = [
    filters.type ? Prisma.sql`AND i.type = ${filters.type}` : Prisma.empty,
    filters.severity ? Prisma.sql`AND i.severity = ${filters.severity}` : Prisma.empty,
    filters.status ? Prisma.sql`AND i.status = ${filters.status}` : Prisma.empty,
  ] as Prisma.Sql[];

  const baseWhere = Prisma.sql`
    WHERE ${incidentScope}
      AND ${testIdExclusion('i')}
      AND i."occurredAt" >= ${windowFrom}
      AND i."occurredAt" < ${windowTo}
  `;

  const [overall, byType, bySeverity, byStatus, byDay] = await Promise.all([
    prisma.$queryRaw<{ total: number; withLocation: number }[]>`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE i.latitude IS NOT NULL AND i.longitude IS NOT NULL)::int AS "withLocation"
      FROM "Incident" i
      ${baseWhere}
      ${Prisma.join(filterSql, ' ')}
    `,
    prisma.$queryRaw<{ type: string; n: number }[]>`
      SELECT i.type::text AS type, count(*)::int AS n
      FROM "Incident" i
      ${baseWhere}
      ${Prisma.join(filterSql, ' ')}
      GROUP BY i.type
      ORDER BY n DESC
    `,
    prisma.$queryRaw<{ severity: string; n: number }[]>`
      SELECT i.severity::text AS severity, count(*)::int AS n
      FROM "Incident" i
      ${baseWhere}
      ${Prisma.join(filterSql, ' ')}
      GROUP BY i.severity
      ORDER BY n DESC
    `,
    prisma.$queryRaw<{ status: string; n: number }[]>`
      SELECT i.status::text AS status, count(*)::int AS n
      FROM "Incident" i
      ${baseWhere}
      ${Prisma.join(filterSql, ' ')}
      GROUP BY i.status
      ORDER BY n DESC
    `,
    prisma.$queryRaw<{ day: string; count: number }[]>`
      SELECT to_char(date_trunc('day', i."occurredAt" AT TIME ZONE ${ANALYTICS_TIMEZONE}), 'YYYY-MM-DD') AS day,
             count(*)::int AS count
      FROM "Incident" i
      ${baseWhere}
      ${Prisma.join(filterSql, ' ')}
      GROUP BY 1
      ORDER BY 1
    `,
  ]);

  const m = overall[0] ?? {};
  return {
    generatedAt: new Date().toISOString(),
    timezone: ANALYTICS_TIMEZONE,
    from: window.from?.toISOString() ?? null,
    to: window.to?.toISOString() ?? null,
    scope,
    metrics: {
      total: Number(m.total ?? 0),
      withLocation: Number(m.withLocation ?? 0),
      byType: Object.fromEntries(byType.map((x) => [x.type, Number(x.n)])),
      bySeverity: Object.fromEntries(bySeverity.map((x) => [x.severity, Number(x.n)])),
      byStatus: Object.fromEntries(byStatus.map((x) => [x.status, Number(x.n)])),
      byDay: byDay.map((d) => ({ day: d.day, count: Number(d.count) })),
    },
  };
}

export interface HealthAnalyticsResult {
  generatedAt: string;
  timezone: string;
  from: string | null;
  to: string | null;
  scope: UserScope;
  metrics: {
    totalPatrols: number;
    patrolsWithPoints: number;
    patrolsWithoutPoints: number;
    pointCount: number;
    pending: Record<string, number>;
    syncByDay: { day: string; total: number; failed: number }[];
    syncFailureRate: number;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    integrity: { logs: number; tamperTrue: number; divergenceOver60: number };
    coverageEventsByType: Record<string, number>;
  };
}

export async function healthAnalytics(user: ScopeUser, window: TimeWindow): Promise<HealthAnalyticsResult> {
  const scope = getUserScope(user);
  const { patrol: patrolScope } = await scopedPredicates(user);
  const { from: windowFrom, to: windowTo } = resolveWindow(window);

  const [telemetrySummary, syncByDay, lastLog, integrity, coverageEvents, pending] = await Promise.all([
    prisma.$queryRaw<{ totalPatrols: number; patrolsWithPoints: number; pointCount: number }[]>`
      WITH patrols AS (
        SELECT p.id FROM "Patrol" p
        WHERE ${patrolScope}
          AND ${testIdExclusion('p')}
          AND COALESCE(p."startedAt", p."createdAt") >= ${windowFrom}
          AND COALESCE(p."startedAt", p."createdAt") < ${windowTo}
      ),
      points AS (
        SELECT pt."patrolId" AS pid, count(*)::int AS pts
        FROM "PatrolPoint" pt
        WHERE pt."patrolId" IN (SELECT id FROM patrols)
          AND pt.timestamp >= ${windowFrom}
          AND pt.timestamp < ${windowTo}
        GROUP BY pt."patrolId"
      )
      SELECT (SELECT count(*)::int FROM patrols) AS "totalPatrols",
             (SELECT count(*)::int FROM points) AS "patrolsWithPoints",
             (SELECT COALESCE(SUM(pts), 0)::int FROM points) AS "pointCount"
    `,
    prisma.$queryRaw<{ day: string; total: number; failed: number }[]>`
      SELECT to_char(date_trunc('day', s."startedAt" AT TIME ZONE ${ANALYTICS_TIMEZONE}), 'YYYY-MM-DD') AS day,
             count(*)::int AS total,
             count(*) FILTER (WHERE s.status = 'FAILED')::int AS failed
      FROM "SyncLog" s
      WHERE s."startedAt" >= ${windowFrom}
        AND s."startedAt" < ${windowTo}
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.syncLog.findFirst({ orderBy: { startedAt: 'desc' }, select: { startedAt: true, status: true } }),
    prisma.$queryRaw<{ logs: number; tamperTrue: number; divergenceOver60: number }[]>`
      SELECT count(*)::int AS logs,
             count(*) FILTER (WHERE t."tamperDetected" = true)::int AS "tamperTrue",
             count(*) FILTER (WHERE t."divergenceSeconds" > 60)::int AS "divergenceOver60"
      FROM "TimeIntegrityLog" t
      JOIN "Patrol" p ON p.id = t."patrolId"
      WHERE ${patrolScope}
        AND ${testIdExclusion('p')}
        AND t.timestamp >= ${windowFrom}
        AND t.timestamp < ${windowTo}
    `,
    prisma.$queryRaw<{ type: string; n: number }[]>`
      SELECT ce.type::text AS type, count(*)::int AS n
      FROM "CoverageEvent" ce
      JOIN "Patrol" p ON p.id = ce."patrolId"
      WHERE ${patrolScope}
        AND ${testIdExclusion('p')}
        AND ce.timestamp >= ${windowFrom}
        AND ce.timestamp < ${windowTo}
      GROUP BY ce.type
      ORDER BY n DESC
    `,
    pendingSyncCounts(user),
  ]);

  const t = telemetrySummary[0] ?? {};
  const i = integrity[0] ?? {};
  const totalPatrols = Number(t.totalPatrols ?? 0);
  const patrolsWithPoints = Number(t.patrolsWithPoints ?? 0);
  const syncTotal = syncByDay.reduce((acc, d) => acc + Number(d.total), 0);
  const syncFailed = syncByDay.reduce((acc, d) => acc + Number(d.failed), 0);

  return {
    generatedAt: new Date().toISOString(),
    timezone: ANALYTICS_TIMEZONE,
    from: window.from?.toISOString() ?? null,
    to: window.to?.toISOString() ?? null,
    scope,
    metrics: {
      totalPatrols,
      patrolsWithPoints,
      patrolsWithoutPoints: Math.max(0, totalPatrols - patrolsWithPoints),
      pointCount: Number(t.pointCount ?? 0),
      pending,
      syncByDay: syncByDay.map((d) => ({ day: d.day, total: Number(d.total), failed: Number(d.failed) })),
      syncFailureRate: syncTotal === 0 ? 0 : Math.round((syncFailed / syncTotal) * 1000) / 10,
      lastSyncAt: lastLog?.startedAt.toISOString() ?? null,
      lastSyncStatus: lastLog?.status ?? null,
      integrity: {
        logs: Number(i.logs ?? 0),
        tamperTrue: Number(i.tamperTrue ?? 0),
        divergenceOver60: Number(i.divergenceOver60 ?? 0),
      },
      coverageEventsByType: Object.fromEntries(coverageEvents.map((c) => [c.type, Number(c.n)])),
    },
  };
}

/**
 * Pending (unsynced) row counts per telemetry/incident entity, scoped exactly
 * like GET /api/sync/status (own records for field users, unit scope for
 * admin-web roles, everything for division-wide accounts).
 */
async function pendingSyncCounts(user: ScopeUser): Promise<Record<string, number>> {
  const isDivision = isDivisionWide(user);
  const isOperational = getUserScope(user).kind === 'OPERATIONAL';

  let patrolIds: string[] = [];
  if (!isDivision && !isOperational) {
    const filter = (await patrolScopeFilter(user)) ?? { id: '__none__' };
    patrolIds = (await prisma.patrol.findMany({ where: filter, select: { id: true } })).map((p) => p.id);
  }

  const patrolIdIn = patrolIds.length > 0 ? { patrolId: { in: patrolIds } } : { id: '__none__' as const };
  const incidentWhere: Prisma.IncidentWhereInput = isDivision
    ? {}
    : isOperational
      ? { userId: user.id }
      : ((await incidentScopeFilter(user)) ?? { id: '__none__' });

  const pending = { syncStatus: 'PENDING' as const };
  const telemetryWhere = isDivision ? pending : { ...pending, ...patrolIdIn };

  const [points, steps, barometer, accelerometer, gyroscope, magnetometer, segments, coverage, integrity, incidents] =
    await Promise.all([
      prisma.patrolPoint.count({ where: telemetryWhere }),
      prisma.stepReading.count({ where: telemetryWhere }),
      prisma.barometerReading.count({ where: telemetryWhere }),
      prisma.accelerometerReading.count({ where: telemetryWhere }),
      prisma.gyroscopeReading.count({ where: telemetryWhere }),
      prisma.magnetometerReading.count({ where: telemetryWhere }),
      prisma.activitySegment.count({ where: telemetryWhere }),
      prisma.coverageEvent.count({ where: telemetryWhere }),
      prisma.timeIntegrityLog.count({ where: telemetryWhere }),
      prisma.incident.count({ where: { ...pending, ...incidentWhere } }),
    ]);

  return {
    points,
    steps,
    barometer,
    accelerometer,
    gyroscope,
    magnetometer,
    segments,
    coverage,
    integrity,
    incidents,
  };
}