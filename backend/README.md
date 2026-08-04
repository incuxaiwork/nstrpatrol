# NSTR Patrol — Backend

Express + TypeScript API for the NSTR Patrol offline-first GIS tracking platform. Uses Prisma ORM against PostgreSQL with PostGIS.

## Requirements

- Node.js 24+
- PostgreSQL with PostGIS (dev databases via `../deploy/docker-compose.yml`)

## Getting started

```bash
# 1. Start dev databases (postgres+postgis, redis, minio)
docker compose -f ../deploy/docker-compose.yml up -d

# 2. Configure environment
cp .env.example .env

# 3. Install, migrate, and run
npm install
npx prisma migrate deploy
npm run start:dev
```

Server listens on `http://localhost:3000` (configurable via `PORT`).

## Scripts

| Command               | Description                          |
| --------------------- | ------------------------------------ |
| `npm run dev`         | Type-check in watch mode             |
| `npm run start:dev`   | Run with `tsx watch`                 |
| `npm run build`       | Compile to `dist/`                   |
| `npm run start`       | Run compiled `dist/index.js`         |
| `npm run lint`        | ESLint                               |
| `npm test`            | Jest unit/integration tests          |
| `npm run prisma:*`    | Prisma generate/migrate/studio tools |

## Environment variables

See `.env.example`. Required: `DATABASE_URL`. Optional: `PORT` (default 3000), `NODE_ENV`.

## API

- `GET /api` — service info
- `GET /api/health` — liveness + database connectivity

(More endpoints land as features ship.)
