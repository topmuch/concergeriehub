// =============================================================
// STRIPE WEBHOOK CORE — AUDIT PRÉ-PROD (unification)
//
// Source de vérité UNIQUE du traitement des événements Stripe,
// partagée par les DEUX endpoints webhook :
//   • /api/stripe/webhook           (route canonique)
//   • /api/webhooks/stripe          (route legacy V1 — délègue ici)
//
// AVANT : le webhook legacy avait ses propres handlers (metadata
// subscriberId/subscriberType V1) SANS support serviceOrderId ni
// late_checkout → si Stripe pointait l'URL legacy, les paiements
// commandes/late check-out étaient encaissés JAMAIS confirmés.
// DÉSORMAIS : les deux URLs exécutent exactement le même code.
//
// Événements traités :
//  - checkout.session.completed   → abonnement (metadata userId/plan)
//    OU commande service (metadata serviceOrderId) → PAID + Transaction
//    OU late check-out (metadata type='late_checkout') → booking PAID
//    + Transaction + notification hôte + email invité
//    OU minibar (metadata type='minibar_order') → MinibarOrder PAID
//    + Transaction + notification hôte (AUDIT QA-4 v4.81 : l'invité était
//    débité sans jamais passer la commande en PAID)
//  - charge.refunded              → remboursement fait depuis le Dashboard
//    Stripe : Transaction → 'refunded' + ServiceOrder → 'REFUNDED'
//  - customer.subscription.updated → synchronisation statut/période
//  - customer.subscription.deleted → résiliation + User → 'free'
//  - invoice.payment_failed       → statut past_due
//
// Signature vérifiée via STRIPE_WEBHOOK_SECRET. Sans clés, le
// webhook répond simplement { received: true } (mode démo : la
// mise à jour est faite directement par /api/stripe/checkout).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { db } from '@/lib/db';
import { markServiceOrderPaid } from '@/lib/payments-server';
// PREMIUM V5 — ÉTAPE 3.3 : service de notifications unifié
// (in-app + email + push selon préférences de l'hôte).
import { sendNotificationToMany, propertyOwnerAndManagers } from '@/lib/notifications';
import { queueEmail } from '@/lib/email';
// v4.54 « PRESSING & BLANCHISSERIE EXPRESS » — libellés créneau.
import { pickupSlotLabel } from '@/lib/laundry';
// FIX-14 — monitoring d'erreurs : trace AuditLog (action='runtime.error').
import { captureError } from '@/lib/error-monitor';

const isSimulation = !process.env.STRIPE_SECRET_KEY;

function getStripe(): Stripe {
  // Lazy init pour ne jamais casser le build sans clés
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_placeholder_inert_never_used');
}

const STATUS_MAP: Record<string, string> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  unpaid: 'past_due',
  canceled: 'cancelled',
  incomplete_expired: 'cancelled',
};

/** Point d'entrée unique — appelé par les 2 routes webhook. */
export async function handleStripeWebhook(request: NextRequest): Promise<NextResponse> {
  if (isSimulation) {
    return NextResponse.json({ received: true, mode: 'demo' });
  }

  try {
    const body = await request.text();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = request.headers.get('stripe-signature');

    if (!webhookSecret || !signature) {
      console.error('[stripe webhook] STRIPE_WEBHOOK_SECRET / signature manquante');
      return NextResponse.json({ error: 'Webhook non configuré' }, { status: 500 });
    }

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('[stripe webhook] Signature invalide:', err);
      return NextResponse.json({ error: 'Signature invalide' }, { status: 400 });
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        console.log(`[stripe webhook] Événement non géré: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    // FIX-14 — captureError console.error + trace AuditLog, ne jette jamais.
    await captureError('stripe.webhook', error, undefined, request);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

// ------------------------------------------------------------
// Handlers
// ------------------------------------------------------------

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const { userId, plan, billingCycle, serviceOrderId, serviceOrderIds, type: sessionType, bookingId: lateBookingId, laundryOrderId } = session.metadata ?? {};

  // ── PREMIUM V5 (ÉTAPE 3.3) : late check-out payé (mode 'payment') ──
  if (sessionType === 'late_checkout') {
    await handleLateCheckoutPaid(session, lateBookingId ?? null);
    return;
  }

  // ── v4.54 : commande PRESSING payée (mode 'payment') ──
  if (sessionType === 'pressing_order' && laundryOrderId) {
    await handlePressingOrderPaid(session, laundryOrderId);
    return;
  }

  // ── v4.81 (AUDIT QA) : commande MINIBAR payée (mode 'payment') ──
  // metadata : { type:'minibar_order', orderId, propertyId, hubSlug?, guestName? }
  if (sessionType === 'minibar_order') {
    await handleMinibarOrderPaid(session);
    return;
  }

  // ── REFONTE SERVICES PREMIUM (V4.11) : checkout GROUPÉ du panier ──
  // Une session Checkout pour N commandes (multi-prestataires) :
  // metadata.serviceOrderIds = "id1,id2,…" (≤ 8). markServiceOrderPaid
  // est idempotent → un rejeu du webhook ne paie jamais deux fois.
  if (serviceOrderIds) {
    const ids = serviceOrderIds.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8);
    for (const id of ids) {
      const result = await markServiceOrderPaid(id, {
        stripePaymentId:
          typeof session.payment_intent === 'string' ? session.payment_intent : null,
        stripeSessionId: session.id,
        paidAmount: session.amount_total ? session.amount_total / 100 : null,
      });
      if (result.marked) {
        console.log(`[stripe webhook] Commande service (panier) ${id} PAYÉE`);
      } else if (result.alreadyPaid) {
        console.log(`[stripe webhook] Commande service (panier) ${id} déjà payée (idempotent)`);
      } else {
        console.warn(`[stripe webhook] Commande service (panier) ${id} introuvable`);
      }
    }
    return;
  }

  // ── ÉTAPE 17.6 : commande service payée (mode 'payment') ──
  if (serviceOrderId) {
    const result = await markServiceOrderPaid(serviceOrderId, {
      stripePaymentId:
        typeof session.payment_intent === 'string' ? session.payment_intent : null,
      stripeSessionId: session.id,
      paidAmount: session.amount_total ? session.amount_total / 100 : null,
    });
    if (result.marked) {
      console.log(`[stripe webhook] Commande service ${serviceOrderId} PAYÉE`);
    } else if (result.alreadyPaid) {
      console.log(`[stripe webhook] Commande service ${serviceOrderId} déjà payée (idempotent)`);
    } else {
      console.warn(`[stripe webhook] Commande service ${serviceOrderId} introuvable`);
    }
    return;
  }

  if (!userId || !plan) {
    console.warn('[stripe webhook] checkout.session.completed sans metadata hôte');
    return;
  }

  // v4.81 (AUDIT QA) — Idempotence du chemin abonnement : Stripe rejoue
  // les webhooks. Une session déjà traitée ne recrée JAMAIS une
  // Subscription/Transaction. Deux gardes :
  //   1. Transaction de type 'subscription' dont referenceId = session.id
  //      (referenceId porte désormais l'id de session Stripe d'origine).
  //   2. Subscription existante pour CE user avec le même id d'abonnement
  //      Stripe (rejeu après timeout réseau).
  const stripeSubId = typeof session.subscription === 'string' ? session.subscription : null;
  const existingTx = await db.transaction.findFirst({
    where: { type: 'subscription', referenceId: session.id },
    select: { id: true },
  });
  const existingSub = stripeSubId
    ? await db.subscription.findFirst({
        where: { userId, stripeSubscriptionId: stripeSubId },
        select: { id: true },
      })
    : null;
  if (existingTx || existingSub) {
    console.log(`[stripe webhook] Abonnement déjà traité (idempotent) — user ${userId}, plan ${plan}`);
    return;
  }

  const amount = session.amount_total ? session.amount_total / 100 : 0;
  const cycle = (billingCycle === 'annual' ? 'annual' : 'monthly') as 'annual' | 'monthly';

  const now = new Date();
  const periodEnd = new Date(now);
  if (cycle === 'annual') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  await db.$transaction(async (tx) => {
    // Un seul abonnement actif à la fois
    await tx.subscription.updateMany({
      where: { userId, status: 'active' },
      data: { status: 'cancelled' },
    });

    const subscription = await tx.subscription.create({
      data: {
        subscriberType: 'user',
        userId,
        plan,
        amount,
        currency: (session.currency ?? 'eur').toUpperCase(),
        billingCycle: cycle,
        maxProperties: plan === 'airbnb_pro' ? 10 : 1,
        stripeSubscriptionId:
          typeof session.subscription === 'string' ? session.subscription : null,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        // v4.81 — session Stripe d'origine stockée dans referenceId de la
        // Transaction (idempotence par session.id au rejeu du webhook).
      },
    });

    if (session.payment_status === 'paid' && session.amount_total) {
      await tx.transaction.create({
        data: {
          type: 'subscription',
          payerId: userId,
          amount,
          currency: (session.currency ?? 'eur').toUpperCase(),
          stripePaymentId:
            typeof session.payment_intent === 'string' ? session.payment_intent : null,
          status: 'completed',
          referenceId: session.id,
        },
      });
    }

    // Mise à jour automatique du plan du compte hôte
    await tx.user.update({
      where: { id: userId },
      data: { selectedPlan: plan },
    });
  });

  console.log(`[stripe webhook] Abonnement ${plan} activé pour user ${userId}`);
}

// ------------------------------------------------------------
// PREMIUM V5 (ÉTAPE 3.3) — Late check-out payé
// Idempotent : updateMany (lateCheckoutStatus != 'PAID') → count 0
// = déjà traité (Stripe retente les webhooks, jamais de doublon).
// ------------------------------------------------------------
async function handleLateCheckoutPaid(
  session: Stripe.Checkout.Session,
  bookingId: string | null,
) {
  const amount = session.amount_total ? session.amount_total / 100 : null;
  const paidIntent = typeof session.payment_intent === 'string' ? session.payment_intent : null;

  if (!bookingId) {
    console.warn('[stripe webhook] late_checkout sans metadata bookingId — paiement ignoré (à rembourser si réel)');
    return;
  }

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      guestName: true,
      guestEmail: true,
      lateCheckoutStatus: true,
      propertyId: true,
      property: { select: { name: true, qrHubSlug: true } },
    },
  });
  if (!booking) {
    console.warn(`[stripe webhook] late_checkout : booking ${bookingId} introuvable`);
    return;
  }

  // Idempotence stricte : un booking déjà PAID n'est jamais re-traité.
  const updated = await db.booking.updateMany({
    where: { id: booking.id, lateCheckoutStatus: { not: 'PAID' } },
    data: { lateCheckoutStatus: 'PAID', lateCheckoutPaidAt: new Date() },
  });
  if (updated.count === 0) {
    console.log(`[stripe webhook] late_checkout : booking ${booking.id} déjà PAYÉ (idempotent)`);
    return;
  }

  // Transaction comptable (type dédié, distingue des abonnements
  // et des commandes service).
  await db.transaction
    .create({
      data: {
        type: 'late_checkout',
        payerId: null, // invité (non-compte)
        amount: amount ?? 0,
        currency: (session.currency ?? 'eur').toUpperCase(),
        stripePaymentId: paidIntent,
        status: 'completed',
        referenceId: booking.id,
      },
    })
    .catch((error) => console.error('[stripe webhook] Transaction late_checkout failed:', error));

  const firstName = booking.guestName.trim().split(/\s+/)[0] || booking.guestName;
  const amountLabel = amount != null ? ` (${amount.toFixed(2).replace('.', ',')} €)` : '';

  // ✅ Notification hôte + managers : « [Nom] a payé pour un départ tardif à 14h »
  const audience = await propertyOwnerAndManagers(booking.propertyId);
  await sendNotificationToMany(audience, 'late_checkout_paid', {
    title: `✅ ${firstName} a payé pour un départ tardif à 14h`,
    body:
      `${booking.property.name} : le départ tardif de ${booking.guestName} est réglé${amountLabel}. ` +
      'Prévoyez une remise des clés à 14 h au lieu de 11 h.',
    propertyId: booking.propertyId,
    propertyName: booking.property.name,
    url: '/airbnb/dashboard',
    meta: {
      source: 'stripe_webhook',
      bookingId: booking.id,
      amount,
      stripePaymentId: paidIntent,
      hubSlug: booking.property.qrHubSlug,
    },
  });

  // Confirmation invité (fire-and-forget — jamais bloquant)
  if (booking.guestEmail) {
    queueEmail({
      to: booking.guestEmail,
      subject: `✅ Départ tardif confirmé — 14 h à ${booking.property.name}`,
      html:
        `<p style="margin:0 0 12px">Bonjour <strong>${escapeHtmlClient(firstName)}</strong>,</p>` +
        `<p style="margin:0 0 12px">Votre départ tardif est <strong>confirmé</strong> ✅ — vous pouvez quitter ` +
        `<strong>${escapeHtmlClient(booking.property.name)}</strong> jusqu'à <strong>14 h</strong>${amountLabel}.</p>` +
        `<p style="margin:0;color:#64748b;font-size:13px">Merci et à bientôt !</p>`,
      text: `Votre départ tardif est confirmé — départ à 14 h à ${booking.property.name}.`,
      template: 'custom',
      propertyId: booking.propertyId,
      referenceType: 'late_checkout',
      referenceId: booking.id,
      meta: { stripePaymentId: paidIntent, amount },
    }).catch(() => undefined);
  }

  console.log(`[stripe webhook] Late check-out PAYÉ — booking ${booking.id} (${booking.property.name})`);
}

/** Échappe les caractères HTML d'un fragment texte (emails). */
function escapeHtmlClient(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ------------------------------------------------------------
// v4.54 « PRESSING & BLANCHISSERIE EXPRESS » — commande payée
// Idempotent : updateMany (status != 'PAID') → count 0 = déjà traité.
// ------------------------------------------------------------
async function handlePressingOrderPaid(
  session: Stripe.Checkout.Session,
  laundryOrderId: string,
) {
  const amount = session.amount_total ? session.amount_total / 100 : null;
  const paidIntent = typeof session.payment_intent === 'string' ? session.payment_intent : null;

  const order = await db.laundryOrder.findUnique({
    where: { id: laundryOrderId },
    select: {
      id: true,
      guestName: true,
      serviceType: true,
      pieces: true,
      pickupSlot: true,
      amountEur: true,
      status: true,
      propertyId: true,
      bookingId: true,
      property: { select: { name: true } },
    },
  });
  if (!order) {
    console.warn(`[stripe webhook] pressing_order : commande ${laundryOrderId} introuvable`);
    return;
  }

  // Idempotence stricte : une commande déjà PAID n'est jamais re-traitée.
  const updated = await db.laundryOrder.updateMany({
    where: { id: order.id, status: { not: 'PAID' } },
    data: { status: 'PAID', paidAt: new Date() },
  });
  if (updated.count === 0) {
    console.log(`[stripe webhook] pressing_order : commande ${order.id} déjà PAYÉE (idempotent)`);
    return;
  }

  // Transaction comptable (type dédié).
  await db.transaction
    .create({
      data: {
        type: 'pressing_order',
        payerId: null, // invité (non-compte)
        amount: amount ?? order.amountEur,
        currency: (session.currency ?? 'eur').toUpperCase(),
        stripePaymentId: paidIntent,
        status: 'completed',
        referenceId: order.id,
      },
    })
    .catch((error) => console.error('[stripe webhook] Transaction pressing_order failed:', error));

  const SERVICE_LABELS: Record<string, string> = {
    ironing: 'Repassage Express',
    washing: 'Lessive Complète (1 panier)',
    drycleaning: 'Pressing à Sec',
  };
  const serviceLabel = SERVICE_LABELS[order.serviceType] ?? order.serviceType;
  const firstName = (order.guestName ?? 'Un invité').trim().split(/\s+/)[0];
  const amountLabel = amount != null ? ` (${amount.toFixed(2).replace('.', ',')} €)` : '';

  // ✅ Notification hôte + managers : commande pressing réglée.
  const audience = await propertyOwnerAndManagers(order.propertyId);
  await sendNotificationToMany(audience, 'pressing_order', {
    title: `✅ ${firstName} a réglé sa commande pressing${amountLabel}`,
    body:
      `${order.property.name} : ${serviceLabel} — récupération ${pickupSlotLabel(order.pickupSlot)}. ` +
      'Le paiement par carte est confirmé, lancez le service.',
    propertyId: order.propertyId,
    propertyName: order.property.name,
    url: '/airbnb/orders',
    meta: {
      source: 'stripe_webhook',
      laundryOrderId: order.id,
      bookingId: order.bookingId,
      amount,
      stripePaymentId: paidIntent,
    },
  });

  console.log(`[stripe webhook] Pressing PAYÉ — order ${order.id} (${order.property.name})`);
}

// ------------------------------------------------------------
// v4.81 (AUDIT QA-4) — Commande MINIBAR payée
// metadata : { type:'minibar_order', orderId, propertyId, hubSlug?, guestName? }
// Idempotent : updateMany (status != 'PAID') → count 0 = déjà traité.
// ------------------------------------------------------------
async function handleMinibarOrderPaid(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId;
  const propertyId = session.metadata?.propertyId;
  const amount = session.amount_total ? session.amount_total / 100 : null;
  const paidIntent = typeof session.payment_intent === 'string' ? session.payment_intent : null;

  if (!orderId) {
    console.warn('[stripe webhook] minibar_order sans metadata orderId — paiement ignoré');
    return;
  }

  const order = await db.minibarOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      guestName: true,
      itemsJson: true,
      totalEur: true,
      status: true,
      propertyId: true,
      property: { select: { name: true } },
    },
  });
  if (!order) {
    console.warn(`[stripe webhook] minibar_order : commande ${orderId} introuvable`);
    return;
  }

  // Idempotence stricte : une commande déjà PAID n'est jamais re-traitée.
  const updated = await db.minibarOrder.updateMany({
    where: { id: order.id, status: { not: 'PAID' } },
    data: { status: 'PAID', payment: 'stripe' },
  });
  if (updated.count === 0) {
    console.log(`[stripe webhook] minibar_order : commande ${order.id} déjà PAYÉE (idempotent)`);
    return;
  }

  // Transaction comptable (type dédié).
  await db.transaction
    .create({
      data: {
        type: 'minibar_order',
        payerId: null, // invité (non-compte)
        amount: amount ?? order.totalEur,
        currency: (session.currency ?? 'eur').toUpperCase(),
        stripePaymentId: paidIntent,
        status: 'completed',
        referenceId: order.id,
      },
    })
    .catch((error) => console.error('[stripe webhook] Transaction minibar_order failed:', error));

  // Détail lisible pour la notification (itemsJson = [{name, qty, unitPrice}]).
  let itemsSummary = 'consommation minibar';
  try {
    const items = JSON.parse(order.itemsJson) as Array<{ name?: string; qty?: number }>;
    if (Array.isArray(items) && items.length > 0) {
      itemsSummary = items
        .map((it) => `${it.qty ?? 1} × ${it.name ?? 'article'}`)
        .join(', ');
    }
  } catch {
    // JSON invalide → libellé générique (ne bloque jamais le webhook).
  }

  const firstName = (order.guestName ?? session.metadata?.guestName ?? 'Un invité')
    .trim()
    .split(/\s+/)[0];
  const amountLabel = amount != null ? ` (${amount.toFixed(2).replace('.', ',')} €)` : '';

  // ✅ Notification hôte + managers : encaissement minibar confirmé.
  const audience = await propertyOwnerAndManagers(propertyId || order.propertyId);
  await sendNotificationToMany(audience, 'minibar_order', {
    title: `✅ ${firstName} a réglé sa consommation minibar${amountLabel}`,
    body: `${order.property.name} : ${itemsSummary}. Le paiement par carte est confirmé.`,
    propertyId: propertyId || order.propertyId,
    propertyName: order.property.name,
    url: '/airbnb/orders',
    meta: {
      source: 'stripe_webhook',
      minibarOrderId: order.id,
      amount,
      stripePaymentId: paidIntent,
    },
  });

  console.log(`[stripe webhook] Minibar PAYÉ — order ${order.id} (${order.property.name})`);
}

// ------------------------------------------------------------
// v4.81 (AUDIT QA-4) — Remboursement fait depuis le DASHBOARD Stripe
// (hors application) : on réplique l'état en base.
// Idempotent : updateMany (status = 'completed') → count 0 = déjà traité.
// ------------------------------------------------------------
async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntent = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
  if (!paymentIntent) {
    console.warn('[stripe webhook] charge.refunded sans payment_intent');
    return;
  }

  const amount = charge.amount_refunded ? charge.amount_refunded / 100 : null;

  // 1. La (les) Transaction(s) d'origine passent à 'refunded'.
  const updatedTx = await db.transaction.updateMany({
    where: { stripePaymentId: paymentIntent, status: 'completed' },
    data: { status: 'refunded' },
  });

  // 2. Les commandes service liées passent à REFUNDED (garde PAID only).
  const orders = await db.serviceOrder.findMany({
    where: { stripePaymentId: paymentIntent, paymentStatus: 'PAID' },
    select: { id: true },
  });
  for (const order of orders) {
    await db.serviceOrder.updateMany({
      where: { id: order.id, paymentStatus: 'PAID' },
      data: { paymentStatus: 'REFUNDED' },
    });
  }

  if (updatedTx.count === 0 && orders.length === 0) {
    // Remboursement d'un paiement inconnu de la base (abonnement Stripe
    // direct, paiement antérieur à RoomScan…) — on trace et on sort.
    console.log(`[stripe webhook] charge.refunded : aucun enregistrement local pour ${paymentIntent}`);
    return;
  }

  console.log(
    `[stripe webhook] Remboursement répliqué — intent ${paymentIntent} : ${updatedTx.count} transaction(s), ${orders.length} commande(s)`,
  );
  // NB : le montant remboursé est volontairement loggé, pas comptabilisé
  // en nouvelle ligne (la Transaction d'origine est basculée 'refunded').
  void amount;
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const existing = await db.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });
  if (!existing) {
    console.warn(`[stripe webhook] Subscription ${subscription.id} absente en base`);
    return;
  }

  const newStatus = STATUS_MAP[subscription.status] ?? existing.status;

  // Stripe v22 (API basil) : les périodes vivent sur items.data[0]
  const item = subscription.items?.data?.[0];

  await db.subscription.update({
    where: { id: existing.id },
    data: {
      status: newStatus,
      ...(item?.current_period_start && {
        currentPeriodStart: new Date(item.current_period_start * 1000),
      }),
      ...(item?.current_period_end && {
        currentPeriodEnd: new Date(item.current_period_end * 1000),
      }),
    },
  });

  // Abonnement réactivé → remonte le plan sur le compte
  if (newStatus === 'active' && existing.userId) {
    await db.user.update({
      where: { id: existing.userId },
      data: { selectedPlan: existing.plan },
    });
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const existing = await db.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });
  if (!existing) {
    console.warn(`[stripe webhook] Subscription ${subscription.id} absente (deleted)`);
    return;
  }

  await db.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: existing.id },
      data: { status: 'cancelled' },
    });
    if (existing.userId) {
      await tx.user.update({
        where: { id: existing.userId },
        data: { selectedPlan: 'free' },
      });
    }
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  // Stripe v22 : l'abonnement est porté par invoice.parent.subscription_details
  const rawParent = invoice.parent?.subscription_details?.subscription;
  const legacy = (invoice as unknown as { subscription?: string }).subscription;
  const stripeSubId = typeof rawParent === 'string' ? rawParent : (rawParent?.id ?? legacy ?? null);
  if (!stripeSubId) return;

  const existing = await db.subscription.findFirst({
    where: { stripeSubscriptionId: stripeSubId },
  });
  if (!existing) return;

  await db.subscription.update({
    where: { id: existing.id },
    data: { status: 'past_due' },
  });
}
