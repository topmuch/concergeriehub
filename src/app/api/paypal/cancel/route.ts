// =============================================================
// POST /api/paypal/cancel — résiliation d'un abonnement PAYPAL
//
// Annule côté PayPal (POST /v1/billing/subscriptions/{id}/cancel —
// effet immédiat, pas de refund au prorata) + statut local
// 'cancelled' + User.selectedPlan → 'free'.
//
// 🔒 Réservé aux comptes hôtes connectés (role 'user') — ne touche
// JAMAIS aux abonnements Stripe (flux hôte dédié intact).
// =============================================================
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { cancelPayPalSubscription, isPayPalConfigured } from '@/lib/paypal';

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

  if (!isPayPalConfigured()) {
    return NextResponse.json({ error: 'PayPal non configuré' }, { status: 503 });
  }

  try {
    const activeSub = await db.subscription.findFirst({
      where: { userId, paymentProvider: 'paypal', status: { in: ['active', 'trialing'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeSub) {
      return NextResponse.json(
        { error: 'Aucun abonnement PayPal actif à résilier' },
        { status: 404 },
      );
    }

    // ── Annulation côté PayPal (source de vérité facturation) ──
    if (activeSub.paypalSubscriptionId) {
      const cancelled = await cancelPayPalSubscription(
        activeSub.paypalSubscriptionId,
        'Résiliation depuis RoomScan',
      );
      if (!cancelled) {
        return NextResponse.json(
          { error: 'PayPal a refusé la résiliation — réessayez ou contactez le support.' },
          { status: 502 },
        );
      }
    }

    // ── État local (immédiat, aligné sur le comportement PayPal) ──
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

    console.log(`[POST /api/paypal/cancel] Abonnement PayPal ${activeSub.id} résilié (user ${userId})`);

    return NextResponse.json(
      { ok: true, message: 'Abonnement PayPal résilié.' },
      { status: 200 },
    );
  } catch (error) {
    console.error('[POST /api/paypal/cancel] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
