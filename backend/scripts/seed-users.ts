import { PrismaClient, Role, Cader } from '@prisma/client';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient();

const DIVISION_PT_MARKAPUR = 'PT_MARKAPUR';

async function main() {
  console.log('Seeding NSTR Patrol org-structured user accounts (no personal data)...');

  const divisionId = DIVISION_PT_MARKAPUR;

  // Devel fixture so the Dornal(a) DyDFO scope has a subordinate record.
  const dornalaSubDivision = await prisma.subDivision.findUnique({ where: { code: 'DORNALA' } });
  const dornalRange = await prisma.range.findUnique({ where: { name: 'DORNAL' } });
  const dornalBeat = await prisma.beat.findFirst({
    where: { rangeName: 'DORNAL' },
    orderBy: { name: 'asc' },
    select: { id: true },
  });
  if (!dornalaSubDivision) {
    console.error('SubDivision DORNALA not found — run `npm run seed:org` first');
    process.exit(1);
  }
  if (!dornalRange) console.warn('⚠ Range DORNAL not found — FBO range assignment skipped');

  // 1. Admin Account (legacy division-wide; keyed to PT MARKAPUR visually)
  const adminPasswordHash = await hashPassword('Admin123!');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@nstrpatrol.gov.in' },
    update: {
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      isAdmin: true,
      cader: Cader.FRO,
      fullName: 'Chief Ranger Admin',
      divisionId,
      phone: null,
      isActive: true,
    },
    create: {
      email: 'admin@nstrpatrol.gov.in',
      passwordHash: adminPasswordHash,
      fullName: 'Chief Ranger Admin',
      role: Role.ADMIN,
      cader: Cader.FRO,
      divisionId,
      isAdmin: true,
      isActive: true,
    },
  });
  console.log('✔ Admin (FRO cadre, legacy division-wide):', admin.email);

  // 2. Field Beat Officer (FBO) — PT MARKAPUR / DORNAL range / DORNAL beat
  const rangerPasswordHash = await hashPassword('Ranger123!');
  const ranger = await prisma.user.upsert({
    where: { email: 'ranger@nstrpatrol.gov.in' },
    update: {
      passwordHash: rangerPasswordHash,
      role: Role.RANGER,
      isAdmin: false,
      cader: Cader.FBO,
      fullName: 'Ali Patrol Ranger',
      divisionId,
      rangeId: dornalRange?.id ?? null,
      beatId: dornalBeat?.id ?? null,
      subDivisionId: dornalaSubDivision.id,
      phone: null,
      isActive: true,
    },
    create: {
      email: 'ranger@nstrpatrol.gov.in',
      passwordHash: rangerPasswordHash,
      fullName: 'Ali Patrol Ranger',
      role: Role.RANGER,
      cader: Cader.FBO,
      divisionId,
      rangeId: dornalRange?.id ?? null,
      beatId: dornalBeat?.id ?? null,
      subDivisionId: dornalaSubDivision.id,
      isAdmin: false,
      isActive: true,
    },
  });
  console.log('✔ FBO (Dornal beat):', ranger.email);

  // 3. Section Officer (FSO) — PT MARKAPUR only; geographic scope NOT FIXED
  const fsoPasswordHash = await hashPassword('Officer123!');
  const fso = await prisma.user.upsert({
    where: { email: 'fso.markapur@nstrpatrol.gov.in' },
    update: {
      passwordHash: fsoPasswordHash,
      role: Role.RANGER,
      isAdmin: false,
      cader: Cader.FSO,
      fullName: 'Section Officer Markapur',
      divisionId,
      phone: null,
      isActive: true,
    },
    create: {
      email: 'fso.markapur@nstrpatrol.gov.in',
      passwordHash: fsoPasswordHash,
      fullName: 'Section Officer Markapur',
      role: Role.RANGER,
      cader: Cader.FSO,
      divisionId,
      isAdmin: false,
      isActive: true,
    },
  });
  console.log('✔ FSO (operational, no fixed boundary):', fso.email);

  // 4. DFO — Division Forest Officer (Admin Web, entire PT Markapur Division)
  const dfoPasswordHash = await hashPassword('Dfo1234!');
  const dfo = await prisma.user.upsert({
    where: { email: 'dfo.markapur@nstrpatrol.gov.in' },
    update: {
      passwordHash: dfoPasswordHash,
      role: Role.ADMIN,
      isAdmin: true,
      cader: Cader.DFO,
      divisionId,
      fullName: 'DFO Markapur Division',
      phone: null,
      isActive: true,
    },
    create: {
      email: 'dfo.markapur@nstrpatrol.gov.in',
      passwordHash: dfoPasswordHash,
      fullName: 'DFO Markapur Division',
      role: Role.ADMIN,
      cader: Cader.DFO,
      divisionId,
      isAdmin: true,
      isActive: true,
    },
  });
  console.log('✔ DFO (division-wide):', dfo.email);

  // 5. DyDFO — Deputy Division Forest Officer (Admin Web, Dornal(a) only)
  const dydfoPasswordHash = await hashPassword('Dydfo123!');
  const dydfo = await prisma.user.upsert({
    where: { email: 'dydfo.dornala@nstrpatrol.gov.in' },
    update: {
      passwordHash: dydfoPasswordHash,
      role: Role.ADMIN,
      isAdmin: true,
      cader: Cader.DyDFO,
      divisionId,
      subDivisionId: dornalaSubDivision.id,
      fullName: 'DyDFO Dornal(a)',
      phone: null,
      isActive: true,
    },
    create: {
      email: 'dydfo.dornala@nstrpatrol.gov.in',
      passwordHash: dydfoPasswordHash,
      fullName: 'DyDFO Dornal(a)',
      role: Role.ADMIN,
      cader: Cader.DyDFO,
      divisionId,
      subDivisionId: dornalaSubDivision.id,
      isAdmin: true,
      isActive: true,
    },
  });
  console.log('✔ DyDFO (Dornal(a) sub-division):', dydfo.email);
}

main()
  .catch((e) => {
    console.error('Error seeding users:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
