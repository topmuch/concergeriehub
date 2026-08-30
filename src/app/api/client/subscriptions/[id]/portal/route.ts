import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const isSimulation = !process.env.STRIPE_SECRET_KEY;

// POST: Create Stripe Customer Portal session
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const subscription = await db.subscription.findUnique({ where: { id } });
    if (!subscription) {
      return NextResponse.json(
        { error: 'Abonnement introuvable' },
        { status: 404 }
      );
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
      apiVersion: '2024-06-20',
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

    const origin = _request.headers.get('origin') || 'http://localhost:3000';

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
