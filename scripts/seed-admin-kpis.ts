// =============================================================
// Seed KPIs Superadmin — Conciergerie Hub (Dashboard V2)
// Génère un historique réaliste de commandes de service sur 30 jours
// pour peupler les KPIs et graphiques du dashboard Superadmin :
//  - 29 commandes (24 payées, 2 remboursées, 3 impayées) + 4 préexistantes
//  - réparties sur les biens + prestataires GUEST_EXPERIENCE existants
//  - commission plateforme 15 % (invariant total = commission + hôte)
//  - 1 Transaction par commande payée (statut 'completed'/'refunded',
//    platformFee = commission — mêmes conventions que payments-server)
//
// Déterministe : recettes figées (pas de random) → graphiques stables.
// Idempotent : s'arrête si des commandes '@kpis.local' existent déjà.
// Run : bun run scripts/seed-admin-kpis.ts
// =============================================================
import { db } from '../src/lib/db';

const MARKER_DOMAIN = '@kpis.local';
const COMMISSION_RATE = 0.15;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Recettes figées : dayOffset (0 = aujourd'hui), offre (index des offres
// du provider choisi), quantité, statut de paiement / cycle de vie.
interface Receipt {
  day: number;
  hour: number;
  providerOffset: number;
  offerOffset: number;
  qty: number;
  payment: 'PAID' | 'REFUNDED' | 'UNPAID';
  status: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'DELIVERED';
}

const RECEIPTS: Receipt[] = [
  // --- Semaine -4 (J-29 → J-22) : démarrage, volumes modérés ---
  { day: 29, hour: 9, providerOffset: 0, offerOffset: 0, qty: 1, payment: 'PAID', status: 'DELIVERED' },
  { day: 28, hour: 10, providerOffset: 1, offerOffset: 0, qty: 1, payment: 'PAID', status: 'DELIVERED' },
  { day: 26, hour: 8, providerOffset: 0, offerOffset: 1, qty: 2, payment: 'PAID', status: 'DELIVERED' },
  { day: 25, hour: 18, providerOffset: 2, offerOffset: 0, qty: 1, payment: 'PAID', status: 'DELIVERED' },
  { day: 23, hour: 9, providerOffset: 1, offerOffset: 1, qty: 1, payment: 'PAID', status: 'DELIVERED' },
  { day: 22, hour: 11, providerOffset: 0, offerOffset: 0, qty: 3, payment: 'PAID', status: 'DELIVERED' },
  // --- Semaine -3 (J-21 → J-15) : montée en charge ---
  { day: 21, hour: 8, providerOffset: 2, offerOffset: 1, qty: 2, payment: 'PAID', status: 'DELIVERED' },
  { day: 20, hour: 9, providerOffset: 0, offerOffset: 2, qty: 1, payment: 'PAID', status: 'DELIVERED' },
  { day: 19, hour: 10, providerOffset: 1, offerOffset: 0, qty: 2, payment: 'REFUNDED', status: 'DELIVERED' },
  { day: 18, hour: 8, providerOffset: 0, offerOffset: 1, qty: 1, payment: 'PAID', status: 'DELIVERED' },
  { day: 17, hour: 19, providerOffset: 2, offerOffset: 0, qty: 2, payment: 'PAID', status: 'DELIVERED' },
  { day: 16, hour: 9, providerOffset: 1, offerOffset: 1, qty: 3, payment: 'PAID', status: 'DELIVERED' },
  { day: 15, hour: 10, providerOffset: 0, offerOffset: 0, qty: 2, payment: 'PAID', status: 'DELIVERED' },
  // --- Semaine -2 (J-14 → J-8) : pic ---
  { day: 14, hour: 8, providerOffset: 2, offerOffset: 2, qty: 1, payment: 'PAID', status: 'DELIVERED' },
  { day: 13, hour: 9, providerOffset: 0, offerOffset: 2, qty: 2, payment: 'PAID', status: 'DELIVERED' },
  { day: 12, hour: 11, providerOffset: 1, offerOffset: 0, qty: 1, payment: 'PAID', status: 'DELIVERED' },
  { day: 11, hour: 8, providerOffset: 0, offerOffset: 0, qty: 4, payment: 'PAID', status: 'DELIVERED' },
  { day: 10, hour: 18, providerOffset: 2, offerOffset: 1, qty: 2, payment: 'PAID', status: 'DELIVERED' },
  { day: 9, hour: 9, providerOffset: 1, offerOffset: 1, qty: 1, payment: 'REFUNDED', status: 'DELIVERED' },
  { day: 8, hour: 10, providerOffset: 0, offerOffset: 1, qty: 2, payment: 'PAID', status: 'DELIVERED' },
  // --- Semaine -1 (J-7 → J-1) : cadence soutenue ---
  { day: 7, hour: 8, providerOffset: 0, offerOffset: 0, qty: 2, payment: 'PAID', status: 'DELIVERED' },
  { day: 6, hour: 10, providerOffset: 2, offerOffset: 0, qty: 1, payment: 'PAID', status: 'DELIVERED' },
  { day: 5, hour: 9, providerOffset: 1, offerOffset: 2, qty: 2, payment: 'PAID', status: 'DELIVERED' },
  { day: 4, hour: 8, providerOffset: 0, offerOffset: 2, qty: 3, payment: 'PAID', status: 'DELIVERED' },
  { day: 3, hour: 11, providerOffset: 2, offerOffset: 1, qty: 1, payment: 'PAID', status: 'CONFIRMED' },
  { day: 2, hour: 9, providerOffset: 0, offerOffset: 0, qty: 2, payment: 'PAID', status: 'PREPARING' },
  // --- Aujourd'hui / hier : commandes fraîches, dont impayées ---
  { day: 1, hour: 8, providerOffset: 1, offerOffset: 0, qty: 1, payment: 'UNPAID', status: 'CONFIRMED' },
  { day: 0, hour: 9, providerOffset: 0, offerOffset: 1, qty: 2, payment: 'UNPAID', status: 'PENDING' },
  { day: 0, hour: 10, providerOffset: 2, offerOffset: 2, qty: 1, payment: 'UNPAID', status: 'PENDING' },
];

const GUEST_NAMES = [
  'Camille Laurent',
  'Hugo Petit',
  'Léa Moreau',
  'Noah Fontaine',
  'Inès Chevalier',
  'Louis Garnier',
  'Emma Roux',
  'Gabriel Vidal',
  'Jade Lefebvre',
  'Raphaël Blanc',
];

async function main() {
  // ---------- Garde d'idempotence ----------
  const existing = await db.serviceOrder.count({
    where: { guestEmail: { endsWith: MARKER_DOMAIN } },
  });
  if (existing > 0) {
    console.log('ℹ️  Seed KPIs déjà appliqué — rien à faire.');
    return;
  }

  // ---------- Données de base ----------
  const [properties, guestProviders, marie] = await Promise.all([
    db.property.findMany({
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.provider.findMany({
      where: { audience: 'GUEST_EXPERIENCE', isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, businessName: true, stripeAccountId: true },
    }),
    db.user.findFirst({ where: { role: 'user' }, select: { id: true } }),
  ]);

  if (properties.length === 0 || guestProviders.length === 0) {
    console.log('⚠️  Biens ou prestataires GUEST_EXPERIENCE manquants — lancez les seeds démo d\u2019abord.');
    return;
  }

  // Offres par prestataire (catalogue É17.5) — fallback générique sinon.
  const offersByProvider = new Map<string, { name: string; unitPrice: number }[]>();
  const offers = await db.serviceOffer.findMany({
    where: { isActive: true },
    orderBy: { unitPrice: 'asc' },
    select: { providerId: true, name: true, unitPrice: true },
  });
  for (const o of offers) {
    const list = offersByProvider.get(o.providerId) ?? [];
    list.push({ name: o.name, unitPrice: o.unitPrice });
    offersByProvider.set(o.providerId, list);
  }

  const FALLBACK_ITEMS: Record<number, { name: string; unitPrice: number }> = {
    0: { name: 'Petit-déjeuner livré', unitPrice: 18 },
    1: { name: 'Breakthrough brunch', unitPrice: 26 },
    2: { name: 'Expérience découverte', unitPrice: 35 },
  };

  const now = new Date();
  let created = 0;

  for (let i = 0; i < RECEIPTS.length; i += 1) {
    const r = RECEIPTS[i];
    const property = properties[i % properties.length];
    const provider = guestProviders[r.providerOffset % guestProviders.length];
    const offersList = offersByProvider.get(provider.id) ?? [];
    const offer = offersList[r.offerOffset % Math.max(offersList.length, 1)] ??
      FALLBACK_ITEMS[r.offerOffset % 3] ?? { name: 'Prestation', unitPrice: 20 };

    const totalAmount = round2(offer.unitPrice * r.qty);
    const commission = round2(totalAmount * COMMISSION_RATE);
    const hostEarning = round2(totalAmount - commission);

    const createdAt = new Date(now.getTime() - r.day * 24 * 3600 * 1000);
    createdAt.setHours(r.hour, 15 + (i % 30), 0, 0);
    const paidAt =
      r.payment === 'PAID' || r.payment === 'REFUNDED'
        ? new Date(createdAt.getTime() + (10 + (i % 20)) * 60 * 1000)
        : null;

    const guestName = GUEST_NAMES[i % GUEST_NAMES.length];

    const order = await db.serviceOrder.create({
      data: {
        propertyId: property.id,
        providerId: provider.id,
        guestName,
        guestEmail: `${guestName.toLowerCase().replace(/[^a-z]/g, '.')}@kpis.local`,
        items: [{ name: offer.name, qty: r.qty, unitPrice: offer.unitPrice }],
        totalAmount,
        commission,
        hostEarning,
        status: r.status,
        paymentStatus: r.payment,
        createdAt,
        paidAt,
      },
    });

    // Transaction associée (conventions moteur de paiement É17.6/20) :
    // payée → 'completed', remboursée → 'refunded', impayée → rien.
    if (paidAt) {
      await db.transaction.create({
        data: {
          type: 'service_order',
          payerId: null,
          receiverId: provider.stripeAccountId ?? null,
          amount: totalAmount,
          currency: 'EUR',
          platformFee: commission,
          status: r.payment === 'REFUNDED' ? 'refunded' : 'completed',
          referenceId: order.id,
          createdAt: paidAt,
        },
      });
    }
    created += 1;
  }

  console.log(`✅ ${created} commandes KPIs créées (historique 30 j) sur ${properties.length} bien(s).`);
  if (marie) console.log('   Hôtes/abonnements : lancez aussi scripts/seed-admin-demo.ts si besoin.');
  console.log('   Dashboard : /admin/dashboard — login admin@qrdomotik.roomscan.pro / QrDomotik2024!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
