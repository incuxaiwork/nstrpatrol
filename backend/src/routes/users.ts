import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { HttpError } from '../middleware/error';
import { param } from '../lib/http';
import { hashPassword } from '../lib/password';
import { userSelect } from '../lib/user';

export const usersRouter = Router();

usersRouter.use(requireAuth);

const listQuery = z.object({
  role: z.enum(['ADMIN', 'RANGER']).optional(),
  q: z.string().trim().max(120).optional(),
});

usersRouter.get('/', validateQuery(listQuery), async (req, res) => {
  const { role, q } = req.query as z.infer<typeof listQuery>;
  const users = await prisma.user.findMany({
    where: {
      ...(role ? { role } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: userSelect,
    orderBy: { fullName: 'asc' },
  });
  res.json(users);
});

const updateSchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  role: z.enum(['ADMIN', 'RANGER']).optional(),
  cader: z.enum(['FRO', 'DyRO', 'FSO', 'FBO', 'ABO']).optional(),
  phone: z.string().trim().max(30).nullish(),
  password: z.string().min(8).max(128).optional(),
});

usersRouter.patch('/:id', requireAdmin, validateBody(updateSchema), async (req, res) => {
  const id = param(req, 'id');
  const { fullName, role, cader, phone, password } = req.body;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(404, 'not_found', 'User not found');

  const data: Record<string, unknown> = {};
  if (fullName !== undefined) data.fullName = fullName;
  if (role !== undefined) data.role = role;
  if (cader !== undefined) data.cader = cader;
  if (phone !== undefined) data.phone = phone ?? null;
  if (role !== undefined) data.isAdmin = role === 'ADMIN';
  if (password !== undefined) data.passwordHash = await hashPassword(password);

  const updated = await prisma.user.update({ where: { id }, data, select: userSelect });
  res.json(updated);
});

async function setActive(id: string, isActive: boolean) {
  const user = await prisma.user.update({ where: { id }, data: { isActive }, select: userSelect });
  return user;
}

usersRouter.post('/:id/deactivate', requireAdmin, async (req, res) => {
  const user = await setActive(param(req, 'id'), false);
  res.json(user);
});

usersRouter.post('/:id/activate', requireAdmin, async (req, res) => {
  const user = await setActive(param(req, 'id'), true);
  res.json(user);
});
