import { PrismaClient, Role, Cader } from '@prisma/client';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding NSTR Patrol Admin and Field Ranger User accounts...');

  // 1. Admin Account
  const adminPasswordHash = await hashPassword('Admin123!');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@nstrpatrol.gov.in' },
    update: {
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      isAdmin: true,
      cader: Cader.FRO,
      fullName: 'Chief Ranger Admin',
      isActive: true,
    },
    create: {
      email: 'admin@nstrpatrol.gov.in',
      passwordHash: adminPasswordHash,
      fullName: 'Chief Ranger Admin',
      role: Role.ADMIN,
      cader: Cader.FRO,
      phone: '+91 9876543210',
      isAdmin: true,
      isActive: true,
    },
  });
  console.log('✔ Admin account ready:', admin.email);

  // 2. Field Ranger User Account (Ali)
  const rangerPasswordHash = await hashPassword('Ranger123!');
  const ranger = await prisma.user.upsert({
    where: { email: 'ranger@nstrpatrol.gov.in' },
    update: {
      passwordHash: rangerPasswordHash,
      role: Role.RANGER,
      isAdmin: false,
      cader: Cader.FBO,
      fullName: 'Ali Patrol Ranger',
      isActive: true,
    },
    create: {
      email: 'ranger@nstrpatrol.gov.in',
      passwordHash: rangerPasswordHash,
      fullName: 'Ali Patrol Ranger',
      role: Role.RANGER,
      cader: Cader.FBO,
      phone: '+91 9876543211',
      isAdmin: false,
      isActive: true,
    },
  });
  console.log('✔ Ranger User account ready:', ranger.email);

  // 3. Section Officer User Account
  const fsoPasswordHash = await hashPassword('Officer123!');
  const fso = await prisma.user.upsert({
    where: { email: 'fso.markapur@nstrpatrol.gov.in' },
    update: {
      passwordHash: fsoPasswordHash,
      role: Role.RANGER,
      isAdmin: false,
      cader: Cader.FSO,
      fullName: 'Section Officer Markapur',
      isActive: true,
    },
    create: {
      email: 'fso.markapur@nstrpatrol.gov.in',
      passwordHash: fsoPasswordHash,
      fullName: 'Section Officer Markapur',
      role: Role.RANGER,
      cader: Cader.FSO,
      phone: '+91 9876543212',
      isAdmin: false,
      isActive: true,
    },
  });
  console.log('✔ Section Officer account ready:', fso.email);
}

main()
  .catch((e) => {
    console.error('Error seeding users:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
