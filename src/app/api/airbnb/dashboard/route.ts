// =============================================================
// GET /api/airbnb/dashboard
// Données du Dashboard B2B (Espace Hôte) :
//  - liste des biens de l'utilisateur (+ bien sélectionné)
//  - stats bento : scans ce mois (delta vs mois précédent),
//    note moyenne (avis services), revenus upselling du mois
//  - grille des modules actifs (QRs par type + aperçu invité)
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveUserProperties, canAccessProperty } from '@/lib/b2b-server';
import { DASHBOARD_MODULES, haversineKm } from '@/lib/b2b';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    // ----- Biens accessibles + sélection -----
    const properties = await resolveUserProperties(userId);
    if (properties.length === 0) {
      return NextResponse.json({
        user: { firstName: firstNameOf(session.user.name) },
        properties: [],
        property: null,
        stats: null,
        modules: [],
      });
    }

    const { searchParams } = new URL(req.url);
    const requestedId = searchParams.get('propertyId');
    const property = requestedId
      ? properties.find((p) => p.id === requestedId) ?? properties[0]
      : properties[0];

    if (!(await canAccessProperty(userId, property.id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    // ----- Bornes de mois -----
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // ----- Stats (parallèle) -----
    const [
      scansThisMonth,
      scansPrevMonth,
      reviewsAgg,
      upsellingAgg,
      unreadGuestMessages,
      activeQrCodes,
      lastScan,
    ] = await Promise.all([
      // 📡 Scans ce mois
      db.scanLog.count({
        where: { propertyId: property.id, createdAt: { gte: startOfMonth } },
      }),
      // Delta vs mois précédent
      db.scanLog.count({
        where: {
          propertyId: property.id,
          createdAt: { gte: startOfPrevMonth, lt: startOfMonth },
        },
      }),
      // ⭐ Note moyenne — avis laissés sur les prestations du bien
      db.review.aggregate({
        _avg: { rating: true },
        _count: true,
        where: { serviceRequest: { propertyId: property.id } },
      }),
      // 💰 Revenus upselling — commandes payées ce mois
      db.serviceRequest.aggregate({
        _sum: { finalPrice: true },
        _count: true,
        where: {
          propertyId: property.id,
          paidAt: { gte: startOfMonth, lte: now },
        },
      }),
      // 🚨 Messages invités en attente (module Réclamations / contact)
      db.voiceMessage.count({
        where: { propertyId: property.id, senderType: 'guest', isRead: false },
      }),
      // Modules — tous les QRs actifs du bien (groupés côté JS)
      db.qrCode.findMany({
        where: { propertyId: property.id, isActive: true },
        select: { type: true, publicSlug: true },
      }),
      // Dernier scan (texte "il y a …")
      db.scanLog.findFirst({
        where: { propertyId: property.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    const scansDelta =
      scansPrevMonth > 0
        ? Math.round(((scansThisMonth - scansPrevMonth) / scansPrevMonth) * 100)
        : null;

    // ----- Grille des modules -----
    const qrByType = new Map<string, string[]>();
    for (const qr of activeQrCodes) {
      const list = qrByType.get(qr.type) ?? [];
      if (qr.publicSlug) list.push(qr.publicSlug);
      qrByType.set(qr.type, list);
    }

    // Géoloc du bien → pour les cartes Prestataires
    let nearbyProvidersCount: number | null = null;
    if (property.latitude != null && property.longitude != null) {
      const geoProviders = await db.provider.findMany({
        where: { isActive: true, audience: 'GUEST_EXPERIENCE' },
        select: { latitude: true, longitude: true, serviceRadiusKm: true },
      });
      nearbyProvidersCount = geoProviders.filter((p) => {
        if (p.latitude == null || p.longitude == null) return false;
        const d = haversineKm(property.latitude!, property.longitude!, p.latitude, p.longitude);
        return d <= p.serviceRadiusKm;
      }).length;
    }

    const modules = DASHBOARD_MODULES.map((meta) => {
      const slugs = qrByType.get(meta.dbType) ?? [];
      return {
        key: meta.key,
        label: meta.label,
        emoji: meta.emoji,
        description: meta.description,
        qrCount: slugs.length,
        previewSlug: slugs[0] ?? null,
        // Extra : nb d'expériences invité à proximité pour la carte Prestataires
        nearbyProviders:
          meta.key === 'PROVIDER_DIRECTORY' ? nearbyProvidersCount : undefined,
      };
    });

    return NextResponse.json({
      user: { firstName: firstNameOf(session.user.name) },
      properties,
      property: { ...property, hasGeoloc: property.latitude != null && property.longitude != null },
      stats: {
        scansThisMonth,
        scansPrevMonth,
        scansDelta,
        lastScanAt: lastScan?.createdAt?.toISOString() ?? null,
        avgRating: reviewsAgg._avg.rating ?? null,
        reviewsCount: reviewsAgg._count,
        upsellingRevenue: upsellingAgg._sum.finalPrice ?? 0,
        upsellingOrders: upsellingAgg._count,
        unreadGuestMessages,
      },
      modules,
    });
  } catch (error) {
    console.error('[airbnb/dashboard] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

function firstNameOf(name?: string | null): string {
  if (!name) return 'Hôte';
  return name.trim().split(/\s+/)[0];
}
