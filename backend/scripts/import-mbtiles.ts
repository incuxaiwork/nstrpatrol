require('dotenv').config();
const { createHash } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const KEY = 'NSTR.mbtiles';

async function main() {
  const file = resolve(process.argv[2] || '../mobile/app/src/main/assets/NSTR.mbtiles');
  const data = await readFile(file);
  const sha256 = createHash('sha256').update(data).digest('hex');
  const existing = await prisma.mapAsset.findUnique({ where: { resourceKey: KEY } });
  const version = existing && existing.sha256 !== sha256 ? existing.version + 1 : existing?.version ?? 1;
  await prisma.mapAsset.upsert({
    where: { resourceKey: KEY },
    create: { resourceKey: KEY, contentType: 'application/octet-stream', storagePath: null, sizeBytes: data.length, sha256, version, data },
    update: { contentType: 'application/octet-stream', storagePath: null, sizeBytes: data.length, sha256, version, data },
  });
  console.log('MapAsset upserted:', KEY, data.length, 'bytes, version', version);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error('FAILED:', e.message); await prisma.$disconnect(); process.exit(1); });