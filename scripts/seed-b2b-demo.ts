// =============================================================
// Seed démo B2B — Conciergerie Hub (ÉTAPE 4 : Dashboard)
// Crée pour le compte démo (demo@qrdomotik.roomscan.pro) :
//  - un bien "Loft Canal Saint-Martin" (Paris 10e) + PIN 1234
//  - 6 QR codes B2B actifs (wifi, guidebook, promo, contact,
//    checklist, artisan_directory) avec slugs publics
//  - historique de scans (ce mois + mois précédent)
//  - commandes upselling payées ce mois + avis → stats du dashboard
//  - 13 prestataires géolocalisés (11 dans le rayon, 2 hors rayon)
//  - 3 messages vocaux invités (2 non lus → badge Réclamations)
// Idempotent : ne fait rien si le bien existe déjà.
// Run : bun run scripts/seed-b2b-demo.ts
// =============================================================
import { db } from '../src/lib/db';
import bcrypt from 'bcryptjs';

// Coordonnées du bien : 12 Quai de Valmy, 75010 Paris
const PROPERTY = {
  name: 'Loft Canal Saint-Martin',
  propertyType: 'AIRBNB',
  address: '12 Quai de Valmy, 75010 Paris',
  latitude: 48.8739,
  longitude: 2.3643,
};

interface ProviderSeed {
  email: string;
  businessName: string;
  category: string;
  subcategory?: string;
  description: string;
  location: string;
  lat: number;
  lng: number;
  radiusKm: number;
  audience: 'OWNER_SERVICE' | 'GUEST_EXPERIENCE';
  hourlyRate?: number;
  isUrgentAvailable?: boolean;
  isVerified?: boolean;
  ratingAvg: number;
  totalReviews: number;
  responseTimeMinutes?: number;
  totalJobsCompleted: number;
}

// 13 prestataires autour du Loft (48.8739, 2.3643) :
// - 11 dans leur rayon d'intervention (affichés)
// - 2 hors rayon (Chartres ~78 km, Lyon ~390 km) pour prouver le filtrage
const PROVIDERS: ProviderSeed[] = [
  // ---------- 🔧 Services Propriétaire ----------
  {
    email: 'cleansuite@pro.conciergerie-hub.fr',
    businessName: 'CleanSuite Paris',
    category: 'menage',
    description:
      'Équipe de ménage spécialisée en location courte durée : linge, accueil consommables, remise en état entre chaque séjour.',
    location: 'Montmartre, Paris 18e',
    lat: 48.8867,
    lng: 2.3431,
    radiusKm: 15,
    audience: 'OWNER_SERVICE',
    hourlyRate: 28,
    isVerified: true,
    isUrgentAvailable: true,
    ratingAvg: 4.8,
    totalReviews: 56,
    responseTimeMinutes: 35,
    totalJobsCompleted: 412,
  },
  {
    email: 'plomberie-express@pro.conciergerie-hub.fr',
    businessName: 'Plomberie Express 24/7',
    category: 'plomberie',
    description:
      'Dépannage plomberie en urgence : fuites, WC bouchés, chauffe-eau. Intervention sous 2 h, devis avant travaux.',
    location: 'Belleville, Paris 20e',
    lat: 48.8721,
    lng: 2.3824,
    radiusKm: 12,
    audience: 'OWNER_SERVICE',
    hourlyRate: 65,
    isVerified: true,
    isUrgentAvailable: true,
    ratingAvg: 4.6,
    totalReviews: 89,
    responseTimeMinutes: 20,
    totalJobsCompleted: 640,
  },
  {
    email: 'pressing-deluxe@pro.conciergerie-hub.fr',
    businessName: 'Pressing Deluxe Marais',
    category: 'pressing',
    description:
      'Nettoyage et repassage du linge de maison (draps, serviettes) avec livraison et reprise sur place.',
    location: 'Le Marais, Paris 3e',
    lat: 48.859,
    lng: 2.36,
    radiusKm: 8,
    audience: 'OWNER_SERVICE',
    hourlyRate: 15,
    isVerified: true,
    ratingAvg: 4.7,
    totalReviews: 31,
    responseTimeMinutes: 60,
    totalJobsCompleted: 178,
  },
  {
    email: 'jardin-balcon@pro.conciergerie-hub.fr',
    businessName: 'Jardin & Balcon',
    category: 'jardinage',
    description:
      'Entretien des espaces verts, terrasses et balcons : arrosage, taille, rempotage. Formules mensuelles.',
    location: 'Vincennes (94)',
    lat: 48.8443,
    lng: 2.439,
    radiusKm: 10,
    audience: 'OWNER_SERVICE',
    hourlyRate: 32,
    ratingAvg: 4.9,
    totalReviews: 22,
    responseTimeMinutes: 120,
    totalJobsCompleted: 95,
  },
  {
    email: 'elecnam@pro.conciergerie-hub.fr',
    businessName: "Élec'Nam Paris",
    category: 'electricite',
    description:
      "Installation et dépannage électrique : diagnostics, tableaux, luminaires. Certifié Qualifelec.",
    location: 'Batignolles, Paris 17e',
    lat: 48.8876,
    lng: 2.3196,
    radiusKm: 20,
    audience: 'OWNER_SERVICE',
    hourlyRate: 55,
    isVerified: true,
    ratingAvg: 4.5,
    totalReviews: 40,
    responseTimeMinutes: 45,
    totalJobsCompleted: 320,
  },
  {
    email: 'serrurerie-nord@pro.conciergerie-hub.fr',
    businessName: "Serrurerie de l'Est",
    category: 'serrurerie',
    description:
      "Serrurier agréé : ouverture de porte, changement de cylindre, copie de clés pour vos voyageurs.",
    location: 'Saint-Denis (93)',
    lat: 48.9362,
    lng: 2.3574,
    radiusKm: 8,
    audience: 'OWNER_SERVICE',
    hourlyRate: 48,
    isUrgentAvailable: true,
    ratingAvg: 4.4,
    totalReviews: 67,
    responseTimeMinutes: 25,
    totalJobsCompleted: 508,
  },
  // HORS RAYON (~78 km) — doit être filtré
  {
    email: 'jardinier-chartres@pro.conciergerie-hub.fr',
    businessName: 'Jardinier de Chartres',
    category: 'jardinage',
    description: 'Jardinage ornemental en Eure-et-Loir. (Hors zone Paris — test de filtrage.)',
    location: 'Chartres (28)',
    lat: 48.4439,
    lng: 1.489,
    radiusKm: 10,
    audience: 'OWNER_SERVICE',
    hourlyRate: 25,
    ratingAvg: 4.6,
    totalReviews: 12,
    totalJobsCompleted: 40,
  },
  // ---------- 🥂 Expériences Invité ----------
  {
    email: 'morningbox@pro.conciergerie-hub.fr',
    businessName: 'Morning Box Paris',
    category: 'petit_dejeuner',
    description:
      'Petit-déjeuner gourmand livré avant 8 h : viennoiseries artisanale, jus pressés, fruits de saison. La Morning Box dès 12 €.',
    location: 'République, Paris 11e',
    lat: 48.8675,
    lng: 2.3632,
    radiusKm: 6,
    audience: 'GUEST_EXPERIENCE',
    hourlyRate: 12,
    isVerified: true,
    ratingAvg: 4.9,
    totalReviews: 124,
    responseTimeMinutes: 15,
    totalJobsCompleted: 1240,
  },
  {
    email: 'sommelier-domicile@pro.conciergerie-hub.fr',
    businessName: 'Sommelier à Domicile',
    category: 'sommelier',
    description:
      'Dégustation privée de vins nature dans votre logement : 5 crus, planche de fromages affinés offerte.',
    location: 'Bastille, Paris 12e',
    lat: 48.8532,
    lng: 2.3693,
    radiusKm: 15,
    audience: 'GUEST_EXPERIENCE',
    hourlyRate: 90,
    isVerified: true,
    ratingAvg: 5.0,
    totalReviews: 47,
    responseTimeMinutes: 90,
    totalJobsCompleted: 156,
  },
  {
    email: 'paris-transfer@pro.conciergerie-hub.fr',
    businessName: 'Paris Transfer Premium',
    category: 'transfert',
    description:
      'Transferts aéroports et gares en berline électrique : accueil personnalisé, siège enfant sur demande.',
    location: 'Roissy — CDG (95)',
    lat: 49.0097,
    lng: 2.5479,
    radiusKm: 40,
    audience: 'GUEST_EXPERIENCE',
    hourlyRate: 75,
    isVerified: true,
    ratingAvg: 4.7,
    totalReviews: 210,
    responseTimeMinutes: 10,
    totalJobsCompleted: 1980,
  },
  {
    email: 'chef-antoine@pro.conciergerie-hub.fr',
    businessName: 'Chef Antoine — Dîner Privé',
    category: 'chef',
    description:
      'Menu 5 services préparé chez vous, produit du marché. Service en table inclut vaisselle et dressage.',
    location: 'Odéon, Paris 6e',
    lat: 48.8529,
    lng: 2.3388,
    radiusKm: 25,
    audience: 'GUEST_EXPERIENCE',
    hourlyRate: 120,
    isVerified: true,
    ratingAvg: 4.8,
    totalReviews: 63,
    responseTimeMinutes: 180,
    totalJobsCompleted: 210,
  },
  {
    email: 'louvre-tours@pro.conciergerie-hub.fr',
    businessName: 'Louvre Private Tours',
    category: 'visites',
    description:
      'Visites guidées privées (Louvre, Marais, Montmartre) animées par des guides conférenciers.',
    location: 'Louvre, Paris 1er',
    lat: 48.8606,
    lng: 2.3376,
    radiusKm: 12,
    audience: 'GUEST_EXPERIENCE',
    hourlyRate: 60,
    ratingAvg: 4.7,
    totalReviews: 85,
    responseTimeMinutes: 60,
    totalJobsCompleted: 340,
  },
  // HORS RAYON (~390 km) — doit être filtré
  {
    email: 'spa-lyon@pro.conciergerie-hub.fr',
    businessName: 'Spa & Massage 75',
    category: 'massage',
    description: 'Massages bien-être à domicile. (Basé à Lyon — test de filtrage.)',
    location: 'Lyon 2e',
    lat: 45.764,
    lng: 4.8357,
    radiusKm: 15,
    audience: 'GUEST_EXPERIENCE',
    hourlyRate: 70,
    ratingAvg: 4.8,
    totalReviews: 51,
    totalJobsCompleted: 130,
  },
];

// QR codes B2B du bien (avec contenus utilisés par le Hub /hub/[slug])
const QR_CODES = [
  {
    type: 'wifi',
    name: 'Wi-Fi & Réseau',
    slug: 'loft-canal-wifi',
    content: { network_name: 'Loft-Canal-Fiber', password: 'bienvenue2024', security_type: 'WPA2' },
  },
  {
    type: 'home_manual',
    name: 'Guidebook du Loft',
    slug: 'loft-canal-guide',
    content: {
      title: 'Guide de bienvenue — Loft Canal Saint-Martin',
      body:
        '👋 Bienvenue !\n\nLa clé du portail se trouve dans la boîte à clés (code fourni par SMS). L\'appartement est au 2e étage, porte de gauche.\n\n🔑 Accès\n\nBoîte à clés : code 4821A. Porte d\'entrée : poussez fort la poignée en la tournant à gauche.\n\n🛠️ Équipements\n\nMachine à café Nespresso (capsules dans le tiroir du bas), lave-linge (lessive sous l\'évier), TV Connectée (vos comptes Netflix/Prime).\n\n📜 Bonnes adresses\n\nBoulangerie "Le Petit Mitron" à 50 m à gauche en sortant, marché Alibreu le dimanche matin, restaurant "Chez Camille" au bord du canal (réservez !).\n\n🌙 Règles de vie\n\nCalme après 22 h (voisins adorables mais sensibles), pas de fête, tri des déchets : verre à droite du portail.',
    },
  },
  { type: 'promo', name: 'Morning Box & Services', slug: 'loft-canal-upselling', content: {} },
  { type: 'contact', name: 'Contact hôte / Réclamations', slug: 'loft-canal-contact', content: {} },
  { type: 'checklist', name: 'Check-list Check-out', slug: 'loft-canal-checkout', content: {} },
  { type: 'artisan_directory', name: 'Annuaire prestataires', slug: 'loft-canal-prestataires', content: {} },
];

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  const demoUser = await db.user.findUnique({
    where: { email: 'demo@qrdomotik.roomscan.pro' },
  });
  if (!demoUser) {
    console.error('❌ Compte démo demo@qrdomotik.roomscan.pro introuvable (lance d’abord scripts/seed-demo-users.ts)');
    process.exit(1);
  }

  const existing = await db.property.findFirst({
    where: { ownerId: demoUser.id, name: PROPERTY.name },
  });
  if (existing) {
    console.log('✅ Données démo B2B déjà présentes (bien "Loft Canal Saint-Martin"). Rien à faire.');
    return;
  }

  // ---------- Bien + PIN Mode Hôte ----------
  const pinHash = await bcrypt.hash('1234', 10);
  const property = await db.property.create({
    data: {
      ownerId: demoUser.id,
      name: PROPERTY.name,
      propertyType: PROPERTY.propertyType,
      address: PROPERTY.address,
      latitude: PROPERTY.latitude,
      longitude: PROPERTY.longitude,
      pinHash,
    },
  });
  console.log(`🏠 Bien créé : ${property.name} (${property.id})`);

  const salon = await db.room.create({
    data: { propertyId: property.id, name: 'Salon', icon: '🛋️' },
  });
  await db.room.createMany({
    data: [
      { propertyId: property.id, name: 'Cuisine', icon: '🍳' },
      { propertyId: property.id, name: 'Chambre', icon: '🛏️' },
    ],
  });

  // ---------- QR codes + contenus ----------
  const createdQrs: { id: string; type: string }[] = [];
  for (const [i, qr] of QR_CODES.entries()) {
    const created = await db.qrCode.create({
      data: {
        propertyId: property.id,
        roomId: i === 0 ? salon.id : null,
        name: qr.name,
        type: qr.type,
        publicSlug: qr.slug,
        isActive: true,
        isPrivate: qr.type === 'artisan_directory',
        content: {
          create: { contentJson: JSON.stringify('content' in qr ? qr.content : {}) },
        },
      },
    });
    createdQrs.push(created);
  }
  console.log(`🔗 ${createdQrs.length} QR codes B2B créés (Wi-Fi + Guidebook renseignés)`);

  // ---------- Téléphone de l'hôte (bouton "Appeler" du Hub) ----------
  await db.profile.upsert({
    where: { userId: demoUser.id },
    create: { userId: demoUser.id, phone: '+33 6 12 34 56 78' },
    update: { phone: '+33 6 12 34 56 78' },
  });

  // ---------- Plaques physiques (hubSlug → /hub/[slug]) ----------
  const batch = await db.qrBatch.create({
    data: { quantity: 2, createdBy: demoUser.id },
  });
  await db.physicalQrCode.create({
    data: {
      batchId: batch.id,
      activationCode: 'PLQ-LOFT-0001',
      setupToken: 'SETUP-LOFT01',
      status: 'active',
      isClaimed: true,
      claimedByUserId: demoUser.id,
      claimedAt: new Date(),
      activatedByUserId: demoUser.id,
      activatedAt: new Date(),
      propertyId: property.id,
      hubSlug: 'loft-canal-hub',
    },
  });
  await db.physicalQrCode.create({
    data: {
      batchId: batch.id,
      activationCode: 'PLQ-LOFT-0002',
      setupToken: 'SETUP-LOFT02',
      status: 'cancelled',
      isClaimed: true,
      claimedByUserId: demoUser.id,
      claimedAt: new Date(),
      propertyId: property.id,
      hubSlug: 'loft-canal-hub-off',
    },
  });
  console.log('🔌 2 plaques : /hub/loft-canal-hub (active) + /hub/loft-canal-hub-off (désactivée, démo erreur)');

  // ---------- Scans : 48 ce mois, 21 le mois précédent ----------
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const scanData: {
    qrCodeId: string;
    propertyId: string;
    locale: string;
    userAgent: string;
    createdAt: Date;
  }[] = [];
  for (let i = 0; i < 48; i++) {
    const qr = createdQrs[randInt(0, createdQrs.length - 1)];
    const createdAt = new Date(
      startOfMonth.getTime() + Math.random() * (now.getTime() - startOfMonth.getTime()),
    );
    scanData.push({
      qrCodeId: qr.id,
      propertyId: property.id,
      locale: Math.random() > 0.7 ? 'en' : 'fr',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      createdAt,
    });
  }
  for (let i = 0; i < 21; i++) {
    const qr = createdQrs[randInt(0, createdQrs.length - 1)];
    const createdAt = new Date(
      startOfPrevMonth.getTime() + Math.random() * (startOfMonth.getTime() - startOfPrevMonth.getTime()),
    );
    scanData.push({ qrCodeId: qr.id, propertyId: property.id, locale: 'fr', userAgent: 'Mozilla/5.0 (Android 14)', createdAt });
  }
  await db.scanLog.createMany({ data: scanData });
  console.log(`📡 ${scanData.length} scans créés (48 ce mois / 21 mois précédent)`);

  // ---------- Prestataires ----------
  const providerIds: Record<string, string> = {};
  for (const [i, p] of PROVIDERS.entries()) {
    const user = await db.user.create({
      data: {
        email: p.email,
        fullName: p.businessName,
        role: 'user',
        // passwordHash volontairement null : ces comptes ne se connectent pas
        providerProfile: {
          create: {
            businessName: p.businessName,
            category: p.category,
            description: p.description,
            location: p.location,
            latitude: p.lat,
            longitude: p.lng,
            serviceRadiusKm: p.radiusKm,
            audience: p.audience,
            hourlyRate: p.hourlyRate,
            isUrgentAvailable: p.isUrgentAvailable ?? false,
            isVerified: p.isVerified ?? false,
            ratingAvg: p.ratingAvg,
            totalReviews: p.totalReviews,
            responseTimeMinutes: p.responseTimeMinutes,
            totalJobsCompleted: p.totalJobsCompleted,
          },
        },
      },
    });
    const provider = await db.provider.findUnique({ where: { userId: user.id } });
    providerIds[p.businessName] = provider!.id;
    console.log(`  🧑‍🔧 ${p.businessName} — ${p.audience} — rayon ${p.radiusKm} km`);
  }

  // ---------- Commandes upselling (Morning Box) + avis ----------
  const morningBoxId = providerIds['Morning Box Paris'];
  const pressingId = providerIds['Pressing Deluxe Marais'];

  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 3600 * 1000);
  const sr1 = await db.serviceRequest.create({
    data: {
      propertyId: property.id,
      providerId: morningBoxId,
      status: 'completed',
      description: 'Morning Box classique pour 2 voyageurs',
      finalPrice: 24.9,
      paidAt: daysAgo(3),
      createdAt: daysAgo(4),
    },
  });
  const sr2 = await db.serviceRequest.create({
    data: {
      propertyId: property.id,
      providerId: morningBoxId,
      status: 'completed',
      description: 'Morning Box brunch (4 personnes)',
      finalPrice: 39.9,
      paidAt: daysAgo(6),
      createdAt: daysAgo(7),
    },
  });
  const sr3 = await db.serviceRequest.create({
    data: {
      propertyId: property.id,
      providerId: morningBoxId,
      status: 'completed',
      description: 'Morning Box express',
      finalPrice: 19.9,
      paidAt: daysAgo(9),
      createdAt: daysAgo(9),
    },
  });
  await db.serviceRequest.create({
    data: {
      propertyId: property.id,
      providerId: pressingId,
      status: 'pending',
      description: 'Linge de lit 2 chambres — retrait jeudi',
      createdAt: daysAgo(1),
    },
  });
  console.log('💰 3 commandes upselling payées ce mois (84,70 €) + 1 en attente');

  const reviewSeed = [
    { sr: sr1.id, rating: 5, comment: 'Livré à l’heure, viennoiseries excellentes !' },
    { sr: sr2.id, rating: 5, comment: 'Parfait pour le brunch en famille.' },
    { sr: sr3.id, rating: 4, comment: 'Très bon, un peu de retard à la livraison.' },
  ];
  for (const r of reviewSeed) {
    await db.review.create({
      data: {
        serviceRequestId: r.sr,
        providerId: morningBoxId,
        userId: demoUser.id,
        rating: r.rating,
        comment: r.comment,
      },
    });
  }
  console.log('⭐ 3 avis créés (moyenne 4,7)');

  // ---------- Messages vocaux invités (badge Réclamations) ----------
  await db.voiceMessage.createMany({
    data: [
      {
        propertyId: property.id,
        senderName: 'Julie (voyageuse)',
        senderType: 'guest',
        audioUrl: '/demo/voice-julie.mp3',
        durationSec: 14,
        fileSizeKb: 56,
        isRead: false,
        createdAt: new Date(now.getTime() - 2 * 3600 * 1000),
      },
      {
        propertyId: property.id,
        senderName: 'Marc (voyageur)',
        senderType: 'guest',
        audioUrl: '/demo/voice-marc.mp3',
        durationSec: 22,
        fileSizeKb: 88,
        isRead: false,
        createdAt: new Date(now.getTime() - 26 * 3600 * 1000),
      },
      {
        propertyId: property.id,
        senderName: 'Sophie (voyageuse)',
        senderType: 'guest',
        audioUrl: '/demo/voice-sophie.mp3',
        durationSec: 9,
        fileSizeKb: 36,
        isRead: true,
        createdAt: daysAgo(5),
      },
    ],
  });
  console.log('🚨 3 messages vocaux invités (2 non lus)');

  console.log('\n🎉 Seed démo B2B terminé.');
  console.log('   Dashboard : /airbnb/dashboard — login demo@qrdomotik.roomscan.pro / Demo2024!');
  console.log('   PIN Mode Hôte du bien : 1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
