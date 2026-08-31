// =============================================================
// /api/stripe/portal — ÉTAPE 10 : Stripe Customer Portal
//
// POST : ouvre le portail de facturation Stripe pour l'hôte
// connecté (mise à jour de carte, factures, résiliation…).
//
// - En mode Stripe : retrouve le customer via le dernier
//   abonnement Stripe connu, sinon par email, puis crée une
//   session Billing Portal.
// - En mode démo (sans clés) : 400 explicite → la page billing
//   propose alors la résiliation locale (/api/stripe/cancel).
//
// 🔒 Réservé aux comptes hôtes connectés (role 'user').
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

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

  if (!isStripeMode) {
    return NextResponse.json(
      {
        error: 'Portail Stripe indisponible en mode démo',
        hint: 'Utilisez « Résilier » pour annuler votre abonnement de démonstration.',
      },
      { status: 400 },
    );
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    // 1) Customer connu via le dernier abonnement Stripe de l'hôte
    const sub = await db.subscription.findFirst({
      where: { userId, stripeSubscriptionId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { stripeSubscriptionId: true },
    });

    let customerId: string | null = null;
    if (sub?.stripeSubscriptionId) {
      const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
      customerId =
        typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id;
    }

    // 2) Sinon, recherche par email
    if (!customerId) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (user?.email) {
        const found = await stripe.customers.list({ email: user.email, limit: 1 });
        customerId = found.data[0]?.id ?? null;
      }
    }

    // 3) Dernier recours : création du customer
    if (!customerId) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { email: true, fullName: true },
      });
      const customer = await stripe.customers.create({
        email: user?.email ?? undefined,
        name: user?.fullName ?? undefined,
        metadata: { userId },
      });
      customerId = customer.id;
    }

    const origin = req.headers.get('origin') || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/airbnb/billing`,
    });

    return NextResponse.json({ url: portalSession.url }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/stripe/portal] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
