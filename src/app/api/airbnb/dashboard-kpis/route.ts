// =============================================================
// GET /api/airbnb/dashboard-kpis
// Les 6 KPI « SAPHIR LUXE » du tableau de bord hôte (v5.2 —
// demande client : minibar, check-in/check-out avec compte à
// rebours, calendrier, ménage, départs tardifs, avis).
// 100 % REAL DATA — même logique d'accès que /api/airbnb/dashboard-stats :
//  - scope : un bien (propertyId) ou agrégat 'all'
//  - CLEANER / MAINTENANCE : chiffres financiers masqués
// Réponse :
//  minibar    → produits consommés + chiffre d'affaires (mois & total)
//  stay       → séjour en cours (ou prochain) : dates + base du compte à
//               rebours (le décompte est calculé côté client, horloge locale)
//  calendar   → clients en cours & à venir + prochaine entrée
//  housekeeping → ménages déjà faits (rapports) & programmés (séjours à
//               préparer, fenêtre 14 j)
//  lateCheckouts → départs tardifs à venir + prochain horaire
//  reviews    → avis positifs (≥ 4) / neutres (3) / négatifs (≤ 2)
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveUserProperties, resolveManagedPropertyIds } from '@/lib/b2b-server';

interface MinibarLine {
  qty?: number;
  free?: boolean;
  lineTotal?: number;
}

function sumItems(raw: string): number {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return 0;
    return parsed.reduce((acc: number, line) => {
      const qty = (line as MinibarLine).qty;
      return acc + (typeof qty === 'number' && qty > 0 ? qty : 0);
    }, 0);
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const properties = await resolveUserProperties(userId);
    if (properties.length === 0) {
      return NextResponse.json({
        scope: 'all' as const,
        property: null,
        minibar: { itemsMonth: 0, revenueMonth: 0, ordersMonth: 0, itemsTotal: 0, revenueTotal: 0, ordersTotal: 0, canSeeFinance: false },
        stay: null,
        calendar: { inProgress: 0, upcoming: 0, next: null },
        housekeeping: { done: 0, scheduled: 0 },
        lateCheckouts: { upcoming: 0, next: null },
        reviews: { positive: 0, neutral: 0, negative: 0 },
      });
    }

    const { searchParams } = new URL(req.url);
    const requestedId = searchParams.get('propertyId');
    const scopeAll = !requestedId || requestedId === 'all';
    const target = scopeAll ? null : properties.find((p) => p.id === requestedId) ?? properties[0];
    const targetIds = target ? [target.id] : properties.map((p) => p.id);
    const propertyNameOf = (id: string) => properties.find((p) => p.id === id)?.name ?? 'Bien';

    // Séparation financière : CLEANER / MAINTENANCE ne voient pas le CA
    const managedIds = new Set(await resolveManagedPropertyIds(userId));
    const canSeeFinance = targetIds.some((id) => managedIds.has(id));

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const hkWindowStart = new Date(now.getTime() - 2 * 86_400_000); // séjours terminés depuis ≤ 2 j
    const hkWindowEnd = new Date(now.getTime() + 14 * 86_400_000);  // ou à venir sous 14 j

    const [
      paidOrders,
      activeStay,
      nextStay,
      inProgressCount,
      upcomingCount,
      cleaningDone,
      cleaningScheduled,
      lateCheckouts,
      ratingGroups,
    ] = await Promise.all([
      // ── KPI 1 · MINIBAR — commandes PAYÉES (produits consommés + CA)
      db.minibarOrder.findMany({
        where: { propertyId: { in: targetIds }, status: 'PAID' },
        select: { totalEur: true, itemsJson: true, createdAt: true },
      }),
      // ── KPI 2 · SÉJOUR EN COURS (celui qui se termine le plus tôt =
      //    compte à rebours de départ le plus pertinent)
      db.booking.findFirst({
        where: {
          propertyId: { in: targetIds },
          checkIn: { lte: now },
          checkOut: { gt: now },
          status: { not: 'CANCELLED' },
        },
        orderBy: { checkOut: 'asc' },
        select: { guestName: true, propertyId: true, checkIn: true, checkOut: true },
      }),
      // À défaut : prochaine arrivée (compte à rebours d'entrée)
      db.booking.findFirst({
        where: {
          propertyId: { in: targetIds },
          checkIn: { gt: now },
          status: { not: 'CANCELLED' },
        },
        orderBy: { checkIn: 'asc' },
        select: { guestName: true, propertyId: true, checkIn: true, checkOut: true },
      }),
      // ── KPI 3 · CALENDRIER — clients en cours
      db.booking.count({
        where: {
          propertyId: { in: targetIds },
          checkIn: { lte: now },
          checkOut: { gt: now },
          status: { not: 'CANCELLED' },
        },
      }),
      // Clients à venir (arrivée aujourd'hui ou plus tard)
      db.booking.count({
        where: {
          propertyId: { in: targetIds },
          checkIn: { gt: now },
          status: { not: 'CANCELLED' },
        },
      }),
      // ── KPI 4 · MÉNAGE — déjà faits (rapports de preuve validés)
      db.cleaningReport.count({ where: { propertyId: { in: targetIds } } }),
      // Programmés : séjours dont le ménage reste à faire (fenêtre glissante)
      db.booking.count({
        where: {
          propertyId: { in: targetIds },
          cleaningStatus: 'PENDING',
          status: { not: 'CANCELLED' },
          checkOut: { gte: hkWindowStart, lte: hkWindowEnd },
        },
      }),
      // ── KPI 5 · DÉPARTS TARDIFS à venir
      db.booking.findMany({
        where: {
          propertyId: { in: targetIds },
          lateCheckOutUntil: { gte: now },
          status: { not: 'CANCELLED' },
        },
        orderBy: { lateCheckOutUntil: 'asc' },
        take: 5,
        select: { guestName: true, propertyId: true, lateCheckOutUntil: true },
      }),
      // ── KPI 6 · AVIS — positifs (≥ 4) / neutres (3) / négatifs (≤ 2)
      db.privateFeedback.groupBy({
        by: ['rating'],
        where: { propertyId: { in: targetIds } },
        _count: true,
      }),
    ]);

    // ----- Agrégats minibar (mois + total) -----
    let itemsMonth = 0, revenueMonth = 0, ordersMonth = 0;
    let itemsTotal = 0, revenueTotal = 0;
    for (const o of paidOrders) {
      const qty = sumItems(o.itemsJson);
      itemsTotal += qty;
      revenueTotal += o.totalEur;
      if (o.createdAt >= startOfMonth) {
        itemsMonth += qty;
        revenueMonth += o.totalEur;
        ordersMonth += 1;
      }
    }
    revenueMonth = Math.round(revenueMonth * 100) / 100;
    revenueTotal = Math.round(revenueTotal * 100) / 100;

    // ----- Avis par tonalité -----
    const reviews = { positive: 0, neutral: 0, negative: 0 };
    for (const g of ratingGroups) {
      if (g.rating >= 4) reviews.positive += g._count;
      else if (g.rating === 3) reviews.neutral += g._count;
      else reviews.negative += g._count;
    }

    const stay = activeStay
      ? {
          kind: 'active' as const,
          guestName: activeStay.guestName,
          propertyName: propertyNameOf(activeStay.propertyId),
          checkIn: activeStay.checkIn.toISOString(),
          checkOut: activeStay.checkOut.toISOString(),
        }
      : nextStay
        ? {
            kind: 'upcoming' as const,
            guestName: nextStay.guestName,
            propertyName: propertyNameOf(nextStay.propertyId),
            checkIn: nextStay.checkIn.toISOString(),
            checkOut: nextStay.checkOut.toISOString(),
          }
        : null;

    // Prochain client du calendrier (entrée à venir)
    const nextCalendarStay = await db.booking.findFirst({
      where: { propertyId: { in: targetIds }, checkIn: { gt: now }, status: { not: 'CANCELLED' } },
      orderBy: { checkIn: 'asc' },
      select: { guestName: true, propertyId: true, checkIn: true, checkOut: true },
    });

    const nextLate = lateCheckouts[0]
      ? {
          guestName: lateCheckouts[0].guestName,
          propertyName: propertyNameOf(lateCheckouts[0].propertyId),
          until: lateCheckouts[0].lateCheckOutUntil
            ? lateCheckouts[0].lateCheckOutUntil.toISOString()
            : null,
        }
      : null;

    return NextResponse.json({
      scope: target ? ('single' as const) : ('all' as const),
      property: target ? { id: target.id, name: target.name } : null,
      minibar: {
        itemsMonth,
        revenueMonth: canSeeFinance ? revenueMonth : 0,
        ordersMonth: canSeeFinance ? ordersMonth : 0,
        itemsTotal,
        revenueTotal: canSeeFinance ? revenueTotal : 0,
        ordersTotal: canSeeFinance ? paidOrders.length : 0,
        canSeeFinance,
      },
      stay,
      calendar: {
        inProgress: inProgressCount,
        upcoming: upcomingCount,
        next: nextCalendarStay
          ? {
              guestName: nextCalendarStay.guestName,
              propertyName: propertyNameOf(nextCalendarStay.propertyId),
              checkIn: nextCalendarStay.checkIn.toISOString(),
              checkOut: nextCalendarStay.checkOut.toISOString(),
            }
          : null,
      },
      housekeeping: { done: cleaningDone, scheduled: cleaningScheduled },
      lateCheckouts: {
        upcoming: lateCheckouts.length,
        next: nextLate,
      },
      reviews,
    });
  } catch (error) {
    console.error('[airbnb/dashboard-kpis GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
