import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { validateBody, validateParams } from '../middleware/validate';
import { HttpError } from '../middleware/error';
import { param } from '../lib/http';
import { optionDefaults } from '../config/options';

export const optionsRouter = Router();

optionsRouter.use(requireAuth);

const keySchema = z.object({ key: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/) });

optionsRouter.get('/:key', validateParams(keySchema), async (req, res) => {
  const key = param(req, 'key');
  const defaults = optionDefaults[key];
  if (!defaults) throw new HttpError(404, 'not_found', 'Unknown option key');

  const override = await prisma.appOption.findUnique({ where: { key } });
  res.json({
    key,
    kind: defaults.kind,
    value: override ? override.value : defaults.default,
    overridden: Boolean(override),
    updatedAt: override?.updatedAt ?? null,
  });
});

const putSchema = z.object({ value: z.unknown() });

optionsRouter.put('/:key', requireAdmin, validateParams(keySchema), validateBody(putSchema), async (req, res) => {
  const key = param(req, 'key');
  if (!optionDefaults[key]) throw new HttpError(404, 'not_found', 'Unknown option key');

  const option = await prisma.appOption.upsert({
    where: { key },
    update: { value: req.body.value as object },
    create: { key, value: req.body.value as object },
  });
  res.json({
    key,
    kind: optionDefaults[key].kind,
    value: option.value,
    overridden: true,
    updatedAt: option.updatedAt,
  });
});
