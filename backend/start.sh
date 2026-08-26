#!/bin/sh
set -e

echo "=== NSTR Patrol DB Setup ==="

# Resolve the failed face_verified migration
echo "Resolving failed migration 20260820140000_face_verified..."
psql "$DATABASE_URL" -c "DELETE FROM _prisma_migrations WHERE migration_name = '20260820140000_face_verified' AND rolled_back_at IS NULL;" 2>/dev/null || true

# Run Prisma migrations
echo "Running prisma migrate deploy..."
npx prisma migrate deploy

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Start the server
echo "Starting server..."
exec node dist/index.js
