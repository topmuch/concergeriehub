/**
 * Seed des comptes démo affichés sur le formulaire de connexion.
 * Usage : bun run scripts/seed-demo-users.ts
 */
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const db = new PrismaClient();

async function main() {
  const accounts = [
    { email: 'admin@qrdomotik.roomscan.pro', fullName: 'Super Admin', password: 'QrDomotik2024!', role: 'superadmin' },
    { email: 'demo@qrdomotik.roomscan.pro', fullName: 'Marie Dupont', password: 'Demo2024!', role: 'user' },
  ];

  for (const acc of accounts) {
    const existing = await db.user.findUnique({ where: { email: acc.email } });
    if (existing) {
      console.log(`✓ déjà présent: ${acc.email}`);
      continue;
    }
    const passwordHash = await hash(acc.password, 12);
    await db.user.create({
      data: {
        email: acc.email,
        fullName: acc.fullName,
        passwordHash,
        role: acc.role,
        selectedPlan: acc.role === 'superadmin' ? null : 'airbnb_solo',
        onboardingCompleted: acc.role === 'superadmin',
      },
    });
    console.log(`✓ créé: ${acc.email} (${acc.role})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
