import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { haversineKm, providerCategoryMeta, formatEur, propertyTypeMeta } from '@/lib/b2b';
import { parseBranding } from '@/lib/branding';
import {
  parseAccessCodes,
  parseAppliances,
  parseEmergencyInfo,
  parseLocalSpots,
  parsePremiumFeatures,
  parseSurvivalKit,
  parseVisualGuide,
} from '@/lib/concierge';
// WP-BACK v4.61 — voix du guidebook : disponibilité exposée à l'app
// invitée (property > plateforme, repli cohérent avec la route audio du hub).
import { getPlatformVoiceStore } from '@/lib/platform-voices';

// =============================================================
// ÉTAPE 16 (V3) — App Invitée PWA : GET /api/public/guest-app?slug=…
// ÉTAPE 17.2 (V3) — services[] gagne unitPrice (prix numérique de
// l'offre standard, = hourlyRate ; null → "Sur devis" → mise en
// relation email conservée). C'est ce prix que l'invité commande.
// ÉTAPE 17.5 (V3) — services[] gagne offers[] : le catalogue fin
// par bien (ServiceOffer actifs de CE bien pour CE prestataire).
// L'invité commande une offre précise (offerId) dont le prix est
// re-résolu serveur au POST — jamais cru côté client.
// ÉTAPE 19 (V3) — WHITE-LABEL : payload gagne branding{} (logo,
// couleur, nom commercial, message d'accueil) pour l'app invitée.
// DIGITAL CONCIERGE (V4.1) — property gagne latitude/longitude
// (météo Open-Meteo du header + futur module « Quartier »).
// (slug en QUERY PARAM — règle sandbox : pas de segments dynamiques
// pour les nouvelles routes API)
//
// Payload "app-like" complet de l'expérience invitée :
//   • Wi-Fi (copie mot de passe)
//   • Guidebook COMPLET inline (title + body) → mis en cache par le
//     Service Worker → disponible hors-ligne
//   • Règles de la maison (QR house_rules dédié si présent)
//   • Services prestataires GUEST_EXPERIENCE dans le rayon du bien
//   • Contact hôte (urgence)
//   • Séjour courant si ?b=<bookingId> appartient au bien → accueil
//     personnalisé "Bonjour <prénom>" + rappel de départ
//
// Sécurité : lecture publique, mais ne renvoie QUE les données invité
// (aucune donnée hôte) et la réservation est filtrée par propertyId.
// =============================================================

const DEMO_SLUG = 'demo-hub';

interface GuestServiceOffer {
  id: string;
  name: string;
  description: string | null;
  unitPrice: number;
  unit: string;
  /** v4.23 « hub réel » — photo réelle de l'offre. */
  imageUrl?: string | null;
}

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
  /** Catalogue fin du prestataire pour CE bien (ÉTAPE 17.5). */
  offers: GuestServiceOffer[];
}

function parseContent(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Séjour exposé à l'invité — champs strictement non sensibles. */
interface GuestBooking {
  guestName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  /** PREMIUM V5 (Étape 3.3) — statut late check-out Stripe ('REQUESTED'|'PAID'|null). */
  lateCheckoutStatus: string | null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get('slug') || '').trim();
    const bookingParam = (url.searchParams.get('b') || '').trim();

    if (!slug || slug.length < 2) {
      return NextResponse.json(
        { error: 'not_found', message: 'Adresse du hub invalide.' },
        { status: 400 },
      );
    }

    // ── MODE DÉMO (landing /hub/demo-hub) ──
    if (slug === DEMO_SLUG) {
      return NextResponse.json(buildDemoPayload());
    }

    // ── 1. Résolution du bien : plaque QR (flux V1) OU Hub du bien (V2) ──
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      select: { propertyId: true, isClaimed: true, status: true },
    });

    let propertyId: string | null = null;
    if (plaque && plaque.isClaimed && plaque.propertyId && plaque.status === 'active') {
      propertyId = plaque.propertyId;
    } else if (!plaque) {
      const propertyBySlug = await db.property.findUnique({
        where: { qrHubSlug: slug },
        select: { id: true, isActive: true },
      });
      if (propertyBySlug?.isActive) propertyId = propertyBySlug.id;
    }

    if (!propertyId) {
      return NextResponse.json(
        { error: 'not_found', message: 'Ce hub est introuvable ou a été désactivé par son hôte.' },
        { status: 404 },
      );
    }

    // ── 2. Le bien + son propriétaire ──
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
        branding: true,
        // DIGITAL CONCIERGE (V4.1) — les 4 modules enrichis
        accessCodes: true,
        appliances: true,
        localSpots: true,
        emergencyInfo: true,
        // PREMIUM « CONCIERGERIE 5 ÉTOILES » (V5) — vidéo, guide visuel,
        // late check-out, bouclier d'avis, kit de survie
        premiumFeatures: true,
        visualGuide: true,
        survivalKitItems: true,
        // v4.32 « Prestataires autour » — ids désactivés par l'hôte.
        disabledProviders: true,
        owner: {
          select: { fullName: true, email: true, profile: { select: { phone: true } } },
        },
      },
    });

    if (!property || !property.isActive) {
      return NextResponse.json(
        { error: 'not_found', message: 'Le logement lié à ce hub est introuvable.' },
        { status: 404 },
      );
    }

    // ── 3. QRs publics actifs → Wi-Fi + Guidebook + Règles ──
    const activeQrs = await db.qrCode.findMany({
      where: { propertyId: property.id, isActive: true, isPrivate: false },
      orderBy: { createdAt: 'asc' },
      include: { content: { select: { contentJson: true } } },
    });

    const wifiQr = activeQrs.find((qr) => qr.type === 'wifi');
    const guidebookQr = activeQrs.find((qr) => qr.type === 'home_manual' && qr.publicSlug);
    const rulesQr = activeQrs.find((qr) => qr.type === 'house_rules');

    const wifiContent = wifiQr ? parseContent(wifiQr.content?.contentJson) : {};
    const wifi =
      wifiQr && (wifiContent.network_name || wifiContent.password)
        ? {
            networkName: (wifiContent.network_name as string) || 'Wi-Fi du logement',
            password: (wifiContent.password as string) || '',
            securityType: (wifiContent.security_type as string) || 'WPA2',
          }
        : null;

    // Guidebook complet INLINE (→ cache SW → hors-ligne)
    let guidebook: { slug: string; title: string; body: string } | null = null;
    if (guidebookQr) {
      const gc = parseContent(guidebookQr.content?.contentJson);
      const body = typeof gc.body === 'string' ? gc.body : '';
      guidebook = {
        slug: guidebookQr.publicSlug as string,
        title:
          (typeof gc.title === 'string' && gc.title.trim()) ||
          guidebookQr.name ||
          'Guide de bienvenue',
        body,
      };
    }

    // Règles de la maison : QR house_rules dédié (rules[] ou body)
    let houseRules: string[] | null = null;
    if (rulesQr) {
      const rc = parseContent(rulesQr.content?.contentJson);
      if (Array.isArray(rc.rules)) {
        houseRules = (rc.rules as unknown[])
          .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
          .slice(0, 12);
      } else if (typeof rc.body === 'string' && rc.body.trim()) {
        houseRules = rc.body
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 12);
      }
    }

    // ── 4. Services invité = prestataires GUEST_EXPERIENCE dans le rayon ──
    // (même logique métier que /api/public/hub/[slug] — duplications
    // maîtrisées pour ne pas retoucher au flux V1 validé)
    // ÉTAPE 17.5 : + catalogue fin (ServiceOffer actifs du bien,
    // une seule requête groupée puis répartition par providerId).
    const services: GuestService[] = [];
    if (property.latitude != null && property.longitude != null) {
      // AUDIT PRÉ-PROD — PERF : pré-filtre SQL bounding box (200 km max)
      // + take 200 AVANT le calcul haversine JS (plus de full-table scan).
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

      // v4.32 « Prestataires autour » — exclus ceux désactivés par l'hôte
      // (parité hub public : même liste Property.disabledProviders).
      const disabledIds = Array.isArray(property.disabledProviders)
        ? (property.disabledProviders as unknown[]).filter((x): x is string => typeof x === 'string')
        : [];
      const visibleProviders =
        disabledIds.length > 0
          ? inRadius.filter((p) => !disabledIds.includes(p.id))
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
        // Affichage : "dès <min offre catalogue>" sinon tarif standard sinon Sur devis
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

    // ── 5. Séjour courant (?b=) → personnalisation de l'accueil ──
    let booking: GuestBooking | null = null;
    if (bookingParam) {
      const b = await db.booking.findFirst({
        where: { id: bookingParam, propertyId: property.id, status: { not: 'CANCELLED' } },
        select: { guestName: true, checkIn: true, checkOut: true, guests: true, lateCheckoutStatus: true },
      });
      if (b) {
        booking = {
          guestName: b.guestName,
          checkIn: b.checkIn.toISOString(),
          checkOut: b.checkOut.toISOString(),
          guests: b.guests,
          lateCheckoutStatus: b.lateCheckoutStatus,
        };
      }
    }

    return NextResponse.json({
      active: true,
      // ÉTAPE 19 — white-label (null-safe → défauts plateforme)
      branding: parseBranding(property.branding),
      property: {
        id: property.id,
        name: property.name,
        propertyType: property.propertyType,
        propertyTypeLabel: propertyTypeMeta(property.propertyType).label,
        propertyTypeEmoji: propertyTypeMeta(property.propertyType).emoji,
        address: property.address,
        // DIGITAL CONCIERGE (V4.1) — météo + carte du quartier
        latitude: property.latitude,
        longitude: property.longitude,
        // DIGITAL CONCIERGE (V4.1) — les 4 modules (parseurs tolérants)
        accessCodes: parseAccessCodes(property.accessCodes),
        appliances: parseAppliances(property.appliances),
        localSpots: parseLocalSpots(property.localSpots),
        emergencyInfo: parseEmergencyInfo(property.emergencyInfo),
        // PREMIUM V5 — modules « Conciergerie 5 Étoiles »
        // ÉTAPE 3.3 — paymentEnabled : Stripe actif côté serveur →
        // la carte Late check-out propose « Confirmer et payer ».
        premiumFeatures: (() => {
          const premium = parsePremiumFeatures(property.premiumFeatures);
          if (!premium) return null;
          return { ...premium, paymentEnabled: Boolean(process.env.STRIPE_SECRET_KEY) };
        })(),
        visualGuide: parseVisualGuide(property.visualGuide),
        survivalKitItems: parseSurvivalKit(property.survivalKitItems),
        // WP-BACK v4.61 — CONTRAT APP INVITÉE : champ EXACT `guidebookVoice`
        // sur l'objet property. { available: true, v: updatedAt.getTime() }
        // si une voix du guidebook existe (kind='guidebook', lang='fr') —
        // la voix du BIEN gagne, sinon la voix plateforme du Superadmin
        // (le binaire est servi par /api/public/hub/[slug]/voice-messages/
        // audio?kind=guidebook&lang=fr&v=<v> qui applique le même repli).
        // null = aucune voix (le lecteur audio ne s'affiche pas).
        guidebookVoice: await (async () => {
          try {
            const own = await db.hubVoiceMessage.findUnique({
              where: {
                propertyId_kind_lang: { propertyId: property.id, kind: 'guidebook', lang: 'fr' },
              },
              select: { updatedAt: true },
            });
            if (own) return { available: true, v: own.updatedAt.getTime() };
            const store = await getPlatformVoiceStore();
            const entry = store.guidebook?.fr;
            return entry ? { available: true, v: new Date(entry.updatedAt).getTime() } : null;
          } catch {
            return null; // dégradation gracieuse : pas de lecteur audio
          }
        })(),
      },
      ownerName: property.owner?.fullName || null,
      guest: {
        wifi,
        guidebook,
        houseRules,
        services,
        booking,
        contact: {
          name: property.owner?.fullName || 'Votre hôte',
          phone: property.owner?.profile?.phone ?? null,
          // AUDIT PRÉ-PROD — SÉCURITÉ : l'email de LOGIN du compte hôte
          // n'est PLUS exposé publiquement. L'app invitée utilise
          // l'email de contact DÉDIÉ configuré dans le SOS (hostEmail) ;
          // fallback : null (le bouton « écrire » se masque proprement).
          email: parseEmergencyInfo(property.emergencyInfo)?.hostEmail ?? null,
        },
      },
    });
  } catch (error) {
    console.error('Guest-app GET error:', error);
    return NextResponse.json(
      { error: 'server', message: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}

function buildDemoPayload() {
  return {
    active: true,
    branding: parseBranding(null), // démo = marque plateforme par défaut
    property: {
      id: 'demo-home-001',
      name: 'Le Petit Nid',
      propertyType: 'AIRBNB',
      propertyTypeLabel: 'Airbnb',
      propertyTypeEmoji: '🏠',
      address: '12 Rue de la Paix, 75002 Paris',
      latitude: 48.8672, // Paris — Opéra (démo météo/header)
      longitude: 2.3316,
      // DIGITAL CONCIERGE (V4.1) — démo complète des 4 modules
      accessCodes: parseAccessCodes({
        building: '8452#',
        letterbox: 'B-12',
        parking: 'B2-12',
        alarm: '2468',
        safe: '0000',
        note: "Le code bâtiment change chaque mois — l'actualité est dans votre email de veille d'arrivée.",
      }),
      appliances: parseAppliances([
        {
          id: 'a1',
          name: 'Machine à café Nespresso',
          emoji: '☕',
          instructions:
            "1. Soulevez le levier et insérez une capsule.\n2. Fermez, placez une tasse sous la buse.\n3. Appuyez sur ☕ (espresso) ou ☕☕ (lungo).\n\n💡 Détartrage : tous les 3 mois — capsule de détartrage + 2 appuis longs de 3 s.",
          videoUrl: 'https://www.youtube.com/watch?v=ScMzIvxBSi4',
        },
        {
          id: 'a2',
          name: 'TV & Chromecast',
          emoji: '📺',
          instructions:
            "La TV est connectée à votre Wi-Fi.\n1. Appuyez sur la touche 🎬 de la télécommande.\n2. Cast depuis Netflix / YouTube sur votre téléphone (même Wi-Fi).\n\n🔊 Son : barre de son sous la TV — bouton Bluetooth au dos pour coupler votre téléphone.",
          imageUrl: '/api/public/app-icon?slug=demo-hub&size=512',
        },
        {
          id: 'a3',
          name: 'Lave-linge',
          emoji: '🧺',
          instructions:
            "Programme conseillé : « Rapide 30 min » pour une machine de voyage.\n1. Lessive : dosettes dans le placard au-dessus.\n2. Porte : verrouillez bien jusqu'au clic.\n\n⚠️ Laissez le hublot ouvert après usage (ventilation).",
        },
      ]),
      localSpots: parseLocalSpots([
        { id: 's1', name: 'Boulangerie Dupont', category: 'food', lat: 48.8661, lng: 2.328, address: '8 rue Dupont', hostNote: 'Le meilleur croissant de la rue — allez-y tôt !' },
        { id: 's2', name: 'Burger House Opéra', category: 'food', lat: 48.87, lng: 2.339, address: '12 bd des Capucines', hostNote: 'Mon burger préféré du quartier, avant 20 h pour éviter la file.' },
        { id: 's3', name: "Le Rooftop d'Opéra", category: 'bars', lat: 48.869, lng: 2.333, address: '5 rue Meyerbeer', hostNote: 'Cocktails au coucher du soleil — réservez en semaine.' },
        { id: 's4', name: 'Marché Saint-Honoré', category: 'groceries', lat: 48.8655, lng: 2.327, address: 'Place du Marché', hostNote: 'Ouvert jusqu’à 20 h — les fromagers du fond valent le détour.' },
        { id: 's5', name: 'Jardin des Tuileries (boucle course)', category: 'sport', lat: 48.8635, lng: 2.3275, hostNote: 'Boucle de 2,5 km parfaite le matin avant 9 h.' },
      ]),
      emergencyInfo: parseEmergencyInfo({
        hospital: 'Hôtel-Dieu Paris',
        hospitalLat: 48.8545,
        hospitalLng: 2.3465,
        pharmacy: 'Pharmacie du Coin',
        pharmacyPhone: '+33142000000',
        police: '17',
        commonIssues: [
          {
            id: 'c1',
            title: 'Le disjoncteur a sauté',
            instructions:
              "1. Ouvrez le tableau électrique (entrée, à gauche de la porte).\n2. Repérez le levier baissé.\n3. Remontez-le d'un coup sec.\n\nSi ça re-saute : débranchez le dernier appareil utilisé, puis appelez-moi.",
          },
          {
            id: 'c2',
            title: "Pas d'eau chaude",
            instructions:
              "Le chauffe-eau se réarme dans le placard du couloir : appuyez 3 s sur le bouton rouge.\n\n⏱️ Comptez ~30 min pour que l'eau redevienne chaude.",
          },
          {
            id: 'c3',
            title: "La chasse d'eau fuit",
            instructions:
              "1. Fermez le petit robinet à gauche de la cuvette.\n2. Appuyez 5 s sur le bouton double pour purger.\n\n🔧 Un kit de joints est sous le lavabo (tiroir du bas).",
          },
        ],
      }),
      // PREMIUM « CONCIERGERIE 5 ÉTOILES » (V5) — démo complète
      // (démo : demande simple — paymentEnabled false, pas de Stripe)
      premiumFeatures: (() => {
        const premium = parsePremiumFeatures({
          videoWelcomeUrl: 'https://www.youtube.com/watch?v=ScMzIvxBSi4',
          enableLateCheckout: true,
          lateCheckoutPrice: 20,
          enableReviewShield: true,
          reviewUrl: 'https://www.airbnb.fr/le-petit-nid-demo',
        });
        return premium ? { ...premium, paymentEnabled: false } : null;
      })(),
      visualGuide: parseVisualGuide([
        {
          id: 'vg1',
          title: 'La façade',
          description:
            "Immeuble haussmannien gris, grande porte bleue. Vous y êtes — le hub de la conciergerie est sur la plaque à gauche.",
          imageUrl: '/demo/arrival-facade.jpg',
        },
        {
          id: 'vg2',
          title: 'Le digicode',
          description:
            "Porte d'entrée à droite de la façade. Composez 8452# puis entrez. L'ascenseur est au fond de la cour.",
          imageUrl: '/demo/arrival-digicode.jpg',
        },
        {
          id: 'vg3',
          title: 'La porte & les clés',
          description:
            "3e étage avec ascenseur. Boîte à clés verte à droite de la porte d'entrée — code 0000 (tournez le bouton).",
          imageUrl: '/demo/arrival-keys.jpg',
        },
      ]),
      survivalKitItems: parseSurvivalKit([
        { id: 'k1', name: 'Chargeur iPhone', location: 'Tiroir de la cuisine, à côté des dosettes' },
        { id: 'k2', name: 'Parapluie', location: 'Entrée — panier sous le portemanteau' },
        { id: 'k3', name: 'Adaptateur prise universel', location: 'Tiroir de la TV' },
        { id: 'k4', name: 'Trousse de premiers soins', location: 'Salle de bain — sous le lavabo' },
      ]),
      // WP-BACK v4.61 — contrat app invitée : pas de voix guidebook en démo.
      guidebookVoice: null,
    },
    ownerName: 'Marie Dupont',
    guest: {
      wifi: { networkName: 'LePetitNid_5G', password: 'Demo2025!', securityType: 'WPA2' },
      guidebook: {
        slug: null,
        title: 'Guide de bienvenue — Le Petit Nid',
        body:
          '👋 Bienvenue à Paris !\n\n🔑 Accès\n\nBoîte à clés à gauche du porche, code 0000. Appartement au 3e étage avec ascenseur.\n\n🛠️ Équipements\n\nCafé Nespresso, lave-linge, TV connectée (vos comptes Netflix).\n\n🌙 Règles de vie\n\nCalme après 22 h, pas de fête.',
      },
      houseRules: ['Calme après 22 h', 'Pas de fête', 'Non-fumeur', 'Tri des déchets'],
      services: [
        {
          id: 'demo-svc-1',
          name: 'Morning Box Paris',
          emoji: '🥐',
          categoryLabel: 'Petit-déjeuner',
          description: 'Petit-déjeuner gourmand livré avant 8 h : viennoiseries artisanales, jus pressés, fruits de saison.',
          priceLabel: 'dès 12,00 €',
          unitPrice: null,
          ratingAvg: 4.9,
          totalReviews: 124,
          imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/8a94b10bd483.jpg',
          // REFONTE SERVICES PREMIUM (V4.11) — démo : catalogue fin riche
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
          description: 'Lavage, repassage et livraison sous 24 h — le linge propre sans y penser.',
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
          description: 'Un chef étoilé cuisine pour vous et vos invités, dans votre cuisine.',
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
          description: 'Berline ou van, chauffeur privé, eau et Wi-Fi à bord — suivi de vol inclus.',
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
          description: 'Praticienne certifiée, table installée dans le salon — huiles bio incluses.',
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
      booking: null,
      contact: { name: 'Marie Dupont', phone: '+33 6 12 34 56 78', email: 'marie@roomscan.pro' },
    },
  };
}
