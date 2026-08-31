// =============================================================
// /api/stripe/cancel — ÉTAPE 10 : résiliation d'abonnement HÔTE
//
// POST : résilie l'abonnement actif de l'hôte connecté.
//
// - Mode Stripe  : cancel_at_period_end=true sur l'abonnement
//   Stripe (l'accès reste actif jusqu'à la fin de la période ;
//   le webhook customer.subscription.deleted finalisera l'état).
// - Mode démo    : résiliation immédiate en base (status
//   'cancelled' + User.selectedPlan → 'free').
//
// 🔒 Réservé aux comptes hôtes connectés (role 'user').
// =============================================================
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

const isStripeMode = Boolean(process.env.STRIPE_SECRET_KEY);

export async function POST() {
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
    const activeSub = await db.subscription.findFirst({
      where: { userId, status: { in: ['active', 'trialing'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeSub) {
      return NextResponse.json({ error: 'Aucun abonnement actif à résilier' }, { status: 404 });
    }

    // ---------- MODE STRIPE : résiliation à échéance ----------
    if (isStripeMode && activeSub.stripeSubscriptionId) {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      await stripe.subscriptions.update(activeSub.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      return NextResponse.json(
        {
          ok: true,
          mode: 'stripe',
          accessUntil: activeSub.currentPeriodEnd?.toISOString() ?? null,
          message: "Résiliation programmée — l'accès reste actif jusqu'à la fin de la période.",
        },
        { status: 200 },
      );
    }

    // ---------- MODE DÉMO : résiliation immédiate ----------
    await db.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: activeSub.id },
        data: { status: 'cancelled' },
      });
      await tx.user.update({
        where: { id: userId },
        data: { selectedPlan: 'free' },
      });
    });

    return NextResponse.json(
      { ok: true, mode: 'demo', message: 'Abonnement résilié (mode démo).' },
      { status: 200 },
    );
  } catch (error) {
    console.error('[POST /api/stripe/cancel] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
