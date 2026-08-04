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
}

void bootstrap();
