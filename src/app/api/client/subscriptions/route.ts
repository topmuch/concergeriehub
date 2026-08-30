import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  SUBSCRIPTION_TIERS,
  SUBSCRIPTION_STATUSES,
  SUBSCRIBER_TYPES,
  type SubscriptionTier,
  type SubscriberType,
  type SubscriptionStatus,
} from '@/types/database';

const isSimulation = !process.env.STRIPE_SECRET_KEY;

// GET: List subscriptions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subscriberId = searchParams.get('subscriberId');
    const subscriberType = searchParams.get('subscriberType');
    const status = searchParams.get('status');

    if (!subscriberId) {
      return NextResponse.json(
        { error: 'Le paramètre subscriberId est requis' },
        { status: 400 }
      );
    }

    if (subscriberType && !SUBSCRIBER_TYPES.includes(subscriberType as SubscriberType)) {
      return NextResponse.json(
        { error: 'Type de souscripteur invalide. Valeurs autorisées : merchant, professional' },
        { status: 400 }
      );
    }

    if (status && !SUBSCRIPTION_STATUSES.includes(status as SubscriptionStatus)) {
      return NextResponse.json(
        { error: 'Statut invalide. Valeurs autorisées : active, cancelled, past_due' },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = { subscriberId };
    if (subscriberType) where.subscriberType = subscriberType;
    if (status) where.status = status;

    // Build include dynamically based on subscriberType
    const include: Record<string, unknown> = {};
    if (!subscriberType || subscriberType === 'merchant') {
      include.merchant = {
        include: {
          user: { select: { id: true, email: true, fullName: true } },
        },
      };
    }
    if (!subscriberType || subscriberType === 'professional') {
      include.professional = {
        include: {
          user: { select: { id: true, email: true, fullName: true } },
        },
      };
    }

    const subscriptions = await db.subscription.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ subscriptions });
  } catch (error) {
    console.error('[subscriptions GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// POST: Create a subscription
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      subscriberId,
      subscriberType,
      plan,
      amount,
      currency,
    } = body as {
      subscriberId: string;
      subscriberType: string;
      plan: string;
      amount: number;
      currency?: string;
    };

    if (!subscriberId || !subscriberType || !plan || amount === undefined) {
      return NextResponse.json(
        { error: 'Les champs subscriberId, subscriberType, plan et amount sont requis' },
        { status: 400 }
      );
    }

    if (!SUBSCRIBER_TYPES.includes(subscriberType as SubscriberType)) {
      return NextResponse.json(
        { error: 'Type de souscripteur invalide. Valeurs autorisées : merchant, professional' },
        { status: 400 }
      );
    }

    if (!SUBSCRIPTION_TIERS.includes(plan as SubscriptionTier)) {
      return NextResponse.json(
        { error: 'Plan invalide. Valeurs autorisées : free, premium, featured' },
        { status: 400 }
      );
    }

    // Verify subscriber exists
    if (subscriberType === 'merchant') {
      const merchant = await db.merchant.findUnique({ where: { id: subscriberId } });
      if (!merchant) {
        return NextResponse.json(
          { error: 'Commerçant introuvable' },
          { status: 404 }
        );
      }
    } else {
      const professional = await db.professional.findUnique({ where: { id: subscriberId } });
      if (!professional) {
        return NextResponse.json(
          { error: 'Professionnel introuvable' },
          { status: 404 }
        );
      }
    }

    // --- Simulation mode ---
    if (isSimulation) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const subscription = await db.subscription.create({
        data: {
          subscriberId,
          subscriberType,
          plan,
          amount,
          currency: currency || 'EUR',
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      // Create transaction for paid plans
      if (amount > 0) {
        await db.transaction.create({
          data: {
            type: 'subscription',
            payerId: subscriberId,
            amount,
            currency: currency || 'EUR',
            status: 'completed',
            referenceId: subscription.id,
          },
        });
      }

      return NextResponse.json({ subscription, simulation: true }, { status: 201 });
    }

    // --- Stripe mode ---
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-06-20',
    });

    // Look up customer email
    let customerEmail: string | null = null;
    if (subscriberType === 'merchant') {
      const merchant = await db.merchant.findUnique({
        where: { id: subscriberId },
        include: { user: { select: { email: true } } },
      });
      customerEmail = merchant?.user?.email ?? null;
    } else {
      const professional = await db.professional.findUnique({
        where: { id: subscriberId },
        include: { user: { select: { email: true } } },
      });
      customerEmail = professional?.user?.email ?? null;
    }

    const origin = request.headers.get('origin') || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: customerEmail || undefined,
      line_items: [
        {
          price_data: {
            currency: currency || 'eur',
            unit_amount: Math.round(amount * 100),
            recurring: { interval: 'month' },
            product_data: {
              name: `Plan ${plan.charAt(0).toUpperCase() + plan.slice(1)} - ${subscriberType === 'merchant' ? 'Commerçant' : 'Professionnel'}`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?canceled=true`,
      metadata: {
        subscriberId,
        subscriberType,
        plan,
      },
    });

    return NextResponse.json({ checkoutUrl: session.url }, { status: 201 });
  } catch (error) {
    console.error('[subscriptions POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
