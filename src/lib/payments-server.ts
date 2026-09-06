import { db } from '@/lib/db';
import { computeSplit, round2, DEFAULT_COMMISSION_RATE } from '@/lib/orders';
import { queueEmail } from '@/lib/email';
// FIX-12 — rendu DB-first : modèles éditables (/admin/emails → Modèles),
// fallback silencieux sur les templates codés en dur.
import {
  renderGuestReceiptEmail,
  renderGuestRefundEmail,
} from '@/lib/email-template-render';

// =============================================================
// ÉTAPE 17.6 + 20 (V3) — Paiement des commandes service (serveur UNIQUEMENT)
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
//  - ÉTAPE 20 : prestataire onboardé → receiverId = compte Express
//    + platformFee (taux recalculé serveur) ; sinon encaissement plateforme
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
    select: {
      id: true,
      paymentStatus: true,
      totalAmount: true,
      status: true,
      // ÉTAPE 22 — reçu invité
      guestName: true,
      guestEmail: true,
      items: true,
      propertyId: true, // ÉTAPE 22 — lookup nominal du bien pour le reçu
      // ÉTAPE 20 — Connect : destinataire réel du reversement (autorité
      // serveur, JAMAIS une metadata Stripe)
      provider: {
        select: { id: true, businessName: true, stripeAccountId: true, stripeChargesEnabled: true },
      },
    },
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

  // ÉTAPE 20 — Connect : si le prestataire est onboardé (charges_enabled),
  // la Transaction trace le reversement : receiverId = compte Express
  // Stripe destinataire, platformFee = commission plateforme (taux
  // SERVEUR recalculé ici, jamais lu d'une metadata).
  // Sinon (modèle 17.6) : encaissement intégral plateforme
  // (receiverId null, platformFee null — reversement manuel futur).
  const connectDestination =
    order.provider?.stripeChargesEnabled && order.provider?.stripeAccountId
      ? order.provider.stripeAccountId
      : null;
  const platformFee = connectDestination
    ? computeSplit(order.totalAmount, DEFAULT_COMMISSION_RATE).commission
    : null;

  await db.transaction.create({
    data: {
      type: 'service_order',
      payerId: null, // invité (non-compte)
      // Connect : ID du compte Stripe destinataire (acct_xxx) ;
      // sinon null = encaissé par la plateforme
      receiverId: connectDestination,
      amount: order.totalAmount,
      currency: 'EUR',
      platformFee,
      stripePaymentId: opts.stripePaymentId ?? null,
      status: 'completed',
      referenceId: serviceOrderId,
    },
  });

  // ÉTAPE 22 — reçu invité (fire-and-forget : jamais d'échec email
  // dans le flux de paiement). Uniquement au marquage réel (idempotent).
  // NB : ServiceOrder n'a pas de relation property → lookup nominal.
  if (order.guestEmail) {
    try {
      const property = order.propertyId
        ? await db.property.findUnique({ where: { id: order.propertyId }, select: { name: true } })
        : null;
      const tpl = await renderGuestReceiptEmail({
        guestName: order.guestName || 'invité',
        orderRef: order.id,
        itemsSummary: orderStripeDescription(order.items),
        amount: order.totalAmount,
        providerName: order.provider?.businessName ?? 'prestataire',
        propertyName: property?.name ?? 'votre logement',
      });
      await queueEmail({
        to: order.guestEmail,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        template: 'guest_receipt',
        propertyId: order.propertyId ?? null,
        referenceType: 'service_order',
        referenceId: order.id,
        meta: { amount: order.totalAmount },
      });
    } catch (error) {
      console.error('[payments] guest receipt email failed:', error);
    }
  }

  return { marked: true, alreadyPaid: false, totalAmount: order.totalAmount };
}

/** Libellé Stripe de la commande : "2× Morning Box L, 1× Croissant" (tronqué). */
export function orderStripeDescription(items: unknown): string {
  const list = Array.isArray(items) ? (items as { name: string; qty: number }[]) : [];
  const summary = list.map((i) => `${i.qty}× ${i.name}`).join(', ') || 'Commande service';
  return summary.slice(0, 220);
}

// =============================================================
// ÉTAPE 21 (V3) — REMBOURSEMENT d'une commande service
//
//  - seul le payer-side réel est remboursé : Stripe refund sur le
//    payment_intent d'origine (destination charge → l'application
//    fee et le transfer sont inversés automatiquement par Stripe) ;
//  - mode DÉMO (dev sans clés) : même chemin d'états sans appel Stripe ;
//  - idempotent : une commande déjà REFUNDED n'est jamais re-traitée ;
//  - le paiement d'origine reste 1 Transaction : son status passe à
//    'refunded' (audit conservé, pas de transaction négative).
// =============================================================

export interface RefundResult {
  notFound: boolean;
  alreadyRefunded: boolean;
  notPaid: boolean;
  refunded: boolean;
  totalAmount: number | null;
  stripeRefundId: string | null;
}

export async function refundServiceOrder(serviceOrderId: string): Promise<RefundResult> {
  const order = await db.serviceOrder.findUnique({
    where: { id: serviceOrderId },
    select: {
      id: true,
      paymentStatus: true,
      totalAmount: true,
      stripePaymentId: true,
      // ÉTAPE 22 — email de remboursement
      guestName: true,
      guestEmail: true,
    },
  });
  if (!order) {
    return { notFound: true, alreadyRefunded: false, notPaid: false, refunded: false, totalAmount: null, stripeRefundId: null };
  }
  if (order.paymentStatus === 'REFUNDED') {
    return { notFound: false, alreadyRefunded: true, notPaid: false, refunded: false, totalAmount: order.totalAmount, stripeRefundId: null };
  }
  if (order.paymentStatus !== 'PAID') {
    return { notFound: false, alreadyRefunded: false, notPaid: true, refunded: false, totalAmount: order.totalAmount, stripeRefundId: null };
  }

  // ── STRIPE RÉEL : refund sur le payment_intent d'origine ──
  let stripeRefundId: string | null = null;
  if (process.env.STRIPE_SECRET_KEY) {
    if (!order.stripePaymentId) {
      console.error(
        `[payments] Commande ${serviceOrderId} : refund impossible, payment_intent manquant (paiement antérieur ?)`,
      );
      return { notFound: false, alreadyRefunded: false, notPaid: true, refunded: false, totalAmount: order.totalAmount, stripeRefundId: null };
    }
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const refund = await stripe.refunds.create(
      { payment_intent: order.stripePaymentId },
      // Destination charge : Stripe inverse application fee + transfer
      // par défaut → l'invité est remboursé intégralement.
      { idempotencyKey: `refund_${serviceOrderId}` },
    );
    stripeRefundId = refund.id;
  }

  // ── Bascule d'état idempotente (garde PAID → REFUNDED) ──
  const updated = await db.serviceOrder.updateMany({
    where: { id: serviceOrderId, paymentStatus: 'PAID' },
    data: { paymentStatus: 'REFUNDED' },
  });
  if (updated.count === 0) {
    // Une requête concurrente a déjà remboursé — idempotence stricte
    return { notFound: false, alreadyRefunded: true, notPaid: false, refunded: false, totalAmount: order.totalAmount, stripeRefundId: null };
  }

  // ── Audit : la Transaction d'origine passe à 'refunded' ──
  await db.transaction.updateMany({
    where: { type: 'service_order', referenceId: serviceOrderId, status: 'completed' },
    data: { status: 'refunded' },
  });

  // ── ÉTAPE 22 — email de confirmation au client (fire-and-forget) ──
  if (order.guestEmail) {
    try {
      const orderRow = await db.serviceOrder.findUnique({
        where: { id: serviceOrderId },
        select: { propertyId: true },
      });
      const property = orderRow?.propertyId
        ? await db.property.findUnique({ where: { id: orderRow.propertyId }, select: { name: true } })
        : null;
      const tpl = await renderGuestRefundEmail({
        guestName: order.guestName || 'invité',
        orderRef: order.id,
        amount: order.totalAmount,
        propertyName: property?.name ?? 'votre logement',
      });
      await queueEmail({
        to: order.guestEmail,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        template: 'guest_refund',
        referenceType: 'service_order',
        referenceId: order.id,
        meta: { amount: order.totalAmount },
      });
    } catch (error) {
      console.error('[payments] guest refund email failed:', error);
    }
  }

  return { notFound: false, alreadyRefunded: false, notPaid: false, refunded: true, totalAmount: order.totalAmount, stripeRefundId };
}
