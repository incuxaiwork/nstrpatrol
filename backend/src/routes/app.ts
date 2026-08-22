import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAdmin } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { HttpError } from '../middleware/error';

export const appRouter = Router();

const APK_KEY_PATTERN = /^[0-9]{8}\/[a-f0-9]{16}\.[a-z0-9]{1,12}$/i;

// Public: mobile clients poll this to discover updates without being logged in
// on a fresh install (and without auth headers in DownloadManager).
appRouter.get('/latest', async (_req, res) => {
  const release = await prisma.appRelease.findFirst({
    where: { isLatest: true },
    orderBy: { versionCode: 'desc' },
  });
  if (!release) throw new HttpError(404, 'not_found', 'No release published');
  res.json({
    versionCode: release.versionCode,
    versionName: release.versionName,
    apkKey: release.apkKey,
    downloadUrl: `/api/uploads/${release.apkKey}`,
    sha256: release.sha256,
    sizeBytes: release.sizeBytes,
    notes: release.notes,
  });
});

appRouter.get('/', requireAdmin, async (_req, res) => {
  const releases = await prisma.appRelease.findMany({ orderBy: { versionCode: 'desc' } });
  res.json(releases);
});

const createSchema = z.object({
  versionCode: z.number().int().min(1),
  versionName: z.string().trim().min(1).max(32),
  // Values returned by POST /api/uploads for the previously uploaded APK.
  apkKey: z.string().regex(APK_KEY_PATTERN, 'Upload the APK via POST /api/uploads first'),
  sha256: z.string().length(64),
  sizeBytes: z.number().int().positive(),
  notes: z.string().trim().max(2000).optional(),
});

appRouter.post('/', requireAdmin, validateBody(createSchema), async (req, res) => {
  const { versionCode, versionName, apkKey, sha256, sizeBytes, notes } = req.body;

  const existing = await prisma.appRelease.findUnique({ where: { versionCode } });
  if (existing) throw new HttpError(409, 'conflict', 'versionCode already exists');

  const release = await prisma.$transaction(async (tx) => {
    // Only one latest release at a time.
    await tx.appRelease.updateMany({ data: { isLatest: false } });
    return tx.appRelease.create({
      data: { versionCode, versionName, apkKey, sha256, sizeBytes, notes, isLatest: true },
    });
  });

  res.status(201).json(release);
});
