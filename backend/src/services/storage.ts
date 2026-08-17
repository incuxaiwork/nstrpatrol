import { createHash, randomBytes } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { env } from '../config/env';
import { HttpError } from '../middleware/error';
import { s3Client, s3Bucket, s3Configured } from './s3';

const ROOT = path.resolve(process.cwd(), env.STORAGE_DIR);

const KEY_PATTERN = /^[0-9]{8}\/[a-f0-9]{16}\.[a-z0-9]{1,8}$/i;

function keyFor(ext: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = randomBytes(8).toString('hex');
  const safeExt = (ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  return `${date}/${rand}.${safeExt}`;
}

function absPath(key: string): string {
  if (!KEY_PATTERN.test(key)) throw new HttpError(400, 'invalid_key', 'Invalid storage key');
  return path.join(ROOT, key);
}

export interface StoredFile {
  key: string;
  size: number;
  sha256: string;
}

export async function storeBuffer(buffer: Buffer, ext: string): Promise<StoredFile> {
  const key = keyFor(ext);
  if (s3Configured()) {
    await s3Client().putObject(s3Bucket(), key, buffer, buffer.length);
  } else {
    const filePath = absPath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
  }
  return { key, size: buffer.length, sha256: sha256Of(buffer) };
}

export async function readStored(key: string): Promise<Buffer | null> {
  try {
    if (s3Configured()) {
      const stream = await s3Client().getObject(s3Bucket(), key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    }
    return await readFile(absPath(key));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    const code = (err as { code?: string }).code;
    if (code === 'NoSuchKey' || code === 'NotFound') return null;
    throw err;
  }
}

export async function deleteStored(key: string): Promise<boolean> {
  try {
    if (s3Configured()) {
      await s3Client().removeObject(s3Bucket(), key);
      return true;
    }
    await unlink(absPath(key));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    const code = (err as { code?: string }).code;
    if (code === 'NoSuchKey' || code === 'NotFound') return false;
    throw err;
  }
}

export function sha256Of(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
