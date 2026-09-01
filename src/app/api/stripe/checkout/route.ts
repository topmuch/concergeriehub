// =============================================================
// /api/stripe/checkout — ÉTAPE 10 : création de session Stripe
// Checkout pour les abonnements HÔTE (airbnb_solo / airbnb_pro).
//
// POST { plan: 'airbnb_solo' | 'airbnb_pro', billingCycle: 'monthly' | 'annual' }
//
// - STRIPE_SECRET_KEY configurée → vraie session Stripe Checkout
//   (metadata userId/plan/billingCycle consommée par le webhook).
// - Sinon → MODE DÉMO : activation immédiate en base (abonnement
//   actif + transaction + selectedPlan), pour valider tout le
//   parcours sans clés. Le webhook fera la même chose en réel.
//
// 🔒 Réservé aux comptes hôtes connectés (role 'user').
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getHostPlan, planPrice, type BillingCycle, type HostPlanId } from '@/lib/billing';

const isStripeMode = Boolean(process.env.STRIPE_SECRET_KEY);

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!session?.user || !userId) {
    return NextResponse.json({ error: 'Connexion requise' }, { status: 401 });
  }
  if (role !== 'user') {
    return NextResponse.json({ error: 'Réservé aux comptes hôtes' }, { status: 403 });
  }

  try {
    const body = (await req.json()) as { plan?: string; billingCycle?: string };
    const plan = getHostPlan(body.plan ?? '');
    if (!plan) {
      return NextResponse.json({ error: 'Plan inconnu' }, { status: 400 });
    }

    const cycle = (body.billingCycle ?? 'monthly') as BillingCycle;
    const price = planPrice(plan, cycle);
    if (price === null) {
      return NextResponse.json(
        { error: `Le plan ${plan.name} n'est disponible qu'en facturation annuelle` },
        { status: 400 },
      );
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, isActive: true },
    });
    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'Compte introuvable ou désactivé' }, { status: 403 });
    }

    const origin = req.headers.get('origin') || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const successUrl = `${origin}/airbnb/billing?success=1`;
    const cancelUrl = `${origin}/airbnb/billing?canceled=1`;

    // ---------------- STRIPE RÉEL ----------------
    if (isStripeMode) {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

      const checkoutSession = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer_email: user.email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'eur',
              unit_amount: Math.round(price * 100),
              recurring: { interval: cycle === 'annual' ? 'year' : 'month' },
              product_data: {
                name: `Conciergerie Hub — ${plan.name}`,
                description: plan.description,
              },
            },
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId: user.id,
          plan: plan.id as HostPlanId,
          billingCycle: cycle,
        },
        subscription_data: {
          metadata: {
            userId: user.id,
            plan: plan.id as HostPlanId,
            billingCycle: cycle,
          },
        },
      });

      return NextResponse.json({ url: checkoutSession.url, mode: 'stripe' }, { status: 201 });
    }

    // ---------------- MODE DÉMO (sans clés) ----------------
    // SÉCURITÉ : l'activation gratuite sans paiement ne doit JAMAIS être
    // possible en production — clé Stripe manquante = erreur explicite.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Paiement indisponible : configuration Stripe manquante. Contactez le support.' },
        { status: 503 },
      );
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (cycle === 'annual') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);

    await db.$transaction(async (tx) => {
      // Un seul abonnement actif à la fois
      await tx.subscription.updateMany({
        where: { userId: user.id, status: 'active' },
        data: { status: 'cancelled' },
      });

      const subscription = await tx.subscription.create({
        data: {
          subscriberType: 'user',
          userId: user.id,
          plan: plan.id,
          amount: price,
          currency: 'EUR',
          billingCycle: cycle,
          maxProperties: plan.maxProperties,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      await tx.transaction.create({
        data: {
          type: 'subscription',
          payerId: user.id,
          amount: price,
          currency: 'EUR',
          status: 'completed',
          referenceId: subscription.id,
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { selectedPlan: plan.id },
      });
    });

    return NextResponse.json(
      { url: `${successUrl}&demo=1`, mode: 'demo' },
      { status: 201 },
    );
  } catch (error) {
    console.error('[POST /api/stripe/checkout] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/** GET : mode courant (pour le bandeau de la page billing). */
export async function GET() {
  return NextResponse.json({ mode: isStripeMode ? 'stripe' : 'demo' });
}
