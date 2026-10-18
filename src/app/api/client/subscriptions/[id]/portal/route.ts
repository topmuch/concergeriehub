import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveOrigin, siteUrl } from '@/lib/site';

const isSimulation = !process.env.STRIPE_SECRET_KEY;

// POST: Create Stripe Customer Portal session
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authSession = await getServerSession(authOptions);
    if (!authSession?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const userId = (authSession.user as { id?: string }).id;
    const { id } = await params;

    const subscription = await db.subscription.findUnique({ where: { id } });
    if (!subscription) {
      return NextResponse.json(
        { error: 'Abonnement introuvable' },
        { status: 404 }
      );
    }

    // Ownership : uniquement l'abonné lui-même (abonnement HÔTE stocké via
    // subscriberType 'user' — champ userId dédié, subscriberId restant réservé
    // aux marchands/prestataires selon le schéma)
    const isOwner =
      subscription.subscriberType === 'user' &&
      (subscription.userId === userId || subscription.subscriberId === userId);

    if (!isOwner) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    // Simulation mode: no real portal
    if (isSimulation) {
      return NextResponse.json({
        url: null,
        message: 'Mode simulation - gestion via le dashboard',
      });
    }

    // Stripe mode: create a billing portal session
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      
    });

    if (!subscription.stripeSubscriptionId) {
      return NextResponse.json(
        { error: 'Cet abonnement n\'est pas lié à Stripe' },
        { status: 400 }
      );
    }

    // Retrieve the Stripe subscription to get the customer ID
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );
    const customerId = typeof stripeSubscription.customer === 'string'
      ? stripeSubscription.customer
      : stripeSubscription.customer?.id;

    if (!customerId) {
      return NextResponse.json(
        { error: 'Client Stripe introuvable' },
        { status: 400 }
      );
    }

    const origin = resolveOrigin(_request);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('[subscriptions/:id/portal POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
