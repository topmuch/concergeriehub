import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { SUBSCRIBER_TYPES, type SubscriberType } from '@/types/database';

const isSimulation = !process.env.STRIPE_SECRET_KEY;

const PLANS = [
  {
    id: 'free',
    name: 'Gratuit',
    price: 0,
    currency: 'EUR',
    interval: 'month',
    features: [
      '5 QR codes actifs',
      'Annuaire artisans basique',
      'Support email',
    ],
    subscriberTypes: ['merchant', 'professional'],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 29.99,
    currency: 'EUR',
    interval: 'month',
    stripePriceId: process.env.STRIPE_PREMIUM_PRICE_ID || null,
    features: [
      'QR codes illimités',
      'Annuaire artisans vérifié',
      'Chat temps réel',
      'Statistiques avancées',
      'Support prioritaire',
    ],
    subscriberTypes: ['merchant', 'professional'],
  },
  {
    id: 'featured',
    name: 'Mis en avant',
    price: 49.99,
    currency: 'EUR',
    interval: 'month',
    stripePriceId: process.env.STRIPE_FEATURED_PRICE_ID || null,
    features: [
      'Tout Premium +',
      'Badge vérifié or',
      'Mise en avant dans résultats',
      'Commission réduite (3%)',
      'Gestionnaire de compte dédié',
      'API access',
    ],
    subscriberTypes: ['merchant', 'professional'],
  },
] as const;

// GET: Return available pricing plans
export async function GET() {
  try {
    return NextResponse.json({ plans: PLANS });
  } catch (error) {
    console.error('[billing/plans GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// POST: Initiate a subscription purchase
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subscriberId, subscriberType, planId } = body as {
      subscriberId: string;
      subscriberType: string;
      planId: string;
    };

    if (!subscriberId || !subscriberType || !planId) {
      return NextResponse.json(
        { error: 'Les champs subscriberId, subscriberType et planId sont requis' },
        { status: 400 }
      );
    }

    if (!SUBSCRIBER_TYPES.includes(subscriberType as SubscriberType)) {
      return NextResponse.json(
        { error: 'Type de souscripteur invalide. Valeurs autorisées : merchant, professional' },
        { status: 400 }
      );
    }

    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) {
      return NextResponse.json(
        { error: 'Plan introuvable' },
        { status: 404 }
      );
    }

    if (!plan.subscriberTypes.includes(subscriberType as SubscriberType)) {
      return NextResponse.json(
        { error: `Le plan ${plan.name} n'est pas disponible pour ce type de souscripteur` },
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
          plan: plan.id,
          amount: plan.price,
          currency: plan.currency,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      if (plan.price > 0) {
        await db.transaction.create({
          data: {
            type: 'subscription',
            payerId: subscriberId,
            amount: plan.price,
            currency: plan.currency,
            status: 'completed',
            referenceId: subscription.id,
          },
        });
      }

      return NextResponse.json({ subscription, plan, simulation: true }, { status: 201 });
    }

    // --- Stripe mode ---
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-06-20',
    });

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
      line_items: plan.stripePriceId
        ? [{ price: plan.stripePriceId, quantity: 1 }]
        : [
            {
              price_data: {
                currency: plan.currency.toLowerCase(),
                unit_amount: Math.round(plan.price * 100),
                recurring: { interval: 'month' },
                product_data: {
                  name: `Plan ${plan.name} - ${subscriberType === 'merchant' ? 'Commerçant' : 'Professionnel'}`,
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
        plan: plan.id,
      },
    });

    return NextResponse.json({ checkoutUrl: session.url, plan }, { status: 201 });
  } catch (error) {
    console.error('[billing/plans POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
