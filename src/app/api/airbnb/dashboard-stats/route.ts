// =============================================================
// GET /api/airbnb/dashboard-stats
// KPIs « journée de l'hôte » pour la Vue d'Ensemble (redesign
// clair v5.0) — 100 % REAL DATA, même logique d'accès que
// /api/airbnb/dashboard :
//  - propriétés actives / total (scope : un bien ou agrégat 'all')
//  - séjours en cours (check-in passé, check-out à venir, hors annulées)
//  - arrivées & départs DU JOUR (liste horodatée pour la section
//    « Arrivées & Départs du jour »)
//  - revenus du mois (commandes invités PAYÉES — masqués aux rôles
//    CLEANER/MAINTENANCE, comme sur la vue d'ensemble)
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveUserProperties, resolveManagedPropertyIds } from '@/lib/b2b-server';

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
        scope: 'all',
        property: null,
        stats: {
          propertiesActive: 0,
          propertiesCount: 0,
          staysInProgress: 0,
          arrivalsToday: 0,
          departuresToday: 0,
          revenueThisMonth: 0,
          ordersThisMonth: 0,
          canSeeFinance: false,
        },
        today: [],
      });
    }

    const { searchParams } = new URL(req.url);
    const requestedId = searchParams.get('propertyId');
    const scopeAll = !requestedId || requestedId === 'all';
    const target = scopeAll ? null : properties.find((p) => p.id === requestedId) ?? properties[0];
    const targetIds = target ? [target.id] : properties.map((p) => p.id);

    // AUDIT PRÉ-PROD — SÉPARATION FINANCIÈRE (même règle que la vue
    // d'ensemble) : un CLEANER ou MAINTENANCE ne voit AUCUN revenu.
    const managedIds = new Set(await resolveManagedPropertyIds(userId));
    const canSeeFinance = targetIds.some((id) => managedIds.has(id));

    // ----- Bornes de temps (fuseau local serveur, comme /dashboard) -----
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const propertyNameOf = (id: string) => properties.find((p) => p.id === id)?.name ?? 'Bien';

    const [propertiesActive, staysInProgress, arrivals, departures, revenueAgg] = await Promise.all([
      // 🏠 Propriétés actives dans le scope (comptage réel en base)
      db.property.count({ where: { id: { in: targetIds }, isActive: true } }),
      // 🛏️ Séjours en cours : déjà arrivés, pas encore partis, hors annulées
      db.booking.count({
        where: {
          propertyId: { in: targetIds },
          checkIn: { lte: now },
          checkOut: { gt: now },
          status: { not: 'CANCELLED' },
        },
      }),
      // ✈️ Arrivées du jour
      db.booking.findMany({
        where: {
          propertyId: { in: targetIds },
          checkIn: { gte: startOfDay, lt: endOfDay },
          status: { not: 'CANCELLED' },
        },
        orderBy: { checkIn: 'asc' },
        select: { id: true, guestName: true, checkIn: true, checkOut: true, status: true, source: true, propertyId: true },
      }),
      // 🧳 Départs du jour
      db.booking.findMany({
        where: {
          propertyId: { in: targetIds },
          checkOut: { gte: startOfDay, lt: endOfDay },
          status: { not: 'CANCELLED' },
        },
        orderBy: { checkOut: 'asc' },
        select: { id: true, guestName: true, checkIn: true, checkOut: true, status: true, source: true, propertyId: true },
      }),
      // 💰 Revenus du mois — commandes invités PAYÉES (moteur V3)
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
    ]);

    // ----- Programme du jour fusionné (arrivées + départs, tri chrono) -----
    type TodayItem = {
      id: string;
      kind: 'arrival' | 'departure';
      guestName: string;
      propertyName: string;
      at: string;
      status: string;
      source: string;
    };
    const today: TodayItem[] = [
      ...arrivals.map(
        (b): TodayItem => ({
          id: `${b.id}-in`,
          kind: 'arrival',
          guestName: b.guestName,
          propertyName: propertyNameOf(b.propertyId),
          at: b.checkIn.toISOString(),
          status: b.status,
          source: b.source,
        }),
      ),
      ...departures.map(
        (b): TodayItem => ({
          id: `${b.id}-out`,
          kind: 'departure',
          guestName: b.guestName,
          propertyName: propertyNameOf(b.propertyId),
          at: b.checkOut.toISOString(),
          status: b.status,
          source: b.source,
        }),
      ),
    ].sort((a, b) => a.at.localeCompare(b.at));

    return NextResponse.json({
      scope: target ? 'single' : 'all',
      property: target ? { id: target.id, name: target.name } : null,
      stats: {
        propertiesActive,
        propertiesCount: targetIds.length,
        staysInProgress,
        arrivalsToday: arrivals.length,
        departuresToday: departures.length,
        revenueThisMonth: canSeeFinance ? (revenueAgg._sum.totalAmount ?? 0) : 0,
        ordersThisMonth: canSeeFinance ? revenueAgg._count : 0,
        canSeeFinance,
      },
      today,
    });
  } catch (error) {
    console.error('[airbnb/dashboard-stats GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
