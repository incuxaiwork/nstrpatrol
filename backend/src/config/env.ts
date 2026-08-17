import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16).default('dev-only-change-me-in-production-0000'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev-only-refresh-change-me-00000000'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  STORAGE_DIR: z.string().default('.storage'),
  S3_ENDPOINT: z.string().optional(),
  S3_PORT: z.coerce.number().int().positive().optional(),
  S3_USE_SSL: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  /** Alias for S3_SECRET_KEY — accepted for compatibility with team env files. */
  S3_SECRET: z.string().optional(),
  S3_BUCKET: z.string().optional(),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
