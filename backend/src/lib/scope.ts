import type { Cader, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';

/**
 * Organizational scope — the minimal role/scope model:
 *
 *   Role/Cadre  = WHO the user is / organizational responsibility
 *   Scope       = WHERE they operate / what organizational data they can access
 *
 * Scope kinds, derived from cader + assignment columns (all nullable until
 * an assignment is officially finalized):
 *
 *   DFO     → DIVISION      (divisionId = PT_MARKAPUR)
 *   DyDFO   → SUB_DIVISION  (subDivisionId = DORNALA)
 *   FRO     → RANGE         (rangeId; unset → OPERATIONAL until assigned)
 *   DyFRO   → OPERATIONAL   (group of Beats; boundaries not fixed yet)
 *   FSO     → OPERATIONAL   (Section/group of Beats; boundaries not fixed yet)
 *   FBO/ABO → BEAT          (beatId; unset → OPERATIONAL until assigned)
 *
 * Backward compatibility: legacy role=ADMIN accounts without a DyDFO
 * assignment keep division-wide access (current behavior), and RANGER
 * accounts without any assignment resolve to OPERATIONAL (own data only —
 * identical to today's non-admin behavior).
 */

export const DIVISION_PT_MARKAPUR = 'PT_MARKAPUR';
export const SUB_DIVISION_DORNALA = 'DORNALA';

export interface ScopeUser {
  id: string;
  role: string;
  cader: Cader;
  isAdmin: boolean;
  divisionId?: string | null;
  subDivisionId?: string | null;
  rangeId?: string | null;
  beatId?: string | null;
}

export type ScopeKind = 'DIVISION' | 'SUB_DIVISION' | 'RANGE' | 'BEAT' | 'OPERATIONAL';

export interface UserScope {
  kind: ScopeKind;
  divisionId?: string;
  subDivisionId?: string;
  rangeId?: string;
  beatId?: string;
}

/** Resolve a user's organizational scope from their cader + assignment. */
export function getUserScope(user: ScopeUser): UserScope {
  if (user.cader === 'DyDFO' && user.subDivisionId) {
    return { kind: 'SUB_DIVISION', subDivisionId: user.subDivisionId };
  }
  if (user.cader === 'DFO' && user.divisionId) {
    return { kind: 'DIVISION', divisionId: user.divisionId };
  }
  if (user.cader === 'FRO' && user.rangeId) {
    return { kind: 'RANGE', rangeId: user.rangeId };
  }
  if ((user.cader === 'FBO' || user.cader === 'ABO') && user.beatId) {
    return { kind: 'BEAT', beatId: user.beatId };
  }
  // Legacy admin (role ADMIN / isAdmin) without an explicit DyDFO
  // sub-division assignment → division-wide (preserves current behavior).
  if (user.role === 'ADMIN' || user.isAdmin) {
    return { kind: 'DIVISION' };
  }
  return { kind: 'OPERATIONAL' };
}

/** True when the user sees the whole division (DFO / legacy admin). */
export function isDivisionWide(user: ScopeUser): boolean {
  return getUserScope(user).kind === 'DIVISION';
}

/**
 * True when the user holds an officer scope — DIVISION (DFO / legacy admin),
 * SUB_DIVISION (DyDFO) or RANGE (FRO). Only these roles may read SOS alert
 * feeds and acknowledge (verify) incidents; BEAT/OPERATIONAL users may not,
 * not even on their own records.
 */
export function isOfficerScope(user: ScopeUser): boolean {
  const kind = getUserScope(user).kind;
  return kind === 'DIVISION' || kind === 'SUB_DIVISION' || kind === 'RANGE';
}

/**
 * Beat names belonging to a set of range names (via Beat.rangeName, the
 * existing free-text GIS linkage — no schema change to the Beat table).
 */
export async function beatNamesForRanges(rangeNames: string[]): Promise<string[]> {
  if (rangeNames.length === 0) return [];
  const beats = await prisma.beat.findMany({
    where: { rangeName: { in: rangeNames } },
    select: { name: true },
  });
  return beats.map((b) => b.name);
}

/**
 * Users whose organizational assignment places them inside the scope
 * (sub-division / range / beat). Used to scope records that carry only a
 * userId (incidents) or as a fallback for records with weak geography.
 */
export async function userIdsInScope(scope: UserScope): Promise<string[]> {
  if (scope.kind === 'DIVISION') return [];
  if (scope.kind === 'SUB_DIVISION') {
    const users = await prisma.user.findMany({
      where: { subDivisionId: scope.subDivisionId },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  if (scope.kind === 'RANGE') {
    const users = await prisma.user.findMany({
      where: { rangeId: scope.rangeId },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  if (scope.kind === 'BEAT' && scope.beatId) {
    const users = await prisma.user.findMany({
      where: { beatId: scope.beatId },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  return [];
}

/** Ranges belonging to the user's sub-division. */
export async function rangeNamesInScope(scope: UserScope): Promise<string[]> {
  if (scope.kind !== 'SUB_DIVISION' || !scope.subDivisionId) return [];
  const ranges = await prisma.range.findMany({
    where: { subDivisionId: scope.subDivisionId },
    select: { name: true },
  });
  return ranges.map((r) => r.name);
}

/**
 * Prisma Patrol filter that restricts a query to the user's organizational
 * scope. Returns undefined for division-wide users (no filter). Field users
 * with OPERATIONAL scope get a never-match sentinel; callers handle
 * "own data only" separately (see applyPatrolWhere).
 */
export async function patrolScopeFilter(user: ScopeUser): Promise<Prisma.PatrolWhereInput | undefined> {
  const scope = getUserScope(user);
  if (scope.kind === 'DIVISION') return undefined;
  if (scope.kind === 'OPERATIONAL') return { id: '__none__' };

  const [userIds, rangeNames] = await Promise.all([
    userIdsInScope(scope),
    scope.kind === 'SUB_DIVISION' ? rangeNamesInScope(scope) : Promise.resolve([]),
  ]);

  const and: Prisma.PatrolWhereInput[] = [];
  if (scope.kind === 'RANGE') {
    const range = scope.rangeId
      ? await prisma.range.findUnique({ where: { id: scope.rangeId }, select: { name: true } })
      : null;
    const beatNames = range ? await beatNamesForRanges([range.name]) : [];
    and.push({ OR: [{ beat: { in: beatNames } }, { userId: { in: userIds } }] });
  } else if (scope.kind === 'SUB_DIVISION') {
    const beatNames = await beatNamesForRanges(rangeNames);
    and.push({ OR: [{ beat: { in: beatNames } }, { userId: { in: userIds } }] });
  } else if (scope.kind === 'BEAT') {
    if (scope.beatId) {
      const beat = await prisma.beat.findUnique({ where: { id: scope.beatId }, select: { name: true } });
      and.push({ OR: [{ beat: beat ? beat.name : '__none__' }, { userId: { in: userIds } }] });
    } else {
      and.push({ id: '__none__' });
    }
  }

  return { AND: and };
}

/**
 * Compose a Patrol findMany `where` for a list request: non-admin users see
 * their own records only (current behavior), admin-web roles see their
 * organizational scope, and field users never get area-wide lists.
 */
export async function applyPatrolWhere(
  user: ScopeUser,
  base: Prisma.PatrolWhereInput,
  opts: { mine: boolean },
): Promise<Prisma.PatrolWhereInput> {
  if (isDivisionWide(user)) {
    return opts.mine ? { ...base, userId: user.id } : base;
  }
  const scope = getUserScope(user);
  if (scope.kind === 'OPERATIONAL') {
    // Field user (FBO/ABO/FSO/DyFRO): own data only — unchanged behavior.
    return { ...base, userId: user.id };
  }
  const filter = await patrolScopeFilter(user);
  return { ...base, ...(filter ?? {}) };
}

/** True when a patrol record is visible to the user (ownership or scope). */
export async function patrolVisibleTo(
  user: ScopeUser,
  patrol: { userId: string; beat: string | null },
): Promise<boolean> {
  if (isDivisionWide(user)) return true;
  const scope = getUserScope(user);
  if (scope.kind === 'OPERATIONAL') return patrol.userId === user.id;
  if (patrol.userId === user.id) return true;

  if (scope.kind === 'SUB_DIVISION') {
    const rangeNames = await rangeNamesInScope(scope);
    const beatNames = await beatNamesForRanges(rangeNames);
    if (patrol.beat && beatNames.includes(patrol.beat)) return true;
    const scopedUsers = await userIdsInScope(scope);
    return scopedUsers.includes(patrol.userId);
  }
  if (scope.kind === 'RANGE' && scope.rangeId) {
    const range = await prisma.range.findUnique({ where: { id: scope.rangeId }, select: { name: true } });
    const beatNames = range ? await beatNamesForRanges([range.name]) : [];
    if (patrol.beat && beatNames.includes(patrol.beat)) return true;
    const scopedUsers = await userIdsInScope(scope);
    return scopedUsers.includes(patrol.userId);
  }
  if (scope.kind === 'BEAT') {
    if (!scope.beatId) return false;
    const beat = await prisma.beat.findUnique({ where: { id: scope.beatId }, select: { name: true } });
    if (patrol.beat && beat && patrol.beat === beat.name) return true;
    const scopedUsers = await userIdsInScope(scope);
    return scopedUsers.includes(patrol.userId);
  }
  return false;
}

/**
 * Prisma Incident filter restricted to the user's organizational scope.
 * Incidents carry userId (+optional patrolId), so the filter resolves the
 * in-scope user set (and patrol set for sub-division/range/beat scopes).
 */
export async function incidentScopeFilter(user: ScopeUser): Promise<Prisma.IncidentWhereInput | undefined> {
  const scope = getUserScope(user);
  if (scope.kind === 'DIVISION') return undefined;
  if (scope.kind === 'OPERATIONAL') return { id: '__none__' };

  const userIds = await userIdsInScope(scope);
  const or: Prisma.IncidentWhereInput[] = [{ userId: { in: userIds } }];

  if (scope.kind === 'SUB_DIVISION') {
    const beatNames = await beatNamesForRanges(await rangeNamesInScope(scope));
    if (beatNames.length > 0) {
      const patrolIds = (await prisma.patrol.findMany({ where: { beat: { in: beatNames } }, select: { id: true } })).map((p) => p.id);
      if (patrolIds.length > 0) or.push({ patrolId: { in: patrolIds } });
    }
  } else if (scope.kind === 'RANGE' && scope.rangeId) {
    const range = await prisma.range.findUnique({ where: { id: scope.rangeId }, select: { name: true } });
    const beatNames = range ? await beatNamesForRanges([range.name]) : [];
    if (beatNames.length > 0) {
      const patrolIds = (await prisma.patrol.findMany({ where: { beat: { in: beatNames } }, select: { id: true } })).map((p) => p.id);
      if (patrolIds.length > 0) or.push({ patrolId: { in: patrolIds } });
    }
  } else if (scope.kind === 'BEAT' && scope.beatId) {
    const beat = await prisma.beat.findUnique({ where: { id: scope.beatId }, select: { name: true } });
    if (beat) {
      const patrolIds = (await prisma.patrol.findMany({ where: { beat: beat.name }, select: { id: true } })).map((p) => p.id);
      if (patrolIds.length > 0) or.push({ patrolId: { in: patrolIds } });
    }
  }

  return { OR: or };
}

/**
 * Compose an Incident findMany `where`: own records for field users
 * (unchanged), organizational scope for admin-web roles.
 */
export async function applyIncidentWhere(
  user: ScopeUser,
  base: Prisma.IncidentWhereInput,
  opts: { mine: boolean },
): Promise<Prisma.IncidentWhereInput> {
  if (isDivisionWide(user)) {
    return opts.mine ? { ...base, userId: user.id } : base;
  }
  const scope = getUserScope(user);
  if (scope.kind === 'OPERATIONAL') {
    return { ...base, userId: user.id };
  }
  const filter = await incidentScopeFilter(user);
  return { ...base, ...(filter ?? {}) };
}

/** True when an incident is visible to the user. */
export async function incidentVisibleTo(
  user: ScopeUser,
  incident: { userId: string; patrolId: string | null },
): Promise<boolean> {
  if (isDivisionWide(user)) return true;
  const scope = getUserScope(user);
  if (scope.kind === 'OPERATIONAL') return incident.userId === user.id;
  if (incident.userId === user.id) return true;

  const userIds = await userIdsInScope(scope);
  if (userIds.includes(incident.userId)) return true;
  if (incident.patrolId) {
    const patrol = await prisma.patrol.findUnique({
      where: { id: incident.patrolId },
      select: { userId: true, beat: true },
    });
    if (patrol) return patrolVisibleTo(user, patrol);
  }
  return false;
}

/** Prisma User filter restricted to the user's organizational scope. */
export async function userScopeFilter(user: ScopeUser): Promise<Prisma.UserWhereInput | undefined> {
  const scope = getUserScope(user);
  if (scope.kind === 'DIVISION') return undefined;
  if (scope.kind === 'OPERATIONAL') return { id: user.id };

  const or: Prisma.UserWhereInput[] = [];
  if (scope.kind === 'SUB_DIVISION' && scope.subDivisionId) {
    or.push({ subDivisionId: scope.subDivisionId });
    const rangeNames = await rangeNamesInScope(scope);
    const ranges = await prisma.range.findMany({ where: { name: { in: rangeNames } }, select: { id: true } });
    if (ranges.length > 0) or.push({ rangeId: { in: ranges.map((r) => r.id) } });
    const beatNames = await beatNamesForRanges(rangeNames);
    if (beatNames.length > 0) {
      const beats = await prisma.beat.findMany({ where: { name: { in: beatNames } }, select: { id: true } });
      if (beats.length > 0) or.push({ beatId: { in: beats.map((b) => b.id) } });
    }
  } else if (scope.kind === 'RANGE' && scope.rangeId) {
    or.push({ rangeId: scope.rangeId });
  } else if (scope.kind === 'BEAT' && scope.beatId) {
    or.push({ beatId: scope.beatId });
  }

  return { OR: or };
}

/**
 * Assert that a target user falls inside the acting user's organizational
 * scope (used for user management actions). Division-wide users manage
 * everyone; DyDFO manages Dornal(a) users only; field users manage nobody.
 */
export async function assertUserManageable(
  actor: ScopeUser,
  target: { id: string; subDivisionId?: string | null; rangeId?: string | null; beatId?: string | null },
): Promise<boolean> {
  const scope = getUserScope(actor);
  if (scope.kind === 'DIVISION') return true;
  if (scope.kind === 'SUB_DIVISION') {
    if (target.subDivisionId === scope.subDivisionId) return true;
    if (target.rangeId) {
      const range = await prisma.range.findUnique({ where: { id: target.rangeId }, select: { subDivisionId: true } });
      if (range?.subDivisionId === scope.subDivisionId) return true;
    }
    const scopedUsers = await userIdsInScope(scope);
    return scopedUsers.includes(target.id);
  }
  return false;
}
