import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  SUBSCRIPTION_TIERS,
  SUBSCRIPTION_STATUSES,
  SUBSCRIBER_TYPES,
  type SubscriptionTier,
  type SubscriberType,
  type SubscriptionStatus,
} from '@/types/database';
import { resolveOrigin, siteUrl } from '@/lib/site';

const isSimulation = !process.env.STRIPE_SECRET_KEY;

// GET: List subscriptions — scopées sur l'utilisateur connecté (Superadmin : tout via subscriberId)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const userId = (session.user as { id?: string }).id;
    const role = (session.user as { role?: string }).role;
    const isSuperadmin = role === 'superadmin';

    const { searchParams } = new URL(request.url);
    const subscriberId = searchParams.get('subscriberId');
    const subscriberType = searchParams.get('subscriberType');
    const status = searchParams.get('status');

    if (isSuperadmin && !subscriberId) {
      return NextResponse.json(
        { error: 'Le paramètre subscriberId est requis' },
        { status: 400 }
      );
    }

    if (subscriberType && !SUBSCRIBER_TYPES.includes(subscriberType as SubscriberType)) {
      return NextResponse.json(
        { error: 'Type de souscripteur invalide. Valeurs autorisées : merchant, provider' },
        { status: 400 }
      );
    }

    if (status && !SUBSCRIPTION_STATUSES.includes(status as SubscriptionStatus)) {
      return NextResponse.json(
        { error: 'Statut invalide. Valeurs autorisées : active, cancelled, past_due' },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = isSuperadmin
      ? { subscriberId }
      : {
          // Scoping strict : uniquement les abonnements de l'utilisateur connecté
          // (abonnements HÔTE via userId, marchand/prestataire via subscriberId)
          OR: [{ userId }, { subscriberId: userId }],
        };
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
    if (!subscriberType || subscriberType === 'provider') {
      include.provider = {
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

// POST: Create a subscription — toujours rattachée à l'utilisateur connecté
// (subscriberId/subscriberType du body IGNORÉS : un utilisateur ne peut
// créer un abonnement que pour lui-même, en tant que 'user')
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const userId = (session.user as { id?: string }).id;

    const body = await request.json();
    const { plan, amount, currency } = body as {
      plan: string;
      amount: number;
      currency?: string;
    };

    if (!plan || amount === undefined) {
      return NextResponse.json(
        { error: 'Les champs plan et amount sont requis' },
        { status: 400 }
      );
    }

    if (!SUBSCRIPTION_TIERS.includes(plan as SubscriptionTier)) {
      return NextResponse.json(
        { error: 'Plan invalide. Valeurs autorisées : free, premium, featured' },
        { status: 400 }
      );
    }

    // Rattachement forcé à la session — jamais au body
    // (convention schéma : abonnement HÔTE = subscriberType 'user' + userId,
    // subscriberId restant null car réservé aux marchands/prestataires)
    const subscriberType = 'user';

    // Verify subscriber exists
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        { error: 'Utilisateur introuvable' },
        { status: 404 }
      );
    }

    // --- Simulation mode ---
    if (isSimulation) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const subscription = await db.subscription.create({
        data: {
          subscriberType,
          userId,
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
            payerId: userId,
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

    });

    const customerEmail = user.email;

    const origin = resolveOrigin(request);

    const checkoutSession = await stripe.checkout.sessions.create({
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
              name: `Plan ${plan.charAt(0).toUpperCase() + plan.slice(1)} - Hôte`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?canceled=true`,
      metadata: {
        userId: userId ?? '',
        subscriberType,
        plan,
      },
    });

    return NextResponse.json({ checkoutUrl: checkoutSession.url }, { status: 201 });
  } catch (error) {
    console.error('[subscriptions POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
