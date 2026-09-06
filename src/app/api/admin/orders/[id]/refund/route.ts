// =============================================================
// /api/admin/orders/[id]/refund — Module 6 Transactions (AUD-FULL ④)
//
//   POST /api/admin/orders/<id>/refund
//
// Interface Superadmin de remboursement : réutilise À L'IDENTIQUE le
// moteur refundServiceOrder() (lib/payments-server), déjà éprouvé par
// la route hôte /api/airbnb/service-orders/[id]/refund.
//
//  - 🔒 Superadmin (requireSuperadmin, même garde que /api/admin/*) ;
//  - remboursement TOTAL uniquement : le moteur n'accepte pas de montant
//    partiel (signature refundServiceOrder(serviceOrderId) sans option
//    amount) — Stripe refund sur le payment_intent d'origine, idempotent
//    (application fee + transfer inversés automatiquement par Stripe) ;
//  - sans clé STRIPE_SECRET_KEY, le moteur fonctionne en MODE DÉMO :
//    mêmes transitions d'états traçées en base, sans appel Stripe ;
//  - gardes métier : 404 introuvable, 409 déjà REFUNDED, 409 non payée
//    (le moteur re-valide idempotemment en second rideau) ;
//  - mutation journalisée via logAudit('refund.admin') : montant,
//    stripeRefundId, mode, invité, prestataire.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { refundServiceOrder } from '@/lib/payments-server';
import { logAudit, clientIp } from '@/lib/audit';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const { id } = await params;
    const orderId = (id || '').trim();
    if (!orderId) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
    }

    // Lecture pour les gardes métier + détails d'audit. NB : le moteur
    // refundServiceOrder re-lit lui-même la commande (idempotence stricte).
    const order = await db.serviceOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        guestName: true,
        totalAmount: true,
        status: true,
        paymentStatus: true,
        provider: { select: { id: true, businessName: true } },
      },
    });
    if (!order) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
    }
    if (order.paymentStatus === 'REFUNDED') {
      return NextResponse.json(
        { error: 'Cette commande a déjà été remboursée.' },
        { status: 409 },
      );
    }
    if (order.paymentStatus !== 'PAID') {
      // UNPAID / FAILED : aucun encaissement à rembourser.
      return NextResponse.json(
        { error: 'Seule une commande payée peut être remboursée — cette commande est impayée.' },
        { status: 409 },
      );
    }

    // Moteur partagé : Stripe réel si STRIPE_SECRET_KEY est configurée,
    // sinon mode démo (bascule d'états traçée en base, sans appel Stripe).
    const result = await refundServiceOrder(orderId);
    if (result.notFound) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
    }
    if (result.alreadyRefunded) {
      return NextResponse.json(
        { error: 'Cette commande a déjà été remboursée.' },
        { status: 409 },
      );
    }
    if (result.notPaid) {
      // Commande encore PAID au pré-check mais refund refusé : cas
      // Stripe réel avec payment_intent manquant (paiement antérieur).
      return NextResponse.json(
        { error: 'Remboursement impossible : aucun payment_intent Stripe rattaché à cette commande.' },
        { status: 409 },
      );
    }
    if (!result.refunded) {
      return NextResponse.json({ error: 'Le remboursement a échoué.' }, { status: 500 });
    }

    // stripeRefundId null → mode démo (sans clé Stripe) ; sinon refund réel.
    const mode = result.stripeRefundId ? 'stripe' : 'demo';

    await logAudit({
      actor: admin,
      action: 'refund.admin',
      entityType: 'serviceOrder',
      entityId: order.id,
      details: {
        amount: result.totalAmount,
        stripeRefundId: result.stripeRefundId,
        mode,
        guestName: order.guestName,
        provider: order.provider?.businessName ?? null,
      },
      ip: clientIp(req.headers),
    });

    return NextResponse.json({
      success: true,
      refund: {
        orderId: order.id,
        paymentStatus: 'REFUNDED',
        totalAmount: result.totalAmount,
        stripeRefundId: result.stripeRefundId,
        mode,
      },
    });
  } catch (error) {
    console.error('[POST /api/admin/orders/[id]/refund] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
