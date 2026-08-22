import { createHash, randomBytes } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { HttpError } from '../middleware/error';

const KEY_PATTERN = /^[0-9]{8}\/[a-f0-9]{16}\.[a-z0-9]{1,12}$/i;

function keyFor(ext: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = randomBytes(8).toString('hex');
  const safeExt = (ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  return `${date}/${rand}.${safeExt}`;
}

function assertKey(key: string): void {
  if (!KEY_PATTERN.test(key)) throw new HttpError(400, 'invalid_key', 'Invalid storage key');
}

const bucket = env.S3_BUCKET;
const useS3 = Boolean(bucket);
const ROOT = path.resolve(process.cwd(), env.STORAGE_DIR);

const s3AccessKeyId = env.S3_ACCESS_KEY_ID ?? env.S3_ACCESS_KEY;
const s3SecretAccessKey = env.S3_SECRET_ACCESS_KEY ?? env.S3_SECRET;
const s3ForcePathStyle = env.S3_FORCE_PATH_STYLE ? env.S3_FORCE_PATH_STYLE === 'true' : Boolean(env.S3_ENDPOINT);

let s3Client: S3Client | null = null;
function getS3(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: s3ForcePathStyle,
      credentials: s3AccessKeyId && s3SecretAccessKey ? { accessKeyId: s3AccessKeyId, secretAccessKey: s3SecretAccessKey } : undefined,
    });
  }
  return s3Client;
}

function isNotFound(err: unknown): boolean {
  return err instanceof S3ServiceException && (err.name === 'NoSuchKey' || err.$metadata.httpStatusCode === 404);
}

export interface StoredFile {
  key: string;
  size: number;
  sha256: string;
}

export async function storeBuffer(buffer: Buffer, ext: string): Promise<StoredFile> {
  const key = keyFor(ext);
  if (useS3 && bucket) {
    await getS3().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer }));
  } else {
    const filePath = path.join(ROOT, key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
  }
  return { key, size: buffer.length, sha256: sha256Of(buffer) };
}

export async function readStored(key: string): Promise<Buffer | null> {
  assertKey(key);
  if (useS3 && bucket) {
    try {
      const res = await getS3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!res.Body) return null;
      const bytes = await res.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }
  try {
    return await readFile(path.join(ROOT, key));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function deleteStored(key: string): Promise<boolean> {
  assertKey(key);
  if (useS3 && bucket) {
    try {
      await getS3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }
  try {
    await unlink(path.join(ROOT, key));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

export function sha256Of(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
