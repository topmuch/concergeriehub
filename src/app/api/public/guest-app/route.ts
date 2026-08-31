import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { haversineKm, providerCategoryMeta, formatEur, propertyTypeMeta } from '@/lib/b2b';

// =============================================================
// ÉTAPE 16 (V3) — App Invitée PWA : GET /api/public/guest-app?slug=…
// ÉTAPE 17.2 (V3) — services[] gagne unitPrice (prix numérique de
// l'offre standard, = hourlyRate ; null → "Sur devis" → mise en
// relation email conservée). C'est ce prix que l'invité commande.
// ÉTAPE 17.5 (V3) — services[] gagne offers[] : le catalogue fin
// par bien (ServiceOffer actifs de CE bien pour CE prestataire).
// L'invité commande une offre précise (offerId) dont le prix est
// re-résolu serveur au POST — jamais cru côté client.
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
}

interface GuestService {
  id: string;
  name: string;
  emoji: string;
  categoryLabel: string;
  description: string;
  priceLabel: string;
  unitPrice: number | null;
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
      const geoProviders = await db.provider.findMany({
        where: { isActive: true, audience: 'GUEST_EXPERIENCE' },
      });
      const inRadius = geoProviders.filter((p) => {
        if (p.latitude == null || p.longitude == null) return false;
        const d = haversineKm(property.latitude!, property.longitude!, p.latitude, p.longitude);
        return d <= p.serviceRadiusKm;
      });

      const offersByProvider = new Map<string, GuestServiceOffer[]>();
      if (inRadius.length > 0) {
        const offers = await db.serviceOffer.findMany({
          where: {
            propertyId: property.id,
            providerId: { in: inRadius.map((p) => p.id) },
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
          });
          offersByProvider.set(o.providerId, list);
        }
      }

      for (const p of inRadius) {
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
        select: { guestName: true, checkIn: true, checkOut: true, guests: true },
      });
      if (b) {
        booking = {
          guestName: b.guestName,
          checkIn: b.checkIn.toISOString(),
          checkOut: b.checkOut.toISOString(),
          guests: b.guests,
        };
      }
    }

    return NextResponse.json({
      active: true,
      property: {
        id: property.id,
        name: property.name,
        propertyType: property.propertyType,
        propertyTypeLabel: propertyTypeMeta(property.propertyType).label,
        propertyTypeEmoji: propertyTypeMeta(property.propertyType).emoji,
        address: property.address,
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
          email: property.owner?.email ?? null,
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
    property: {
      id: 'demo-home-001',
      name: 'Le Petit Nid',
      propertyType: 'AIRBNB',
      propertyTypeLabel: 'Airbnb',
      propertyTypeEmoji: '🏠',
      address: '12 Rue de la Paix, 75002 Paris',
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
          description: 'Petit-déjeuner gourmand livré avant 8 h : viennoiseries artisanales, jus pressés.',
          priceLabel: 'dès 12,00 €',
          unitPrice: null, // démo : sans prix numérique → reste en mise en relation email
        },
      ] as GuestService[],
      booking: null,
      contact: { name: 'Marie Dupont', phone: '+33 6 12 34 56 78', email: 'marie@conciergerie-hub.fr' },
    },
  };
}
