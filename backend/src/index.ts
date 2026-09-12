import { config } from 'dotenv';

config();

export async function bootstrap() {
  const { createApp } = await import('./app');
  const { env } = await import('./config/env');
  const { logger } = await import('./middleware/logger');
  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info(`NSTR Patrol API listening on http://localhost:${env.PORT}`);
  });
  // Background job: auto-complete patrols idle >7 days (no point/SOS/observation)
  // No UI — BE only. Runs hourly, first run 30s after boot.
  try {
    const { startStalePatrolJob } = await import('./jobs/stalePatrols');
    startStalePatrolJob();
  } catch (err: any) {
    logger.warn(`stale-patrol job not started: ${err?.message ?? err}`);
  }
}

void bootstrap();
