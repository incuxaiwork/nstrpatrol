import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateParams } from '../middleware/validate';
import { HttpError } from '../middleware/error';
import { param } from '../lib/http';
import { deleteStored, readStored, storeBuffer } from '../services/storage';

export const uploadsRouter = Router();

uploadsRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

uploadsRouter.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'validation_error', 'file field is required');
  const original = req.file.originalname || '';
  const ext = original.includes('.') ? original.split('.').pop()!.slice(0, 12) : 'bin';
  const stored = await storeBuffer(req.file.buffer, ext);
  res.status(201).json({
    key: stored.key,
    size: stored.size,
    sha256: stored.sha256,
    contentType: req.file.mimetype || 'application/octet-stream',
  });
});

const keySchema = z.object({ key: z.string().regex(/^[0-9]{8}\/[a-f0-9]{16}\.[a-z0-9]{1,12}$/i) });

uploadsRouter.get('/:key', validateParams(keySchema), async (req, res) => {
  const key = param(req, 'key');
  const data = await readStored(key);
  if (!data) throw new HttpError(404, 'not_found', 'File not found');
  res.setHeader('Content-Type', guessContentType(key));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(data);
});

uploadsRouter.delete('/:key', requireAuth, validateParams(keySchema), async (req, res) => {
  const key = param(req, 'key');
  const removed = await deleteStored(key);
  if (!removed) throw new HttpError(404, 'not_found', 'File not found');
  res.status(204).end();
});

function guessContentType(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'mp4':
      return 'video/mp4';
    default:
      return 'application/octet-stream';
  }
}
