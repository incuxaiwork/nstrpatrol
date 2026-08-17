import { Client as MinioClient } from 'minio';
import { env } from '../config/env';

/** Host or full URL endpoint → host + SSL flag (accepts either style). */
function endpointInfo(): { host: string; ssl: boolean } {
  const raw = env.S3_ENDPOINT ?? '';
  const m = raw.match(/^([a-z][a-z0-9+.-]*):\/\/(.+)$/i);
  if (m) {
    return { host: m[2], ssl: m[1].toLowerCase() === 'https' };
  }
  return { host: raw, ssl: env.S3_USE_SSL ? env.S3_USE_SSL.toLowerCase() !== 'false' : false };
}

const s3Secret = env.S3_SECRET_KEY ?? env.S3_SECRET;

export function s3Configured(): boolean {
  return Boolean(env.S3_ENDPOINT && env.S3_ACCESS_KEY && s3Secret && env.S3_BUCKET);
}

export function s3Client(): MinioClient {
  if (!s3Configured()) throw new Error('S3 storage not configured');
  const { host, ssl } = endpointInfo();
  return new MinioClient({
    endPoint: host,
    port: env.S3_PORT ?? (ssl || (env.S3_USE_SSL ? env.S3_USE_SSL.toLowerCase() !== 'false' : false) ? 443 : 80),
    useSSL: ssl || (env.S3_USE_SSL ? env.S3_USE_SSL.toLowerCase() !== 'false' : false),
    accessKey: env.S3_ACCESS_KEY!,
    secretKey: s3Secret!,
  });
}

export function s3Bucket(): string {
  return env.S3_BUCKET!;
}