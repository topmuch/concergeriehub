/**
 * Seed ÉTAPE 13 (V2) — Automatisations & Notifications. Idempotent.
 *  - Déploie le catalogue de règles (7) sur chaque bien (createMany
 *    skipDuplicates via la même logique que ensureDefaultRules)
 *  - Génère un jeu de notifications démo pour Marie (propriétaire)
 *    et Sophie (ménage) si elles n'en ont aucune de type hôte
 *  - Crée une réservation "arrive aujourd'hui" pour démontrer le
 *    rappel CHECK_IN_TODAY (si aucun séjour n'arrive déjà ce jour)
 *
 * Usage : bun run scripts/seed-v2-automations.ts
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const now = Date.now();
const DAY = 86_400_000;

const HOST_TYPES = [
  'host_booking',
  'host_cleaning',
  'host_checkin',
  'host_checkout',
  'host_maintenance',
  'host_team',
];

/** Catalogue miroir de src/lib/automations.ts (script autonome). */
const CATALOG = [
  { key: 'booking_created_team', trigger: 'BOOKING_CREATED', action: 'NOTIFY_OWNERS' },
  { key: 'booking_created_cleaning', trigger: 'BOOKING_CREATED', action: 'NOTIFY_CLEANERS' },
  { key: 'cleaning_done_owner', trigger: 'CLEANING_DONE', action: 'NOTIFY_OWNERS' },
  { key: 'checkin_today_reminder', trigger: 'CHECK_IN_TODAY', action: 'NOTIFY_TEAM' },
  { key: 'checkout_today_reminder', trigger: 'CHECK_OUT_TODAY', action: 'NOTIFY_TEAM' },
  { key: 'maintenance_alert', trigger: 'MAINTENANCE_REQUESTED', action: 'NOTIFY_MAINTENANCE' },
  { key: 'member_accepted_owner', trigger: 'MEMBER_ACCEPTED', action: 'NOTIFY_OWNERS' },
];

function dayBounds(offsetDays = 0) {
  const start = new Date();
  start.setDate(start.getDate() + offsetDays);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

async function main() {
  console.log('=== SEED ÉTAPE 13 — Automatisations & Notifications ===');

  // ---------------------------------------------------------
  // 1. Déployer le catalogue de règles sur tous les biens
  // ---------------------------------------------------------
  const properties = await db.property.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, ownerId: true },
  });
  console.log(`→ ${properties.length} bien(s) trouvé(s)`);

  for (const p of properties) {
    // ⚠️ SQLite : pas de createMany skipDuplicates — filtrage préalable
    const existing = await db.automationRule.findMany({
      where: { propertyId: p.id },
      select: { key: true },
    });
    const have = new Set(existing.map((r) => r.key));
    const missing = CATALOG.filter((c) => !have.has(c.key));
    if (missing.length > 0) {
      await db.automationRule.createMany({
        data: missing.map((c) => ({
          propertyId: p.id,
          key: c.key,
          trigger: c.trigger,
          action: c.action,
          isActive: true,
        })),
      });
    }
    console.log(
      `  ✓ "${p.name}" : ${missing.length} règle(s) créée(s)${
        missing.length === 0 ? ' (catalogue déjà en place)' : ''
      }`,
    );
  }

  // ---------------------------------------------------------
  // 2. Rappel "arrivée aujourd'hui" démontrable : garantir au
  //    moins un séjour dont checkIn = aujourd'hui sur le 1er bien
  // ---------------------------------------------------------
  const first = properties[0];
  if (first) {
    const { start, end } = dayBounds(0);
    const arrivingToday = await db.booking.count({
      where: { propertyId: first.id, checkIn: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
    });
    if (arrivingToday === 0) {
      const out = new Date(start.getTime() + 3 * DAY);
      await db.booking.create({
        data: {
          propertyId: first.id,
          guestName: 'Julien Rivière',
          guestEmail: 'julien.riviere@example.com',
          checkIn: start,
          checkOut: out,
          guests: 2,
          source: 'AIRBNB',
          status: 'CONFIRMED',
          cleaningStatus: 'PENDING',
          externalRef: 'HMSEED13',
          notes: 'Seed ÉTAPE 13 — arrivée du jour (démo rappel)',
        },
      });
      console.log(`  ✓ séjour "arrive aujourd'hui" créé sur "${first.name}" (Julien Rivière)`);
    } else {
      console.log(`  ✓ "${first.name}" a déjà ${arrivingToday} séjour(s) arrivant aujourd'hui`);
    }

    // ---------------------------------------------------------
    // 3. Notifications démo pour Marie + Sophie (si vide)
    // ---------------------------------------------------------
    const marieId = first.ownerId;
    const existingMarie = await db.notification.count({
      where: { userId: marieId, type: { in: HOST_TYPES } },
    });
    if (existingMarie === 0) {
      const propertyName = first.name;
      const base = { dataJson: JSON.stringify({ propertyId: first.id, propertyName, url: '/airbnb/dashboard' }) };
      await db.notification.createMany({
        data: [
          {
            userId: marieId,
            type: 'host_booking',
            title: '📅 Nouvelle réservation',
            body: `${propertyName} : séjour de Camille Fabre du ${new Date(now + 10 * DAY).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} au ${new Date(now + 14 * DAY).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}.`,
            ...base,
          },
          {
            userId: marieId,
            type: 'host_cleaning',
            title: '✨ Ménage terminé',
            body: `${propertyName} : le ménage après le séjour de Léa Dubois est terminé.`,
            ...base,
          },
          {
            userId: marieId,
            type: 'host_maintenance',
            title: '🔧 Réclamation technique',
            body: `${propertyName} : le radiateur de la chambre ne chauffe plus (urgence : urgent).`,
            ...base,
          },
          {
            userId: marieId,
            type: 'host_team',
            title: '👥 Équipe',
            body: `Alex Martin a rejoint l’équipe de ${propertyName} en tant que Gestionnaire.`,
            ...base,
          },
        ],
      });
      console.log('  ✓ 4 notifications démo créées pour Marie');
    } else {
      console.log(`  ✓ Marie a déjà ${existingMarie} notification(s) hôte`);
    }

    const sophie = await db.user.findUnique({
      where: { email: 'sophie@qrdomotik.roomscan.pro' },
      select: { id: true },
    });
    if (sophie) {
      const existingSophie = await db.notification.count({
        where: { userId: sophie.id, type: { in: HOST_TYPES } },
      });
      if (existingSophie === 0) {
        await db.notification.create({
          data: {
            userId: sophie.id,
            type: 'host_cleaning',
            title: '🧹 Ménage à planifier',
            body: `${first.name} : nouveau séjour de Camille Fabre — ménage à prévoir après le départ.`,
            dataJson: JSON.stringify({ propertyId: first.id, propertyName: first.name, url: '/airbnb/dashboard' }),
          },
        });
        console.log('  ✓ 1 notification démo créée pour Sophie');
      } else {
        console.log(`  ✓ Sophie a déjà ${existingSophie} notification(s) hôte`);
      }
    }
  }

  const ruleCount = await db.automationRule.count();
  console.log(`\n=== OK — ${ruleCount} règle(s) d'automatisation en base ===`);
}

main()
  .catch((e) => {
    console.error('Seed ÉTAPE 13 failed:', e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
