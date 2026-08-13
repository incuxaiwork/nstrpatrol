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
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;
