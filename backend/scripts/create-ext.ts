import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS postgis;');
  console.log('PostGIS extension created successfully!');
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
