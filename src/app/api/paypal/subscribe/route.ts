// =============================================================
// /api/paypal/subscribe — ABONNEMENTS PLATEFORME via PayPal
//
// GET  → { enabled, env } : variante authentifiée de /api/paypal/status
//        (l'UI utilise l'une ou l'autre pour afficher les boutons PayPal).
//
// POST { plan: 'airbnb_solo' | 'airbnb_pro', billingCycle: 'monthly' | 'annual' }
//   → ensurePayPalPlans (Product + Plans, cache SystemSetting)
//   → crée une Subscription PayPal (custom_id = `${userId}|${plan}|${cycle}`,
//     return_url = /airbnb/billing?paypal=approved,
//     cancel_url = /airbnb/billing?paypal=canceled)
//   → { approveUrl } : le client redirige vers PayPal.
//
// Sans clés PayPal → 503 « PayPal non configuré » (comportement
// Stripe / démo existant INCHANGÉ).
//
// 🔒 Réservé aux comptes hôtes connectés (role 'user') — mêmes gardes
// que /api/stripe/checkout.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getHostPlan, planPrice, type BillingCycle, type HostPlanId } from '@/lib/billing';
import { resolveOrigin } from '@/lib/site';
import {
  createPayPalSubscription,
  ensurePayPalPlans,
  isPayPalConfigured,
  payPalEnv,
} from '@/lib/paypal';

/** Mêmes gardes que /api/stripe/checkout : session + rôle hôte actif. */
async function requireHostSession() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session?.user || !userId) {
    return { error: NextResponse.json({ error: 'Connexion requise' }, { status: 401 }) };
  }
  if (role !== 'user') {
    return { error: NextResponse.json({ error: 'Réservé aux comptes hôtes' }, { status: 403 }) };
  }
  return { userId };
}

/** GET : état PayPal (pour l'UI billing). */
export async function GET() {
  const enabled = isPayPalConfigured();
  return NextResponse.json({ enabled, env: enabled ? payPalEnv() : null });
}

export async function POST(req: NextRequest) {
  const guard = await requireHostSession();
  if (guard.error) return guard.error;
  const userId = guard.userId as string;

  // PayPal non configuré → 503 explicite (l'UI ne devrait jamais y arriver :
  // les boutons PayPal ne sont affichés que si enabled=true).
  if (!isPayPalConfigured()) {
    return NextResponse.json({ error: 'PayPal non configuré' }, { status: 503 });
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

    // Product + Plans PayPal (IDs cachés en SystemSetting — créés 1 fois).
    const plans = await ensurePayPalPlans();
    if (!plans.ok) {
      return NextResponse.json(
        { error: 'PayPal indisponible — réessayez plus tard.' },
        { status: 502 },
      );
    }
    const paypalPlanId = plans.planIds[plan.id as HostPlanId]?.[cycle];
    if (!paypalPlanId) {
      return NextResponse.json(
        { error: "Offre PayPal indisponible pour ce plan — contactez le support." },
        { status: 400 },
      );
    }

    const origin = resolveOrigin(req);
    const created = await createPayPalSubscription({
      paypalPlanId,
      // Repris par /api/paypal/activate : associe l'abonnement PayPal à
      // CET utilisateur, CE plan, CE cycle (anti-forgery serveur).
      customId: `${userId}|${plan.id}|${cycle}`,
      subscriberEmail: user.email,
      returnUrl: `${origin}/airbnb/billing?paypal=approved`,
      cancelUrl: `${origin}/airbnb/billing?paypal=canceled`,
    });

    if (!created) {
      return NextResponse.json(
        { error: 'Création de la souscription PayPal impossible — réessayez.' },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { approveUrl: created.approveUrl, subscriptionId: created.id },
      { status: 201 },
    );
  } catch (error) {
    console.error('[POST /api/paypal/subscribe] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
