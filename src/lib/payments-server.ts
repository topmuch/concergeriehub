import { db } from '@/lib/db';
import { round2 } from '@/lib/orders';

// =============================================================
// ÉTAPE 17.6 (V3) — Paiement des commandes service (serveur UNIQUEMENT)
//
// Partagé par :
//  - le webhook Stripe (checkout.session.completed avec metadata
//    serviceOrderId — source de vérité du paiement réel)
//  - le mode DÉMO de POST /api/public/service-orders/[id]/pay
//    (dev sans clés — même chemin de code que le webhook)
//
// Invariants :
//  - idempotent : une commande déjà PAID n'est jamais re-marquée ni
//    double-transactionnée (updateMany sur UNPAID → count = 0 → no-op)
//  - le montant enregistré reste totalAmount (autorité serveur fixée
//    à la création) — le montant Stripe n'est qu'une vérification
//  - la Transaction distingue type 'service_order' des abonnements
// =============================================================

export const SERVICE_ORDER_PAYMENT_STATUSES = ['UNPAID', 'PAID', 'REFUNDED', 'FAILED'] as const;
export type ServiceOrderPaymentStatus = (typeof SERVICE_ORDER_PAYMENT_STATUSES)[number];

export interface MarkPaidResult {
  marked: boolean;          // false = déjà payée (idempotence) ou introuvable
  alreadyPaid: boolean;
  totalAmount: number | null;
}

/**
 * Marque une commande service PAYÉE + journalise la Transaction.
 * Idempotent : appelable plusieurs fois (webhook retenté par Stripe,
 * double POST démo…) sans doublon ni écrasement.
 */
export async function markServiceOrderPaid(
  serviceOrderId: string,
  opts: { stripePaymentId?: string | null; stripeSessionId?: string | null; paidAmount?: number | null } = {},
): Promise<MarkPaidResult> {
  const order = await db.serviceOrder.findUnique({
    where: { id: serviceOrderId },
    select: { id: true, paymentStatus: true, totalAmount: true, status: true },
  });
  if (!order) return { marked: false, alreadyPaid: false, totalAmount: null };
  if (order.paymentStatus === 'PAID') {
    return { marked: false, alreadyPaid: true, totalAmount: order.totalAmount };
  }

  // Vérification anti-fraude : le montant Stripe confirmé doit couvrir
  // le montant serveur. Un écart n'annule PAS l'encaissement réel (le
  // client a payé), mais on garde totalAmount comme autorité compta.
  if (opts.paidAmount != null && round2(opts.paidAmount) < order.totalAmount) {
    console.warn(
      `[payments] Commande ${serviceOrderId} : montant Stripe ${(opts.paidAmount).toFixed(2)} < totalAmount ${order.totalAmount.toFixed(2)} — encaissement partiel ?`,
    );
  }

  const updated = await db.serviceOrder.updateMany({
    where: { id: serviceOrderId, paymentStatus: { not: 'PAID' } },
    data: {
      paymentStatus: 'PAID',
      paidAt: new Date(),
      ...(opts.stripePaymentId ? { stripePaymentId: opts.stripePaymentId } : {}),
      ...(opts.stripeSessionId ? { stripeSessionId: opts.stripeSessionId } : {}),
    },
  });

  if (updated.count === 0) {
    // Une requête concurrente a payé entre-temps — idempotence stricte
    return { marked: false, alreadyPaid: true, totalAmount: order.totalAmount };
  }

  await db.transaction.create({
    data: {
      type: 'service_order',
      payerId: null, // invité (non-compte)
      receiverId: null, // encaissé par la plateforme — reversement hôte/prestataire : étape future
      amount: order.totalAmount,
      currency: 'EUR',
      stripePaymentId: opts.stripePaymentId ?? null,
      status: 'completed',
      referenceId: serviceOrderId,
    },
  });

  return { marked: true, alreadyPaid: false, totalAmount: order.totalAmount };
}

/** Libellé Stripe de la commande : "2× Morning Box L, 1× Croissant" (tronqué). */
export function orderStripeDescription(items: unknown): string {
  const list = Array.isArray(items) ? (items as { name: string; qty: number }[]) : [];
  const summary = list.map((i) => `${i.qty}× ${i.name}`).join(', ') || 'Commande service';
  return summary.slice(0, 220);
}
