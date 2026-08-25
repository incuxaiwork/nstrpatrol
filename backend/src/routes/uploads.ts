import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { deleteStored, readStored, storeBuffer } from '../services/storage';

export const uploadsRouter = Router();

// Express 5 named wildcards capture as string[]; join back into the raw key.
function keyFromParams(params: Record<string, unknown>): string {
  const p = params?.key;
  const joined = Array.isArray(p) ? p.join('/') : p;
  return String(joined ?? '').replace(/^\/+/, '');
}

// Public image getter (allows loading photos directly by S3 key)
uploadsRouter.get('/*key', async (req, res, next) => {
  try {
    const rawKey = keyFromParams(req.params);
    if (!rawKey) throw new HttpError(400, 'invalid_key', 'File key required');
    const data = await readStored(rawKey);
    if (!data) throw new HttpError(404, 'not_found', 'File not found');
    res.setHeader('Content-Type', guessContentType(rawKey));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(data);
  } catch (e) {
    next(e);
  }
});

uploadsRouter.use(requireAuth);

// APK releases are ~150 MB; keep generous headroom so release uploads pass.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 256 * 1024 * 1024 } });

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

uploadsRouter.delete('/*key', async (req, res, next) => {
  try {
    const rawKey = keyFromParams(req.params);
    const removed = await deleteStored(rawKey);
    if (!removed) throw new HttpError(404, 'not_found', 'File not found');
    res.status(204).end();
  } catch (e) {
    next(e);
  }
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
    default:
      return 'application/octet-stream';
  }
}
