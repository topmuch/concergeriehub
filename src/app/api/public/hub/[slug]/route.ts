import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import {
  parseShopItems,
  DEFAULT_SHOP_ITEMS,
  parseMinibar,
  DEFAULT_MINIBAR_ITEMS,
  parseAccessCodes,
  parseAppliances,
  parseEmergencyInfo,
  parseLocalSpots,
  parsePremiumFeatures,
  parseSurvivalKit,
  parseVisualGuide,
  parseVoiceTriggers,
} from '@/lib/concierge';
import { haversineKm, providerCategoryMeta, formatEur, propertyTypeMeta } from '@/lib/b2b';
import { rateLimit } from '@/lib/rate-limit';
// FIX-14 — monitoring d'erreurs : trace AuditLog (action='runtime.error').
import { captureError } from '@/lib/error-monitor';
// FIX-15 (B) — clientIp pour le rate-limit PIN IP-scopé (anti-lockout).
import { clientIp } from '@/lib/audit';
// v4.31 « PHOTOS DE MON HUB » — parse tolérant des photos perso de l'hôte.
import { parseHubPhotos } from '@/lib/hub-photos';
import { getUniversalContent, DEFAULT_UNIVERSAL_GUIDEBOOK } from '@/lib/universal-content';
// v4.50 « VERROUILLAGE DU HUB PAR CODE » + « MINIBAR DE CONFIANCE ».
import { bookingStayEnd, parseHubLock } from '@/lib/hub-access';
// WP-BACK v4.61 — VOIX PLATEFORME : disponibilité repli des voix par
// défaut du Superadmin (bien > plateforme) dans le payload voiceMessages.
import { getPlatformVoiceStore } from '@/lib/platform-voices';

// =============================================================
// Hub public RoomScan — /hub/[slug]
// GET  : payload de l'écran d'accueil + données Mode Invité.
//        Le slug est le hubSlug de la PLAQUE QR (PhysicalQrCode).
// POST : vérification du PIN Mode Hôte (bcrypt sur property.pinHash)
//
// Sécurité : la GET n'expose QUE les données invité (Wi-Fi, codes
// d'accès, bonnes adresses, guide visuel, SOS, services, contact) —
// les mêmes modules que la PWA invitée. Les données hôte (QRs privés,
// prestataires, messages) sont servies par /host après vérification
// du PIN.
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

interface GuestServiceOffer {
  id: string;
  name: string;
  description: string | null;
  unitPrice: number;
  unit: string;
}

interface GuestServiceOffer {
  id: string;
  name: string;
  description: string | null;
  unitPrice: number;
  unit: string;
  /** v4.23 « hub réel » — photo réelle de l'offre. */
  imageUrl?: string | null;
}

// REFONTE SERVICES PREMIUM (V4.14) — parité totale avec la PWA :
// le hub QR sert le même catalogue fin (offers[]) + unitPrice que
// /api/public/guest-app → expérience de commande identique.
interface GuestService {
  id: string;
  name: string;
  emoji: string;
  categoryLabel: string;
  description: string;
  priceLabel: string;
  unitPrice: number | null;
  /** Démonstration sociale — note moyenne et avis du prestataire. */
  ratingAvg: number;
  totalReviews: number;
  /** v4.23 « hub réel » — photo de couverture (1re offre photographiée). */
  imageUrl?: string | null;
  offers: GuestServiceOffer[];
  // v4.69 — PHASE 2 · « Mon prestataire » (HostProvider) fusionné :
  // custom=true permet au hub de badger « Recommandé par votre hôte »,
  // hostNote = note libre saisie par l'hôte (description du modèle).
  custom?: boolean;
  hostNote?: string | null;
}

const DEMO_PAYLOAD = {
  active: true,
  property: {
    id: 'demo-home-001',
    name: 'Le Petit Nid',
    propertyType: 'AIRBNB',
    propertyTypeLabel: 'Airbnb',
    propertyTypeEmoji: '🏠',
    address: '12 Rue de la Paix, 75002 Paris',
    // v4.49 — coordonnées démo (Paris, Opéra) : activent le widget météo
    // et le bouton flottant « Retour à la maison » dans la vitrine.
    latitude: 48.8686,
    longitude: 2.3366,
    hasPin: true,
  },
  ownerName: 'Marie Dupont',
  // v4.33 — compte à rebours check-out (jour du départ) : démo hors J.
  // v4.49 — prénom démo pour la salutation personnalisée « Bonjour Marie 👋 ».
  // v4.50 — checkIn/endAt/lateCheckOutUntil (onglet Séjour + verrouillage).
  stay: {
    isCheckoutDay: false,
    checkOut: null,
    isStayOver: false,
    guestName: 'Marie',
    checkIn: null,
    endAt: null,
    lateCheckOutUntil: null,
    // v4.52 « MIDDLE-STAY CARE » — démo : séjour long (9 nuits) → carte visible.
    nights: 9,
  } as {
    isCheckoutDay: boolean;
    checkOut: string | null;
    isStayOver: boolean;
    guestName?: string | null;
    checkIn?: string | null;
    endAt?: string | null;
    lateCheckOutUntil?: string | null;
    nights?: number | null;
  },
  // v4.50 — verrouillage du hub par code : DÉSACTIVÉ en démo (le hub
  // vitrine reste ouvert pour la visite guidée).
  guest: {
    shopItems: DEFAULT_SHOP_ITEMS,
    wifi: { networkName: 'LePetitNid_5G', password: 'Demo2025!', securityType: 'WPA2' },
    guidebookSlug: null as string | null,
    // v4.47 — hub de démo : guidebook universel affiché (pas de QR 'home_manual').
    universalGuidebook: {
      title: DEFAULT_UNIVERSAL_GUIDEBOOK.title,
      sections: DEFAULT_UNIVERSAL_GUIDEBOOK.sections,
    } as { title: string; sections: string[] } | null,
    appliancesUniversal: false as boolean,
    accessCodes: {
      building: 'B1234#', safe: '0000', parking: 'Place 7 - sous-sol',
      note: 'Le code du portail change chaque saison — voyez la note de bienvenue.',
    },
    localSpots: [
      { id: 'spot-1', name: 'Chez Alfonso', category: 'food', lat: 48.8622, lng: 2.3315, address: '4 Rue Saint-Roch, 75001 Paris', hostNote: 'Meilleure pasta du quartier — réservez, c’est petit !' },
      { id: 'spot-2', name: 'Marché Saint-Honoré', category: 'groceries', lat: 48.8672, lng: 2.3275 },
    ] as { id: string; name: string; category: string; lat: number; lng: number; address?: string; hostNote?: string }[],
    visualGuide: [],
    emergency: { police: '17', hospital: 'Hôpital Européen Georges-Pompidou', pharmacy: 'Pharmacie Britannique — 10 place Edmond Rostand', pharmacyPhone: '+33 1 44 41 97 60', hostPhone: '+33 6 12 34 56 78', commonIssues: [] },
    // REFONTE SERVICES PREMIUM (V4.14) — même vitrine riche que la PWA
    // (6 prestataires, 9 formules) pour démontrer l'expérience complète.
    services: [
      {
        id: 'demo-svc-1',
        name: 'Morning Box Paris',
        emoji: '🥐',
        categoryLabel: 'Petit-déjeuner',
        description: 'Petit-déjeuner gourmand livré avant 8 h : viennoiseries artisanales, jus pressés.',
        priceLabel: 'dès 12,00 €',
        unitPrice: null,
        ratingAvg: 4.9,
        totalReviews: 124,
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/8a94b10bd483.jpg',
        offers: [
          { id: 'demo-off-1', name: 'Box Solo', description: 'Croissant, pain au chocolat, jus d’orange pressé, café.', unitPrice: 12, unit: 'box' },
          { id: 'demo-off-2', name: 'Box Duo', description: 'Le petit-déjeuner complet pour deux — viennoiseries x4, jus, fruits.', unitPrice: 22, unit: 'box' },
        ],
      },
      {
        id: 'demo-svc-2',
        name: 'Champagne & Célébration',
        emoji: '🍾',
        categoryLabel: 'Sommelier',
        description: 'Champagne refroidi, fleurs et gourmandises pour marquer l’événement — livré en 1 h.',
        priceLabel: 'dès 45,00 €',
        unitPrice: null,
        ratingAvg: 4.8,
        totalReviews: 87,
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/6297beaa2cfd.jpg',
        offers: [
          { id: 'demo-off-3', name: 'Champagne Brut Premier Cru', description: 'Bouteille 75 cl + 2 flûtes offertes.', unitPrice: 45, unit: 'bouteille' },
          { id: 'demo-off-4', name: 'Pack Célébration', description: 'Champagne, 6 macarons, bouquet de saison.', unitPrice: 79, unit: 'pack' },
        ],
      },
      {
        id: 'demo-svc-3',
        name: 'Pressing Express',
        emoji: '🧺',
        categoryLabel: 'Pressing',
        description: 'Retour en 24 h, rendu sur cintre. Le linge quotidien devient un détail.',
        priceLabel: 'dès 10,00 €',
        unitPrice: null,
        ratingAvg: 4.7,
        totalReviews: 63,
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/9e8961469d57.jpg',
        offers: [
          { id: 'demo-off-5', name: 'Pièce à l’unité', description: 'Chemise, pantalon ou robe — rendu sur cintre.', unitPrice: 10, unit: 'pièce' },
          { id: 'demo-off-6', name: 'Sac de 5 kg', description: 'Linge quotidien lavé, séché, plié.', unitPrice: 35, unit: 'sac' },
        ],
      },
      {
        id: 'demo-svc-4',
        name: 'Chef à domicile',
        emoji: '👨‍🍳',
        categoryLabel: 'Chef à domicile',
        description: 'Menu signature en 4 services préparé chez vous, dressage inclus.',
        priceLabel: 'Sur devis',
        unitPrice: null,
        ratingAvg: 4.9,
        totalReviews: 78,
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/cc26eb1a5a45.jpeg',
        offers: [],
      },
      {
        id: 'demo-svc-5',
        name: 'Transfert Aéroport',
        emoji: '🚐',
        categoryLabel: 'Transferts',
        description: 'Chauffeur privé, suivi de vol, attente incluse. Portes à portes sans stress.',
        priceLabel: 'dès 65,00 €',
        unitPrice: null,
        ratingAvg: 4.9,
        totalReviews: 141,
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/2fa88eb6d221.png',
        offers: [
          { id: 'demo-off-7', name: 'CDG ⇄ Paris (berline)', description: 'Jusqu’à 3 passagers, 2 valises.', unitPrice: 65, unit: 'trajet' },
          { id: 'demo-off-8', name: 'CDG ⇄ Paris (van)', description: 'Jusqu’à 7 passagers, 6 valises.', unitPrice: 89, unit: 'trajet' },
        ],
      },
      {
        id: 'demo-svc-6',
        name: 'Massage bien-être',
        emoji: '💆',
        categoryLabel: 'Bien-être',
        description: 'Praticien certifié, table installée dans votre salon. Réservation sous 2 h.',
        priceLabel: 'dès 90,00 €',
        unitPrice: null,
        ratingAvg: 4.8,
        totalReviews: 112,
        imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/98e534226be6.jpeg',
        offers: [
          { id: 'demo-off-9', name: 'Massage relaxant 60 min', description: 'Dos, nuque, jambes — huiles bio.', unitPrice: 90, unit: 'séance' },
        ],
      },
    ] as GuestService[],
    contact: { name: 'Marie Dupont', phone: '+33 6 12 34 56 78', email: 'marie@roomscan.pro' },
    // FIX DASHBOARD→HUB — parité complète : modules premium servis
    // comme en PWA (guide appareils, vidéo, upselling, kit de survie).
    appliances: [
      {
        id: 'demo-app-1',
        name: 'Machine à laver',
        emoji: '🧺',
        instructions:
          'Programme express : tournez le bouton sur « 30 min », ajoutez la lessive dans le bac gauche et appuyez sur Départ.',
      },
      {
        id: 'demo-app-2',
        name: 'Machine à café',
        emoji: '☕',
        instructions: 'Capsules dans le tiroir du haut, appuyez sur le bouton ovale. Le premier café chauffe 40 s.',
      },
    ],
    premiumFeatures: {
      videoWelcomeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      enableLateCheckout: true,
      lateCheckoutPrice: 25,
      lateCheckoutHour: 15,
      enableReviewShield: true,
      enableMinibar: true,
      // v4.35 « RÉSERVATION DIRECTE » — visible dans le hub de démo.
      directBookingDiscount: 15,
    },
    // v4.44 « MINIBAR NUMÉRIQUE » — vitrine de démonstration.
    // v4.50 « PACK DE BIENVENUE » — l'eau est OFFERTE (badge 🎁).
    minibarItems: DEFAULT_MINIBAR_ITEMS.map((it) =>
      it.id === 'mb-water' ? { ...it, free: true } : it,
    ),
    // v4.50 « MINIBAR DE CONFIANCE » — vitrine démo (inventaire à valider).
    minibarExtra: {
      arrivalPhoto: null as string | null,
      checkedAt: null as string | null,
      consumed: [] as { name: string; emoji: string; qty: number; lineTotal: number; free: boolean }[],
      totalOpenEur: 0,
      totalPaidEur: 0,
      restockPending: false,
    },
    // v4.52 « LIVRE D'OR VIVANT » — vitrine démo (37 souvenirs, 4.9/5).
    memoriesSummary: { total: 37, avg: 4.9, hasPending: false },
    survivalKitItems: [
      { id: 'demo-kit-1', name: 'Trousse de secours', location: 'Meuble bas de la cuisine' },
      { id: 'demo-kit-2', name: 'Parapluie', location: 'Portemanteau de l’entrée' },
      { id: 'demo-kit-3', name: 'Piles de rechange (AA/AAA)', location: 'Tiroir du salon' },
    ],
  },
};

function parseContent(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// GET: Public hub info — QR actif ? + écran d'accueil + Mode Invité
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug || slug.length < 2) {
      return NextResponse.json(
        { error: 'not_found', message: 'Adresse du hub invalide.' },
        { status: 400 }
      );
    }

    // ── DEMO MODE ──
    if (isDemo(slug)) {
      return NextResponse.json(DEMO_PAYLOAD);
    }

    // ── 1a. La plaque (QR physique) derrière ce slug — flux V1 ──
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      include: { claimedBy: { select: { id: true, fullName: true } } },
    });

    if (!plaque) {
      // ── 1b. ÉTAPE 12 : fallback Hub QR du BIEN (Property.qrHubSlug) ──
      const propertyBySlug = await db.property.findUnique({
        where: { qrHubSlug: slug },
        select: { id: true, isActive: true },
      });
      if (!propertyBySlug) {
        return NextResponse.json(
          {
            error: 'not_found',
            message: 'Ce hub est introuvable ou la plaque n’a pas encore été activée par son hôte.',
          },
          { status: 404 }
        );
      }
      if (!propertyBySlug.isActive) {
        return NextResponse.json(
          {
            error: 'inactive',
            message: 'Ce bien a été désactivé par son hôte.',
          },
          { status: 410 }
        );
      }
      const payload = await buildPropertyPayload(propertyBySlug.id, null);
      if (!payload) {
        return NextResponse.json(
          { error: 'not_found', message: 'Le logement lié à ce hub est introuvable.' },
          { status: 404 }
        );
      }
      return NextResponse.json(payload);
    }

    if (!plaque.isClaimed || !plaque.propertyId) {
      return NextResponse.json(
        {
          error: 'not_found',
          message: 'Ce hub est introuvable ou la plaque n’a pas encore été activée par son hôte.',
        },
        { status: 404 }
      );
    }

    // ── 2. Le QR est-il actif ? ──
    if (plaque.status !== 'active') {
      return NextResponse.json(
        {
          error: 'inactive',
          message:
            plaque.status === 'lost'
              ? 'Cette plaque a été signalée perdue par son hôte.'
              : 'Cette plaque QR a été désactivée par son hôte.',
        },
        { status: 410 }
      );
    }

    const payload = await buildPropertyPayload(
      plaque.propertyId,
      plaque.claimedBy?.fullName ?? null,
    );
    if (!payload) {
      return NextResponse.json(
        { error: 'not_found', message: 'Le logement lié à cette plaque est introuvable.' },
        { status: 404 }
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    // FIX-14 — captureError console.error + trace AuditLog, ne jette jamais.
    await captureError('hub.get', error, undefined, req);
    return NextResponse.json(
      { error: 'server', message: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 }
    );
  }
}

/**
 * Construit le payload invité d'un bien (Wi-Fi, guidebook,
 * services géolocalisés, contact). ÉTAPE 12 : partagé entre le
 * flux PLAQUE (V1) et le flux HUB DU BIEN (Property.qrHubSlug).
 */
async function buildPropertyPayload(
  propertyId: string,
  claimedByName: string | null,
) {
  // ── Le bien + son propriétaire ──
  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      name: true,
      propertyType: true,
      address: true,
      latitude: true,
      longitude: true,
      isActive: true,
      pinHash: true,
      // AUDIT PRÉ-PROD — l'email de contact invité vient du SOS (hostEmail)
      emergencyInfo: true,
      // BUG DASHBOARD→HUB — modules invités remplis depuis /airbnb/concierge
      // (Coffre-fort, SOS, bonnes adresses, GUIDE DES APPAREILS) et
      // l'Expérience Invité (guide visuel, vidéo bienvenue, late check-out,
      // bouclier d'avis, kit de survie) : ils doivent apparaître dans le
      // hub QR, comme en PWA.
      accessCodes: true,
      localSpots: true,
      visualGuide: true,
      appliances: true,
      premiumFeatures: true,
      survivalKitItems: true,
      // v4.31 — photos perso de l'hôte (cartes pleine carte + hero).
      hubPhotos: true,
      // v4.32 « Prestataires autour » — ids désactivés par l'hôte
      // (exclus des services invités ci-dessous).
      disabledProviders: true,
      owner: {
        select: {
          fullName: true,
          profile: { select: { phone: true } },
        },
      },
    },
  });

  if (!property || !property.isActive) return null;

  // ── v4.31 « POUR VOUS » — moment du séjour (SANS données personnelles) ──
  // On déduit uniquement un enum grossier à partir des réservations
  // EN COURS (jour d'arrivée / milieu de séjour / veille du départ).
  // Rien du booking (nom, email…) ne quitte le serveur.
  // Priorité si plusieurs séjours se chevauchent : arrivée > départ > milieu.
  const now = new Date();
  // v4.33 — on inclut AUSSI les séjours qui se terminent AUJOURD'HUI
  // (checkOut >= début du jour UTC) : sans ce prolongement, dès que
  // l'heure de check-out passe (ex. 11 h), le booking n'est plus
  // « couvrant » et le compte à rebours/clignotement disparaissent
  // alors que le compte à rebours est justement crucial après 11 h
  // (prolongation jusqu'à 14 h). Les séjours d'avant-hier restent exclus.
  const startOfTodayUtc = new Date(now.getTime() - (now.getTime() % 86_400_000));
  const coveringStays = await db.booking.findMany({
    where: {
      propertyId: property.id,
      checkIn: { lte: now },
      checkOut: { gte: startOfTodayUtc },
      status: { notIn: ['CANCELLED'] },
    },
    orderBy: { checkIn: 'asc' },
    take: 20,
    select: { id: true, checkIn: true, checkOut: true, guestName: true, lateCheckOutUntil: true },
  });
  let stayMoment: 'arrival' | 'midstay' | 'departure' | null = null;
  // v4.33 « COMPTE À REBOURS CHECK-OUT » — jour du départ (J uniquement,
  // la veille reste gérée par stayMoment='departure'). On expose la date
  // de fin du séjour EN COURS (neutre : l'heure de départ est publique).
  let isCheckoutDay = false;
  let stayCheckOut: string | null = null;
  // v4.46 « RÉINITIALISATION FIN DE SÉJOUR » (demande client : « dès que
  // le séjour est fini il faut que le système se réinitialise ») — quand
  // AUCUN séjour ne couvre aujourd'hui mais qu'un séjour PASSÉ existe,
  // le hub bascule en état neutre : bandeaux « Réservation directe »,
  // « Départ définitif », compte à rebours et modules de départ
  // disparaissent (côté client via stay.isStayOver).
  let isStayOver = false;
  // v4.49 « PERSONNALISATION INVITÉ » — prénom de l'invité en cours
  // (issu du calendrier/iCal Airbnb) pour saluer « Bonjour Marie 👋 »
  // en tête du hub. Neutre : PREMIER prénom uniquement, jamais l'email.
  let guestFirstName: string | null = null;
  // v4.50 « ONGLET CHECK-IN/CHECK-OUT + VERROUILLAGE » — données du
  // séjour courant exposées à l'invité (dates, heure de départ exacte,
  // prolongation validée). Le CODE d'accès n'est JAMAIS exposé ici.
  let stayCheckIn: string | null = null;
  let stayEndAt: string | null = null;
  let stayLateUntil: string | null = null;
  let stayBookingId: string | null = null;
  // v4.52 « MIDDLE-STAY CARE » — durée du séjour courant en nuits
  // (≥ 7 nuits = séjour long → la carte Middle-Stay s'affiche).
  let stayNights: number | null = null;
  // v4.53 « PRÊT POUR L'ARRIVÉE » — le ménage a été validé AVANT
  // l'arrivée du voyageur (Booking.readyNotificationSentAt, ≤ 72 h
  // avant le check-in) → bannière verte dans le Hub. null = rien.
  let readyForArrival: { sentAt: string; checkIn: string } | null = null;
  if (coveringStays.length === 0) {
    const pastStay = await db.booking.findFirst({
      where: {
        propertyId: property.id,
        checkOut: { lt: startOfTodayUtc },
        status: { notIn: ['CANCELLED'] },
      },
      select: { id: true },
    });
    isStayOver = pastStay !== null;
  }
  // v4.109 « ANIMATION PRÉ-ARRIVÉE » — date/heure du PROCHAIN séjour
  // à venir (aucune donnée personnelle : le check-in seul). Le hub
  // verrouillé s'en sert pour afficher l'animation d'accueil avec
  // compte à rebours au lieu du pavé, jusqu'à HUB_ACCESS_WINDOW_HOURS
  // avant l'arrivée (même seuil que la validation serveur du code).
  let nextArrival: string | null = null;
  try {
    const upcoming = await db.booking.findFirst({
      where: {
        propertyId: property.id,
        status: { notIn: ['CANCELLED'] },
        checkIn: { gt: now },
      },
      orderBy: { checkIn: 'asc' },
      select: { checkIn: true },
    });
    nextArrival = upcoming?.checkIn.toISOString() ?? null;
  } catch {
    // Dégradation gracieuse : sans prochaine arrivée, le pavé s'affiche
    // (comportement historique).
  }
  // v4.53 « PRÊT POUR L'ARRIVÉE » — on cherche le séjour à venir (ou
  // courant) notifié : ménage validé avant son arrivée, fenêtre ≤ 72 h
  // après le check-in passé (au-delà, la bannière n'a plus de sens).
  try {
    const readyBooking = await db.booking.findFirst({
      where: {
        propertyId: property.id,
        status: { notIn: ['CANCELLED'] },
        readyNotificationSentAt: { not: null },
        checkIn: { lte: new Date(now.getTime() + 72 * 60 * 60 * 1000) },
        checkOut: { gte: startOfTodayUtc },
      },
      orderBy: { checkIn: 'asc' },
      select: { readyNotificationSentAt: true, checkIn: true },
    });
    if (readyBooking?.readyNotificationSentAt) {
      readyForArrival = {
        sentAt: readyBooking.readyNotificationSentAt.toISOString(),
        checkIn: readyBooking.checkIn.toISOString(),
      };
    }
  } catch {
    // Dégradation gracieuse : sans bannière, le hub reste normal.
  }
  if (coveringStays.length > 0) {
    const DAY = 86_400_000;
    // v4.49 — séjour courant = celui qui a commencé EN DERNIER (le plus
    // récent couvrant aujourd'hui = l'invité présent, pas un chevauchement).
    // v5.7 — mais un séjour DÉJÀ TERMINÉ aujourd'hui (jour de turnover :
    // checkOut ≥ début du jour pour la grâce du compte à rebours) ne doit
    // JAMAIS masquer un séjour encore ACTIF (fin effective future) — sinon
    // stay.endAt est dans le passé et l'écran compte à rebours/verrouillage
    // se comporte comme expiré pour l'invité suivant.
    const activeNow = coveringStays.filter((s) => bookingStayEnd(s) > now);
    const pool = activeNow.length > 0 ? activeNow : coveringStays;
    const currentStay = pool.reduce(
      (acc, s) => (s.checkIn > acc.checkIn ? s : acc),
      pool[0],
    );
    guestFirstName = (currentStay.guestName ?? '').trim().split(/\s+/)[0]?.slice(0, 40) || null;
    // v4.50 — infos du séjour courant pour l'onglet Check-in/Check-out.
    stayBookingId = currentStay.id;
    stayCheckIn = currentStay.checkIn.toISOString();
    const stayEnd = bookingStayEnd(currentStay);
    stayEndAt = stayEnd.toISOString();
    // v4.52 — nuits du séjour courant (arrondi sup, min 1).
    stayNights = Math.max(
      1,
      Math.ceil((stayEnd.getTime() - currentStay.checkIn.getTime()) / 86_400_000),
    );
    stayLateUntil = currentStay.lateCheckOutUntil
      ? currentStay.lateCheckOutUntil.toISOString()
      : null;
    const dayIdx = (d: Date) => Math.floor(d.getTime() / DAY); // index jour UTC
    const today = dayIdx(now);
    const isArrival = coveringStays.some((s) => dayIdx(s.checkIn) >= today);
    const isDeparture = coveringStays.some((s) => dayIdx(s.checkOut) - today <= 1);
    stayMoment = isArrival ? 'arrival' : isDeparture ? 'departure' : 'midstay';
    // v4.33 — jour du départ = AU MOINS UN séjour couvrant finit aujourd'hui
    // (le séjour de l'invité qui scanne finit aujourd'hui dans ce cas).
    isCheckoutDay = coveringStays.some((s) => dayIdx(s.checkOut) === today);
    const outToday = coveringStays.find((s) => dayIdx(s.checkOut) === today);
    const latestOut = coveringStays.reduce(
      (acc, s) => (s.checkOut > acc ? s.checkOut : acc),
      coveringStays[0].checkOut,
    );
    stayCheckOut = (outToday ? outToday.checkOut : latestOut).toISOString();
  }

  // ── QRs actifs publics → Wi-Fi + Guidebook ──
  const activeQrs = await db.qrCode.findMany({
    where: { propertyId: property.id, isActive: true, isPrivate: false },
    orderBy: { createdAt: 'asc' },
    include: { content: { select: { contentJson: true } } },
  });

  const wifiQr = activeQrs.find((qr) => qr.type === 'wifi');
  const guidebookQr = activeQrs.find((qr) => qr.type === 'home_manual' && qr.publicSlug);
  const wifiContent = wifiQr ? parseContent(wifiQr.content?.contentJson) : {};

  const wifi =
    wifiQr && (wifiContent.network_name || wifiContent.password)
      ? {
          networkName: (wifiContent.network_name as string) || 'Wi-Fi du logement',
          password: (wifiContent.password as string) || '',
          securityType: (wifiContent.security_type as string) || 'WPA2',
        }
      : null;

  // ── Services invité = prestataires GUEST_EXPERIENCE dans le rayon ──
  // REFONTE SERVICES PREMIUM (V4.14) — parité PWA : pré-filtre SQL
  // bounding box (200 km) + catalogue fin ServiceOffer par bien.
  // v4.44 « MINIBAR NUMÉRIQUE » — parse unique (activé + catalogue).
  const minibar = parseMinibar(property.premiumFeatures);
  const minibarItems = minibar.enabled ? minibar.items : [];
  // v4.47 « CONTENU UNIVERSEL POUR TOUTES LES MAISONS » — si l'hôte n'a
  // pas encore rempli un module, la plateforme fournit le contenu de
  // référence (guidebook universel + pack d'appareils universel) pour
  // que le guide apparaisse pour tout le monde. 1 seul fetch par payload.
  const universal = await getUniversalContent();
  const appliancesParsed = parseAppliances(property.appliances);
  const appliancesUniversal = appliancesParsed.length === 0;
  const services: GuestService[] = [];
  if (property.latitude != null && property.longitude != null) {
    const RADIUS_MAX_KM = 200;
    const geoProviders = await db.provider.findMany({
      where: {
        isActive: true,
        audience: 'GUEST_EXPERIENCE',
        latitude: { gte: property.latitude - RADIUS_MAX_KM / 111, lte: property.latitude + RADIUS_MAX_KM / 111 },
        longitude: { gte: property.longitude - RADIUS_MAX_KM / 74, lte: property.longitude + RADIUS_MAX_KM / 74 },
      },
      take: 200,
    });
    const inRadius = geoProviders.filter((p) => {
      if (p.latitude == null || p.longitude == null) return false;
      const d = haversineKm(property.latitude!, property.longitude!, p.latitude, p.longitude);
      return d <= p.serviceRadiusKm;
    });

    // v4.32 « Prestataires autour » — l'hôte peut désactiver chaque
    // prestataire pour son bien (toggle en Mode Hôte) : exclus des
    // services invités, il ne remonte jamais au hub public.
    const disabledProviderIds = Array.isArray(property.disabledProviders)
      ? (property.disabledProviders as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    const visibleProviders =
      disabledProviderIds.length > 0
        ? inRadius.filter((p) => !disabledProviderIds.includes(p.id))
        : inRadius;

    const offersByProvider = new Map<string, GuestServiceOffer[]>();
    if (visibleProviders.length > 0) {
      const offers = await db.serviceOffer.findMany({
        where: {
          propertyId: property.id,
          providerId: { in: visibleProviders.map((p) => p.id) },
          isActive: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { unitPrice: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          providerId: true,
          name: true,
          description: true,
          unitPrice: true,
          unit: true,
          imageUrl: true,
        },
      });
      for (const o of offers) {
        const list = offersByProvider.get(o.providerId) ?? [];
        list.push({
          id: o.id,
          name: o.name,
          description: o.description,
          unitPrice: o.unitPrice,
          unit: o.unit,
          imageUrl: o.imageUrl,
        });
        offersByProvider.set(o.providerId, list);
      }
    }

    for (const p of visibleProviders) {
      const offers = offersByProvider.get(p.id) ?? [];
      const minOffer = offers.length > 0 ? offers[0].unitPrice : null;
      const priceLabel =
        minOffer != null
          ? `dès ${formatEur(minOffer)}`
          : p.hourlyRate != null
            ? `dès ${formatEur(p.hourlyRate)}`
            : 'Sur devis';
      const cat = providerCategoryMeta(p.category);
      services.push({
        id: p.id,
        name: p.businessName,
        emoji: cat.emoji,
        categoryLabel: cat.label,
        description: p.description ?? 'Service proposé par un partenaire local vérifié.',
        priceLabel,
        unitPrice: p.hourlyRate ?? null,
        ratingAvg: p.ratingAvg,
        totalReviews: p.totalReviews,
        // v4.23 « hub réel » — la 1re offre photographiée devient la couverture.
        imageUrl: offers.find((o) => o.imageUrl)?.imageUrl ?? null,
        offers,
      });
    }
    services.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── v4.69 — PHASE 2 · « MON PRESTATAIRE » (HostProvider) ──
  // Prestataires ajoutés manuellement par l'hôte pour CE bien :
  // audience GUEST_EXPERIENCE + isActive (sinon masqués, même
  // sémantique que le toggle des prestataires annuaire) sont FUSIONNÉS
  // dans la liste services exposée à l'invité, sur EXACTEMENT la même
  // forme que les prestataires annuaire (champs identiques + flag
  // custom:true + note hôte). Pas de dépendance géoloc : ils sont
  // rattachés au bien, la fusion a donc lieu MÊME sans latitude/longitude.
  try {
    const hostProviders = await db.hostProvider.findMany({
      where: {
        propertyId: property.id,
        isActive: true,
        audience: 'GUEST_EXPERIENCE',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        name: true,
        emoji: true,
        category: true,
        description: true,
      },
    });
    for (const hp of hostProviders) {
      services.push({
        id: hp.id,
        name: hp.name,
        emoji: hp.emoji || '🔧',
        categoryLabel: hp.category || 'Autre',
        description:
          hp.description?.trim() || 'Prestataire recommandé par votre hôte.',
        priceLabel: 'Sur devis',
        unitPrice: null,
        ratingAvg: 0,
        totalReviews: 0,
        imageUrl: null,
        offers: [],
        custom: true,
        hostNote: hp.description?.trim() || null,
      });
    }
    if (hostProviders.length > 0) services.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    // Dégradation gracieuse : sans prestataires perso, le hub reste
    // servi avec les prestataires annuaire seuls.
  }

  // v4.50 « MINIBAR DE CONFIANCE » — état du minibar pour le séjour
  // courant : validation d'inventaire, produits consommés (commandes
  // persistées), totaux à régler/payés, recharge demandée. ──
  const minibarExtra = await (async () => {
    const empty = {
      arrivalPhoto: minibar.arrivalPhoto ?? null,
      checkedAt: null as string | null,
      consumed: [] as { name: string; emoji: string; qty: number; lineTotal: number; free: boolean }[],
      totalOpenEur: 0,
      totalPaidEur: 0,
      restockPending: false,
    };
    try {
      if (!minibar.enabled) return empty;
      const stayFrom = stayCheckIn ? new Date(stayCheckIn) : null;
      // Rattachement : commandes liées au séjour courant, PLUS les
      // commandes sans session (hub non verrouillé) passées pendant la
      // fenêtre du séjour.
      const orders = await db.minibarOrder.findMany({
        where: {
          propertyId: property.id,
          createdAt: stayFrom ? { gte: stayFrom } : undefined,
          OR: stayBookingId
            ? [{ bookingId: stayBookingId }, { bookingId: null }]
            : [{ bookingId: null }],
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: { itemsJson: true, totalEur: true, payment: true, status: true },
      });
      const agg = new Map<string, { name: string; emoji: string; qty: number; lineTotal: number; free: boolean }>();
      let totalOpen = 0;
      let totalPaid = 0;
      for (const o of orders) {
        let lines: { id: string; name: string; emoji: string; qty: number; lineTotal: number; free: boolean }[] = [];
        try {
          const parsedJson: unknown = JSON.parse(o.itemsJson);
          if (Array.isArray(parsedJson)) {
            lines = parsedJson
              .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
              .map((l) => ({
                id: String(l.id ?? ''),
                name: String(l.name ?? ''),
                emoji: String(l.emoji ?? '🍷'),
                qty: Number(l.qty ?? 0),
                lineTotal: Number(l.lineTotal ?? 0),
                free: l.free === true,
              }));
          }
        } catch {
          continue;
        }
        for (const l of lines) {
          const prev = agg.get(l.id) ?? { name: l.name, emoji: l.emoji, qty: 0, lineTotal: 0, free: l.free };
          prev.qty += l.qty;
          prev.lineTotal = Math.round((prev.lineTotal + l.lineTotal) * 100) / 100;
          agg.set(l.id, prev);
        }
        if (o.payment === 'stripe' || o.status === 'PAID') {
          totalPaid = Math.round((totalPaid + o.totalEur) * 100) / 100;
        } else {
          totalOpen = Math.round((totalOpen + o.totalEur) * 100) / 100;
        }
      }
      const [check, restock] = await Promise.all([
        db.minibarCheck.findFirst({
          where: {
            propertyId: property.id,
            ...(stayBookingId
              ? { OR: [{ bookingId: stayBookingId }, { bookingId: null }] }
              : { bookingId: null }),
            ...(stayFrom ? { checkedAt: { gte: stayFrom } } : {}),
          },
          orderBy: { checkedAt: 'desc' },
          select: { checkedAt: true },
        }),
        db.minibarRestockRequest.findFirst({
          where: {
            propertyId: property.id,
            status: 'PENDING',
            ...(stayBookingId
              ? { OR: [{ bookingId: stayBookingId }, { bookingId: null }] }
              : { bookingId: null }),
          },
          select: { id: true },
        }),
      ]);
      return {
        arrivalPhoto: minibar.arrivalPhoto ?? null,
        checkedAt: check?.checkedAt.toISOString() ?? null,
        consumed: Array.from(agg.values()).sort((a, b) => b.lineTotal - a.lineTotal),
        totalOpenEur: totalOpen,
        totalPaidEur: totalPaid,
        restockPending: restock !== null,
      };
    } catch {
      return empty;
    }
  })();

  // ── v4.52 « LIVRE D'OR VIVANT » — résumé public pour la carte du hub
  // (compte + note moyenne des souvenirs APPROUVÉS — la galerie
  // complète est chargée à l'ouverture via GET /memories). ──
  const memoriesSummary = await (async () => {
    const empty = { total: 0, avg: null as number | null, hasPending: false };
    try {
      const [agg, latest] = await Promise.all([
        db.guestMemory.aggregate({
          where: { propertyId: property.id, isApproved: true },
          _count: { id: true },
          _avg: { rating: true },
        }),
        db.guestMemory.findFirst({
          where: { propertyId: property.id, isApproved: false },
          select: { id: true },
        }),
      ]);
      return {
        total: agg._count.id,
        avg: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null,
        hasPending: latest !== null,
      };
    } catch {
      return empty;
    }
  })();

  // ── v4.68 « ONGLET MESSAGES DE L'HÔTE » — réponses ÉCRITES publiques
  // de l'hôte sur les souvenirs (GuestMemory.hostReply) : agrégation de
  // données DÉJÀ publiques (souvenirs approuvés + visibles uniquement),
  // consommée par le nouveau dialog « 📨 Messages de l'hôte ». Take 10,
  // select minimal, never-throw (dégradation gracieuse : bloc masqué). ──
  const memoriesWithHostReply = await (async () => {
    try {
      const rows = await db.guestMemory.findMany({
        where: { propertyId: property.id, isApproved: true, isPublic: true, hostReply: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          guestName: true,
          hostReply: true,
          hostReplyAt: true,
          createdAt: true,
        },
      });
      return rows.map((r) => ({
        id: r.id,
        guestName: r.guestName,
        hostReply: r.hostReply ?? '',
        hostReplyAt: r.hostReplyAt ? r.hostReplyAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      }));
    } catch {
      return null;
    }
  })();

  return {
    active: true,
    property: {
      id: property.id,
      name: property.name,
      propertyType: property.propertyType,
      propertyTypeLabel: propertyTypeMeta(property.propertyType).label,
      propertyTypeEmoji: propertyTypeMeta(property.propertyType).emoji,
      address: property.address,
      // v4.43 « RETOUR À LA MAISON » — lat/lng publics du logement
      // (bouton flottant GPS de l'invité ; masqué si non renseignés).
      latitude: property.latitude,
      longitude: property.longitude,
      hasPin: !!property.pinHash,
      // v4.31 — photos personnalisées par l'hôte (dataURL) ; clé absente = curated.
      hubPhotos: parseHubPhotos(property.hubPhotos),
    },
    ownerName: claimedByName || property.owner?.fullName || null,
    // v4.31 « POUR VOUS » — moment du séjour dérivé de la réservation en cours.
    stayMoment,
    // v4.50 « VERROUILLAGE DU HUB PAR CODE » — config publique du
    // verrouillage (le code lui-même n'est JAMAIS exposé).
    hubLock: parseHubLock(property.premiumFeatures),
    // v4.109 « ANIMATION PRÉ-ARRIVÉE » — check-in du prochain séjour
    // (ISO). null = aucun séjour à venir → pavé direct (historique).
    nextArrival,
    // v4.33 « COMPTE À REBOURS CHECK-OUT » + « SHOP THE STAY ».
    // v4.50 — checkIn/endAt/lateCheckOutUntil du séjour courant
    // (endAt = fin de séjour EFFECTIVE — rallongée par un départ
    // tardif validé ; le compte à rebours client suit). 
    stay: {
      isCheckoutDay,
      checkOut: stayCheckOut,
      isStayOver,
      guestName: guestFirstName,
      checkIn: stayCheckIn,
      endAt: stayEndAt,
      lateCheckOutUntil: stayLateUntil,
      // v4.52 — nuits du séjour courant (null = pas de séjour couvrant).
      nights: stayNights,
      // v4.53 « PRÊT POUR L'ARRIVÉE » — bannière verte (ménage validé
      // avant l'arrivée). null = pas de notification.
      readyForArrival,
    },
    // v4.37 « MESSAGES VOCAUX DU HUB » — disponibilité des voix par type
    // (langues générées/uploadées + version = updatedAt max, sert de
    // cache-bust audio et de ré-armement du « joué une fois » invité).
    // Payload minuscule : l'audio lui-même est servi paresseusement par
    // /voice-messages/audio (uniquement si un déclencheur le demande).
    voiceMessages: await (async () => {
      try {
        const voices = await db.hubVoiceMessage.findMany({
          where: { propertyId: property.id },
          select: { kind: true, lang: true, updatedAt: true },
        });
        // ── WP-BACK v4.61 — REPLI VOIX PLATEFORME : pour un kind où le
        // bien n'a défini AUCUNE voix, les voix par défaut du Superadmin
        // sont annoncées (langues plateforme + v = updatedAt plateforme,
        // cache-bust aligné sur ce que servira /voice-messages/audio).
        let platform: Awaited<ReturnType<typeof getPlatformVoiceStore>> = {};
        try {
          platform = await getPlatformVoiceStore();
        } catch {
          platform = {};
        }
        const platformKinds = (Object.keys(platform) as Array<keyof typeof platform>).filter(
          (k) => platform[k] && Object.keys(platform[k] as object).length > 0,
        );
        if (voices.length === 0 && platformKinds.length === 0) return null;
        const version = voices.length
          ? voices
              .reduce((acc, v) => (v.updatedAt > acc ? v.updatedAt : acc), voices[0].updatedAt)
              .toISOString()
          : '';
        // Langues d'un kind : celles du BIEN, sinon celles de la plateforme.
        const langsOf = (kind: string): string[] => {
          const own = voices.filter((v) => v.kind === kind).map((v) => v.lang);
          if (own.length > 0) return own;
          const pk = platform[kind as keyof typeof platform] as
            | Record<string, { updatedAt: string }>
            | undefined;
          return pk ? Object.keys(pk) : [];
        };
        // Version d'un kind (v4.77 — BUG FIX « voix de bienvenue rejouée à
        // chaque connexion ») : updatedAt max DES SEULES entrées de CE kind
        // du bien. Avant : `version` = updatedAt max de TOUS les kinds →
        // dès que l'hôte touchait une autre voix (checkout_eve…), la version
        // de welcome changeait → le drapeau « joué une fois » ne
        // correspondait plus → rejoue. Version par kind = stable.
        const versionOf = (kind: string): string => {
          const own = voices.filter((v) => v.kind === kind);
          if (own.length > 0) {
            return own
              .reduce((acc, v) => (v.updatedAt > acc ? v.updatedAt : acc), own[0].updatedAt)
              .toISOString();
          }
          const pk = platform[kind as keyof typeof platform] as
            | Record<string, { updatedAt: string }>
            | undefined;
          if (!pk) return version;
          const times = Object.values(pk)
            .map((e) => e?.updatedAt ?? '')
            .filter(Boolean)
            .sort();
          return times[times.length - 1] ?? version;
        };
        // v4.42 — horaires de déclenchement choisis par l'hôte
        // (dashboard → Conciergerie) ; défauts = spécification v4.37.
        const triggers = parseVoiceTriggers(property.premiumFeatures);
        return {
          welcome: { langs: langsOf('welcome'), v: versionOf('welcome') },
          checkoutEve: { langs: langsOf('checkout_eve'), v: versionOf('checkout_eve') },
          checkoutDay: { langs: langsOf('checkout_day'), v: versionOf('checkout_day') },
          // WP-BACK v4.61 — voix du guidebook (lecture audio du guide,
          // dashboard hôte ; dashboard n'utilise que 'fr').
          guidebook: { langs: langsOf('guidebook'), v: versionOf('guidebook') },
          eveHour: triggers.eveHour,
          dayHour: triggers.dayHour,
        };
      } catch {
        // Dégradation gracieuse : sans voix annoncées, aucun audio joué.
        return null;
      }
    })(),
    guest: {
      wifi,
      guidebookSlug: guidebookQr?.publicSlug ?? null,
      // v4.47 — Guidebook UNIVERSEL : si le bien n'a pas son propre
      // guidebook (QrCode 'home_manual'), le guide de référence partagé
      // par toutes les maisons est servi à la place (affiché dans le hub).
      universalGuidebook: guidebookQr?.publicSlug
        ? null
        : { title: universal.guidebook.title, sections: universal.guidebook.sections },
      // BUG DASHBOARD→HUB — parité complète avec la PWA invitée :
      // coffre-fort, bonnes adresses, guide visuel, SOS, guide des
      // appareils, modules premium (vidéo, late check-out, bouclier
      // d'avis) et kit de survie servis par les mêmes parseurs
      // tolérants (jamais de throw).
      accessCodes: parseAccessCodes(property.accessCodes),
      localSpots: parseLocalSpots(property.localSpots),
      visualGuide: parseVisualGuide(property.visualGuide),
      emergency: parseEmergencyInfo(property.emergencyInfo),
      appliances: appliancesUniversal ? universal.appliances : appliancesParsed,
      // v4.47 — flag : true = pack universel affiché (hôte n'a rien saisi).
      appliancesUniversal,
      premiumFeatures: parsePremiumFeatures(property.premiumFeatures),
      shopItems: parseShopItems(property.premiumFeatures),
      // v4.44 « MINIBAR NUMÉRIQUE » (Honesty Bar) — catalogue du bien
      // ([] si module désactivé : la carte n'apparaît pas côté invité).
      minibarItems,
      // v4.50 « MINIBAR DE CONFIANCE » — inventaire validé ? produits
      // consommés ? recharge demandée ? photo d'arrivée ?
      minibarExtra,
      // v4.52 « LIVRE D'OR VIVANT » — résumé (carte du hub) ; la galerie
      // complète est chargée paresseusement à l'ouverture.
      memoriesSummary,
      // v4.68 « MESSAGES DE L'HÔTE » — réponses écrites publiques (bloc
      // du dialog Messages ; masqué si null).
      memoriesWithHostReply,
      survivalKitItems: parseSurvivalKit(property.survivalKitItems),
      services,
      contact: {
        name: property.owner?.fullName || 'Votre hôte',
        // FIX-32 : téléphone de contact = profil hôte, SINON téléphone SOS
        // (emergencyInfo.hostPhone) — « Contacter l'hôte » affiche ainsi
        // Appel + WhatsApp dès qu'un numéro est renseigné où que ce soit.
        phone:
          property.owner?.profile?.phone ??
          parseEmergencyInfo(property.emergencyInfo)?.hostPhone ??
          null,
        // AUDIT PRÉ-PROD — SÉCURITÉ : email de contact DÉDIÉ (SOS), plus
        // jamais l'email de LOGIN du compte hôte (anti-phishing).
        email: parseEmergencyInfo(property.emergencyInfo)?.hostEmail ?? null,
      },
    },
  };
}

// POST: Verify PIN for host mode
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await req.json();
    const { pin } = body;

    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN invalide' }, { status: 400 });
    }

    // FIX-15 (B) — Anti brute-force par IP (10 essais/min, PIN 4 chiffres) ;
    // le quota slug global serait un vecteur de DoS du mode hôte : un tiers
    // pouvait épuiser `hubpin:<slug>` et empêcher l'hôte légitime de se
    // connecter au MODE HÔTE.
    if (!(await rateLimit(`hubpin:${slug}:${clientIp(req.headers) ?? 'local'}`, 10))) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans un instant.' }, { status: 429 });
    }

    // ── DEMO MODE: any 4-digit PIN works ──
    if (isDemo(slug)) {
      return NextResponse.json({ success: true, propertyId: 'demo-home-001' });
    }

    // Find the plaque and home
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
    });

    if (plaque && (!plaque.isClaimed || !plaque.propertyId)) {
      return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
    }

    if (plaque && plaque.status !== 'active') {
      return NextResponse.json(
        { error: 'Cette plaque QR est désactivée.' },
        { status: 410 }
      );
    }

    // ÉTAPE 12 : résolution du bien via la plaque OU le slug du bien
    const home = plaque?.propertyId
      ? await db.property.findUnique({
          where: { id: plaque.propertyId },
          select: { id: true, pinHash: true },
        })
      : await db.property.findUnique({
          where: { qrHubSlug: slug },
          select: { id: true, pinHash: true },
        });

    if (!home || !home.pinHash) {
      return NextResponse.json({ error: 'Aucun PIN configuré' }, { status: 400 });
    }

    const isValid = await compare(pin, home.pinHash);
    if (!isValid) {
      return NextResponse.json({ error: 'PIN incorrect' }, { status: 401 });
    }

    return NextResponse.json({ success: true, propertyId: home.id });
  } catch (error) {
    // FIX-14 — captureError console.error + trace AuditLog, ne jette jamais.
    await captureError('hub.pin', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
