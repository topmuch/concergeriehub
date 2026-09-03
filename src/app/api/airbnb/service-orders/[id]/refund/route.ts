import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserRoleForProperty } from '@/lib/b2b-server';
import { refundServiceOrder } from '@/lib/payments-server';

// =============================================================
// ÉTAPE 21 (V3) — REMBOURSEMENT d'une commande service (côté HÔTE)
//
//   POST /api/airbnb/service-orders/[id]/refund
//
//  - Garde FINANCIÈRE : OWNER ou MANAGER du bien uniquement
//    (CLEANER/MAINTENANCE ne touchent pas à l'argent) ;
//  - la commande doit appartenir à un bien auquel l'hôte a accès
//    (anti-IDOR : jamais d'ID client naïf) ;
//  - seule une commande PAID est remboursable (PENDING/FAILED/CANCELLED
//    non payée → refus) ;
//  - Stripe réel : refund sur le payment_intent d'origine (idempotent,
//    application fee + transfer inversés automatiquement) ;
//    démo dev : mêmes états, sans appel Stripe.
//  - 1 paiement = 1 Transaction (status → 'refunded', audit conservé).
// =============================================================

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const { id } = await params;
    const orderId = (id || '').trim();
    if (!orderId) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 400 });
    }

    const order = await db.serviceOrder.findUnique({
      where: { id: orderId },
      select: { id: true, propertyId: true, paymentStatus: true },
    });
    if (!order) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
    }

    // Garde financière : OWNER/MANAGER du bien (jamais un ID client)
    const role = await getUserRoleForProperty(userId, order.propertyId);
    if (role !== 'OWNER' && role !== 'MANAGER') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const result = await refundServiceOrder(orderId);
    if (result.notFound) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
    }
    if (result.notPaid) {
      return NextResponse.json(
        { error: 'Seule une commande payée peut être remboursée.' },
        { status: 400 },
      );
    }
    if (result.alreadyRefunded) {
      return NextResponse.json({ ok: true, alreadyRefunded: true, paymentStatus: 'REFUNDED' });
    }

    return NextResponse.json({
      ok: true,
      refunded: true,
      paymentStatus: 'REFUNDED',
      totalAmount: result.totalAmount,
      ...(result.stripeRefundId ? { stripeRefundId: result.stripeRefundId } : {}),
    });
  } catch (error) {
    console.error('[airbnb/service-orders/refund POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
