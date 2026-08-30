import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  SUBSCRIPTION_TIERS,
  SUBSCRIPTION_STATUSES,
  type SubscriptionTier,
  type SubscriptionStatus,
} from '@/types/database';

const isSimulation = !process.env.STRIPE_SECRET_KEY;

// GET: Get single subscription with transactions
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const subscription = await db.subscription.findUnique({
      where: { id },
      include: {
        merchant: {
          include: {
            user: { select: { id: true, email: true, fullName: true } },
          },
        },
        professional: {
          include: {
            user: { select: { id: true, email: true, fullName: true } },
          },
        },
      },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: 'Abonnement introuvable' },
        { status: 404 }
      );
    }

    const transactions = await db.transaction.findMany({
      where: { referenceId: id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ subscription, transactions });
  } catch (error) {
    console.error('[subscriptions/:id GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// PATCH: Update subscription (cancel, change plan)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, plan } = body as {
      status?: string;
      plan?: string;
    };

    const existing = await db.subscription.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Abonnement introuvable' },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (status) {
      if (!SUBSCRIPTION_STATUSES.includes(status as SubscriptionStatus)) {
        return NextResponse.json(
          { error: 'Statut invalide. Valeurs autorisées : active, cancelled, past_due' },
          { status: 400 }
        );
      }
      updateData.status = status;
    }

    if (plan) {
      if (!SUBSCRIPTION_TIERS.includes(plan as SubscriptionTier)) {
        return NextResponse.json(
          { error: 'Plan invalide. Valeurs autorisées : free, premium, featured' },
          { status: 400 }
        );
      }
      updateData.plan = plan;
    }

    // If cancelling a Stripe subscription, cancel on Stripe side
    if (status === 'cancelled' && existing.stripeSubscriptionId && !isSimulation) {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2024-06-20',
      });
      await stripe.subscriptions.cancel(existing.stripeSubscriptionId);
    }

    const subscription = await db.subscription.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ subscription });
  } catch (error) {
    console.error('[subscriptions/:id PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// DELETE: Cancel subscription (set status='cancelled')
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.subscription.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Abonnement introuvable' },
        { status: 404 }
      );
    }

    if (existing.status === 'cancelled') {
      return NextResponse.json(
        { error: 'Cet abonnement est déjà annulé' },
        { status: 400 }
      );
    }

    // Cancel on Stripe side if applicable
    if (existing.stripeSubscriptionId && !isSimulation) {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2024-06-20',
      });
      await stripe.subscriptions.cancel(existing.stripeSubscriptionId);
    }

    const subscription = await db.subscription.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    return NextResponse.json({ subscription });
  } catch (error) {
    console.error('[subscriptions/:id DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
