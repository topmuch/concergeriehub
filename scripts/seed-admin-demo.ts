// =============================================================
// Seed Superadmin — Conciergerie Hub (ÉTAPE 9)
// Enrichit la démo pour la console Superadmin :
//  - 3 comptes hôtes supplémentaires (Sofia, Thomas, Nadia)
//  - 3 propriétés liées (Studio Montmartre, Arcachon, Bordeaux)
//  - 3 abonnements actifs → MRR réel (Solo mensuel 9,90 €,
//    Pro annuel 199 €, Solo annuel 99 €)
//  - journal d'activité sur le Loft démo
// Idempotent : ne fait rien si sofia@exemple.fr existe déjà.
// Run : bun run scripts/seed-admin-demo.ts
// =============================================================
import { db } from '../src/lib/db';
import bcrypt from 'bcryptjs';

async function main() {
  const existing = await db.user.findUnique({
    where: { email: 'sofia@exemple.fr' },
    select: { id: true },
  });
  if (existing) {
    console.log('ℹ️  Seed admin déjà appliqué — rien à faire.');
    return;
  }

  const passwordHash = await bcrypt.hash('Host2024!', 10);
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 3600 * 1000);

  // ---------- Hôte 1 : Sofia (Solo mensuel) ----------
  const sofia = await db.user.create({
    data: {
      email: 'sofia@exemple.fr',
      fullName: 'Sofia Martin',
      passwordHash,
      role: 'user',
      selectedPlan: 'airbnb_solo',
      onboardingCompleted: true,
      createdAt: daysAgo(9),
      ownedProperties: {
        create: {
          name: 'Studio Montmartre',
          propertyType: 'AIRBNB',
          address: '5 Rue Lepic, 75018 Paris',
          latitude: 48.8867,
          longitude: 2.3376,
        },
      },
    },
  });
  await db.subscription.create({
    data: {
      subscriberType: 'user',
      userId: sofia.id,
      plan: 'airbnb_solo',
      amount: 9.9,
      currency: 'EUR',
      billingCycle: 'monthly',
      status: 'active',
      currentPeriodStart: daysAgo(9),
      currentPeriodEnd: daysAgo(-21),
    },
  });
  console.log('👩‍💻 Sofia Martin — Solo mensuel 9,90 € + Studio Montmartre');

  // ---------- Hôte 2 : Thomas (Pro annuel, 2 biens) ----------
  const thomas = await db.user.create({
    data: {
      email: 'thomas@exemple.fr',
      fullName: 'Thomas Leroy',
      passwordHash,
      role: 'user',
      selectedPlan: 'airbnb_pro',
      onboardingCompleted: true,
      createdAt: daysAgo(24),
      ownedProperties: {
        create: [
          {
            name: 'Maison Bassin d\u2019Arcachon',
            propertyType: 'GITE',
            address: '12 Avenue de la Plage, 33120 Arcachon',
            latitude: 44.6608,
            longitude: -1.1667,
          },
          {
            name: 'Appartement Bordeaux Chartrons',
            propertyType: 'AIRBNB',
            address: '8 Rue Notre Dame, 33000 Bordeaux',
            latitude: 44.8606,
            longitude: -0.5742,
          },
        ],
      },
    },
  });
  await db.subscription.create({
    data: {
      subscriberType: 'user',
      userId: thomas.id,
      plan: 'airbnb_pro',
      amount: 199,
      currency: 'EUR',
      billingCycle: 'annual',
      maxProperties: 3,
      status: 'active',
      currentPeriodStart: daysAgo(24),
      currentPeriodEnd: daysAgo(-341),
    },
  });
  console.log('👨‍💻 Thomas Leroy — Pro annuel 199 € + 2 biens (Arcachon, Bordeaux)');

  // ---------- Hôte 3 : Nadia (Free, 0 bien, très récente) ----------
  await db.user.create({
    data: {
      email: 'nadia@exemple.fr',
      fullName: 'Nadia Bencherif',
      passwordHash,
      role: 'user',
      createdAt: daysAgo(1),
    },
  });
  console.log('👩‍💻 Nadia Bencherif — Free (inscrite hier, aucun bien)');

  // ---------- Abonnement pour l'hôte démo Marie (Solo annuel) ----------
  const marie = await db.user.findUnique({
    where: { email: 'demo@qrdomotik.roomscan.pro' },
    select: { id: true },
  });
  if (marie) {
    await db.subscription.create({
      data: {
        subscriberType: 'user',
        userId: marie.id,
        plan: 'airbnb_solo',
        amount: 99,
        currency: 'EUR',
        billingCycle: 'annual',
        status: 'active',
        currentPeriodStart: daysAgo(40),
        currentPeriodEnd: daysAgo(-325),
      },
    });
    console.log('👩‍💻 Marie Dupont (démo) — Solo annuel 99 € rattaché');
  }

  // ---------- Journal d'activité sur le Loft démo ----------
  const loft = await db.property.findFirst({
    where: { name: 'Loft Canal Saint-Martin' },
    select: { id: true, ownerId: true },
  });
  if (loft) {
    await db.activityLog.createMany({
      data: [
        {
          propertyId: loft.id,
          userId: loft.ownerId,
          actionType: 'scan',
          detailsJson: '{"module":"wifi"}',
          createdAt: new Date(now.getTime() - 35 * 60 * 1000),
        },
        {
          propertyId: loft.id,
          userId: loft.ownerId,
          actionType: 'voice_received',
          detailsJson: '{"module":"complaint"}',
          createdAt: new Date(now.getTime() - 2 * 3600 * 1000),
        },
        {
          propertyId: loft.id,
          userId: loft.ownerId,
          actionType: 'service_ordered',
          detailsJson: '{"module":"upselling","provider":"Morning Box Paris"}',
          createdAt: new Date(now.getTime() - 26 * 3600 * 1000),
        },
        {
          propertyId: loft.id,
          userId: loft.ownerId,
          actionType: 'wifi_updated',
          detailsJson: '{"module":"wifi"}',
          createdAt: daysAgo(2),
        },
        {
          propertyId: loft.id,
          userId: loft.ownerId,
          actionType: 'guidebook_updated',
          detailsJson: '{"module":"guidebook"}',
          createdAt: daysAgo(4),
        },
        {
          propertyId: loft.id,
          userId: loft.ownerId,
          actionType: 'qr_created',
          detailsJson: '{"module":"provider_directory"}',
          createdAt: daysAgo(6),
        },
      ],
    });
    console.log('⚡ 6 entrées d\u2019activité créées sur le Loft démo');
  }

  console.log('\n🎉 Seed Superadmin terminé.');
  console.log('   Console : /admin — login admin@qrdomotik.roomscan.pro / QrDomotik2024!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
