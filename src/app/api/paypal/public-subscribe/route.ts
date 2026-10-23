// =============================================================
// POST /api/paypal/public-subscribe — ACHAT PUBLIC Solo / Pro
// (v5.17 — demande client : toutes les offres de la page d'accueil
// connectées à PayPal, SANS inscription préalable)
//
// body { plan: 'airbnb_solo' | 'airbnb_pro', billingCycle?: 'monthly' }
//   1. crée la ligne PayPalPendingSubscription (statut 'created',
//      jeton d'activation 72 h) ;
//   2. garantit Product + Plans PayPal (prix v5.17 : 29 €/mois et
//      99 €/mois — la clé/nom des plans inclut le prix) ;
//   3. crée la Subscription PayPal SANS email abonné (PayPal collecte
//      l'email de l'acheteur à l'approbation), custom_id =
//      `public:<pendingId>` (relu à l'activation — anti-forgery) ;
//   4. renvoie { approveUrl } → redirection vers PayPal.
//
// Retour : /paypal/activer?token=<activationToken> (vérif serveur +
// création du compte) — même philosophie que le parcours EDL
// (EdlPurchase → /edl/paiement/retour → /edl/activer/[token]).
// Annulation : /?paypal=annule#pricing.
//
// Sans clés PayPal → 503 « paiement en cours d'activation ».
// Anti-abus : rateLimit 6/min/IP.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { resolveOrigin } from '@/lib/site';
import { getHostPlan, planPrice, type BillingCycle } from '@/lib/billing';
import {
  createPayPalSubscription,
  ensurePayPalPlans,
  isPayPalConfigured,
} from '@/lib/paypal';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!(await rateLimit(`paypal-public-sub:${ip}`, 6))) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
      { status: 429 },
    );
  }

  if (!isPayPalConfigured()) {
    return NextResponse.json(
      { error: "Le paiement PayPal sera activé d'ici quelques instants. Réessayez bientôt." },
      { status: 503 },
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      plan?: string;
      billingCycle?: string;
    };
    const plan = getHostPlan(body.plan ?? '');
    if (!plan) {
      return NextResponse.json({ error: 'Offre inconnue' }, { status: 400 });
    }
    const cycle: BillingCycle = body.billingCycle === 'annual' ? 'annual' : 'monthly';
    const price = planPrice(plan, cycle);
    if (price === null) {
      return NextResponse.json(
        { error: `L'offre ${plan.name} est disponible en facturation mensuelle` },
        { status: 400 },
      );
    }

    // Plans PayPal au prix courant (clé/nom incluent le prix — un
    // changement de tarif crée un plan neuf, jamais l'ancien tarif).
    const plans = await ensurePayPalPlans();
    if (!plans.ok) {
      return NextResponse.json(
        { error: 'PayPal indisponible — réessayez plus tard.' },
        { status: 502 },
      );
    }
    const paypalPlanId = plans.planIds[plan.id]?.[cycle] ?? null;
    if (!paypalPlanId) {
      return NextResponse.json(
        { error: 'Offre PayPal indisponible pour ce plan — contactez le support.' },
        { status: 400 },
      );
    }

    // Trace locale créée AVANT l'appel PayPal (réconciliation).
    const activationToken = randomBytes(24).toString('base64url');
    const pending = await db.payPalPendingSubscription.create({
      data: {
        activationToken,
        plan: plan.id,
        billingCycle: cycle,
        status: 'created',
        activationExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
      select: { id: true },
    });

    const origin = resolveOrigin(req);
    const created = await createPayPalSubscription({
      paypalPlanId,
      // Repris par /api/paypal/public-activate : lie la souscription
      // PayPal à CETTE trace locale (anti-forgery serveur).
      customId: `public:${pending.id}`,
      returnUrl: `${origin}/paypal/activer?token=${encodeURIComponent(activationToken)}`,
      cancelUrl: `${origin}/?paypal=annule#pricing`,
    });

    if (!created) {
      // Souscription PayPal refusée → la trace reste 'created' (audit).
      console.error('[paypal/public-subscribe] create failed');
      return NextResponse.json(
        { error: 'PayPal est momentanément indisponible. Réessayez dans un instant.' },
        { status: 502 },
      );
    }

    await db.payPalPendingSubscription.update({
      where: { id: pending.id },
      data: { paypalSubscriptionId: created.id },
    });

    return NextResponse.json(
      { ok: true, approveUrl: created.approveUrl },
      { status: 201 },
    );
  } catch (error) {
    console.error('[paypal/public-subscribe] failed:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
