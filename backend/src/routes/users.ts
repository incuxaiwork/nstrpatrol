import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAdmin, requireAuth, invalidateUserScope } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { HttpError } from '../middleware/error';
import { param } from '../lib/http';
import { hashPassword } from '../lib/password';
import { userSelect } from '../lib/user';
import { assertUserManageable, isDivisionWide, userScopeFilter } from '../lib/scope';

export const usersRouter = Router();

usersRouter.use(requireAuth);

const listQuery = z.object({
  role: z.enum(['ADMIN', 'RANGER']).optional(),
  q: z.string().trim().max(120).optional(),
});

usersRouter.get('/', validateQuery(listQuery), async (req, res) => {
  const { role, q } = req.query as z.infer<typeof listQuery>;
  const where: Record<string, unknown> = {
    ...(role ? { role } : {}),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  if (!isDivisionWide(req.user!)) {
    const scope = await userScopeFilter(req.user!);
    if (scope) where.AND = [scope];
  }
  const users = await prisma.user.findMany({
    where: where as never,
    select: userSelect,
    orderBy: { fullName: 'asc' },
  });
  res.json(users);
});

const updateSchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  role: z.enum(['ADMIN', 'RANGER']).optional(),
  cader: z.enum(['DFO', 'DyDFO', 'FRO', 'DyRO', 'FSO', 'FBO', 'ABO']).optional(),
  phone: z.string().trim().max(30).nullish(),
  divisionId: z.string().trim().max(64).nullish(),
  subDivisionId: z.string().trim().max(64).nullish(),
  rangeId: z.string().trim().max(64).nullish(),
  beatId: z.string().trim().max(64).nullish(),
  password: z.string().min(8).max(128).optional(),
});

usersRouter.patch('/:id', requireAdmin, validateBody(updateSchema), async (req, res) => {
  const id = param(req, 'id');
  const { fullName, role, cader, phone, divisionId, subDivisionId, rangeId, beatId, password } = req.body;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(404, 'not_found', 'User not found');
  if (!(await assertUserManageable(req.user!, user))) {
    throw new HttpError(403, 'forbidden', 'You can only manage users within your scope');
  }

  const data: Record<string, unknown> = {};
  if (fullName !== undefined) data.fullName = fullName;
  if (role !== undefined) data.role = role;
  if (cader !== undefined) data.cader = cader;
  if (phone !== undefined) data.phone = phone ?? null;
  if (divisionId !== undefined) data.divisionId = divisionId ?? null;
  if (subDivisionId !== undefined) data.subDivisionId = subDivisionId ?? null;
  if (rangeId !== undefined) data.rangeId = rangeId ?? null;
  if (beatId !== undefined) data.beatId = beatId ?? null;
  if (role !== undefined) data.isAdmin = role === 'ADMIN';
  if (password !== undefined) data.passwordHash = await hashPassword(password);

  const updated = await prisma.user.update({ where: { id }, data, select: userSelect });
  invalidateUserScope(id);
  res.json(updated);
});

async function setActive(id: string, isActive: boolean) {
  const user = await prisma.user.update({ where: { id }, data: { isActive }, select: userSelect });
  invalidateUserScope(id);
  return user;
}

usersRouter.post('/:id/deactivate', requireAdmin, async (req, res) => {
  const id = param(req, 'id');
  if (id === req.user!.id) {
    throw new HttpError(403, 'forbidden', 'You cannot deactivate your own account');
  }
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(404, 'not_found', 'User not found');
  if (!(await assertUserManageable(req.user!, user))) {
    throw new HttpError(403, 'forbidden', 'You can only manage users within your scope');
  }
  res.json(await setActive(id, false));
});

usersRouter.post('/:id/activate', requireAdmin, async (req, res) => {
  const id = param(req, 'id');
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(404, 'not_found', 'User not found');
  if (!(await assertUserManageable(req.user!, user))) {
    throw new HttpError(403, 'forbidden', 'You can only manage users within your scope');
  }
  res.json(await setActive(id, true));
});
