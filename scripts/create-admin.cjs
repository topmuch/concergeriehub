// =============================================================
// ORDOMOTIK - Seed: create/update admin & demo users
// Schema tables are created by sqlite3 CLI in Dockerfile CMD
// This script ONLY handles user seeding
// =============================================================

const { hash } = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seedUsers() {
  // Super Admin
  const adminHash = await hash('QrDomotik2024!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@qrdomotik.roomscan.pro' },
    update: { passwordHash: adminHash, fullName: 'Administrateur ORDOMOTIK', role: 'superadmin' },
    create: {
      email: 'admin@qrdomotik.roomscan.pro',
      fullName: 'Administrateur ORDOMOTIK',
      passwordHash: adminHash,
      role: 'superadmin',
    },
  });
  console.log('[seed] Super Admin OK:', admin.email);

  const adminHomeCount = await prisma.home.count({ where: { ownerId: admin.id } });
  if (adminHomeCount === 0) {
    await prisma.home.create({ data: { name: 'ORDOMOTIK HQ', ownerId: admin.id, address: 'Siege Social' } });
    console.log('[seed] Home ORDOMOTIK HQ created');
  }

  // Demo Client
  const demoHash = await hash('demo123', 12);
  const demo = await prisma.user.upsert({
    where: { email: 'demo@qrdomotik.roomscan.pro' },
    update: { passwordHash: demoHash, fullName: 'Utilisateur Demo', role: 'user' },
    create: {
      email: 'demo@qrdomotik.roomscan.pro',
      fullName: 'Utilisateur Demo',
      passwordHash: demoHash,
      role: 'user',
    },
  });
  console.log('[seed] Demo Client OK:', demo.email);

  const demoHomeCount = await prisma.home.count({ where: { ownerId: demo.id } });
  if (demoHomeCount === 0) {
    await prisma.home.create({ data: { name: 'Ma Maison Demo', ownerId: demo.id, address: '' } });
    console.log('[seed] Home Ma Maison Demo created');
  }
}

async function main() {
  try {
    await seedUsers();
    console.log('[seed] Done.');
  } catch (err) {
    console.error('[seed] Fatal error:', err.message);
    console.error(err.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();