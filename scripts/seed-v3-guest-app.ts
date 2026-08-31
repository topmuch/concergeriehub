// =============================================================
// ÉTAPE 16 (V3) — Seed démo "App Invitée PWA" (idempotent)
//   1. QR house_rules sur le Loft Canal Saint-Martin (règles de
//      la maison → onglet Guide de l'app invitée)
//   2. Séjour EN COURS (Camille Laurent) sur le Loft → accueil
//      personnalisé via /app/hub/[slug]/guest?b=<bookingId>
// Le Loft a déjà : QR Wi-Fi actif + guidebook (loft-canal-guide).
// Usage : bun run scripts/seed-v3-guest-app.ts
// =============================================================

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const LOFT_SLUG = 'loft-canal-saint-martin-11wz';

const HOUSE_RULES = [
  'Calme après 22 h — les voisins sont adorables mais sensibles 🌙',
  'Pas de fête ni de musique forte',
  'Non-fumeur à l’intérieur (balcon OK)',
  'Tri des déchets : verre à droite du portail ♻️',
  'Les animaux ne sont pas autorisés',
];

async function main() {
  console.log('🚀 Seed V3 — App Invitée PWA');

  // ── 1. Bien Loft ──
  const property = await db.property.findUnique({
    where: { qrHubSlug: LOFT_SLUG },
    select: { id: true, name: true },
  });
  if (!property) {
    throw new Error(`Bien introuvable via qrHubSlug=${LOFT_SLUG} — lance d’abord le seed V2.`);
  }
  console.log(`🏠 Bien : ${property.name} (${property.id})`);

  // ── 2. QR house_rules (si absent) ──
  const existingRules = await db.qrCode.findFirst({
    where: { propertyId: property.id, type: 'house_rules' },
  });
  if (!existingRules) {
    const qr = await db.qrCode.create({
      data: {
        propertyId: property.id,
        name: 'Règles de la maison',
        type: 'house_rules',
        publicSlug: 'loft-canal-regles',
        isActive: true,
        isPrivate: false,
        content: {
          create: {
            contentJson: JSON.stringify({ rules: HOUSE_RULES }),
          },
        },
      },
    });
    console.log(`🛡️ QR house_rules créé : ${qr.publicSlug}`);
  } else {
    console.log('🛡️ QR house_rules déjà présent — OK');
  }

  // ── 3. Wi-Fi de secours si le bien en est dépourvu (robustesse démo) ──
  const wifiQr = await db.qrCode.findFirst({
    where: { propertyId: property.id, type: 'wifi', isActive: true, isPrivate: false },
  });
  if (!wifiQr) {
    await db.qrCode.create({
      data: {
        propertyId: property.id,
        name: 'Wi-Fi du Loft',
        type: 'wifi',
        isActive: true,
        isPrivate: false,
        content: {
          create: {
            contentJson: JSON.stringify({
              network_name: 'LoftCanal_5G',
              password: 'Bienvenue2026!',
              security_type: 'WPA2',
            }),
          },
        },
      },
    });
    console.log('📶 QR Wi-Fi créé (secours)');
  } else {
    console.log('📶 QR Wi-Fi déjà présent — OK');
  }

  // ── 4. Séjour EN COURS (Camille Laurent) ──
  const now = Date.now();
  const seedRef = 'HMSEED16';
  const existingBooking = await db.booking.findFirst({
    where: { externalRef: seedRef },
  });
  if (!existingBooking) {
    const checkIn = new Date(now - 36 * 3600 * 1000); // hier 12 h
    const checkOut = new Date(now + 4 * 24 * 3600 * 1000); // dans 4 jours
    const booking = await db.booking.create({
      data: {
        propertyId: property.id,
        guestName: 'Camille Laurent',
        guestEmail: 'camille.laurent@exemple.fr',
        checkIn,
        checkOut,
        guests: 2,
        source: 'AIRBNB',
        status: 'CHECKED_IN',
        externalRef: seedRef,
      },
    });
    console.log(`🛌 Séjour en cours créé : ${booking.id} (Camille Laurent)`);
    console.log(`   → E2E : /app/hub/${LOFT_SLUG}/guest?b=${booking.id}`);
  } else {
    console.log(`🛌 Séjour seed déjà présent : ${existingBooking.id}`);
    console.log(`   → E2E : /app/hub/${LOFT_SLUG}/guest?b=${existingBooking.id}`);
  }

  // ── Récap ──
  const counts = {
    guidebook: await db.qrCode.count({ where: { propertyId: property.id, type: 'home_manual' } }),
    wifi: await db.qrCode.count({ where: { propertyId: property.id, type: 'wifi', isActive: true } }),
    rules: await db.qrCode.count({ where: { propertyId: property.id, type: 'house_rules' } }),
    bookings: await db.booking.count({ where: { propertyId: property.id } }),
  };
  console.log('✅ Seed V3 terminé —', JSON.stringify(counts));
}

main()
  .catch((e) => {
    console.error('❌ Seed échoué :', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
