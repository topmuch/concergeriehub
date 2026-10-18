// =============================================================
// ÉTAPE 17.1 (V3) — Seed démo "Moteur de transaction" (idempotent)
// Crée des ServiceOrders de démo sur le Loft Canal Saint-Martin
// couvrant le cycle de vie OrderStatus :
//   PENDING (Morning Box du matin) → CONFIRMED (sommelier)
//   → PREPARING (chef, ce soir) → DELIVERED (transfert à l'arrivée)
// Séparation financière : totalAmount = commission + hostEarning.
// Réexécutable sans dupliquer (clé naturelle property+provider+guest).
// =============================================================
import { db } from '@/lib/db';

const SLUG = process.env.SEED_SLUG ?? process.argv[2] ?? 'loft-canal-saint-martin-11wz'; // FIX-9 : paramétrable (SEED_SLUG=... ou arg), défaut démo
const DAY = 24 * 60 * 60 * 1000;

interface DemoOrder {
  providerName: string;
  guestName: string;
  guestEmail: string;
  useCurrentStay: boolean;
  items: { name: string; qty: number; unitPrice: number }[];
  commissionRate: number;
  status: string;
  deliveryOffsetMs: number; // par rapport à maintenant (peut être négatif)
  deliveryHour?: { h: number; m: number };
}

const DEMO_ORDERS: DemoOrder[] = [
  {
    providerName: 'Morning Box Paris',
    guestName: 'Camille Laurent',
    guestEmail: 'camille.laurent@example.com',
    useCurrentStay: true,
    items: [{ name: 'Morning Box M (2 pers.)', qty: 2, unitPrice: 18 }],
    commissionRate: 0.15,
    status: 'PENDING',
    deliveryOffsetMs: DAY,
    deliveryHour: { h: 8, m: 30 },
  },
  {
    providerName: 'Sommelier à Domicile',
    guestName: 'Camille Laurent',
    guestEmail: 'camille.laurent@example.com',
    useCurrentStay: true,
    items: [{ name: 'Dégustation grands crus (3 vins)', qty: 2, unitPrice: 65 }],
    commissionRate: 0.1,
    status: 'CONFIRMED',
    deliveryOffsetMs: 2 * DAY,
    deliveryHour: { h: 19, m: 0 },
  },
  {
    providerName: 'Chef Antoine — Dîner Privé',
    guestName: 'Camille Laurent',
    guestEmail: 'camille.laurent@example.com',
    useCurrentStay: true,
    items: [{ name: 'Menu Dégustation 5 services', qty: 2, unitPrice: 85 }],
    commissionRate: 0.1,
    status: 'PREPARING',
    deliveryOffsetMs: 0,
    deliveryHour: { h: 20, m: 0 },
  },
  {
    providerName: 'Paris Transfer Premium',
    guestName: 'Camille Laurent',
    guestEmail: 'camille.laurent@example.com',
    useCurrentStay: true,
    items: [{ name: 'Transfert Gare de Lyon → Loft (berline)', qty: 1, unitPrice: 45 }],
    commissionRate: 0.12,
    status: 'DELIVERED',
    deliveryOffsetMs: -1 * DAY, // livré hier (jour d'arrivée)
    deliveryHour: { h: 15, m: 0 },
  },
];

function atHour(base: Date, offsetMs: number, hour?: { h: number; m: number }): Date {
  const d = new Date(base.getTime() + offsetMs);
  if (hour) d.setHours(hour.h, hour.m, 0, 0);
  return d;
}

async function main() {
  console.log('🚀 Seed V3.1 — ServiceOrders (moteur de transaction)');

  const property = await db.property.findUnique({ where: { qrHubSlug: SLUG } });
  if (!property) throw new Error(`Bien ${SLUG} introuvable — lance d'abord scripts/seed-v3-guest-app.ts`);
  console.log(`🏠 Bien : ${property.name}`);

  const stay = await db.booking.findFirst({
    where: { propertyId: property.id, status: 'CHECKED_IN' },
    orderBy: { checkIn: 'desc' },
  });
  if (!stay) throw new Error('Aucun séjour CHECKED_IN sur le bien — lance seed-v3-guest-app.ts');
  console.log(`🛌 Séjour en cours : ${stay.guestName} (${stay.id})`);

  const now = new Date();
  let created = 0;
  let skipped = 0;

  for (const demo of DEMO_ORDERS) {
    const provider = await db.provider.findFirst({
      where: { businessName: demo.providerName, isActive: true },
    });
    if (!provider) {
      console.log(`⚠️  Prestataire "${demo.providerName}" introuvable — commande ignorée`);
      continue;
    }

    // Idempotence : clé naturelle (bien + prestataire + invité)
    const existing = await db.serviceOrder.findFirst({
      where: { propertyId: property.id, providerId: provider.id, guestName: demo.guestName },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const total = demo.items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0);
    const commission = Math.round(total * demo.commissionRate * 100) / 100;
    const hostEarning = Math.round((total - commission) * 100) / 100;

    await db.serviceOrder.create({
      data: {
        bookingId: demo.useCurrentStay ? stay.id : null,
        propertyId: property.id,
        providerId: provider.id,
        guestName: demo.guestName,
        guestEmail: demo.guestEmail,
        items: demo.items,
        totalAmount: total,
        commission,
        hostEarning,
        status: demo.status,
        deliveryDate: atHour(now, demo.deliveryOffsetMs, demo.deliveryHour),
      },
    });
    created++;
    console.log(
      `✅ [${demo.status}] ${demo.providerName} — ${demo.guestName} — ${total.toFixed(2)}€ ` +
        `(Hub ${commission.toFixed(2)}€ / Hôte ${hostEarning.toFixed(2)}€)`,
    );
  }

  const counts = await db.serviceOrder.groupBy({ by: ['status'], _count: { status: true } });
  console.log(
    `📊 ServiceOrders par statut : ${counts.map((c) => `${c.status}=${c._count.status}`).join(' · ')}`,
  );
  console.log(`✅ Seed V3.1 terminé — ${created} créée(s), ${skipped} déjà présente(s)`);
}

main()
  .catch((e) => {
    console.error('❌ Seed échoué :', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
