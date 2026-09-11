import type { Prisma, User } from '@prisma/client';

export type SafeUser = Omit<User, 'passwordHash' | 'refreshTokenHash'>;

export function serializeUser(user: User): SafeUser {
  const { passwordHash, refreshTokenHash, ...safe } = user;
  void passwordHash;
  void refreshTokenHash;
  return safe;
}

export const userSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  cader: true,
  phone: true,
  isActive: true,
  isAdmin: true,
  divisionId: true,
  subDivisionId: true,
  rangeId: true,
  beatId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

/**
 * Authoritative cader → portal role mapping. The role of an admin-created
 * account is ALWAYS derived here on the server from the organizational
 * cader — a client-supplied role is never trusted. DFO/DyDFO are the
 * division command (ADMIN); every field cader is RANGER.
 */
export const ROLE_FOR_CADER: Record<string, 'ADMIN' | 'RANGER'> = {
  DFO: 'ADMIN',
  DyDFO: 'ADMIN',
  FRO: 'RANGER',
  DyRO: 'RANGER',
  FSO: 'RANGER',
  FBO: 'RANGER',
  ABO: 'RANGER',
};
