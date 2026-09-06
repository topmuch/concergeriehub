import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import { haversineKm, providerCategoryMeta, formatEur } from '@/lib/b2b';
import { rateLimit } from '@/lib/rate-limit';

// =============================================================
// POST /api/public/hub/[slug]/host   body: { pin }
// Données du MODE HÔTE (tablette/QR) — protégées par le PIN 4
// chiffres du bien (bcrypt). Jamais exposées par la GET publique.
//
// Retour :
//  - wifi : contenu actuel du module Wi-Fi (pour "Modifier le Wi-Fi")
//  - unreadMessages : messages vocaux invités non lus (réclamations)
//  - complaints : réclamations écrites ouvertes (formulaire Hub)
//  - openComplaints : nb de réclamations écrites OPEN (badge)
//  - pendingRequests : demandes de service en attente
//  - providers : prestataires dans le rayon (2 audiences)
//  - guidebook : contenu éditable du Guidebook (QrCode 'home_manual',
//    même parse de contentJson que /view — title + body découpé
//    en sections par double saut de ligne)
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

const CATEGORY_LABELS: Record<string, string> = {
  PLUMBING: 'Fuite / Plomberie',
  ELECTRICAL: 'Électricité',
  CLEANING: 'Ménage',
  OTHER: 'Autre',
};

function safeParsePhotos(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as string[]).slice(0, 3) : [];
  } catch {
    return [];
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
        complaints: [
          {
            id: 'demo-complaint-1',
            category: 'PLUMBING',
            categoryLabel: 'Fuite / Plomberie',
            description: 'Le robinet de la cuisine goutte en permanence, dégât léger sous l\'évier.',
            photos: [],
            isUrgent: false,
            guestName: 'Camille (voyageuse)',
            createdAt: new Date(Date.now() - 3600000).toISOString(),
          },
          {
            id: 'demo-complaint-2',
            category: 'ELECTRICAL',
            categoryLabel: 'Électricité',
            description: "Une prise de la chambre ne fonctionne plus, le disjoncteur saute quand on la branche.",
            photos: [],
            isUrgent: true,
            guestName: 'Pierre (voyageur)',
            createdAt: new Date(Date.now() - 5400000).toISOString(),
          },
        ],
        openComplaints: 2,
        pendingRequests: 1,
        guidebook: {
          qrCodeId: 'fqr-guide-1',
          title: 'Guide de bienvenue — Le Petit Nid',
          sections: [
            "👋 Bienvenue ! La clé se trouve dans la boîte à clés, l'appartement est au 2e étage porte de gauche.",
            '🔑 Accès\n\nBoîte à clés : code fourni par SMS. Poussez fort la poignée en tournant à gauche.',
            '🥐 Bonnes adresses\n\nBoulangerie à 50 m à gauche en sortant, marché le dimanche matin.',
          ],
        },
        providers: [
          { id: 'p1', name: 'CleanSuite Paris', emoji: '🧹', categoryLabel: 'Ménage', distanceKm: 2.1, audience: 'OWNER_SERVICE', priceLabel: 'dès 28,00 €' },
          { id: 'p2', name: 'Morning Box Paris', emoji: '🥐', categoryLabel: 'Petit-déjeuner', distanceKm: 0.7, audience: 'GUEST_EXPERIENCE', priceLabel: 'dès 12,00 €' },
        ],
      });
    }

    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN requis (4 chiffres)' }, { status: 400 });
    }

    // ── Résolution du bien : plaque V1 OU hub du bien (É12, property.qrHubSlug) ──
    let propertyId: string | null = null;
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      select: { propertyId: true, isClaimed: true, status: true },
    });
    if (plaque) {
      if (!plaque.isClaimed || !plaque.propertyId) {
        return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
      }
      if (plaque.status !== 'active') {
        return NextResponse.json({ error: 'Cette plaque QR est désactivée.' }, { status: 410 });
      }
      propertyId = plaque.propertyId;
    } else {
      const propertyBySlug = await db.property.findUnique({
        where: { qrHubSlug: slug },
        select: { id: true, isActive: true },
      });
      if (!propertyBySlug) {
        return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
      }
      if (!propertyBySlug.isActive) {
        return NextResponse.json({ error: 'Ce bien a été désactivé par son hôte.' }, { status: 410 });
      }
      propertyId = propertyBySlug.id;
    }

    const property = await db.property.findUnique({
      where: { id: propertyId },
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

    // ── Vérification PIN (FAIL-CLOSED : sans PIN configuré, accès refusé) ──
    if (!property.pinHash) {
      return NextResponse.json(
        { error: "Aucun PIN n'est configuré pour ce logement. Le mode hôte est verrouillé jusqu'à sa définition dans l'espace hôte." },
        { status: 403 },
      );
    }
    // Anti brute-force : 10 tentatives/minute/slug (PIN 4 chiffres).
    if (!(await rateLimit(`hubhostpin:${slug}`, 10))) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans un instant.' }, { status: 429 });
    }
    const isValid = await compare(pin, property.pinHash);
    if (!isValid) {
      return NextResponse.json({ error: 'PIN incorrect' }, { status: 401 });
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

    // ── Guidebook (QrCode 'home_manual' actif) — même parse que /view :
    //    { title, body } avec sections séparées par un double saut de ligne.
    //    (AUD-FULL ⑥ : module d'édition du mode Hôte.)
    const guidebookQr = await db.qrCode.findFirst({
      where: { propertyId: property.id, type: 'home_manual', isActive: true },
      orderBy: { createdAt: 'asc' },
      include: { content: { select: { contentJson: true } } },
    });
    const guidebookContent = guidebookQr ? parseContent(guidebookQr.content?.contentJson) : {};
    const guidebookBody =
      (guidebookContent.body as string) || (guidebookContent.text as string) || '';
    const guidebook = {
      qrCodeId: guidebookQr?.id ?? null,
      title: (guidebookContent.title as string) || 'Guide de bienvenue',
      sections: guidebookBody.split('\n\n').filter((s) => s.trim().length > 0),
    };

    // ── Réclamations vocales : messages invités non lus ──
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

    // ── Réclamations écrites (formulaire Hub) ouvertes ──
    const complaintsRaw = await db.guestComplaint.findMany({
      where: { propertyId: property.id, status: 'OPEN' },
      orderBy: [{ isUrgent: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    });
    const openComplaints = complaintsRaw.length;

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
      complaints: complaintsRaw.map((c) => ({
        id: c.id,
        category: c.category,
        categoryLabel: CATEGORY_LABELS[c.category as keyof typeof CATEGORY_LABELS] ?? 'Autre',
        description: c.description,
        photos: safeParsePhotos(c.photos),
        isUrgent: c.isUrgent,
        guestName: c.guestName,
        createdAt: c.createdAt.toISOString(),
      })),
      openComplaints,
      pendingRequests,
      guidebook,
      providers,
    });
  } catch (error) {
    console.error('Hub HOST data error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
