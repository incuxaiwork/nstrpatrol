import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { param } from '../lib/http';
import { queryString } from '../lib/http';
import { HttpError } from '../middleware/error';

export const devicesRouter = Router();

devicesRouter.use(requireAuth);

const registerSchema = z.object({
  deviceName: z.string().trim().min(1).max(120),
  deviceModel: z.string().trim().max(120).default(''),
  deviceId: z.string().trim().min(1).max(255),
  pushToken: z.string().trim().max(512).nullish(),
});

devicesRouter.post('/', validateBody(registerSchema), async (req, res) => {
  const { deviceName, deviceModel, deviceId, pushToken } = req.body;
  const device = await prisma.device.upsert({
    where: { deviceId },
    update: {
      userId: req.user!.id,
      deviceName,
      deviceModel,
      pushToken: pushToken ?? null,
      lastSeenAt: new Date(),
    },
    create: {
      userId: req.user!.id,
      deviceName,
      deviceModel,
      deviceId,
      pushToken: pushToken ?? null,
    },
  });
  res.status(201).json(device);
});

devicesRouter.get('/', async (req, res) => {
  const isAdmin = req.user!.role === 'ADMIN' || req.user!.isAdmin;
  const userId = isAdmin ? (queryString(req, 'userId')) : req.user!.id;
  const devices = await prisma.device.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { lastSeenAt: 'desc' },
  });
  res.json(devices);
});

const updateSchema = z.object({
  pushToken: z.string().trim().max(512).nullish(),
  deviceName: z.string().trim().min(1).max(120).optional(),
});

devicesRouter.patch('/:id', validateBody(updateSchema), async (req, res) => {
  const id = param(req, 'id');
  const device = await prisma.device.findUnique({ where: { id } });
  if (!device) throw new HttpError(404, 'not_found', 'Device not found');
  const isAdmin = req.user!.role === 'ADMIN' || req.user!.isAdmin;
  if (device.userId !== req.user!.id && !isAdmin) {
    throw new HttpError(403, 'forbidden', 'You can only update your own devices');
  }

  const data: Record<string, unknown> = { lastSeenAt: new Date() };
  if (req.body.pushToken !== undefined) data.pushToken = req.body.pushToken ?? null;
  if (req.body.deviceName !== undefined) data.deviceName = req.body.deviceName;

  const updated = await prisma.device.update({ where: { id }, data });
  res.json(updated);
});
