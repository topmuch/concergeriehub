import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { mutationGuard, mutationKey } from '@/lib/mutation-guard';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveUserProperties, canAccessProperty } from '@/lib/b2b-server';
import { canTransition, isOrderStatus, round2 } from '@/lib/orders';

// =============================================================
// ÉTAPE 17.2 (V3) — Moteur de transaction côté HÔTE :
//   GET   /api/airbnb/service-orders?propertyId=?
//         → commandes du bien + stats financières
//           (CA invités, commission Hub, part hôte, actives)
//   PATCH /api/airbnb/service-orders?id=<orderId>
//         { status } → transitions du cycle de vie :
//           PENDING → CONFIRMED | CANCELLED
//           CONFIRMED → PREPARING | CANCELLED
//           PREPARING → DELIVERED | CANCELLED
//           (DELIVERED / CANCELLED : terminaux)
//         → passage à DELIVERED horodate deliveryDate.
//
// ÉTAPE 17.6 — paymentStatus/paidAt exposés à l'hôte + stat
//   « encaissé » (somme des commandes PAID hors annulées).
//
// Auth : session NextAuth + accès bien (owner ou membre accepté).
// IDs en QUERY PARAM (règle sandbox). Moteur never-throw.
//
// T4-b — propertyId='all' : agrégat multi-biens RÉEL. Les ids cibles
//   viennent exclusivement de resolveUserProperties(userId) (owner +
//   équipe acceptée → déjà autorisés, pas de re-vérification par id).
//   Chaque commande est enrichie d'un champ `propertyName` (mappage
//   id→nom depuis les biens accessibles) + d'un champ `propertyId`.
//   `take: 300` pour 'all' (100 insuffisant sur un portfolio).
// =============================================================

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const properties = await resolveUserProperties(userId);
    const { searchParams } = new URL(req.url);
    const requestedId = searchParams.get('propertyId');
    // T4-b — 'all' = agrégat multi-biens ; sinon comportement historique
    // (id précis avec fallback properties[0]).
    const isAllScope = requestedId === 'all';
    const property = isAllScope
      ? null
      : requestedId
        ? properties.find((p) => p.id === requestedId) ?? properties[0]
        : properties[0];

    if (!property && !isAllScope) {
      return NextResponse.json({
        properties,
        property: null,
        orders: [],
        stats: emptyStats(),
      });
    }
    // 'all' : ids issus EXCLUSIVEMENT de resolveUserProperties → déjà
    // autorisés (owner ou membre accepté). Bien précis : garde historique.
    if (!isAllScope && property && !(await canAccessProperty(userId, property.id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const targetIds = isAllScope ? properties.map((p) => p.id) : property ? [property.id] : [];

    const orders = await db.serviceOrder.findMany({
      where: { propertyId: { in: targetIds } },
      orderBy: { createdAt: 'desc' },
      // T4-b — 300 pour l'agrégat multi-biens (100 trop court), 100 sinon.
      take: isAllScope ? 300 : 100,
      select: {
        id: true,
        bookingId: true,
        guestName: true,
        guestEmail: true,
        items: true,
        totalAmount: true,
        commission: true,
        hostEarning: true,
        status: true,
        // ÉTAPE 17.6 — visibilité paiement côté hôte
        paymentStatus: true,
        paidAt: true,
        deliveryDate: true,
        createdAt: true,
        // T4-b — enrichissement propertyName côté client
        propertyId: true,
        provider: { select: { businessName: true, category: true } },
      },
    });

    // T4-b — mappage id→nom depuis les biens accessibles (jamais de
    // fuite : les commandes viennent de targetIds ⊂ biens accessibles).
    const nameById = new Map(properties.map((p) => [p.id, p.name]));
    const enrichedOrders = orders.map((o) => ({
      ...o,
      propertyName: nameById.get(o.propertyId) ?? null,
    }));

    // ── Stats financières (hors commandes annulées) ──
    let revenue = 0;
    let commissionTotal = 0;
    let hostTotal = 0;
    let activeCount = 0;
    let pendingCount = 0;
    let deliveredCount = 0;
    // ÉTAPE 17.6 — encaissé = commandes réellement payées (hors annulées)
    let paidRevenue = 0;
    let paidCount = 0;
    // ÉTAPE 21 — remboursé (visible en stats hôte)
    let refundedRevenue = 0;
    let refundedCount = 0;
    for (const o of orders) {
      if (o.status === 'CANCELLED') continue;
      revenue += o.totalAmount;
      commissionTotal += o.commission;
      hostTotal += o.hostEarning;
      if (o.paymentStatus === 'PAID') {
        paidRevenue += o.totalAmount;
        paidCount++;
      }
      if (o.paymentStatus === 'REFUNDED') {
        refundedRevenue += o.totalAmount;
        refundedCount++;
      }
      if (o.status === 'DELIVERED') deliveredCount++;
      else {
        activeCount++;
        if (o.status === 'PENDING') pendingCount++;
      }
    }

    return NextResponse.json({
      properties,
      property,
      orders: enrichedOrders,
      stats: {
        revenue: round2(revenue),
        commissionTotal: round2(commissionTotal),
        hostTotal: round2(hostTotal),
        activeCount,
        pendingCount,
        deliveredCount,
        // ÉTAPE 17.6
        paidRevenue: round2(paidRevenue),
        paidCount,
        // ÉTAPE 21
        refundedRevenue: round2(refundedRevenue),
        refundedCount,
      },
    });
  } catch (error) {
    console.error('[airbnb/service-orders GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;
    // FIX-15 — anti-abus : 30 mutations/min par hôte (userId, sinon IP).
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const { searchParams } = new URL(req.url);
    const orderId = (searchParams.get('id') || '').trim();
    if (!orderId) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
    if (!body || !isOrderStatus(body.status)) {
      return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });
    }
    const nextStatus = body.status;

    const order = await db.serviceOrder.findUnique({
      where: { id: orderId },
      select: { id: true, propertyId: true, status: true, deliveryDate: true },
    });
    if (!order) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
    }
    if (!(await canAccessProperty(userId, order.propertyId))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }
    if (!canTransition(order.status as Parameters<typeof canTransition>[0], nextStatus)) {
      return NextResponse.json(
        { error: `Transition impossible : ${order.status} → ${nextStatus}` },
        { status: 400 },
      );
    }

    const updated = await db.serviceOrder.update({
      where: { id: orderId },
      data: {
        status: nextStatus,
        // Horodatage de la livraison (une seule fois)
        ...(nextStatus === 'DELIVERED' && !order.deliveryDate ? { deliveryDate: new Date() } : {}),
      },
      select: { id: true, status: true, deliveryDate: true },
    });

    return NextResponse.json({ ok: true, order: updated });
  } catch (error) {
    console.error('[airbnb/service-orders PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

function emptyStats() {
  return { revenue: 0, commissionTotal: 0, hostTotal: 0, activeCount: 0, pendingCount: 0, deliveredCount: 0, paidRevenue: 0, paidCount: 0, refundedRevenue: 0, refundedCount: 0 };
}
