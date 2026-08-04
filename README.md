# NSTR Patrol

Offline-first GIS tracking platform for forest patrol operations. Rangers collect location, sensor, and incident data in the field (even fully offline); the backend handles synchronization and analytics; the web portal provides monitoring and management.

Full system specification: [`docs/architecture.md`](docs/architecture.md)

## Repository layout

Single git repo with three independently developed, built, and deployed applications:

| Path       | Project          | Toolchain                          |
| ---------- | ---------------- | ---------------------------------- |
| `mobile/`  | Android app      | Kotlin + Jetpack Compose (Gradle)  |
| `backend/` | REST API         | Express + TypeScript + Prisma      |
| `web/`     | Admin portal     | Next.js + TypeScript + Tailwind    |

There is **no shared toolchain or build orchestration** between the apps. Each lives in its own folder, defines its own API contract, and runs/bulds/deploys independently. See each app's `README.md` for details.

## Docs & design

- [`docs/architecture.md`](docs/architecture.md) — system architecture, data model, patrol lifecycle
- [`docs/ui_screen_plan.md`](docs/ui_screen_plan.md) — UI screen plan
- [`design/export/`](design/export/) — exported screen and overlay SVG assets

## Development databases (backend only)

Docker Compose is used **only** for backend infrastructure in dev (PostgreSQL + PostGIS, Redis, MinIO):

```bash
docker compose -f deploy/docker-compose.yml up -d
```

Apps themselves run manually; there are no app containers.

## CI

Three independent GitHub Actions workflows — one per app:

- `.github/workflows/mobile.yml` — Android build + APK artifact
- `.github/workflows/backend.yml` — lint, test, build
- `.github/workflows/web.yml` — lint, build
