// =============================================================
// GET /api/airbnb/dashboard
// Données de la Vue d'Ensemble du Dashboard Client (Espace Hôte) :
//  - propriétés accessibles (+ bien ciblé, ou agrégat 'all')
//  - stats bento : scans ce mois (delta vs mois précédent),
//    revenus upselling du mois (commandes ServiceOrder payées),
//    note moyenne (avis services), propriétés actives
//  - series : courbe d'activité 30 jours (scans + commandes/jour)
//  - activity : flux unifié des derniers événements (scans,
//    commandes, réservations, messages invités)
//  - grille des modules actifs (QRs par type + aperçu invité)
//
// propertyId=all (ou absent) → agrégat multi-propriétés réel.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveUserProperties } from '@/lib/b2b-server';
import { DASHBOARD_MODULES, haversineKm } from '@/lib/b2b';

const MS_PER_DAY = 86_400_000;
const ACTIVITY_WINDOW_DAYS = 30;

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    // ----- Biens accessibles + ciblage (un bien ou agrégat 'all') -----
    const properties = await resolveUserProperties(userId);
    if (properties.length === 0) {
      return NextResponse.json({
        user: { firstName: firstNameOf(session.user.name) },
        properties: [],
        property: null,
        scope: 'all',
        stats: null,
        modules: [],
        series: [],
        activity: [],
      });
    }

    const { searchParams } = new URL(req.url);
    const requestedId = searchParams.get('propertyId');
    const scopeAll = !requestedId || requestedId === 'all';
    const target = scopeAll
      ? null
      : properties.find((p) => p.id === requestedId) ?? properties[0];
    // Les ids ciblés proviennent TOUJOURS de resolveUserProperties (accès déjà garanti).
    const targetIds = target ? [target.id] : properties.map((p) => p.id);

    // ----- Bornes de temps -----
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startOf30d = new Date(
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        - (ACTIVITY_WINDOW_DAYS - 1) * MS_PER_DAY,
    );

    // ----- Requêtes principales (parallèle) -----
    const [
      scansThisMonth,
      scansPrevMonth,
      reviewsAgg,
      ordersThisMonth,
      ordersPrevMonth,
      scanLogs30d,
      orders30d,
      activePropertiesCount,
      lastScan,
      recentScans,
      recentOrders,
      recentBookings,
      recentMessages,
      activeQrCodes,
    ] = await Promise.all([
      // 📡 Scans ce mois + delta
      db.scanLog.count({ where: { propertyId: { in: targetIds }, createdAt: { gte: startOfMonth } } }),
      db.scanLog.count({
        where: { propertyId: { in: targetIds }, createdAt: { gte: startOfPrevMonth, lt: startOfMonth } },
      }),
      // ⭐ Note moyenne — avis laissés sur les prestations des biens ciblés
      db.review.aggregate({
        _avg: { rating: true },
        _count: true,
        where: { serviceRequest: { propertyId: { in: targetIds } } },
      }),
      // 💰 Revenus upselling ce mois — commandes invités PAYÉES (moteur V3)
      db.serviceOrder.aggregate({
        _sum: { totalAmount: true },
        _count: true,
        where: {
          propertyId: { in: targetIds },
          paymentStatus: 'PAID',
          status: { not: 'CANCELLED' },
          paidAt: { gte: startOfMonth, lte: now },
        },
      }),
      db.serviceOrder.aggregate({
        _sum: { totalAmount: true },
        _count: true,
        where: {
          propertyId: { in: targetIds },
          paymentStatus: 'PAID',
          status: { not: 'CANCELLED' },
          paidAt: { gte: startOfPrevMonth, lt: startOfMonth },
        },
      }),
      // 📈 Courbe 30 jours — scans bruts
      db.scanLog.findMany({
        where: { propertyId: { in: targetIds }, createdAt: { gte: startOf30d } },
        select: { createdAt: true },
      }),
      // 📈 Courbe 30 jours — commandes créées (hors annulées)
      db.serviceOrder.findMany({
        where: { propertyId: { in: targetIds }, createdAt: { gte: startOf30d }, status: { not: 'CANCELLED' } },
        select: { createdAt: true },
      }),
      // 🏠 Propriétés actives dans le scope (comptage réel en base —
      // UserPropertyLite ne porte pas isActive)
      db.property.count({ where: { id: { in: targetIds }, isActive: true } }),
      db.scanLog.findFirst({
        where: { propertyId: { in: targetIds } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      // ----- Flux d'activité récent (6 derniers de chaque type) -----
      db.scanLog.findMany({
        where: { propertyId: { in: targetIds } },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, createdAt: true, propertyId: true },
      }),
      db.serviceOrder.findMany({
        where: { propertyId: { in: targetIds } },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true, createdAt: true, propertyId: true,
          guestName: true, totalAmount: true, status: true,
          provider: { select: { businessName: true } },
        },
      }),
      db.booking.findMany({
        where: { propertyId: { in: targetIds } },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true, createdAt: true, propertyId: true,
          guestName: true, checkIn: true, status: true, source: true,
        },
      }),
      db.voiceMessage.findMany({
        where: { propertyId: { in: targetIds }, senderType: 'guest' },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, createdAt: true, propertyId: true, senderName: true, durationSec: true },
      }),
      // Modules — tous les QRs actifs des biens ciblés (groupés côté JS)
      db.qrCode.findMany({
        where: { propertyId: { in: targetIds }, isActive: true },
        select: { type: true, publicSlug: true, propertyId: true },
      }),
    ]);

    const scansDelta =
      scansPrevMonth > 0
        ? Math.round(((scansThisMonth - scansPrevMonth) / scansPrevMonth) * 100)
        : null;
    const ordersDelta =
      ordersPrevMonth._count > 0
        ? Math.round(
            ((ordersThisMonth._count - ordersPrevMonth._count) / ordersPrevMonth._count) * 100,
          )
        : null;

    // ----- Courbe 30 jours (groupée par jour, fuseau local) -----
    const dayKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const scansByDay = new Map<string, number>();
    for (const s of scanLogs30d) {
      const k = dayKey(s.createdAt);
      scansByDay.set(k, (scansByDay.get(k) ?? 0) + 1);
    }
    const ordersByDay = new Map<string, number>();
    for (const o of orders30d) {
      const k = dayKey(o.createdAt);
      ordersByDay.set(k, (ordersByDay.get(k) ?? 0) + 1);
    }
    const dayLabels = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
    const series = Array.from({ length: ACTIVITY_WINDOW_DAYS }, (_, i) => {
      const d = new Date(startOf30d.getTime() + i * MS_PER_DAY);
      const k = dayKey(d);
      return {
        date: k,
        label: `${dayLabels[d.getDay()]} ${d.getDate()}`,
        scans: scansByDay.get(k) ?? 0,
        orders: ordersByDay.get(k) ?? 0,
      };
    });

    // ----- Flux d'activité unifié (tri chronologique descendant) -----
    const propertyNameOf = (id: string) => properties.find((p) => p.id === id)?.name ?? 'Bien';
    type ActivityItem = {
      id: string;
      type: 'scan' | 'order' | 'booking' | 'message';
      title: string;
      detail: string | null;
      amount: number | null;
      at: string;
    };
    const activity: ActivityItem[] = [
      ...recentScans.map((s): ActivityItem => ({
        id: `scan-${s.id}`,
        type: 'scan',
        title: 'Plaque scannée',
        detail: propertyNameOf(s.propertyId),
        amount: null,
        at: s.createdAt.toISOString(),
      })),
      ...recentOrders.map((o): ActivityItem => ({
        id: `order-${o.id}`,
        type: 'order',
        title: `Commande — ${o.provider?.businessName ?? 'Prestataire'}`,
        detail: `Invité : ${o.guestName} · ${orderStatusLabel(o.status)}`,
        amount: o.totalAmount,
        at: o.createdAt.toISOString(),
      })),
      ...recentBookings.map((b): ActivityItem => ({
        id: `booking-${b.id}`,
        type: 'booking',
        title: `Réservation ${b.source === 'ICAL' ? 'iCal' : b.source === 'MANUAL' ? 'manuelle' : b.source.toLowerCase()}`,
        detail: `${b.guestName} — arrivée ${b.checkIn.toLocaleDateString('fr-FR')} · ${propertyNameOf(b.propertyId)}`,
        amount: null,
        at: b.createdAt.toISOString(),
      })),
      ...recentMessages.map((m): ActivityItem => ({
        id: `message-${m.id}`,
        type: 'message',
        title: `Message vocal — ${m.senderName}`,
        detail: `${m.durationSec}s · ${propertyNameOf(m.propertyId)}`,
        amount: null,
        at: m.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 12);

    // ----- Grille des modules -----
    const qrByType = new Map<string, string[]>();
    for (const qr of activeQrCodes) {
      const list = qrByType.get(qr.type) ?? [];
      if (qr.publicSlug) list.push(qr.publicSlug);
      qrByType.set(qr.type, list);
    }

    // Géoloc du bien → nombre d'expériences invité à proximité (uniquement mono-bien)
    let nearbyProvidersCount: number | null = null;
    if (target && target.latitude != null && target.longitude != null) {
      const geoProviders = await db.provider.findMany({
        where: { isActive: true, audience: 'GUEST_EXPERIENCE' },
        select: { latitude: true, longitude: true, serviceRadiusKm: true },
      });
      nearbyProvidersCount = geoProviders.filter((p) => {
        if (p.latitude == null || p.longitude == null) return false;
        const d = haversineKm(target.latitude!, target.longitude!, p.latitude, p.longitude);
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
        nearbyProviders:
          meta.key === 'PROVIDER_DIRECTORY' ? nearbyProvidersCount : undefined,
      };
    });

    return NextResponse.json({
      user: { firstName: firstNameOf(session.user.name) },
      properties,
      property: target
        ? { ...target, hasGeoloc: target.latitude != null && target.longitude != null }
        : null,
      scope: target ? 'single' : 'all',
      stats: {
        scansThisMonth,
        scansPrevMonth,
        scansDelta,
        lastScanAt: lastScan?.createdAt?.toISOString() ?? null,
        avgRating: reviewsAgg._avg.rating ?? null,
        reviewsCount: reviewsAgg._count,
        upsellingRevenue: ordersThisMonth._sum.totalAmount ?? 0,
        ordersThisMonth: ordersThisMonth._count,
        ordersDelta,
        unreadGuestMessages: await db.voiceMessage.count({
          where: { propertyId: { in: targetIds }, senderType: 'guest', isRead: false },
        }),
        activeProperties: activePropertiesCount,
        propertiesCount: targetIds.length,
      },
      series,
      activity,
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

function orderStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING': return 'en attente';
    case 'CONFIRMED': return 'confirmée';
    case 'PREPARING': return 'en préparation';
    case 'DELIVERED': return 'livrée';
    case 'CANCELLED': return 'annulée';
    default: return status.toLowerCase();
  }
}
