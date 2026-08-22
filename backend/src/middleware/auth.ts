import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../db/prisma';
import { HttpError } from './error';
import { verifyAccessToken } from '../lib/jwt';

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

/* Short-TTL in-memory user-scope cache, so authenticated requests skip the
 * per-request user lookup (scope changes propagate within the TTL or on
 * explicit invalidateUserScope from write routes). */
const USER_CACHE_TTL_MS = 30_000;
const userScopeCache = new Map<string, { at: number; user: NonNullable<Request['user']> }>();

/** Drop cached scope for a user (or everyone) after a write. */
export function invalidateUserScope(userId?: string): void {
  if (userId) userScopeCache.delete(userId);
  else userScopeCache.clear();
}

async function resolveUser(req: Request): Promise<boolean> {
  const token = extractBearer(req);
  if (!token) return false;
  try {
    const payload = verifyAccessToken(token);

    const hit = userScopeCache.get(payload.sub);
    if (hit && Date.now() - hit.at < USER_CACHE_TTL_MS) {
      req.user = hit.user;
      return true;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        cader: true,
        isAdmin: true,
        isActive: true,
        divisionId: true,
        subDivisionId: true,
        rangeId: true,
        beatId: true,
      },
    });
    if (!user || !user.isActive) return false;
    const scopeUser = {
      id: user.id,
      role: user.role,
      cader: user.cader,
      isAdmin: user.isAdmin,
      divisionId: user.divisionId,
      subDivisionId: user.subDivisionId,
      rangeId: user.rangeId,
      beatId: user.beatId,
    };
    userScopeCache.set(payload.sub, { at: Date.now(), user: scopeUser });
    req.user = scopeUser;
    return true;
  } catch {
    return false;
  }
}

/** Attaches req.user when a valid token is present; never rejects. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    await resolveUser(req);
  } catch {
    req.user = undefined;
  }
  next();
}

/** Requires a valid token + active user. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!(await resolveUser(req))) {
    throw new HttpError(401, 'unauthenticated', 'Authentication required');
  }
  next();
}

/** Requires ADMIN role (or the legacy isAdmin flag). */
export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!(await resolveUser(req))) {
    throw new HttpError(401, 'unauthenticated', 'Authentication required');
  }
  if (req.user!.role !== 'ADMIN' && !req.user!.isAdmin) {
    throw new HttpError(403, 'forbidden', 'Admin access required');
  }
  next();
}

export function requireRoles(...roles: Role[]): (req: Request, _res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!(await resolveUser(req))) {
      throw new HttpError(401, 'unauthenticated', 'Authentication required');
    }
    if (!roles.includes(req.user!.role)) {
      throw new HttpError(403, 'forbidden', 'Insufficient permissions');
    }
    next();
  };
}