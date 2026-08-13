import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { HttpError } from '../middleware/error';
import { hashPassword, verifyPassword } from '../lib/password';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from '../lib/jwt';
import { serializeUser, userSelect } from '../lib/user';

export const authRouter = Router();

const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(8).max(128);

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(1).max(120),
  role: z.enum(['ADMIN', 'RANGER']).default('RANGER'),
  cader: z.enum(['FRO', 'DyRO', 'FSO', 'FBO', 'ABO']).default('FBO'),
  phone: z.string().trim().max(30).nullish(),
});

authRouter.post('/register', optionalAuth, validateBody(registerSchema), async (req, res) => {
  const { email, password, fullName, role, cader, phone } = req.body;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new HttpError(409, 'conflict', 'A user with that email already exists');

  // First-run bootstrap: when no users exist, registration is open and the
  // first account is created as ADMIN so the platform can be brought up
  // without seeding the database directly (see implementation_status.md §0).
  const userCount = await prisma.user.count();
  const isFirstUser = userCount === 0;
  if (!isFirstUser && req.user?.role !== 'ADMIN' && !req.user?.isAdmin) {
    throw new HttpError(403, 'forbidden', 'Admin access required to create users');
  }

  const effectiveRole = isFirstUser ? 'ADMIN' : role;
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName,
      role: effectiveRole,
      cader,
      phone: phone ?? null,
      isAdmin: effectiveRole === 'ADMIN',
    },
    select: userSelect,
  });
  res.status(201).json(user);
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

authRouter.post('/login', validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(401, 'invalid_credentials', 'Invalid email or password');
  }
  if (!user.isActive) throw new HttpError(403, 'account_disabled', 'This account is disabled');

  const refresh = generateRefreshToken();
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshTokenHash: refresh.hash },
  });

  res.json({
    accessToken: signAccessToken(user.id, user.role),
    refreshToken: refresh.token,
    user: serializeUser(user),
  });
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

authRouter.post('/refresh', validateBody(refreshSchema), async (req, res) => {
  const { refreshToken } = req.body;
  const hash = hashRefreshToken(refreshToken);
  const user = await prisma.user.findFirst({ where: { refreshTokenHash: hash } });
  if (!user || !user.isActive) throw new HttpError(401, 'invalid_refresh', 'Invalid refresh token');

  const rotated = generateRefreshToken();
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshTokenHash: rotated.hash },
  });

  res.json({
    accessToken: signAccessToken(user.id, user.role),
    refreshToken: rotated.token,
  });
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { refreshTokenHash: null },
  });
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.id },
    select: userSelect,
  });
  res.json(user);
});

const passwordSchemaBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

authRouter.patch('/password', requireAuth, validateBody(passwordSchemaBody), async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new HttpError(401, 'invalid_credentials', 'Current password is incorrect');
  }
  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw new HttpError(400, 'validation_error', 'New password must differ from the current one');
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  res.status(204).end();
});
