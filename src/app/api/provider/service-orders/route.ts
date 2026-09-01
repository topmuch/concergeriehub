import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { canTransition, isOrderStatus, type OrderStatus } from '@/lib/orders';

// =============================================================
// ÉTAPE 17.4 (V3) — API du PORTAIL PRESTATAIRE
//   GET   /api/provider/service-orders
//     → profil prestataire (résolu depuis la SESSION → providerProfile,
//       jamais d'ID client) + ses commandes + stats.
//   PATCH /api/provider/service-orders?id=<orderId>  { status }
//     → transition du cycle de vie (PENDING → CONFIRMED →
//       PREPARING → DELIVERED / CANCELLED), uniquement sur SES
//       commandes (where id + providerId).
//
// ⚠️ La part hôte (hostEarning) n'est JAMAIS retournée au
// prestataire — contrat entre Conciergerie Hub et l'hôte.
// ÉTAPE 17.6 — paymentStatus/paidAt exposés au prestataire
//   + stat « encaissé » (somme des commandes PAID hors annulées).
// Never-throw : try/catch global → { error } 500.
// =============================================================

interface ProviderIdentity {
  id: string;
  businessName: string;
  category: string;
  audience: string;
  ratingAvg: number;
  totalReviews: number;
}

/** Résout le profil prestataire depuis la session (ou null). */
async function resolveProvider(userId: string): Promise<ProviderIdentity | null> {
  const provider = await db.provider.findUnique({
    where: { userId },
    select: {
      id: true,
      businessName: true,
      category: true,
      audience: true,
      ratingAvg: true,
      totalReviews: true,
      isActive: true,
    },
  });
  if (!provider || !provider.isActive) return null;
  return provider;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
    }

    const provider = await resolveProvider(userId);
    if (!provider) {
      return NextResponse.json(
        { error: 'Aucun profil prestataire actif pour ce compte.' },
        { status: 403 },
      );
    }

    const orders = await db.serviceOrder.findMany({
      where: { providerId: provider.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        guestName: true,
        guestEmail: true,
        items: true,
        totalAmount: true,
        commission: true,
        status: true,
        // ÉTAPE 17.6 — visibilité paiement côté prestataire
        paymentStatus: true,
        paidAt: true,
        deliveryDate: true,
        createdAt: true,
        propertyId: true,
        // ⚠️ hostEarning volontairement NON sélectionné.
      },
    });

    // ServiceOrder n'a PAS de relation Property (choix 17.1 : trace
    // financière sans FK) → noms de biens résolus en 2e requête.
    const propertyIds = Array.from(
      new Set(orders.map((o) => o.propertyId).filter(Boolean)),
    );
    const properties = await db.property.findMany({
      where: { id: { in: propertyIds } },
      select: { id: true, name: true },
    });
    const propertyNameById = new Map(properties.map((p) => [p.id, p.name]));

    // Stats (hors commandes annulées)
    let revenue = 0;
    let commissionTotal = 0;
    let activeCount = 0;
    let pendingCount = 0;
    let preparingCount = 0;
    let deliveredCount = 0;
    // ÉTAPE 17.6 — encaissé = commandes réellement payées (hors annulées)
    let paidRevenue = 0;
    for (const o of orders) {
      if (o.status === 'CANCELLED') continue;
      revenue += o.totalAmount;
      commissionTotal += o.commission;
      if (o.paymentStatus === 'PAID') {
        paidRevenue += o.totalAmount;
      }
      if (o.status === 'DELIVERED') {
        deliveredCount += 1;
      } else {
        activeCount += 1;
        if (o.status === 'PENDING') pendingCount += 1;
        if (o.status === 'PREPARING') preparingCount += 1;
      }
    }

    return NextResponse.json({
      provider: {
        businessName: provider.businessName,
        category: provider.category,
        audience: provider.audience,
        ratingAvg: provider.ratingAvg,
        totalReviews: provider.totalReviews,
      },
      orders: orders.map((o) => ({
        id: o.id,
        guestName: o.guestName,
        guestEmail: o.guestEmail,
        items: o.items,
        totalAmount: o.totalAmount,
        commission: o.commission,
        status: o.status,
        // ÉTAPE 17.6
        paymentStatus: o.paymentStatus,
        paidAt: o.paidAt,
        deliveryDate: o.deliveryDate,
        createdAt: o.createdAt,
        property: { name: propertyNameById.get(o.propertyId) ?? 'Logement' },
      })),
      stats: {
        activeCount,
        pendingCount,
        preparingCount,
        deliveredCount,
        revenue: Math.round(revenue * 100) / 100,
        commissionTotal: Math.round(commissionTotal * 100) / 100,
        // ÉTAPE 17.6
        paidRevenue: Math.round(paidRevenue * 100) / 100,
      },
    });
  } catch (error) {
    console.error('[provider/service-orders GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur. Réessayez.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
    }

    const provider = await resolveProvider(userId);
    if (!provider) {
      return NextResponse.json(
        { error: 'Aucun profil prestataire actif pour ce compte.' },
        { status: 403 },
      );
    }

    const url = new URL(req.url);
    const orderId = (url.searchParams.get('id') || '').trim();
    if (!orderId) {
      return NextResponse.json({ error: 'Commande manquante.' }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
    if (!body || !isOrderStatus(body.status)) {
      return NextResponse.json({ error: 'Statut invalide.' }, { status: 400 });
    }
    const nextStatus = body.status as OrderStatus;

    // ⚠️ Scoping : la commande DOIT appartenir à CE prestataire.
    const order = await db.serviceOrder.findFirst({
      where: { id: orderId, providerId: provider.id },
      select: { id: true, status: true },
    });
    if (!order) {
      return NextResponse.json({ error: 'Commande introuvable.' }, { status: 404 });
    }

    if (!canTransition(order.status as OrderStatus, nextStatus)) {
      return NextResponse.json(
        { error: `Transition impossible : ${order.status} → ${nextStatus}.` },
        { status: 400 },
      );
    }

    await db.serviceOrder.update({
      where: { id: order.id },
      data: {
        status: nextStatus,
        // Horodatage unique à la livraison
        ...(nextStatus === 'DELIVERED' ? { deliveryDate: new Date() } : {}),
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (error) {
    console.error('[provider/service-orders PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur. Réessayez.' }, { status: 500 });
  }
}
