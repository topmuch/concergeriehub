// =============================================================
// /api/stripe/webhook — ÉTAPE 10 : webhook Stripe (abonnements HÔTE)
//
// Événements traités :
//  - checkout.session.completed   → activation (Subscription active
//    + Transaction + User.selectedPlan mis à jour automatiquement)
//  - customer.subscription.updated → synchronisation statut/période
//    (active, past_due, cancelled…)
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

const isSimulation = !process.env.STRIPE_SECRET_KEY;

function getStripe(): Stripe {
  // Lazy init pour ne jamais casser le build sans clés
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
}

const STATUS_MAP: Record<string, string> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  unpaid: 'past_due',
  canceled: 'cancelled',
  incomplete_expired: 'cancelled',
};

export async function POST(request: NextRequest) {
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
    console.error('[stripe webhook] Error:', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

// ------------------------------------------------------------
// Handlers
// ------------------------------------------------------------

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const { userId, plan, billingCycle } = session.metadata ?? {};
  if (!userId || !plan) {
    console.warn('[stripe webhook] checkout.session.completed sans metadata hôte');
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
          referenceId: subscription.id,
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
