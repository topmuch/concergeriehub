import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import { haversineKm, providerCategoryMeta, formatEur } from '@/lib/b2b';

// =============================================================
// POST /api/public/hub/[slug]/host   body: { pin }
// Données du MODE HÔTE (tablette/QR) — protégées par le PIN 4
// chiffres du bien (bcrypt). Jamais exposées par la GET publique.
//
// Retour :
//  - wifi : contenu actuel du module Wi-Fi (pour "Modifier le Wi-Fi")
//  - unreadMessages : messages vocaux invités non lus (réclamations)
//  - pendingRequests : demandes de service en attente
//  - providers : prestataires dans le rayon (2 audiences)
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

function parseContent(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await req.json();
    const pin = typeof body?.pin === 'string' ? body.pin : '';

    // ── DEMO MODE : n'importe quel PIN à 4 chiffres ──
    if (isDemo(slug)) {
      if (!/^\d{4}$/.test(pin)) {
        return NextResponse.json({ error: 'PIN invalide' }, { status: 400 });
      }
      return NextResponse.json({
        wifi: {
          qrCodeId: 'fqr-wifi-1',
          networkName: 'LePetitNid_5G',
          password: 'Demo2025!',
          securityType: 'WPA2',
        },
        unreadMessages: [
          {
            id: 'vm-2',
            senderName: 'Pierre (voyageur)',
            audioUrl: '',
            durationSec: 8,
            createdAt: new Date(Date.now() - 7200000).toISOString(),
          },
        ],
        pendingRequests: 1,
        providers: [
          { id: 'p1', name: 'CleanSuite Paris', emoji: '🧹', categoryLabel: 'Ménage', distanceKm: 2.1, audience: 'OWNER_SERVICE', priceLabel: 'dès 28,00 €' },
          { id: 'p2', name: 'Morning Box Paris', emoji: '🥐', categoryLabel: 'Petit-déjeuner', distanceKm: 0.7, audience: 'GUEST_EXPERIENCE', priceLabel: 'dès 12,00 €' },
        ],
      });
    }

    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN requis (4 chiffres)' }, { status: 400 });
    }

    // ── Plaque + bien ──
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      select: { propertyId: true, isClaimed: true, status: true },
    });
    if (!plaque || !plaque.isClaimed || !plaque.propertyId) {
      return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
    }
    if (plaque.status !== 'active') {
      return NextResponse.json({ error: 'Cette plaque QR est désactivée.' }, { status: 410 });
    }

    const property = await db.property.findUnique({
      where: { id: plaque.propertyId },
      select: {
        id: true,
        pinHash: true,
        latitude: true,
        longitude: true,
      },
    });
    if (!property) {
      return NextResponse.json({ error: 'Logement non trouvé' }, { status: 404 });
    }

    // ── Vérification PIN (si configuré) ──
    if (property.pinHash) {
      const isValid = await compare(pin, property.pinHash);
      if (!isValid) {
        return NextResponse.json({ error: 'PIN incorrect' }, { status: 401 });
      }
    }

    // ── Wi-Fi actuel (module wifi actif, public ou privé) ──
    const wifiQr = await db.qrCode.findFirst({
      where: { propertyId: property.id, type: 'wifi', isActive: true },
      orderBy: { createdAt: 'asc' },
      include: { content: { select: { contentJson: true } } },
    });
    const wifiContent = wifiQr ? parseContent(wifiQr.content?.contentJson) : {};
    const wifi = wifiQr
      ? {
          qrCodeId: wifiQr.id,
          networkName: (wifiContent.network_name as string) || '',
          password: (wifiContent.password as string) || '',
          securityType: (wifiContent.security_type as string) || 'WPA2',
        }
      : null;

    // ── Réclamations : messages vocaux invités non lus ──
    const unreadMessages = await db.voiceMessage.findMany({
      where: { propertyId: property.id, senderType: 'guest', isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        senderName: true,
        audioUrl: true,
        durationSec: true,
        createdAt: true,
      },
    });

    // ── Demandes de service en attente ──
    const pendingRequests = await db.serviceRequest.count({
      where: { propertyId: property.id, status: 'pending' },
    });

    // ── Prestataires dans le rayon (haversine ≤ serviceRadiusKm) ──
    const providers: {
      id: string;
      name: string;
      emoji: string;
      categoryLabel: string;
      distanceKm: number;
      audience: string;
      priceLabel: string;
    }[] = [];

    if (property.latitude != null && property.longitude != null) {
      const geoProviders = await db.provider.findMany({
        where: { isActive: true },
      });
      for (const p of geoProviders) {
        if (p.latitude == null || p.longitude == null) continue;
        const d = haversineKm(property.latitude, property.longitude, p.latitude, p.longitude);
        if (d > p.serviceRadiusKm) continue;
        const cat = providerCategoryMeta(p.category);
        providers.push({
          id: p.id,
          name: p.businessName,
          emoji: cat.emoji,
          categoryLabel: cat.label,
          distanceKm: Math.round(d * 100) / 100,
          audience: p.audience,
          priceLabel: p.hourlyRate != null ? `dès ${formatEur(p.hourlyRate)}` : 'Sur devis',
        });
      }
      providers.sort((a, b) => a.distanceKm - b.distanceKm);
    }

    return NextResponse.json({
      wifi,
      unreadMessages: unreadMessages.map((m) => ({
        id: m.id,
        senderName: m.senderName,
        audioUrl: m.audioUrl,
        durationSec: m.durationSec,
        createdAt: m.createdAt.toISOString(),
      })),
      pendingRequests,
      providers,
    });
  } catch (error) {
    console.error('Hub HOST data error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
