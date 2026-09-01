import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
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
    const property = requestedId
      ? properties.find((p) => p.id === requestedId) ?? properties[0]
      : properties[0];

    if (!property) {
      return NextResponse.json({
        properties: [],
        property: null,
        orders: [],
        stats: emptyStats(),
      });
    }
    if (!(await canAccessProperty(userId, property.id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const orders = await db.serviceOrder.findMany({
      where: { propertyId: property.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
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
        provider: { select: { businessName: true, category: true } },
      },
    });

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
    for (const o of orders) {
      if (o.status === 'CANCELLED') continue;
      revenue += o.totalAmount;
      commissionTotal += o.commission;
      hostTotal += o.hostEarning;
      if (o.paymentStatus === 'PAID') {
        paidRevenue += o.totalAmount;
        paidCount++;
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
      orders,
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
  return { revenue: 0, commissionTotal: 0, hostTotal: 0, activeCount: 0, pendingCount: 0, deliveredCount: 0, paidRevenue: 0, paidCount: 0 };
}
