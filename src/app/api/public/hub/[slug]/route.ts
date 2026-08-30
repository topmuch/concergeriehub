import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import { haversineKm, providerCategoryMeta, formatEur, propertyTypeMeta } from '@/lib/b2b';

// =============================================================
// Hub public Conciergerie Hub — /hub/[slug]
// GET  : payload de l'écran d'accueil + données Mode Invité.
//        Le slug est le hubSlug de la PLAQUE QR (PhysicalQrCode).
// POST : vérification du PIN Mode Hôte (bcrypt sur property.pinHash)
//
// Sécurité : la GET n'expose QUE les données invité (Wi-Fi, guide,
// services, contact). Les données hôte (QRs privés, prestataires,
// messages) sont servies par /host après vérification du PIN.
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

interface GuestService {
  id: string;
  name: string;
  emoji: string;
  categoryLabel: string;
  description: string;
  priceLabel: string;
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
    hasPin: true,
  },
  ownerName: 'Marie Dupont',
  guest: {
    wifi: { networkName: 'LePetitNid_5G', password: 'Demo2025!', securityType: 'WPA2' },
    guidebookSlug: null as string | null,
    services: [
      {
        id: 'demo-svc-1',
        name: 'Morning Box Paris',
        emoji: '🥐',
        categoryLabel: 'Petit-déjeuner',
        description: 'Petit-déjeuner gourmand livré avant 8 h : viennoiseries artisanales, jus pressés.',
        priceLabel: 'dès 12,00 €',
      },
      {
        id: 'demo-svc-2',
        name: 'Sommelier à Domicile',
        emoji: '🍷',
        categoryLabel: 'Sommelier',
        description: 'Dégustation privée de 5 vins nature dans votre logement.',
        priceLabel: 'dès 90,00 €',
      },
    ] as GuestService[],
    contact: { name: 'Marie Dupont', phone: '+33 6 12 34 56 78', email: 'marie@conciergerie-hub.fr' },
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

    // ── 1. La plaque (QR physique) derrière ce slug ──
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      include: { claimedBy: { select: { id: true, fullName: true } } },
    });

    if (!plaque || !plaque.isClaimed || !plaque.propertyId) {
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

    // ── 3. Le bien + son propriétaire ──
    const property = await db.property.findUnique({
      where: { id: plaque.propertyId },
      select: {
        id: true,
        name: true,
        propertyType: true,
        address: true,
        latitude: true,
        longitude: true,
        pinHash: true,
        owner: {
          select: {
            fullName: true,
            email: true,
            profile: { select: { phone: true } },
          },
        },
      },
    });

    if (!property) {
      return NextResponse.json(
        { error: 'not_found', message: 'Le logement lié à cette plaque est introuvable.' },
        { status: 404 }
      );
    }

    // ── 4. QRs actifs publics → Wi-Fi + Guidebook ──
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

    // ── 5. Services invité = prestataires GUEST_EXPERIENCE dans le rayon ──
    const services: GuestService[] = [];
    if (property.latitude != null && property.longitude != null) {
      const geoProviders = await db.provider.findMany({
        where: { isActive: true, audience: 'GUEST_EXPERIENCE' },
        include: { user: { select: { fullName: true } } },
      });
      for (const p of geoProviders) {
        if (p.latitude == null || p.longitude == null) continue;
        const d = haversineKm(property.latitude, property.longitude, p.latitude, p.longitude);
        if (d > p.serviceRadiusKm) continue;
        const cat = providerCategoryMeta(p.category);
        services.push({
          id: p.id,
          name: p.businessName,
          emoji: cat.emoji,
          categoryLabel: cat.label,
          description: p.description ?? 'Service proposé par un partenaire local vérifié.',
          priceLabel: p.hourlyRate != null ? `dès ${formatEur(p.hourlyRate)}` : 'Sur devis',
        });
      }
      services.sort((a, b) => a.name.localeCompare(b.name));
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
        hasPin: !!property.pinHash,
      },
      ownerName: plaque.claimedBy?.fullName || property.owner?.fullName || null,
      guest: {
        wifi,
        guidebookSlug: guidebookQr?.publicSlug ?? null,
        services,
        contact: {
          name: property.owner?.fullName || 'Votre hôte',
          phone: property.owner?.profile?.phone ?? null,
          email: property.owner?.email ?? null,
        },
      },
    });
  } catch (error) {
    console.error('Hub GET error:', error);
    return NextResponse.json(
      { error: 'server', message: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 }
    );
  }
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

    // ── DEMO MODE: any 4-digit PIN works ──
    if (isDemo(slug)) {
      return NextResponse.json({ success: true, propertyId: 'demo-home-001' });
    }

    // Find the plaque and home
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
    });

    if (!plaque || !plaque.isClaimed || !plaque.propertyId) {
      return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
    }

    if (plaque.status !== 'active') {
      return NextResponse.json(
        { error: 'Cette plaque QR est désactivée.' },
        { status: 410 }
      );
    }

    const home = await db.property.findUnique({
      where: { id: plaque.propertyId },
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
    console.error('Hub PIN verify error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
