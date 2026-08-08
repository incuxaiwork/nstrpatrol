import { randomBytes, createHash, createHmac } from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { Role } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

const ACCESS_TTL: Record<string, number> = {
  '15m': 15 * 60,
  '1h': 3600,
  '12h': 12 * 3600,
  '24h': 24 * 3600,
};

function ttlSeconds(value: string, fallback: number): number {
  const known = ACCESS_TTL[value];
  if (known) return known;
  const m = /^(\d+)d$/.exec(value);
  return m ? Number(m[1]) * 24 * 3600 : fallback;
}

export function signAccessToken(userId: string, role: Role): string {
  const payload: AccessTokenPayload = { sub: userId, role };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: ttlSeconds(env.JWT_EXPIRES_IN, 15 * 60),
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
