/**
 * Seed ÉTAPE 12 (V2) — multi-propriétés & équipe. Idempotent.
 *  - Backfill qrHubSlug pour tous les biens existants
 *  - Backfill membre OWNER (accepté) pour chaque bien
 *  - Comptes démo d'équipe (Sophie = CLEANER, Alex = MANAGER,
 *    Nina = invitation en attente) sur le 1er bien de Marie
 *  - Réservations démo (passé / en cours / futur) par bien
 *
 * Usage : bun run scripts/seed-v2-team.ts
 */
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const db = new PrismaClient();

const DAY = 86_400_000;
const now = Date.now();

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

async function main() {
  console.log('=== SEED ÉTAPE 12 — multi-propriétés & équipe ===');

  // ---------------------------------------------------------
  // 1. Backfill qrHubSlug
  // ---------------------------------------------------------
  const properties = await db.property.findMany({
    orderBy: { createdAt: 'asc' },
    include: { members: true },
  });
  console.log(`→ ${properties.length} bien(s) trouvé(s)`);

  for (const p of properties) {
    if (!p.qrHubSlug) {
      const slug = `${slugify(p.name) || 'bien'}-${Math.random().toString(36).slice(2, 6)}`;
      await db.property.update({ where: { id: p.id }, data: { qrHubSlug: slug } });
      console.log(`  ✓ slug hub généré pour "${p.name}" → ${slug}`);
    }
    if (!p.members.some((m) => m.role === 'OWNER')) {
      await db.propertyMember.create({
        data: { propertyId: p.id, userId: p.ownerId, role: 'OWNER', acceptedAt: new Date() },
      });
      console.log(`  ✓ membre OWNER créé pour "${p.name}"`);
    }
  }

  // ---------------------------------------------------------
  // 2. Comptes démo d'équipe
  // ---------------------------------------------------------
  const teamUsers = [
    { email: 'sophie@qrdomotik.roomscan.pro', fullName: 'Sophie Ménard', role: 'CLEANER' },
    { email: 'alex@qrdomotik.roomscan.pro', fullName: 'Alex Martin', role: 'MANAGER' },
    { email: 'nina@qrdomotik.roomscan.pro', fullName: 'Nina Lopez', role: 'MAINTENANCE' },
  ];
  const createdUsers: Record<string, string> = {};
  for (const u of teamUsers) {
    const existing = await db.user.findUnique({ where: { email: u.email } });
    if (existing) {
      createdUsers[u.email] = existing.id;
      console.log(`✓ compte déjà présent: ${u.email}`);
      continue;
    }
    const passwordHash = await hash('Demo2024!', 12);
    const user = await db.user.create({
      data: { email: u.email, fullName: u.fullName, passwordHash, role: 'user' },
    });
    createdUsers[u.email] = user.id;
    console.log(`✓ compte créé: ${u.email}`);
  }

  // ---------------------------------------------------------
  // 3. Adhésions sur le 1er bien de Marie (démo)
  // ---------------------------------------------------------
  const marie = await db.user.findUnique({
    where: { email: 'demo@qrdomotik.roomscan.pro' },
    select: { id: true },
  });
  const firstOwned = marie
    ? await db.property.findFirst({ where: { ownerId: marie.id }, orderBy: { createdAt: 'asc' } })
    : null;

  if (firstOwned) {
    const memberships: Array<{ email: string; role: string; accepted: boolean }> = [
      { email: 'sophie@qrdomotik.roomscan.pro', role: 'CLEANER', accepted: true },
      { email: 'alex@qrdomotik.roomscan.pro', role: 'MANAGER', accepted: true },
      { email: 'nina@qrdomotik.roomscan.pro', role: 'MAINTENANCE', accepted: false }, // invitation en attente
    ];
    for (const m of memberships) {
      const userId = createdUsers[m.email];
      if (!userId) continue;
      const existing = await db.propertyMember.findUnique({
        where: { propertyId_userId: { propertyId: firstOwned.id, userId } },
      });
      if (existing) {
        console.log(`✓ adhésion déjà présente: ${m.email} (${m.role})`);
        continue;
      }
      await db.propertyMember.create({
        data: {
          propertyId: firstOwned.id,
          userId,
          role: m.role,
          acceptedAt: m.accepted ? new Date() : null,
        },
      });
      console.log(
        `✓ adhésion créée: ${m.email} → ${m.role}${m.accepted ? ' (acceptée)' : ' (invitation en attente)'}`,
      );
    }
  } else {
    console.log('⚠ Aucun bien de Marie trouvé — adhésions démo ignorées.');
  }

  // ---------------------------------------------------------
  // 4. Réservations démo (passé / en cours / futur) par bien
  // ---------------------------------------------------------
  const guests = [
    ['Julien Perrin', 'Camille Robert', 'Thomas Petit'],
    ['Léa Moreau', 'Hugo Dubois', 'Emma Laurent'],
    ['Nathan Girard', 'Chloé Fontaine', 'Maxime Rousseau'],
    ['Sarah Blanc', 'Yanis Médecin', 'Inès Chevalier'],
  ];

  let bookingsCreated = 0;
  for (const [pi, p] of properties.entries()) {
    const count = await db.booking.count({ where: { propertyId: p.id } });
    if (count > 0) {
      console.log(`✓ réservations déjà présentes pour "${p.name}" (${count})`);
      continue;
    }
    const g = guests[pi % guests.length];
    await db.booking.createMany({
      data: [
        {
          propertyId: p.id,
          guestName: g[0],
          checkIn: new Date(now - 20 * DAY),
          checkOut: new Date(now - 13 * DAY),
          guests: 2,
          source: 'AIRBNB',
          status: 'CHECKED_OUT',
          cleaningStatus: 'DONE',
          externalRef: 'HMRXKQ7',
        },
        {
          propertyId: p.id,
          guestName: g[1],
          checkIn: new Date(now - 2 * DAY),
          checkOut: new Date(now + 3 * DAY),
          guests: 3,
          source: 'AIRBNB',
          status: 'CHECKED_IN',
          cleaningStatus: 'DONE',
          externalRef: 'HMQPLW2',
        },
        {
          propertyId: p.id,
          guestName: g[2],
          checkIn: new Date(now + 10 * DAY),
          checkOut: new Date(now + 14 * DAY),
          guests: 2,
          source: 'BOOKING',
          status: 'CONFIRMED',
          cleaningStatus: 'PENDING',
          externalRef: 'BKG-88213',
        },
      ],
    });
    bookingsCreated += 3;
    console.log(`✓ 3 réservations créées pour "${p.name}"`);
  }

  console.log(`\n=== TERMINÉ — ${bookingsCreated} réservation(s) créée(s) ===`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
