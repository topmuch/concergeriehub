import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Lazy Stripe init to avoid build-time crash when STRIPE_SECRET_KEY is missing
let _stripe: InstanceType<typeof import('stripe').default> | null = null;
function getStripe() {
  if (!_stripe) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Stripe = require('stripe');
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
      apiVersion: '2024-06-20',
    });
  }
  return _stripe;
}
const isSimulation = !process.env.STRIPE_SECRET_KEY;

// POST: Stripe webhook endpoint
export async function POST(request: NextRequest) {
  try {
    // Simulation mode: no real Stripe events
    if (isSimulation) {
      return NextResponse.json({ received: true });
    }

    const body = await request.text();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[stripe webhook] STRIPE_WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { error: 'Webhook non configuré' },
        { status: 500 }
      );
    }

    // Verify Stripe signature
    let event: any;
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Signature Stripe manquante' },
        { status: 400 }
      );
    }

    try {
      event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('[stripe webhook] Signature verification failed:', err);
      return NextResponse.json(
        { error: 'Signature invalide' },
        { status: 400 }
      );
    }

    // Handle events
    const S = await import('stripe');
    switch (event.type) {
      case 'checkout.session.completed': {
        await handleCheckoutCompleted(event.data.object as S.Checkout.Session);
        break;
      }
      case 'customer.subscription.updated': {
        await handleSubscriptionUpdated(event.data.object as S.Subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        await handleSubscriptionDeleted(event.data.object as S.Subscription);
        break;
      }
      case 'invoice.payment_failed': {
        await handlePaymentFailed(event.data.object as S.Invoice);
        break;
      }
      default:
        console.log(`[stripe webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[stripe webhook] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// --- Event Handlers ---

async function handleCheckoutCompleted(session: any) {
  const { subscriberId, subscriberType, plan } = session.metadata || {};

  if (!subscriberId || !subscriberType || !plan) {
    console.warn('[stripe webhook] checkout.session.completed missing metadata');
    return;
  }

  // Create subscription record
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await db.subscription.create({
    data: {
      subscriberId,
      subscriberType,
      plan,
      amount: session.amount_total ? session.amount_total / 100 : 0,
      currency: (session.currency?.toUpperCase() || 'EUR'),
      stripeSubscriptionId: session.subscription as string || null,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });

  // Create transaction
  if (session.payment_status === 'paid' && session.amount_total) {
    await db.transaction.create({
      data: {
        type: 'subscription',
        payerId: subscriberId,
        amount: session.amount_total / 100,
        currency: session.currency?.toUpperCase() || 'EUR',
        stripePaymentId: session.payment_intent as string || null,
        status: 'completed',
        referenceId: session.subscription as string || null,
      },
    });
  }
}

async function handleSubscriptionUpdated(subscription: any) {
  const stripeSubId = subscription.id;

  const existing = await db.subscription.findFirst({
    where: { stripeSubscriptionId: stripeSubId },
  });

  if (!existing) {
    console.warn(`[stripe webhook] Subscription ${stripeSubId} not found in DB`);
    return;
  }

  const statusMap: Record<string, string> = {
    active: 'active',
    past_due: 'past_due',
    canceled: 'cancelled',
    unpaid: 'past_due',
    trialing: 'active',
  };

  const newStatus = statusMap[subscription.status] || existing.status;

  const periodStart = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000)
    : undefined;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : undefined;

  await db.subscription.update({
    where: { id: existing.id },
    data: {
      status: newStatus,
      ...(periodStart && { currentPeriodStart: periodStart }),
      ...(periodEnd && { currentPeriodEnd: periodEnd }),
    },
  });
}

async function handleSubscriptionDeleted(subscription: any) {
  const stripeSubId = subscription.id;

  const existing = await db.subscription.findFirst({
    where: { stripeSubscriptionId: stripeSubId },
  });

  if (!existing) {
    console.warn(`[stripe webhook] Subscription ${stripeSubId} not found in DB for deletion`);
    return;
  }

  await db.subscription.update({
    where: { id: existing.id },
    data: { status: 'cancelled' },
  });
}

async function handlePaymentFailed(invoice: any) {
  const stripeSubId = invoice.subscription as string | null;

  if (!stripeSubId) {
    console.warn('[stripe webhook] invoice.payment_failed has no subscription');
    return;
  }

  const existing = await db.subscription.findFirst({
    where: { stripeSubscriptionId: stripeSubId },
  });

  if (!existing) {
    console.warn(`[stripe webhook] Subscription ${stripeSubId} not found in DB for payment_failed`);
    return;
  }

  await db.subscription.update({
    where: { id: existing.id },
    data: { status: 'past_due' },
  });
}
