import { randomBytes, createHash, createHmac } from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { Role } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(userId: string, role: Role): string {
  const payload: AccessTokenPayload = { sub: userId, role };
  // Access tokens are intentionally non-expiring: the mobile app is a
  // always-logged-in, offline-first field tool, so a short TTL would only
  // cause sync/patrol calls to fail with 401 after the device regains
  // connectivity. Sessions are ended via logout (client clears the token).
  return jwt.sign(payload, env.JWT_SECRET, {
    issuer: 'nstrpatrol',
    audience: 'nstrpatrol-api',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    issuer: 'nstrpatrol',
    audience: 'nstrpatrol-api',
  }) as jwt.JwtPayload & AccessTokenPayload;
  if (!decoded.sub) throw new Error('missing subject');
  return { sub: decoded.sub, role: decoded.role };
}

export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString('hex');
  const hash = hashRefreshToken(token);
  return { token, hash };
}

export function hashRefreshToken(token: string): string {
  return createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');
}

export function generateVerificationDigest(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
