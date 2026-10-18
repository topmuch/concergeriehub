// =============================================================
// POST /api/paypal/activate — activation APRÈS approbation PayPal
//
// Le retour PayPal arrive sur /airbnb/billing?paypal=approved&token=<id>
// ; l'UI envoie { subscriptionId: token } ici.
//
// 1. Vérification SERVEUR via GET /v1/billing/subscriptions/{id} :
//    statut ACTIVE ou APPROVAL_PENDING + custom_id correspond à
//    l'utilisateur connecté (anti IDOR — on n'active JAMAIS sur la foi
//    du query-string).
// 2. Upsert Subscription Prisma (paymentProvider 'paypal',
//    paypalSubscriptionId, plan, amount = planPrice, status 'active',
//    périodes depuis billing_info.next_billing_time) + Transaction
//    type 'subscription' status 'completed' + User.selectedPlan —
//    même logique que le webhook Stripe (stripe-webhook-core).
// Idempotent : recharger la page ne duplique ni abonnement ni transaction.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getHostPlan, planPrice, type BillingCycle, type HostPlanId } from '@/lib/billing';
import { getPayPalSubscription, isPayPalConfigured } from '@/lib/paypal';

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

  if (!isPayPalConfigured()) {
    return NextResponse.json({ error: 'PayPal non configuré' }, { status: 503 });
  }

  try {
    const body = (await req.json()) as { subscriptionId?: string };
    const subscriptionId = (body.subscriptionId ?? '').trim();
    if (!subscriptionId) {
      return NextResponse.json({ error: 'subscriptionId requis' }, { status: 400 });
    }

    // ── Vérification PayPal (source de vérité) ──
    const remote = await getPayPalSubscription(subscriptionId);
    if (!remote) {
      return NextResponse.json(
        { error: 'Abonnement PayPal introuvable — réessayez ou contactez le support.' },
        { status: 404 },
      );
    }

    const remoteStatus = (remote.status ?? '').toUpperCase();
    if (remoteStatus !== 'ACTIVE' && remoteStatus !== 'APPROVAL_PENDING') {
      return NextResponse.json(
        { error: `Abonnement PayPal non confirmé (statut: ${remoteStatus || 'inconnu'})` },
        { status: 409 },
      );
    }

    // ── custom_id : `${userId}|${plan}|${cycle}` posé à la création ──
    const customId = remote.custom_id ?? '';
    const parts = customId.split('|');
    const [ownerId, planPart, cyclePart] = parts;
    if (parts.length !== 3 || ownerId !== userId) {
      console.error(
        `[POST /api/paypal/activate] custom_id mismatch — user ${userId}, custom_id ${customId}`,
      );
      return NextResponse.json(
        { error: "Cet abonnement PayPal n'appartient pas à votre compte." },
        { status: 403 },
      );
    }

    const plan = getHostPlan(planPart ?? '');
    if (!plan) {
      return NextResponse.json({ error: 'Plan inconnu dans la souscription' }, { status: 400 });
    }
    const cycle: BillingCycle = cyclePart === 'annual' ? 'annual' : 'monthly';
    const price = planPrice(plan, cycle);
    if (price === null) {
      return NextResponse.json({ error: 'Offre non proposée' }, { status: 400 });
    }

    // ── Période : next_billing_time PayPal sinon +1 cycle ──
    const now = new Date();
    let periodEnd: Date | null = null;
    if (remote.billing_info?.next_billing_time) {
      const parsed = new Date(remote.billing_info.next_billing_time);
      if (!Number.isNaN(parsed.getTime())) periodEnd = parsed;
    }
    if (!periodEnd) {
      periodEnd = new Date(now);
      if (cycle === 'annual') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      else periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    await db.$transaction(async (tx) => {
      // Un seul abonnement actif à la fois (sauf celui qu'on active —
      // re-activation idempotente du même id PayPal).
      await tx.subscription.updateMany({
        where: {
          userId,
          status: 'active',
          NOT: { paypalSubscriptionId: subscriptionId },
        },
        data: { status: 'cancelled' },
      });

      const existing = await tx.subscription.findFirst({
        where: { paypalSubscriptionId: subscriptionId },
        select: { id: true },
      });

      if (existing) {
        await tx.subscription.update({
          where: { id: existing.id },
          data: {
            plan: plan.id,
            amount: price,
            currency: 'EUR',
            billingCycle: cycle,
            maxProperties: plan.maxProperties,
            paymentProvider: 'paypal',
            paypalSubscriptionId: subscriptionId,
            status: 'active',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });
      } else {
        await tx.subscription.create({
          data: {
            subscriberType: 'user',
            userId,
            plan: plan.id,
            amount: price,
            currency: 'EUR',
            billingCycle: cycle,
            maxProperties: plan.maxProperties,
            paymentProvider: 'paypal',
            paypalSubscriptionId: subscriptionId,
            status: 'active',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });
      }

      // Transaction comptable idempotente (referenceId = id PayPal).
      const existingTx = await tx.transaction.findFirst({
        where: { type: 'subscription', referenceId: subscriptionId },
        select: { id: true },
      });
      if (!existingTx) {
        await tx.transaction.create({
          data: {
            type: 'subscription',
            payerId: userId,
            amount: price,
            currency: 'EUR',
            status: 'completed',
            referenceId: subscriptionId,
          },
        });
      }

      // Même champ que le webhook Stripe : le plan du compte hôte suit.
      await tx.user.update({
        where: { id: userId },
        data: { selectedPlan: plan.id },
      });
    });

    console.log(
      `[POST /api/paypal/activate] Abonnement ${plan.id} (${cycle}) activé via PayPal pour user ${userId}`,
    );

    return NextResponse.json({ ok: true, plan: plan.id, billingCycle: cycle }, { status: 200 });
  } catch (error) {
    console.error('[POST /api/paypal/activate] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
