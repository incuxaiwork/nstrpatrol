import 'dotenv/config';
import { prisma } from '../src/db/prisma';

async function main() {
  console.log('Enabling PostGIS extension and creating geom columns...');
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS postgis;');
  await prisma.$executeRawUnsafe('ALTER TABLE "Beat" ADD COLUMN IF NOT EXISTS geom geometry(Geometry,4326);');
  await prisma.$executeRawUnsafe('ALTER TABLE "Compartment" ADD COLUMN IF NOT EXISTS geom geometry(Geometry,4326);');
  await prisma.$executeRawUnsafe('ALTER TABLE "ForestBoundary" ADD COLUMN IF NOT EXISTS geom geometry(Geometry,4326);');
  await prisma.$executeRawUnsafe('ALTER TABLE "ForestGrid" ADD COLUMN IF NOT EXISTS geom geometry(Geometry,4326);');
  await prisma.$executeRawUnsafe('ALTER TABLE "PatrolPoint" ADD COLUMN IF NOT EXISTS geom geometry(Point,4326);');
  await prisma.$executeRawUnsafe('ALTER TABLE "Incident" ADD COLUMN IF NOT EXISTS geom geometry(Point,4326);');
  await prisma.$executeRawUnsafe('ALTER TABLE "PatrolRoute" ADD COLUMN IF NOT EXISTS geom geometry(Geometry,4326);');
  console.log('✔ PostGIS geom columns verified/created successfully!');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('FAILED:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
