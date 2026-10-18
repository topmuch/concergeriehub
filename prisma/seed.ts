// =============================================================
// SEED DÉMO « APP DE LIVRAISON PREMIUM » — Services Invités
// (refonte Services — ÉTAPE 1 : données de démo réalistes)
//
// Objectif : peupler le hub de CHAQUE bien actif avec 7 prestataires
// GUEST_EXPERIENCE ultra-réalistes (style Uber Eats / Room Service
// 5 étoiles) + leur catalogue fin (ServiceOffer) commandable en 1 clic.
//
// Propriétés du seed :
//  • IDEMPOTENT — exécutable N fois sans doublons (upserts ; clé
//    d'idempotence = email du compte fantôme du prestataire, et
//    l'unique ServiceOffer (propertyId, providerId, name)).
//  • MULTI-BIENS — chaque propriété ACTIVE reçoit son propre jeu de
//    prestataires, géolocalisés À CÔTÉ du bien (offsets déterministes
//    < 1 km, serviceRadius 50 km) → visibles immédiatement dans le hub
//    (le service d'API filtre les prestataires par rayon haversine).
//  • RÉVERSIBLE / non destructif — les comptes sont des comptes
//    « fantômes » sans mot de passe (même pattern que le dashboard
//    Superadmin) ; les prestataires de test « (E2E) » sont désactivés
//    (isActive: false), jamais supprimés.
//
// Exécution :
//   bunx prisma db seed          (config « prisma.seed » dans package.json)
//   bun prisma/seed.ts           (direct)
//   SEED_MODE=bootstrap bun prisma/seed.ts   (au boot du conteneur : crée
//     UNIQUEMENT ce qui manque — ne réécrit JAMAIS les prestataires/offres
//     déjà présents, pour préserver les modifications faites par l'hôte)
// =============================================================

import { PrismaClient, Prisma } from '@prisma/client';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { HUB_ARRIVAL_PHOTOS } from '../src/lib/hub-visuals';

const db = new PrismaClient();

/** SEED_MODE=bootstrap → « create-only » : idempotent et non écrasant. */
const BOOTSTRAP = process.env.SEED_MODE === 'bootstrap';

// -------------------------------------------------------------
// v4.25 « ARRIVÉE PAS À PAS — PHOTOS RÉELLES » — backfill photos
// curated des étapes du guide visuel d'arrivée (carrousel Accueil).
// NON DESTRUCTIF : seuls les imageUrl absents OU CASSÉS sont remplis
// (chemin local /demo|/uploads dont le fichier n'existe pas dans
// public/ → ex. « /demo/arrival-door-keys.jpg » 404 sur la démo) ;
// titres / descriptions de l'hôte jamais touchés. Idempotent.
// -------------------------------------------------------------
interface SeedVisualStep {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
}

const VISUAL_STEP_POOL = [
  HUB_ARRIVAL_PHOTOS.facade,
  HUB_ARRIVAL_PHOTOS.gate,
  HUB_ARRIVAL_PHOTOS.keys,
];

function visualStepPhoto(title: string, index: number): string {
  const t = title.toLowerCase();
  if (/(fa[cç]ade|b[âa]timent|maison|ext[ée]rieur|rue)/.test(t)) return HUB_ARRIVAL_PHOTOS.facade;
  if (/(portail|portillon|digicode|clavier|code|badge|interphone)/.test(t)) return HUB_ARRIVAL_PHOTOS.gate;
  if (/(porte|cl[ée]s|bo[iî]te|coffre|entrée)/.test(t)) return HUB_ARRIVAL_PHOTOS.keys;
  return VISUAL_STEP_POOL[index % VISUAL_STEP_POOL.length];
}

/** Chemin local (/…) : vrai ssi le fichier existe dans public/.
 *  URL distante (https:) → considérée valide (vérifiée au runtime). */
function localMediaExists(url: string): boolean {
  if (!url.startsWith('/')) return true;
  try {
    return existsSync(path.join(process.cwd(), 'public', url));
  } catch {
    return true; // fs indisponible → on ne « répare » pas par erreur
  }
}

async function backfillVisualGuidePhotos(): Promise<number> {
  const properties = await db.property.findMany({
    where: { isActive: true },
    select: { id: true, name: true, visualGuide: true },
  });

  let patched = 0;
  for (const property of properties) {
    const steps = Array.isArray(property.visualGuide)
      ? (property.visualGuide as unknown as SeedVisualStep[])
      : [];
    if (steps.length === 0) continue;

    const next: SeedVisualStep[] = [];
    let changed = false;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step.imageUrl && localMediaExists(step.imageUrl)) {
        next.push(step);
        continue;
      }
      next.push({ ...step, imageUrl: visualStepPhoto(step.title ?? '', i) });
      changed = true;
    }

    if (changed) {
      await db.property.update({
        where: { id: property.id },
        data: { visualGuide: next as unknown as Prisma.InputJsonValue },
      });
      patched++;
      console.log(`📸 « ${property.name} » — photos d'arrivée complétées/réparées (${steps.length} étapes).`);
    }
  }
  return patched;
}

// -------------------------------------------------------------
// Catalogue de démo — 7 prestataires, 18 offres alléchantes
// -------------------------------------------------------------
interface DemoOffer {
  name: string;
  description: string;
  unitPrice: number;
  unit: string;
  /** v4.23 « hub réel » — photo réelle vérifiée (OSS stable, CDN public). */
  imageUrl: string;
}

interface DemoProvider {
  key: string;
  businessName: string;
  category: string;
  description: string;
  location: string;
  ratingAvg: number;
  totalReviews: number;
  offers: DemoOffer[];
}

const DEMO_PROVIDERS: DemoProvider[] = [
  {
    key: 'morning-box',
    businessName: 'Morning Box',
    category: 'petit_dejeuner',
    description:
      'Le petit-déjeuner artisanal livré frais devant votre porte entre 6h00 et 10h00 : viennoiseries du jour, jus pressés, fruits de saison.',
    location: 'Livraison locale — quartier du bien',
    ratingAvg: 4.9,
    totalReviews: 124,
    offers: [
      {
        name: 'Box Sucrée Classique',
        description:
          'Viennoiseries du jour (croissant, pain au chocolat), jus d’orange pressé, confiture artisanale & beurre demi-sel.',
        unitPrice: 7.5,
        unit: 'box',
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/8a94b10bd483.jpg',
      },
      {
        name: 'Box Salée Gourmet',
        description:
          'Croque-monsieur au comté, œuf parfait, avocat smashé & jeune salade — le brunch malin, livré frais avant 10h.',
        unitPrice: 11.9,
        unit: 'box',
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/84be7b16ef96.jpg',
      },
      {
        name: 'Box Champagne & Fruits',
        description:
          'Demi-bouteille de Champagne bien fraîche, coupe de fruits exotiques et macarons signature. L’indulgence absolue.',
        unitPrice: 25.0,
        unit: 'box',
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/901ff8b6eef7.jpeg',
      },
    ],
  },
  {
    key: 'welcome-pack',
    businessName: 'Welcome Pack',
    category: 'arrivee',
    description:
      'L’essentiel pour démarrer le séjour sans aucune course : paniers gourmands déposés dans le logement avant votre arrivée.',
    location: 'Dépôt dans le logement avant l’arrivée',
    ratingAvg: 4.8,
    totalReviews: 87,
    offers: [
      {
        name: 'Panier du Voyageur',
        description:
          'Eau minérale ×2, café en capsules, biscuits artisanaux et spécialités locales — déposé dans le logement avant votre arrivée.',
        unitPrice: 9.9,
        unit: 'panier',
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/2d42f9c736ce.jpg',
      },
      {
        name: 'Soirée Vin & Fromage',
        description:
          'Planche généreuse de fromages affinés & charcuteries locales + une bouteille de vin de la région. Prêt à déguster.',
        unitPrice: 35.0,
        unit: 'formule',
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/6b898915146a.jpg',
      },
    ],
  },
  {
    key: 'pratique',
    businessName: 'Conciergerie Pratique',
    category: 'pratique',
    description:
      'Les petits services qui changent tout : départ tardif, consigne à bagages, courses livrées — en un clic, sans stress.',
    location: 'Partenaires à proximité du bien',
    ratingAvg: 4.7,
    totalReviews: 63,
    offers: [
      {
        name: 'Late Check-out jusqu’à 14h',
        description:
          'Profitez de votre logement jusqu’à 14h le jour du départ — confirmé sous réserve de disponibilité, aucune course à courir.',
        unitPrice: 20.0,
        unit: 'prestation',
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/61e35f627acd.jpg',
      },
      {
        name: 'Garde-bagages partenaire',
        description:
          'Consigne sécurisée à proximité — vos bagages en sécurité après le check-out, récupération sur simple présentation du QR.',
        unitPrice: 5.0,
        unit: 'bagage',
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/e9c452bdab74.jpg',
      },
      {
        name: 'Livraison de courses',
        description:
          'Votre liste de courses livrée dans le logement : épicerie, boissons, fraîcheur locale — en moins de 2 heures.',
        unitPrice: 15.0,
        unit: 'prestation',
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/349a405e6d8d.jpg',
      },
    ],
  },
  {
    key: 'spa',
    businessName: 'Sérénité Spa & Massage',
    category: 'massage',
    description:
      'Massages et soins bien-être à domicile : praticiennes certifiées, huiles bio, expérience spa sans sortir de la villa.',
    location: 'Intervention à domicile',
    ratingAvg: 4.9,
    totalReviews: 112,
    offers: [
      {
        name: 'Massage relaxant à domicile (1h)',
        description:
          'Table installée dans le salon, huiles bio incluses — dos, nuque, jambes. Le summum après une journée de découvertes.',
        unitPrice: 80.0,
        unit: 'séance',
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/98e534226be6.jpeg',
      },
      {
        name: 'Massage Duo (2 × 1h)',
        description:
          'Deux praticiennes simultanées, en couple ou entre amis — l’expérience spa à deux, sans déplacement.',
        unitPrice: 150.0,
        unit: 'séance',
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/4e392647f77d.jpeg',
      },
    ],
  },
  {
    key: 'sommelier',
    businessName: 'La Cave du Sommelier',
    category: 'sommelier',
    description:
      'Sommelier-conseil : grands crus, dégustations privées et accords mets & vins directement dans votre séjour.',
    location: 'Cave partenaire — centre-ville',
    ratingAvg: 4.8,
    totalReviews: 95,
    offers: [
      {
        name: 'Grand Cru surprise du sommelier',
        description:
          'Une bouteille d’exception sélectionnée selon vos goûts, refroidie et livrée avec les notes de dégustation.',
        unitPrice: 48.0,
        unit: 'bouteille',
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/20c729520355.jpg',
      },
      {
        name: 'Dégustation privée (6 vins)',
        description:
          '1h30 de voyage œnologique dans votre salon : 6 vins commentés, planche d’accords incluse.',
        unitPrice: 60.0,
        unit: 'personne',
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/d7c4de4d3057.jpg',
      },
    ],
  },
  {
    key: 'transferts',
    businessName: 'Villa Transferts Premium',
    category: 'transfert',
    description:
      'Chauffeur privé berline & van : aéroport, gare, excursions — ponctualité garantie, suivi de vol en temps réel.',
    location: 'Prise en charge devant le bien',
    ratingAvg: 4.9,
    totalReviews: 141,
    offers: [
      {
        name: 'Transfert Aéroport Privé',
        description:
          'Berline confort jusqu’à 3 passagers, chauffeur privé, eau & Wi-Fi à bord — suivi de vol inclus, attente offerte.',
        unitPrice: 50.0,
        unit: 'trajet',
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/2fa88eb6d221.png',
      },
      {
        name: 'Transfert Aéroport (van 7 places)',
        description:
          'Van spacieux pour familles et groupes — jusqu’à 7 passagers, 6 valises, sièges bébé sur demande.',
        unitPrice: 79.0,
        unit: 'trajet',
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/0f5ccd68741f.jpg',
      },
    ],
  },
  {
    key: 'chef',
    businessName: 'Chef à Domicile',
    category: 'chef',
    description:
      'Un chef cuisine sous vos yeux : menus saisonniers, dressage gastronomique, cuisine laissée impeccable.',
    location: 'Cuisine du bien',
    ratingAvg: 4.9,
    totalReviews: 78,
    offers: [
      {
        name: 'Dîner gastronomique 3 services',
        description:
          'Menu saisonnier par personne, dressage gastronomique à table, vaisselle et cuisine laissées impeccables.',
        unitPrice: 65.0,
        unit: 'personne',
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/8249b4514806.jpg',
      },
      {
        name: 'Option accord mets & vins',
        description:
          'Le sommelier du chef accorde 4 vins à votre dîner — service commenté à table.',
        unitPrice: 30.0,
        unit: 'personne',
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/cd5c4efe241a.jpg',
      },
    ],
  },
];

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------
const PROVIDER_EMAIL_DOMAIN = 'pro.conciergerie-hub.fr';

function providerEmail(key: string, propertySuffix: string): string {
  return `demo.${key}.${propertySuffix}@${PROVIDER_EMAIL_DOMAIN}`;
}

/**
 * Position du prestataire : à CÔTÉ du bien (offsets déterministes < 1 km).
 * L'API ne montre un prestataire que si haversine(bien, prestataire)
 * <= serviceRadiusKm → positionner les prestataires au cœur du rayon
 * garantit l'affichage immédiat dans le hub.
 */
function providerCoords(index: number, lat: number, lng: number) {
  const row = Math.floor(index / 4);
  const col = index % 4;
  return {
    latitude: Number((lat + row * 0.0013 - col * 0.0007).toFixed(6)),
    longitude: Number((lng + col * 0.0016 - row * 0.0009).toFixed(6)),
  };
}

async function main() {
  console.log('🌱 SEED DÉMO — Services Invités « App de livraison premium »');

  // ── 0. Nettoyage des prestataires de test « (E2E) » (réversible) ──
  const e2eProviders = await db.provider.findMany({
    where: { businessName: { contains: '(E2E)' } },
    select: { id: true },
  });
  if (e2eProviders.length > 0) {
    const disabledOffers = await db.serviceOffer.updateMany({
      where: { providerId: { in: e2eProviders.map((p) => p.id) } },
      data: { isActive: false },
    });
    await db.provider.updateMany({
      where: { id: { in: e2eProviders.map((p) => p.id) } },
      data: { isActive: false },
    });
    console.log(
      `🧹 ${e2eProviders.length} prestataire(s) de test « (E2E) » désactivé(s) (+${disabledOffers.count} offres masquées).`,
    );
  }

  // ── 1. Biens actifs à peupler ──
  const properties = await db.property.findMany({
    where: { isActive: true },
    select: { id: true, name: true, latitude: true, longitude: true },
    orderBy: { createdAt: 'asc' },
  });

  let createdProviders = 0;
  let updatedProviders = 0;
  let createdOffers = 0;
  let skipped = 0;

  for (const property of properties) {
    if (property.latitude == null || property.longitude == null) {
      console.warn(
        `⚠️  « ${property.name} » sans latitude/longitude → le hub n'affichera pas de services (géoloc requise). Ajoutez les coordonnées puis relancez le seed.`,
      );
      skipped++;
      continue;
    }

    const propertySuffix = property.id.slice(-6).toLowerCase();
    console.log(`\n🏠 Bien « ${property.name} » (${propertySuffix}) — ${DEMO_PROVIDERS.length} prestataires :`);

    for (let i = 0; i < DEMO_PROVIDERS.length; i++) {
      const dp = DEMO_PROVIDERS[i];
      const email = providerEmail(dp.key, propertySuffix);
      const coords = providerCoords(i, property.latitude, property.longitude);
      const minOffer = Math.min(...dp.offers.map((o) => o.unitPrice));

      // Compte fantôme (sans mot de passe — même pattern que le dashboard Superadmin)
      const user = await db.user.upsert({
        where: { email },
        update: {},
        create: { email, fullName: dp.businessName, role: 'user' },
      });

      // Upsert par User (userId unique) → idempotent.
      // BOOTSTRAP : si le prestataire existe déjà, on ne touche à RIEN
      // (les prix/désactivations éventuels de l'hôte restent intacts).
      const existing = await db.provider.findUnique({ where: { userId: user.id }, select: { id: true } });
      let provider = existing;
      if (!existing) {
        provider = await db.provider.create({
          data: {
            userId: user.id,
            businessName: dp.businessName,
            category: dp.category,
            description: dp.description,
            location: dp.location,
            ...coords,
            serviceRadiusKm: 50,
            audience: 'GUEST_EXPERIENCE',
            hourlyRate: minOffer,
            isVerified: true,
            isActive: true,
            ratingAvg: dp.ratingAvg,
            totalReviews: dp.totalReviews,
            responseTimeMinutes: 15,
            totalJobsCompleted: dp.totalReviews * 4,
          },
        });
        createdProviders++;
      } else if (!BOOTSTRAP) {
        provider = await db.provider.update({
          where: { userId: user.id },
          data: {
            businessName: dp.businessName,
            category: dp.category,
            description: dp.description,
            location: dp.location,
            latitude: coords.latitude,
            longitude: coords.longitude,
            serviceRadiusKm: 50,
            audience: 'GUEST_EXPERIENCE',
            hourlyRate: minOffer,
            isVerified: true,
            isActive: true,
            ratingAvg: dp.ratingAvg,
            totalReviews: dp.totalReviews,
            responseTimeMinutes: 15,
            totalJobsCompleted: dp.totalReviews * 4,
          },
        });
        updatedProviders++;
      }
      // BOOTSTRAP + prestataire existant : on ne recrée pas le prestataire,
      // mais on parcourt quand même ses offres (backfill photos v4.23).
      if (!provider) continue;

      // ── Catalogue fin du bien (ServiceOffer — prix = autorité serveur) ──
      for (let j = 0; j < dp.offers.length; j++) {
        const offer = dp.offers[j];
        const existingOffer = await db.serviceOffer.findUnique({
          where: { propertyId_providerId_name: { propertyId: property.id, providerId: provider.id, name: offer.name } },
          select: { id: true, imageUrl: true },
        });
        await db.serviceOffer.upsert({
          where: { propertyId_providerId_name: { propertyId: property.id, providerId: provider.id, name: offer.name } },
          // BOOTSTRAP : offre déjà présente → on ne réécrit PAS les prix
          // (modifications de l'hôte préservées) ; on se contente de
          // BACKFILLER la photo si elle est absente (v4.23 « hub réel »).
          update: BOOTSTRAP
            ? existingOffer?.imageUrl
              ? {}
              : { imageUrl: offer.imageUrl }
            : {
                description: offer.description,
                unitPrice: offer.unitPrice,
                unit: offer.unit,
                isActive: true,
                sortOrder: j,
                imageUrl: offer.imageUrl,
              },
          create: {
            propertyId: property.id,
            providerId: provider.id,
            name: offer.name,
            description: offer.description,
            unitPrice: offer.unitPrice,
            unit: offer.unit,
            sortOrder: j,
            imageUrl: offer.imageUrl,
          },
        });
        if (!existingOffer) createdOffers++;
      }

      console.log(
        `   ✅ ${dp.businessName} — ${dp.offers.length} offre(s) (${dp.offers
          .map((o) => o.unitPrice.toFixed(2).replace('.', ',') + ' €')
          .join(' · ')})`,
      );
    }
  }

  // ── 2. v4.25 « ARRIVÉE PAS À PAS » — photos réelles du guide visuel ──
  const patchedGuides = await backfillVisualGuidePhotos();

  // ── 3. v4.98 « BRIEFING COACH ACTIF PAR DÉFAUT » ──────────────────────
  // Le Coach affiche « rapport quotidien 07:00 » par défaut, mais le cron
  // /api/admin/trigger-coach-reports ne sert que les lignes CoachPreferences
  // RÉELLES (reportFrequency daily/weekly). Les comptes existants n'ayant
  // jamais cliqué « Enregistrer » n'avaient donc AUCUNE ligne → briefing
  // jamais envoyé (processed: 0). On crée la ligne manquante (idempotent,
  // create-only : une config existante n'est JAMAIS réécrite) pour tout
  // utilisateur possédant au moins un bien. Les comptes sans bien sont
  // ignorés (le runner les saute de toute façon — « aucun_bien »).
  let seededCoachPrefs = 0;
  const owners = await db.property.findMany({
    where: { isActive: true },
    select: { ownerId: true },
    distinct: ['ownerId'],
  });
  for (const { ownerId } of owners) {
    const existing = await db.coachPreferences.findUnique({ where: { userId: ownerId } });
    if (existing) continue;
    await db.coachPreferences.create({
      data: {
        userId: ownerId,
        enableCriticalPush: true,
        enableCriticalEmail: true,
        enableCriticalSMS: false,
        enableRevenueEmail: true,
        enableRevenuePush: false,
        enableQualityEmail: true,
        enableQualityDashboard: true,
        enableEducational: true,
        reportFrequency: 'daily',
        reportTime: '07:00',
        enabledInsightTypes: JSON.stringify([
          'STOCK',
          'REVENUE',
          'REVIEW',
          'UPSELL',
          'OPERATION',
          'QUALITY',
          'BEHAVIOR',
        ]),
      },
    });
    seededCoachPrefs++;
  }
  if (seededCoachPrefs > 0) {
    console.log(`📧 Briefing Coach : ${seededCoachPrefs} compte(s) activé(s) par défaut (quotidien 07:00).`);
  }

  console.log('\n📊 Résumé :');
  console.log(`   Mode : ${BOOTSTRAP ? 'BOOTSTRAP (create-only — existant préservé)' : 'COMPLET (upsert)'}`);
  console.log(`   Prestataires : ${createdProviders} créé(s), ${updatedProviders} mis à jour`);
  console.log(`   Offres : ${createdOffers} créée(s)`);
  console.log(`   Biens ignorés (géoloc manquante) : ${skipped}`);
  console.log(`   Guides visuels enrichis (photos d'arrivée) : ${patchedGuides}`);
  console.log(`   Briefings Coach activés (comptes sans config) : ${seededCoachPrefs}`);
  console.log('✨ Seed terminé.');
}

main()
  .catch((e) => {
    console.error('❌ Seed échoué :', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
